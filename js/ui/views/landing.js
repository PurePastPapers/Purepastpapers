// The public front door (approved round 7 design): what the site has, how it works,
// the subjects and boards it covers, and what is coming later.

import { FEATURES, PHASES } from '../../config/phases.js';
import { html, setHtml } from '../../core/dom.js';
import { getSubjects } from '../../data/content-repository.js';
import { doodle } from '../doodles.js';
import { icon } from '../icons.js';
import { SUBJECT_SWATCHES } from '../subject-colours.js';
import { liveBadge } from '../ui.js';
import { openWelcome } from '../welcome.js';
import { demoForVisit } from '../demo-subjects.js';
import { links } from '../../core/links.js';

/** The four phases, used on the Account and coming-soon pages. */
export function roadmap() {
  return html`<ol class="roadmap">
    ${PHASES.map(
      (phase) => html`<li class="phase ${phase.status === 'live' ? 'phase--live' : ''}">
        <span class="phase__num" aria-hidden="true">${phase.id}</span>
        <div><p class="row row--tight"><strong>${phase.title}</strong>${phase.status === 'live' ? liveBadge() : html`<span class="badge badge--soon">Coming soon</span>`}</p><p class="muted">${phase.summary}</p></div>
      </li>`,
    )}
  </ol>`;
}

const FEATURE_CARDS = [
  { icon: 'file', doodle: 'papers', title: 'Official past papers', text: 'Browse available exam papers and mark schemes for your specification. Time yourself and log your mark.' },
  { icon: 'check', title: 'Filter by spec point', text: 'Choose the exact points you’ve covered, such as 2.1–2.6, and find questions tagged to them.' },
  { icon: 'clock', doodle: 'practice', title: 'Customisable practice', text: 'Timed mini-papers for STEM, or pick essay questions by set text and marks for humanities.' },
  { icon: 'list', title: 'Difficulty levels', text: 'Easy, medium, hard or mixed, so practice matches where you are.' },
  { icon: 'chart', doodle: 'hub', title: 'Data Hub', text: 'With a free account, track marks, mistakes and progress in your browser.' },
  { icon: 'target', doodle: 'subjects', title: 'Your subjects, your colours', text: 'Pick your subjects once, set up for your boards and specs, and give each one its own colour.' },
];

const STEPS = [
  { title: 'Choose a subject', text: 'Pick your level, subject and exam board.' },
  { title: 'Select what you’ve learned', text: 'Choose the exact spec points you’ve covered.' },
  { title: 'Practise your way', text: 'Full papers, single questions or a custom test.' },
];

const LEVELS = [
  { title: 'GCSE', levels: ['GCSE'] },
  { title: 'A-Level', levels: ['A-Level'] },
  { title: 'Level 3', levels: ['Level 3'] },
];

const BOARD_NAMES = { AQA: 'AQA', Edexcel: 'Pearson Edexcel', OCR: 'OCR', Eduqas: 'WJEC Eduqas', WJEC: 'WJEC Eduqas' };

const arrow = () =>
  html`<svg viewBox="0 0 80 80" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" aria-hidden="true"><path d="M70 66C40 70 18 52 16 14" /><path d="M5 26 16 12l12 12" /></svg>`;

const fmt = (number) => Number(number).toLocaleString('en-GB');

async function loadStats(subjects) {
  try {
    const response = await fetch('data/stats.json');
    if (response.ok) return await response.json();
  } catch {
    /* fall back to what we know */
  }
  return { subjects: subjects.length };
}

