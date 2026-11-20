// The phone → free account → bigger screen funnel.
//
//   1. Phone visitors browse freely. After a few pages (or once they finish something worth
//      keeping) a small sheet above the tab bar explains that guest answers vanish, and that a
//      free account keeps them on their phone, laptop and tablet.
//   2. Signed-in phone users see one dismissible "Carry on on a bigger screen" card on Home,
//      and long timed papers ask whether to sit them here or send them to a laptop.
//   3. The first time a phone user signs in on a laptop, PC or tablet they get a short welcome.
//
// Every prompt can be dismissed and stays dismissed, and none of them blocks what the student
// was doing. State lives in localStorage (guests) or the synced preferences (accounts).

import { html, setHtml } from '../core/dom.js';
import { links } from '../core/links.js';
import * as api from '../data/api.js';
import { deviceClass, emailSelfHref, hasUsedBigScreen, isPhone, recordDevice, shareLink } from './device.js';
import { icon } from './icons.js';
import { openModal, toast } from './ui.js';

const KEY = 'ppp:funnel';
const SNOOZE_DAYS = 3;
const QUIET = [/^\/session\//, /^\/login/, /^\/signup/, /^\/legacy-login/, /^\/forgot-password/, /^\/reset-password/];

function load() {
  try {
    return JSON.parse(sessionStorage.getItem(KEY) || '{}');
  } catch {
    return {};
  }
}
function save(state) {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* ignore */
  }
}
function snoozedUntil() {
  try {
    return Number(localStorage.getItem(`${KEY}:snooze`) || 0);
  } catch {
    return Date.now() + 1; // storage blocked: never nag
  }
}
function snooze(days = SNOOZE_DAYS) {
  try {
    localStorage.setItem(`${KEY}:snooze`, String(Date.now() + days * 864e5));
  } catch {
    /* ignore */
  }
}

let navigateTo = null;
let sheet = null;
let currentPath = '/';
let guestWork = 0;

// ───────────────────────────── guest sheet (phones) ─────────────────────────────

function closeSheet() {
  sheet?.remove();
  sheet = null;
  document.documentElement.removeAttribute('data-nudge');
}

function openSheet(reason) {
  if (sheet) return;
  const state = load();
  state.shown = true;
  save(state);
  sheet = document.createElement('aside');
  sheet.className = 'nudge card';
  sheet.setAttribute('aria-labelledby', 'nudge-title');
  setHtml(
    sheet,
    html`<i class="tape tape--c" aria-hidden="true"></i>
      <button type="button" class="nudge__x iconbtn" data-nudge-close aria-label="Not now">${icon('x', { size: 16 })}</button>
      <p class="nudge__title" id="nudge-title">${reason === 'work' ? 'Keep that result' : 'Save as you go'}</p>
      <p class="nudge__text">
        ${reason === 'work' ? 'Guest results disappear when you close this tab.' : 'Guest answers disappear when you close this tab.'}
        A free account keeps every mark, and it’s all there when you open PurePastPapers on your laptop or tablet.
      </p>
      <div class="nudge__btns">
        <a class="btn btn--primary" href="${links.signup(currentPath === '/' ? null : currentPath)}" data-nudge-go>Create a free account</a>
        <button type="button" class="btn btn--ghost" data-nudge-close>Not now</button>
      </div>`,
  );
  sheet.addEventListener('click', (event) => {
    if (event.target.closest('[data-nudge-close]')) {
      snooze();
      closeSheet();
    } else if (event.target.closest('[data-nudge-go]')) {
      closeSheet();
    }
  });
  document.body.append(sheet);
  document.documentElement.setAttribute('data-nudge', '');
}

function maybeGuestSheet() {
  if (api.isSignedIn() || !isPhone()) return closeSheet();
  if (QUIET.some((pattern) => pattern.test(currentPath))) return closeSheet();
  if (Date.now() < snoozedUntil()) return;
  const state = load();
  if (state.shown && !sheet) return; // once per visit
  if (guestWork > 0) return openSheet('work');
  if ((state.views || 0) >= 3 && currentPath !== '/') openSheet('views');
}

// ───────────────────────────── signed-in prompts ─────────────────────────────

/** The Home card for phone users who have not tried a laptop or tablet yet. */
export function bigScreenCard() {
  const user = api.currentUser();
  if (!user || !isPhone() || hasUsedBigScreen()) return '';
  let hidden = false;
  try {
    hidden = Boolean(api.getProgress().preferences.hideBigScreenCard);
  } catch {
    /* ignore */
  }
  if (hidden) return '';
  return html`<section class="card ruled bigscreen tilt-2" aria-labelledby="bigscreen-title" data-bigscreen>
    <i class="tape tape--c" aria-hidden="true"></i>
    <span class="bigscreen__art" aria-hidden="true">${icon('phone', { size: 26 })}<span>→</span>${icon('laptop', { size: 30 })}</span>
    <div class="bigscreen__body">
      <h2 id="bigscreen-title">Carry on on a bigger screen</h2>
      <p>Quick questions work well here. Full timed papers, the test builder and your Data Hub charts are easier on a laptop, PC or tablet.</p>
      <p class="small muted">${user.is_demo ? 'Make a free account and' : html`Log in there with <b>${user.email || 'your email'}</b> and`} everything you’ve done on this phone is already waiting.</p>
      <div class="row row--tight">
        <a class="btn btn--primary btn--sm" href="${emailSelfHref('/')}" data-bigscreen-email>${icon('mail', { size: 16 })} Email me the link</a>
        <button type="button" class="btn btn--sm" data-bigscreen-share>${icon('share', { size: 16 })} Send link</button>
        <button type="button" class="linkbtn small" data-bigscreen-hide>Hide this</button>
      </div>
    </div>
  </section>`;
}

