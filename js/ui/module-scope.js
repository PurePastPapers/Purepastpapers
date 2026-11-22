// Module routes UI for subjects with optional modules (Edexcel Further Mathematics).
//
// Students choose (1) which qualification(s) they study, (2) one official route per
// qualification, shown as route cards so only Pearson's permitted combinations can be
// picked, and optionally (3) extra modules for practice that do not change the grade
// route. The topic tree and question/paper pools then show Core Pure plus the chosen
// modules only. Ticks in hidden modules are kept, never cleared.

import { $$, html } from '../core/dom.js';
import * as api from '../data/api.js';
import {
  describeScope, hasModuleRoutes, levelCodes, levelLabel, moduleById, normaliseChoice, optionalModules, routeByCode, routesFor, scopeLeaves, scopeOf,
} from '../engine/module-routes.js';
import { banner, openModal } from './ui.js';

const PREF = 'moduleRoutes';

/** The saved (cleaned) choice for a subject, or null. */
export function savedModuleChoice(subject) {
  const raw = safePreferences()?.[PREF]?.[subject.subject_id];
  return raw ? normaliseChoice(subject, raw) : null;
}

function safePreferences() {
  try {
    return api.getProgress().preferences;
  } catch {
    return null;
  }
}

/** Saves a subject's module choice. Learned ticks are untouched. */
export async function saveModuleChoice(subjectId, choice) {
  const current = { ...(safePreferences()?.[PREF] || {}) };
  if (choice) current[subjectId] = choice;
  else delete current[subjectId];
  await api.setPreference(PREF, current);
}

const moduleTitles = (subject, ids) => ids.map((id) => moduleById(subject, id)?.title || id).join(' + ');

/** The route-card fields. Values are read back with readRouteFields. */
export function routeFields(subject, choice) {
  const clean = normaliseChoice(subject, choice || {});
  const levels = levelCodes(subject);
  const optional = optionalModules(subject);
  const rules = subject.module_routes?.rules || {};
  return html`<div class="route-fields" data-route-fields>
    <div class="route-levels" role="group" aria-label="Qualifications">
      ${levels.map((level) => html`<label class="opt"><input type="checkbox" name="route-level" value="${level}" ${clean.levels.includes(level) ? 'checked' : ''} /><span>${levelLabel(subject, level)} (${level})</span><small>${level === levels[0] ? 'full A-Level' : 'standalone AS'}</small></label>`)}
    </div>
    ${levels.map((level) => html`<fieldset class="route-level" data-route-level="${level}" ${clean.levels.includes(level) ? '' : 'hidden'}>
      <legend class="field__label">${levelLabel(subject, level)} ${level}: choose your optional modules</legend>
      ${rules[level] ? html`<p class="step__hint">${rules[level]} Core Pure is always included.</p>` : ''}
      <div class="tier-picks route-picks" role="radiogroup" aria-label="${levelLabel(subject, level)} route">
        ${routesFor(subject, level).map((route) => html`<label class="tier-pick"><input type="radio" name="route-${level}" value="${route.code}" ${clean.routes[level] === route.code ? 'checked' : ''} /><span class="tier-pick__card"><b>${route.label}</b><span>${moduleTitles(subject, route.modules)}</span></span></label>`)}
        <label class="tier-pick"><input type="radio" name="route-${level}" value="" ${clean.routes[level] ? '' : 'checked'} /><span class="tier-pick__card"><b>Not decided yet</b><span>Core Pure only until you choose</span></span></label>
      </div>
      <details class="route-extra" ${clean.extra[level]?.length ? 'open' : ''}>
        <summary class="small">Studying extra modules too? (practice only, not your exam route)</summary>
        <div class="chips">
          ${optional.map((id) => html`<label class="opt opt--sm"><input type="checkbox" name="route-extra-${level}" value="${id}" ${clean.extra[level]?.includes(id) ? 'checked' : ''} /><span>${moduleById(subject, id).title}</span></label>`)}
        </div>
      </details>
    </fieldset>`)}
    <p class="small muted" data-route-summary aria-live="polite"></p>
  </div>`;
}

/** Reads the current (cleaned) choice from route fields inside `root`. */
export function readRouteFields(root, subject, base = {}) {
  const levels = $$('input[name="route-level"]:checked', root).map((input) => input.value);
  const routes = {};
  const extra = {};
  for (const level of levels) {
    routes[level] = root.querySelector(`input[name="route-${level}"]:checked`)?.value || null;
    extra[level] = $$(`input[name="route-extra-${level}"]:checked`, root).map((input) => input.value);
  }
  return normaliseChoice(subject, { levels, routes, extra, showAll: Boolean(base.showAll) });
}

