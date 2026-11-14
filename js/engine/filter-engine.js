// Advanced Topic & Crossover Filtering Engine (PRD 4.1) plus difficulty, marks,
// status and source filters (PRD 4.2, 4.4). Pure functions — no DOM, no storage.
//
// THE RULE: a question is only offered when every one of its primary_spec_points AND
// every one of its crossover_spec_points is in the student's learned list. A topic-level
// tag counts as learned only when all of that topic's spec points are learned.

import { RAG } from '../config/app.config.js';
import { hasValidMark } from './analytics.js';

/** Every leaf spec point a student must have learned to be given this question. */
export function requiredSpecPoints(question, specIndex) {
  return specIndex.expand([...(question.primary_spec_points || []), ...(question.crossover_spec_points || [])]);
}

/** The required spec points that are NOT yet learned (empty array = question is available). */
export function missingSpecPoints(question, learned, specIndex) {
  const missing = [];
  for (const id of requiredSpecPoints(question, specIndex)) if (!learned.has(id)) missing.push(id);
  return missing;
}

export const isUnlocked = (question, learned, specIndex) => missingSpecPoints(question, learned, specIndex).length === 0;

/** 'unseen' | 'green' | 'amber' | 'red' — from the student's most recent attempt. */
export function questionStatus(question, latestAttempts, thresholds = RAG) {
  const attempt = latestAttempts?.get(question.question_id);
  if (!hasValidMark(attempt)) return 'unseen';
  const score = attempt.max_marks > 0 ? (attempt.marks_awarded / attempt.max_marks) * 100 : 0;
  if (score >= thresholds.green) return 'green';
  return score >= thresholds.amber ? 'amber' : 'red';
}

/** A saved score is distinct from a view, a skipped item, or submitted work without a mark. */
export function markStatus(question, latestAttempts) {
  const attempt = latestAttempts?.get(question.question_id);
  if (!hasValidMark(attempt)) return 'unmarked';
  return attempt.marks_awarded === attempt.max_marks ? 'full' : 'lost';
}

const toSet = (value) => (value == null ? null : value instanceof Set ? value : new Set(value));
const nonEmpty = (set) => (set && set.size ? set : null);
const DIFFICULTY_ORDER = { easy: 0, medium: 1, hard: 2, extra_hard: 3 };

// Explicitly empty focus/range selections match nothing, including in 'all' mode.
function touchesSelection(points, selected, mode) {
  if (!selected.size) return false;
  if (mode === 'all') {
    for (const id of selected) if (!points.has(id)) return false;
    return true;
  }
  for (const id of selected) if (points.has(id)) return true;
  return false;
}

function sortMatches(matches, sortBy, specIndex, papersById, shuffleSeed) {
  if (!sortBy || sortBy === 'paper_order') return matches;
  if (sortBy === 'shuffle') {
    // Stable across rerenders and pagination; changing the seed deliberately reshuffles.
    const hash = (id) => {
      let n = 2166136261;
      for (const c of `${shuffleSeed ?? 0}:${id}`) n = Math.imul(n ^ c.charCodeAt(0), 16777619);
      return n >>> 0;
    };
    return matches.sort((a, b) => hash(a.question_id) - hash(b.question_id) || String(a.question_id).localeCompare(String(b.question_id)));
  }
  if (sortBy === 'newest' || sortBy === 'oldest') {
    const direction = sortBy === 'newest' ? -1 : 1;
    const seriesRank = { january: 1, february: 2, march: 3, april: 4, may: 5, june: 6, july: 7, august: 8, september: 9, october: 10, november: 11, december: 12, spring: 4, summer: 6, autumn: 10, winter: 12 };
    const paperGroups = new Map();
    for (const question of matches) {
      if (!paperGroups.has(question.paper_id)) paperGroups.set(question.paper_id, []);
      paperGroups.get(question.paper_id).push(question);
    }
    const questionOrder = new Map();
    for (const [paperId, questions] of paperGroups) {
      const ids = papersById.get(paperId)?.question_ids || [];
      const usePaperOrder = questions.every((question) => ids.includes(question.question_id));
      questions.forEach((question, i) => questionOrder.set(question, usePaperOrder ? ids.indexOf(question.question_id) : i));
    }
    return matches.sort((a, b) => {
      const pa = papersById.get(a.paper_id), pb = papersById.get(b.paper_id);
      const ya = Number.isInteger(pa?.year) ? pa.year : null, yb = Number.isInteger(pb?.year) ? pb.year : null;
      if (ya == null || yb == null) {
        if (ya !== yb) return ya == null ? 1 : -1;
      } else if (ya !== yb) return direction * (ya - yb);
      const sa = seriesRank[String(pa?.series || '').toLowerCase()], sb = seriesRank[String(pb?.series || '').toLowerCase()];
      if ((sa == null) !== (sb == null)) return sa == null ? 1 : -1;
      if (sa != null && sb != null && sa !== sb) return direction * (sa - sb);
      if (a.paper_id !== b.paper_id) return String(a.paper_id || '').localeCompare(String(b.paper_id || ''), undefined, { numeric: true });
      return questionOrder.get(a) - questionOrder.get(b);
    });
  }
  let key;
  if (sortBy === 'spec') {
    // Keep subject groups in pool order. Within a subject, use the first primary
    // leaf in authored order; crossover tags do not move a question's position.
    const subjects = new Map();
    const positions = new Map();
    const keys = new Map();
    for (const question of matches) {
      const primary = specIndex.expand(question.primary_spec_points);
      const subjectId = question.subject_id || [...primary].map((id) => specIndex.subjectOf(id)).find(Boolean);
      if (subjectId && !subjects.has(subjectId)) {
        subjects.set(subjectId, subjects.size);
        positions.set(subjectId, new Map(specIndex.subjectLeaves(subjectId).map((id, index) => [id, index])));
      }
      const ranks = positions.get(subjectId);
      let first = Infinity;
      for (const id of primary) first = Math.min(first, ranks?.get(id) ?? Infinity);
      keys.set(question, [first === Infinity ? Infinity : subjects.get(subjectId), first]);
    }
    return matches.sort((a, b) => {
      const left = keys.get(a);
      const right = keys.get(b);
      return (left[0] - right[0] || left[1] - right[1] || 0);
    });
  }
  if (sortBy === 'difficulty') key = (question) => DIFFICULTY_ORDER[question.difficulty] ?? Infinity;
  if (sortBy === 'marks_asc' || sortBy === 'marks_desc') {
    key = (question) => Number.isFinite(question.marks) ? question.marks * (sortBy === 'marks_desc' ? -1 : 1) : Infinity;
  }
  if (key) matches.sort((a, b) => key(a) - key(b) || 0);
  return matches;
}

