// Customisable Timed Test builder (PRD 4.3). Given an already-filtered pool of
// questions, picks a set whose estimated time adds up to the requested length,
// spread across topics, at the requested difficulty (or a balanced mix).
//
// Deterministic for a given seed, so "Shuffle" = new seed and a test can be rebuilt.

import { MIXED_RATIO, RAG } from '../config/app.config.js';
import { mulberry32, sum } from '../core/utils.js';

const DIFFICULTY_ORDER = { easy: 0, medium: 1, hard: 2, extra_hard: 3 };

export const minutesOf = (question) => question.estimated_minutes || Math.max(1, Math.round((question.marks || 1) * 1.2));

/**
 * @param {object[]} pool  questions that already passed the filter engine
 * @param {object} options
 *   minutes         target length of the test
 *   difficulty      'mixed' | 'easy' | 'medium' | 'hard' | 'extra_hard'
 *   seed            integer
 *   latestAttempts  Map(question_id → attempt) to favour unseen questions
 *   preferUnseen    de-prioritise questions already answered well (default true)
 *   prioritiseWeak  put questions previously scored below green first (default false)
 *   topicOf         (question) → key used to spread the test across topics
 */
export function buildTest(pool, options) {
  const {
    minutes,
    difficulty = 'mixed',
    seed = 1,
    latestAttempts = new Map(),
    preferUnseen = true,
    prioritiseWeak = false,
    ratio = MIXED_RATIO,
    topicOf = (question) => question.primary_spec_points?.[0] ?? '',
    trials = 60,
  } = options;

  const allowed = difficulty === 'mixed' ? Object.keys(ratio) : [difficulty];
  const candidates = pool.filter((question) => allowed.includes(question.difficulty));
  const branchMinutes = new Map();
  const availableMinutes = sum(candidates, (question) => {
    const root = question.linked_group?.root_id;
    if (!root) return minutesOf(question);
    const previous = branchMinutes.get(root) || 0;
    const maximum = Math.max(previous, minutesOf(question));
    branchMinutes.set(root, maximum);
    return maximum - previous;
  });
  const tolerance = Math.max(2, Math.round(minutes * 0.06));

  const priorities = new Map(candidates.map((question) => [question.question_id, questionPriority(question)]));
  const priority = (question) => priorities.get(question.question_id);

  function questionPriority(question) {
    const ids = question.part_ids || [question.question_id];
    const attempts = ids.map((id) => latestAttempts.get(id));
    if (attempts.some((attempt) => !attempt)) return 0; // unseen or incomplete linked question
    const maxMarks = sum(attempts, (attempt) => attempt.max_marks);
    const score = maxMarks > 0 ? (sum(attempts, (attempt) => attempt.marks_awarded) / maxMarks) * 100 : 0;
    const weak = score < RAG.green;
    if (prioritiseWeak && weak) return -1;
    if (!preferUnseen) return 0;
    return weak ? 1 : 2.5;
  }

  let best = null;
  for (let trial = 0; trial < trials && candidates.length; trial++) {
    const random = mulberry32((seed + trial * 7919) >>> 0);
    const attempt = assemble({ candidates, minutes, tolerance, mixed: difficulty === 'mixed', ratio, random, priority, topicOf });
    if (!best || attempt.score < best.score) best = attempt;
  }

  const chosen = best?.questions || [];
  // An essay can take longer than the smallest duration setting. Offer the
  // shortest matching question and give the student enough time to answer it.
  const oversized = !chosen.length && candidates.reduce((shortest, question) =>
    !shortest || minutesOf(question) < minutesOf(shortest) ? question : shortest, null);
  const questions = (oversized ? [oversized] : chosen).sort(
    (a, b) =>
      DIFFICULTY_ORDER[a.difficulty] - DIFFICULTY_ORDER[b.difficulty] ||
      a.marks - b.marks ||
      a.question_id.localeCompare(b.question_id),
  );
  const totalMinutes = sum(questions, minutesOf);
  const mix = {};
  for (const question of questions) mix[question.difficulty] = (mix[question.difficulty] || 0) + 1;

  return {
    questions,
    question_ids: questions.map((question) => question.question_id),
    total_minutes: totalMinutes,
    total_marks: sum(questions, (question) => question.marks),
    target_minutes: minutes,
    time_limit_minutes: oversized ? Math.ceil(totalMinutes) : minutes,
    available_minutes: availableMinutes,
    candidate_count: candidates.length,
    // true when the pool simply does not hold enough matching questions to fill the time
    short: totalMinutes < minutes - tolerance,
    mix,
    seed,
  };
}

function assemble({ candidates, minutes, tolerance, mixed, ratio, random, priority, topicOf }) {
  const chosen = [];
  const used = new Set();
  const usedParts = new Set();
  const perTopic = new Map();
  let total = 0;
  let staleness = 0;

  // Repeatedly take the best-ranked question that still fits the remaining budget.
  const fill = (bucket, budget) => {
    let remaining = budget;
    for (;;) {
      let pick = null;
      let pickWeight = Infinity;
      for (const question of bucket) {
        if (used.has(question.question_id) || minutesOf(question) > remaining
          || (question.part_ids || [question.question_id]).some((id) => usedParts.has(id))) continue;
        const weight = priority(question) + random() + 0.75 * (perTopic.get(topicOf(question)) || 0);
        if (weight < pickWeight) {
          pickWeight = weight;
          pick = question;
        }
      }
      if (!pick) return;
      used.add(pick.question_id);
      for (const id of pick.part_ids || [pick.question_id]) usedParts.add(id);
      chosen.push(pick);
      remaining -= minutesOf(pick);
      total += minutesOf(pick);
      perTopic.set(topicOf(pick), (perTopic.get(topicOf(pick)) || 0) + 1);
      staleness += Math.max(0, priority(pick));
    }
  };

  if (mixed) {
    for (const [level, share] of Object.entries(ratio)) {
      fill(candidates.filter((question) => question.difficulty === level), minutes * share);
    }
  }
  fill(candidates, minutes + tolerance - total); // top up with anything that still fits

  const repeats = sum([...perTopic.values()], (count) => Math.max(0, count - 1));
  return { questions: chosen, score: Math.abs(minutes - total) + repeats * 0.15 + staleness * 0.2 };
}
