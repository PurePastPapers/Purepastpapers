// Resumable source fetcher for an import inventory.
//   node tools/import/fetch-sources.mjs discover <index-url>...   collect candidate PDF links
//   node tools/import/fetch-sources.mjs fetch                     download, validate, checksum
// PDFs go to .import-cache/ (gitignored, never published). Only sha256, size and status are
// written back, so reruns skip documents already fetched. Nothing bypasses access controls:
// 401/403/login pages are recorded as "restricted".
import { readFile, writeFile, mkdir, access } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const INV = new URL('../../data/import/9MA0/inventory.json', import.meta.url);
const CACHE = new URL('../../.import-cache/9MA0/', import.meta.url);
const inv = JSON.parse(await readFile(INV, 'utf8'));
const save = () => writeFile(INV, JSON.stringify(inv, null, 1) + '\n');
const [cmd, ...args] = process.argv.slice(2);

// Classify a PDF link by its (decoded) filename/path. Returns null when not confidently 9MA0.
export function classify(url) {
  const t = decodeURIComponent(url).toLowerCase().replace(/_/g, '-');
  if (/8ma0|9fm0|8fm0|wma|ial|as[-_ ]level|further/.test(t)) return null;
  const year = (t.match(/20(1[7-9]|2\d)/) || [])[0];
  const month = (t.match(/20\d\d(0[56]|1[01])\d\d/) || [])[1]; // Pearson-style yyyymmdd stamp
  const series = /specimen/.test(t) ? 'Specimen' : /sample|sam\b/.test(t) ? 'Sample' : /oct|nov|autumn/.test(t) ? 'Autumn' : /june|jun\b|summer/.test(t) ? 'June' : month ? (month > '09' ? 'Autumn' : 'June') : null;
  const p = (t.match(/paper[-_ ]?([123])\b/) || t.match(/9ma0[-_ /]?0?([123])\b/) || [])[1];
  const kind = /\b(ms|mark[-_ ]?scheme|rms)\b/.test(t) ? 'mark_scheme' : /\b(er|examiner|pef)\b/.test(t) ? 'examiner_report' : /\b(qp|que|question)\b/.test(t) ? 'question_paper' : null;
  return series && p && kind && (year || series === 'Specimen') ? { year: year ? +year : null, series, code: `P${p}`, kind } : null;
}

if (cmd === 'discover') {
  let added = 0;
  for (const index of args) {
    const res = await fetch(index);
    if (!res.ok) { console.error(`${index}: HTTP ${res.status}`); continue; }
    const html = await res.text();
    for (const m of html.matchAll(/href="([^"]+\.pdf[^"]*)"/gi)) {
      const url = new URL(m[1].replace(/&amp;/g, '&'), index).href, c = classify(url);
      const paper = c && inv.papers.find((x) => x.year === c.year && x.series === c.series && x.paper_code === c.code);
      if (!paper) continue;
      const d = paper.documents[c.kind];
      if (!d.urls.includes(url)) { d.urls.push(url); added++; }
    }
  }
  await save(); console.log(`added ${added} candidate urls`);
} else if (cmd === 'fetch') {
  await mkdir(CACHE, { recursive: true });
  const tally = {};
  for (const paper of inv.papers) for (const [kind, d] of Object.entries(paper.documents)) {
    const file = new URL(`${paper.paper_id}.${kind}.pdf`, CACHE);
    const cached = await access(file).then(() => true, () => false);
    if (!(d.status === 'fetched' && cached)) {
      if (!d.urls.length) d.status = 'not_fetched';
      for (const url of d.urls) {
        try {
          const res = await fetch(url);
          if (res.status === 401 || res.status === 403) { d.status = 'restricted'; continue; }
          if (!res.ok) { d.status = 'unavailable'; continue; }
          const buf = Buffer.from(await res.arrayBuffer());
          if (buf.subarray(0, 5).toString() !== '%PDF-') { d.status = 'restricted'; continue; }
          await writeFile(file, buf);
          Object.assign(d, { status: 'fetched', sha256: createHash('sha256').update(buf).digest('hex'), bytes: buf.length, fetched_from: url, fetched_at: new Date().toISOString().slice(0, 10) });
          break;
        } catch (e) { d.status = 'unavailable'; d.error = String(e.cause?.message ?? e.message); }
      }
    }
    tally[d.status] = (tally[d.status] ?? 0) + 1;
  }
  await save(); console.log(tally);
} else if (cmd) { console.error('usage: fetch-sources.mjs discover <index-url>... | fetch'); process.exit(1); }
