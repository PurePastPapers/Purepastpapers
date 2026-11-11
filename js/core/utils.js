// Small pure helpers (no DOM, no storage) — safe to import from Node tests.

export const uid = (prefix = 'id') => `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
export const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
export const sum = (list, pick = (x) => x) => list.reduce((total, item) => total + (Number(pick(item)) || 0), 0);
export const uniq = (list) => [...new Set(list)];
export const percent = (part, whole) => (whole > 0 ? (part / whole) * 100 : 0);
export const round1 = (value) => Math.round(value * 10) / 10;

export function groupBy(list, keyOf) {
  const groups = new Map();
  for (const item of list) {
    const key = keyOf(item);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(item);
  }
  return groups;
}

/** Deterministic pseudo-random generator, so a generated test can be reproduced from its seed. */
export function mulberry32(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function shuffle(list, random = Math.random) {
  const copy = [...list];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export const naturalCompare = (a, b) => String(a).localeCompare(String(b), 'en', { numeric: true, sensitivity: 'base' });

export function plural(count, one, many = `${one}s`) {
  return `${count} ${count === 1 ? one : many}`;
}

export function debounce(fn, wait = 250) {
  let timer = null;
  const debounced = (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), wait);
  };
  debounced.flush = (...args) => {
    clearTimeout(timer);
    fn(...args);
  };
  return debounced;
}

// ── dates & durations ──

const DATE = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
const DAY_MONTH = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short' });
const DAY_MS = 86_400_000;

export const fmtDate = (iso) => (iso ? DATE.format(new Date(iso)) : '—');
export const fmtDayMonth = (date) => DAY_MONTH.format(date instanceof Date ? date : new Date(date));

export function fmtRelative(iso, now = Date.now()) {
  if (!iso) return '—';
  const days = Math.floor((startOfDay(new Date(now)) - startOfDay(new Date(iso))) / DAY_MS);
  if (days <= 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days} days ago`;
  return fmtDate(iso);
}

/** 754 → "12:34", 3725 → "1:02:05" */
export function fmtClock(totalSeconds) {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  const pad = (n) => String(n).padStart(2, '0');
  return h ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

/** 105 → "1 h 45 min" */
export function fmtMinutes(minutes) {
  const total = Math.max(0, Math.round(minutes));
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (!h) return `${m} min`;
  return m ? `${h} h ${m} min` : `${h} h`;
}

/** 42 → "42 sec", 754 → "13 min", 6300 → "1 h 45 min" */
export function fmtDuration(seconds) {
  const total = Math.max(0, Math.round(seconds));
  return total < 60 ? `${total} sec` : fmtMinutes(total / 60);
}

export function startOfDay(date) {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy.getTime();
}

/** Monday 00:00 (local time) of the week containing `date`. */
export function startOfWeek(date) {
  const copy = new Date(startOfDay(date));
  copy.setDate(copy.getDate() - ((copy.getDay() + 6) % 7));
  return copy.getTime();
}

export function localDayKey(date) {
  const d = new Date(date);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
