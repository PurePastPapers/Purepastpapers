import test from 'node:test';
import assert from 'node:assert/strict';
import { isExportedTest, putExport, putOfflineAttempt, removeOfflinePart, removeTestExport, retainOfflineProgress } from '../js/data/offline-progress.js';
import { scoreTestSnapshot } from '../js/engine/test-snapshot.js';

const snapshot = {
  version: 1,
  choices: [],
  id: 'pdf_frozen-test',
  subjectId: 'maths',
  title: 'Frozen test',
  totalMarks: 3,
  groups: [{ parts: [
    { id: 'part-a', maxMarks: 1, sourceType: 'real_past_paper', difficulty: 'medium' },
    { id: 'part-b', maxMarks: 2, sourceType: 'real_past_paper', difficulty: 'hard' },
  ] }],
};
const emptyProgress = () => ({ custom_tests: [], sessions: [], question_attempts: [], paper_attempts: [] });
const paper = () => ({
  paper_id: snapshot.id,
  paper_type: 'user_custom_test',
  subject_id: snapshot.subjectId,
  title: snapshot.title,
  total_marks: snapshot.totalMarks,
  question_ids: ['part-a', 'part-b'],
  snapshot,
});

test('repeat export keeps the original immutable test record and a revised selection creates a new record', () => {
  const progress = emptyProgress();
  const first = putExport(progress, snapshot, '2026-11-22T01:00:00.000Z');
  const repeated = putExport(progress, { ...snapshot, title: 'Re-export renamed' }, '2026-11-22T02:00:00.000Z');
  assert.equal(repeated, first);
  assert.equal(repeated.title, 'Frozen test');
  assert.equal(repeated.created_at, '2026-11-22T01:00:00.000Z');
  putExport(progress, { ...snapshot, id: 'pdf_edited-test', totalMarks: 1 }, '2026-11-22T03:00:00.000Z');
  assert.deepEqual(progress.custom_tests.map(test => test.paper_id), ['pdf_frozen-test', 'pdf_edited-test']);
});

test('removing an export survives a stale progress write and preserves recorded marks', () => {
  const progress = emptyProgress();
  const saved = putExport(progress, snapshot, '2026-11-22T01:00:00.000Z');
  const other = putExport(progress, { ...snapshot, id: 'pdf_other-test' });
  const attempt = putOfflineAttempt(progress, saved, { newAttemptId: 'paper_saved' });
  putOfflineAttempt(progress, saved, {
    expectedRevision: attempt.revision,
    result: { mode: 'overall', awarded: 2, maxMarks: 3, percentage: 67 },
  });
  const stale = structuredClone(progress);

  removeTestExport(progress, saved.paper_id, saved.created_at);
  const merged = retainOfflineProgress(stale, progress);
  assert.deepEqual(merged.custom_tests.filter(isExportedTest), [other]);
  assert.deepEqual(merged.paper_attempts, stale.paper_attempts);
  assert.deepEqual(merged.sessions, stale.sessions);
  assert.equal(merged.custom_tests.find(test => test.paper_id === saved.paper_id).snapshot, undefined);

  const newExport = putExport(progress, snapshot, '2026-11-22T02:00:00.000Z');
  assert.deepEqual(retainOfflineProgress(merged, progress).custom_tests.filter(isExportedTest), [newExport, other]);
  assert.throws(() => removeTestExport(progress, saved.paper_id, saved.created_at), /exported again/);
  assert.equal(progress.custom_tests.find(test => test.paper_id === saved.paper_id), newExport);
});

test('completion can be recorded without marks and a partial zero mark remains explicit', () => {
  const progress = emptyProgress();
  const savedPaper = putExport(progress, snapshot);
  const done = putOfflineAttempt(progress, savedPaper, { newAttemptId: 'paper_attempt-1' }, '2026-11-22T01:00:00.000Z');
  assert.equal(done.status, 'completed_on_paper');
  assert.equal(done.result, null);
  assert.equal(progress.question_attempts.length, 0);
  const result = { mode: 'parts', marks: { 'part-a': 0 }, awarded: 0, maxMarks: 3, percentage: null, unmarked: 1 };
  const marked = putOfflineAttempt(progress, savedPaper, { result, expectedRevision: done.revision }, '2026-11-22T02:00:00.000Z');
  assert.equal(marked.status, 'completed');
  assert.deepEqual(progress.question_attempts.map(attempt => [attempt.question_id, attempt.marks_awarded, attempt.max_marks]), [['part-a', 0, 1]]);
  assert.equal(progress.paper_attempts.length, 0);
});

