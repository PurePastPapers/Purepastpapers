import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { validateBundle } from '../js/data/schema.js';
import { testPool } from '../js/engine/practice-modes.js';
import { createSpecIndex } from '../js/engine/spec-index.js';

const read = path => JSON.parse(readFileSync(new URL('../data/' + path, import.meta.url)));
const subjectId = 'AQA_GCSE_ENGLANG_8700';
const entries = read('packs/index.json').packs.filter(entry => entry.subject_id === subjectId && entry.enabled !== false);
const packs = entries.map(entry => read('packs/' + entry.file));
const papers = packs.flatMap(pack => pack.papers);
const questions = packs.flatMap(pack => pack.questions);
const papersById = new Map(papers.map(paper => [paper.paper_id, paper]));
const questionsById = new Map(questions.map(question => [question.question_id, question]));

test('8700 indexed units reconcile printed and available marks and pass Practice capability checks', () => {
  const specIndex = createSpecIndex();
  specIndex.add(read('specs/' + subjectId + '.json'));
  const subject = read('subjects.json').find(row => row.subject_id === subjectId);
  const issues = validateBundle({ subject, papers, questions, questionsById }, specIndex);
  assert(issues.every(issue => issue.level === 'warning' && papersById.get(issue.id)?.incomplete
    && issue.message.includes('only partly extracted')));
  assert.deepEqual(issues.map(issue => issue.id).sort(), papers.filter(paper => paper.incomplete).map(paper => paper.paper_id).sort());
  assert.equal(questionsById.size, questions.length);
  assert.deepEqual(testPool(questions, papersById), questions);
  for (const paper of papers) {
    assert.equal(paper.total_marks, 80);
    assert.equal(paper.duration_minutes, 105);
    assert.equal(paper.question_ids.reduce((sum, id) => sum + questionsById.get(id).marks, 0), paper.available_marks);
    assert.equal(paper.available_marks + (paper.excluded_questions || []).reduce((sum, question) => sum + question.marks, 0), 80);
    assert.equal(paper.incomplete, paper.available_marks < 80);
  }
});

test('revised specimen binds line-restricted and comparing questions to the exact official inserts', () => {
  const fiction = questionsById.get('AQA_8700_SPEC2026_P1_Q02');
  assert.deepEqual(fiction.provenance.question_pdf_pages, [4]);
  assert.deepEqual(fiction.provenance.required_source_scope.map(source => source.printed_line_range), ['lines 10 to 19']);
  const comparing = questionsById.get('AQA_8700_SPEC2026_P2_Q04');
  assert.deepEqual(comparing.provenance.required_source_scope.map(source => [source.source_label, source.insert_pdf_pages]), [['A', [2]], ['B', [3]]]);
  const references = comparing.context.official_resources.filter(resource => resource.kind === 'insert_pdf');
  assert.equal(references.length, 2);
  assert(references.every(resource => resource.url.includes('/b8647b5c-9711-4735-abb0-4bcfecffdad9/')));
  assert(references.every(resource => !Object.values(comparing.provenance).includes(resource.url)));
});

test('writing choices score once and expose the two official marking objectives only at reveal', () => {
  for (const paperNumber of [1, 2]) {
    const paper = papersById.get('AQA_8700_SPEC2026_P' + paperNumber);
    assert.equal(paper.available_marks, 80);
    assert.equal(paper.year, null);
    assert.equal(paper.is_official_sample, true);
    const writing = questionsById.get(paper.question_ids.at(-1));
    assert.equal(writing.marks, 40);
    assert.deepEqual(writing.assessment_objectives, ['AO5', 'AO6']);
    assert.match(writing.content.mark_scheme_html, /AO5.*24 marks.*AO6.*16 marks/);
    const [prompt] = writing.context.official_resources;
    assert.equal(writing.context.official_resources.length, 1);
    assert.equal(prompt.kind, 'question_pdf');
    assert(!prompt.url.startsWith(paper.full_mark_scheme_pdf_url));
    if (paperNumber === 1) assert.match(prompt.label, /both writing options and the optional picture/);
  }
});
