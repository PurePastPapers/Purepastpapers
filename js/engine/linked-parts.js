// Linked parts: the parts of one printed question that build on each other's answers
// ("Use your graph to ...", "Hence ..."). They are offered as ONE question: one card, the
// question's introduction once, then every part with its own answer box and its own marks.
// Each part keeps its own record, attempts and mark scheme; only the display is grouped.
// Pure functions: no DOM, no storage.

/**
 * Finds the linked groups in a subject's questions and marks every member.
 * A group is every part of a question in which at least one part depends on another
 * (`depends_on_question_ids`), plus any part those links reach in a neighbouring question
 * (AQA Psychology prints "Using your answer to question 21" in question 22).
 * Each member gets `linked_group = { id, question_ids, position }` and
 * `dependency_spec_points` holding the other members' topics, so with "only topics I've
 * learned" the group is offered only when every one of its parts is learned.
 *
 * @param {Map<string, object>} questionsById  in printed order; replaced entries are written back
 * @returns {Map<string, string[]>} group id → member ids in printed order
 */
export function linkGroups(questionsById) {
  const order = new Map([...questionsById.keys()].map((id, index) => [id, index]));
  const parent = new Map();
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
    for (const dependency of question.depends_on_question_ids || []) {
      if (questionsById.has(dependency)) union(question.question_id, dependency);
    }
  }
  if (!parent.size) return new Map();

  // Every part of a question that holds a link joins its group.
  const byParent = new Map();
  for (const question of questionsById.values()) {
    if (!question.parent_question_id) continue;
    if (!byParent.has(question.parent_question_id)) byParent.set(question.parent_question_id, []);
    byParent.get(question.parent_question_id).push(question.question_id);
  }
  for (const id of [...parent.keys()]) {
    const siblings = byParent.get(questionsById.get(id).parent_question_id) || [];
    for (const sibling of siblings) union(id, sibling);
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
    result.set(groupId, members);
    members.forEach((id, position) => {
      const question = questionsById.get(id);
      const points = new Set(question.dependency_spec_points || []);
      const requirements = { ...(question.textbook_requirements || {}) };
      for (const other of members) {
        if (other === id) continue;
        const sibling = questionsById.get(other);
        for (const point of [...(sibling.primary_spec_points || []), ...(sibling.crossover_spec_points || [])]) points.add(point);
        for (const [point, requirement] of Object.entries(sibling.textbook_requirements || {})) requirements[point] ??= requirement;
      }
      questionsById.set(id, {
        ...question,
        linked_group: { id: groupId, question_ids: members, position },
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
  const first = questionsById.get(groupId.replace(/^LINKED_/, ''));
  if (first?.linked_group?.id !== groupId) return null;
  const parts = first.linked_group.question_ids.map((id) => questionsById.get(id)).filter(Boolean);
  const hardest = parts.map((part) => part.difficulty).filter((d) => DIFFICULTY_ORDER.includes(d))
    .sort((a, b) => DIFFICULTY_ORDER.indexOf(b) - DIFFICULTY_ORDER.indexOf(a))[0] || first.difficulty;
  const union = (key) => [...new Set(parts.flatMap((part) => part[key] || []))];
  return {
    ...parts[0],
    question_id: groupId,
    is_linked_group: true,
    parts,
    part_ids: parts.map((part) => part.question_id),
    marks: parts.reduce((total, part) => total + (part.marks || 0), 0),
    estimated_minutes: parts.reduce((total, part) => total + (part.estimated_minutes || Math.max(1, Math.round((part.marks || 1) * 1.2))), 0),
    difficulty: hardest,
    primary_spec_points: union('primary_spec_points'),
    crossover_spec_points: union('crossover_spec_points'),
    textbook_references: union('textbook_references'),
    part_label: partRange(parts),
  };
}

/** "(a)–(d)" from the first and last part labels. */
export function partRange(parts) {
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
  for (const question of questions) {
    const group = question.linked_group;
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
  for (const entry of locked) {
    const group = entry.question.linked_group;
    if (!group) { out.push(entry); continue; }
    if (!index.has(group.id)) {
      const item = { question: groupEntry(group.id, questionsById) || entry.question, missing: [], partsMissing: new Map() };
      index.set(group.id, item);
      out.push(item);
    }
    const item = index.get(group.id);
    item.partsMissing.set(entry.question.question_id, entry.missing);
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
    const members = question?.linked_group?.question_ids || question?.part_ids || [id];
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
  // A "group" of one (the rest of the question was not in this session) is shown on its own.
  for (const item of items) if (item.questions.length < 2) item.group = null;
  return items;
}
