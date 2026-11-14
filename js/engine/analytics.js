// Data Hub analytics (PRD 4.4): question tracking, topic mastery (RAG) and paper
// history. Pure functions over the user_progress document — no DOM, no storage.

import { DIFFICULTIES, GRADE_SCHEMES, RAG } from '../config/app.config.js';
import { localDayKey, percent, startOfDay, startOfWeek } from '../core/utils.js';

const DAY_MS = 86_400_000;

export const scoreOf = (attempt) => percent(attempt.marks_awarded, attempt.max_marks);

/** 'green' | 'amber' | 'red', or 'none' when there is nothing to judge. */
export function ragFor(percentage, thresholds = RAG) {
  if (percentage == null || Number.isNaN(percentage)) return 'none';
  if (percentage >= thresholds.green) return 'green';
  return percentage >= thresholds.amber ? 'amber' : 'red';
}

/** An explicit valid score; blank or submitted-but-unmarked records are not marks. */
export function hasValidMark(attempt) {
  return Boolean(attempt && Number.isFinite(attempt.marks_awarded) && Number.isFinite(attempt.max_marks) &&
    attempt.max_marks > 0 && attempt.marks_awarded >= 0 && attempt.marks_awarded <= attempt.max_marks);
}

/** Most recent marked attempt per question — "where the student is now". */
export function latestByQuestion(attempts) {
  const latest = new Map();
  for (const attempt of attempts || []) {
    if (!hasValidMark(attempt)) continue;
    const current = latest.get(attempt.question_id);
    if (!current || attempt.timestamp >= current.timestamp) latest.set(attempt.question_id, attempt);
  }
  return latest;
}

export function attemptCounts(attempts) {
  const counts = new Map();
  for (const attempt of attempts || []) counts.set(attempt.question_id, (counts.get(attempt.question_id) || 0) + 1);
  return counts;
}

export function totals(attempts) {
  let awarded = 0;
  let max = 0;
  let count = 0;
  for (const attempt of attempts) {
    awarded += attempt.marks_awarded;
    max += attempt.max_marks;
    count += 1;
  }
  return { count, awarded, max, percentage: max > 0 ? (awarded / max) * 100 : null };
}

/** Accuracy at each difficulty level, in the fixed easy → extra hard order. */
export function byDifficulty(attempts) {
  return DIFFICULTIES.map((difficulty) => {
    const result = totals(attempts.filter((attempt) => attempt.difficulty === difficulty.id));
    return { ...difficulty, ...result, rag: ragFor(result.percentage) };
  });
}

/**
 * Mastery per spec node. Each question's latest attempt is credited to every node its
 * primary spec points belong to (point → topic → section), once per node.
 * @returns Map(nodeId → { count, awarded, max, percentage, rag, byDifficulty })
 */
export function masteryByNode(latestAttempts, questionsById, specIndex) {
  const mastery = new Map();
  for (const attempt of latestAttempts.values()) {
    const question = questionsById.get(attempt.question_id);
    if (!question) continue;
    const credited = new Set();
    for (const tag of question.primary_spec_points || []) {
      for (const node of specIndex.lineage(tag)) credited.add(node.id);
    }
    for (const id of credited) {
      const entry = mastery.get(id) || { count: 0, awarded: 0, max: 0, byDifficulty: {} };
      entry.count += 1;
      entry.awarded += attempt.marks_awarded;
      entry.max += attempt.max_marks;
      const level = (entry.byDifficulty[attempt.difficulty] ||= { awarded: 0, max: 0, count: 0 });
      level.awarded += attempt.marks_awarded;
      level.max += attempt.max_marks;
      level.count += 1;
      mastery.set(id, entry);
    }
  }
  for (const entry of mastery.values()) {
    entry.percentage = entry.max > 0 ? (entry.awarded / entry.max) * 100 : null;
    entry.rag = ragFor(entry.percentage);
  }
  return mastery;
}

