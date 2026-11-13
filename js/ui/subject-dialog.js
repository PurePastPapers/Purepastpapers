// The "Add <subject>" / "Edit <subject>" dialog (My subjects mockups): pick a colour,
// set a target grade, and (when adding) choose what to do about learned topics.
// A small preview card on the right shows how the subject will look.

import { html, setHtml } from '../core/dom.js';
import { gradesIn } from '../engine/analytics.js';
import { SUBJECT_SWATCHES, subjectSwatchId, targetGrade } from './subject-colours.js';
import { openModal } from './ui.js';

const preview = (subject, swatchHex, target, leaves) =>
  html`<p class="hand subject-dialog__how">how it will look</p>
    <div class="card subject-card" style="--sc:${swatchHex}" data-preview>
      <header class="subject-card__band"><h3>${subject.subject}</h3><span class="cdot" aria-hidden="true"></span></header>
      <div class="subject-card__body">
        <p class="subject-card__meta">${subject.level} · ${subject.board} ${subject.spec_code}</p>
        <div class="target"><span class="target__grade" data-preview-grade>${target || '–'}</span><span><span class="target__label">Target grade</span>Last paper: <b>none yet</b></span></div>
        <span class="segbar" aria-hidden="true">${Array.from({ length: 8 }, () => html`<i></i>`)}</span>
        ${subject.has_written_exam ? html`<p class="subject-card__meta">0/${leaves} spec points learned</p>` : ''}
      </div>
    </div>`;

/**
 * @param {{ subject: object, mode: 'add'|'edit', leaves?: number }} options
 * @returns {Promise<null | { swatch: string, target: string|null, learned: 'tick'|'all'|'skip' }>}
 */
export function subjectDialog({ subject, mode, leaves = 0 }) {
  const grades = gradesIn(subject.grade_scheme).filter((grade) => grade !== 'U');
  const startSwatch = subjectSwatchId(subject) || SUBJECT_SWATCHES[0].id;
  const startTarget = mode === 'edit' ? targetGrade(subject) : null;
  const target = startTarget || '';
  const below = (grade, steps) => grades[grades.indexOf(grade) + steps];
  const key = (grade) =>
    html`<ul class="band-key">
      <li><span class="band" data-band="exceeding">Exceeding target</span>${grade ? `a paper above ${grade}` : 'a paper above your target'}</li>
      <li><span class="band" data-band="secure">Secure</span>${grade ? `a paper at ${grade}, your target` : 'a paper at your target'}</li>
      <li><span class="band" data-band="developing">Developing</span>${grade && below(grade, 1) ? `one grade below (${below(grade, 1)})` : 'one grade below'}</li>
      <li><span class="band" data-band="needs_work">Needs work</span>two or more grades below</li>
    </ul>`;

  const body = html`<div class="subject-dialog">
    <div class="subject-dialog__steps">
      <p class="muted">${subject.level} · ${subject.board} ${subject.spec_code}. You can change all of this later.</p>
      <fieldset class="step">
        <legend><i>1</i>Pick a colour</legend>
        <p class="step__hint">Used for the subject’s header, its tint and its charts.</p>
        <div class="swatches swatches--row" role="radiogroup" aria-label="Colour">
          ${SUBJECT_SWATCHES.map(
            (swatch) =>
              html`<label class="swatch-pick" title="${swatch.label}"><input type="radio" name="swatch" value="${swatch.id}" ${swatch.id === startSwatch ? 'checked' : ''} /><span class="swatch" style="--sc:${swatch.hex}"></span><span class="sr-only">${swatch.label}</span></label>`,
          )}
        </div>
      </fieldset>
      <fieldset class="step">
        <legend><i>2</i>Set your target grade</legend>
        <p class="step__hint">Your papers are rated against this instead of fixed percentages.</p>
        <div class="grade-picks" role="radiogroup" aria-label="Target grade">
          ${grades.map((grade) => html`<label class="grade-pick"><input type="radio" name="target" value="${grade}" ${grade === target ? 'checked' : ''} /><span>${grade}</span></label>`)}
          <label class="grade-pick grade-pick--unsure"><input type="radio" name="target" value="" ${target ? '' : 'checked'} /><span>Not sure yet</span></label>
        </div>
        <div data-key>${key(target)}</div>
      </fieldset>
      ${mode === 'add' && subject.has_written_exam
        ? html`<fieldset class="step">
            <legend><i>3</i>What have you learned so far?</legend>
            <p class="step__hint">Practice only gives you questions on topics you’ve ticked.</p>
            <div class="opts">
              <label class="opt"><input type="radio" name="learned" value="tick" checked /><span>Tick topics now</span><small>opens the topic list next</small></label>
              <label class="opt"><input type="radio" name="learned" value="all" /><span>I’ve learned everything</span><small>ticks all ${leaves} spec points</small></label>
              <label class="opt"><input type="radio" name="learned" value="skip" /><span>Skip for now</span></label>
            </div>
          </fieldset>`
        : ''}
    </div>
    <aside class="subject-dialog__preview">${preview(subject, SUBJECT_SWATCHES.find((s) => s.id === startSwatch).hex, startTarget, leaves)}</aside>
  </div>`;

  return openModal({
    title: `${mode === 'add' ? 'Add' : 'Edit'} ${subject.subject}`,
    wide: true,
    body,
    actions: [
      { label: 'Cancel', cancel: true },
      {
        label: mode === 'add' ? `Add ${subject.subject}` : 'Save',
        variant: 'primary',
        collect: (dialog) => ({
          swatch: dialog.querySelector('input[name="swatch"]:checked')?.value || startSwatch,
          target: dialog.querySelector('input[name="target"]:checked')?.value || null,
          learned: dialog.querySelector('input[name="learned"]:checked')?.value || 'skip',
        }),
      },
    ],
    onOpen: (dialog) => {
      dialog.classList.add('modal--subject');
      dialog.addEventListener('change', (event) => {
        const input = event.target;
        if (input.name === 'swatch') {
          dialog.querySelector('[data-preview]').style.setProperty('--sc', SUBJECT_SWATCHES.find((s) => s.id === input.value).hex);
        }
        if (input.name === 'target') {
          dialog.querySelector('[data-preview-grade]').textContent = input.value || '–';
          const grade = input.value;
          setHtml(dialog.querySelector('[data-key]'), key(grade));
        }
      });
    },
  });
}