/** Keeps the route fields consistent: shows a level's routes only when it is ticked, disables
 * extras already in the route, and reports how many topics the tree will show. */
export function wireRouteFields(root, subject, spec, onChange = () => {}) {
  const fields = root.querySelector('[data-route-fields]');
  if (!fields) return () => null;
  const update = () => {
    const choice = readRouteFields(fields, subject);
    for (const group of $$('[data-route-level]', fields)) group.hidden = !choice.levels.includes(group.dataset.routeLevel);
    for (const level of levelCodes(subject)) {
      const inRoute = new Set(routeByCode(subject, level, choice.routes[level])?.modules || []);
      for (const box of $$(`input[name="route-extra-${level}"]`, fields)) {
        box.disabled = inRoute.has(box.value);
        if (box.disabled) box.checked = false;
      }
    }
    const scope = scopeOf(subject, choice);
    const count = spec ? scopeLeaves(spec, scope).length : 0;
    const summary = fields.querySelector('[data-route-summary]');
    if (summary) {
      summary.textContent = !choice.levels.length
        ? 'Tick A-Level, AS or both.'
        : `${describeScope(subject, scope)}. Your topic list will show ${count} specification points.`;
    }
    onChange(choice, scope, count);
    return choice;
  };
  fields.addEventListener('change', update);
  update();
  return update;
}

/** Standalone "Change modules" dialog. Resolves to the new choice, or null on cancel. */
export function moduleRouteDialog({ subject, spec, choice }) {
  return openModal({
    title: `${subject.subject}: your modules`,
    wide: true,
    body: html`<p class="muted">Choose what you study. Ticks you have saved in other modules are kept and come back if you choose those modules again.</p>${routeFields(subject, choice)}`,
    actions: [
      { label: 'Cancel', cancel: true },
      { label: 'Save modules', variant: 'primary', collect: (dialog) => readRouteFields(dialog, subject, choice || {}) },
    ],
    onOpen: (dialog) => wireRouteFields(dialog, subject, spec),
  });
}

/**
 * The notice above papers/practice/topic lists for subjects with module routes:
 * prompts for a route when none is saved, otherwise names the route and offers the
 * deliberate "All options" view.
 */
export function moduleScopeBanner(bundle) {
  const { subject, scope } = bundle || {};
  if (!hasModuleRoutes(subject) || !scope) return '';
  const id = subject.subject_id;
  if (!safePreferences()) return '';
  if (!scope.configured) {
    const description = scope.showAll ? 'Showing every optional module.' : 'Showing Core Pure and any modules you have selected.';
    return banner(html`<b>Choose your ${subject.subject} modules.</b> ${description} <button type="button" class="linkbtn" data-module-routes="${id}">Choose modules</button> · <button type="button" class="linkbtn" data-module-showall="${id}" data-value="${scope.showAll ? '' : '1'}">${scope.showAll ? 'Hide other options' : 'Show all options'}</button>`, { type: 'warn' });
  }
  return banner(html`${scope.showAll ? html`<b>Showing every optional module.</b> ` : html`<b>Your modules:</b> `}${describeScope(subject, scope)}. <button type="button" class="linkbtn" data-module-routes="${id}">Change modules</button> · <button type="button" class="linkbtn" data-module-showall="${id}" data-value="${scope.showAll ? '' : '1'}">${scope.showAll ? 'Back to my modules only' : 'Show all options'}</button>`);
}

/** One delegated handler for the banner buttons; re-renders the current view after saving. */
export function installModuleScopeHandlers({ getSubject, getSpec }) {
  document.addEventListener('click', async (event) => {
    const routes = event.target.closest?.('[data-module-routes]');
    const showAll = event.target.closest?.('[data-module-showall]');
    if (!routes && !showAll) return;
    event.preventDefault();
    const subjectId = (routes || showAll).dataset.moduleRoutes || (routes || showAll).dataset.moduleShowall;
    const subject = await getSubject(subjectId);
    if (!subject) return;
    const current = savedModuleChoice(subject) || { levels: [], routes: {}, extra: {} };
    let next;
    if (routes) {
      next = await moduleRouteDialog({ subject, spec: await getSpec(subjectId), choice: current });
      if (!next) return;
      next.showAll = false; // saving a route returns to the route-only view
    } else {
      next = { ...current, showAll: showAll.dataset.value === '1' };
    }
    await saveModuleChoice(subjectId, next);
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  });
}
