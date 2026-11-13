// Shared UI pieces: toasts, dialogs and the small render helpers every view uses
// (badges, RAG labels, difficulty pips, meters, empty states, page headers).

import { DIFFICULTY_BY_ID, PAPER_TYPES, RAG_LABELS, SOURCE_TYPES } from '../config/app.config.js';
import { FEATURES } from '../config/phases.js';
import { $, html, raw, setHtml } from '../core/dom.js';
import { clamp } from '../core/utils.js';
import { icon } from './icons.js';
import { subjectColour } from './subject-colours.js';

const clampPercent = (value) => clamp(Number(value) || 0, 0, 100);

// ───────────────────────────────── toasts ─────────────────────────────────

function toastRegion() {
  let region = $('.toasts');
  if (!region) {
    region = document.createElement('div');
    region.className = 'toasts';
    region.setAttribute('role', 'status');
    region.setAttribute('aria-live', 'polite');
    document.body.append(region);
  }
  return region;
}

/** @param {'info'|'success'|'error'} type */
export function toast(message, { type = 'info', timeout = 3600 } = {}) {
  const item = document.createElement('div');
  item.className = `toast toast--${type}`;
  setHtml(item, html`${icon(type === 'success' ? 'checkCircle' : type === 'error' ? 'alert' : 'info')}<span>${message}</span>`);
  toastRegion().append(item);
  setTimeout(() => {
    item.classList.add('is-leaving');
    setTimeout(() => item.remove(), 220);
  }, timeout);
}

// ───────────────────────────────── dialogs ─────────────────────────────────

/**
 * Opens a modal dialog and resolves when it closes.
 * actions: [{ label, value, variant?, cancel?, validate?(dialog) → error string | null, collect?(dialog) → any }]
 *   - `cancel` actions close without validating and resolve null
 *   - the first non-cancel action is the default (Enter key)
 * Resolves with the chosen action's collect() result or value, or null when dismissed.
 */
export function openModal({ title, body, actions = [{ label: 'Close', cancel: true }], wide = false, onOpen = null }) {
  return new Promise((resolve) => {
    const dialog = document.createElement('dialog');
    dialog.className = `modal${wide ? ' modal--wide' : ''}`;
    setHtml(
      dialog,
      html`<form method="dialog" class="modal__box" novalidate>
        <header class="modal__head">
          <h2 class="modal__title">${title}</h2>
          <button type="button" class="btn btn--icon btn--ghost" data-dismiss aria-label="Close">${icon('x')}</button>
        </header>
        <div class="modal__body">${body}</div>
        <p class="modal__error" role="alert" hidden></p>
        <footer class="modal__foot">
          ${actions.map(
            (action, index) =>
              html`<button
                type="${action.cancel ? 'button' : 'submit'}"
                class="btn ${action.variant ? `btn--${action.variant}` : ''}"
                value="${index}"
                ${action.cancel ? raw('data-dismiss') : ''}
              >
                ${action.label}
              </button>`,
          )}
        </footer>
      </form>`,
    );
    document.body.append(dialog);

    // Settle straight away rather than waiting for the dialog's own "close" event, which
    // browsers may delay while the page is not being painted (for example a background tab).
    let settled = false;
    const settle = (result) => {
      if (settled) return;
      settled = true;
      if (dialog.open) dialog.close();
      dialog.remove();
      resolve(result);
    };
    const errorLine = $('.modal__error', dialog);
    $('form', dialog).addEventListener('submit', (event) => {
      event.preventDefault();
      const action = actions[Number(event.submitter?.value)] || actions.find((candidate) => !candidate.cancel);
      const problem = action?.validate?.(dialog) || null;
      if (problem) {
        errorLine.textContent = problem;
        errorLine.hidden = false;
        return;
      }
      settle(action?.collect ? action.collect(dialog) : action?.value ?? true);
    });
    dialog.addEventListener('click', (event) => {
      if (event.target === dialog || event.target.closest('[data-dismiss]')) settle(null);
    });
    dialog.addEventListener('cancel', (event) => {
      event.preventDefault(); // Escape key
      settle(null);
    });
    dialog.addEventListener('close', () => settle(null));
    onOpen?.(dialog);
    dialog.showModal();
  });
}

export async function confirmDialog({ title, message, confirmLabel = 'Confirm', cancelLabel = 'Cancel', danger = false }) {
  const answer = await openModal({
    title,
    body: html`<p>${message}</p>`,
    actions: [
      { label: cancelLabel, cancel: true },
      { label: confirmLabel, value: true, variant: danger ? 'danger' : 'primary' },
    ],
  });
  return answer === true;
}

