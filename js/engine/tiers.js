// Foundation / Higher tiers for tiered GCSEs (Maths 1MA1, Combined Science 1SC0 and the
// separate sciences 1BI0, 1CH0, 1PH0).
//
// One registry record per qualification declares `tiers`; the student's choice is saved per
// subject in `preferences.tiers[subject_id]`. `tier_required` subjects (the sciences) need an
// explicit Foundation or Higher choice: no silent default and no "both tiers" default.
//
// Spec points: a point with `tier: "Higher"` is Higher-only and hidden at Foundation. A point
// with no `tier` is assessed on both tiers, including statements that only carry a Higher
// extension (`higher_extension`), which stay visible at Foundation.
// Questions: the question's own `tier`, otherwise its parent paper's tier. A question with no
// tier never matches a chosen tier, so untagged content cannot leak into both.

export const TIER_NAMES = ['Foundation', 'Higher'];

/** Does the subject offer Foundation and Higher tiers? */
export const isTiered = (subject) => Array.isArray(subject?.tiers) && subject.tiers.length > 1;

/** Must the student choose Foundation or Higher (no "not decided" option)? */
export const tierRequired = (subject) => isTiered(subject) && subject.tier_required === true;

/** A valid tier for the subject, or null. */
export const validTier = (subject, tier) => (isTiered(subject) && subject.tiers.includes(tier) ? tier : null);

/** The saved tier for a subject from a progress record, or null. */
export const savedTier = (subject, progress) => validTier(subject, progress?.preferences?.tiers?.[subject?.subject_id]);

/** Is a spec point (or spec-index node) assessed on this tier? No tier = every point. */
export const pointInTier = (point, tier) => !tier || !point?.tier || point.tier === tier;

/**
 * A copy of a specification document holding only the points assessed on `tier`.
 * Topics that lose every point and sections that lose every topic are left out.
 * With no tier, the spec is returned unchanged.
 */
export function specForTier(spec, tier) {
  if (!spec || !tier) return spec;
  const sections = [];
  for (const section of spec.sections || []) {
    const topics = [];
    let changed = false;
    for (const topic of section.topics || []) {
      const points = topic.points || [];
      if (!points.length) {
        if (pointInTier(topic, tier)) topics.push(topic);
        else changed = true;
        continue;
      }
      const kept = points.filter((point) => pointInTier(point, tier));
      if (kept.length === points.length) topics.push(topic);
      else {
        changed = true;
        if (kept.length) topics.push({ ...topic, points: kept });
      }
    }
    if (topics.length) sections.push(changed ? { ...section, topics } : section);
  }
  return { ...spec, sections, tier };
}

/** A subject's leaf spec points assessed on `tier` (all leaves with no tier), in spec order. */
export function tierLeaves(specIndex, subjectId, tier) {
  const leaves = specIndex.subjectLeaves(subjectId);
  return tier ? leaves.filter((id) => pointInTier(specIndex.get(id), tier)) : leaves;
}

/** A question's tier: its own, otherwise its parent paper's. */
export const questionTier = (question, papersById) =>
  question.tier !== undefined ? question.tier : papersById?.get?.(question.paper_id)?.tier ?? null;

/** Questions on one tier (all of them with no tier). Untagged questions are left out of a tier. */
export function questionsForTier(questions, tier, papersById) {
  return tier ? questions.filter((question) => questionTier(question, papersById) === tier) : questions;
}

/** Papers on one tier (all of them with no tier). Demo papers have no tier and are left out. */
export function papersForTier(papers, tier) {
  return tier ? papers.filter((paper) => paper.tier === tier) : papers;
}

/**
 * Does a search explicitly name a tier? A whole word "foundation" or "higher", or a paper code
 * of one of the subject's tiered papers (e.g. "1BH", "2pf"), names that tier. Returns
 * `{ tiers, search }`, where `search` drops the bare tier words (paper codes stay, because they
 * match the paper id). `tiers` lists the tiers named (empty when none is named).
 */
export function searchTierIntent(search, papers = []) {
  const text = String(search || '');
  const terms = text.trim().split(/\s+/).filter(Boolean);
  if (!terms.length) return { tiers: [], search: text };
  const codeTiers = new Map();
  for (const paper of papers) {
    if (paper?.paper_code && TIER_NAMES.includes(paper.tier)) codeTiers.set(String(paper.paper_code).toLowerCase(), paper.tier);
  }
  const named = new Set();
  const kept = [];
  for (const term of terms) {
    const word = term.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (word === 'foundation' || word === 'higher') {
      named.add(word === 'foundation' ? 'Foundation' : 'Higher');
      continue; // a tier word is a filter, not text to find
    }
    if (word === 'tier' && terms.length > 1) continue;
    if (codeTiers.has(word)) named.add(codeTiers.get(word));
    kept.push(term);
  }
  return { tiers: TIER_NAMES.filter((tier) => named.has(tier)), search: kept.join(' ') };
}