test('retries of an identical save are idempotent and stale divergent saves are rejected', () => {
  const progress = emptyProgress();
  const savedPaper = putExport(progress, snapshot);
  const started = putOfflineAttempt(progress, savedPaper, { newAttemptId: 'paper_attempt-1' });
  const result = { mode: 'parts', marks: { 'part-a': 0 }, awarded: 0, maxMarks: 3, percentage: null, unmarked: 1 };
  const first = putOfflineAttempt(progress, savedPaper, { result, expectedRevision: started.revision });
  const retry = putOfflineAttempt(progress, savedPaper, { result, expectedRevision: started.revision });
  assert.equal(retry, first);
  assert.equal(progress.sessions.length, 1);
  assert.equal(progress.question_attempts.length, 1);
  assert.throws(() => putOfflineAttempt(progress, savedPaper, {
    result: { ...result, marks: { 'part-a': 1 }, awarded: 1 },
    expectedRevision: started.revision,
  }), /changed on another device/);
  assert.equal(progress.question_attempts.length, 1);
});

test('later detailed marking preserves blank or newly unavailable prior part marks', () => {
  const progress = emptyProgress();
  const savedPaper = putExport(progress, snapshot);
  const started = putOfflineAttempt(progress, savedPaper, { newAttemptId: 'paper_attempt-1' });
  const full = { mode: 'parts', marks: { 'part-a': 0, 'part-b': 2 }, awarded: 2, maxMarks: 3, percentage: 66.7, unmarked: 0 };
  const first = putOfflineAttempt(progress, savedPaper, { result: full, expectedRevision: started.revision });
  const unavailable = new Map([['part-b', { question: {} }]]);
  const revised = scoreTestSnapshot(snapshot, {
    mode: 'parts', marks: { 'part-b': 1 }, chosenOptions: [], total: null,
  }, unavailable, { preserve: { 'part-a': 0 } });
  assert.deepEqual(revised.marks, { 'part-b': 1, 'part-a': 0 });
  putOfflineAttempt(progress, savedPaper, { result: revised, expectedRevision: first.revision });
  assert.deepEqual(progress.question_attempts
    .sort((a, b) => a.question_id.localeCompare(b.question_id))
    .map(attempt => [attempt.question_id, attempt.marks_awarded]), [['part-a', 0], ['part-b', 1]]);
});

test('overall-only result leaves per-question scores unknown and keeps existing detail intact', () => {
  const progress = emptyProgress();
  const savedPaper = putExport(progress, snapshot);
  const started = putOfflineAttempt(progress, savedPaper, { newAttemptId: 'paper_attempt-1' });
  const detailed = { mode: 'parts', marks: { 'part-a': 1 }, awarded: 1, maxMarks: 3, percentage: null, unmarked: 1 };
  const saved = putOfflineAttempt(progress, savedPaper, { result: detailed, expectedRevision: started.revision });
  const overall = scoreTestSnapshot(snapshot, { mode: 'overall', total: 2 });
  const latest = putOfflineAttempt(progress, savedPaper, { result: overall, expectedRevision: saved.revision });
  assert.equal(latest.result.mode, 'overall');
  assert.equal(latest.result.marks, undefined);
  assert.deepEqual(latest.previous_part_result.marks, { 'part-a': 1 });
  assert.equal(progress.question_attempts.length, 0);
  assert.equal(progress.paper_attempts.length, 1);
  assert.equal(progress.paper_attempts[0].score_mode, 'overall');
  putOfflineAttempt(progress, savedPaper, { result: detailed, expectedRevision: latest.revision });
  assert.equal(progress.paper_attempts.length, 0);
  assert.deepEqual(progress.question_attempts.map(attempt => [attempt.question_id, attempt.marks_awarded]), [['part-a', 1]]);
});

