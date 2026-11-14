// Entry point: restores the session, draws the frame and runs the hash router.
// Each view module exports `mount(element, context)` and may return a cleanup function.
// Views are loaded on demand, so a problem in one view never stops the others loading.

import { APP } from './config/app.config.js';
import { isEnabled } from './config/phases.js';
import { $, html, setHtml } from './core/dom.js';
import * as api from './data/api.js';
import * as shell from './ui/shell.js';
import { tintPage } from './ui/subject-colours.js';
import { revealOnScroll } from './ui/motion.js';
import { banner, loadingBlock, toast } from './ui/ui.js';

const papersView = () => import('./ui/views/papers.js');
const comingSoonView = () => import('./ui/views/coming-soon.js');

/**
 * auth: true       → signed-in users only (others are sent to log in, then returned)
 * guestOnly: true  → signed-out users only
 * feature          → shows the coming-soon page until that feature flag is enabled
 * layout: 'focus'  → hides the navigation (used while sitting a paper or test)
 */
const ROUTES = [
  { path: '/', load: () => (api.isSignedIn() ? import('./ui/views/dashboard.js') : import('./ui/views/landing.js')) },
  { path: '/login', load: () => import('./ui/views/auth.js'), guestOnly: true, options: { mode: 'login' } },
  { path: '/signup', load: () => import('./ui/views/auth.js'), guestOnly: true, options: { mode: 'signup' } },
  { path: '/subjects', load: () => import('./ui/views/subjects.js') },
  { path: '/subject/:subjectId', load: () => import('./ui/views/subject.js') },
  { path: '/papers', load: papersView, options: { paperType: 'real_past_paper' } },
  { path: '/paper/:subjectId/:paperId', load: () => import('./ui/views/paper.js') },
  { path: '/practice', load: () => import('./ui/views/practice.js') },
  { path: '/session/:sessionId', load: () => import('./ui/views/session.js'), layout: 'focus' },
  { path: '/hub', load: () => import('./ui/views/hub.js'), auth: true },
  { path: '/ai-papers', load: papersView, feature: 'aiPastPapers', options: { paperType: 'ai_past_paper' } },
  { path: '/predicted', load: papersView, feature: 'predictedPapers', options: { paperType: 'predicted_paper' } },
  { path: '/ai-marking', load: comingSoonView, feature: 'aiMarking', always: true },
  { path: '/account', load: () => import('./ui/views/account.js'), auth: true },
  { path: '/studio', load: () => import('./ui/views/studio.js'), auth: true },
].map((route) => {
  const keys = [];
  const pattern = route.path.replace(/:([A-Za-z]+)/g, (_, key) => {
    keys.push(key);
    return '([^/]+)';
  });
  return { ...route, keys, regex: new RegExp(`^${pattern}/?$`) };
});

function parseLocation() {
  const [rawPath, queryString = ''] = (location.hash.slice(1) || '/').split('?');
  const path = rawPath.startsWith('/') ? rawPath : `/${rawPath}`;
  const query = Object.fromEntries(new URLSearchParams(queryString));
  for (const route of ROUTES) {
    const match = path.match(route.regex);
    if (!match) continue;
    const params = Object.fromEntries(route.keys.map((key, index) => [key, decodeURIComponent(match[index + 1])]));
    return { route, path, query, params, full: queryString ? `${path}?${queryString}` : path };
  }
  return { route: null, path, query, params: {}, full: path };
}

export function navigate(target, { replace = false } = {}) {
  const hash = `#${target}`;
  if (location.hash === hash) return void handleRoute();
  if (replace) location.replace(hash);
  else location.hash = hash;
}

let cleanup = null;
let navigation = 0;
let afterAuth = null; // where to go once a log-in or sign-up succeeds

async function handleRoute() {
  const ticket = ++navigation;
  const { route, path, query, params, full } = parseLocation();
  const signedIn = api.isSignedIn();

  let load = route?.load;
  let options = { ...(route?.options || {}) };
  let needsAuth = Boolean(route?.auth);
  if (route?.feature) {
    if (route.always || !isEnabled(route.feature)) load = comingSoonView;
    else needsAuth = true;
    options.feature = route.feature;
  }
  if (route && needsAuth && !signedIn) return navigate(`/login?next=${encodeURIComponent(full)}`, { replace: true });
  if (route?.guestOnly && signedIn) {
    const target = afterAuth || (query.next?.startsWith('/') ? query.next : '/');
    afterAuth = null;
    return navigate(target, { replace: true });
  }

  try {
    cleanup?.();
  } catch (error) {
    console.error(error);
  }
  cleanup = null;

  shell.setRoute(path, route?.layout || null);
  tintPage(null); // subject pages set their own tint once they know the subject
  // Each navigation renders into its own element, so a slow view can never paint over a newer one.
  const view = document.createElement('div');
  view.className = 'view';
  setHtml(view, loadingBlock());
  shell.outlet().replaceChildren(view);
  window.scrollTo(0, 0);

  const context = {
    path,
    query,
    params,
    options,
    navigate,
    refresh: handleRoute,
    /** Call before signing in or up to choose where the student lands afterwards. */
    afterAuth: (target) => {
      afterAuth = target;
    },
    setTitle: (title) => {
      document.title = title ? `${title} · ${APP.name}` : APP.name;
    },
  };

  try {
    if (!route) {
      context.setTitle('Page not found');
      setHtml(
        view,
        html`<div class="empty">
          <h1 class="empty__title">That page does not exist</h1>
          <p class="empty__text">The link may be out of date.</p>
          <a class="btn btn--primary" href="#/">Go to the home page</a>
        </div>`,
      );
      return;
    }
    const module = await load();
    if (ticket !== navigation) return;
    const dispose = await module.mount(view, context);
    if (ticket !== navigation) {
      if (typeof dispose === 'function') dispose();
      return;
    }
    const stopReveals = revealOnScroll(view);
    cleanup = () => {
      try {
        if (typeof dispose === 'function') dispose();
      } finally {
        stopReveals();
      }
    };
    $('h1', view)?.focus({ preventScroll: true });
  } catch (error) {
    console.error(error);
    if (ticket !== navigation) return;
    setHtml(
      view,
      html`${banner(html`<strong>Something went wrong loading this page.</strong><br /><span class="small">${error.message}</span>`, { type: 'error' })}
        <p style="margin-top:16px"><button type="button" class="btn" data-retry>Try again</button></p>`,
    );
    $('[data-retry]', view)?.addEventListener('click', handleRoute);
  }
}

async function start() {
  await api.init();
  shell.mountShell(document.getElementById('app'));
  api.events.on('auth', (user) => {
    shell.render();
    if (user) handleRoute(); // guest-only pages redirect onwards from here
    else navigate('/'); // signed out or account deleted
  });
  window.addEventListener('hashchange', handleRoute);
  window.addEventListener('unhandledrejection', (event) => {
    console.error(event.reason);
    toast(event.reason?.message || 'Something went wrong.', { type: 'error' });
  });
  handleRoute();
}

start();
