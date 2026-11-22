// Which comments of an official examiner report belong to a question or part.
// Reports are split at their own headings by tools/reports/extract.py
// (data/reports/<slug>/<PAPER>.json); this matches those sections to any unit at run time,
// so every question gets its comments without per-question data.
//
// A section's targets name a question and, optionally, a part: {q: '3', part: '(b)(i)'}.
// For a unit we return, in report order:
//   whole  – comments on the whole question ("Question 3"), shown with every part;
//   own    – the unit's own part or a sub-part of it ("3(b)" or "3(b)(ii)" for unit 3(b));
//   parent – a parent part when the report does not go deeper ("3(b)" for unit 3(b)(i)).
// scope: 'part' (own comments found), 'parent_part', 'full_question' (only whole-question
// comments), 'none' (the report says nothing about this question).

const ROMAN = /^(?:i{1,3}|iv|vi{0,3}|ix|x)$/;

/** '(a) (ii)' / 'aii' / 'a(ii)' -> '(a)(ii)'. Mirrors norm_part in tools/reports/extract.py. */
export function normPart(text) {
  const clean = String(text ?? '').toLowerCase().replace(/\s+/g, '');
  const decimal = clean.match(/^(\d+)\.(\d+)$/);
  if (decimal) return `${Number(decimal[1])}.${Number(decimal[2])}`;
  const textPart = clean.replace(/^\d+/, '');
  if (!/^(?:[a-z]+|\([a-z]+\))+$/.test(textPart)) return '';
  const out = [];
  for (const [, paren, bare] of textPart.matchAll(/\(([a-z]+)\)|([a-z]+)/g)) {
    if (paren) out.push(`(${paren})`);
    else if (!out.length && bare.length > 1 && !ROMAN.test(bare) && ROMAN.test(bare.slice(1))) out.push(`(${bare[0]})`, `(${bare.slice(1)})`);
    else out.push(`(${bare})`);
  }
  return out.join('');
}

const tokens = (part) => part.match(/\([a-z]+\)/g) || [];
const isRoman = (token) => ROMAN.test(token.slice(1, -1));

/**
 * The printed parts a unit covers, normalised: ['(b)(i)', '(b)(ii)'] for "(b)(i)–(ii)",
 * [] for a whole question.
 */
export function unitParts(question) {
  const original = question?.provenance?.original_parts;
  let raw = Array.isArray(original) && original.some((part) => normPart(part)) ? original.map(String)
    : question?.part_label ? String(question.part_label).split(/\s*(?:–|—|\+|,)\s*/) : [];
  raw = raw.map((part) => part.trim()).filter(Boolean);
  const parts = [];
  for (const piece of raw) {
    let part = normPart(piece);
    if (!part) continue;
    const previous = parts[parts.length - 1];
    // "(b)(i)–(ii)": a bare numeral continues the previous letter.
    if (previous && tokens(part).length === 1 && isRoman(part) && tokens(previous).length > 1 && !isRoman(tokens(previous)[0])) {
      part = tokens(previous)[0] + part;
    }
    if (!parts.includes(part)) parts.push(part);
  }
  return parts;
}

const questionKey = (number) => {
  const text = String(number ?? '').trim();
  return /^\d+$/.test(text) ? String(Number(text)) : text.toLowerCase();
};

const sectionKey = (value) => String(value ?? '').trim().match(/^(?:section\s+)?([a-z])\b/i)?.[1]?.toUpperCase();
const same = (left, right) => String(left ?? '').trim().toLowerCase() === String(right ?? '').trim().toLowerCase();
const isSubpart = (part, parent) => part.startsWith(parent + '(');
const RELATION_RANK = { section: 0, whole: 1, parent: 2, own: 3 };

function targetRelation(target, question, key, parts) {
  if (target.option && !same(target.option, question.option)) return null;
  if (target.route && !same(target.route, question.route)) return null;
  if (target.section) {
    const expected = sectionKey(target.section);
    const actual = sectionKey(question.section);
    if (!expected || (actual && actual !== expected)) return null;
    if (Array.isArray(target.questions)) {
      return target.questions.some((number) => questionKey(number) === key) ? 'section' : null;
    }
    if (actual !== expected) return null;
  }
  if (!target.q) return target.section && sectionKey(target.section) ? 'section' : null;
  if (questionKey(target.q) !== key) return null;
  if (!String(target.part ?? '').trim()) return 'whole';
  const part = normPart(target.part);
  if (!part) return null;
  if (!parts.length || parts.some((own) => part === own || isSubpart(part, own))) return 'own';
  return parts.some((own) => isSubpart(own, part)) ? 'parent' : null;
}

/** Comments for one unit, constrained to its own published paper. */
export function sectionsFor(question, report) {
  const key = questionKey(question?.question_number);
  const parts = unitParts(question);
  const matches = [];
  if (!key || (question.paper_id && report?.paper_id && question.paper_id !== report.paper_id)) {
    return { scope: 'none', matches, parts };
  }
  for (const section of report?.sections || []) {
    let relation = null;
    for (const target of section.targets || []) {
      const candidate = targetRelation(target, question, key, parts);
      if (candidate && (!relation || RELATION_RANK[candidate] > RELATION_RANK[relation])) relation = candidate;
    }
    if (relation) matches.push({ section, relation });
  }
  const has = (relation) => matches.some((match) => match.relation === relation);
  const scope = has('own') ? 'part' : has('parent') ? 'parent_part' : has('whole') ? 'full_question' : has('section') ? 'section' : 'none';
  // Shared feedback goes first, in the publisher's order within each scope.
  const order = (relation) => relation === 'section' ? 0 : relation === 'whole' ? 1 : 2;
  matches.sort((a, b) => order(a.relation) - order(b.relation));
  return { scope, matches, parts };
}

/** PDF page link (browsers open #page=N at that page). */
export function pageLink(url, page) {
  if (!url || !/^https:\/\//i.test(url)) return null;
  return Number.isInteger(page) && page > 0 ? `${url.split('#')[0]}#page=${page}` : url;
}

/** How a linked group's parts share comments: whole-question ones once, part ones per part. */
export function groupSections(parts, report) {
  const whole = new Map();
  const sectionWide = new Map();
  const perPart = new Map();
  const shownWith = new Map(); // section id -> label of the part it is first shown under
  const results = parts.map((part) => ({ part, ...sectionsFor(part, report) }));
  for (const { part, matches, scope } of results) {
    const own = [];
    for (const match of matches) {
      const shared = match.relation === 'section' ? sectionWide : match.relation === 'whole' ? whole : null;
      if (shared && results.every((result) => result.matches.some((other) => other.section === match.section && other.relation === match.relation))) {
        shared.set(match.section.id, match.section);
        continue;
      }
      own.push({ ...match, firstShownWith: shownWith.get(match.section.id) || null });
      if (!shownWith.has(match.section.id)) shownWith.set(match.section.id, part.question_id);
    }
    perPart.set(part.question_id, { scope, matches: own });
  }
  return { whole: [...whole.values()], sectionWide: [...sectionWide.values()], perPart };
}
