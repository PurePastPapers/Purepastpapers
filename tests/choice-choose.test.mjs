import {test} from 'node:test';
import assert from 'node:assert/strict';
import {validatePaper} from '../js/data/schema.js';

const unit = (id, marks) => [id, {question_id: id, marks}];
const questionsById = new Map([
  unit('A1', 10), unit('A2', 20),
  unit('B1', 15), unit('B2', 15), unit('B3', 15),
]);
const paper = extra => ({
  paper_id: 'P', subject_id: 'S', paper_type: 'real_past_paper', title: 't', duration_minutes: 90,
  question_ids: ['A1', 'A2', 'B1', 'B2', 'B3'], ...extra,
});
const totals = issues => issues.filter(i => /question marks add up/.test(i.message));

test('choice_choose: "answer two of three" counts the best two options of the group', () => {
  // 10 + 20 + two of (15, 15, 15) = 60
  const ok = validatePaper(paper({total_marks: 60, choice_groups: [['B1', 'B2', 'B3']], choice_choose: [2]}), {questionsById, subjectId: 'S'});
  assert.deepEqual(totals(ok), []);
  // Without choice_choose the group counts one option: 10 + 20 + 15 = 45 (existing behaviour)
  assert.deepEqual(totals(validatePaper(paper({total_marks: 45, choice_groups: [['B1', 'B2', 'B3']]}), {questionsById, subjectId: 'S'})), []);
  assert.equal(totals(validatePaper(paper({total_marks: 45, choice_groups: [['B1', 'B2', 'B3']], choice_choose: [2]}), {questionsById, subjectId: 'S'})).length, 1);
});

test('choice_choose is parallel to choice_groups and takes the largest options first', () => {
  // Group 1 (A1 10, A2 20): choose 1 -> 20; group 2 (B1..B3): choose 2 -> 30; the rest is nothing.
  const issues = validatePaper(paper({total_marks: 50, choice_groups: [['A1', 'A2'], ['B1', 'B2', 'B3']], choice_choose: [1, 2]}), {questionsById, subjectId: 'S'});
  assert.deepEqual(totals(issues), []);
  // A count larger than the options is capped at the number of options.
  const capped = validatePaper(paper({total_marks: 75, choice_groups: [['B1', 'B2', 'B3']], choice_choose: [9]}), {questionsById, subjectId: 'S'});
  assert.deepEqual(totals(capped), []);
});

test('choice_choose works with whole-option arrays (AQA Geography options)', () => {
  const byId = new Map([unit('x1', 5), unit('x2', 10), unit('y1', 15), unit('z1', 15), unit('z2', 3)]);
  const p = paper({question_ids: ['x1', 'x2', 'y1', 'z1', 'z2'], total_marks: 33, choice_groups: [[['x1', 'x2'], ['y1'], ['z1', 'z2']]], choice_choose: [2]});
  assert.deepEqual(totals(validatePaper(p, {questionsById: byId, subjectId: 'S'})), []);
});
