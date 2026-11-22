import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, readdirSync} from 'node:fs';
import {validateBundle} from '../js/data/schema.js';
import {createSpecIndex} from '../js/engine/spec-index.js';

const read = path => JSON.parse(readFileSync(new URL('../' + path, import.meta.url), 'utf8'));
const coverage = read('data/imports/gcseenglang/coverage.json');
const inventory = read('data/imports/gcseenglang/inventory/8700-inventory.json');
const spec = read('data/specs/AQA_GCSE_ENGLANG_8700.json');
const files = readdirSync(new URL('../data/packs/gcseenglang/', import.meta.url)).filter(f => f.endsWith('.json'));
const packs = files.map(f => read('data/packs/gcseenglang/' + f));
const units = packs.flatMap(p => p.questions);
const leaves = new Set(spec.sections.flatMap(s => s.topics.flatMap(t => t.points.map(p => p.id))));

test('every public 8700 booklet with a question paper and scheme is built; the one without a public paper is recorded', () => {
  assert.equal(inventory.papers.length, 21);
  assert.deepEqual(packs.map(p => p.papers[0].paper_id).sort(), inventory.papers.map(p => p.paper_id).sort());
  assert.deepEqual(inventory.not_public.map(x => x.paper_id), ['AQA_8700_2023_NOVEMBER_02']);
  assert.deepEqual(coverage.queued_public_booklets, []);
  assert.equal(new Set(units.map(q => q.question_id)).size, units.length);
  assert.equal(Object.keys(read('data/imports/gcseenglang/identities.json').units).length, units.length);
  assert.equal(coverage.totals.scored_units, units.length);
});

test('each booklet reconciles to 80 marks: published plus excluded (copyright removed) equals the cover maximum', () => {
  for (const pack of packs) {
    const [paper] = pack.papers;
    const published = pack.questions.reduce((s, q) => s + q.marks, 0);
    const excluded = (paper.excluded_questions || []).reduce((s, x) => s + x.marks, 0);
    assert.equal(paper.total_marks, 80, paper.paper_id);
    assert.equal(published + excluded, 80, paper.paper_id);
    for (const x of paper.excluded_questions || []) assert.ok(x.reason.startsWith('AQA removed'), paper.paper_id);
  }
});

test('units carry valid skills, model-review labels, checksums, a real qualification identity and a lazily loaded source image', () => {
  for (const q of units) {
    assert.equal(q.subject_id, 'AQA_GCSE_ENGLANG_8700');
    assert.equal(q.is_as, false);
    assert.equal(q.provenance.reviewer_type, 'model');
    assert.match(q.provenance.question_source_sha256, /^[0-9a-f]{64}$/);
    assert.match(q.provenance.scheme_source_sha256, /^[0-9a-f]{64}$/);
    assert.ok(q.primary_spec_points.length === 1 && q.primary_spec_points.every(id => leaves.has(id)), q.question_id);
    assert.ok(q.crossover_spec_points.every(id => leaves.has(id)), q.question_id);
    assert.ok(['easy', 'medium', 'hard'].includes(q.difficulty) && q.provenance.difficulty_basis, q.question_id);
    assert.match(q.content.question_image_url, /^assets\/gcseenglang\//);
    assert.equal(q.is_sample, false);
    assert.equal(q.is_official_sample, /SAMPLE/.test(q.paper_id));
    if (q.question_number !== '5' && !q.part_label) assert.ok(q.context.figures?.length || /_Q02_/.test(q.question_id), `${q.question_id} needs its source`);
  }
});

test('copyright-removed sources never produce a published unit that depends on them', () => {
  for (const pack of packs) {
    const ex = new Set((pack.papers[0].excluded_questions || []).map(x => x.question_number));
    for (const q of pack.questions) assert.ok(!ex.has(q.part_label || q.question_number), q.question_id);
  }
  assert.equal(coverage.excluded_copyright_removed.length, 21);
  assert.equal(units.length, 87);
  assert.equal(coverage.reviewer_type, 'model');
  assert.ok(coverage.rights_basis.startsWith('ASSUMPTION'));
});

test('the 2026 sample Paper 1 splits Question 1 into four one-mark multiple choice units sharing a stem', () => {
  const sample = packs.find(p => p.papers[0].paper_id === 'AQA_8700_SAMPLE_01').questions.filter(q => q.question_number === '1');
  assert.deepEqual(sample.map(q => [q.part_label, q.marks]), [['1.1', 1], ['1.2', 1], ['1.3', 1], ['1.4', 1]]);
  assert.ok(sample.every(q => q.context.stem_image_url && q.multiple_choice));
});

test('packs validate against the runtime schema (only booklets with an excluded question may fall short of their total)', () => {
  const subject = read('data/subjects.json').find(x => x.subject_id === 'AQA_GCSE_ENGLANG_8700');
  const index = createSpecIndex(); index.add(spec);
  const papers = packs.flatMap(p => p.papers);
  const issues = validateBundle({subject, papers, questions: units, questionsById: new Map(units.map(q => [q.question_id, q]))}, index);
  assert.deepEqual(issues.filter(i => i.level === 'error'), []);
  const short = new Set(papers.filter(p => p.excluded_questions?.length).map(p => p.paper_id));
  for (const issue of issues) assert(short.has(issue.id), issue.id + ': ' + issue.message);
});
