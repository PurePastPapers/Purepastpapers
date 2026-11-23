import assert from 'node:assert/strict';
import {test} from 'node:test';
import {validatePaper} from '../js/data/schema.js';

const unit = (id, marks) => [id, {question_id: id, marks}];
const questionsById = new Map([unit('A', 33), unit('B', 30), unit('C3', 14), unit('C4', 16), unit('C5', 16), unit('C6', 16)]);
const paper = (extra) => ({paper_id: 'P', subject_id: 'S', paper_type: 'real_past_paper', title: 'T', duration_minutes: 75, question_ids: [...questionsById.keys()], ...extra});
const totals = (issues) => issues.filter((x) => /question marks add up/.test(x.message));

test('a shared question counts once when options overlap (Section B, or Question 3 plus one of 4, 5, 6)', () => {
  const groups = [[['B'], ['C3', 'C4'], ['C3', 'C5'], ['C3', 'C6']]];
  assert.deepEqual(totals(validatePaper(paper({total_marks: 63, choice_groups: groups}), {questionsById, subjectId: 'S'})), []);
  assert.equal(totals(validatePaper(paper({total_marks: 35, choice_groups: groups}), {questionsById, subjectId: 'S'})).length, 1);
});
