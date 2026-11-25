import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as api from '../js/data/api.js';
import { latestByQuestion } from '../js/engine/analytics.js';
import { createSession, finishSession, retrySession } from '../js/data/sessions.js';

const makeStorage = () => {
  const map = new Map();
  return { getItem: (k) => map.get(k) ?? null, setItem: (k, v) => map.set(k, String(v)), removeItem: (k) => map.delete(k) };
};
const q = { question_id: 'q1', subject_id: 's', marks: 5, source_type: 'real_past_paper', difficulty: 'easy' };

test('deliberate inline marks support zero, edits, undo, reload and separate reattempts', async () => {
  globalThis.localStorage = makeStorage();
  await api.init();
  await api.signUp({ email: 'marks@example.test', password: 'password123', displayName: 'Marks' });
  await api.saveQuestionMark(q, 0);
  assert.equal(api.getProgress().question_attempts.length, 1);
  await api.saveQuestionMark(q, 4);
  await api.saveQuestionMark(q, 4);
  assert.equal(api.getProgress().question_attempts.length, 1);
  assert.equal(latestByQuestion(api.getProgress().question_attempts).get('q1').marks_awarded, 4);
  await api.init();
  assert.equal(latestByQuestion(api.getProgress().question_attempts).get('q1').marks_awarded, 4);
  await api.undoQuestionMark('q1');
  assert.equal(api.getProgress().question_attempts[0].marks_awarded, 0);
  await api.saveQuestionMark(q, 5, { reattempt: true });
  assert.equal(api.getProgress().question_attempts.length, 2);
  assert.equal(latestByQuestion(api.getProgress().question_attempts).get('q1').marks_awarded, 5);
  await api.undoQuestionMark('q1');
  assert.equal(latestByQuestion(api.getProgress().question_attempts).get('q1').marks_awarded, 0);
  await assert.rejects(api.saveQuestionMark(q, NaN));
});

test('timed sessions never invent zero marks; manual paper totals remain supported', async () => {
  globalThis.localStorage = makeStorage();
  await api.init();
  const s = createSession({ kind: 'custom_test', subject_id: 's', title: 'Test', question_ids: ['q1', 'q2'] });
  s.marks.q1 = 0;
  const second = { ...q, question_id: 'q2' };
  const result = await finishSession(s, { questions: [q, second], subject: {} });
  assert.equal(result.questions_unmarked, 1);
  assert.equal(result.grade, null);
  assert.equal(api.getProgress().question_attempts.length, 1);
  assert.equal(api.getProgress().question_attempts[0].marks_awarded, 0);
  assert.equal(api.getProgress().paper_attempts.length, 0);
  const paper = createSession({ kind: 'full_paper', subject_id: 's', title: 'Paper', total_marks: 100 });
  const manual = await finishSession(paper, { questions: [], subject: {}, totalAwarded: 72 });
  assert.equal(manual.marks_awarded, 72);
  assert.equal(api.getProgress().paper_attempts.length, 1);
});

test('raw-mark qualifications keep session results as marks and percentages without generic grades', async () => {
  globalThis.localStorage = makeStorage();
  await api.init();
  const question = { ...q, question_id: 'h151-q1' };
  const session = createSession({ kind: 'full_paper', subject_id: 'OCR_L3_APPSCI_AAQ', title: 'F180 Sample', question_ids: [question.question_id] });
  session.marks[question.question_id] = 5;
  const result = await finishSession(session, {
    questions: [question],
    subject: { grade_scheme: 'level3', grade_policy: 'raw_marks_only' },
    paper: { total_marks: 5 },
  });
  assert.equal(result.marks_awarded, 5);
  assert.equal(result.percentage, 100);
  assert.equal(result.grade, null);
  assert.equal(api.getProgress().paper_attempts[0].grade, null);
});

test('concurrent and repeated saves record a completed result only once', async () => {
  globalThis.localStorage = makeStorage();
  await api.init();
  const session = createSession({ kind: 'full_paper', subject_id: 's', title: 'Paper', paper_id: 'p', question_ids: ['q1'] });
  session.marks.q1 = 3;
  const context = { questions: [q], subject: {} };
  const [first, second] = await Promise.all([finishSession(session, context), finishSession(session, context)]);
  assert.equal(first, second);
  assert.equal(first.marks_awarded, 3);
  await finishSession(session, context);
  assert.equal(api.getProgress().question_attempts.length, 1);
  assert.equal(api.getProgress().paper_attempts.length, 1);
});

test('retrying a failed progress write saves the completed result without duplicating attempts', async () => {
  const storage = makeStorage();
  globalThis.localStorage = storage;
  await api.init();
  await api.signUp({ email: 'result@example.test', password: 'password123', displayName: 'Result' });
  const session = createSession({ kind: 'full_paper', subject_id: 's', title: 'Paper', paper_id: 'p', question_ids: ['q1'] });
  session.marks.q1 = 3;
  const context = { questions: [q], subject: {} };
  globalThis.localStorage = { ...storage, setItem() { throw new Error('Storage unavailable'); } };
  await assert.rejects(finishSession(session, context), /could not save your data/);
  globalThis.localStorage = storage;
  await finishSession(session, context);
  await api.init();
  assert.equal(api.getSession(session.session_id).result.marks_awarded, 3);
  assert.equal(api.getProgress().question_attempts.length, 1);
  assert.equal(api.getProgress().paper_attempts.length, 1);
});

test('retrying an official paper keeps its history and timing but starts a new attempt', async () => {
  globalThis.localStorage = makeStorage();
  await api.init();
  const paper = createSession({
    kind: 'full_paper', subject_id: 's', title: 'Paper from PDF', paper_id: 'p',
    paper_type: 'real_past_paper', total_marks: 100, timer: 'countdown', time_limit_minutes: 75,
    mark_mode: 'end',
  });
  const context = { questions: [], subject: {}, totalAwarded: 72 };
  await finishSession(paper, context);
  const retry = retrySession(paper);
  assert.notEqual(retry.session_id, paper.session_id);
  assert.equal(retry.kind, 'full_paper');
  assert.equal(retry.mark_mode, 'end');
  assert.equal(retry.time_limit_minutes, 75);
  assert.equal(retry.timer.mode, 'countdown');
  assert.equal(retry.result, null);
  await finishSession(retry, { ...context, totalAwarded: 84 });
  assert.deepEqual(api.getProgress().paper_attempts.map((attempt) => [attempt.paper_id, attempt.paper_type, attempt.marks_awarded]), [
    ['p', 'real_past_paper', 72], ['p', 'real_past_paper', 84],
  ]);

  const set = createSession({ kind: 'question_set', subject_id: 's', title: 'Set', question_ids: ['q1'], timer: 'stopwatch' });
  set.source_paper_id = 'p';
  set.answers.q1 = 'Working';
  const freshSet = retrySession(set);
  assert.deepEqual(freshSet.question_ids, ['q1']);
  assert.notEqual(freshSet.question_ids, set.question_ids);
  assert.equal(freshSet.source_paper_id, 'p');
  assert.deepEqual(freshSet.answers, {});
  assert.equal(freshSet.timer.mode, 'stopwatch');
});
