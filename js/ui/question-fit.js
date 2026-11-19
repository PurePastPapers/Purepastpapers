// Chooses where the answer box goes and how big the question is drawn, from the question
// itself and the screen, never from the subject.
//
// 1. Draw the question across the full width at a comfortable reading size. If the question
//    and a decent answer box both fit on one screen that way, put the answer box below it
//    (short questions: most essay subjects).
// 2. Otherwise put the answer box beside it, and shrink the question's printed images until
//    the whole question fits the screen height, but never below a legible size (long
//    questions: diagrams, graphs, multi-line data).
// 3. A question too long to fit even then (a page of sources, a printed extract) is drawn
//    at an easy reading size instead, in its own one-screen scroll area beside an answer box
//    of the same height that scrolls separately.
// Phones always stack and fit the width only.
//
// Printed crops often carry the paper's blank working space (a one-line maths question can
// be a whole page tall). That space is not part of the question, so long blank stretches are
// shortened before measuring and showing; the link around the image still opens the original.

const READ_MAX = 0.9; // share of an image's natural (print) width: the comfortable size
const READ_MIN = 0.48; // smallest legible share
const BELOW_MIN = 0.7; // stacking may shrink a question a little, never as far as READ_MIN
const LONG_READ = 0.75; // size for questions that cannot fit a screen at any legible size
export const ANSWER_MIN = 190;
const SIDE_MIN = 360; // narrowest answer column beside a question (matches the CSS)
const SIDE_SHARE = 0.4; // and at least this share of the row, so it is never squeezed // the shortest answer card worth stacking under a question
const PHONE = '(max-width: 900px)';

// Source images get their src after the bundle loads (data-math-image), so wait for it first.
function loaded(img) {
  const ready = () => (img.decode ? img.decode().catch(() => null) : null);
  if (img.getAttribute('src')) return ready();
  return new Promise((resolve) => {
    const done = () => { observer.disconnect(); clearTimeout(timer); resolve(ready()); };
    const observer = new MutationObserver(() => { if (img.getAttribute('src')) done(); });
    const timer = setTimeout(done, 10_000);
    observer.observe(img, { attributes: true, attributeFilter: ['src'] });
  });
}

// ── blank working space ──
const BLANK_RUN = 110; // a blank stretch taller than this (in print pixels) is shortened…
const BLANK_KEEP = 36; // …to this
const shortened = new Map(); // original src → Promise<src to show>

/** Rows with (almost) no ink in the middle of the crop; the margins hold frames and hatching. */
function blankRows(img) {
  const width = img.naturalWidth;
  const height = img.naturalHeight;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  context.drawImage(img, 0, 0);
  const left = Math.round(width * 0.12);
  const band = Math.round(width * 0.73);
  const { data } = context.getImageData(left, 0, band, height); // throws for cross-origin images
  const limit = Math.max(1, band * 0.004);
  const blank = new Uint8Array(height);
  for (let y = 0; y < height; y++) {
    let ink = 0;
    for (let i = y * band * 4, end = i + band * 4; i < end && ink <= limit; i += 4) {
      if (data[i + 3] > 128 && data[i] + data[i + 1] + data[i + 2] < 480) ink++;
    }
    blank[y] = ink <= limit ? 1 : 0;
  }
  return { canvas, blank };
}

async function shorten(img) {
  const { canvas, blank } = blankRows(img);
  const keep = []; // [from, to) row ranges to keep
  let start = 0;
  for (let y = 0; y <= blank.length; y++) {
    if (y < blank.length && blank[y]) continue;
    const run = y - start; // blank rows ending at y
    if (run > BLANK_RUN) keep.push([start, start + BLANK_KEEP / 2], [y - BLANK_KEEP / 2, y]);
    else keep.push([start, y]);
    if (y < blank.length) keep.push([y, y + 1]);
    start = y + 1;
  }
  const height = keep.reduce((total, [from, to]) => total + (to - from), 0);
  if (blank.length - height < 60) return null;
  const out = document.createElement('canvas');
  out.width = canvas.width;
  out.height = height;
  const context = out.getContext('2d');
  let y = 0;
  // merge neighbouring ranges so the copy is a handful of slices, not one per row
  const merged = [];
  for (const range of keep) {
    const last = merged[merged.length - 1];
    if (last && last[1] === range[0]) last[1] = range[1]; else merged.push([...range]);
  }
  for (const [from, to] of merged) {
    context.drawImage(canvas, 0, from, canvas.width, to - from, 0, y, canvas.width, to - from);
    y += to - from;
  }
  const blob = await new Promise((resolve) => out.toBlob(resolve, 'image/png'));
  return blob ? URL.createObjectURL(blob) : null;
}

