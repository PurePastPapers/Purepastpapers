// Practice sessions: one model for full papers, customisable timed tests, question sets
// (the humanities picker) and single questions. A session records answers, marks and
// timing while in progress; finishing it writes question_attempts and paper_attempts.

import { percent, round1, sum, uid } from '../core/utils.js';
import { gradeFor } from '../engine/analytics.js';
import { getMarkingProvider } from '../engine/marking.js';
import * as api from './api.js';

/**
 * kind        'full_paper' | 'custom_test' | 'question_set' | 'single'
 * mark_mode   'end'  = answer everything, then mark against the mark scheme (papers, tests)
 *             'each' = reveal the mark scheme and mark each question as you go
 * timer       'countdown' (needs time_limit_minutes) | 'stopwatch' | 'off'
 */
export function createSession({
  kind,
  subject_id,
  title,
  question_ids = [],
  paper_id = null,
  paper_type = null,
  time_limit_minutes = null,
  timer = 'off',
  mark_mode = 'each',
  total_marks = null,
}) {
  return {
    session_id: uid('ses'),
    kind,
    subject_id,
    title,
    paper_id,
    paper_type,
    question_ids,
    total_marks, // only used for papers with no extracted questions (marks entered as one total)
    time_limit_minutes,
    timer: { mode: timer, elapsed_ms: 0, running_since: null },
    mark_mode,
    answers: {}, // question_id → typed answer (kept for review now, AI marking in Phase 4)
    flagged: {},
    marks: {}, // question_id → marks awarded
    current_index: 0,
    status: 'in_progress', // 'in_progress' → 'marking' → 'completed'
    started_at: new Date().toISOString(),
    completed_at: null,
    result: null,
  };
}

/** Start a fresh attempt with the same paper, questions and timing settings. */
export function retrySession(session) {
  const retry = createSession({
    kind: session.kind,
    subject_id: session.subject_id,
    title: session.title,
    question_ids: [...session.question_ids],
    paper_id: session.paper_id,
    paper_type: session.paper_type,
    time_limit_minutes: session.time_limit_minutes,
    timer: session.timer.mode,
    mark_mode: session.mark_mode,
    total_marks: session.total_marks,
  });
  if (session.source_paper_id) retry.source_paper_id = session.source_paper_id;
  return retry;
}

// ── timer ──

export function elapsedMs(session, now = Date.now()) {
  const { elapsed_ms, running_since } = session.timer;
  return elapsed_ms + (running_since ? now - running_since : 0);
}

export const isRunning = (session) => Boolean(session.timer.running_since);

export function startTimer(session, now = Date.now()) {
  if (session.timer.mode !== 'off' && !session.timer.running_since) session.timer.running_since = now;
}

export function pauseTimer(session, now = Date.now()) {
  if (!session.timer.running_since) return;
  session.timer.elapsed_ms += now - session.timer.running_since;
  session.timer.running_since = null;
}

/** Seconds left on a countdown (negative once over time); null when there is no limit. */
export function remainingSeconds(session, now = Date.now()) {
  if (session.timer.mode !== 'countdown' || !session.time_limit_minutes) return null;
  return session.time_limit_minutes * 60 - elapsedMs(session, now) / 1000;
}

// ── finishing ──

const LOGS_PAPER = new Set(['full_paper', 'custom_test']);
const pendingResults = new WeakMap();

/**
 * Completes a session and records the results in the Data Hub.
 * Only deliberate marks create attempts; unmarked questions are left out of the score,
 * but their typed answers are saved to mark later.
 * @param {object} session
 * @param {{ questions: object[], subject: object, paper?: object, totalAwarded?: number }} context
 */
export function finishSession(session, context) {
  const pending = pendingResults.get(session);
  if (pending) return pending;
  const result = (async () => {
    // If the progress write failed, the result and attempts are already in the in-memory
    // document. Save that document again without adding another set of attempts.
    if (session.status === 'completed' && session.result) {
      await api.saveSession(session);
      return session.result;
    }
    return recordResult(session, context);
  })().finally(() => pendingResults.delete(session));
  pendingResults.set(session, result);
  return result;
}

