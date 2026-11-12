// The public front door. The impact stays here; the revision tools stay focused.
import { LEVEL_TABS } from '../../config/app.config.js';
import { PHASES } from '../../config/phases.js';
import { $, html, setHtml } from '../../core/dom.js';
import { getSubjects } from '../../data/content-repository.js';
import { enterDemoAccount } from '../../data/demo.js';
import { icon } from '../icons.js';
import { groupDot, liveBadge, toast } from '../ui.js';

export function roadmap() {
  return html`<ol class="roadmap">
    ${PHASES.map((phase) => html`<li class="phase ${phase.status === 'live' ? 'phase--live' : ''}">
      <span class="phase__num" aria-hidden="true">${phase.id}</span>
      <div><p class="row row--tight"><strong>${phase.title}</strong>${phase.status === 'live' ? liveBadge() : html`<span class="badge badge--soon">Coming soon</span>`}</p><p class="muted">${phase.summary}</p></div>
    </li>`)}
  </ol>`;
}

// Original vector paint marks. No remote images, video or animation library to load.
const paint = () => html`<svg class="impact__paint" viewBox="0 0 1440 650" fill="none" aria-hidden="true" focusable="false">
  <g class="paint-burst paint-burst--one" fill="currentColor">
    <path d="M174 413c-9-11-56-39-71-47-9-5-12-12-7-14 6-3 26 15 37 22 25 16 49 27 53 23 7-9-19-59-16-66 5-11 13 11 20 30 8 23 14 31 21 29 8-2 22-26 30-27 11 0-5 24-4 34 2 11 30 8 49 0 20-8 40-17 43-11 3 7-29 24-43 32-20 11-24 13-17 24 9 16 45 34 42 40-3 8-31-8-52-17-17-7-25-13-30-3-6 12-5 47-14 52-9 5-7-44-16-47-11-6-48 19-53 13-6-9 22-28 22-36 0-7-20-5-27-11-13-12 25-7 33-20z"/>
    <ellipse cx="218" cy="428" rx="70" ry="45" transform="rotate(-18 218 428)"/>
    <ellipse cx="113" cy="358" rx="17" ry="5" transform="rotate(33 113 358)"/>
    <ellipse cx="295" cy="339" rx="12" ry="4" transform="rotate(-49 295 339)"/>
    <circle cx="87" cy="464" r="7"/><circle cx="149" cy="515" r="4"/><circle cx="302" cy="507" r="6"/><circle cx="164" cy="307" r="5"/>
    <circle cx="65" cy="333" r="4"/><circle cx="341" cy="377" r="3"/><circle cx="101" cy="402" r="3"/><circle cx="135" cy="475" r="2"/><circle cx="282" cy="480" r="3"/><circle cx="320" cy="416" r="2"/><circle cx="154" cy="352" r="2"/><circle cx="178" cy="487" r="3"/><circle cx="286" cy="300" r="2"/><circle cx="62" cy="395" r="2"/><ellipse cx="91" cy="505" rx="8" ry="3" transform="rotate(-27 91 505)"/>
  </g>
  <g class="paint-burst paint-burst--two" fill="currentColor">
    <path d="M1153 188c-5-21-34-56-32-66 3-10 19 7 31 24 16 22 26 38 35 27 13-16 35-70 43-67 10 3-21 69-15 76 8 9 59-13 68-6 9 8-40 28-42 37-4 12 50 42 49 49-2 9-48-14-70-22-16-6-23-3-20 12 3 19 16 48 7 54-8 5-17-40-31-51-10-9-24 18-38 23-13 6 12-34 8-44-6-13-58-12-60-22-4-11 65-2 67-24z"/>
    <ellipse cx="1185" cy="215" rx="61" ry="44" transform="rotate(30 1185 215)"/>
    <ellipse cx="1325" cy="294" rx="22" ry="6" transform="rotate(33 1325 294)"/>
    <ellipse cx="1252" cy="89" rx="18" ry="5" transform="rotate(-59 1252 89)"/>
    <circle cx="1353" cy="168" r="7"/><circle cx="1130" cy="90" r="5"/><circle cx="1086" cy="306" r="8"/>
    <circle cx="1319" cy="229" r="3"/><circle cx="1095" cy="186" r="2"/><circle cx="1270" cy="126" r="3"/><circle cx="1148" cy="310" r="2"/><circle cx="1343" cy="265" r="2"/><circle cx="1292" cy="368" r="4"/><circle cx="1370" cy="320" r="4"/><circle cx="1230" cy="47" r="4"/>
  </g>
  <g class="paint-burst paint-burst--three" fill="currentColor">
    <path d="M589 539c73-28 216-48 306-36 18 3 15 6-3 6-29 1-31 4-10 6 16 2 15 6-3 7l-93 1c-29 0-38 6-21 8 16 2 12 4-7 5l-112 9c-11 2-13 5 0 4 14-1 13 2-3 5l-96 11c-21 2-18-3 2-7 41-8 65-20 40-19z"/>
    <ellipse cx="939" cy="513" rx="15" ry="4"/><circle cx="962" cy="520" r="3"/><circle cx="572" cy="572" r="4"/>
  </g>
</svg>`;

