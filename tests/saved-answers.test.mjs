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

test('every go is kept with its answer; many can wait for a mark; any mark can change', async () => {
  globalThis.localStorage = makeStorage();
  await api.init();
  await api.signUp({ email: 'later@example.test', password: 'password123', displayName: 'Later' });
  const first = await api.saveAnswerUnmarked(q, 'F = ma');
  await api.saveAnswerUnmarked(q, 'F = ma, so 12 N', { attemptId: first.attempt_id });
  const second = await api.saveAnswerUnmarked(q, 'second go');
  assert.equal(api.getProgress().saved_answers.length, 2, 'two goes waiting to be marked');
  assert.equal(api.getProgress().question_attempts.length, 0);
  await api.init();
  assert.equal(api.attemptsFor('q1').length, 2);
  assert.equal(api.attemptsFor('q1').find((go) => go.attempt_id === first.attempt_id).answer, 'F = ma, so 12 N');

  // Marking the first go moves it out of the waiting list, keeping its answer, id and date.
  const marked = await api.saveQuestionMark(q, 3, { attemptId: first.attempt_id });
  assert.equal(marked.attempt_id, first.attempt_id);
  assert.equal(marked.answer, 'F = ma, so 12 N');
  assert.equal(marked.answered_at, first.timestamp);
  assert.equal(api.getProgress().saved_answers.length, 1);

  // Undo puts it back, still waiting.
  await api.undoQuestionMark('q1', { attemptId: first.attempt_id });
  assert.equal(api.getProgress().saved_answers.length, 2);
  await api.saveQuestionMark(q, 3, { attemptId: first.attempt_id });

  // A new marked go, then change the OLDER go's mark and answer: the newer go is untouched.
  const third = await api.saveQuestionMark(q, 5, { reattempt: true, answer: 'third go' });
  await api.changeQuestionMark(first.attempt_id, 1);
  await api.saveAnswerUnmarked(q, 'F = ma, so 12 N (fixed)', { attemptId: first.attempt_id });
  const goes = api.attemptsFor('q1');
  assert.equal(goes.length, 3);
  assert.equal(goes.find((go) => go.attempt_id === first.attempt_id).marks_awarded, 1);
  assert.equal(goes.find((go) => go.attempt_id === first.attempt_id).answer, 'F = ma, so 12 N (fixed)');
  assert.equal(goes.find((go) => go.attempt_id === third.attempt_id).marks_awarded, 5);
  assert.ok(goes.find((go) => go.attempt_id === second.attempt_id).waiting);
  assert.equal(latestByQuestion(api.getProgress().question_attempts).get('q1').marks_awarded, 5);
});

test('older records get stable ids', async () => {
  globalThis.localStorage = makeStorage();
  await api.init();
  await api.signUp({ email: 'old@example.test', password: 'password123', displayName: 'Old' });
  await api.mergeProgress({ question_attempts: [{ question_id: 'q1', marks_awarded: 2, max_marks: 5, timestamp: '2026-01-01T10:00:00.000Z' }] });
  await api.init();
  const id = api.attemptsFor('q1')[0].attempt_id;
  await api.init();
  assert.equal(api.attemptsFor('q1')[0].attempt_id, id);
  await api.changeQuestionMark(id, 4);
  assert.equal(api.attemptsFor('q1')[0].marks_awarded, 4);
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
