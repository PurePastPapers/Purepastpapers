// Per-subject colours. Students pick a colour for each subject from a fixed set of
// preset swatches (no free colour picker). The choice is saved in the student's
// preferences (`subjectColours`), so it travels with their progress data.
// Subjects without a choice get a default from their place in the student's list.

import * as api from '../data/api.js';

/** Preset swatches, in order. Light-mode values; dark mode mutes them in CSS. */
export const SUBJECT_SWATCHES = [
  { id: 'blue', label: 'Blue', hex: '#9cc3e6' },
  { id: 'lilac', label: 'Lilac', hex: '#c7b5ea' },
  { id: 'peach', label: 'Peach', hex: '#f3a37f' },
  { id: 'green', label: 'Green', hex: '#8fcaa0' },
  { id: 'yellow', label: 'Yellow', hex: '#f2cf63' },
  { id: 'pink', label: 'Pink', hex: '#ee9fb2' },
  { id: 'teal', label: 'Teal', hex: '#a7d8d0' },
  { id: 'sand', label: 'Sand', hex: '#d8c3a0' },
  { id: 'olive', label: 'Olive', hex: '#b7cc8a' },
  { id: 'orchid', label: 'Orchid', hex: '#e3b3e0' },
  { id: 'grey', label: 'Grey', hex: '#c3c7d1' },
];

const GROUP_DEFAULT = { stem: 0, humanities: 3, languages: 1, applied: 4, creative: 5 };

function progressOrNull() {
  try {
    return api.isSignedIn() ? api.getProgress() : null;
  } catch {
    return null;
  }
}

/** The colour (hex) to use for a subject. Accepts a subject object or a subject id. */
export function subjectColour(subject) {
  const id = typeof subject === 'string' ? subject : subject?.subject_id;
  const progress = progressOrNull();
  const chosen = progress?.preferences?.subjectColours?.[id];
  const swatch = SUBJECT_SWATCHES.find((entry) => entry.id === chosen || entry.hex === chosen);
  if (swatch) return swatch.hex;
  const index = progress ? progress.enrolled_subjects.indexOf(id) : -1;
  if (index >= 0) return SUBJECT_SWATCHES[index % SUBJECT_SWATCHES.length].hex;
  const group = typeof subject === 'object' ? subject?.category_group : null;
  return SUBJECT_SWATCHES[GROUP_DEFAULT[group] ?? 7].hex;
}

export const subjectSwatchId = (subject) => SUBJECT_SWATCHES.find((entry) => entry.hex === subjectColour(subject))?.id;

export async function setSubjectColour(subjectId, swatchId) {
  const current = { ...(api.getProgress().preferences.subjectColours || {}) };
  current[subjectId] = swatchId;
  await api.setPreference('subjectColours', current);
}

/** Inline style that hands a subject's colour to CSS (`--sc`). */
export const scStyle = (subject) => `--sc:${subjectColour(subject)}`;

/**
 * Tints the page background with a subject's colour (subject-specific pages).
 * The router clears it on every navigation.
 */
export function tintPage(subject) {
  const root = document.documentElement;
  if (!subject) {
    root.removeAttribute('data-tint');
    root.style.removeProperty('--page-sc');
    return;
  }
  root.dataset.tint = '';
  root.style.setProperty('--page-sc', subjectColour(subject));
}
