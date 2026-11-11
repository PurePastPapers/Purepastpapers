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

/**
 * Completes a session and records the results in the Data Hub.
 * Papers and tests count every question (unmarked = 0); question sets count only what was marked.
 * @param {object} session
 * @param {{ questions: object[], subject: object, paper?: object, totalAwarded?: number }} context
 */
export async function finishSession(session, { questions, subject, paper = null, totalAwarded = null }) {
  pauseTimer(session);
  const now = new Date().toISOString();
  const provider = getMarkingProvider();
  const countsAll = LOGS_PAPER.has(session.kind);
  const scored = countsAll ? questions : questions.filter((question) => session.marks[question.question_id] != null);

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
      source_type: question.source_type,
      difficulty: question.difficulty,
      marks_awarded: mark.marks_awarded,
      max_marks: mark.max_marks,
      timestamp: now,
      // extras used by the Data Hub
      subject_id: session.subject_id,
      session_id: session.session_id,
      marked_by: mark.marked_by,
    });
  }

  let awarded = sum(questionAttempts, (attempt) => attempt.marks_awarded);
  let max = sum(questionAttempts, (attempt) => attempt.max_marks);
  if (!questions.length && session.total_marks) {
    // A paper sat from its PDF: one total is entered instead of per-question marks.
    max = session.total_marks;
    awarded = Math.min(max, Math.max(0, Math.round(Number(totalAwarded) || 0)));
  }
  const percentage = max > 0 ? round1(percent(awarded, max)) : 0;
  const graded = LOGS_PAPER.has(session.kind) && max > 0;
  const grade = graded ? gradeFor(percentage, subject.grade_scheme, paper?.grade_boundaries) : null;

  session.status = 'completed';
  session.completed_at = now;
  session.result = {
    marks_awarded: awarded,
    max_marks: max,
    percentage,
    grade,
    questions_marked: questionAttempts.length,
    duration_seconds: Math.round(elapsedMs(session) / 1000),
  };

  const logsPaper = max > 0 && (LOGS_PAPER.has(session.kind) || (session.kind === 'question_set' && questionAttempts.length >= 2));
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

  await api.commitSessionResult(session, questionAttempts, paperAttempt);
  return session.result;
}
