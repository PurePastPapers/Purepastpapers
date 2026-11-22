// GCSE science and Maths part crops must be the regions their records describe
// (audit 2026-11-19). finalize.py had put the build's images back over refine.py's under the
// same names: a part's context showed every earlier part with its answer lines and marks, so
// an unselected sibling looked like the question to answer (reported for 1SC0 Q4(a)/(b)).
// WebP headers give each crop's size; regions are rendered at PDFium scale 1.6 (A4 page
// height 1347 or 1348 px) and stacked with 12 px gaps.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const read = (file) => JSON.parse(readFileSync(new URL(file, root), 'utf8'));
const SLUGS = ['gcsebio', 'gcsechem', 'gcsephys', 'gcsemaths'];
const GAP = 12;

function webpSize(base64) {
  const b = Buffer.from(base64.slice(0, 64), 'base64');
  const chunk = b.toString('ascii', 12, 16);
  if (chunk === 'VP8L') {
    const bits = b.readUInt32LE(21);
    return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
  }
  if (chunk === 'VP8X') return { width: b.readUIntLE(24, 3) + 1, height: b.readUIntLE(27, 3) + 1 };
  if (chunk === 'VP8 ') return { width: b.readUInt16LE(26) & 0x3fff, height: b.readUInt16LE(28) & 0x3fff };
  throw new Error(`not a WebP: ${chunk}`);
}

const regionHeight = (regions, H) => regions.reduce((sum, r) => sum + Math.round(r.bbox[3] * H) - Math.round(r.bbox[1] * H), 0) + GAP * (regions.length - 1);
const fits = (actual, regions, heights) => heights.some((H) => Math.abs(actual - regionHeight(regions, H)) <= 2);

// Pixels per page height. Most papers are A4 at PDFium scale 1.6 (1347-1348 px); a few
// papers' regions were recorded against another PDF box and map at about 1437 px (1PH0 June
// 2024 1F, 1CH0 June 2025 1F). Estimated from the paper's single-region part crops.
function paperHeights(units) {
  const estimates = [];
  for (const unit of units) {
    const regions = unit.provenance?.source_regions;
    if (unit.provenance?.part_display !== 'refined' || regions?.length !== 1 || unit.content.question_image_url.endsWith('_full.webp')) continue;
    const span = regions[0].bbox[3] - regions[0].bbox[1];
    if (span > 0.1) estimates.push(webpSize(asset(unit.content.question_image_url).base64).height / span);
  }
  estimates.sort((a, b) => a - b);
  const median = estimates[Math.floor(estimates.length / 2)];
  if (!median || Math.abs(median - 1347.5) < 6) return [1347, 1348];
  return [-2, -1, 0, 1, 2].map((d) => Math.round(median) + d);
}

const packs = read('data/packs/index.json').packs.filter((entry) => SLUGS.includes(entry.file.split('/')[0]));
let currentCatalogue;
const asset = (url) => {
  const [, slug, paper, name] = url.split('/');
  const file = `data/${slug}-assets/${paper}.json`;
  if (currentCatalogue?.file !== file) currentCatalogue = {file, assets: read(file).assets};
  return currentCatalogue.assets[name];
};

test('every refined GCSE part crop is exactly the region its record names', () => {
  let checked = 0;
  const wrong = [];
  for (const entry of packs) {
    const units = read(`data/packs/${entry.file}`).questions;
    const heights = paperHeights(units);
    for (const unit of units) {
      if (unit.content.question_image_url.endsWith('_full.webp')) continue;
      const rows = unit.provenance?.own_rows_from_full;
      if (rows) {
        // reviewed rows of Qnn_full.webp (tools/parts/manual-contexts.py)
        const { height } = webpSize(asset(unit.content.question_image_url).base64);
        checked += 1;
        if (height !== rows.reduce((sum, [a, b]) => sum + b - a, 0) + GAP * (rows.length - 1)) wrong.push(unit.question_id);
        continue;
      }
      if (unit.provenance?.part_display !== 'refined') continue;
      const { height } = webpSize(asset(unit.content.question_image_url).base64);
      checked += 1;
      if (!fits(height, unit.provenance.source_regions, heights)) wrong.push(unit.question_id);
    }
  }
  assert.ok(checked > 5000, `only ${checked} part crops checked`);
  assert.deepEqual(wrong, []);
});

