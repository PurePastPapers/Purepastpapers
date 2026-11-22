// Linked parts: parts of a question that build on each other's answers are offered as one
// question, with an answer box and marks for each part, and only when every part is learned.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {filterQuestions} from '../js/engine/filter-engine.js';
import {createSpecIndex} from '../js/engine/spec-index.js';
import {collapseLinked, collapseLocked, expandLinkedIds, groupEntry, linkGroups, partRange, runnerItems} from '../js/engine/linked-parts.js';

const read = path => JSON.parse(readFileSync(new URL('../' + path, import.meta.url), 'utf8'));

function spec() {
  const index = createSpecIndex();
  index.add({subject_id: 'S', sections: [{id: 'SEC', title: 'All', topics: [
    {id: 'T1', code: '1', title: 'One', points: [{id: 'P1', code: '1.1', title: 'A'}]},
    {id: 'T2', code: '2', title: 'Two', points: [{id: 'P2', code: '2.1', title: 'B'}]},
    {id: 'T3', code: '3', title: 'Three', points: [{id: 'P3', code: '3.1', title: 'C'}]},
  ]}]});
  return index;
}

const unit = (id, parent, label, point, extra = {}) => ({
  question_id: id, parent_question_id: parent, question_number: parent.slice(1), part_label: label, marks: 2,
  difficulty: 'easy', primary_spec_points: [point], crossover_spec_points: [], ...extra,
});

function bank() {
  return new Map([
    ['Q1_U01', unit('Q1_U01', 'Q1', '(a)', 'P1')],
    ['Q1_U02', unit('Q1_U02', 'Q1', '(b)', 'P2', {difficulty: 'hard'})],
    ['Q1_U03', unit('Q1_U03', 'Q1', '(c)', 'P3', {depends_on_question_ids: ['Q1_U02']})],
    ['Q2_U01', unit('Q2_U01', 'Q2', '(a)', 'P3')],
    ['Q2_U02', unit('Q2_U02', 'Q2', '(b)', 'P3')],
  ]);
}

test('only connected parts form a group, leaving the independent sibling available', () => {
  const byId = bank();
  const groups = linkGroups(byId);
  assert.deepEqual([...groups], [['LINKED_Q1_U02', ['Q1_U02', 'Q1_U03']]]);
  assert.equal(byId.get('Q1_U02').linked_group.position, 0);
  assert.equal(byId.get('Q2_U01').linked_group, undefined, 'questions without links are untouched');
  assert.equal(byId.get('Q1_U01').linked_group, undefined);
  assert.deepEqual(byId.get('Q1_U02').dependency_spec_points, ['P3']);
  assert.deepEqual(byId.get('Q1_U03').dependency_spec_points, ['P2']);
});

test('a link to a neighbouring question joins both (AQA "using your answer to question 21")', () => {
  const byId = new Map([
    ['Q21', {question_id: 'Q21', parent_question_id: 'Q21', question_number: '21', marks: 2, primary_spec_points: ['P1']}],
    ['Q22', {question_id: 'Q22', parent_question_id: 'Q22', question_number: '22', marks: 4, primary_spec_points: ['P2'], depends_on_question_ids: ['Q21']}],
  ]);
  assert.deepEqual([...linkGroups(byId).values()], [['Q21', 'Q22']]);
});

test('links can skip independent parts but cannot merge separate options or papers', () => {
  const byId = new Map([
    ['a', unit('a', 'Q1', '(a)', 'P1', {paper_id: 'A'})],
    ['b', unit('b', 'Q1', '(b)', 'P1', {paper_id: 'A', depends_on_question_ids: ['a']})],
    ['c', unit('c', 'Q1', '(c)', 'P2', {paper_id: 'A', depends_on_question_ids: ['a']})],
    ['d', unit('d', 'Q1', '(d)', 'P3', {paper_id: 'A', depends_on_question_ids: ['c']})],
    ['e', unit('e', 'Q1', '(e)', 'P1', {paper_id: 'B', depends_on_question_ids: ['d']})],
  ]);
  const paper = {choice_groups: [[['a', 'c', 'd'], 'b']]};
  assert.deepEqual([...linkGroups(byId, new Map([['A', paper]])).values()], [['a', 'c', 'd']]);
  assert.equal(groupEntry('LINKED_a', byId).part_label, '(a), (c), (d)');
  assert.equal(byId.get('b').linked_group, undefined);
  assert.equal(byId.get('e').linked_group, undefined);
  assert.deepEqual(runnerItems([byId.get('c'), byId.get('d')]).map((item) => item.group), [null, null]);
});

