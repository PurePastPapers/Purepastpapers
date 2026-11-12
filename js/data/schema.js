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

  // A part is an independently marked leaf record. Its parent is a grouping id,
  // not necessarily another assessable question in the bank.
  for (const field of ['parent_question_id', 'part_label']) {
    if (question[field] !== undefined && (typeof question[field] !== 'string' || !question[field].trim())) {
      error(`${field} must be a non-empty string when supplied.`);
    }
  }
  if (question.parent_question_id !== undefined && question.parent_question_id === question.question_id) error('parent_question_id cannot be the question itself.');
  if (question.part_label && !question.parent_question_id) error('part_label needs a parent_question_id to group its original question.');

  if (question.context !== undefined) {
    if (!question.context || typeof question.context !== 'object' || Array.isArray(question.context)) {
      error('context must be an object when supplied.');
    } else {
      for (const field of ['shared_stem_html', 'full_question_html', 'full_question_image_url']) {
        if (question.context[field] !== undefined && typeof question.context[field] !== 'string') error(`context.${field} must be a string.`);
      }
    }
  }
  if (question.depends_on_question_ids !== undefined) {
    const dependencies = question.depends_on_question_ids;
    if (!Array.isArray(dependencies)) {
      error('depends_on_question_ids must be an array.');
    } else {
      if (dependencies.some((dependency) => typeof dependency !== 'string' || !dependency.trim())) error('depends_on_question_ids must contain non-empty string ids.');
      if (new Set(dependencies).size !== dependencies.length) error('depends_on_question_ids contains duplicate ids.');
      if (dependencies.includes(question.question_id)) error('depends_on_question_ids cannot include the question itself.');
      if (dependencies.length && !(typeof question.context?.shared_stem_html === 'string' && question.context.shared_stem_html.trim())) {
        error('A question with dependencies needs context.shared_stem_html supplying the earlier information needed to answer this part.');
      }
    }
  }
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
  const byId = new Map(bundle.questions.map((question) => [question.question_id, question]));
  const dependenciesOf = (question) => Array.isArray(question.depends_on_question_ids) ? question.depends_on_question_ids : [];
  for (const question of bundle.questions) {
    for (const dependencyId of dependenciesOf(question)) {
      const dependency = byId.get(dependencyId);
      if (!dependency) issues.push(issue('error', question.question_id, `Dependency "${dependencyId}" is not a question in this subject bundle.`));
      else if (dependency.paper_id !== question.paper_id) issues.push(issue('error', question.question_id, `Dependency "${dependencyId}" belongs to a different paper.`));
      else if (question.parent_question_id && dependency.parent_question_id && dependency.parent_question_id !== question.parent_question_id) {
        issues.push(issue('error', question.question_id, `Dependency "${dependencyId}" belongs to a different parent question.`));
      }
    }
  }
  // Mark actual cycle participants rather than every record which reaches a
  // cycle, so an editor gets the ids whose relationship needs correction.
  const state = new Map(); // 1 = on the active path, 2 = fully visited
  const cyclic = new Set();
  for (const id of byId.keys()) {
    if (state.has(id)) continue;
    // Iterative traversal also handles large imports without a recursive call
    // stack proportional to the length of the dependency chain.
    const path = [{ id, next: 0, dependencies: dependenciesOf(byId.get(id)) }];
    state.set(id, 1);
    while (path.length) {
      const frame = path[path.length - 1];
      if (frame.next === frame.dependencies.length) {
        state.set(frame.id, 2);
        path.pop();
        continue;
      }
      const dependencyId = frame.dependencies[frame.next++];
      if (!byId.has(dependencyId)) continue;
      if (state.get(dependencyId) === 1) {
        const start = path.findIndex((entry) => entry.id === dependencyId);
        for (const member of path.slice(start)) cyclic.add(member.id);
      } else if (!state.has(dependencyId)) {
        state.set(dependencyId, 1);
        path.push({ id: dependencyId, next: 0, dependencies: dependenciesOf(byId.get(dependencyId)) });
      }
    }
  }
  for (const id of cyclic) issues.push(issue('error', id, 'depends_on_question_ids contains a dependency cycle.'));
  for (const paper of bundle.papers) issues.push(...validatePaper(paper, { questionsById: bundle.questionsById, subjectId }));
  return issues;
}
