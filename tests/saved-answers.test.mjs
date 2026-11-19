import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as api from '../js/data/api.js';
import { latestByQuestion } from '../js/engine/analytics.js';
import { createSession, finishSession } from '../js/data/sessions.js';
import { filterQuestions } from '../js/engine/filter-engine.js';

const makeStorage = () => {
  const map = new Map();
  return { getItem: (k) => map.get(k) ?? null, setItem: (k, v) => map.set(k, String(v)), removeItem: (k) => map.delete(k) };
};
const q = { question_id: 'q1', subject_id: 's', marks: 5, source_type: 'real_past_paper', difficulty: 'easy' };

test('an answer saved without a mark is kept, survives reload, and becomes the attempt when marked', async () => {
  globalThis.localStorage = makeStorage();
  await api.init();
  await api.signUp({ email: 'later@example.test', password: 'password123', displayName: 'Later' });
  await api.saveAnswerUnmarked(q, 'F = ma');
  await api.saveAnswerUnmarked(q, 'F = ma, so 12 N');
  assert.equal(api.getProgress().saved_answers.length, 1);
  assert.equal(api.getProgress().question_attempts.length, 0);
  await api.init();
  assert.equal(api.answerFor('q1'), 'F = ma, so 12 N');
  assert.ok(api.savedAnswers().has('q1'));
  const answeredAt = api.getProgress().saved_answers[0].timestamp;

  await api.saveQuestionMark(q, 3, { answer: 'F = ma, so 12 N' });
  assert.equal(api.getProgress().saved_answers.length, 0);
  const attempt = latestByQuestion(api.getProgress().question_attempts).get('q1');
  assert.equal(attempt.marks_awarded, 3);
  assert.equal(attempt.answer, 'F = ma, so 12 N');
  assert.equal(attempt.answered_at, answeredAt);
  assert.equal(api.answerFor('q1'), 'F = ma, so 12 N');

  // Undo puts it back as answered, not marked.
  await api.undoQuestionMark('q1');
  assert.equal(api.getProgress().question_attempts.length, 0);
  assert.equal(api.getProgress().saved_answers.length, 1);

  // Answering again after a mark and saving for later does not change the old mark.
  await api.saveQuestionMark(q, 4);
  await api.saveAnswerUnmarked(q, 'second go');
  assert.equal(latestByQuestion(api.getProgress().question_attempts).get('q1').marks_awarded, 4);
  await api.saveQuestionMark(q, 5);
  assert.equal(api.getProgress().question_attempts.length, 2, 'marking the waiting answer makes a new attempt');
});

test('tests keep typed answers to unmarked questions without counting them in the score', async () => {
  globalThis.localStorage = makeStorage();
  await api.init();
  await api.signUp({ email: 'test@example.test', password: 'password123', displayName: 'Test' });
  const second = { ...q, question_id: 'q2' };
  const third = { ...q, question_id: 'q3' };
  const s = createSession({ kind: 'custom_test', subject_id: 's', title: 'Test', question_ids: ['q1', 'q2', 'q3'] });
  s.marks.q1 = 2;
  s.answers.q1 = 'marked one';
  s.answers.q2 = 'typed, not marked';
  const result = await finishSession(s, { questions: [q, second, third], subject: {} });
  assert.equal(result.questions_unmarked, 2);
  assert.equal(result.answers_saved_unmarked, 1);
  assert.equal(result.max_marks, 5);
  const progress = api.getProgress();
  assert.deepEqual(progress.saved_answers.map((entry) => [entry.question_id, entry.answer, entry.session_id]), [['q2', 'typed, not marked', s.session_id]]);
  assert.equal(progress.question_attempts[0].answer, 'marked one');
});

test('the progress filter tells "answered, not marked" apart from "not tried yet"', () => {
  const pool = ['a', 'b', 'c'].map((id) => ({ question_id: id, subject_id: 's', marks: 2, primary_spec_points: [], include_in_custom_pool: true }));
  const ctx = {
    specIndex: { expand: () => new Set(), label: () => '' },
    latestAttempts: new Map([['c', { question_id: 'c', marks_awarded: 2, max_marks: 2, timestamp: 't' }]]),
    savedAnswers: new Map([['b', { question_id: 'b' }]]),
  };
  const ids = (criteria) => filterQuestions(pool, criteria, ctx).matches.map((question) => question.question_id);
  assert.deepEqual(ids({ markStatuses: ['answered'] }), ['b']);
  assert.deepEqual(ids({ markStatuses: ['unmarked'] }), ['a']);
  assert.deepEqual(ids({ markStatuses: ['marked'] }), ['c']);
});