export async function mount(element, context) {
  context.setTitle('PurePastPapers.com');
  const subjects = await getSubjects();
  element.classList.add('view--landing');
  setHtml(element, html`
    <section class="impact" aria-labelledby="ppp-title">
      <div class="impact__eyebrow"><span>PurePastPapers.com</span><span>GCSE / A-Level / Level 3</span></div>
      <div class="impact__canvas">
        ${paint()}
        <h1 class="impact__letters" id="ppp-title" tabindex="-1" aria-label="PPP — PurePastPapers.com"><span>P</span><span>P</span><span>P</span></h1>
        <span class="impact__edition" aria-hidden="true">PURE.<br />PAST.<br />PAPERS.</span>
      </div>
      <div class="impact__bottom">
        <div><p class="impact__tagline">Maximum output.<br /><span>Minimum noise.</span></p></div>
        <div class="impact__action"><p>Past papers. Focused practice.<br />Straight to what matters.</p><div class="row"><a class="btn btn--primary" href="#/signup">Get started ${icon('external', { size: 16 })}</a><button type="button" class="impact__demo" data-demo>Explore the demo ${icon('chevronRight', { size: 16 })}</button></div></div>
        <button class="impact__scroll" type="button" data-scroll-to="the-approach" aria-label="Scroll to the approach"><span>Scroll to explore</span><span class="impact__scroll-icon">↓</span></button>
      </div>
    </section>

    <div class="landing-body">
      <section class="approach landing-section" id="the-approach" aria-labelledby="approach-title">
        <div class="landing-kicker" data-reveal><span>01 / The approach</span><span>Built for your next mark.</span></div>
        <div class="approach__intro" data-reveal><h2 id="approach-title">Less organising.<br />More <em>doing.</em></h2><p>No clutter between you and your next question. Find a paper, practise what you know, and see where you can improve.</p></div>
        <div class="approach__rows">
          <div class="approach__row" data-reveal><span class="approach__number">01</span><h3>Make it relevant.</h3><p>Practice filtered to the topics you have learned, including the crossover knowledge each question needs.</p>${icon('target', { size: 26 })}</div>
          <div class="approach__row" data-reveal><span class="approach__number">02</span><h3>Make it count.</h3><p>A timed test for maths and sciences. A question picker for essay subjects. Practice that fits the way you work.</p>${icon('stopwatch', { size: 26 })}</div>
          <div class="approach__row" data-reveal><span class="approach__number">03</span><h3>See the difference.</h3><p>Self-mark against the mark scheme. Your Data Hub brings your scores, topic strengths and gaps into focus.</p>${icon('chart', { size: 26 })}</div>
        </div>
      </section>

      <section class="landing-section tools-section" aria-labelledby="tools-title">
        <div class="landing-kicker" data-reveal><span>02 / The essentials</span><span>Everything in its place.</span></div>
        <h2 class="landing-heading" id="tools-title" data-reveal>Open. Practise. Repeat.</h2>
        <div class="tools-grid">
          <a class="tool-panel" href="#/papers" data-reveal><div class="tool-panel__top"><span class="label">The original exam experience</span>${icon('external', { size: 23 })}</div><div class="paper-art" aria-hidden="true"><div class="paper-art__sheet"><span>PPP / EXAM PRACTICE</span><strong>THE NEXT<br />PAPER.</strong><div class="paper-art__rules"></div><span>YOUR NEXT MARK STARTS HERE</span></div><span class="paper-art__seal">P</span></div><div class="tool-panel__bottom"><h3>Official past papers</h3><p>Find your exam series, open the board’s paper, sit it timed and log your marks.</p><span class="tool-panel__link">Find a paper ${icon('chevronRight', { size: 16 })}</span></div></a>
          <a class="tool-panel tool-panel--practice" href="#/practice" data-reveal><div class="tool-panel__top"><span class="label">Your topics. Your pace.</span>${icon('external', { size: 23 })}</div><div class="practice-art" aria-hidden="true"><span class="practice-art__label">TIME TO FOCUS</span><span class="practice-art__time">30<span>:00</span></span><span class="practice-art__line"></span><div><span>YOUR TOPICS</span><span>YOUR NEXT STEP ↗</span></div></div><div class="tool-panel__bottom"><h3>Customisable practice</h3><p>Choose your difficulty, set your time and work on questions matched to what you know.</p><span class="tool-panel__link">Make it yours ${icon('chevronRight', { size: 16 })}</span></div></a>
        </div>
        <div class="coming-next" data-reveal><span class="label">On the horizon</span><span>AI past papers</span><span>AI predicted papers</span><span class="badge badge--soon">Coming soon</span></div>
      </section>

      <section class="landing-section subjects-section" aria-labelledby="subjects-title">
        <div class="landing-kicker" data-reveal><span>03 / Find your subject</span><span>AQA / Edexcel / OCR / Eduqas</span></div>
        <div class="subjects-section__head" data-reveal><h2 class="landing-heading" id="subjects-title">Big ambitions.<br /><span>${subjects.length} subjects.</span></h2><p>Mapped to your exam board and specification.<br />Find your course. Get into it.</p></div>
        ${LEVEL_TABS.map((tab) => html`<div class="subject-directory" data-reveal><h3>${tab.label}</h3><ul class="subject-cloud">${subjects.filter((subject) => tab.levels.includes(subject.level)).map((subject) => html`<li>${groupDot(subject)}${subject.subject}<span class="muted small">${subject.board}</span></li>`)}</ul></div>`)}
      </section>

      <section class="landing-close" data-reveal aria-labelledby="close-title"><p class="label">Less scrolling. More solving.</p><h2 id="close-title">Your next mark.<br /><span>Starts here.</span></h2><a class="btn btn--primary btn--lg" href="#/signup">Let’s get into it ${icon('external', { size: 18 })}</a><p class="small muted">Free to explore. Accounts stay in this browser.</p></section>
      <details class="landing-roadmap"><summary>What’s next for PPP? <span>View the roadmap +</span></summary>${roadmap()}</details>
    </div>
  `);

  $('[data-demo]', element).addEventListener('click', async (event) => {
    const button = event.currentTarget;
    button.disabled = true;
    try { await enterDemoAccount(); }
    catch (error) { button.disabled = false; toast(error.message, { type: 'error' }); }
  });
  $('[data-scroll-to]', element).addEventListener('click', () => {
    $('#the-approach', element).scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
  });
}
