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

test('every offered demo and Maths fallback has a report for its exact printed question or part', async () => {
  const { DEMO_SUBJECTS } = await import('../js/ui/demo-subjects.js');
  const { demoReportFor } = await import('../js/ui/demo-reports.js');
  const { sectionsFor, pageLink } = await import('../js/engine/examiner-report.js');
  const fixtures = [
    ['gcsemaths/EDX_1MA1_2025_JUNE_1F', [3, 3]],
    ['gcsebio/EDX_1BI0_2025_JUNE_1H', [11]],
    ['gcsephys/EDX_1PH0_2025_JUNE_2F', [39]],
    ['gcsechem/EDX_1CH0_2025_JUNE_2F', [46]],
    ['gcsecs/OCR_J277_2024_JUNE_01', [6]],
  ];
  for (const [i, [file, pages]] of fixtures.entries()) {
    const { questions, papers: [paper] } = JSON.parse(readFileSync(new URL(`../data/packs/${file}.json`, import.meta.url)));
    const demo = DEMO_SUBJECTS[i];
    const paperIndex = new Map([[paper.paper_id, paper]]);
    for (const [j, id] of demo.questions.entries()) {
      const question = selectStarterQuestion({ questions: questions.filter((item) => item.question_id === id), papersById: paperIndex }, demo);
      assert.equal(question?.question_id, id);
      const report = demoReportFor(question, paper);
      const { matches } = sectionsFor(question, report);
      assert.equal(matches.length, 1, id);
      assert.equal(matches[0].relation, question.part_label ? 'own' : 'whole', id);
      assert.equal(pageLink(report.source_url, matches[0].section.pages[0]), `${paper.examiner_report_url}#page=${pages[j]}`);
      assert.equal(demoReportFor({ ...question, part_label: '(z)' }, paper), null);
      assert.equal(demoReportFor(question, { ...paper, paper_id: 'other' }), null);
    }
  }
});
