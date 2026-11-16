// One place that builds every in-app link, so hrefs are consistent and IDs are always encoded.
// Each builder returns a hash href ("#/…"). Use `routeOf(href)` for context.navigate targets.

const enc = encodeURIComponent;

function query(params = {}) {
  const entries = Object.entries(params).filter(([, value]) => value != null && value !== '' && value !== false);
  return entries.length ? `?${new URLSearchParams(entries.map(([key, value]) => [key, String(value)]))}` : '';
}

const PAPER_LISTS = { real_past_paper: '/papers', ai_past_paper: '/ai-papers', predicted_paper: '/predicted' };

export const links = {
  /** `section` scrolls the signed-out home page to one of its sections. */
  home: (section = null) => `#/${query({ section })}`,
  subjects: (params) => `#/subjects${query(params)}`,
  subject: (subjectId) => `#/subject/${enc(subjectId)}`,
  /** A paper list (official by default), optionally opened on one subject. */
  papers: (subjectId = null, paperType = 'real_past_paper') => `#${PAPER_LISTS[paperType] || '/papers'}${query({ subject: subjectId })}`,
  paper: (subjectId, paperId) => `#/paper/${enc(subjectId)}/${enc(paperId)}`,
  practice: (params) => `#/practice${query(params)}`,
  session: (sessionId) => `#/session/${enc(sessionId)}`,
  hub: (params) => `#/hub${query(params)}`,
  aiPapers: () => '#/ai-papers',
  predicted: () => '#/predicted',
  aiMarking: () => '#/ai-marking',
  account: () => '#/account',
  studio: () => '#/studio',
  /** `next` is a route ("/hub"), not an href. */
  login: (next = null) => `#/login${query({ next })}`,
  signup: (next = null) => `#/signup${query({ next })}`,
};

/** "#/paper/x/y" → "/paper/x/y" (for context.navigate). */
export const routeOf = (href) => href.replace(/^#/, '');

/** A short "Back to …" label for a route, so back buttons name where they go. */
export function backLabel(route) {
  const path = route.split('?')[0];
  if (path === '/' || path === '') return 'Back to home';
  if (path.startsWith('/paper/')) return 'Back to the paper';
  if (path === '/papers') return 'Back to past papers';
  if (path === '/ai-papers') return 'Back to AI papers';
  if (path === '/predicted') return 'Back to predicted papers';
  if (path === '/practice') return 'Back to practice';
  if (path === '/hub') return 'Back to the Data Hub';
  if (path.startsWith('/subject/')) return 'Back to the subject';
  if (path === '/subjects') return 'Back to my subjects';
  if (path === '/account') return 'Back to your account';
  return 'Back';
}
