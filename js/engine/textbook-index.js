// Textbook subsection identities are separate from official specification IDs.
// Associations describe a question's skill scope; they never rewrite history.
export function createTextbookIndex(document, specIndex) {
  const points = new Map(), chapters = new Map(), books = new Map();
  const sections = [];
  // Each subject's document names its own prefixes; the defaults are the Maths ones,
  // so existing saved Maths identities are unchanged.
  const sectionPrefix = document.section_prefix || 'TB_MATH';
  const bookPrefix = document.book_prefix || 'TB_BOOK';
  for (const book of document.books || []) {
    if (books.has(book.id) || ![12, 13].includes(book.year)) throw new TypeError('Invalid textbook identity.');
    books.set(book.id, book);
    const topics = [];
    for (const chapter of book.chapters) {
      if (chapters.has(chapter.id)) throw new TypeError('Duplicate textbook chapter.');
      chapters.set(chapter.id, {...chapter, book});
      const leaves = [];
      for (const section of chapter.sections) {
        if (points.has(section.id) || !section.id.startsWith(`${sectionPrefix}_${book.id}_`) ||
            !section.official_points.length || section.official_points.some(id => !specIndex.has(id))) {
          throw new TypeError('Invalid textbook subsection or official association.');
        }
        const point = {...section, book, chapter, type: 'point'};
        points.set(point.id, point);
        leaves.push({...section, search_aliases: [...book.aliases, book.title, book.short_title, chapter.title]});
      }
      topics.push({id: chapter.id, code: chapter.code, title: chapter.title, points: leaves});
    }
    sections.push({id: `${bookPrefix}_${book.id}`, title: book.title, search_aliases: book.aliases, topics});
  }
  function attach(question, association) {
    if (!association) return question;
    const requirements = association.requirements || {};
    const required = [...specIndex.expand([...(question.primary_spec_points || []), ...(question.crossover_spec_points || [])])];
    if (required.some(id => !requirements[id]) || Object.keys(requirements).some(id => !required.includes(id)) || Object.values(requirements).some(group =>
      !['subsection', 'chapter'].includes(group.precision) || !group.ids?.length || group.ids.some(id => !points.has(id)))) {
      throw new TypeError(`Unresolved textbook association: ${question.question_id}`);
    }
    const primary = [...specIndex.expand(question.primary_spec_points || [])];
    const references = [];
    for (const [officialId, group] of Object.entries(requirements)) {
      const role = primary.includes(officialId) ? 'Assessed' : 'Prerequisite';
      for (const id of group.ids) {
        const point = points.get(id);
        const key = group.precision === 'chapter' ? point.chapter.id : point.id;
        if (references.some(item => item.id === key && item.role === role)) continue;
        references.push({id: key, book: point.book.short_title, aliases: point.book.aliases, year: point.book.year,
          code: group.precision === 'chapter' ? point.chapter.code : point.code,
          title: group.precision === 'chapter' ? point.chapter.title : point.title,
          chapter: point.chapter.title, role, precision: group.precision});
      }
    }
    return {...question, textbook_requirements: requirements,
      textbook_primary_groups: primary.map(id => requirements[id]), textbook_references: references};
  }
  function counts(questions) {
    const matches = new Map();
    for (const question of questions) for (const group of question.textbook_primary_groups || []) {
      for (const id of group.ids) {
        const chapter = points.get(id).chapter.id;
        if (!matches.has(chapter)) matches.set(chapter, new Set());
        matches.get(chapter).add(question.question_id);
        if (group.precision === 'subsection') {
          if (!matches.has(id)) matches.set(id, new Set());
          matches.get(id).add(question.question_id);
        }
      }
    }
    return new Map([...matches].map(([id, questions]) => [id, questions.size]));
  }
  return {points, chapters, books, counts, ids: [...points.keys()], bookNodeId: (book) => `${bookPrefix}_${book.id}`,
    tree: {subject_id: document.subject_id, sections}, attach};
}

/** A chapter-level association matches a whole chapter selection, not a guessed
 * individual subsection. Strict mode also checks every required textbook skill.
 */
export function matchesTextbookSelection(question, selected, mode = 'crossover') {
  if (selected == null) return true;
  const selection = selected instanceof Set ? selected : new Set(selected);
  if (!selection.size) return false;
  const groups = question.textbook_primary_groups || [];
  const touches = groups.some(group => group.precision === 'subsection'
    ? group.ids.some(id => selection.has(id)) : group.ids.every(id => selection.has(id)));
  if (!touches) return false;
  return mode !== 'strict' || Object.values(question.textbook_requirements || {})
    .every(group => group.ids.every(id => selection.has(id)));
}

/** Aggregate existing explicit marks into book/chapter rows, once per question.
 * Ambiguous chapter links do not invent subsection-level mastery evidence.
 */
export function textbookMasteryByNode(latest, questionsById, index) {
  const totals = new Map();
  for (const [id, attempt] of latest) {
    if (!Number.isFinite(attempt.marks_awarded) || !(attempt.max_marks > 0)) continue;
    const question = questionsById.get(id);
    const nodes = new Set();
    for (const group of question?.textbook_primary_groups || []) for (const section of group.ids) {
      const point = index.points.get(section);
      nodes.add(index.bookNodeId ? index.bookNodeId(point.book) : `TB_BOOK_${point.book.id}`);
      nodes.add(point.chapter.id);
      if (group.precision === 'subsection') nodes.add(section);
    }
    for (const node of nodes) {
      const value = totals.get(node) || {marks:0, max:0, count:0};
      value.marks += attempt.marks_awarded;
      value.max += attempt.max_marks;
      value.count++;
      totals.set(node,value);
    }
  }
  return new Map([...totals].map(([id,value]) => [id,{...value,percentage:100*value.marks/value.max}]));
}
