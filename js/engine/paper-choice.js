// A paper option may be one essay or several scored parts of a numbered question.
export const DISTINCT_WORKS = 'two_distinct_works';

export function paperChoiceGroups(paper) {
  return (paper.choice_groups || []).map((group, index) => {
    const count = paper.choice_choose?.[index];
    return {
      count: Number.isInteger(count) && count > 0 ? Math.min(count, group.length) : 1,
      options: group.map(option => Array.isArray(option) ? option : [option]),
    };
  });
}

export function paperWorkChoicesValid(questionIds, questionsById) {
  if (questionIds.length !== 2) return false;
  const [first, second] = questionIds.map(id => questionsById?.get(id)?.work);
  return Boolean(first?.id && second?.id && first.id !== second.id
    && ['text', 'film'].includes(first.type) && ['text', 'film'].includes(second.type)
    && (first.type === 'text' || second.type === 'text'));
}

/** Returns the compulsory questions and exactly the chosen options in paper order.
 * Null means the selection is incomplete or invalid. */
export function paperQuestionSelection(paper, groups, selections, questionsById) {
  const excluded = new Set();
  const kept = new Set();
  for (const [index, { count, options }] of groups.entries()) {
    const selected = new Set(selections[index]);
    if (selected.size !== count || [...selected].some(option => !Number.isInteger(option) || option < 0 || option >= options.length)) return null;
    options.forEach((option, optionIndex) => {
      option.forEach(id => (selected.has(optionIndex) ? kept : excluded).add(id));
    });
  }
  // Options may share questions (AQA GCSE Geography June 2022 Paper 2: Section B, or Question 3 plus one of
  // Questions 4, 5, 6), so a question in any chosen option stays in.
  for (const id of kept) excluded.delete(id);
  const selected = paper.question_ids.filter(id => !excluded.has(id));
  if (paper.choice_rule === DISTINCT_WORKS && !paperWorkChoicesValid(selected, questionsById)) return null;
  return selected;
}

/** An incomplete extraction can be sat from the original source for its official total. */
export function paperSessionQuestionIds(paper, questionIds, questionsById) {
  if (paper.choice_rule === DISTINCT_WORKS && !paperWorkChoicesValid(questionIds, questionsById)) return [];
  if (questionIds.some(id => questionsById.get(id)?.context?.required_stimulus_unavailable)) return [];
  const marks = questionIds.reduce((sum, id) => sum + (questionsById.get(id)?.marks || 0), 0);
  return marks === paper.total_marks ? questionIds : [];
}
