import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';
import {paperChoiceGroups, paperQuestionSelection, paperSessionQuestionIds} from '../js/engine/paper-choice.js';

test('a full Politics past paper uses its official 77 marks with exactly one chosen essay', () => {
  const pack = JSON.parse(readFileSync(new URL('../data/packs/politics/AQA_7152_2022_JUNE_03.json', import.meta.url), 'utf8'));
  const [paper] = pack.papers;
  const questionsById = new Map(pack.questions.map(question => [question.question_id, question]));
  const groups = paperChoiceGroups(paper);
  const selected = paperQuestionSelection(paper, groups, [[2]]);
  assert.equal(paper.total_marks, 77);
  assert.equal(selected.length, paper.question_ids.length - 4);
  assert.deepEqual(paperSessionQuestionIds(paper, selected, questionsById), selected);
  assert.equal(paperQuestionSelection(paper, groups, [[]]), null);
  assert.equal(paperQuestionSelection(paper, groups, [[0, 1]]), null);
});

test('an answer-two section includes every part of each chosen option in paper order', () => {
  const paper = {
    question_ids: ['C', 'A1', 'A2', 'B1', 'B2', 'D'],
    choice_groups: [[['A1', 'A2'], ['B1', 'B2'], 'D']],
    choice_choose: [2],
    total_marks: 40,
  };
  const groups = paperChoiceGroups(paper);
  const selected = paperQuestionSelection(paper, groups, [[2, 0]]);
  assert.deepEqual(selected, ['C', 'A1', 'A2', 'D']);
  assert.equal(paperQuestionSelection(paper, groups, [[1, 8]]), null);
  const questionMap = new Map(selected.map(id => [id, {marks: 10}]));
  assert.deepEqual(paperSessionQuestionIds(paper, selected, questionMap), selected);
  questionMap.delete('A2');
  assert.deepEqual(paperSessionQuestionIds(paper, selected, questionMap), []);
});

test('options that share a question keep it when any option holding it is chosen (GCSE Geography June 2022 Paper 2)', () => {
  const pack = JSON.parse(readFileSync(new URL('../data/packs/gcsegeog/AQA_8035_2022_JUNE_02.json', import.meta.url), 'utf8'));
  const [paper] = pack.papers;
  const questionsById = new Map(pack.questions.map(question => [question.question_id, question]));
  const groups = paperChoiceGroups(paper);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].options.length, 4);
  const numbers = (ids) => [...new Set(ids.map(id => questionsById.get(id).question_number))];
  const water = paperQuestionSelection(paper, groups, [[2]]);
  assert.deepEqual(numbers(water), ['1', '3', '5']);
  const sectionB = paperQuestionSelection(paper, groups, [[0]]);
  assert.deepEqual(numbers(sectionB), ['1', '2']);
  // Question 3.1 was removed for copyright, so each option is one mark short of the official 63 and the
  // paper is sat from the original source (an empty list), as for other booklets with an excluded part.
  const marks = (ids) => ids.reduce((sum, id) => sum + questionsById.get(id).marks, 0);
  assert.equal(marks(sectionB), 63);
  assert.equal(marks(water), 62);
  assert.deepEqual(paperSessionQuestionIds(paper, sectionB, questionsById), sectionB);
});