export async function mount(element, context) {
  context.setTitle('PurePastPapers');
  const subjects = await getSubjects();
  const stats = await loadStats(subjects);
  if (!element.isConnected) return;
  const demo = demoForVisit();
  const swatch = SUBJECT_SWATCHES.find(({ id }) => id === demo.swatch);
  element.classList.add('view--landing');
  const boardOrder = Object.values(BOARD_NAMES);
  const boards = [...new Set(subjects.map((subject) => BOARD_NAMES[subject.board] || subject.board))].sort((a, b) => boardOrder.indexOf(a) - boardOrder.indexOf(b));
  const levelOrder = ['GCSE', 'A-Level', 'Level 3'];
  const levelSet = [...new Set(subjects.map((subject) => subject.level))].sort((a, b) => levelOrder.indexOf(a) - levelOrder.indexOf(b));
  const soon = ['aiQuestionPool', 'predictedPapers', 'aiMarking'].filter((key) => !FEATURES[key]?.enabled);
  const soonLabels = { aiQuestionPool: 'AI practice questions', predictedPapers: 'AI predicted papers', aiMarking: 'AI marking' };

  setHtml(
    element,
    html`<section class="lp-hero" aria-labelledby="lp-title">
        <div>
          <span class="tag">Free for ${levelSet.join(', ').replace(/, ([^,]*)$/, ' & $1')}</span>
          <h1 id="lp-title" tabindex="-1">Past paper questions, down to the exact spec point.</h1>
          <p class="lp-hero__lede">
            Find questions for the topics you’ve covered. Filter by specification point, exam board, subject, year and difficulty.
          </p>
          <p class="lp-hero__reassurance">Browse questions and use filters for free. Create a free account to track marks, mistakes and progress in this browser.</p>
          <div class="lp-hero__actions">
            <a class="btn btn--primary btn--lg" href="${links.subjects({ browse: 1 })}">Browse questions →</a>
            <a class="btn btn--lg lp-demo" style="--demo-colour:${swatch.hex}" href="${links.practice({ starter: 1, subject: demo.id })}">Try a ${demo.name} demo</a>
          </div>
        </div>
        <div class="lp-art" aria-hidden="true">
          <div class="card ruled lp-art__learned tilt-1">
            <i class="tape tape--l"></i><i class="tape tape--r"></i>
            <h3>Example · spec points I’ve learned</h3>
            <div class="row">
              <span class="tag is-on">✓ 2.1</span><span class="tag is-on">✓ 2.2</span><span class="tag is-on">✓ 2.3</span>
              <span class="tag is-on">✓ 2.4</span><span class="tag is-on">✓ 2.5</span><span class="tag is-on">✓ 2.6</span><span class="tag">2.7</span>
            </div>
          </div>
          <div class="card lp-art__qs tilt-4">
            <i class="tape tape--c"></i>
            <div class="lp-art__q">
              <p><span>Example question</span><span>6 marks · Hard</span></p>
              <p>A ball is projected at 18 m s⁻¹ at 35° above the horizontal from the edge of a cliff…</p>
            </div>
            <div class="lp-art__q">
              <p><span>Example question</span><span>4 marks · Medium</span></p>
              <p>Explain why the extension of the wire is not proportional to the load beyond point P.</p>
            </div>
          </div>
          <p class="lp-art__arrow hand">${arrow()}<span>find your spec points</span></p>
        </div>
      </section>

      <section class="lp-section lp-video" id="video" aria-labelledby="video-title">
        <h2 id="video-title">See why it works</h2>
        <figure class="card lp-video__card tilt-3">
          <i class="tape tape--l" aria-hidden="true"></i><i class="tape tape--r" aria-hidden="true"></i>
          <video class="lp-video__player" muted loop playsinline preload="metadata" poster="assets/promo/purepastpapers-promo-poster.jpg" aria-label="PurePastPapers promo video, playing silently on a loop">
            <source src="assets/promo/purepastpapers-promo.mp4" type="video/mp4" />
            Your browser can’t play this video. <a href="assets/promo/purepastpapers-promo.mp4">Download it (8 MB)</a>.
          </video>
        </figure>
      </section>

      <section class="lp-section" id="features" aria-labelledby="features-title">
        <h2 id="features-title">What’s inside</h2>
        <p class="hand">Find the right questions and practise your way.</p>
        <div class="lp-grid">
          ${FEATURE_CARDS.map(
            (feature, index) =>
              html`<article class="card ruled lp-feature ${feature.doodle ? 'lp-feature--doodle' : ''} tilt-${[1, 3, 2, 4, 3, 1][index]}">
                <i class="tape ${['tape--l', 'tape--c', 'tape--r', 'tape--c', 'tape--br', 'tape--r'][index]}" aria-hidden="true"></i>
                <span class="ic" aria-hidden="true">${icon(feature.icon, { size: 18 })}</span>
                <h3>${feature.title}</h3>
                <p>${feature.text}</p>
                ${feature.doodle ? doodle(feature.doodle, 'lp-feature__doodle') : ''}
              </article>`,
          )}
        </div>
      </section>

      <section class="lp-section" id="how" aria-labelledby="how-title">
        <h2 id="how-title">How it works</h2>
        <p class="hand">Three steps, then it’s up to you.</p>
        <ol class="lp-grid">
          ${STEPS.map(
            (step, index) =>
              html`<li class="card lp-step tilt-${[3, 2, 4][index]}">
                <i class="tape tape--c" aria-hidden="true"></i>
                <span class="num" aria-hidden="true">${index + 1}</span>
                <div><h3>${step.title}</h3><p>${step.text}</p></div>
              </li>`,
          )}
        </ol>
        <p class="lp-colours" aria-hidden="true">
          <span class="hand">pick a colour for each subject →</span>
          ${SUBJECT_SWATCHES.slice(0, 6).map((swatch) => html`<i style="--sc:${swatch.hex}"></i>`)}
        </p>
        <p class="lp-tour"><button type="button" class="btn btn--sm" data-open-welcome>Show the quick tour again</button></p>
      </section>

      <section class="lp-section" id="subjects" aria-labelledby="subjects-title">
        <h2 id="subjects-title">Subjects &amp; exam boards</h2>
        <p class="hand">${boards.join(', ').replace(/, ([^,]*)$/, ' and $1')}.</p>
        <div class="lp-grid">
          ${LEVELS.map((level, index) => {
            const list = subjects.filter((subject) => level.levels.includes(subject.level));
            const names = [...new Set(list.map((subject) => subject.subject.replace(/\s*\(.*\)$/, '')))];
            const shown = names.slice(0, 5);
            const rest = names.slice(5);
            return html`<article class="card lp-level tilt-${[3, 2, 4][index]}">
              <i class="tape tape--l" aria-hidden="true"></i><i class="tape tape--r" aria-hidden="true"></i>
              <h3>${level.title}</h3>
              <div class="row">
                ${shown.map((name) => html`<span class="tag">${name}</span>`)}
                ${rest.length
                  ? html`<details>
                      <summary class="tag">+${rest.length} more</summary>
                      <div class="row" style="margin-top:8px">${rest.map((name) => html`<span class="tag">${name}</span>`)}</div>
                    </details>`
                  : ''}
              </div>
            </article>`;
          })}
        </div>
        <div class="lp-numbers">
          <div class="card tilt-1"><i class="tape tape--c" aria-hidden="true"></i><b>${fmt(stats.subjects)}</b><span>subjects</span></div>
          ${stats.catalogue_papers ? html`<div class="card tilt-2"><i class="tape tape--c" aria-hidden="true"></i><b>${fmt(stats.catalogue_papers)}</b><span>past papers</span></div>` : ''}
          ${stats.spec_points ? html`<div class="card tilt-4"><i class="tape tape--c" aria-hidden="true"></i><b>${fmt(stats.spec_points)}</b><span>spec points</span></div>` : ''}
        </div>
      </section>

      ${soon.length
        ? html`<section class="lp-section" aria-labelledby="later-title">
            <h2 id="later-title">Coming later</h2>
            <p class="hand">Clearly labelled, and kept apart from official papers.</p>
            <div class="lp-soon">${soon.map((key) => html`<span class="tag tag--soon">${soonLabels[key]}</span>`)}</div>
          </section>`
        : ''}

      <section class="lp-close" aria-labelledby="close-title">
        <h2 id="close-title">Ready when you are.</h2>
        <p class="hand">Browse and filter for free. Save your progress with a free account.</p>
        <a class="btn btn--primary btn--lg" href="${links.signup()}">Create a free account →</a>
      </section>`,
  );
  // Arriving from a top-bar link on another page ("Features", "Subjects", "How it works").
  const section = context.query.section && document.getElementById(context.query.section);
  if (section) requestAnimationFrame(() => section.scrollIntoView({ block: 'start' }));
  element.querySelector('[data-open-welcome]')?.addEventListener('click', () => openWelcome({ navigate: context.navigate }));

  // The promo video plays muted on a loop, with no controls, while it is on screen (it only starts
  // downloading when the visitor scrolls to it). Browsers only allow autoplay when muted. People who
  // ask for reduced motion, and browsers that block autoplay anyway, get normal controls instead.
  const player = element.querySelector('.lp-video__player');
  let watcher = null;
  if (player) {
    player.muted = true;
    const withControls = () => {
      player.controls = true;
      player.loop = false;
    };
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
      withControls();
    } else if ('IntersectionObserver' in window) {
      watcher = new IntersectionObserver(([entry]) => {
        if (entry.isIntersecting) player.play().catch(withControls);
        else player.pause();
      }, { threshold: 0.35 });
      watcher.observe(player);
    } else {
      player.play().catch(withControls);
    }
  }
  return () => {
    watcher?.disconnect();
    player?.pause();
  };
}
