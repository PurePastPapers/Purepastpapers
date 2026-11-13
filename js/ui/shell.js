// The app frame: a top bar (the four sections, the answered count and an account menu
// when signed in; Log in / Sign up when signed out) and the outlet that views render into.
// Layouts: 'app' | 'public' | 'focus' (distraction-free runner: no top bar).

import { isEnabled, navGroups } from '../config/phases.js';
import { $, $$, html, on, setHtml } from '../core/dom.js';
import * as api from '../data/api.js';
import { icon } from './icons.js';
import { SUBJECT_SWATCHES } from './subject-colours.js';
import { activeTheme, toggleTheme } from './theme.js';

let root = null;

export const brand = () =>
  html`<a class="brand" href="#/" aria-label="PurePastPapers home"><span class="brand__mark" aria-hidden="true">P</span><span class="brand__name">PurePastPapers</span></a>`;

const navLink = (item, className) =>
  html`<a class="${className}" href="#${item.path}" data-nav="${item.path}" data-match="${(item.match || []).join(' ')}">${item.label}${item.feature && !isEnabled(item.feature) ? html`<span class="badge badge--soon">Soon</span>` : ''}</a>`;

const themeLabel = () => (activeTheme() === 'dark' ? 'Light mode' : 'Dark mode');

function answeredCount() {
  try {
    return new Set(api.getProgress().question_attempts.map((attempt) => attempt.question_id)).size;
  } catch {
    return 0;
  }
}

function avatarHex() {
  try {
    const id = api.getProgress().preferences.avatarColour || 'yellow';
    return SUBJECT_SWATCHES.find((swatch) => swatch.id === id)?.hex || SUBJECT_SWATCHES[4].hex;
  } catch {
    return SUBJECT_SWATCHES[4].hex;
  }
}

function frame() {
  const user = api.currentUser();
  const initials = user ? user.display_name.trim().slice(0, 1).toUpperCase() : '';
  const { main, more } = navGroups();
  return html`<div class="app" data-layout="${user ? 'app' : 'public'}">
    <header class="topnav">
      ${brand()}
      ${user
        ? html`<nav class="topnav__tabs" aria-label="Main navigation">${main.map((item) => navLink(item, 'topnav__tab'))}</nav>
            <div class="topnav__right">
              ${user.is_demo ? html`<button type="button" class="btn btn--sm topnav__leave" data-logout>${icon('logout', { size: 15 })} Sign out of demo</button>` : ''}
              <a class="tag topnav__count" href="#/hub" data-answered>${answeredCount()} answered</a>
              <details class="menu" data-menu>
                <summary class="avatar" style="--sc:${avatarHex()}" aria-label="Account menu for ${user.display_name}">${initials}</summary>
                <div class="menu__panel card">
                  <p class="menu__who"><strong>${user.display_name}</strong><span class="small muted">${user.is_demo ? 'Demo account' : user.email || 'Your account'}</span></p>
                  <nav class="menu__links" aria-label="More">
                    <span class="menu__tabs">${main.map((item) => navLink(item, 'menu__item'))}</span>
                    ${more.map((item) => navLink(item, 'menu__item'))}
                    <a class="menu__item" href="#/account" data-nav="/account">Account and settings</a>
                  </nav>
                  <div class="menu__foot">
                    <button type="button" class="btn btn--sm" data-theme-toggle>${icon(activeTheme() === 'dark' ? 'sun' : 'moon')}<span>${themeLabel()}</span></button>
                    <button type="button" class="btn btn--sm btn--ghost" data-logout>Log out</button>
                  </div>
                </div>
              </details>
            </div>`
        : html`<nav class="topnav__links" aria-label="On this page">
              <a href="#/" data-jump="features">Features</a><a href="#/" data-jump="subjects">Subjects</a><a href="#/" data-jump="how">How it works</a>
            </nav>
            <div class="topnav__right">
              <button type="button" class="iconbtn" data-theme-toggle aria-label="${themeLabel()}">${icon(activeTheme() === 'dark' ? 'sun' : 'moon')}</button>
              <a class="btn btn--sm" href="#/login">Log in</a>
              <a class="btn btn--sm btn--primary" href="#/signup">Sign up</a>
            </div>`}
    </header>
    <main id="outlet"></main>
    <footer class="site-foot">
      <p>
        PurePastPapers is an independent revision project. It is not affiliated with AQA, Pearson Edexcel, OCR or WJEC Eduqas. Past papers and mark
        schemes remain the copyright of their exam boards.
      </p>
    </footer>
  </div>`;
}

export function mountShell(container) {
  root = container;
  render();
  on(root, 'click', '[data-theme-toggle]', () => {
    toggleTheme();
    for (const button of $$('[data-theme-toggle]', root)) {
      const withLabel = Boolean(button.querySelector('span'));
      setHtml(button, html`${icon(activeTheme() === 'dark' ? 'sun' : 'moon')}${withLabel ? html`<span>${themeLabel()}</span>` : ''}`);
      if (!withLabel) button.setAttribute('aria-label', themeLabel());
    }
  });
  on(root, 'click', '[data-logout]', () => api.signOut());
  on(root, 'click', '[data-jump]', (event, link) => {
    const target = document.getElementById(link.dataset.jump);
    if (!target) return; // not on the landing page: let the link go home
    event.preventDefault();
    target.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
  });
  on(root, 'click', '.menu__item', () => $('[data-menu]', root)?.removeAttribute('open'));
  document.addEventListener('click', (event) => {
    const menu = $('[data-menu]', root);
    if (menu?.open && !menu.contains(event.target)) menu.removeAttribute('open');
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') $('[data-menu]', root)?.removeAttribute('open');
  });
}

/** Redraws the frame (call when the signed-in user changes). */
export function render() {
  setHtml(root, frame());
}

export const outlet = () => $('#outlet', root);

function setActive(path) {
  for (const link of $$('[data-nav]', root)) {
    const target = link.dataset.nav;
    const prefixes = [target, ...(link.dataset.match?.split(' ').filter(Boolean) ?? [])];
    const active = target === '/' ? path === '/' : prefixes.some((prefix) => path === prefix || path.startsWith(`${prefix}/`));
    link.classList.toggle('is-active', active);
    if (active) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  }
}

/** Marks the active nav item, refreshes the answered count and applies the route's layout. */
export function setRoute(path, layout = null) {
  const app = $('.app', root);
  app.dataset.layout = layout || (api.isSignedIn() ? 'app' : 'public');
  app.dataset.page = path === '/' && !api.isSignedIn() ? 'landing' : 'inner';
  $('[data-menu]', root)?.removeAttribute('open');
  const count = $('[data-answered]', root);
  if (count) count.textContent = `${answeredCount()} answered`;
  setActive(path);
}

