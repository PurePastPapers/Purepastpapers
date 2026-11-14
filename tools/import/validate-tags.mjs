// Validates tagging output against the tagging input and the canonical specification.
// usage: node tools/import/validate-tags.mjs [paper_id ...]   (no args = every tags file)
import { readFile, readdir } from 'node:fs/promises';
const ROOT = new URL('../../', import.meta.url);
const read = async (p) => JSON.parse(await readFile(new URL(p, ROOT), 'utf8'));
const spec = await read('data/import/9MA0/specification.json');
const ids = new Map(spec.points.map((p) => [p.id, p]));
const DIFF = ['easy', 'medium', 'hard', 'extra_hard'];
let papers = process.argv.slice(2);
if (!papers.length) papers = (await readdir(new URL('data/import/9MA0/tags/', ROOT))).filter((f) => f.endsWith('.json')).map((f) => f.slice(0, -5));
let errors = 0, units = 0, low = 0;
const err = (m) => { errors++; console.error('  ✗', m); };
for (const pid of papers) {
  let tags, input;
  try { tags = await read(`data/import/9MA0/tags/${pid}.json`); } catch (e) { err(`${pid}: cannot read tags file (${e.message})`); continue; }
  try { input = await read(`.import-cache/9MA0/work/tagging/${pid}.in.json`); } catch { input = null; }
  const applied = /_P3/.test(pid);
  if (input && input.questions.length !== tags.questions?.length) err(`${pid}: ${tags.questions?.length} questions, expected ${input.questions.length}`);
  for (const [qi, q] of (tags.questions || []).entries()) {
    const iq = input?.questions[qi];
    const where = `${pid} Q${q.number}`;
    if (iq && (iq.number !== q.number || iq.key !== q.key)) err(`${where}: number/key does not match input (${iq.number}/${iq.key})`);
    if (iq && iq.units.length !== q.units?.length) err(`${where}: ${q.units?.length} units, expected ${iq.units.length}`);
    const seen = [];
    for (const [ui, u] of (q.units || []).entries()) {
      units++;
      const at = `${where}${u.label}`;
      if (iq?.units[ui] && iq.units[ui].label !== u.label) err(`${at}: label should be "${iq.units[ui].label}"`);
      if (!Array.isArray(u.primary) || !u.primary.length || u.primary.length > 3) err(`${at}: primary needs 1 to 3 ids`);
      for (const id of [...(u.primary || []), ...(u.prerequisites || [])]) {
        if (!ids.has(id)) err(`${at}: unknown spec id "${id}"`);
      }
      for (const id of u.primary || []) {
        const p = ids.get(id);
        if (p && pid.match(/_P[12]$/) && p.papers[0] === 'P3') err(`${at}: applied point ${id} tagged as primary on a pure paper`);
      }
      if ((u.prerequisites || []).some((id) => (u.primary || []).includes(id))) err(`${at}: prerequisite repeats a primary id`);
      if (!DIFF.includes(u.difficulty)) err(`${at}: difficulty "${u.difficulty}"`);
      if (!u.difficulty_basis) err(`${at}: difficulty_basis missing`);
      if (typeof u.preview !== 'string' || u.preview.length < 12 || u.preview.length > 170) err(`${at}: preview missing or wrong length (${u.preview?.length})`);
      for (const d of u.depends_on || []) if (!seen.includes(d)) err(`${at}: depends_on "${d}" is not an earlier unit of this question`);
      if (typeof u.standalone !== 'boolean') err(`${at}: standalone must be true or false`);
      if ((u.depends_on || []).length && u.standalone) err(`${at}: standalone is true but depends_on is not empty`);
      if (!['high', 'medium', 'low'].includes(u.confidence)) err(`${at}: confidence "${u.confidence}"`);
      if (u.confidence === 'low') low++;
      seen.push(u.label);
    }
  }
}
console.log(`${papers.length} paper(s), ${units} units, ${low} low-confidence, ${errors} error(s)`);
process.exit(errors ? 1 : 0);
