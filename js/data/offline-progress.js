import { uid } from '../core/utils.js';

export const isExportedTest = (test) => test.snapshot?.version === 1;
export const isOfflineSession = (session) => session.kind === 'offline_test';

export function putExport(doc, snapshot, now = new Date().toISOString()) {
  const existing = doc.custom_tests.find(test => test.paper_id === snapshot.id);
  if (existing) return existing;
  const paper = {
    paper_id: snapshot.id, paper_type: 'user_custom_test', subject_id: snapshot.subjectId,
    title: snapshot.title, created_at: now, total_marks: snapshot.totalMarks,
    question_ids: snapshot.groups.flatMap(group => group.parts.map(part => part.id)),
    snapshot,
  };
  doc.custom_tests.push(paper);
  return paper;
}

export function putOfflineAttempt(doc, paper, { newAttemptId, result, expectedRevision }, now = new Date().toISOString()) {
  const latest = doc.sessions.filter(session => isOfflineSession(session) && session.paper_id === paper.paper_id).at(-1);
  const id = newAttemptId || latest?.session_id || `paper_${paper.paper_id}`;
  const current = doc.sessions.find(session => session.session_id === id && session.paper_id === paper.paper_id);
  if (!result && current) return current;
  if (result && (!current || (current.revision !== expectedRevision
    && JSON.stringify(current.result) !== JSON.stringify(result)))) {
    throw new Error('This attempt changed on another device. Reopen it to see the latest marks.');
  }
  if (result && JSON.stringify(current.result) === JSON.stringify(result)) return current;
  const previousDetail = current?.result?.mode === 'parts' ? current.result : current?.previous_part_result;
  const session = {
    session_id: id, kind: 'offline_test', paper_id: paper.paper_id, subject_id: paper.subject_id, title: paper.title,
    question_ids: paper.question_ids, total_marks: paper.total_marks, status: result ? 'completed' : 'completed_on_paper',
    started_at: current?.started_at || now, completed_at: current?.completed_at || now,
    revision: (current?.revision || 0) + 1, result: result || null,
    ...(result?.mode === 'overall' && previousDetail ? { previous_part_result: previousDetail } : {}),
  };
  const index = doc.sessions.findIndex(candidate => candidate.session_id === id);
  if (index < 0) doc.sessions.push(session);
  else doc.sessions[index] = session;
  if (!result) return session;
  doc.question_attempts = doc.question_attempts.filter(attempt => attempt.session_id !== id);
  const parts = new Map(paper.snapshot.groups.flatMap(group => group.parts.map(part => [part.id, part])));
  for (const [partId, marks] of Object.entries(result.marks || {})) {
    const part = parts.get(partId);
    doc.question_attempts.push({
      attempt_id: `${id}:${partId}`, session_id: id, question_id: result.canonicalIds?.[partId] || partId,
      subject_id: paper.subject_id, marks_awarded: marks, max_marks: part.maxMarks, timestamp: now,
      source_type: part.sourceType, difficulty: part.difficulty, marked_by: result.markedBy || 'self',
    });
  }
  doc.paper_attempts = doc.paper_attempts.filter(attempt => attempt.session_id !== id);
  if (result.percentage != null) doc.paper_attempts.push({
    paper_id: paper.paper_id, session_id: id, paper_type: paper.paper_type, subject_id: paper.subject_id,
    title: paper.title, marks_awarded: result.awarded, max_marks: result.maxMarks,
    percentage: result.percentage, timestamp: now, session_kind: 'offline_test', score_mode: result.mode,
  });
  return session;
}

export const offlineRetakeId = () => uid('paper');

/** A general progress write may originate on a tab whose offline paper history is older. */
export function retainOfflineProgress(local, remote) {
  if (!remote) return local;
  const exports = new Map((local.custom_tests || []).map(test => [test.paper_id, test]));
  for (const test of (remote.custom_tests || []).filter(isExportedTest)) exports.set(test.paper_id, test);
  const remoteSessions = new Map((remote.sessions || []).filter(isOfflineSession).map(session => [session.session_id, session]));
  const sessions = new Map((local.sessions || []).map(session => [session.session_id, session]));
  for (const [id, session] of remoteSessions) {
    if ((sessions.get(id)?.revision || 0) <= session.revision) sessions.set(id, session);
  }
  const attempts = (key) => [
    ...(local[key] || []).filter(attempt => sessions.get(attempt.session_id) !== remoteSessions.get(attempt.session_id) || !remoteSessions.has(attempt.session_id)),
    ...(remote[key] || []).filter(attempt => remoteSessions.has(attempt.session_id) && sessions.get(attempt.session_id) === remoteSessions.get(attempt.session_id)),
  ];
  return { ...local, custom_tests: [...exports.values()], sessions: [...sessions.values()],
    question_attempts: attempts('question_attempts'), paper_attempts: attempts('paper_attempts') };
}
