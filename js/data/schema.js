// Validation of question and paper records against the PRD schemas (section 8).
// Pure functions, shared by the Content Studio in the browser and tools/validate-data.mjs.

export const SOURCE_TYPE_VALUES = ['real_past_paper', 'ai_past_paper', 'ai_spec_question', 'predicted_paper'];
export const PAPER_TYPE_VALUES = ['real_past_paper', 'ai_past_paper', 'predicted_paper', 'user_custom_test'];
export const DIFFICULTY_VALUES = ['easy', 'medium', 'hard', 'extra_hard'];

const issue = (level, id, message) => ({ level, id, message });

/**
 * @param {object} question
 * @param {{ specIndex: object, paperIds: Set<string>, subjectId: string }} context
 * @returns {{level: 'error'|'warning', id: string, message: string}[]}
 */
export function validateQuestion(question, { specIndex, paperIds, subjectId }) {
  const id = question.question_id || '(no question_id)';
  const issues = [];
  const error = (message) => issues.push(issue('error', id, message));
  const warning = (message) => issues.push(issue('warning', id, message));

  if (!question.question_id) error('question_id is missing.');
  if (question.subject_id !== subjectId) error(`subject_id should be "${subjectId}".`);
  if (!SOURCE_TYPE_VALUES.includes(question.source_type)) error(`source_type "${question.source_type}" is not one of ${SOURCE_TYPE_VALUES.join(', ')}.`);
  if (!DIFFICULTY_VALUES.includes(question.difficulty)) error(`difficulty "${question.difficulty}" is not one of ${DIFFICULTY_VALUES.join(', ')}.`);
  if (!Number.isInteger(question.marks) || question.marks <= 0) error('marks must be a positive whole number.');
  if (question.estimated_minutes != null && !(question.estimated_minutes > 0)) error('estimated_minutes must be positive.');
  if (typeof question.include_in_custom_pool !== 'boolean') warning('include_in_custom_pool should be true or false (treated as true).');

  if (!Array.isArray(question.primary_spec_points) || !question.primary_spec_points.length) {
    error('primary_spec_points needs at least one spec point.');
  }
  for (const point of question.primary_spec_points || []) {
    if (!specIndex.has(point)) error(`primary spec point "${point}" does not exist.`);
    else if (specIndex.subjectOf(point) !== subjectId) error(`primary spec point "${point}" belongs to another subject (use crossover_spec_points).`);
  }
  for (const point of question.crossover_spec_points || []) {
    if (!specIndex.has(point)) error(`crossover spec point "${point}" does not exist.`);
  }

  if (question.paper_id == null) {
    if (question.source_type !== 'ai_spec_question') warning('paper_id is empty: only standalone AI specification questions normally have no paper.');
  } else if (!paperIds.has(question.paper_id)) {
    error(`paper_id "${question.paper_id}" does not match a paper for this subject.`);
  }

  const content = question.content || {};
  if (!content.question_html && !content.question_image_url) error('content needs question_html or question_image_url.');
  if (!content.mark_scheme_html && !content.mark_scheme_image_url) warning('no mark scheme (mark_scheme_html or mark_scheme_image_url).');
  return issues;
}

/**
 * @param {object} paper
 * @param {{ questionsById: Map<string, object>, subjectId: string }} context
 */
export function validatePaper(paper, { questionsById, subjectId }) {
  const id = paper.paper_id || '(no paper_id)';
  const issues = [];
  const error = (message) => issues.push(issue('error', id, message));
  const warning = (message) => issues.push(issue('warning', id, message));

  if (!paper.paper_id) error('paper_id is missing.');
  if (paper.subject_id !== subjectId) error(`subject_id should be "${subjectId}".`);
  if (!PAPER_TYPE_VALUES.includes(paper.paper_type)) error(`paper_type "${paper.paper_type}" is not one of ${PAPER_TYPE_VALUES.join(', ')}.`);
  if (!paper.title) error('title is missing.');
  if (!(paper.total_marks > 0)) error('total_marks must be positive.');
  if (!(paper.duration_minutes > 0)) error('duration_minutes must be positive.');

  const ids = paper.question_ids || [];
  let marks = 0;
  for (const questionId of ids) {
    const question = questionsById.get(questionId);
    if (!question) error(`question_ids lists "${questionId}", which does not exist.`);
    else marks += question.marks;
  }
  if (ids.length && marks !== paper.total_marks) {
    warning(`question marks add up to ${marks}, but total_marks is ${paper.total_marks} (fine while a paper is only partly extracted).`);
  }
  return issues;
}

/** Validates everything for one subject bundle ({ subject, papers, questions, questionsById }). */
export function validateBundle(bundle, specIndex) {
  const subjectId = bundle.subject.subject_id;
  const paperIds = new Set(bundle.papers.map((paper) => paper.paper_id));
  const issues = [];
  const seen = new Set();
  for (const question of bundle.questions) {
    if (seen.has(question.question_id)) issues.push(issue('error', question.question_id, 'duplicate question_id.'));
    seen.add(question.question_id);
    issues.push(...validateQuestion(question, { specIndex, paperIds, subjectId }));
  }
  for (const paper of bundle.papers) issues.push(...validatePaper(paper, { questionsById: bundle.questionsById, subjectId }));
  return issues;
}
