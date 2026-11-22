// Reconcile report coverage against the active question packs.
// node tools/reports/coverage.mjs [slug] [--all] [--json]
import { readFileSync } from 'node:fs';
import { sectionsFor } from '../../js/engine/examiner-report.js';

const read = (path) => JSON.parse(readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8'));
const args = process.argv.slice(2);
const slug = args.find((arg) => !arg.startsWith('--'));
const all = args.includes('--all');
const json = args.includes('--json');
const index = read('data/reports/index.json');
const rows = [];
const seen = new Set();

for (const { file } of read('data/packs/index.json').packs) {
  const bank = file.split('/')[0];
  if (slug && bank !== slug) continue;
  const pack = read(`data/packs/${file}`);
  for (const paper of pack.papers) {
    const id = paper.paper_id;
    const sample = paper.is_official_sample || paper.paper_type?.includes('sample') || id.includes('_SAMPLE');
    const entry = index.papers[id];
    const report = entry ? read(`data/reports/${entry.file}`) : null;
    if (seen.has(id)) throw new Error(`Duplicate active paper ${id}`);
    seen.add(id);
    if (report && (report.paper_id !== id || report.subject_id !== paper.subject_id ||
        report.source_url !== (entry.source_url || paper.examiner_report_url))) {
      throw new Error(`Mismatched report provenance for ${id}`);
    }
    const status = index.unavailable?.[id] ? 'missing'
      : report?.coverage_status === 'unreadable' ? 'unreadable'
      : report?.coverage_status === 'general_only' ? 'general_only'
      : report?.coverage_status === 'pdf_only' ? 'pdf_only'
      : report?.sections.length ? 'integrated'
      : paper.examiner_report_url ? 'pdf_only' : sample ? 'sample' : 'missing';
    const counts = { part: 0, parent_part: 0, full_question: 0, section: 0, none: 0, multiple_choice: 0 };
    const noComment = [];
    if (report?.sections.length) {
      for (const question of pack.questions.filter((unit) => unit.paper_id === id)) {
        const { scope } = sectionsFor(question, report);
        if (scope === 'none') {
          if (question.multiple_choice || question.question_type === 'multiple_choice' || question.content?.multiple_choice) counts.multiple_choice++;
          else {
            counts.none++;
            noComment.push(`${question.question_number}${question.part_label || ''}`);
          }
        } else {
          counts[scope]++;
        }
      }
    }
    rows.push({ bank, id, status, sections: report?.sections.length || 0, ...counts, ...(all ? { noComment } : {}) });
  }
}
if (!slug) {
  for (const id of Object.keys(index.papers)) {
    if (!seen.has(id)) throw new Error(`Report indexed for a paper outside the active packs: ${id}`);
  }
}
const summaries = new Map();
for (const row of rows) {
  if (!summaries.has(row.bank)) summaries.set(row.bank, { expected: 0, samples: 0, available: 0, integrated: 0, pdf_only: 0, missing: 0, general_only: 0, unreadable: 0,
    part: 0, parent_part: 0, full_question: 0, section: 0, none: 0, multiple_choice: 0, pdf_matches: 0 });
  const totals = summaries.get(row.bank);
  if (row.status === 'sample') totals.samples++;
  else {
    totals.expected++;
    totals[row.status]++;
    if (row.status !== 'missing') totals.available++;
  }
  if (row.status === 'integrated') {
    for (const key of ['part', 'parent_part', 'full_question', 'section', 'none', 'multiple_choice']) totals[key] += row[key];
  } else {
    totals.pdf_matches += row.part + row.parent_part + row.full_question + row.section;
  }
}
const subjects = Object.fromEntries([...summaries.entries()].sort(([a], [b]) => a.localeCompare(b)));
if (json) console.log(JSON.stringify({ subjects, ...(all ? { papers: rows } : {}) }, null, 2));
else {
  if (all) console.table(rows);
  console.table(subjects);
}
