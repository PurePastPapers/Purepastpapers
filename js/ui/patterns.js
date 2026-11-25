// A line pattern for every subject, drawn in the subject's colour. Used on the subject cards
// (Home, My subjects) and on the PurePastPapers flashcard sets, so a subject looks the same everywhere.
// The styles are in css/patterns.css; each pattern is one [data-pat] value.
import { html } from '../core/dom.js';

/** The subject code in a subject id ("EDX_ALEVEL_MATH_9MA0" → "MATH") → its pattern. */
const BY_CODE = {
  MATH: 'grid', FMATH: 'plusdot', BIOL: 'leaf', CHEM: 'hex', PHYS: 'orbit', COMBSCI: 'molecule',
  CS: 'circuit', APPSCI: 'bubbles', IT: 'pixels', GEOG: 'contour', HIST: 'bricks', POL: 'ballot',
  ENGLIT: 'script', ENGLANG: 'quotes', PSYCH: 'eeg', SOC: 'people', RS: 'sunrays', FILM: 'film',
  DRAMA: 'curtain', SPAN: 'tiles', ART: 'splat', BUS: 'stocks', SPORT: 'lanes', PE: 'lanes', FOOD: 'gingham',
};
/** Fallbacks by name, for subjects that only carry a name (older flashcard sets). */
const BY_NAME = [
  [/further math/, 'plusdot'], [/math/, 'grid'], [/combined sci/, 'molecule'], [/applied sci/, 'bubbles'], [/biol/, 'leaf'],
  [/chem/, 'hex'], [/phys(ics)?\b(?!ical)/, 'orbit'], [/computer/, 'circuit'], [/information tech|\bit\b/, 'pixels'],
  [/geog/, 'contour'], [/hist/, 'bricks'], [/polit/, 'ballot'], [/english lang/, 'quotes'], [/english|literature/, 'script'],
  [/psych/, 'eeg'], [/sociol/, 'people'], [/religi/, 'sunrays'], [/film/, 'film'], [/drama|theatre/, 'curtain'],
  [/spanish|french|german/, 'tiles'], [/\bart\b|design/, 'splat'], [/business/, 'stocks'], [/sport|physical ed|\bpe\b/, 'lanes'],
  [/food|nutrition/, 'gingham'],
];
export const PATTERNS = [...new Set(Object.values(BY_CODE))];

/** The pattern for a subject (site subject or flashcard subject: { subject_id | id, subject | name }). */
export function patternFor(subject) {
  const id = String(subject?.subject_id || subject?.id || '');
  const code = id.split('_')[2];
  if (BY_CODE[code]) return BY_CODE[code];
  const text = `${subject?.subject || ''} ${subject?.name || ''} ${id}`.toLowerCase();
  const hit = BY_NAME.find(([pattern]) => pattern.test(text));
  if (hit) return hit[1];
  return PATTERNS[[...text].reduce((sum, ch) => sum + ch.codePointAt(0), 0) % PATTERNS.length];
}

/** The pattern element; the parent decides where it sits. */
export const patternMark = (subject, className = '') => html`<i class="ppp-pat ${className}" data-pat="${patternFor(subject)}" aria-hidden="true"></i>`;
