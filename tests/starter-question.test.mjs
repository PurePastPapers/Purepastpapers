import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { selectStarterQuestion } from '../js/ui/views/starter-question.js';

const bank = JSON.parse(readFileSync(new URL('../data/packs/gcsemaths/EDX_1MA1_2025_JUNE_1F.json', import.meta.url)));
const papersById = new Map(bank.papers.map((paper) => [paper.paper_id, paper]));
const primary = 'EDX_1MA1_2025_JUNE_1F_Q02_U01';
const fallback = 'EDX_1MA1_2025_JUNE_1F_Q03_U01';

test('the starter points to a published Foundation question and the matching scheme row', () => {
  const question = selectStarterQuestion({ questions: [...bank.questions].reverse(), papersById });
  assert.equal(question.question_id, primary);
  assert.equal(question.question_number, '2');
  assert.equal(question.scheme_question_number, '2');
  assert.match(question.content.mark_scheme_image_url, /Q02_scheme\.webp$/);
  assert.equal(papersById.get(question.paper_id).paper_code, '1F');
});

test('a removed or ineligible preferred question falls back to another independent question', () => {
  const remaining = bank.questions.filter((question) => question.question_id !== primary);
  assert.equal(selectStarterQuestion({ questions: remaining, papersById }).question_id, fallback);
  const incomplete = bank.questions.find((question) => question.question_id === primary);
  assert.equal(selectStarterQuestion({
    questions: [{ ...incomplete, scheme_question_number: '3' }, ...remaining],
    papersById,
  }).question_id, fallback);
  assert.equal(selectStarterQuestion({ questions: [], papersById }), undefined);
});
