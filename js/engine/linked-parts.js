// Linked parts: the parts of one printed question that build on each other's answers
// ("Use your graph to ...", "Hence ..."). They are offered as ONE question: one card, the
// question's introduction once, then every part with its own answer box and its own marks.
// Each part keeps its own record, attempts and mark scheme; only the display is grouped.
// Pure functions: no DOM, no storage.

// The two source-reviewed graph questions have independent follow-ups. Keep their
// original component IDs for existing sessions, but offer each target separately.
const BRANCH_PARENTS = new Set(['EDX_1MA1_2024_JUNE_2H_Q11', 'EDX_1MA1_2022_JUNE_1H_Q10']);
const BRANCH_PREFIX = 'LINKED_BRANCH_';

/**
 * Finds the linked groups in a subject's questions and marks every member.
 * A group contains only units connected by answer dependencies, including links between
 * printed question numbers on the same paper (e.g. AQA Psychology questions 21 and 22).
 * Each member gets `linked_group = { id, question_ids, position }` and
 * `dependency_spec_points` holding the other members' topics, so with "only topics I've
 * learned" the group is offered only when every one of its parts is learned.
 *
 * @param {Map<string, object>} questionsById  in printed order; replaced entries are written back
 * @param {Map<string, object>} papersById  holds the official alternative-answer groups
 * @returns {Map<string, string[]>} group id → member ids in printed order
 */
export function linkGroups(questionsById, papersById = new Map(), { includeSiblingParts = false } = {}) {
  const order = new Map([...questionsById.keys()].map((id, index) => [id, index]));
  const options = new Map();
  for (const paper of papersById.values()) {
    const choices = Array.isArray(paper.choice_groups) ? paper.choice_groups : [];
    choices.forEach((group, groupIndex) => {
      if (!Array.isArray(group)) return;
      group.forEach((option, optionIndex) => {
        for (const id of Array.isArray(option) ? option : [option]) {
          options.set(id, `${options.get(id) || ''}/${groupIndex}:${optionIndex}`);
        }
      });
    });
  }
  const parent = new Map();
  const dependencies = new Map();
  const find = (id) => {
    while (parent.get(id) !== id) {
      parent.set(id, parent.get(parent.get(id)));
      id = parent.get(id);
    }
    return id;
  };
  const union = (a, b) => {
    for (const id of [a, b]) if (!parent.has(id)) parent.set(id, id);
    const [ra, rb] = [find(a), find(b)];
    if (ra !== rb) parent.set(order.get(ra) < order.get(rb) ? rb : ra, order.get(ra) < order.get(rb) ? ra : rb);
  };
  for (const question of questionsById.values()) {
    const id = question.question_id;
    for (const dependencyId of question.depends_on_question_ids || []) {
      const dependency = questionsById.get(dependencyId);
      const validLink = dependency && dependency.paper_id === question.paper_id
        && order.get(dependencyId) < order.get(id) && options.get(id) === options.get(dependencyId);
      if (includeSiblingParts ? dependency : validLink) {
        union(id, dependencyId);
        if (!dependencies.has(id)) dependencies.set(id, []);
        dependencies.get(id).push(dependencyId);
      }
    }
  }
  if (!parent.size) return new Map();

  // Older saved selections used groups that included every sibling.
  if (includeSiblingParts) {
    const siblingsByParent = new Map();
    for (const question of questionsById.values()) {
      if (!question.parent_question_id) continue;
      const siblings = siblingsByParent.get(question.parent_question_id) || [];
      siblings.push(question.question_id);
      siblingsByParent.set(question.parent_question_id, siblings);
    }
    for (const id of [...parent.keys()]) {
      for (const sibling of siblingsByParent.get(questionsById.get(id).parent_question_id) || []) {
        union(id, sibling);
      }
    }
  }

  const groups = new Map();
  for (const id of parent.keys()) {
    const root = find(id);
    if (!groups.has(root)) groups.set(root, []);
    groups.get(root).push(id);
  }
  const result = new Map();
  for (const members of groups.values()) {
    if (members.length < 2) continue;
    members.sort((a, b) => order.get(a) - order.get(b));
    const groupId = `LINKED_${members[0]}`;
    const contiguous = order.get(members.at(-1)) - order.get(members[0]) === members.length - 1;
    result.set(groupId, members);
    if (includeSiblingParts) continue;
    const split = members.every((id) => BRANCH_PARENTS.has(questionsById.get(id).parent_question_id));
    const choices = [];
    const closures = new Map();
    if (split) {
      // Members are in printed order, so each dependency's closure is already known.
      for (const id of members) {
        const required = new Set([id]);
        for (const dependency of dependencies.get(id) || []) {
          for (const ancestor of closures.get(dependency)) required.add(ancestor);
        }
        const ids = members.filter((member) => required.has(member));
        closures.set(id, ids);
        if (ids.length > 1) choices.push({
          id: `${BRANCH_PREFIX}${id}`, root_id: groupId, target_id: id, question_ids: ids,
          contiguous: order.get(ids.at(-1)) - order.get(ids[0]) === ids.length - 1,
        });
      }
    }
    const sourceParts = new Map(members.map((id) => [id, questionsById.get(id)]));
    members.forEach((id, position) => {
      const question = questionsById.get(id);
      const prerequisites = closures.get(id);
      const points = new Set(question.dependency_spec_points || []);
      const requirements = { ...(question.textbook_requirements || {}) };
      for (const other of prerequisites || members) {
        if (other === id) continue;
        const sibling = sourceParts.get(other);
        for (const point of [...(sibling.primary_spec_points || []), ...(sibling.crossover_spec_points || [])]) points.add(point);
        for (const [point, requirement] of Object.entries(sibling.textbook_requirements || {})) requirements[point] ??= requirement;
      }
      questionsById.set(id, {
        ...question,
        linked_group: {
          id: groupId, question_ids: members, position, contiguous,
          ...(prerequisites ? { prerequisite_question_ids: prerequisites, branches: choices } : {}),
        },
        dependency_spec_points: [...points],
        ...(Object.keys(requirements).length ? { textbook_requirements: requirements } : {}),
      });
    });
  }
  return result;
}