test('GCSE part contexts hold the introduction and their own lead-in, never earlier parts', () => {
  const wrong = [];
  for (const entry of packs) {
    const groups = new Map();
    const units = read(`data/packs/${entry.file}`).questions;
    const H = paperHeights(units)[Math.floor(paperHeights(units).length / 2)];
    const firstRegion = new Map();
    for (const unit of [...units].sort((a, b) => a.question_id.localeCompare(b.question_id))) {
      if (!firstRegion.has(unit.parent_question_id)) firstRegion.set(unit.parent_question_id, unit.provenance?.source_regions?.[0]);
    }
    for (const unit of units) {
      const url = unit.context?.stem_image_url;
      if (!url || unit.provenance?.part_display !== 'refined' || !unit.provenance.context_includes_stem_image || unit.provenance.context_rows_from_full || unit.provenance.own_rows_from_full || unit.provenance.context_from_linked_part) continue; // the linked earlier part (link-dependencies.py), not an introduction
      const { height } = webpSize(asset(url).base64);
      // Lead-in regions are shown only below the introduction (rows above the first part),
      // so "3 (a) …" printed above "(i)" is not repeated (recut-from-full.py).
      const first = firstRegion.get(unit.parent_question_id);
      const dropped = new Set((unit.provenance.context_regions_dropped || []).map((r) => JSON.stringify(r)));
      const below = (unit.provenance.context_regions || []).filter((r) => !dropped.has(JSON.stringify(r)))
        .map((r) => (first && r.page === first.page ? { ...r, bbox: [r.bbox[0], Math.max(r.bbox[1], first.bbox[1]), r.bbox[2], r.bbox[3]] } : r))
        .filter((r) => (first && r.page < first.page ? false : Math.round(r.bbox[3] * H) - Math.round(r.bbox[1] * H) >= 6));
      const extra = below.length ? regionHeight(below, H) + GAP : 0;
      if (!groups.has(unit.parent_question_id)) groups.set(unit.parent_question_id, []);
      groups.get(unit.parent_question_id).push([unit.question_id, height - extra]);
    }
    for (const [parent, units] of groups) {
      const intro = Math.min(...units.map(([, h]) => h));
      for (const [id, h] of units) if (h - intro > 4) wrong.push(`${id} (${h - intro}px more than ${parent}'s introduction)`);
    }
  }
  assert.deepEqual(wrong, []);
});

test('GCSE contexts show another part\'s rows only when the part uses them (audit 2026-11-20)', () => {
  // A context region overlapping another part's own rows showed that part's task, answer
  // lines and marks above the selected part (1SC0 June 2025 1BF Q4(a)(iv) showed (a)(i)'s
  // options; 1BI0 June 2025 1H Q1(b)(ii) showed (b)(i)). recut-from-full.py keeps such rows
  // only for a part the wording names, or a figure printed inside it, and records which.
  const wrong = [];
  let checked = 0;
  for (const entry of packs) {
    const units = read(`data/packs/${entry.file}`).questions;
    const byParent = new Map();
    for (const unit of units) byParent.set(unit.parent_question_id, [...(byParent.get(unit.parent_question_id) || []), unit]);
    for (const unit of units) {
      const pv = unit.provenance || {};
      if (!unit.context?.stem_image_url || !pv.context_siblings_removed || pv.context_reviewed) continue;
      checked += 1;
      const allowed = new Set([...(pv.context_named_parts || []), ...(pv.context_figure_from_parts || []), ...(pv.context_stem_from_parts || [])]);
      for (const region of pv.context_regions || []) {
        for (const other of byParent.get(unit.parent_question_id)) {
          if (allowed.has(other.question_id)) continue;
          for (const own of other.provenance?.source_regions || []) {
            const overlap = Math.min(region.bbox[3], own.bbox[3]) - Math.max(region.bbox[1], own.bbox[1]);
            if (own.page === region.page && overlap * 1347 > 6) wrong.push(`${unit.question_id} shows ${other.question_id}`);
          }
        }
      }
    }
  }
  assert.ok(checked > 1000, `only ${checked} contexts checked`);
  assert.deepEqual(wrong, []);
  const context = (file, id) => read(`data/packs/${file}`).questions.find((q) => q.question_id === id).provenance;
  assert.deepEqual(context('gcsebio/EDX_1SC0_2025_JUNE_1BF.json', 'EDX_1SC0_2025_JUNE_1BF_Q04_U04').context_named_parts, undefined);
  // the reported cases now hold no other part's rows; a part that names part (b) keeps it
  assert.deepEqual(context('gcsebio/EDX_1SC0_2025_JUNE_1BF.json', 'EDX_1SC0_2025_JUNE_1BF_Q04_U04').context_regions, []);
  assert.deepEqual(context('gcsebio/EDX_1BI0_2025_JUNE_1H.json', 'EDX_1BI0_2025_JUNE_1H_Q01_U04').context_regions.length, 1); // "(b) Fats are needed for energy." only
  assert.ok(context('gcsephys/EDX_1PH0_2022_JUNE_2F.json', 'EDX_1PH0_2022_JUNE_2F_Q10_U07').context_named_parts.length > 0);
  // a stem printed inside the previous part's rows stays (1MA1 June 2024 3F Q16(b))
  assert.deepEqual(context('gcsemaths/EDX_1MA1_2024_JUNE_3F.json', 'EDX_1MA1_2024_JUNE_3F_Q16_U02').context_stem_from_parts, ['EDX_1MA1_2024_JUNE_3F_Q16_U01']);
});

