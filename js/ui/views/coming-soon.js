// Placeholder page for a section that belongs to a later phase (PRD sections 5–7).
// The route, navigation entry and data model already exist; flipping the feature flag in
// js/config/phases.js replaces this page with the real section.

import { FEATURES, isEnabled, phaseOf } from '../../config/phases.js';
import { html, setHtml } from '../../core/dom.js';
import * as api from '../../data/api.js';
import { icon } from '../icons.js';
import { liveBadge, pageHead, soonBadge } from '../ui.js';
import { roadmap } from './landing.js';

const ICONS = { aiPastPapers: 'sparkle', predictedPapers: 'target', aiMarking: 'checkCircle' };

export async function mount(element, context) {
  const key = context.options.feature;
  const feature = FEATURES[key];
  const phase = phaseOf(key);
  context.setTitle(feature.title);
  const signedIn = api.isSignedIn();
  const live = isEnabled(key); // a capability with no page of its own (AI marking) still lands here once live

  setHtml(
    element,
    html`${pageHead({ title: feature.title, badge: live ? liveBadge() : soonBadge(key), sub: feature.lead })}
      <div class="grid grid--2">
        <div class="card ${live ? '' : 'card--soon'}">
          <p class="soon-mark">${icon(ICONS[key] || 'sparkle', { size: 30 })}</p>
          <h2 class="h2">${live ? `Part of Phase ${phase.id}` : `Coming in Phase ${phase.id}`}</h2>
          <p class="muted">${phase.summary}</p>
          <ul class="ticklist">
            ${feature.points.map((point) => html`<li>${icon('check', { size: 16 })}<span>${point}</span></li>`)}
          </ul>
          ${live ? '' : html`<p class="small muted">Each phase is switched on once the one before it is running, so this section opens after Phase ${phase.id - 1}.</p>`}
        </div>
        <div class="stack">
          <div class="card">
            <h2 class="h2">Available now</h2>
            <p class="muted">Phase 1 is live: official past papers, customisable practice and the Data Hub.</p>
            <div class="row" style="margin-top:14px">
              ${signedIn
                ? html`<a class="btn btn--primary" href="#/practice">Customisable practice</a><a class="btn" href="#/papers">Official past papers</a>`
                : html`<a class="btn btn--primary" href="#/signup">Create an account</a><a class="btn" href="#/login">Log in</a>`}
            </div>
          </div>
          <div class="card">
            <h2 class="h2">Roadmap</h2>
            ${roadmap()}
          </div>
        </div>
      </div>`,
  );
}