async function trimBlankSpace(img) {
  const src = img.currentSrc || img.src;
  if (!src || img.dataset.qfitTrimmed || !img.naturalHeight) return;
  if (!shortened.has(src)) shortened.set(src, shorten(img).catch(() => null));
  const url = await shortened.get(src);
  img.dataset.qfitTrimmed = 'true';
  if (!url || !img.isConnected) return;
  img.src = url;
  await (img.decode ? img.decode().catch(() => null) : null);
}

/**
 * Lays out one question and its answer box.
 * @param {HTMLElement} grid    the element holding both; gets data-qlayout="below" | "beside" | "long"
 * @param {object} options
 * @param {HTMLElement} options.body      the question content to scale (images inside it)
 * @param {HTMLElement} options.card      the question's card, whose height must fit
 * @param {() => number} options.available  screen height the card may use
 * @param {number} [options.answer]       height the answer card needs when stacked
 * @param {HTMLElement} [options.side]    the answer column, if its stacked height should count
 */
export async function placeQuestion(grid, { body, card, available, answer = ANSWER_MIN, side = null }) {
  if (!grid || !body || !card) return;
  const images = [...body.querySelectorAll('img')].filter((img) => !img.closest('details'));
  await Promise.all(images.map(loaded));
  await Promise.all(images.map(trimBlankSpace));
  if (!grid.isConnected) return;
  if (window.matchMedia(PHONE).matches) {
    images.forEach((img) => { img.style.width = ''; });
    grid.dataset.qlayout = 'below';
    return;
  }
  let width = 0; // widest the question's images may be in the current layout
  const scale = (k) => {
    images.forEach((img) => { img.style.width = `${Math.round(Math.min(width, (img.naturalWidth || width / READ_MAX) * k))}px`; });
  };
  const fits = (room) => card.offsetHeight <= room;
  // Largest scale in [lo, hi] at which the card fits, or lo if none does.
  const search = (lo, hi, room) => {
    scale(hi);
    if (!images.length || fits(room)) return hi;
    for (let step = 0; step < 12; step++) {
      const mid = (lo + hi) / 2;
      scale(mid);
      if (fits(room)) lo = mid; else hi = mid;
    }
    scale(lo);
    return lo;
  };

  // --qfit-room tells the CSS how tall the answer card can be: the rest of the screen under
  // a stacked question, or the question's height (at most a screen) beside a long one.
  const room = available();
  grid.dataset.qlayout = 'below';
  grid.style.removeProperty('--qfit-room');
  width = body.clientWidth;
  const padding = card.offsetWidth - body.clientWidth;
  if (side) answer = Math.max(answer, side.offsetHeight + 20);
  search(BELOW_MIN, READ_MAX, room - answer);
  if (fits(room - answer)) {
    grid.style.setProperty('--qfit-room', `${Math.max(ANSWER_MIN, room - card.offsetHeight - (answer - ANSWER_MIN))}px`);
    return;
  }
  grid.dataset.qlayout = 'beside';
  const gap = parseFloat(getComputedStyle(grid).columnGap) || 24;
  width = Math.max(240, grid.clientWidth - Math.max(SIDE_MIN, grid.clientWidth * SIDE_SHARE) - gap - padding);
  search(READ_MIN, READ_MAX, room);
  if (!fits(room)) {
    grid.dataset.qlayout = 'long';
    scale(LONG_READ);
    grid.style.setProperty('--qfit-room', `${room}px`);
    return;
  }
  grid.style.setProperty('--qfit-room', `${Math.max(ANSWER_MIN, Math.min(card.offsetHeight, room))}px`);
}
