// Qualification identity for papers and questions, read from their own metadata.
//
// A subject record can hold several qualifications (for example A-Level 9BN0 with its
// AS 8BN0). Every paper and question keeps its own `level`, `qualification_code` and
// `spec_code`; labels are rendered from those, never from the parent subject's code,
// a year, a paper number or the paper title (which views shorten).

const LEVELS = new Set(['AS', 'A-Level', 'GCSE', 'Level 3']);

/** Decimal part labels already contain the printed parent question number. */
export function printedQuestionNumber(question) {
  const number = String(question.question_number ?? '');
  const label = String(question.part_label || '').trim();
  return /^\d+\.\d+$/.test(label) && Number(label.split('.')[0]) === Number(number) ? label : number;
}

/** The qualification code a paper or question belongs to, e.g. "8PH0". */
export function qualificationCode(item, subject = null) {
  return item?.qualification_code || item?.spec_code || subject?.spec_code || null;
}

/** A shared assessment can be used on multiple qualification routes. */
export function eligibleQualificationCodes(item, subject = null) {
  if (item?.eligible_qualification_codes) return item.eligible_qualification_codes;
  const code = qualificationCode(item, subject);
  return code ? [code] : [];
}

/**
 * "AS", "A-Level", … for a paper or question. Order of authority:
 * its own `level`, then its code looked up in the subject's qualifications,
 * then the compatible `is_as` flag, then the subject's level.
 */
export function levelOf(item, subject = null) {
  if (LEVELS.has(item?.level)) return item.level;
  const code = item?.qualification_code || item?.spec_code;
  const declared = code && (subject?.qualifications || []).find((entry) => entry.code === code);
  if (declared) return declared.is_as ? 'AS' : declared.label;
  if (item?.is_as === true) return 'AS';
  return subject?.level || null;
}

/**
 * Does this subject hold more than one qualification? True when the registry declares
 * several qualifications or the papers themselves span several levels. A subject with
 * a single qualification never gets level labels.
 */
export function isMultiLevel(subject, papers = []) {
  if ((subject?.qualifications || []).length > 1) return true;
  const levels = new Set(papers.filter((paper) => !paper.is_sample).map((paper) => levelOf(paper, subject)).filter(Boolean));
  return levels.size > 1;
}

/** The paper reference shown on cards, e.g. "8PH0 · 01", "9MA0 · Paper 1" or "9FM0/3A". */
export function paperCode(paper, subject = null) {
  if (paper?.official_paper_code) return paper.official_paper_code;
  const code = qualificationCode(paper, subject);
  // Same paper-number formatting the cards have always used; only the code is per paper.
  const part = /^P\d+$/.test(paper?.paper_code || '') ? `Paper ${paper.paper_code.slice(1)}` : paper?.paper_code;
  return [code, part].filter(Boolean).join(' · ');
}

/** The level label to display for an item, or '' when the subject has one qualification. */
export function levelLabel(item, subject, papers = []) {
  return isMultiLevel(subject, papers) ? levelOf(item, subject) || '' : '';
}
