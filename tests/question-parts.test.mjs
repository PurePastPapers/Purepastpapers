import assert from 'node:assert/strict';
import { test } from 'node:test';
import { validateBundle, validateQuestion } from '../js/data/schema.js';
import { createSpecIndex } from '../js/engine/spec-index.js';
import { filterQuestions } from '../js/engine/filter-engine.js';
import { questionMeta, questionRef } from '../js/ui/question-view.js';
import { practicePool } from '../js/ui/student.js';

const subjectId = 'PARTS_SUBJECT';
const index = createSpecIndex();
index.add({ subject_id: subjectId, sections: [{ id: 'SECTION', title: 'Paper 1', topics: [
  { id: 'TOPIC_1', title: 'Topic 1', points: [{ id: 'POINT_1', code: '1.1', title: 'Topic 1 point' }] },
  { id: 'TOPIC_6', title: 'Topic 6', points: [{ id: 'POINT_6', code: '6.1', title: 'Topic 6 point' }] },
] }] });
const context = { specIndex: index, paperIds: new Set(['PAPER', 'OTHER_PAPER']), subjectId };
const question = (id, extra = {}) => ({
  question_id: id, question_number: '7', subject_id: subjectId, paper_id: 'PAPER',
  source_type: 'real_past_paper', difficulty: 'medium', marks: 3, estimated_minutes: 4,
  include_in_custom_pool: true, primary_spec_points: ['POINT_1'], crossover_spec_points: [],
  content: { question_html: '<p>Part b selected content.</p>', mark_scheme_html: '<p>Part b mark scheme.</p>' },
  ...extra,
});
const part = (id, extra = {}) => question(id, { parent_question_id: 'PAPER_Q7', part_label: 'b', ...extra });
const bundle = (questions) => ({
  subject: { subject_id: subjectId },
  papers: ['PAPER', 'OTHER_PAPER'].map((paper_id) => ({
    paper_id, subject_id: subjectId, paper_type: 'real_past_paper', title: paper_id,
    total_marks: 100, duration_minutes: 90, question_ids: [],
  })), questions,
  questionsById: new Map(questions.map((record) => [record.question_id, record])),
});
const errors = (questions) => validateBundle(bundle(questions), index).filter((entry) => entry.level === 'error');

test('legacy questions stay valid and a part parent can be a non-assessable grouping id', () => {
  assert.deepEqual(validateQuestion(question('LEGACY'), context), []);
  assert.deepEqual(validateQuestion(part('PAPER_Q7_B', {
    context: { shared_stem_html: '<p>Shared diagram and values.</p>', full_question_html: '<p>All parts.</p>' },
  }), context), []);
  assert.deepEqual(errors([part('PAPER_Q7_B')]), []);
});

test('optional part and context fields reject malformed imports', () => {
  for (const extra of [
    { parent_question_id: 7 }, { parent_question_id: '' }, { parent_question_id: 'ID' },
    { part_label: '' }, { part_label: 2 }, { part_label: 'b', parent_question_id: undefined },
    { context: null }, { context: [] }, { context: 'full question' },
    { context: { shared_stem_html: 2 } }, { context: { full_question_html: [] } },
    { context: { full_question_image_url: false } },
    { depends_on_question_ids: 'EARLIER' },
    { depends_on_question_ids: [2] }, { depends_on_question_ids: [''] },
    { depends_on_question_ids: ['EARLIER', 'EARLIER'] },
    { depends_on_question_ids: ['ID'] },
  ]) {
    assert.ok(validateQuestion(part('ID', extra), context).some((entry) => entry.level === 'error'), JSON.stringify(extra));
  }
});

test('a dependent part must provide required earlier information in its visible shared stem', () => {
  const withoutStem = part('B', { depends_on_question_ids: ['A'], context: { full_question_html: '<p>Full original.</p>' } });
  assert.ok(validateQuestion(withoutStem, context).some((entry) => /shared_stem_html/.test(entry.message)));
  const supplied = { ...withoutStem, context: { ...withoutStem.context, shared_stem_html: '<p>For this part, use the result x = 4 from part a.</p>' } };
  assert.deepEqual(validateQuestion(supplied, context), []);
});

test('dependencies resolve only within their subject bundle, paper and original question', () => {
  const a = part('A', { part_label: 'a' });
  const b = part('B', { depends_on_question_ids: ['A'], context: { shared_stem_html: '<p>Use the result from a: x = 4.</p>' } });
  assert.deepEqual(errors([a, b]), []);
  assert.ok(errors([b]).some((entry) => /not a question in this subject bundle/.test(entry.message)));
  assert.ok(errors([{ ...a, paper_id: 'OTHER_PAPER' }, b]).some((entry) => /different paper/.test(entry.message)));
  assert.ok(errors([{ ...a, parent_question_id: 'PAPER_Q8' }, b]).some((entry) => /different parent question/.test(entry.message)));
});

