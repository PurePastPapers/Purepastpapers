// The app frame: sidebar navigation (signed in), a simple header (signed out), and the
// outlet that views render into. Layouts: 'app' | 'public' | 'focus' (distraction-free runner).

import { APP } from '../config/app.config.js';
import { isEnabled, navGroups } from '../config/phases.js';
import { $, $$, html, on, setHtml } from '../core/dom.js';
import * as api from '../data/api.js';
import { icon } from './icons.js';
import { activeTheme, toggleTheme } from './theme.js';

let root = null;

export const brand = () => html`<a class="brand" href="#/" aria-label="${APP.name} — PurePastPapers.com home"><span class="brand__letters">PPP<span class="brand__period">.</span></span><span class="brand__domain">PurePastPapers.com</span></a>`;

function navigation() {
  return navGroups().map(
    (group) =>
      html`${group.label ? html`<p class="nav__label label">${group.label}</p>` : ''}
        ${group.items.map(
          (item) =>
            html`<a class="nav__item" href="#${item.path}" data-nav="${item.path}" data-match="${(item.match || []).join(' ')}">
              ${icon(item.icon)}<span>${item.label}</span>
              ${item.feature && !isEnabled(item.feature) ? html`<span class="badge badge--soon">Soon</span>` : ''}
            </a>`,
        )}`,
  );
}

const themeButtonContent = (withLabel) =>
  html`${icon(activeTheme() === 'dark' ? 'sun' : 'moon')}${withLabel ? html`<span>${activeTheme() === 'dark' ? 'Light theme' : 'Dark theme'}</span>` : ''}`;

const themeButton = (withLabel) =>
  html`<button
    type="button"
    class="btn btn--ghost ${withLabel ? 'btn--sm' : 'btn--icon'}"
    data-theme-toggle="${withLabel ? 'label' : 'icon'}"
    aria-label="Switch between light and dark theme"
  >
    ${themeButtonContent(withLabel)}
  </button>`;

function frame() {
  const user = api.currentUser();
  const initials = user ? user.display_name.trim().slice(0, 1).toUpperCase() : '';
  return html`<div class="app" data-layout="${user ? 'app' : 'public'}">
    <button type="button" class="scrim" data-nav-close aria-label="Close menu"></button>
    <aside class="sidebar" id="sidebar" aria-label="Main navigation">
      ${brand()}
      <nav class="nav">${navigation()}</nav>
      <div class="sidebar__foot">
        <div class="row row--tight">${themeButton(true)}</div>
        ${user
          ? html`<a class="userchip" href="#/account" data-nav="/account">
              <span class="userchip__avatar" aria-hidden="true">${initials}</span>
              <span style="min-width:0">
                <span class="userchip__name" style="display:block">${user.display_name}</span>
                <span class="userchip__meta">${user.is_demo ? 'Demo account' : 'Account and data'}</span>
              </span>
            </a>`
          : ''}
      </div>
    </aside>
    <div class="main">
      <header class="topbar">
        <button type="button" class="btn btn--icon btn--ghost" data-nav-open aria-label="Open menu" aria-controls="sidebar">${icon('menu', { size: 22 })}</button>
        ${brand()}
      </header>
      ${user
        ? ''
        : html`<header class="pubbar">
            ${brand()}
            <span class="spacer"></span>
            <span class="pubbar__note">Less noise. More marks.</span>
            ${themeButton(false)}
            <a class="btn btn--ghost" href="#/login">Log in</a>
            <a class="btn btn--primary" href="#/signup">Sign up</a>
          </header>`}
      <main id="outlet"></main>
      <footer class="site-foot">
        <div class="site-foot__brand"><span>PPP<span class="brand__period">.</span></span><span>PurePastPapers.com</span><a href="#/">Back to home ${icon('external', { size: 14 })}</a></div>
        <p>
          ${APP.name} is an independent revision project. It is not affiliated with AQA, Pearson Edexcel, OCR or WJEC Eduqas. Past papers and mark
          schemes remain the copyright of their exam boards.
        </p>
      </footer>
    </div>
  </div>`;
}

export function mountShell(container) {
  root = container;
  render();
  on(root, 'click', '[data-nav-open]', () => $('.app', root).classList.add('is-nav-open'));
  on(root, 'click', '[data-nav-close], .nav__item, .userchip', () => $('.app', root).classList.remove('is-nav-open'));
  on(root, 'click', '[data-theme-toggle]', () => {
    toggleTheme();
    for (const button of $$('[data-theme-toggle]', root)) setHtml(button, themeButtonContent(button.dataset.themeToggle === 'label'));
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') $('.app', root)?.classList.remove('is-nav-open');
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
    const prefixes = [target, ...link.dataset.match?.split(' ').filter(Boolean) ?? []];
    const active = target === '/' ? path === '/' : prefixes.some((prefix) => path === prefix || path.startsWith(`${prefix}/`));
    link.classList.toggle('is-active', active);
    if (active) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  }
}

/** Marks the active nav item and applies the route's layout. */
export function setRoute(path, layout = null) {
  const app = $('.app', root);
  app.dataset.layout = layout || (api.isSignedIn() ? 'app' : 'public');
  app.dataset.page = path === '/' && !api.isSignedIn() ? 'landing' : 'inner';
  app.classList.remove('is-nav-open');
  setActive(path);
}
