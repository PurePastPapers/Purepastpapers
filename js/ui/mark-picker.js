// The "what marks did you get" control used when you mark your own answer.
//   1-6 marks → one button per mark value (0 to max).
//   7+ marks  → a slider with − / + buttons and a large readout.
// Either way the chosen value lives in a hidden input carrying the caller's data attribute
// (data-mark or data-marks). The picker fires 'input' and 'change' on that hidden input,
// so the views' existing listeners keep working unchanged.

import { $, $$, html, on } from '../core/dom.js';
import { icon } from './icons.js';

export const BUTTON_LIMIT = 6;

/** Tick labels under the slider. Every mark up to 15 on wide screens; on narrow screens the
 *  in-between labels (is-minor) hide so only about six remain. */
function ticks(max) {
  const step = max <= 15 ? 1 : max <= 30 ? 5 : 10;
  const major = [1, 2, 5, 10, 20].find((n) => max / n <= 6) || 25;
  const out = [];
  for (let n = 0; n <= max; n += step) out.push({ n, minor: n % major !== 0 && n !== max });
  if (out[out.length - 1].n !== max) out.push({ n: max, minor: false });
  return out;
}

/**
 * @param {{ id: string, max: number, value?: string|number|null, attr?: string, label?: string }} options
 *   attr is the data attribute the view reads the value from ('mark' → data-mark).
 */
export function markPicker({ id, max, value = '', attr = 'mark', label }) {
  const set = value !== '' && value != null && !Number.isNaN(Number(value));
  const current = set ? Math.min(max, Math.max(0, Math.round(Number(value)))) : null;
  // The slider's readout already says "out of N", so its label stays short.
  const heading = label ?? (max <= BUTTON_LIMIT ? `Marks awarded out of ${max}` : 'Marks awarded');
  const hidden = html`<input type="hidden" data-${attr}="${id}" value="${set ? current : ''}" />`;

  if (max <= BUTTON_LIMIT) {
    return html`<div class="markpick markpick--buttons" data-markpick data-max="${max}">
      <span class="field__label" id="mp-${id}">${heading}</span>
      ${hidden}
      <div class="markpick__buttons" role="radiogroup" aria-labelledby="mp-${id}">
        ${Array.from({ length: max + 1 }, (_, n) => html`<button type="button" class="markpick__btn" role="radio" aria-checked="${current === n}" data-pick="${n}" aria-label="${n} out of ${max}">${n}</button>`)}
      </div>
    </div>`;
  }

  const fill = set ? (current / max) * 100 : 0;
  return html`<div class="markpick markpick--slider ${set ? '' : 'is-unset'}" data-markpick data-max="${max}" style="--fill:${fill}%">
    <div class="markpick__head">
      <span class="field__label" id="mp-${id}">${heading}</span>
      <output class="markpick__value" data-pick-value aria-live="polite">${set ? html`<b>${current}</b><span> / ${max}</span>` : html`<span class="markpick__hint">Slide to your mark</span>`}</output>
    </div>
    ${hidden}
    <div class="markpick__track">
      <button type="button" class="btn btn--icon btn--sm" data-nudge="-1" aria-label="One mark fewer">${icon('minus', { size: 16 })}</button>
      <div class="markpick__rail">
        <input type="range" class="markpick__range" min="0" max="${max}" step="1" value="${set ? current : 0}" data-pick-range aria-labelledby="mp-${id}" />
        <div class="markpick__ticks" aria-hidden="true">${ticks(max).map(({ n, minor }) => html`<span class="${minor ? 'is-minor' : ''}" style="left:${(n / max) * 100}%">${n}</span>`)}</div>
      </div>
      <button type="button" class="btn btn--icon btn--sm" data-nudge="1" aria-label="One mark more">${icon('plus', { size: 16 })}</button>
    </div>
  </div>`;
}

function apply(picker, raw) {
  const max = Number(picker.dataset.max);
  const value = Math.min(max, Math.max(0, Math.round(Number(raw) || 0)));
  const hidden = $('input[type="hidden"]', picker);
  hidden.value = String(value);
  $$('[data-pick]', picker).forEach((button) => button.setAttribute('aria-checked', String(Number(button.dataset.pick) === value)));
  const range = $('[data-pick-range]', picker);
  if (range) {
    range.value = String(value);
    picker.classList.remove('is-unset');
    picker.style.setProperty('--fill', `${(value / max) * 100}%`);
    $('[data-pick-value]', picker).innerHTML = `<b>${value}</b><span> / ${max}</span>`;
  }
  hidden.dispatchEvent(new Event('input', { bubbles: true }));
  hidden.dispatchEvent(new Event('change', { bubbles: true }));
}

/** Wire every picker inside root (delegated, so redraws are fine). Returns an unbind function. */
export function bindMarkPickers(root) {
  const offs = [
    on(root, 'click', '[data-markpick] [data-pick]', (event, button) => apply(button.closest('[data-markpick]'), button.dataset.pick)),
    on(root, 'click', '[data-markpick] [data-nudge]', (event, button) => {
      const picker = button.closest('[data-markpick]');
      apply(picker, (Number($('input[type="hidden"]', picker).value) || 0) + Number(button.dataset.nudge));
    }),
    on(root, 'input', '[data-pick-range]', (event, range) => apply(range.closest('[data-markpick]'), range.value)),
  ];
  return () => offs.forEach((off) => off());
}