// ───────────────────────────────── labels & badges ─────────────────────────────────

export const fmtPercent = (percentage) => (percentage == null || Number.isNaN(percentage) ? '—' : `${Math.round(percentage)}%`);

/** "A-Level Mathematics", "GCSE Geography", "Level 3 Sport" */
export const subjectName = (subject) => `${subject.level} ${subject.subject}`;

export function difficultyBadge(id) {
  const difficulty = DIFFICULTY_BY_ID[id];
  if (!difficulty) return '';
  return html`<span class="diff" data-level="${difficulty.level}" title="${difficulty.description}">
    <span class="diff__pips" aria-hidden="true"><i></i><i></i><i></i><i></i></span>${difficulty.label}
  </span>`;
}

const RAG_ICONS = { green: 'checkCircle', amber: 'minusCircle', red: 'xCircle', none: 'circle' };

/** Status is never colour alone: icon + percentage or label. */
export function ragBadge(rag, percentage = null, { label = true } = {}) {
  const text = [percentage != null ? fmtPercent(percentage) : null, label ? RAG_LABELS[rag] : null].filter(Boolean).join(' · ');
  return html`<span class="rag" data-rag="${rag}">${icon(RAG_ICONS[rag] || 'circle', { size: 15 })}<span>${text}</span></span>`;
}

/** Where a question or paper comes from. Demo content is always labelled as such. */
export function sourceBadge(item) {
  if (item.is_sample) return html`<span class="badge badge--demo" title="Written for this build. Not from an official exam paper.">Demo content</span>`;
  const type = item.source_type || item.paper_type;
  if (type === 'user_custom_test') return html`<span class="badge">${PAPER_TYPES.user_custom_test.label}</span>`;
  const label = SOURCE_TYPES[type]?.short || PAPER_TYPES[type]?.label || type;
  return html`<span class="badge ${type === 'real_past_paper' ? 'badge--official' : 'badge--ai'}">${label}</span>`;
}

export const soonBadge = (feature) =>
  html`<span class="badge badge--soon">Coming soon · Phase ${FEATURES[feature]?.phase ?? ''}</span>`;

export const liveBadge = () => html`<span class="badge badge--live">Live</span>`;

/** A small square in the subject's chosen colour. */
export const groupDot = (subject) =>
  html`<span class="dot" data-subject-id="${subject.subject_id}" style="--sc:${subjectColour(subject)}" aria-hidden="true"></span>`;

// ───────────────────────────────── building blocks ─────────────────────────────────

/** A ratio bar. The fill carries the RAG state; the text beside it carries the value. */
export function meter(percentage, rag = 'none', label = '') {
  return html`<span class="meter" role="img" aria-label="${label || fmtPercent(percentage)}">
    <span class="meter__fill" data-rag="${rag}" style="width:${clampPercent(percentage)}%"></span>
  </span>`;
}

export function emptyState({ iconName = 'info', title, text = '', action = null }) {
  return html`<div class="empty">
    <span class="empty__icon">${icon(iconName, { size: 26 })}</span>
    <h3 class="empty__title">${title}</h3>
    ${text ? html`<p class="empty__text">${text}</p>` : ''} ${action || ''}
  </div>`;
}

/**
 * @param {{ title: string, sub?: any, actions?: any, crumbs?: {label: string, href?: string}[], badge?: any }} options
 */
export function pageHead({ title, sub = '', actions = '', crumbs = null, badge = '' }) {
  return html`<header class="page-head">
    <div class="page-head__text">
      ${crumbs
        ? html`<nav class="crumbs" aria-label="Breadcrumb">
            ${crumbs.map((crumb, index) =>
              html`${index ? html`<span aria-hidden="true">/</span>` : ''}${crumb.href
                ? html`<a href="${crumb.href}">${crumb.label}</a>`
                : html`<span>${crumb.label}</span>`}`,
            )}
          </nav>`
        : ''}
      <h1 class="page-head__title" tabindex="-1">${title} ${badge}</h1>
      ${sub ? html`<p class="page-head__sub">${sub}</p>` : ''}
    </div>
    ${actions ? html`<div class="page-head__actions">${actions}</div>` : ''}
  </header>`;
}

export const banner = (content, { type = 'info', iconName = null } = {}) =>
  html`<div class="banner banner--${type}">
    ${icon(iconName || (type === 'warn' || type === 'error' ? 'alert' : 'info'))}
    <div class="banner__body">${content}</div>
  </div>`;

export const loadingBlock = (label = 'Loading…') =>
  html`<div class="loading" role="status"><span class="loading__spinner" aria-hidden="true"></span>${label}</div>`;