test('retakes get independent attempt IDs and remote history survives stale progress writes', () => {
  const progress = emptyProgress();
  const savedPaper = putExport(progress, snapshot);
  putOfflineAttempt(progress, savedPaper, { newAttemptId: 'paper_attempt-1' });
  putOfflineAttempt(progress, savedPaper, { newAttemptId: 'paper_attempt-2' });
  assert.deepEqual(progress.sessions.map(session => session.session_id), ['paper_attempt-1', 'paper_attempt-2']);

  const remote = structuredClone(progress);
  remote.sessions[0].revision = 4;
  remote.sessions[0].result = { mode: 'total', total: 2 };
  const staleLocal = structuredClone(progress);
  staleLocal.sessions[0].revision = 2;
  staleLocal.sessions[0].result = { mode: 'total', total: 1 };
  const merged = retainOfflineProgress(staleLocal, remote);
  assert.equal(merged.sessions.find(session => session.session_id === 'paper_attempt-1').revision, 4);
  assert.equal(merged.sessions.find(session => session.session_id === 'paper_attempt-2').revision, 1);
  assert.equal(merged.custom_tests.length, 1);
});

test('marking an explicitly opened attempt after a retake updates only the original attempt', () => {
  const progress = emptyProgress();
  const savedPaper = putExport(progress, snapshot);
  const original = putOfflineAttempt(progress, savedPaper, { newAttemptId: 'paper_original' });
  const retake = putOfflineAttempt(progress, savedPaper, { newAttemptId: 'paper_retake' });
  const result = scoreTestSnapshot(snapshot, { mode: 'overall', total: 0 });
  const first = putOfflineAttempt(progress, savedPaper, { newAttemptId: original.session_id, expectedRevision: original.revision, result });
  const retry = putOfflineAttempt(progress, savedPaper, { newAttemptId: original.session_id, expectedRevision: original.revision, result });
  assert.equal(first, retry);
  assert.equal(progress.sessions[1], retake);
  assert.deepEqual(progress.paper_attempts.map(attempt => attempt.session_id), ['paper_original']);
});

test('removing one question from a marked exported test keeps it removed after a stale sync', () => {
  const progress = emptyProgress();
  const savedPaper = putExport(progress, snapshot);
  const first = putOfflineAttempt(progress, savedPaper, { newAttemptId: 'paper_one' });
  const resolved = new Map([['part-a', {}], ['part-b', {}]]);
  const result = scoreTestSnapshot(snapshot, { mode: 'parts', marks: { 'part-a': 1, 'part-b': 2 } }, resolved);
  putOfflineAttempt(progress, savedPaper, { newAttemptId: 'paper_one', expectedRevision: first.revision, result });
  const stale = structuredClone(progress);
  assert.equal(progress.paper_attempts.length, 1);

  assert.equal(removeOfflinePart(progress, 'paper_one:part-b'), true);
  assert.deepEqual(progress.question_attempts.map(attempt => attempt.attempt_id), ['paper_one:part-a']);
  const session = progress.sessions.find(entry => entry.session_id === 'paper_one');
  assert.deepEqual(session.result.marks, { 'part-a': 1 });
  assert.equal(session.result.awarded, 1);
  assert.equal(session.result.percentage, null);
  assert.equal(progress.paper_attempts.length, 0);

  // A tab still holding the old marks writes later: the removal wins.
  const merged = retainOfflineProgress(stale, progress);
  assert.deepEqual(merged.question_attempts.map(attempt => attempt.attempt_id), ['paper_one:part-a']);

  // Removing the last mark leaves the test recorded but unmarked.
  assert.equal(removeOfflinePart(progress, 'paper_one:part-a'), true);
  const emptied = progress.sessions.find(entry => entry.session_id === 'paper_one');
  assert.equal(emptied.result, null);
  assert.equal(emptied.status, 'completed_on_paper');
  assert.equal(progress.question_attempts.length, 0);
  assert.equal(removeOfflinePart(progress, 'paper_one:part-a'), false);
});
