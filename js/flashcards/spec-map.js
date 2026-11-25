// Links PurePastPapers flashcard tags to the site's spec points, so a set can follow
// the spec points a student has ticked in My subjects. Pure functions, no DOM.
//
// The catalogue decks tag cards in a few house styles:
//   AQA        PPP::Spec::AQA_PSYCH_4.1.1_b01  → AQA_PSYCH_4.1.1_b1
//   Biology    spec::1.4::ii                   → EDX_BIOL_OFF_T1_1.4
//   Physics    spec::002                       → EDX_PHYS_S002
//   AS Maths   spec::2.3                       → the Pure point whose id ends _2.3
// Tags that match no spec point (command words, notation appendices, core
// practicals) are "exam skills": they are not tied to a topic.

const SPEC_TAG = /^(?:ppp::)?spec::(.+)$/i;

export const isSpecTag = (tag) => SPEC_TAG.test(String(tag));

const RULES = {
  EDX_ALEVEL_BIOL_9BN0: (value) => {
    const match = /^(\d+)\.(\d+)(?:::|$)/.exec(value);
    return match ? [`EDX_BIOL_OFF_T${match[1]}_${match[1]}.${match[2]}`] : [];
  },
  EDX_ALEVEL_PHYS_9PH0: (value) => {
    const match = /^(\d{3})(?:::|$)/.exec(value);
    return match ? [`EDX_PHYS_S${match[1]}`] : [];
  },
  EDX_ALEVEL_MATH_9MA0: (value, leaves) => {
    const match = /^(\d+\.\d+)(?:::|$)/.exec(value);
    return match ? leaves.filter((id) => id.startsWith('EDX_MATH_PURE_') && id.endsWith(`_${match[1]}`)) : [];
  },
};

/**
 * A function from a card tag to the leaf spec points it covers (empty when the tag
 * is not a spec tag or matches nothing in this subject).
 */
export function createTagMapper(subjectId, specIndex) {
  const leaves = specIndex.subjectLeaves(subjectId);
  const known = new Set(leaves);
  const rule = RULES[subjectId];
  const cache = new Map();
  return (tag) => {
    if (cache.has(tag)) return cache.get(tag);
    const value = SPEC_TAG.exec(String(tag))?.[1]?.trim() || '';
    let ids = [];
    if (value) {
      const direct = value.replace(/_b0*(\d+)$/, '_b$1');
      if (specIndex.has(direct) && specIndex.subjectOf(direct) === subjectId) ids = [direct];
      else if (rule) ids = rule(value, leaves);
    }
    const result = [...specIndex.expand(ids)].filter((id) => known.has(id));
    cache.set(tag, result);
    return result;
  };
}

/** Leaf spec points of one card (from its spec tags). Empty = an exam skills card. */
export function cardPoints(tags, mapTag) {
  const points = new Set();
  for (const tag of tags || []) for (const id of mapTag(tag)) points.add(id);
  return [...points];
}

/**
 * The deck's spec-tag combinations (from flashcard_deck_spec_sets) with each one's
 * leaf spec points worked out once.
 */
export function describeSets(specSets, mapTag) {
  return (specSets || []).map((set) => ({
    tags: set.tags || [],
    cards: Number(set.cards) || 0,
    active: Number(set.active) || 0,
    optional: Boolean(set.optional),
    studied: Number(set.studied) || 0,
    known: Number(set.known) || 0,
    points: cardPoints(set.tags, mapTag),
  }));
}

/** Every spec tag in the deck that maps to a spec point. */
export function mappedTags(sets, mapTag) {
  const tags = new Set();
  for (const set of sets) for (const tag of set.tags) if (mapTag(tag).length) tags.add(tag);
  return [...tags].sort();
}

/**
 * Whether a card group is in play for a choice.
 * choice: { mode: 'learnt' | 'all' | 'choose', general: boolean }, picked(leafId) → boolean.
 */
export function inPlay(set, choice, picked) {
  if (choice.mode === 'all') return true;
  if (set.optional) return false;
  if (!set.points.length) return choice.general !== false;
  return set.points.every(picked);
}

/** Cards in play for a choice. */
export function countInPlay(sets, choice, picked) {
  return sets.reduce((sum, set) => sum + (inPlay(set, choice, picked) ? set.cards : 0), 0);
}

/** Cards that are not tied to any spec point (exam skills), excluding optional ones. */
export const generalCount = (sets) => sets.reduce((sum, set) => sum + (!set.optional && !set.points.length ? set.cards : 0), 0);

/** Cards per leaf spec point (a card tagged with two points counts for both). */
export function cardsPerPoint(sets) {
  const counts = new Map();
  for (const set of sets) {
    if (set.optional) continue;
    for (const id of set.points) counts.set(id, (counts.get(id) || 0) + set.cards);
  }
  return counts;
}

/** Studied and known cards per leaf spec point, counted the same way as cardsPerPoint. */
export function progressPerPoint(sets) {
  const counts = new Map();
  for (const set of sets) {
    if (set.optional) continue;
    for (const id of set.points) {
      const row = counts.get(id) || { studied: 0, known: 0 };
      row.studied += set.studied || 0;
      row.known += set.known || 0;
      counts.set(id, row);
    }
  }
  return counts;
}

/**
 * The RPC arguments for flashcard_apply_spec_selection: the tags the browser
 * understood and the ones to keep. `everything` sends nulls (keep every card).
 */
export function selectionRequest(sets, mapTag, choice, picked) {
  if (choice.mode === 'all') return { mapped: null, allowed: null, general: true };
  const mapped = mappedTags(sets, mapTag);
  const allowed = mapped.filter((tag) => mapTag(tag).every(picked));
  return { mapped, allowed, general: choice.general !== false };
}

/** A stable signature of a request, to skip re-sending an unchanged choice. */
export const requestSignature = (request) => JSON.stringify([request.mapped, request.allowed, request.general]);
