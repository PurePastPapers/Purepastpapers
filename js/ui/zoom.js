// "Enlarge": opens a question, mark scheme or answer box large in the middle of the screen,
// over the page. Mark an area with data-zoom-src="<title>" and put a zoomButton() inside it;
// clicking the button (or an image in the area) opens it. An enlarged answer box edits the
// original one, so the usual autosave keeps working.

import { html } from '../core/dom.js';
import { icon } from './icons.js';

export const zoomButton = (what) =>
  html`<button type="button" class="zoom-btn" data-zoom aria-label="Enlarge the ${what}" title="Enlarge">${icon('expand', { size: 15 })}<span>Enlarge</span></button>`;

function open(source) {
  const title = source.dataset.zoomSrc || 'Enlarged view';
  const original = source.querySelector('textarea');
  const dialog = document.createElement('dialog');
  dialog.className = 'modal zoom';
  dialog.setAttribute('aria-label', title);
  dialog.innerHTML = `<div class="modal__box"><header class="modal__head zoom__head"><h2 class="modal__title zoom__title"></h2>
    <span class="zoom__tools"><button type="button" class="btn btn--sm zoom__fit" data-zoom-fit aria-pressed="false">Fit to screen</button>
    <button type="button" class="btn btn--sm" data-zoom-close>Close</button></span><p class="zoom__hint small muted">Drag to move around</p></header><div class="modal__body zoom__body"></div></div>`;
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
    copy.querySelectorAll('.zoom-btn, .qsplit__label, button, input, select, textarea').forEach((node) => node.remove());
    copy.classList.add('zoom__content');
    body.append(copy);
    if (copy.querySelector('img')) dialog.classList.add('zoom--image');
  }
  const close = () => { dialog.close(); dialog.remove(); };
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog || event.target.closest('[data-zoom-close]')) return close();
    const fit = event.target.closest('[data-zoom-fit]');
    if (fit) {
      const fitted = dialog.classList.toggle('zoom--fit');
      fit.setAttribute('aria-pressed', String(fitted));
      fit.textContent = fitted ? 'Zoom in' : 'Fit to screen';
      dialog.querySelector('.zoom__hint').textContent = fitted ? 'Showing the whole question' : 'Drag to move around';
    }
  });
  dialog.addEventListener('cancel', (event) => { event.preventDefault(); close(); });
  document.body.append(dialog);
  dialog.showModal();
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