const DIFFICULTY_ORDER = ['easy', 'medium', 'hard', 'extra_hard'];

/**
 * One entry standing for a whole linked group: the first part's paper details, the parts
 * in printed order, and their marks and time added together.
 */
const entries = new WeakMap();
export function groupEntry(groupId, questionsById) {
  if (!entries.has(questionsById)) entries.set(questionsById, new Map());
  const cache = entries.get(questionsById);
  if (!cache.has(groupId)) cache.set(groupId, buildEntry(groupId, questionsById));
  return cache.get(groupId);
}

function buildEntry(groupId, questionsById) {
  if (!String(groupId).startsWith('LINKED_')) return null;
  const isBranch = groupId.startsWith(BRANCH_PREFIX);
  const anchor = questionsById.get(groupId.slice(isBranch ? BRANCH_PREFIX.length : 'LINKED_'.length));
  const group = isBranch ? anchor?.linked_group?.branches?.find((choice) => choice.id === groupId) : anchor?.linked_group;
  if (group?.id !== groupId) return null;
  const parts = group.question_ids.map((id) => questionsById.get(id));
  if (parts.some((part) => !part)) return null;
  const first = parts[0];
  const hardest = parts.map((part) => part.difficulty).filter((d) => DIFFICULTY_ORDER.includes(d))
    .sort((a, b) => DIFFICULTY_ORDER.indexOf(b) - DIFFICULTY_ORDER.indexOf(a))[0] || first.difficulty;
  const union = (key) => [...new Set(parts.flatMap((part) => part[key] || []))];
  return {
    ...parts[0],
    question_id: groupId,
    linked_group: group,
    is_linked_group: true,
    parts,
    part_ids: parts.map((part) => part.question_id),
    marks: parts.reduce((total, part) => total + (part.marks || 0), 0),
    estimated_minutes: parts.reduce((total, part) => total + (part.estimated_minutes || Math.max(1, Math.round((part.marks || 1) * 1.2))), 0),
    difficulty: hardest,
    primary_spec_points: union('primary_spec_points'),
    crossover_spec_points: union('crossover_spec_points'),
    textbook_references: union('textbook_references'),
    part_label: partRange(parts, group.contiguous),
  };
}

