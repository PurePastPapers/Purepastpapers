// Light / dark theme. The preference ('light' | 'dark' | 'system') is a per-device
// convenience kept in localStorage; index.html applies it before first paint.

import { APP } from '../config/app.config.js';

const KEY = `${APP.storageNamespace}:theme`;
const systemDark = matchMedia('(prefers-color-scheme: dark)');

export function getThemePreference() {
  try {
    return localStorage.getItem(KEY) || 'system';
  } catch {
    return 'system';
  }
}

export const activeTheme = () => document.documentElement.dataset.theme || 'light';

function apply(preference) {
  const dark = preference === 'dark' || (preference === 'system' && systemDark.matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
}

export function setThemePreference(preference) {
  try {
    localStorage.setItem(KEY, preference);
  } catch {
    /* the theme still applies for this visit */
  }
  apply(preference);
}

export const toggleTheme = () => setThemePreference(activeTheme() === 'dark' ? 'light' : 'dark');

systemDark.addEventListener('change', () => {
  if (getThemePreference() === 'system') apply('system');
});
