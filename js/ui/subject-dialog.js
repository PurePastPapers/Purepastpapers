// The "Add <subject>" / "Edit <subject>" dialog (My subjects mockups): pick a colour,
// choose a tier (tiered GCSEs, owner choice 2026-11-17: option A cards), set a target
// grade, and (when adding) choose what to do about learned topics.
// A small preview card on the right shows how the subject will look.
// Subjects with `tier_required` (the GCSE sciences) must be saved with Foundation or Higher:
// there is no "Not decided yet" card and no silent default.

import { html, setHtml } from '../core/dom.js';
import { gradesIn } from '../engine/analytics.js';
import { SUBJECT_SWATCHES, subjectSwatchId, subjectTier, targetGrade } from './subject-colours.js';
import { openModal } from './ui.js';
import { tierRequired } from '../engine/tiers.js';
import { hasModuleRoutes } from '../engine/module-routes.js';
import { readRouteFields, routeFields, savedModuleChoice, wireRouteFields } from './module-scope.js';

const preview = (subject, swatchHex, target, leaves, learningUnit, coveredCount, tier) =>
  html`<p class="hand subject-dialog__how">how it will look</p>
    <div class="card subject-card" style="--sc:${swatchHex}" data-preview>
      <header class="subject-card__band"><h3>${subject.subject}</h3><span class="cdot" aria-hidden="true"></span></header>
      <div class="subject-card__body">
        <p class="subject-card__meta">${subject.level} · ${subject.board} ${subject.spec_code}${Array.isArray(subject.tiers) ? html` · <span data-preview-tier>${tier ? `${tier} tier` : 'Tier not chosen'}</span>` : ''}</p>
        <div class="target"><span class="target__grade" data-preview-grade>${target || '–'}</span><span><span class="target__label">Target grade</span>Last paper: <b>none yet</b></span></div>
        <span class="segbar" aria-hidden="true">${Array.from({ length: 8 }, () => html`<i></i>`)}</span>
        ${subject.has_written_exam && leaves ? html`<p class="subject-card__meta"><span data-preview-covered>${coveredCount}</span>/<span data-preview-leaves>${leaves}</span> ${learningUnit} learned</p>` : ''}
      </div>
    </div>`;

/**
 * @param {{ subject: object, mode: 'add'|'edit', leaves?: number, learningUnit?: string, coveredCount?: number,
 *   initialTier?: string|null, papers?: object[],
 *   tierCounts?: Record<string, { leaves: number, covered: number }>, spec?: object }} options
 *   initialTier  preselected tier (e.g. chosen on the subject page before adding)
 *   papers       the subject's papers, to list each tier's paper codes
 *   tierCounts   learning counts per tier ('' = every tier), so the counts follow the tier picked
 *   spec         the full specification, for subjects with module routes (live topic counts)
 * @returns {Promise<null | { swatch: string, tier: string|null|undefined, target: string|null, learned: 'tick'|'all'|'skip', modules?: object }>}
 */
