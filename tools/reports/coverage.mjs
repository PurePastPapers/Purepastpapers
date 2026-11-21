// How many questions and parts of each paper an extracted examiner report reaches.
// Usage: node tools/reports/coverage.mjs maths [--all]
// Lists, per paper: sections found, units with their own comment, with a parent-part or
// whole-question comment only, and with none. A paper where most units have none usually
// means headings were not recognised (check with extract.py --show).
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { sectionsFor } from '../../js/engine/examiner-report.js';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const slug = process.argv[2];
const all = process.argv.includes('--all');
if (!slug) { console.error('usage: node tools/reports/coverage.mjs <maths|physics|biology> [--all]'); process.exit(2); }

const totals = { part: 0, parent_part: 0, full_question: 0, none: 0 };
const rows = [];
for (const file of readdirSync(path.join(root, 'data/packs', slug)).sort()) {
  const pack = JSON.parse(readFileSync(path.join(root, 'data/packs', slug, file), 'utf8'));
  for (const paper of pack.papers) {
    if (!paper.examiner_report_url) continue;
    const reportFile = path.join(root, 'data/reports', slug, `${paper.paper_id}.json`);
    if (!existsSync(reportFile)) { rows.push({ id: paper.paper_id, missing: true }); continue; }
    const report = JSON.parse(readFileSync(reportFile, 'utf8'));
    const count = { part: 0, parent_part: 0, full_question: 0, none: 0 };
    const none = [];
    for (const question of pack.questions.filter((q) => q.paper_id === paper.paper_id)) {
      const { scope } = sectionsFor(question, report);
      count[scope] += 1;
      totals[scope] += 1;
      if (scope === 'none') none.push(`${question.question_number}${question.part_label || ''}`);
    }
    rows.push({ id: paper.paper_id, sections: report.sections.length, ...count, noneList: none });
  }
}
for (const row of rows) {
  if (row.missing) { console.log(`${row.id.padEnd(28)} no report file`); continue; }
  const units = row.part + row.parent_part + row.full_question + row.none;
  const flag = row.none / Math.max(1, units) > 0.5 ? '  <- check' : '';
  if (all || flag) console.log(`${row.id.padEnd(28)} ${String(row.sections).padStart(3)} sections  own ${row.part}  parent ${row.parent_part}  whole ${row.full_question}  none ${row.none}${flag}${row.none && all ? `  [${row.noneList.join(' ')}]` : ''}`);
}
const units = Object.values(totals).reduce((a, b) => a + b, 0);
console.log(`\n${slug}: ${rows.filter((r) => !r.missing).length} reports, ${units} units: own comment ${totals.part}, parent part ${totals.parent_part}, whole question ${totals.full_question}, none ${totals.none}; ${rows.filter((r) => r.missing).length} papers without a report file`);
