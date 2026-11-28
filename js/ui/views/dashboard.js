// Signed-in home: the four sections, the student's subjects (with their colours) and a
// short "at a glance". Deliberately not suggestive: no "do this next" plans or nudges.

import { CONTENT } from '../../config/app.config.js';
import { FEATURES } from '../../config/phases.js';
import { html, on, setHtml } from '../../core/dom.js';
import { fmtDuration, fmtRelative } from '../../core/utils.js';
import * as api from '../../data/api.js';
import { elapsedMs } from '../../data/sessions.js';
import { currentStreak, totals } from '../../engine/analytics.js';
import { doodle } from '../doodles.js';
import { icon } from '../icons.js';
import { addSubjectButton, addSubjectTile, loadStudent, subjectCard, subjectSummary, wireColourPicker } from '../student.js';
import { confirmDialog, fmtPercent } from '../ui.js';
import { links } from '../../core/links.js';
import { boardWaitlist, wireBoardWaitlist } from '../board-waitlist.js';

const SESSION_LABELS = { full_paper: 'Past paper', custom_test: 'Timed test', question_set: 'Question set', single: 'Question' };

const SECTIONS = [
  { href: links.papers(), icon: 'file', doodle: 'papers', title: 'Past papers', text: 'Full official papers by year and series.' },
  { href: links.practice(), icon: 'clock', doodle: 'practice', title: 'Practice', text: 'Custom tests or single questions from your topics.' },
  { href: links.flashcards(), icon: 'layers', doodle: 'flashcards', title: 'Flashcards', text: "Cards for the spec points you've learnt." },
  { href: links.hub(), icon: 'chart', doodle: 'hub', title: 'Data Hub', text: 'Scores, history and topic mastery.' },
  { href: links.subjects(), icon: 'target', doodle: 'subjects', title: 'My subjects', text: "Subjects and the topics you've learned." },
];

const SOON = [
  { href: links.aiPapers(), label: 'AI practice questions', feature: 'aiPastPapers' },
  { href: links.predicted(), label: 'AI predicted papers', feature: 'predictedPapers' },
  { href: links.aiMarking(), label: 'AI marking', feature: 'aiMarking' },
];