export function subjectDialog({ subject, mode, leaves = 0, learningUnit = 'spec points', coveredCount = 0, initialTier = null, papers = null, tierCounts = null, spec = null }) {
  const routed = hasModuleRoutes(subject);
  const startModules = routed ? savedModuleChoice(subject) || { levels: [], routes: {}, extra: {} } : null;
  const grades = gradesIn(subject.grade_scheme).filter((grade) => grade !== 'U');
  const startSwatch = subjectSwatchId(subject) || SUBJECT_SWATCHES[0].id;
  const startTarget = mode === 'edit' ? targetGrade(subject) : null;
  const target = startTarget || '';
  const tiers = Array.isArray(subject.tiers) ? subject.tiers : [];
  const required = tierRequired(subject);
  const savedTier = subjectTier(subject);
  const startTier = [initialTier, mode === 'edit' || required ? savedTier : null].find((tier) => tiers.includes(tier)) || '';
  const countsFor = (tier) => tierCounts?.[tier || ''] || { leaves, covered: coveredCount };
  // Paper codes for each tier, from the subject's own papers when they are known.
  const tierCodes = (tier) => {
    const codes = [...new Set((papers || []).filter((paper) => paper.tier === tier && !paper.is_sample).map((paper) => paper.paper_code))]
      .sort((a, b) => a.localeCompare(b, 'en', { numeric: true }));
    return codes.length ? `Papers ${codes.join(', ')}` : null;
  };
  const combined = subject.grade_scheme === 'gcse_combined';
  const TIER_INFO = {
    Foundation: { grades: combined ? 'Grades 1-1 to 5-5' : 'Grades 1 to 5', papers: 'F' },
    Higher: { grades: combined ? 'Grades 4-4 to 9-9' : 'Grades 4 to 9', papers: 'H' },
  };
  const tierCard = (value, title, line1, line2) =>
    html`<label class="tier-pick"><input type="radio" name="tier" value="${value}" ${value === startTier ? 'checked' : ''} /><span class="tier-pick__card"><b>${title}</b><span>${line1}</span><small>${line2}</small></span></label>`;
  let step = 1;
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
        <legend><i>${step++}</i>Pick a colour</legend>
        <p class="step__hint">Used for the subject’s header, its tint and its charts.</p>
        <div class="swatches swatches--row" role="radiogroup" aria-label="Colour">
          ${SUBJECT_SWATCHES.map(
            (swatch) =>
              html`<label class="swatch-pick" title="${swatch.label}"><input type="radio" name="swatch" value="${swatch.id}" ${swatch.id === startSwatch ? 'checked' : ''} /><span class="swatch" style="--sc:${swatch.hex}"></span><span class="sr-only">${swatch.label}</span></label>`,
          )}
        </div>
      </fieldset>
      ${tiers.length
        ? html`<fieldset class="step">
            <legend><i>${step++}</i>Choose your tier</legend>
            <p class="step__hint">${required
              ? 'Choose Foundation or Higher. It sets the specification points, questions, tests and past papers you see. You can change it later.'
              : 'Practice and past papers start with this tier’s questions. Questions printed on both tiers appear in both.'}</p>
            <div class="tier-picks" role="radiogroup" aria-label="Tier" ${required ? 'aria-required="true"' : ''}>
              ${tiers.map((tier) => tierCard(tier, tier, TIER_INFO[tier]?.grades || '', tierCodes(tier) || (TIER_INFO[tier] ? `Papers ${[1, 2, 3].map((n) => `${n}${TIER_INFO[tier].papers}`).join(', ')}` : '')))}
              ${required ? '' : tierCard('', 'Not decided yet', 'Both tiers', 'You can choose later')}
            </div>
          </fieldset>`
        : ''}
      ${routed
        ? html`<fieldset class="step">
            <legend><i>${step++}</i>Choose your qualification and modules</legend>
            <p class="step__hint">Only Pearson’s permitted combinations can be chosen. Your topic list and questions show Core Pure plus these modules; ticks in other modules are kept if you change later.</p>
            ${routeFields(subject, startModules)}
          </fieldset>`
        : ''}
      <fieldset class="step">
        <legend><i>${step++}</i>Set your target grade</legend>
        <p class="step__hint">${combined
          ? 'Combined Science is one double award, so set one grade for all three sciences, from 9-9 down to 1-1. Your papers are rated against it.'
          : 'Your papers are rated against this instead of fixed percentages.'}</p>
        <div class="grade-picks${combined ? ' grade-picks--double' : ''}" role="radiogroup" aria-label="Target grade">
          ${grades.map((grade) => html`<label class="grade-pick"><input type="radio" name="target" value="${grade}" ${grade === target ? 'checked' : ''} /><span>${grade}</span></label>`)}
          <label class="grade-pick grade-pick--unsure"><input type="radio" name="target" value="" ${target ? '' : 'checked'} /><span>Not sure yet</span></label>
        </div>
        <div data-key>${key(target)}</div>
      </fieldset>
      ${mode === 'add' && subject.has_written_exam
        ? html`<fieldset class="step">
            <legend><i>${step++}</i>What have you learned so far?</legend>
            <p class="step__hint">Use the learned-topic filter in practice to limit questions to the topics you’ve ticked.</p>
            <div class="opts">
              <label class="opt"><input type="radio" name="learned" value="tick" checked /><span>Choose what I’ve covered</span><small>opens the topic list next</small></label>
              <label class="opt"><input type="radio" name="learned" value="all" /><span>I’ve covered everything</span><small>ticks all <span data-all-count>${countsFor(startTier).leaves}</span> ${learningUnit}${tiers.length ? html`<span data-all-tier>${startTier ? ` on ${startTier}` : ''}</span>` : ''}${routed ? ' in your chosen modules' : ''}</small></label>
              <label class="opt"><input type="radio" name="learned" value="skip" /><span>Skip for now</span></label>
            </div>
          </fieldset>`
        : ''}
    </div>
    <aside class="subject-dialog__preview">${preview(subject, SUBJECT_SWATCHES.find((s) => s.id === startSwatch).hex, startTarget, countsFor(startTier).leaves, learningUnit, countsFor(startTier).covered, startTier)}</aside>
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
        validate: (dialog) => (required && !dialog.querySelector('input[name="tier"]:checked')?.value
          ? 'Choose Foundation or Higher for this subject.'
          : null),
        collect: (dialog) => ({
          swatch: dialog.querySelector('input[name="swatch"]:checked')?.value || startSwatch,
          tier: tiers.length ? dialog.querySelector('input[name="tier"]:checked')?.value || null : undefined,
          target: dialog.querySelector('input[name="target"]:checked')?.value || null,
          learned: dialog.querySelector('input[name="learned"]:checked')?.value || 'skip',
          ...(routed ? { modules: readRouteFields(dialog, subject, startModules) } : {}),
        }),
      },
    ],
    onOpen: (dialog) => {
      dialog.classList.add('modal--subject');
      if (routed) wireRouteFields(dialog, subject, spec, (choice, scope, count) => {
        const counter = dialog.querySelector('[data-all-count]');
        if (counter && spec) counter.textContent = String(count);
      });
      dialog.addEventListener('change', (event) => {
        const input = event.target;
        if (input.name === 'swatch') {
          dialog.querySelector('[data-preview]').style.setProperty('--sc', SUBJECT_SWATCHES.find((s) => s.id === input.value).hex);
        }
        if (input.name === 'tier') {
          const counts = countsFor(input.value);
          const set = (selector, text) => { const node = dialog.querySelector(selector); if (node) node.textContent = text; };
          set('[data-preview-tier]', input.value ? `${input.value} tier` : 'Tier not chosen');
          set('[data-preview-leaves]', String(counts.leaves));
          set('[data-preview-covered]', String(counts.covered));
          set('[data-all-count]', String(counts.leaves));
          set('[data-all-tier]', input.value ? ` on ${input.value}` : '');
          const error = dialog.querySelector('.modal__error');
          if (error && input.value) error.hidden = true;
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