function includedPrerequisites(questions) {
  const included = new Set();
  for (const question of questions) {
    for (const id of question.linked_group?.prerequisite_question_ids || []) {
      if (id !== question.question_id) included.add(id);
    }
  }
  return included;
}

function practiceGroup(question) {
  const group = question.linked_group;
  return group?.branches ? group.branches.find((choice) => choice.target_id === question.question_id) : group;
}

/** "(a)–(d)" from the first and last part labels. */
export function partRange(parts, contiguous = true) {
  if (!contiguous) return parts.map((part) => part.part_label).filter(Boolean).join(', ');
  const first = String(parts[0]?.part_label || '').split(/[–-]/)[0].trim();
  const last = String(parts.at(-1)?.part_label || '').split(/[–-]/).at(-1).trim();
  if (!first) return '';
  return first === last ? first : `${first}–${last}`;
}

/**
 * Replaces the members of each linked group by one group entry, placed where the first
 * of its members appears. Questions outside any group pass through unchanged.
 */
export function collapseLinked(questions, questionsById) {
  const out = [];
  const seen = new Set();
  const prerequisites = includedPrerequisites(questions);
  for (const question of questions) {
    if (prerequisites.has(question.question_id)) continue;
    const group = practiceGroup(question);
    if (!group) { out.push(question); continue; }
    if (seen.has(group.id)) continue;
    seen.add(group.id);
    out.push(groupEntry(group.id, questionsById) || question);
  }
  return out;
}

/**
 * Collapses the filter engine's `locked` list the same way: a group is locked when any
 * part is, and it lists what each locked part still needs.
 */
export function collapseLocked(locked, questionsById) {
  const out = [];
  const index = new Map();
  const prerequisites = includedPrerequisites(locked.map((entry) => entry.question));
  for (const entry of locked) {
    if (prerequisites.has(entry.question.question_id)) continue;
    const group = practiceGroup(entry.question);
    if (!group) { out.push(entry); continue; }
    if (!index.has(group.id)) {
      const item = { question: groupEntry(group.id, questionsById) || entry.question, missing: [], partsMissing: new Map() };
      index.set(group.id, item);
      out.push(item);
    }
    const item = index.get(group.id);
    for (const id of group.target_id ? group.question_ids : [entry.question.question_id]) {
      item.partsMissing.set(id, entry.missing);
    }
    for (const id of entry.missing) if (!item.missing.includes(id)) item.missing.push(id);
  }
  return out;
}

/**
 * Question ids with every linked group completed and kept together in printed order, at
 * the position of its first member. Used when a set or test is started.
 */
export function expandLinkedIds(ids, questionsById) {
  const out = [];
  const seen = new Set();
  for (const id of ids) {
    const question = questionsById.get(id) || groupEntry(id, questionsById);
    const members = question?.linked_group?.prerequisite_question_ids || question?.part_ids || question?.linked_group?.question_ids || [id];
    for (const member of members) {
      if (seen.has(member)) continue;
      seen.add(member);
      out.push(member);
    }
  }
  return out;
}

/**
 * Groups a session's questions into what the runner shows: a linked group whose members
 * follow each other is one item; everything else is an item of one question.
 * @returns {{ questions: object[], start: number, group: object|null }[]}
 */
export function runnerItems(questions) {
  const items = [];
  questions.forEach((question, index) => {
    const previous = items.at(-1);
    const groupId = question.linked_group?.id;
    if (groupId && previous?.group?.id === groupId) {
      previous.questions.push(question);
      return;
    }
    items.push({ questions: [question], start: index, group: groupId ? question.linked_group : null });
  });
  // Older sessions and full papers may have a partial group or a different order.
  return items.flatMap((item) => {
    if (!item.group || item.group.question_ids.every((id, index) => item.questions[index]?.question_id === id)) return [item];
    const branch = item.group.branches?.find((choice) => choice.question_ids.length === item.questions.length
      && choice.question_ids.every((id, index) => item.questions[index].question_id === id));
    if (branch) return [{ ...item, group: branch }];
    return item.questions.map((question, index) => ({ questions: [question], start: item.start + index, group: null }));
  });
}
