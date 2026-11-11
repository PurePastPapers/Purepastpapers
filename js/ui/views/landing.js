// Public home page (signed out).

import { APP, LEVEL_TABS } from '../../config/app.config.js';
import { FEATURES, PHASES } from '../../config/phases.js';
import { $, html, setHtml } from '../../core/dom.js';
import { getSubjects } from '../../data/content-repository.js';
import { enterDemoAccount } from '../../data/demo.js';
import { icon } from '../icons.js';
import { groupDot, liveBadge, soonBadge, toast } from '../ui.js';

const SECTIONS = [
  { title: 'Official past papers', iconName: 'file', live: true, text: 'Every exam series in one list. Sit a paper against the clock, then log your marks and see an indicative grade.' },
  { title: 'Customisable practice', iconName: 'sliders', live: true, text: 'Timed mini-papers for STEM subjects and an untimed question picker for essay subjects, built only from topics you have learned.' },
  { title: 'AI past papers', iconName: 'sparkle', feature: 'aiPastPapers', text: FEATURES.aiPastPapers.lead },
  { title: 'AI predicted papers', iconName: 'target', feature: 'predictedPapers', text: FEATURES.predictedPapers.lead },
];

export function roadmap() {
  return html`<ol class="roadmap">
    ${PHASES.map(
      (phase) =>
        html`<li class="phase ${phase.status === 'live' ? 'phase--live' : ''}">
          <span class="phase__num" aria-hidden="true">${phase.id}</span>
          <div>
            <p class="row row--tight">
              <strong>Phase ${phase.id}: ${phase.title}</strong>
              ${phase.status === 'live' ? liveBadge() : html`<span class="badge badge--soon">Coming soon</span>`}
            </p>
            <p class="muted">${phase.summary}</p>
          </div>
        </li>`,
    )}
  </ol>`;
}

export async function mount(element, context) {
  context.setTitle('');
  const subjects = await getSubjects();

  setHtml(
    element,
    html`<section class="hero">
        <p>${liveBadge()} <span class="small muted">Phase 1 of 4 · GCSE, A-Level and Level 3</span></p>
        <h1 class="hero__title" tabindex="-1">Past papers, filtered to what you have <mark>actually learned</mark>.</h1>
        <p class="lead">
          Tick the topics you have covered so far. ${APP.name} only gives you exam questions you can answer today, builds timed tests from them, and
          tracks every mark by topic.
        </p>
        <div class="row">
          <a class="btn btn--primary btn--lg" href="#/signup">Create an account</a>
          <button type="button" class="btn btn--lg" data-demo>${icon('play', { size: 16 })} Explore the demo account</button>
        </div>
        <p class="small muted">Accounts are kept in this browser, so there is nothing to verify and no email is sent.</p>
      </section>

      <section class="grid" aria-label="What makes it different">
        <div class="card">
          <h2 class="h3">${icon('filter')} No surprise topics</h2>
          <p class="muted">
            Every question is tagged with the specification points it tests, including crossover knowledge from other topics and subjects. You only
            see a question when you have learned all of them.
          </p>
        </div>
        <div class="card">
          <h2 class="h3">${icon('stopwatch')} Practice that fits the subject</h2>
          <p class="muted">
            Build a 30 or 50 minute test at the difficulty you choose for maths and sciences. Pick individual essays by text, topic and mark tariff
            for humanities.
          </p>
        </div>
        <div class="card">
          <h2 class="h3">${icon('chart')} A Data Hub that shows the gaps</h2>
          <p class="muted">Red, amber and green ratings for every topic, your accuracy at each difficulty, and paper scores over time.</p>
        </div>
      </section>

      <section>
        <div class="section-title"><h2 class="h2">Four sections, always kept apart</h2><p class="small muted">So you always know what you are practising.</p></div>
        <div class="grid">
          ${SECTIONS.map(
            (section) =>
              html`<div class="card ${section.live ? '' : 'card--soon'}">
                <p class="row row--between">${icon(section.iconName, { size: 22 })} ${section.live ? liveBadge() : soonBadge(section.feature)}</p>
                <h3 class="h3" style="margin-top:10px">${section.title}</h3>
                <p class="muted">${section.text}</p>
              </div>`,
          )}
        </div>
      </section>

      <section class="grid grid--2">
        <div class="card">
          <h2 class="h2">Roadmap</h2>
          ${roadmap()}
        </div>
        <div class="card">
          <h2 class="h2">${subjects.length} subjects, mapped to their exam boards</h2>
          <div class="stack" style="margin-top:14px">
            ${LEVEL_TABS.map(
              (tab) =>
                html`<div>
                  <p class="label">${tab.label}</p>
                  <ul class="subject-cloud">
                    ${subjects
                      .filter((subject) => tab.levels.includes(subject.level))
                      .map((subject) => html`<li>${groupDot(subject)}${subject.subject} <span class="muted small">${subject.board}</span></li>`)}
                  </ul>
                </div>`,
            )}
          </div>
        </div>
      </section>`,
  );

  const demoButton = $('[data-demo]', element);
  demoButton.addEventListener('click', async () => {
    demoButton.disabled = true;
    try {
      await enterDemoAccount();
    } catch (error) {
      demoButton.disabled = false;
      toast(error.message, { type: 'error' });
    }
  });
}
