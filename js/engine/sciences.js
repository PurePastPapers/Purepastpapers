// The three sciences inside GCSE Combined Science (Edexcel 1SC0), owner request 2026-11-21.
//
// Combined Science stays one subject with one double-award target grade, but Practice can
// narrow to Biology, Chemistry or Physics. A subject opts in with `sciences` (names that match
// its spec sections' titles). A question's science is its own `science` field (set by the
// GCSE science imports); otherwise the section holding its first primary spec point.
// Pure functions: no DOM, no storage.

/** The sciences a subject can be narrowed to (empty for every other subject). */
export const sciencesOf = (subject) => (Array.isArray(subject?.sciences) ? subject.sciences : []);

/** A valid science for the subject, or null ('' and unknown names mean all sciences). */
export const validScience = (subject, science) => (sciencesOf(subject).includes(science) ? science : null);

/** The spec section for a science, or null. */
export const scienceSection = (spec, science) => (science ? (spec?.sections || []).find((section) => section.title === science) || null : null);

/** A copy of the spec holding only one science's section (the spec unchanged with no science). */
export function specForScience(spec, science) {
  const section = scienceSection(spec, science);
  return section ? { ...spec, sections: [section], science } : spec;
}

/** Leaf spec points of one science, from a list of the subject's leaves. */
export function scienceLeaves(leaves, spec, science, specIndex) {
  const section = scienceSection(spec, science);
  if (!section) return leaves;
  const inScience = new Set(specIndex.leavesOf(section.id));
  return leaves.filter((id) => inScience.has(id));
}

/** The science a question belongs to, or null when it cannot be told. */
export function questionScience(question, spec, specIndex) {
  if (question?.science) return question.science;
  for (const id of question?.primary_spec_points || []) {
    const section = specIndex.lineage(id).find((node) => node.type === 'section');
    const match = section && (spec?.sections || []).find((candidate) => candidate.id === section.id);
    if (match) return match.title;
  }
  return null;
}

/** Questions of one science (every question with no science chosen). */
export function questionsForScience(questions, science, spec, specIndex) {
  return science ? questions.filter((question) => questionScience(question, spec, specIndex) === science) : questions;
}