test('dependency cycles reject just the cyclic records while valid dependency chains pass', () => {
  const make = (id, dependencies) => part(id, {
    depends_on_question_ids: dependencies, context: { shared_stem_html: '<p>Supplied earlier results.</p>' },
  });
  const cycle = errors([make('A', ['B']), make('B', ['A']), make('C', ['A'])]);
  assert.deepEqual(cycle.filter((entry) => /cycle/.test(entry.message)).map((entry) => entry.id).sort(), ['A', 'B']);
  assert.deepEqual(errors([make('A', []), make('B', ['A']), make('C', ['B'])]), []);
});

test('dependency validation handles thousands of linked records without exhausting the call stack', () => {
  const records = Array.from({ length: 8000 }, (_, index) => part(`CHAIN_${index}`, {
    depends_on_question_ids: index < 7999 ? [`CHAIN_${index + 1}`] : [],
    context: { shared_stem_html: '<p>Supplied earlier result.</p>' },
  }));
  assert.deepEqual(errors(records), []);
});

test('a selected part filters and counts by its own spec tags and marks, not its siblings or full context', () => {
  const a = part('Q7_A', { part_label: 'a', primary_spec_points: ['POINT_6'], marks: 8 });
  const b = part('Q7_B', { context: { full_question_html: '<p>Part a is topic 6. Part b is topic 1.</p>' } });
  const c = part('Q7_C', { part_label: 'c', primary_spec_points: ['POINT_6'], marks: 5 });
  const result = filterQuestions([a, b, c], { focus: ['TOPIC_1'] }, { specIndex: index, learned: new Set(['POINT_1']) });
  assert.deepEqual(result.matches.map((record) => record.question_id), ['Q7_B']);
  assert.equal(result.matches[0].marks, 3);
  assert.equal(result.locked.length, 0);
});

test('the practice pool uses assessable leaves even when an intermediate part is also a parent', () => {
  const parent = question('PAPER_Q7', { primary_spec_points: ['POINT_6'], marks: 12 });
  const b = part('PAPER_Q7_B', { primary_spec_points: ['POINT_6'], marks: 6 });
  const bi = part('PAPER_Q7_B_I', { parent_question_id: 'PAPER_Q7_B', part_label: 'b(i)', primary_spec_points: ['POINT_1'], marks: 3 });
  const c = part('PAPER_Q7_C', { part_label: 'c', primary_spec_points: ['POINT_6'], marks: 5 });
  const bank = practicePool(bundle([parent, b, bi, c]));
  assert.deepEqual(bank.map((q) => q.question_id), ['PAPER_Q7_B_I', 'PAPER_Q7_C']);
  const result = filterQuestions(bank, { focus: ['POINT_1'], selectionMode: 'strict', learnedOnly: false }, { specIndex: index });
  assert.deepEqual(result.matches.map((q) => [q.question_id, q.marks]), [['PAPER_Q7_B_I', 3]]);
});

test('question references identify isolated parts without duplicating legacy part suffixes', () => {
  const papers = new Map([['PAPER', { title: 'June 2024 Paper 1: Physics' }]]);
  assert.equal(questionRef(part('Q7_B'), papers), 'June 2024 Paper 1 · Q7(b)');
  assert.equal(questionRef(part('Q7_B', { question_number: '7(b)' }), papers), 'June 2024 Paper 1 · Q7(b)');
  assert.equal(questionRef(part('Q7_B_II', { part_label: 'b(ii)' }), papers), 'June 2024 Paper 1 · Q7(b)(ii)');
  assert.equal(questionRef(part('Q7_B_II', { part_label: '(b)(ii)' }), papers), 'June 2024 Paper 1 · Q7(b)(ii)');
  assert.equal(questionRef(part('Q7_B_II', { question_number: '7(b)(ii)', part_label: 'b(ii)' }), papers), 'June 2024 Paper 1 · Q7(b)(ii)');
  assert.equal(questionRef(question('LEGACY'), papers), 'June 2024 Paper 1 · Q7');
});

test('question metadata explains exact primary and crossover spec codes without exposing internal ids', () => {
  const markup = String(questionMeta(part('Q7_B', { crossover_spec_points: ['POINT_6'], is_sample: true }), { specIndex: index }));
  assert.match(markup, /Spec 1\.1/);
  assert.match(markup, /Also needs 6\.1/);
  assert.match(markup, /title="1\.1 Topic 1 point"/);
  assert.match(markup, /title="6\.1 Topic 6 point"/);
  assert.ok(!markup.includes('POINT_1') && !markup.includes('POINT_6'));
  assert.match(markup, /Demo content/);
  assert.match(markup, /Medium/);
});
