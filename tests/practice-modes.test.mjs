import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { getBundle, getSubjects, specIndex } from '../js/data/content-repository.js';
import { filterQuestions } from '../js/engine/filter-engine.js';
import { resolvePracticeMode, testEntries, testPool } from '../js/engine/practice-modes.js';
import { buildTest } from '../js/engine/test-builder.js';
import { practiceModes, practicePool } from '../js/ui/student.js';

test('every enabled catalogue bank with attemptable official entries can build a test', async t => {
  t.mock.method(globalThis, 'fetch', async url => new Response(await readFile(url)));
  let populated = 0;
  for (const subject of await getSubjects()) {
    const bundle = await getBundle(subject.subject_id);
    const pool = testPool(practicePool(bundle), bundle.papersById);
    const entries = testEntries(pool, pool, bundle.questionsById);
    const eligible = entries.some(question => question.source_type === 'real_past_paper');
    const availability = practiceModes(bundle);
    assert.equal(availability.modes.includes('timed_test'), eligible, subject.subject_id);
    if (!eligible) continue;
    ++populated;

    const matches = filterQuestions(pool, { learnedOnly: false }, { specIndex, papersById: bundle.papersById }).matches;
    const selection = buildTest(testEntries(matches, pool, bundle.questionsById), { minutes: 30 });
    assert.ok(selection.questions.length, subject.subject_id);
    assert.equal(selection.total_marks, selection.questions.reduce((marks, question) => marks + question.marks, 0));
    assert.equal(resolvePracticeMode(availability, 'timed_test'), 'timed_test');
  }
  assert.ok(populated >= 20);
});

const paper = { paper_id: 'paper', paper_type: 'real_past_paper' };
const question = {
  question_id: 'essay', paper_id: 'paper', source_type: 'real_past_paper',
  difficulty: 'hard', marks: 40, estimated_minutes: 50,
  content: { question_html: '<p>Essay prompt</p>', mark_scheme_html: '<p>Essay rubric</p>' },
};
const bundleOf = (questions, subject = {}, parent = paper) => ({
  subject: { has_written_exam: true, practice_modes: ['picker'], ...subject },
  questions,
  papersById: new Map([[parent.paper_id, parent]]),
  questionsById: new Map(questions.map(unit => [unit.question_id, unit])),
});

test('a future bank needs no builder flag and preserves its configured default', () => {
  const specimen = { ...question, is_official_sample: true };
  const picker = practiceModes(bundleOf([specimen]));
  assert.deepEqual(picker, { modes: ['picker', 'timed_test'], defaultMode: 'picker' });
  assert.equal(resolvePracticeMode(picker, 'individual'), 'picker');
  const future = practiceModes(bundleOf([specimen], { practice_modes: undefined }));
  assert.deepEqual(future, { modes: ['individual', 'timed_test'], defaultMode: 'individual' });
  assert.equal(resolvePracticeMode(future, 'picker'), 'individual');
});

test('papers-only, demo-only, coursework and missing required material cannot enable the builder', () => {
  const hidden = { include_in_custom_pool: false };
  const demo = { is_sample: true };
  const missingStimulus = { context: { required_stimulus_unavailable: 'Not released' } };
  const missingAudio = { context: { official_resources: [{ kind: 'audio', url: null }] } };
  const missingScheme = { context: { official_scheme_required: true } };
  const missingArticle = { context: { article: { page_image_urls: [] } } };
  const missingDependency = { depends_on_question_ids: ['missing'] };
  const oldMode = { practice_modes: ['picker', 'timed_test'] };
  const unavailable = { modes: ['picker'], defaultMode: 'picker' };
  assert.deepEqual(practiceModes(bundleOf([], oldMode)), unavailable);
  for (const patch of [hidden, demo, missingStimulus, missingAudio, missingScheme, missingArticle, missingDependency]) {
    assert.deepEqual(practiceModes(bundleOf([{ ...question, ...patch }], oldMode)), unavailable);
  }
  assert.deepEqual(practiceModes(bundleOf([question], oldMode, { ...paper, is_sample: true })), unavailable);
  assert.deepEqual(practiceModes(bundleOf([question], oldMode, { ...paper, resources_only: true })), unavailable);
  assert.deepEqual(practiceModes(bundleOf([question], { ...oldMode, has_written_exam: false })), unavailable);
  assert.equal(resolvePracticeMode(unavailable, 'timed_test'), 'picker');
});

test('a temporary empty scope keeps Build a Test and an oversized essay receives its full time', () => {
  const scoped = { ...bundleOf([question]), questions: [], unscopedQuestions: [question] };
  assert.ok(practiceModes(scoped).modes.includes('timed_test'));
  const result = buildTest([question], { minutes: 15 });
  assert.deepEqual(result.question_ids, ['essay']);
  assert.equal(result.total_marks, 40);
  assert.equal(result.time_limit_minutes, 50);
  assert.deepEqual(buildTest([question], { minutes: 15, difficulty: 'easy' }).question_ids, []);
});