/** Wires the Home card's buttons. Returns a cleanup function. */
export function wireBigScreenCard(root) {
  const onClick = async (event) => {
    if (event.target.closest('[data-bigscreen-share]')) {
      const result = await shareLink('/');
      if (result === 'copied') toast('Link copied. Paste it into a message to yourself.', { type: 'success' });
      else if (result === 'failed') toast('Open purepastpapers.com on your laptop and log in.', { type: 'info' });
    } else if (event.target.closest('[data-bigscreen-hide]')) {
      root.querySelector('[data-bigscreen]')?.remove();
      try {
        await api.setPreference('hideBigScreenCard', true);
      } catch {
        /* ignore */
      }
    }
  };
  root.addEventListener('click', onClick);
  return () => root.removeEventListener('click', onClick);
}

/**
 * Before a long timed paper on a phone: offer to send it to a laptop instead.
 * Resolves true to start here, false if the student chose another route.
 */
export async function confirmLongPaperOnPhone({ minutes, route, title }) {
  if (!isPhone() || !minutes || minutes < 45) return true;
  const signedIn = api.isSignedIn();
  try {
    if (signedIn && api.getProgress().preferences.skipBigScreenPrompt) return true;
  } catch {
    /* ignore */
  }
  const hours = minutes >= 60 ? `${Math.round((minutes / 60) * 10) / 10} hours` : `${minutes} minutes`;
  const choice = await openModal({
    title: 'Sit this on a bigger screen?',
    body: html`<p>${title} runs for ${hours}. Pages are easier to read, and typing is quicker, on a laptop, PC or tablet.</p>
      ${signedIn
        ? html`<p class="small muted">Send yourself the link and log in there. Anything you start here is saved to your account, so you can switch at any point.</p>
            <label class="check small" style="margin-top:12px"><input type="checkbox" data-skip /><span>Don’t ask me again</span></label>`
        : html`<p class="small muted">Make a free account first and the paper, your answers and your marks follow you to the other device.</p>`}`,
    actions: signedIn
      ? [
          { label: 'Sit it here', value: 'here', collect: (dialog) => (dialog.querySelector('[data-skip]')?.checked ? 'here-skip' : 'here') },
          { label: 'Send to my laptop', value: 'send', variant: 'primary' },
        ]
      : [
          { label: 'Sit it here', value: 'here' },
          { label: 'Create a free account', value: 'signup', variant: 'primary' },
        ],
  });
  if (choice === 'here-skip') {
    try {
      await api.setPreference('skipBigScreenPrompt', true);
    } catch {
      /* ignore */
    }
    return true;
  }
  if (choice === 'send') {
    const result = await shareLink(route, { title, text: `Sit ${title} on my laptop` });
    if (result === 'copied') toast('Link copied. Send it to yourself, then log in on your laptop.', { type: 'success' });
    else if (result === 'failed') location.href = emailSelfHref(route, { subject: `Sit ${title} on your laptop`, note: `Sit ${title} on your laptop, PC or tablet:` });
    return false;
  }
  if (choice === 'signup') {
    navigateTo?.(`/signup?next=${encodeURIComponent(route)}`);
    return false;
  }
  return choice === 'here';
}

async function welcomeBigScreen() {
  if (!api.isSignedIn() || deviceClass() === 'phone') return;
  const before = await recordDevice();
  if (!before) return;
  if (before.includes('phone') && !before.includes('desktop') && !before.includes('tablet')) {
    toast('Welcome to the bigger screen. Everything from your phone is here.', { type: 'success', timeout: 6000 });
  }
}

// ───────────────────────────── wiring ─────────────────────────────

/** Call once at start-up, after the shell exists. */
export function installFunnel({ navigate }) {
  navigateTo = navigate;
  document.documentElement.dataset.device = deviceClass();
  addEventListener('resize', () => {
    document.documentElement.dataset.device = deviceClass();
  });
  let lastCount = null;
  api.events.on('progress', (doc) => {
    if (api.isSignedIn() || !doc) return;
    const count = (doc.question_attempts?.length || 0) + (doc.paper_attempts?.length || 0);
    if (lastCount != null && count > lastCount) {
      guestWork += count - lastCount;
      maybeGuestSheet();
    }
    lastCount = count;
  });
  api.events.on('auth', (user) => {
    if (user) {
      closeSheet();
      if (deviceClass() === 'phone') recordDevice();
      else welcomeBigScreen();
    }
  });
  if (api.isSignedIn()) {
    if (deviceClass() === 'phone') recordDevice();
    else welcomeBigScreen();
  }
}

/** Call on every route change. */
export function onRoute(path) {
  currentPath = path;
  const state = load();
  state.views = (state.views || 0) + 1;
  save(state);
  maybeGuestSheet();
}
