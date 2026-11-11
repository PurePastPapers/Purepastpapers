// Site-wide configuration. Everything a non-developer is likely to tweak lives here
// or in phases.js — UI code reads these values and never hard-codes them.

export const APP = {
  name: 'OnSpec', // working title — change it here and it updates everywhere
  tagline: 'Past papers, filtered to what you have actually learned.',
  version: '0.1.0',
  storageNamespace: 'onspec', // prefix for everything kept in the browser
};

export const CONTENT = {
  /** Demo papers/questions ship so every feature can be tried. Set to false to hide them all. */
  showSampleContent: true,
};

/** PRD 4.2 — difficulty levels. `level` drives the 1–4 pip indicator. */
export const DIFFICULTIES = [
  { id: 'easy', label: 'Easy', level: 1, description: 'Standard recall, foundation concepts or routine single-step questions.' },
  { id: 'medium', label: 'Medium', level: 2, description: 'Standard exam-level application and multi-step questions.' },
  { id: 'hard', label: 'Hard', level: 3, description: 'High-tariff, synoptic or challenging problem-solving questions.' },
  {
    id: 'extra_hard', label: 'Extra hard', level: 4, beyondSpec: true,
    description: 'Stretch questions that go beyond the specification (MadAsMaths style). Useful for building depth, not required for the exam.',
  },
];
export const DIFFICULTY_BY_ID = Object.fromEntries(DIFFICULTIES.map((d) => [d.id, d]));

/** "Mixed" = a balanced exam-style blend, as a share of the test's minutes. Extra hard is never mixed in. */
export const MIXED = { id: 'mixed', label: 'Mixed', description: 'A balanced exam-style mix of Easy, Medium and Hard.' };
export const MIXED_RATIO = { easy: 0.3, medium: 0.45, hard: 0.25 };

/** Customisable timed tests (STEM). */
export const TEST_DURATIONS = [15, 30, 45, 50, 60, 90];
export const DEFAULT_TEST_MINUTES = 50;

/** Red / Amber / Green thresholds (percentage) used for questions, topics and papers. */
export const RAG = { green: 70, amber: 40 };
export const RAG_LABELS = { green: 'Secure', amber: 'Developing', red: 'Needs work', none: 'No data yet' };

/**
 * Indicative grade bands as minimum percentages. Real boundaries change with every paper
 * and series, so the UI always labels these as indicative. A paper record can carry its own
 * `grade_boundaries` ([{ grade, min_percentage }]) to override the scheme.
 */
export const GRADE_SCHEMES = {
  alevel: { label: 'A-Level A*–E', fail: 'U', bands: [['A*', 80], ['A', 70], ['B', 60], ['C', 50], ['D', 40], ['E', 30]] },
  gcse: { label: 'GCSE 9–1', fail: 'U', bands: [['9', 85], ['8', 75], ['7', 65], ['6', 55], ['5', 45], ['4', 35], ['3', 25], ['2', 15], ['1', 8]] },
  level3: { label: 'Level 3 D*–P', fail: 'U', bands: [['D*', 85], ['D', 70], ['M', 55], ['P', 40]] },
};

/** PRD 8.2 — where a question came from. `feature` links to a flag in phases.js. */
export const SOURCE_TYPES = {
  real_past_paper: { label: 'Official past paper', short: 'Official', feature: 'officialPastPapers' },
  ai_past_paper: { label: 'AI past paper', short: 'AI paper', feature: 'aiPastPapers' },
  ai_spec_question: { label: 'AI specification question', short: 'AI question', feature: 'aiQuestionPool' },
  predicted_paper: { label: 'AI predicted paper', short: 'Predicted', feature: 'predictedPapers' },
};

/** PRD 8.3 — kinds of paper. */
export const PAPER_TYPES = {
  real_past_paper: { label: 'Official past paper', plural: 'Official past papers', feature: 'officialPastPapers' },
  ai_past_paper: { label: 'AI past paper', plural: 'AI past papers', feature: 'aiPastPapers' },
  predicted_paper: { label: 'AI predicted paper', plural: 'AI predicted papers', feature: 'predictedPapers' },
  user_custom_test: { label: 'Custom practice', plural: 'Custom practice', feature: 'customPractice' },
};

/** PRD 4.3 — practice modes; each subject lists the modes it offers in `practice_modes`. */
export const PRACTICE_MODES = {
  timed_test: { label: 'Timed test', blurb: 'A mini-paper built from your topics, to the length you choose.' },
  individual: { label: 'Individual questions', blurb: 'Browse and attempt single questions, marking as you go.' },
  picker: { label: 'Question picker', blurb: 'Untimed. Filter by topic, text, difficulty and marks, then pick exactly what to answer.' },
};

/** Subject colour groups (chart categorical slots 1–5, fixed order). */
export const CATEGORY_GROUPS = {
  stem: { label: 'STEM', slot: 1 },
  humanities: { label: 'Humanities', slot: 2 },
  languages: { label: 'Languages', slot: 3 },
  applied: { label: 'Applied', slot: 4 },
  creative: { label: 'Creative', slot: 5 },
};

export const LEVEL_TABS = [
  { id: 'alevel', label: 'A-Level & Level 3', levels: ['A-Level', 'Level 3'] },
  { id: 'gcse', label: 'GCSE', levels: ['GCSE'] },
];

/** Marks filter buckets for STEM question browsing (essay subjects list their exact tariffs instead). */
export const MARK_BANDS = [
  { id: '1-3', label: '1–3 marks', min: 1, max: 3 },
  { id: '4-6', label: '4–6 marks', min: 4, max: 6 },
  { id: '7-9', label: '7–9 marks', min: 7, max: 9 },
  { id: '10+', label: '10+ marks', min: 10, max: Infinity },
];

export const LIMITS = {
  minPasswordLength: 8,
  keptCompletedSessions: 80, // older completed sessions are pruned (attempt history is kept)
  questionSetMax: 30,
};
