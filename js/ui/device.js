// What kind of screen the student is on, and the "move to a bigger screen" link helpers.
// Phones get the quick stuff (single questions, marking, ticking off topics); full timed
// papers, the test builder and the Data Hub are better on a laptop, PC or tablet, so the
// funnel (js/ui/funnel.js) uses these to suggest the move at sensible moments.

import { APP } from '../config/app.config.js';
import * as api from '../data/api.js';

const mq = (query) => typeof matchMedia === 'function' && matchMedia(query).matches;

/** 'phone' | 'tablet' | 'desktop'. Width-based first so DevTools emulation behaves. */
export function deviceClass() {
  const touch = mq('(pointer: coarse)') || mq('(hover: none)');
  const shortSide = typeof screen !== 'undefined' ? Math.min(screen.width, screen.height) : innerWidth;
  if (mq('(max-width: 700px)') && (touch || shortSide < 600)) return 'phone';
  if (touch && shortSide < 600) return 'phone';
  if (touch) return 'tablet';
  return 'desktop';
}

export const isPhone = () => deviceClass() === 'phone';
export const isBigScreen = () => deviceClass() !== 'phone';

/** The public address of a route, for sending to another device ("/papers" → https://…/#/papers). */
export function publicUrl(route = '/') {
  const origin = location.protocol.startsWith('http') && !/^(localhost|127\.)/.test(location.hostname) ? location.origin : `https://${APP.domain || 'purepastpapers.com'}`;
  const path = route === '/' ? '' : `#${route}`;
  return `${origin}/${path}`;
}

/** A mailto: link that sends this page to the student's own inbox, to open on a laptop. */
export function emailSelfHref(route, { subject = 'Open PurePastPapers on your laptop', note = '' } = {}) {
  const user = api.currentUser();
  const to = user && !user.is_demo && user.email ? user.email : '';
  const body = [
    note || 'Open this on your laptop, PC or tablet:',
    publicUrl(route),
    '',
    user && !user.is_demo ? `Log in with ${user.email || 'your account'} and everything you did on your phone is already there.` : 'Create a free account and your marks and topics follow you to every device.',
  ].join('\n');
  return `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

/**
 * Shares a link with the system share sheet (AirDrop, Messages, WhatsApp…), falling back to the
 * clipboard. Resolves 'shared' | 'copied' | 'cancelled' | 'failed'.
 */
export async function shareLink(route, { title = APP.name, text = 'Carry on on my laptop' } = {}) {
  const url = publicUrl(route);
  if (navigator.share) {
    try {
      await navigator.share({ title, text, url });
      return 'shared';
    } catch (error) {
      if (error?.name === 'AbortError') return 'cancelled';
    }
  }
  try {
    await navigator.clipboard.writeText(url);
    return 'copied';
  } catch {
    return 'failed';
  }
}

/**
 * Remembers which kinds of device a signed-in student has used (synced with their progress,
 * so a phone can tell whether they have tried a laptop yet). Returns the device classes seen
 * before this visit.
 */
export async function recordDevice() {
  if (!api.isSignedIn()) return null;
  const user = api.currentUser();
  if (user.is_demo) return null;
  let preferences;
  try {
    preferences = api.getProgress().preferences;
  } catch {
    return null;
  }
  const seen = { ...(preferences.devicesSeen || {}) };
  const before = Object.keys(seen);
  const kind = deviceClass();
  const today = new Date().toISOString().slice(0, 10);
  if (seen[kind] !== today) {
    seen[kind] = today;
    try {
      await api.setPreference('devicesSeen', seen);
    } catch {
      /* best effort */
    }
  }
  return before;
}

/** True once a signed-in student has used PurePastPapers on a laptop, PC or tablet. */
export function hasUsedBigScreen() {
  try {
    const seen = api.getProgress().preferences.devicesSeen || {};
    return Boolean(seen.desktop || seen.tablet);
  } catch {
    return false;
  }
}

/** Where an account keeps progress, for sign-up copy: every device when cloud sync is on. */
export const savedWhere = () => (api.backendInfo().cloudConfigured ? 'on every device you log in on' : 'in this browser');

/**
 * Tables marked `.table--stack` turn into labelled cards on phones (see css/devices.css).
 * Each cell needs a data-label naming its column; this fills them in from the header row
 * whenever such a table is drawn, so views don't have to.
 */
export function installStackedTables(root = document.body) {
  const label = (table) => {
    // Columns whose header is only for screen readers ("Open", "Actions") get no visible label.
    const heads = [...table.querySelectorAll('thead th')].map((th) => (th.querySelector('.sr-only')?.textContent.trim() === th.textContent.trim() ? '' : th.textContent.trim()));
    for (const row of table.querySelectorAll('tbody tr')) {
      [...row.children].forEach((cell, index) => {
        if (!cell.hasAttribute('data-label')) cell.setAttribute('data-label', heads[index] || '');
      });
    }
  };
  const scan = () => root.querySelectorAll('table.table--stack').forEach(label);
  let pending = 0;
  new MutationObserver(() => {
    if (!pending) pending = requestAnimationFrame(() => ((pending = 0), scan()));
  }).observe(root, { childList: true, subtree: true });
  scan();
}