export async function mount(element, context) {
  context.setTitle('Home');
  const user = api.currentUser();
  const student = await loadStudent();
  const { progress, bundles, latest } = student;
  const enrolled = progress.enrolled_subjects.map((id) => bundles.get(id)).filter(Boolean);
  const overall = totals([...latest.values()]);
  const resumable = api.resumableSessions();
  const firstName = user.display_name.trim().split(/\s+/)[0];

  setHtml(
    element,
    html`<header class="dash-hello">
        <h1 tabindex="-1">Hello, ${user.is_demo ? 'Demo' : firstName}</h1>
        <p class="hand">where would you like to go?</p>
      </header>

      ${user.is_demo || (CONTENT.showSampleContent && !progress.preferences.hideDemoNotice)
        ? html`<p class="banner banner--info small" data-demo-notice style="margin-top:22px">
            ${icon('info')}
            <span class="banner__body">
              ${user.is_demo
                ? html`<strong>This is the demo account.</strong> Its subjects, topics and scores are sample activity. Try anything: when you sign out, the demo goes back to how it was. `
                : ''}
              ${CONTENT.showSampleContent ? html`Demo questions are always labelled “Demo content”; official papers link to the exam boards.` : ''}
              ${user.is_demo ? '' : html`<button type="button" class="linkbtn" data-hide-notice>Hide this</button>`}
            </span>
          </p>`
        : ''}

      <nav class="dash-sections" aria-label="Sections">
        ${SECTIONS.map(
          (section, index) =>
            html`<a class="card card--link ruled dash-section tilt-${[1, 3, 2, 4][index % 4]}" href="${section.href}">
              <i class="tape tape--c" aria-hidden="true"></i>
              <span class="ic" aria-hidden="true">${icon(section.icon, { size: 20 })}</span>
              <span class="dash-section__arrow" aria-hidden="true">→</span>
              <h2>${section.title}</h2>
              <p>${section.text}</p>
              ${doodle(section.doodle, 'dash-section__doodle')}
            </a>`,
        )}
      </nav>

      ${resumable.length
        ? html`<section class="dash-block" aria-labelledby="resume-title">
            <div class="section-title"><h2 id="resume-title">Pick up where you left off</h2></div>
            <div class="resume-list">
              ${resumable.slice(0, 3).map(
                (session) =>
                  html`<div class="card resume stack stack--sm">
                    <p class="small muted">${SESSION_LABELS[session.kind]} · started ${fmtRelative(session.started_at)}</p>
                    <p class="h3">${session.title}</p>
                    <p class="small muted">
                      ${session.status === 'marking' ? 'Waiting to be marked' : `${Object.keys(session.answers).length} of ${session.question_ids.length || 1} answered`}
                      · ${fmtDuration(elapsedMs(session) / 1000)} so far
                    </p>
                    <div class="row row--tight">
                      <a class="btn btn--primary btn--sm" href="${links.session(session.session_id)}">Resume</a>
                      <button type="button" class="btn btn--ghost btn--sm" data-discard="${session.session_id}">Discard</button>
                    </div>
                  </div>`,
              )}
            </div>
          </section>`
        : ''}

      <section class="dash-block" aria-labelledby="subjects-title">
        <div class="section-title">
          <h2 id="subjects-title">Your subjects</h2>
          ${enrolled.length ? addSubjectButton(links.subjects({ add: 1 })) : ''}
          ${enrolled.length ? html`<span class="hand">tap the dot to change a subject’s colour</span>` : ''}
        </div>
        ${enrolled.length
          ? html`<div class="dash-subjects">${enrolled.map((bundle, index) => subjectCard(bundle, subjectSummary(bundle, student), { tilt: [1, 2, 3, 4][index % 4] }))}${addSubjectTile(links.subjects({ add: 1 }), { tilt: [1, 2, 3, 4][enrolled.length % 4] })}</div>`
          : html`<div class="empty">
              <h3 class="empty__title">No subjects yet</h3>
              <p class="empty__text">Pick your subjects to see their papers, practice and progress here.</p>
              <a class="btn btn--primary" href="${links.subjects()}">Add a subject</a>
            </div>`}
      </section>

      <div class="dash-bottom">
        <section class="card tilt-3" aria-labelledby="glance-title">
          <i class="tape tape--l" aria-hidden="true"></i>
          <h2 id="glance-title">At a glance</h2>
          <div class="glance">
            <div><b>${latest.size}</b><span>questions</span></div>
            <div><b>${fmtPercent(overall.percentage)}</b><span>average</span></div>
            <div><b>${progress.paper_attempts.length}</b><span>papers &amp; tests</span></div>
            <div class="glance__streak"><b>${currentStreak(progress.question_attempts)}</b><span>day streak</span>${doodle('flame', 'streak-flame')}</div>
          </div>
        </section>
        <section class="card tilt-2" aria-labelledby="later-title">
          <i class="tape tape--r" aria-hidden="true"></i>
          <h2 id="later-title">Coming later</h2>
          <div class="soon-list">
            ${SOON.filter((item) => !FEATURES[item.feature]?.enabled).map((item) => html`<a class="tag tag--soon" href="${item.href}">${item.label}</a>`)}
            <a class="tag" href="${links.subjects()}">+ Add a subject</a>
          </div>
        </section>
      </div>

      ${boardWaitlist({ source: 'dashboard', title: 'Need another exam board?', compact: true })}`,
  );

  on(element, 'click', '[data-hide-notice]', async () => {
    await api.setPreference('hideDemoNotice', true);
    element.querySelector('[data-demo-notice]')?.remove();
  });
  on(element, 'click', '[data-discard]', async (event, button) => {
    const confirmed = await confirmDialog({
      title: 'Discard this session?',
      message: 'Your answers in this unfinished session will be removed. Results you have already saved are not affected.',
      confirmLabel: 'Discard',
      danger: true,
    });
    if (!confirmed) return;
    await api.deleteSession(button.dataset.discard);
    context.refresh();
  });
  const stopWaitlist = wireBoardWaitlist(element);
  const stopPicker = wireColourPicker(element);
  return () => {
    stopWaitlist();
    stopPicker?.();
  };
}
