// Placeholder page for a section that belongs to a later phase (PRD sections 5–7), in the
// approved index-card layout (inner-pages/8-coming-soon-ai). The owner removed the
// "tell me when it opens" switch and the sneak peeks from these pages, so they only say
// what the section will do, what is available now, and when it is coming.
// The route, navigation entry and data model already exist; flipping the feature flag in
// js/config/phases.js replaces this page with the real section.

import { FEATURES, isEnabled, PHASES, phaseOf } from '../../config/phases.js';
import { html, setHtml } from '../../core/dom.js';
import * as api from '../../data/api.js';
import { icon } from '../icons.js';
import { pageHead } from '../ui.js';

const ICONS = { aiPastPapers: 'sparkle', predictedPapers: 'target', aiMarking: 'check' };
const STATUS = { live: ['Live', 'live'], coming_soon: ['Coming later', 'soon'] };

export async function mount(element, context) {
  const key = context.options.feature;
  const feature = FEATURES[key];
  const phase = phaseOf(key);
  context.setTitle(feature.title);
  const signedIn = api.isSignedIn();
  const live = isEnabled(key); // a capability with no page of its own (AI marking) still lands here once live
  const before = PHASES.find((entry) => entry.id === phase.id - 1);

  setHtml(
    element,
    html`${pageHead({
        crumbs: [{ label: 'Home', href: '#/' }, { label: 'Coming later' }, { label: feature.title }],
        title: feature.title,
        badge: live ? html`<span class="badge badge--live">Live</span>` : html`<span class="stamp-soon">Coming in Phase ${phase.id}</span>`,
        sub: feature.lead.replace(/\.$/, '').replace(/^./, (letter) => letter.toLowerCase()),
      })}
      <div class="soon-layout">
        <section class="card ruled tilt-2 soon-main">
          <i class="tape tape--l" aria-hidden="true"></i><i class="tape tape--r" aria-hidden="true"></i>
          <header class="soon-main__head">
            <span class="soon-main__icon" aria-hidden="true">${icon(ICONS[key] || 'sparkle', { size: 30 })}</span>
            <div>
              <h2 class="card__title">What it will do</h2>
              <p class="muted">${live ? `Part of Phase ${phase.id}.` : before ? `Opens once Phase ${before.id} is up and running.` : `Coming in Phase ${phase.id}.`}</p>
            </div>
          </header>
          <ul class="soon-points">
            ${feature.points.map((point) => html`<li>${icon('check', { size: 20 })}<span>${point}</span></li>`)}
          </ul>
        </section>
        <aside class="stack soon-side">
          <section class="card ruled tilt-3">
            <i class="tape tape--r" aria-hidden="true"></i>
            <h2 class="card__title">Available now</h2>
            <p class="muted">${key === 'aiMarking' ? 'Mark your own answers against the mark scheme in Practice and Past papers.' : 'Official past papers and customisable practice are live.'}</p>
            <div class="row" style="margin-top:16px">
              ${signedIn
                ? html`<a class="btn btn--primary" href="#/practice">Practice</a><a class="btn" href="#/papers">Past papers</a>`
                : html`<a class="btn btn--primary" href="#/signup">Create a free account</a><a class="btn" href="#/login">Log in</a>`}
            </div>
          </section>
          <section class="card ruled tilt-1">
            <i class="tape tape--l" aria-hidden="true"></i>
            <h2 class="card__title">When it’s coming</h2>
            <p class="muted small">Each phase opens once the one before it is running.</p>
            <ol class="phases">
              ${PHASES.map(
                (entry) =>
                  html`<li class="${entry.id === phase.id ? 'is-here' : ''}">
                    <span class="phases__num" data-status="${STATUS[entry.status]?.[1]}">${entry.id}</span>
                    <div>
                      <p class="phases__title">${entry.title} ${entry.id === phase.id ? html`<span class="hand">this page</span>` : ''}</p>
                      <p class="small muted">${entry.summary}</p>
                    </div>
                    <span class="badge ${entry.status === 'live' ? 'badge--live' : 'badge--soon'}">${STATUS[entry.status]?.[0] || ''}</span>
                  </li>`,
              )}
            </ol>
          </section>
          <p class="hand soon-note">AI content is always labelled, and kept apart from official papers</p>
        </aside>
      </div>`,
  );
}
