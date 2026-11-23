import assert from 'node:assert/strict';
import test from 'node:test';
import { officialResourceUrl, questionResourceUrl } from '../js/engine/question-resources.js';
import { createTestSnapshot } from '../js/engine/test-snapshot.js';
import { prepareTestPdf } from '../js/engine/test-pdf-content.js';
import { questionRef } from '../js/ui/question-view.js';

const audio = { kind: 'audio', label: 'Official listening audio', url: 'https://example.org/listening.mp3', start_seconds: 8.052, end_seconds: 118.395 };
const prompt = { kind: 'question_pdf', label: 'Official essay prompt (PDF)', url: 'https://example.org/question.pdf#page=5' };
const scheme = 'https://example.org/scheme.pdf#page=18';
const transcript = 'https://example.org/transcript.pdf';

function fixture(resource, overrides = {}) {
  const paper = {paper_id: 'P', title: '2024 Paper', board: 'AQA', full_paper_pdf_url: 'https://example.org/question.pdf'};
  const question = {
    question_id: 'Q', paper_id: paper.paper_id, marks: 3, question_number: '01', part_label: '01.1',
    context: {official_resources: [resource], official_scheme_required: true},
    content: {mark_scheme_html: '<p>Marking rubric</p>'},
    provenance: {scheme_source_url: scheme, transcript_source_url: transcript},
    ...overrides,
  };
  const bundle = {subject: {subject_id: 'SPANISH'}, questionsById: new Map([['Q', question]]), papersById: new Map([['P', paper]])};
  return {question, paper, snapshot: createTestSnapshot({bundle, ids: ['Q']}), items: new Map([['Q', {question, paper}]])};
}

test('decimal references retain the original part without duplicating the parent in Practice or exports', () => {
  const {question, snapshot} = fixture(audio);
  assert.equal(questionRef(question), 'Q01.1');
  assert.match(snapshot.groups[0].parts[0].reference, /Q01\.1$/);
});

test('audio resources preserve official clip boundaries and block inaccurate printable question exports', async () => {
  assert.equal(questionResourceUrl(audio), 'https://example.org/listening.mp3#t=8.052,118.395');
  assert.equal(questionResourceUrl({...audio, end_seconds: null}), 'https://example.org/listening.mp3#t=8.052');
  assert.equal(officialResourceUrl('javascript:alert(1)'), null);
  const {snapshot, items} = fixture(audio, {content: {question_html: '<p>Listen and respond</p>'}});
  const pdf = await prepareTestPdf(snapshot, items, {kind: 'question'});
  assert.equal(pdf.canExportQuestions, false);
  assert.equal(pdf.missing[0].officialSourceUrl, questionResourceUrl(audio));
  assert.doesNotMatch(JSON.stringify(pdf.question), /transcript|scheme\.pdf/);
});

test('official-only essay prompts and schemes produce exact PDF links without answer leakage', async () => {
  const {snapshot, items} = fixture(prompt);
  const questions = await prepareTestPdf(snapshot, items, {kind: 'question'});
  const markScheme = await prepareTestPdf(snapshot, items, {kind: 'scheme'});
  assert.equal(questions.canExportQuestions, true);
  assert.equal(questions.question.groups[0].blocks.find(block => block.type === 'link').url, prompt.url);
  assert.equal(markScheme.scheme.groups[0].blocks.find(block => block.type === 'link').url, scheme);
  assert.doesNotMatch(JSON.stringify(questions.question), /transcript|scheme\.pdf/);
});