test('a linked question is offered only when every part is learned', () => {
  const byId = bank();
  linkGroups(byId);
  const context = learned => ({specIndex: spec(), learned: new Set(learned), latestAttempts: new Map(), papersById: new Map()});
  const some = filterQuestions([...byId.values()], {learnedOnly: true}, context(['P1', 'P3']));
  assert.deepEqual(some.matches.map(q => q.question_id), ['Q1_U01', 'Q2_U01', 'Q2_U02']);
  const locked = collapseLocked(some.locked, byId);
  assert.equal(locked.length, 1);
  assert.equal(locked[0].question.question_id, 'LINKED_Q1_U02');
  assert.deepEqual(locked[0].missing, ['P2']);
  assert.deepEqual(locked[0].partsMissing.get('Q1_U03'), ['P2']);
  const all = filterQuestions([...byId.values()], {learnedOnly: true}, context(['P1', 'P2', 'P3']));
  assert.deepEqual(collapseLinked(all.matches, byId).map(q => q.question_id), ['Q1_U01', 'LINKED_Q1_U02', 'Q2_U01', 'Q2_U02']);
  const strict = filterQuestions([...byId.values()], {focus: ['P2'], selectionMode: 'strict', learnedOnly: false}, context([]));
  assert.deepEqual(strict.matches, []);
  for (const point of ['P2', 'P3']) {
    const crossover = filterQuestions([...byId.values()], {focus: [point], selectionMode: 'crossover', learnedOnly: false}, context([]));
    assert.ok(collapseLinked(crossover.matches, byId).some((q) => q.question_id === 'LINKED_Q1_U02'));
  }
});

test('a group entry adds up its parts and starts as all of them', () => {
  const byId = bank();
  linkGroups(byId);
  const entry = groupEntry('LINKED_Q1_U02', byId);
  assert.equal(entry.marks, 4);
  assert.equal(entry.difficulty, 'hard');
  assert.equal(entry.part_label, '(b)–(c)');
  assert.deepEqual(entry.part_ids, ['Q1_U02', 'Q1_U03']);
  assert.deepEqual(entry.primary_spec_points, ['P2', 'P3']);
  // A test or set holding one member gets the two linked parts together.
  assert.deepEqual(expandLinkedIds(['Q2_U01', 'Q1_U03'], byId), ['Q2_U01', 'Q1_U02', 'Q1_U03']);
  // the test builder picks group entries; they expand to their parts
  assert.deepEqual(expandLinkedIds(['LINKED_Q1_U02', 'Q2_U02'], byId), ['Q1_U02', 'Q1_U03', 'Q2_U02']);
  assert.equal(partRange([{part_label: '(a)'}, {part_label: '(b)–(c)'}]), '(a)–(c)');
});

test('the runner shows consecutive linked parts as one item', () => {
  const byId = bank();
  linkGroups(byId);
  const items = runnerItems(['Q2_U01', 'Q1_U01', 'Q1_U02', 'Q1_U03'].map(id => byId.get(id)));
  assert.deepEqual(items.map(item => [item.start, item.questions.length, Boolean(item.group)]), [[0, 1, false], [1, 1, false], [2, 2, true]]);
  // a lone part from an older session is shown on its own
  assert.equal(runnerItems([byId.get('Q1_U02')])[0].group, null);
});

test('no "help with your answer" or same-part links remain in the packs', () => {
  const removed = ['EDX_1PH0_2020_NOVEMBER_2H_Q09_U03', 'EDX_1BI0_2020_NOVEMBER_1F_Q07_U05', 'OCR_H432_SAMPLE_01_Q17_b'];
  const units = read('data/packs/index.json').packs.flatMap(p => read('data/packs/' + p.file).questions);
  for (const id of removed) assert.equal(units.find(q => q.question_id === id).depends_on_question_ids, undefined, id);
  // real links stay
  assert.deepEqual(units.find(q => q.question_id === 'EDX_1MA1_2022_JUNE_1H_Q10_U03').depends_on_question_ids, ['EDX_1MA1_2022_JUNE_1H_Q10_U02']);
  // a part shown in a group keeps the text printed just before its label
  const lead = units.find(q => q.question_id === 'EDX_8MA0_2022_JUNE_22_Q01_U03');
  assert.match(lead.context.lead_in_image_url, /Q01_U03_leadin\.webp$/);
});
