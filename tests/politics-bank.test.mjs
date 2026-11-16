import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, readdirSync} from 'node:fs';
import {createSpecIndex} from '../js/engine/spec-index.js';
import {validateBundle} from '../js/data/schema.js';

const read = path => JSON.parse(readFileSync(new URL('../' + path, import.meta.url), 'utf8'));
const coverage = read('data/imports/politics/coverage.json');
const files = readdirSync(new URL('../data/packs/politics/', import.meta.url)).filter(f => f.endsWith('.json'));
const packs = files.map(f => read('data/packs/politics/' + f));
const inventories = ['7152-inventory', '7152-samples-inventory'].map(n => read(`data/imports/politics/inventory/${n}.json`));
const spec = read('data/specs/AQA_ALEVEL_POL_7152.json');

test('every public AQA 7152 booklet is built, checked and accounted for', () => {
  const ids = inventories.flatMap(i => i.papers.map(p => p.paper_id)).sort();
  assert.deepEqual(packs.map(p => p.papers[0].paper_id).sort(), ids);
  assert.equal(ids.length, 20);
  assert.deepEqual(coverage.queued_public_booklets, []);
  const {image_assets, ...totals} = coverage.totals;
  if (coverage.published) assert.equal(image_assets, 274);
  assert.deepEqual(totals, {booklets: 20, source_questions: 141, scored_units: 137, marks_available: 1540, excluded_questions: 4});
  assert.deepEqual(coverage.not_publicly_available, ['AQA_7152_2025_JUNE_01']);
});

test('each booklet reconciles to 77 marks with one question per choice group', () => {
  for (const pack of packs) {
    const [paper] = pack.papers;
    const units = new Map(pack.questions.map(q => [q.question_id, q]));
    const excluded = (paper.excluded_questions || []).reduce((n, q) => n + q.marks, 0);
    let marks = [...units.values()].reduce((n, q) => n + q.marks, 0);
    for (const group of paper.choice_groups) marks -= group.reduce((n, id) => n + units.get(id).marks, 0) - Math.max(...group.map(id => units.get(id).marks));
    assert.equal(marks + excluded, 77, paper.paper_id);
    assert.equal(paper.total_marks, 77);
    assert.equal(paper.choice_groups.length, 1);
    assert.equal(paper.choice_groups[0].length, paper.paper_code === '03' ? 5 : 2);
  }
});

test('copyright-removed questions are excluded, never published incomplete', () => {
  const excluded = coverage.excluded_copyright_removed.map(x => `${x.paper_id} Q${x.question_number}`).sort();
  assert.deepEqual(excluded, ['AQA_7152_2022_JUNE_02 Q4', 'AQA_7152_2023_JUNE_02 Q4', 'AQA_7152_SAMPLE_02 Q4', 'AQA_7152_SAMPLE_03 Q4']);
  const published = new Set(packs.flatMap(p => p.questions.map(q => `${q.paper_id} Q${q.question_number}`)));
  for (const x of excluded) assert(!published.has(x), x);
});

test('units are model-reviewed, tagged to official sections and labelled honestly', () => {
  const index = createSpecIndex(); index.add(spec);
  for (const pack of packs) for (const q of pack.questions) {
    assert.equal(q.source_type, 'real_past_paper');
    assert.equal(q.provenance.reviewer_type, 'model');
    assert.equal(q.provenance.review_status, 'model_reviewed');
    assert(['easy', 'medium', 'hard'].includes(q.difficulty), q.question_id);
    assert(q.primary_spec_points.length && [...q.primary_spec_points, ...q.crossover_spec_points].every(id => index.get(id)?.type === 'point'), q.question_id);
    // Paper 1 questions are UK content; Paper 3 questions are political ideas.
    if (q.component === '01') assert(q.primary_spec_points.every(id => id.startsWith('AQA_POL_3.1.')), q.question_id);
    if (q.component === '03') assert(q.primary_spec_points.every(id => id.startsWith('AQA_POL_3.3.')), q.question_id);
    assert.match(q.content.question_image_url, /^assets\/politics\/AQA_7152_[A-Z0-9_]+\/Q\d{2}_full\.webp$/);
    assert.match(q.content.mark_scheme_image_url, /_scheme\.webp$/);
    assert(q.provenance.scheme_levels_regions.length && q.provenance.scheme_indicative_regions.length, q.question_id);
  }
});

test('Politics packs validate against the schema and are live only once AQA rights are confirmed', () => {
  const subject = read('data/subjects.json').find(s => s.subject_id === 'AQA_ALEVEL_POL_7152');
  const index = createSpecIndex(); index.add(spec);
  const questions = packs.flatMap(p => p.questions);
  const issues = validateBundle({subject, papers: packs.flatMap(p => p.papers), questions, questionsById: new Map(questions.map(q => [q.question_id, q]))}, index);
  assert.deepEqual(issues.filter(i => i.level === 'error'), []);
  // Only booklets missing a copyright-removed question may fall short of the printed total.
  assert.deepEqual([...new Set(issues.map(i => i.id))].sort(), ['AQA_7152_2022_JUNE_02', 'AQA_7152_2023_JUNE_02', 'AQA_7152_SAMPLE_02', 'AQA_7152_SAMPLE_03']);
  const live = read('data/packs/index.json').packs.map(p => p.file);
  assert.equal(live.filter(f => f.startsWith('politics/')).length, coverage.published ? 20 : 0);
  const identities = read('data/imports/politics/identities.json').units;
  assert.equal(Object.keys(identities).length, 137);
});
