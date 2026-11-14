import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as api from '../js/data/api.js';
import { latestByQuestion } from '../js/engine/analytics.js';
import { createSession, finishSession } from '../js/data/sessions.js';

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