/**
 * @param {object[]} questions  the unified question pool (any source types)
 * @param {object} criteria
 *   sourceTypes   Iterable<string>   allowed source_type values (null = any)
 *   poolOnly      boolean            respect include_in_custom_pool (default true)
 *   learnedOnly   boolean            apply the learned-topics rule (default true)
 *   focus         Iterable<string>   topic / spec point ids to practise: a question matches
 *                                    when one of its PRIMARY spec points is in the focus
 *   focusMode     'any' | 'all'       require any or every expanded selected leaf (default any)
 *   focusScope    'primary' | 'primary_and_crossover' (default primary)
 *   specRange     {subjectId,fromId,toId} inclusive authored range; ANDed with focus
 *   difficulties  Iterable<string>   easy | medium | hard | extra_hard
 *   markBands     [{min,max}]        any band may match
 *   statuses      Iterable<string>   unseen | green | amber | red
 *   paperIds      Iterable<string>
 *   years         Iterable<number>   parent-paper exam years
 *   series        Iterable<string>   parent-paper series
 *   tiers         Iterable<string>   question tier override, otherwise parent-paper tier
 *   sampleMode    'all' | 'hide' | 'only' (default all)
 *   selectionMode 'strict' | 'crossover': assessed overlap, optionally requiring every
 *                 required assessed/crossover point to be inside each active selection.
 *   curriculumPoints Iterable<string> primary assessed points covered by a verified
 *                 year/chapter view; ANDed with any explicit search selection.
 *   markStatuses  Iterable<string>   unmarked | marked | lost | full; any may match, empty = all
 *   markStatus    'all' | 'unmarked' | 'marked' | 'lost' | 'full' (legacy single selection)
 *   sortBy        'newest' | 'oldest' | 'shuffle' | 'paper_order' | 'spec' | 'difficulty' | 'marks_asc' | 'marks_desc'
 *   shuffleSeed   stable seed for the shuffle order
 *   search        string             matches question text, number and paper id
 * @param {object} context  { specIndex, learned:Set, latestAttempts:Map, papersById?:Map }
 * @returns {{ matches: object[], locked: {question, missing}[], total: number }}
 *   `locked` holds questions that pass every other filter but need unlearned spec points.
 */
