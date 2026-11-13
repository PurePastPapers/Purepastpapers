// The four-phase roadmap (PRD section 1) and the feature flags that gate each phase.
//
// To switch a later phase on:
//   1. add its content to /data (see README → "Preparing for later phases"),
//   2. set `enabled: true` on the matching feature below.
// Navigation, the question-source selector, the papers views and the Data Hub all read
// these flags, so nothing else needs to change to reveal a section.

export const PHASES = [
  {
    id: 1,
    status: 'live',
    title: 'Core platform',
    summary: 'Official past papers, topic and crossover filtering, difficulty selection, customisable practice, accounts and the Data Hub.',
  },
  {
    id: 2,
    status: 'coming_soon',
    title: 'AI questions and AI past papers',
    summary: 'A pre-generated bank of AI exam questions for every specification point, plus full AI past papers modelled on real paper trends.',
  },
  {
    id: 3,
    status: 'coming_soon',
    title: 'AI predicted papers',
    summary: 'Predicted papers for upcoming exam series, built from topic frequency, overdue specification points and multi-year examiner trends.',
  },
  {
    id: 4,
    status: 'coming_soon',
    title: 'AI marking engine',
    summary: 'Automatic marking of typed answers against the mark scheme, with handwriting upload and a maths canvas to follow.',
  },
];

export const FEATURES = {
  officialPastPapers: { phase: 1, enabled: true },
  customPractice: { phase: 1, enabled: true },
  dataHub: { phase: 1, enabled: true },
  aiPastPapers: {
    phase: 2,
    enabled: false,
    title: 'AI past papers',
    route: '/ai-papers',
    lead: 'Full practice papers written by AI and modelled on how real papers are built.',
    points: [
      'Every paper is generated in advance, reviewed and stored in the question bank. Nothing is generated while you wait.',
      'Papers follow real paper structures, command words and mark schemes.',
      'Questions carry the same topic, crossover and difficulty tags, so the learned-topics filter works on them too.',
      'Kept in their own section, so you always know whether a paper is official or AI-written.',
    ],
  },
  aiQuestionPool: {
    phase: 2,
    enabled: false,
    title: 'AI specification questions',
    lead: 'Easy, medium and hard questions for every specification point, including the ones that rarely appear on real papers.',
    points: [],
  },
  predictedPapers: {
    phase: 3,
    enabled: false,
    title: 'AI predicted papers',
    route: '/predicted',
    lead: 'Predicted papers for the next exam series, with mark schemes.',
    points: [
      'Built from topic-by-topic frequency analysis of previous papers.',
      'Weights specification points that have never been examined or are overdue.',
      'Follows multi-year trends in question phrasing, assessment objectives and crossover topics.',
      'Matches the timing, mark total and section layout of the real paper.',
    ],
  },
  aiMarking: {
    phase: 4,
    enabled: false,
    title: 'AI marking',
    route: '/ai-marking',
    lead: 'Type your answer and have it marked against the mark scheme automatically.',
    points: [
      'Typed answers first: working for STEM, essays for humanities.',
      'Method and working marks for STEM; level-of-response and assessment objective marks for essays.',
      'Shows where marks were gained and lost, and logs the result to your Data Hub.',
      'Later additions: photo upload of handwritten work, and an on-screen drawing and maths canvas.',
    ],
  },
};

export const isEnabled = (feature) => FEATURES[feature]?.enabled === true;
export const phaseOf = (feature) => PHASES.find((phase) => phase.id === FEATURES[feature]?.phase) || null;

/** Question source types a student may currently draw from in custom practice. */
export function enabledSourceTypes() {
  const types = ['real_past_paper'];
  if (isEnabled('aiPastPapers')) types.push('ai_past_paper');
  if (isEnabled('aiQuestionPool')) types.push('ai_spec_question');
  if (isEnabled('predictedPapers')) types.push('predicted_paper');
  return types;
}

/** Sections that belong to later phases. `page: false` = a capability with no page of its own once live. */
const PHASED_NAV = [
  { path: '/ai-papers', label: 'AI past papers', icon: 'sparkle', feature: 'aiPastPapers' },
  { path: '/predicted', label: 'AI predicted papers', icon: 'target', feature: 'predictedPapers' },
  { path: '/ai-marking', label: 'AI marking', icon: 'checkCircle', feature: 'aiMarking', page: false },
];

/**
 * Top navigation, built from the feature flags. `main` is the row of tabs across the top
 * (the four sections). `more` sits in the account menu: My subjects, plus each AI section,
 * which shows a "Soon" badge until its feature is enabled.
 */
export function navGroups() {
  const live = PHASED_NAV.filter((item) => isEnabled(item.feature) && item.page !== false);
  return {
    main: [
      { path: '/', label: 'Home', icon: 'home' },
      { path: '/papers', label: 'Past papers', icon: 'file', match: ['/paper', ...live.map((item) => item.path)] },
      { path: '/practice', label: 'Practice', icon: 'sliders' },
      { path: '/hub', label: 'Data Hub', icon: 'chart' },
    ],
    more: [{ path: '/subjects', label: 'My subjects', icon: 'cap', match: ['/subject'] }, ...PHASED_NAV],
  };
}
