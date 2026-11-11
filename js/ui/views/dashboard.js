// Signed-in home: what to do next, where the student stands, and the four sections.

import { CONTENT } from '../../config/app.config.js';
import { FEATURES } from '../../config/phases.js';
import { html, on, setHtml } from '../../core/dom.js';
import { fmtDuration, fmtRelative } from '../../core/utils.js';
import * as api from '../../data/api.js';
import { specIndex } from '../../data/content-repository.js';
import { elapsedMs } from '../../data/sessions.js';
import { currentStreak, masteryByNode, totals } from '../../engine/analytics.js';
import { icon } from '../icons.js';
import { loadStudent, subjectCard, subjectSummary } from '../student.js';
import { banner, confirmDialog, fmtPercent, liveBadge, meter, pageHead, ragBadge, soonBadge } from '../ui.js';

const greeting = () => {
  const hour = new Date().getHours();
  return hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
};

const SESSION_LABELS = { full_paper: 'Past paper', custom_test: 'Timed test', question_set: 'Question set', single: 'Question' };

export async function mount(element, context) {
  context.setTitle('Dashboard');
  const user = api.currentUser();
  const student = await loadStudent();
  const { progress, bundles, latest } = student;
  const enrolled = progress.enrolled_subjects.map((id) => bundles.get(id)).filter(Boolean);
  const examined = enrolled.filter((bundle) => bundle.subject.has_written_exam);
  const overall = totals([...latest.values()]);
  const resumable = api.resumableSessions();

  // Topics to work on next: lowest scoring topics with at least a few marks of evidence.
  const weakest = [];
  for (const bundle of examined) {
    const mastery = masteryByNode(latest, bundle.questionsById, specIndex);
    for (const section of bundle.spec.sections) {
      for (const topic of section.topics) {
        const entry = mastery.get(topic.id);
        if (entry && entry.max >= 4 && entry.rag !== 'green') weakest.push({ bundle, topic, entry });
      }
    }
  }
  weakest.sort((a, b) => a.entry.percentage - b.entry.percentage);

  const steps = [
    { done: enrolled.length > 0, label: 'Choose your subjects', href: '#/subjects' },
    { done: progress.learned_spec_points.length > 0, label: 'Tick the topics you have learned', href: enrolled[0] ? `#/subject/${enrolled[0].subject.subject_id}` : '#/subjects' },
    { done: progress.question_attempts.length > 0, label: 'Answer your first questions', href: '#/practice' },
  ];
  const settingUp = steps.some((step) => !step.done);

  setHtml(
    element,
    html`${pageHead({
        title: `${greeting()}, ${user.display_name}`,
        sub: settingUp ? 'Three quick steps and your practice will be tailored to what you know.' : 'Here is where you stand and what to do next.',
        actions: html`<a class="btn btn--primary" href="#/practice">${icon('sliders')} Start practising</a><a class="btn" href="#/papers">Past papers</a>`,
      })}
      <div class="stack stack--lg">
        ${user.is_demo ? banner(html`<strong>You are in the demo account.</strong> Its subjects, learned topics and scores are sample activity so you can see every screen with data. Log out and create your own account to start fresh.`, { type: 'demo' }) : ''}
        ${CONTENT.showSampleContent && !progress.preferences.hideDemoNotice
          ? html`<div data-demo-notice>
              ${banner(
                html`<strong>This build ships with demo questions.</strong> They are written for the platform so every feature can be tried, and are
                  always labelled “Demo content”. Official papers are listed with links to the exam boards.
                  <button type="button" class="linkbtn" data-hide-notice>Hide this</button>`,
                { type: 'info' },
              )}
            </div>`
          : ''}
        ${settingUp
          ? html`<section class="card">
              <h2 class="h2">Get set up</h2>
              <ol class="steps">
                ${steps.map(
                  (step, index) =>
                    html`<li class="steps__item ${step.done ? 'is-done' : ''}">
                      <span class="steps__mark" aria-hidden="true">${step.done ? icon('check', { size: 16 }) : index + 1}</span>
                      <a href="${step.href}">${step.label}</a>
                      ${step.done ? html`<span class="small muted">Done</span>` : ''}
                    </li>`,
                )}
              </ol>
            </section>`
          : ''}
        ${resumable.length
          ? html`<section>
              <div class="section-title"><h2 class="h2">Pick up where you left off</h2></div>
              <div class="stack stack--sm">
                ${resumable.slice(0, 3).map(
                  (session) =>
                    html`<div class="card resume">
                      <div style="min-width:0">
                        <p class="small muted">${SESSION_LABELS[session.kind]} · started ${fmtRelative(session.started_at)}</p>
                        <p class="h3">${session.title}</p>
                        <p class="small muted">
                          ${session.status === 'marking' ? 'Waiting to be marked' : `${Object.keys(session.answers).length} of ${session.question_ids.length || 1} answered`}
                          · ${fmtDuration(elapsedMs(session) / 1000)} so far
                        </p>
                      </div>
                      <div class="row row--tight">
                        <a class="btn btn--primary btn--sm" href="#/session/${session.session_id}">Resume</a>
                        <button type="button" class="btn btn--ghost btn--sm" data-discard="${session.session_id}">Discard</button>
                      </div>
                    </div>`,
                )}
              </div>
            </section>`
          : ''}
        ${progress.question_attempts.length || progress.paper_attempts.length
          ? html`<section class="grid grid--stats" aria-label="Your numbers">
              <div class="stat"><span class="stat__label">Questions answered</span><span class="stat__value">${latest.size}</span></div>
              <div class="stat">
                <span class="stat__label">Average score</span><span class="stat__value">${fmtPercent(overall.percentage)}</span>
                <span class="stat__note">latest attempt at each question</span>
              </div>
              <div class="stat"><span class="stat__label">Papers and tests</span><span class="stat__value">${progress.paper_attempts.length}</span></div>
              <div class="stat">
                <span class="stat__label">Day streak</span><span class="stat__value">${currentStreak(progress.question_attempts)}</span>
                <span class="stat__note"><a href="#/hub">Open the Data Hub</a></span>
              </div>
            </section>`
          : ''}
        ${enrolled.length
          ? html`<section>
              <div class="section-title"><h2 class="h2">Your subjects</h2><a class="small" href="#/subjects">Manage subjects</a></div>
              <div class="grid">${enrolled.map((bundle) => subjectCard(bundle, subjectSummary(bundle, student)))}</div>
            </section>`
          : ''}
        ${weakest.length
          ? html`<section class="card">
              <div class="card__head"><h2 class="card__title">Focus next</h2><span class="small muted">Your lowest scoring topics</span></div>
              <div class="meterlist meterlist--action">
                ${weakest.slice(0, 5).map(
                  ({ bundle, topic, entry }) =>
                    html`<div class="meterlist__name">${topic.title}<br /><span class="small muted">${bundle.subject.subject}</span></div>
                      ${meter(entry.percentage, entry.rag, `${topic.title}: ${fmtPercent(entry.percentage)}`)}
                      <div class="meterlist__value row row--tight row--nowrap">
                        ${ragBadge(entry.rag, entry.percentage, { label: false })}
                        <a class="btn btn--sm" href="#/practice?subject=${bundle.subject.subject_id}&topic=${encodeURIComponent(topic.id)}">Practise</a>
                      </div>`,
                )}
              </div>
            </section>`
          : ''}
        <section>
          <div class="section-title"><h2 class="h2">Sections</h2></div>
          <div class="grid">
            <a class="card card--link" href="#/papers">
              <p class="row row--between">${icon('file', { size: 22 })} ${liveBadge()}</p>
              <h3 class="h3 section-card__title">Official past papers</h3>
              <p class="muted small">Real exam series from the boards. Sit them timed and log your marks.</p>
            </a>
            <a class="card card--link" href="#/practice">
              <p class="row row--between">${icon('sliders', { size: 22 })} ${liveBadge()}</p>
              <h3 class="h3 section-card__title">Customisable practice</h3>
              <p class="muted small">Timed tests and a question picker, filtered to the topics you have learned.</p>
            </a>
            <a class="card card--link card--soon" href="#/ai-papers">
              <p class="row row--between">${icon('sparkle', { size: 22 })} ${soonBadge('aiPastPapers')}</p>
              <h3 class="h3 section-card__title">${FEATURES.aiPastPapers.title}</h3>
              <p class="muted small">${FEATURES.aiPastPapers.lead}</p>
            </a>
            <a class="card card--link card--soon" href="#/predicted">
              <p class="row row--between">${icon('target', { size: 22 })} ${soonBadge('predictedPapers')}</p>
              <h3 class="h3 section-card__title">${FEATURES.predictedPapers.title}</h3>
              <p class="muted small">${FEATURES.predictedPapers.lead}</p>
            </a>
          </div>
        </section>
      </div>`,
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
}