export function filterQuestions(questions, criteria = {}, context) {
  const { specIndex, learned = new Set(), latestAttempts = new Map(), papersById = new Map() } = context;
  const sourceTypes = nonEmpty(toSet(criteria.sourceTypes));
  const difficulties = nonEmpty(toSet(criteria.difficulties));
  const statuses = nonEmpty(toSet(criteria.statuses));
  const markStatuses = nonEmpty(toSet(criteria.markStatuses ??
    (criteria.markStatus && criteria.markStatus !== 'all' ? [criteria.markStatus] : null)));
  const paperIds = nonEmpty(toSet(criteria.paperIds));
  const years = nonEmpty(toSet(criteria.years));
  const series = nonEmpty(toSet(criteria.series));
  const tiers = nonEmpty(toSet(criteria.tiers));
  const focus = criteria.focus == null ? null : specIndex.expand(criteria.focus);
  const curriculumPoints = criteria.curriculumPoints == null ? null : specIndex.expand(criteria.curriculumPoints);
  const range = criteria.specRange == null ? null : specIndex.range(
    criteria.specRange.subjectId, criteria.specRange.fromId, criteria.specRange.toId,
  );
  const bands = criteria.markBands?.length ? criteria.markBands : null;
  const search = (criteria.search || '').trim().toLowerCase();
  const poolOnly = criteria.poolOnly !== false;
  const learnedOnly = criteria.learnedOnly !== false;

  const matches = [];
  const locked = [];
  for (const question of questions) {
    if (poolOnly && question.include_in_custom_pool === false) continue;
    if (criteria.sampleMode === 'hide' && question.is_sample === true) continue;
    if (criteria.sampleMode === 'only' && question.is_sample !== true) continue;
    if (sourceTypes && !sourceTypes.has(question.source_type)) continue;
    if (paperIds && !paperIds.has(question.paper_id)) continue;
    const paper = papersById.get(question.paper_id);
    if (years && (paper?.year == null || !years.has(paper.year))) continue;
    if (series && (paper?.series == null || !series.has(paper.series))) continue;
    const tier = question.tier !== undefined ? question.tier : paper?.tier;
    if (tiers && (tier == null || !tiers.has(tier))) continue;
    if (difficulties && !difficulties.has(question.difficulty)) continue;
    if (bands && !bands.some((band) => question.marks >= band.min && question.marks <= band.max)) continue;
    if (curriculumPoints && !touchesSelection(specIndex.expand(question.primary_spec_points || []), curriculumPoints, 'any')) continue;
    if (focus || range) {
      if (criteria.selectionMode === 'strict' || criteria.selectionMode === 'crossover') {
        const assessed = specIndex.expand(question.primary_spec_points || []);
        const required = requiredSpecPoints(question, specIndex);
        const fits = (selection) => touchesSelection(assessed, selection, 'any') &&
          (criteria.selectionMode !== 'strict' || [...required].every((id) => selection.has(id)));
        if (focus && !fits(focus)) continue;
        if (range && !fits(range)) continue;
      } else {
        const tags = [...(question.primary_spec_points || [])];
        if (criteria.focusScope === 'primary_and_crossover') tags.push(...(question.crossover_spec_points || []));
        const points = specIndex.expand(tags);
        if (focus && !touchesSelection(points, focus, criteria.focusMode)) continue;
        if (range && !touchesSelection(points, range, criteria.focusMode)) continue;
      }
    }
    if (statuses && !statuses.has(questionStatus(question, latestAttempts))) continue;
    if (markStatuses) {
      const status = markStatus(question, latestAttempts);
      if (!markStatuses.has(status) && !(markStatuses.has('marked') && status !== 'unmarked')) continue;
    }
    if (search) {
      const specText = [...(question.primary_spec_points || []), ...(question.crossover_spec_points || [])]
        .map((id) => specIndex.label(id)).join(' ');
      const haystack = `${question.question_number} ${question.part_label || ''} ${question.paper_id || ''} ${question.content?.question_html || ''} ${specText}`
        .replace(/<[^>]+>/g, ' ')
        .toLowerCase();
      if (!haystack.includes(search)) continue;
    }
    if (learnedOnly) {
      const missing = missingSpecPoints(question, learned, specIndex);
      if (missing.length) {
        locked.push({ question, missing });
        continue;
      }
    }
    matches.push(question);
  }
  return { matches: sortMatches(matches, criteria.sortBy, specIndex, papersById, criteria.shuffleSeed), locked, total: questions.length };
}

/**
 * Which unlearned spec points are holding back the most questions?
 * `unlocks` = questions that need ONLY this spec point; `needed_by` = questions that need it at all.
 */
export function unlockSuggestions(locked, limit = 5) {
  const tally = new Map();
  for (const { missing } of locked) {
    for (const id of missing) {
      const entry = tally.get(id) || { id, unlocks: 0, needed_by: 0 };
      entry.needed_by += 1;
      if (missing.length === 1) entry.unlocks += 1;
      tally.set(id, entry);
    }
  }
  return [...tally.values()].sort((a, b) => b.unlocks - a.unlocks || b.needed_by - a.needed_by).slice(0, limit);
}

/** How many pool questions have each spec node (point, topic or section) among their primary tags. */
export function countByNode(questions, specIndex) {
  const counts = new Map();
  for (const question of questions) {
    const seen = new Set();
    for (const tag of question.primary_spec_points || []) {
      for (const node of specIndex.lineage(tag)) seen.add(node.id);
    }
    for (const id of seen) counts.set(id, (counts.get(id) || 0) + 1);
  }
  return counts;
}

/** Spec points from OTHER subjects that this subject's questions rely on (crossover knowledge). */
export function foreignSpecPoints(questions, subjectId, specIndex) {
  const foreign = new Map(); // leaf id → number of questions needing it
  for (const question of questions) {
    for (const id of requiredSpecPoints(question, specIndex)) {
      const owner = specIndex.subjectOf(id);
      if (owner && owner !== subjectId) foreign.set(id, (foreign.get(id) || 0) + 1);
    }
  }
  return foreign;
}