/** Questions answered and marks per week for the last `weeks` weeks (oldest first). */
export function weeklyActivity(attempts, weeks = 8, now = new Date()) {
  const thisWeek = startOfWeek(now);
  const buckets = [];
  for (let i = weeks - 1; i >= 0; i--) {
    const start = new Date(thisWeek);
    start.setDate(start.getDate() - i * 7);
    buckets.push({ start: start.getTime(), questions: 0, awarded: 0, max: 0 });
  }
  const byStart = new Map(buckets.map((bucket) => [bucket.start, bucket]));
  for (const attempt of attempts || []) {
    const bucket = byStart.get(startOfWeek(new Date(attempt.timestamp)));
    if (!bucket) continue;
    bucket.questions += 1;
    bucket.awarded += attempt.marks_awarded;
    bucket.max += attempt.max_marks;
  }
  return buckets;
}

/** Consecutive days with at least one attempt, ending today (or yesterday if today is empty). */
export function currentStreak(attempts, now = new Date()) {
  const days = new Set((attempts || []).map((attempt) => localDayKey(attempt.timestamp)));
  let cursor = startOfDay(now);
  if (!days.has(localDayKey(cursor))) cursor -= DAY_MS;
  let streak = 0;
  while (days.has(localDayKey(cursor))) {
    streak += 1;
    cursor -= DAY_MS;
  }
  return streak;
}

/**
 * Indicative grade for a percentage. `boundaries` ([{ grade, min_percentage }]) come from a
 * paper record when real boundaries have been entered; otherwise the generic scheme is used.
 */
export function gradeFor(percentage, schemeKey, boundaries = null) {
  if (percentage == null) return null;
  const scheme = GRADE_SCHEMES[schemeKey];
  const bands = boundaries?.length
    ? [...boundaries].sort((a, b) => b.min_percentage - a.min_percentage).map((b) => [b.grade, b.min_percentage])
    : scheme?.bands;
  if (!bands) return null;
  for (const [grade, minimum] of bands) if (percentage >= minimum) return grade;
  return scheme?.fail || 'U';
}

/** Grades in a scheme, best first (the fail grade last). */
export function gradesIn(schemeKey) {
  const scheme = GRADE_SCHEMES[schemeKey];
  return scheme ? [...scheme.bands.map(([grade]) => grade), scheme.fail] : [];
}

/**
 * A paper grade judged against the student's target grade (owner request, 2026-11-13):
 * above target → 'exceeding', at target → 'secure', one grade below → 'developing',
 * two or more below → 'needs_work'. Null when either grade is missing or unknown.
 */
export function targetBand(grade, target, schemeKey) {
  const order = gradesIn(schemeKey);
  const got = order.indexOf(grade);
  const want = order.indexOf(target);
  if (got < 0 || want < 0) return null;
  if (got < want) return 'exceeding';
  if (got === want) return 'secure';
  return got - want === 1 ? 'developing' : 'needs_work';
}

export const TARGET_BANDS = {
  exceeding: { label: 'Exceeding target', rag: 'blue' },
  secure: { label: 'Secure', rag: 'green' },
  developing: { label: 'Developing', rag: 'amber' },
  needs_work: { label: 'Needs work', rag: 'red' },
};

/** Paper / test attempts, newest first, optionally limited to a subject and paper types. */
export function paperHistory(paperAttempts, { subjectId = null, paperTypes = null } = {}) {
  return (paperAttempts || [])
    .filter((attempt) => (!subjectId || attempt.subject_id === subjectId) && (!paperTypes || paperTypes.includes(attempt.paper_type)))
    .sort((a, b) => (a.timestamp < b.timestamp ? 1 : -1));
}

/** Best and most recent attempt per paper. */
export function paperSummaries(paperAttempts) {
  const summaries = new Map();
  for (const attempt of paperAttempts || []) {
    const entry = summaries.get(attempt.paper_id) || { attempts: 0, best: null, latest: null };
    entry.attempts += 1;
    if (!entry.best || attempt.percentage > entry.best.percentage) entry.best = attempt;
    if (!entry.latest || attempt.timestamp >= entry.latest.timestamp) entry.latest = attempt;
    summaries.set(attempt.paper_id, entry);
  }
  return summaries;
}