async function recordResult(session, { questions, subject, paper = null, totalAwarded = null }) {
  pauseTimer(session);
  const now = new Date().toISOString();
  const provider = getMarkingProvider();
  const scored = questions.filter((question) => Number.isInteger(session.marks[question.question_id]) && session.marks[question.question_id] >= 0 && session.marks[question.question_id] <= question.marks);
  const unmarked = questions.length - scored.length;

  const questionAttempts = [];
  for (const question of scored) {
    const mark = await provider.mark({
      question,
      answerText: session.answers[question.question_id] || '',
      marksAwarded: session.marks[question.question_id] ?? 0,
    });
    session.marks[question.question_id] = mark.marks_awarded;
    questionAttempts.push({
      // PRD 8.4 fields
      question_id: question.question_id,
      // A go saved earlier and opened to be marked keeps its id, so marking it replaces the waiting copy.
      ...(session.attempt_ids?.[question.question_id] ? { attempt_id: session.attempt_ids[question.question_id] } : {}),
      source_type: question.source_type,
      difficulty: question.difficulty,
      marks_awarded: mark.marks_awarded,
      max_marks: mark.max_marks,
      timestamp: now,
      // extras used by the Data Hub
      subject_id: session.subject_id,
      session_id: session.session_id,
      marked_by: mark.marked_by,
      ...(session.ink_answers?.[question.question_id] ? { has_ink: true } : {}),
      ...(String(session.answers?.[question.question_id] || '').trim() ? { answer: session.answers[question.question_id] } : {}),
    });
  }

  let awarded = sum(questionAttempts, (attempt) => attempt.marks_awarded);
  let max = sum(questionAttempts, (attempt) => attempt.max_marks);
  if (!questions.length && session.total_marks && totalAwarded != null) {
    // A paper sat from its PDF: one total is entered instead of per-question marks.
    max = session.total_marks;
    awarded = Math.min(max, Math.max(0, Math.round(Number(totalAwarded) || 0)));
  }
  const percentage = max > 0 ? round1(percent(awarded, max)) : 0;
  const graded = LOGS_PAPER.has(session.kind) && max > 0 && unmarked === 0;
  // Unit grades only exist when the exact paper/series boundaries are present; gradeFor
  // returns null for OCR CTEC units with no such boundaries.
  const grade = graded ? gradeFor(percentage, subject.grade_scheme, paper?.grade_boundaries) : null;

  session.status = 'completed';
  session.completed_at = now;
  session.result = {
    marks_awarded: awarded,
    max_marks: max,
    percentage,
    grade,
    questions_marked: questionAttempts.length,
    questions_unmarked: unmarked,
    duration_seconds: Math.round(elapsedMs(session) / 1000),
  };

  const logsPaper = max > 0 && unmarked === 0 && (LOGS_PAPER.has(session.kind) || (session.kind === 'question_set' && questionAttempts.length >= 2));
  const paperAttempt = logsPaper
    ? {
        // PRD 8.4 fields
        paper_id: session.paper_id || session.session_id,
        paper_type: session.paper_type || 'user_custom_test',
        marks_awarded: awarded,
        max_marks: max,
        percentage,
        timestamp: now,
        // extras used by the Data Hub
        subject_id: session.subject_id,
        title: session.title,
        session_id: session.session_id,
        session_kind: session.kind,
        duration_seconds: session.result.duration_seconds,
        grade,
      }
    : null;

  // Answers left unmarked are not kept as separate "mark later" records: an unmarked question is just skipped.
  const unmarkedAnswers = [];
  session.result.answers_saved_unmarked = 0;

  await api.commitSessionResult(session, questionAttempts, paperAttempt, unmarkedAnswers);
  return session.result;
}
