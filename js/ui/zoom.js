// "Enlarge": opens a question, mark scheme or answer box large in the middle of the screen,
// over the page. Mark an area with data-zoom-src="<title>" and put a zoomButton() inside it;
// clicking the button (or an image in the area) opens it. An enlarged answer box edits the
// original one, so the usual autosave keeps working. The magnifying glass buttons in the
// header zoom the view in and out; the percentage between them goes back to 100% (fit width).

import { html } from '../core/dom.js';
import { icon } from './icons.js';

export const ZOOM_LEVELS = [50, 75, 100, 125, 150, 175, 200, 250, 300];
const PHONE = '(max-width: 720px)';

export const zoomButton = (what) =>
  html`<button type="button" class="zoom-btn" data-zoom aria-label="Enlarge the ${what}" title="Enlarge">${icon('expand', { size: 15 })}<span>Enlarge</span></button>`;

function open(source) {
  const title = source.dataset.zoomSrc || 'Enlarged view';
  const original = source.querySelector('textarea');
  const dialog = document.createElement('dialog');
  dialog.className = 'modal zoom';
  dialog.setAttribute('aria-label', title);
  dialog.innerHTML = `<div class="modal__box"><header class="modal__head zoom__head"><h2 class="modal__title zoom__title"></h2>
    <span class="zoom__tools"><span class="zoom__scale" role="group" aria-label="Zoom">
      <button type="button" class="zoom__step" data-zoom-step="-1" aria-label="Zoom out" title="Zoom out">${icon('zoomOut', { size: 18 })}</button>
      <button type="button" class="zoom__pct" data-zoom-reset aria-label="Zoom level, press to reset to 100%" title="Back to 100%" aria-live="polite">100%</button>
      <button type="button" class="zoom__step" data-zoom-step="1" aria-label="Zoom in" title="Zoom in">${icon('zoomIn', { size: 18 })}</button>
    </span><button type="button" class="btn btn--sm" data-zoom-close>Close</button></span><p class="zoom__hint small muted">Drag to move around</p></header><div class="modal__body zoom__body"></div></div>`;
  dialog.querySelector('.zoom__title').textContent = title;
  const body = dialog.querySelector('.zoom__body');
  if (original) {
    const big = document.createElement('textarea');
    big.className = 'textarea zoom__answer';
    big.value = original.value;
    big.placeholder = original.placeholder;
    big.setAttribute('aria-label', title);
    big.addEventListener('input', () => {
      original.value = big.value;
      original.dispatchEvent(new Event('input', { bubbles: true }));
    });
    body.append(big);
  } else {
    const copy = (source.querySelector('[data-zoom-body]') || source).cloneNode(true);
    copy.removeAttribute('data-zoom-body');
    copy.removeAttribute('data-zoom-src');
    copy.querySelectorAll('.zoom-btn, .qsplit__label, .qsplit__head, button, input, select, textarea').forEach((node) => node.remove());
    // Question images are links to the full-size image; inside Enlarge a click or the end of a
    // drag would follow them and open it in a new tab, so keep just the image.
    copy.querySelectorAll('a:has(img)').forEach((link) => link.replaceWith(...link.childNodes));
    // The page sizes question images to fit the screen (question-fit.js); Enlarge has its own scale.
    copy.querySelectorAll('img').forEach((img) => img.style.removeProperty('width'));
    copy.classList.add('zoom__content');
    body.append(copy);
    if (copy.querySelector('img')) dialog.classList.add('zoom--image');
  }

  // Images on a phone open at 200% (readable, drag to move); everything else at 100%.
  let level = dialog.classList.contains('zoom--image') && matchMedia(PHONE).matches ? 200 : 100;
  const pct = dialog.querySelector('[data-zoom-reset]');
  const setLevel = (next) => {
    const { scrollLeft, scrollTop, scrollWidth, scrollHeight, clientWidth, clientHeight } = body;
    const cx = (scrollLeft + clientWidth / 2) / (scrollWidth || 1);
    const cy = (scrollTop + clientHeight / 2) / (scrollHeight || 1);
    level = next;
    dialog.style.setProperty('--zoom', String(level / 100));
    dialog.classList.toggle('zoom--in', level > 100);
    pct.textContent = `${level}%`;
    dialog.querySelector('[data-zoom-step="-1"]').disabled = level === ZOOM_LEVELS[0];
    dialog.querySelector('[data-zoom-step="1"]').disabled = level === ZOOM_LEVELS.at(-1);
    // Keep the same spot in the middle of the view while zooming.
    body.scrollLeft = cx * body.scrollWidth - body.clientWidth / 2;
    body.scrollTop = cy * body.scrollHeight - body.clientHeight / 2;
  };
  const step = (dir) => {
    const i = ZOOM_LEVELS.indexOf(level);
    setLevel(ZOOM_LEVELS[Math.min(ZOOM_LEVELS.length - 1, Math.max(0, i + dir))]);
  };

  // A mouse can drag a zoomed-in question around (touch screens already scroll by dragging).
  body.addEventListener('pointerdown', (event) => {
    if (event.pointerType !== 'mouse' || event.button !== 0 || !dialog.classList.contains('zoom--image')) return;
    if (body.scrollWidth <= body.clientWidth && body.scrollHeight <= body.clientHeight) return;
    const start = { x: event.clientX, y: event.clientY, left: body.scrollLeft, top: body.scrollTop };
    event.preventDefault();
    body.classList.add('is-dragging');
    const move = (e) => { body.scrollLeft = start.left - (e.clientX - start.x); body.scrollTop = start.top - (e.clientY - start.y); };
    const up = () => { body.classList.remove('is-dragging'); removeEventListener('pointermove', move); removeEventListener('pointerup', up); };
    addEventListener('pointermove', move);
    addEventListener('pointerup', up);
  });

  body.addEventListener('dragstart', (event) => event.preventDefault());

  const close = () => { dialog.close(); dialog.remove(); };
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog || event.target.closest('[data-zoom-close]')) return close();
    const stepper = event.target.closest('[data-zoom-step]');
    if (stepper) return step(Number(stepper.dataset.zoomStep));
    if (event.target.closest('[data-zoom-reset]')) setLevel(100);
  });
  dialog.addEventListener('keydown', (event) => {
    if (event.target.closest('textarea') || event.ctrlKey || event.metaKey || event.altKey) return;
    if (event.key === '+' || event.key === '=') { event.preventDefault(); step(1); }
    else if (event.key === '-') { event.preventDefault(); step(-1); }
    else if (event.key === '0') { event.preventDefault(); setLevel(100); }
  });
  dialog.addEventListener('cancel', (event) => { event.preventDefault(); close(); });
  document.body.append(dialog);
  dialog.showModal();
  setLevel(level);
  if (original) { const big = body.querySelector('textarea'); big.focus(); big.setSelectionRange(big.value.length, big.value.length); }
}

/** Installs the click handlers once for the whole app. */
export function installZoom() {
  document.addEventListener('click', (event) => {
    const button = event.target.closest?.('[data-zoom]');
    const image = !button && event.target.closest?.('[data-zoom-src] img');
    const source = (button || image)?.closest('[data-zoom-src]');
    if (!source || source.closest('dialog')) return;
    event.preventDefault();
    open(source);
  });
}