test('whole-question schemes split between questions where the questions do (audit 2026-11-20)', () => {
  // tools/parts/fix-scheme-regions.py: Q1's scheme had stopped at the header of 1(c)(i) and
  // Q2's opened with the rest of Q1; Q9's ended with Q10(a)'s header and first row.
  const regionsOf = (file, number) => read(`data/packs/${file}`).questions.find((q) => Number(q.question_number) === number).provenance.scheme_regions;
  const pages = (regions) => regions.map((r) => r.page);
  const q1 = regionsOf('gcsechem/EDX_1SC0_2021_NOVEMBER_1CH.json', 1);
  const q2 = regionsOf('gcsechem/EDX_1SC0_2021_NOVEMBER_1CH.json', 2);
  assert.deepEqual(pages(q1), [6, 7], 'Q1 runs to its total on page 7');
  assert.equal(pages(q2)[0], 8, 'Q2 starts at 2(a) on page 8');
  assert.deepEqual(pages(regionsOf('gcsephys/EDX_1PH0_2022_JUNE_2H.json', 9)), [23, 24, 25, 26], 'Q9 ends at "Total 11 marks"');
  // and the images are those regions, stacked
  const size = (url) => webpSize(asset(url).base64);
  for (const [file, number, regions] of [['gcsechem/EDX_1SC0_2021_NOVEMBER_1CH.json', 1, q1], ['gcsechem/EDX_1SC0_2021_NOVEMBER_1CH.json', 2, q2]]) {
    const unit = read(`data/packs/${file}`).questions.find((q) => Number(q.question_number) === number);
    const url = unit.context?.full_scheme_image_url || unit.content.mark_scheme_image_url;
    const { width, height } = size(url);
    const H = width / (regions[0].bbox[2] - regions[0].bbox[0]) * (953 / 1347); // landscape A4
    assert.ok(Math.abs(height - regionHeight(regions, H)) <= 3, `${url}: ${height} px for its regions`);
  }
});

test('GCSE science schemes come from the part\'s own paper and tier', () => {
  // Foundation and Higher papers share questions, and their schemes print both references
  // ("8c(i)(F) 2(ai)(H)"). A part must show its own paper's scheme rows: never an asset of
  // another paper or tier (tools/gcse*/schemes.py keeps the scheme's own-tier reference).
  const wrong = [];
  let checked = 0;
  for (const entry of packs.filter((p) => !p.file.startsWith('gcsemaths/'))) {
    const pack = read(`data/packs/${entry.file}`);
    const tierOf = new Map(pack.papers.map((paper) => [paper.paper_id, paper.tier]));
    for (const unit of pack.questions) {
      checked += 1;
      if (!unit.tier || unit.tier !== tierOf.get(unit.paper_id) || unit.provenance?.tier !== unit.tier) wrong.push(`${unit.question_id} tier`);
      for (const url of [unit.content.mark_scheme_image_url, unit.context?.full_scheme_image_url]) {
        if (url && url.split('/')[2] !== unit.paper_id) wrong.push(`${unit.question_id} ${url}`);
      }
    }
  }
  assert.ok(checked > 5000, `only ${checked} science units checked`);
  assert.deepEqual(wrong, []);
});

test('GCSE science part schemes stop at the current question total', () => {
  // Pearson prints three forms of the total. In these papers the next question's
  // table starts on the following page and its first answer used to show here.
  const samples = [
    ['gcsephys', 'EDX_1PH0_2023_JUNE_1H', 'Q04_U06', [12], 1348],
    ['gcsebio', 'EDX_1BI0_2024_JUNE_1F', 'Q04_U05', [13, 14], 1268],
    ['gcsephys', 'EDX_1PH0_2024_JUNE_1H', 'Q03_U05', [11], 1268],
  ];
  for (const [slug, paper, part, pages, renderedPageHeight] of samples) {
    const id = `${paper}_${part}`;
    const question = read(`data/packs/${slug}/${paper}.json`).questions.find(q => q.question_id === id);
    const regions = question.provenance.part_scheme_regions;
    assert.equal(question.scheme_scope, 'part', id);
    assert.deepEqual(regions.map(region => region.page), pages, id);
    const {height} = webpSize(asset(question.content.mark_scheme_image_url).base64);
    assert.ok(fits(height, regions, [renderedPageHeight]), `${id} crop matches the recorded regions`);
  }
});
