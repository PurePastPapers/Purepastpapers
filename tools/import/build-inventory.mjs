// Builds data/import/9MA0/inventory.json: the expected 9MA0 source-document inventory.
// Rerun-safe: existing per-document state (urls, sha256, status) is preserved by id.
// Series facts marked verified:false have NOT been checked against Pearson (network blocked
// when written); tools/import/fetch-sources.mjs fills urls/checksums once sources are reachable.
import { readFile, writeFile } from 'node:fs/promises';
const OUT = new URL('../../data/import/9MA0/inventory.json', import.meta.url);
const LISTING = 'https://qualifications.pearson.com/en/qualifications/edexcel-a-levels/mathematics-2017.coursematerials.html';
const COMPONENTS = [
  { code: 'P1', component: '9MA0/01', title: 'Pure Mathematics 1', marks: 100 },
  { code: 'P2', component: '9MA0/02', title: 'Pure Mathematics 2', marks: 100 },
  { code: 'P3', component: '9MA0/03', title: 'Statistics and Mechanics', marks: 100 },
];
const SERIES = [
  { year: 2018, series: 'June', kind: 'exam' }, { year: 2019, series: 'June', kind: 'exam' },
  { year: 2020, series: 'Autumn', kind: 'exam', note: 'Summer 2020 exams were cancelled; an autumn series was sat.' },
  { year: 2021, series: 'Autumn', kind: 'exam', note: 'Summer 2021 exams were cancelled; an autumn series was sat.' },
  { year: 2022, series: 'June', kind: 'exam' }, { year: 2023, series: 'June', kind: 'exam' },
  { year: 2024, series: 'June', kind: 'exam' }, { year: 2025, series: 'June', kind: 'exam' },
  { year: 2026, series: 'June', kind: 'exam', note: 'Sat June 2026. Pearson normally keeps the newest series teacher-only for a period; public availability unconfirmed.' },
  { year: 2017, series: 'Sample', kind: 'sample_assessment', note: 'Sample Assessment Materials. Not a sat exam; must be labelled as such.' },
  { year: null, series: 'Specimen', kind: 'specimen', note: 'Existence and count of specimen sets unconfirmed. Not a sat exam.' },
];
let prev = {};
try { for (const p of JSON.parse(await readFile(OUT, 'utf8')).papers) prev[p.paper_id] = p; } catch {}
const doc = (old) => old ?? { urls: [], sha256: null, bytes: null, status: 'not_fetched' };
const papers = [];
for (const s of SERIES) for (const c of COMPONENTS) {
  const id = `EDX_9MA0_${s.year ?? 'SPEC'}_${s.series.toUpperCase()}_${c.code}`;
  const o = prev[id] ?? {};
  papers.push({
    paper_id: id, qualification: '9MA0', year: s.year, series: s.series, kind: s.kind,
    component: c.component, paper_code: c.code, title: c.title, expected_total_marks: c.marks,
    series_verified: o.series_verified ?? false, note: s.note ?? null, official_listing_url: LISTING,
    documents: { question_paper: doc(o.documents?.question_paper), mark_scheme: doc(o.documents?.mark_scheme), examiner_report: doc(o.documents?.examiner_report) },
    processing: o.processing ?? { extracted: false, tagged: false, reviewed: false, imported: false },
  });
}
await writeFile(OUT, JSON.stringify({
  schema_version: 1, qualification: 'Pearson Edexcel Level 3 Advanced GCE Mathematics (9MA0)',
  excluded: ['8MA0 AS Mathematics', '9FM0 Further Mathematics', 'International A Level (IAL)', 'legacy 6xxx units', '2021 teacher-assessment materials'],
  status_values: ['not_fetched', 'fetched', 'unavailable', 'restricted'],
  papers,
}, null, 1) + '\n');
console.log(`${papers.length} paper records, ${papers.length * 3} expected documents`);
