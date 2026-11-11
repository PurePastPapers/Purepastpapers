// My subjects: enrol in subjects from the catalogue (PRD section 2).

import { LEVEL_TABS } from '../../config/app.config.js';
import { html, on, setHtml } from '../../core/dom.js';
import * as api from '../../data/api.js';
import { getSubjects } from '../../data/content-repository.js';
import { icon } from '../icons.js';
import { loadStudent, subjectCard, subjectSummary } from '../student.js';
import { banner, emptyState, groupDot, pageHead, toast } from '../ui.js';

export async function mount(element, context) {
  context.setTitle('My subjects');
  const subjects = await getSubjects();
  const enrolledAtStart = api.getProgress().enrolled_subjects;
  const onlyGcse = enrolledAtStart.length > 0 && enrolledAtStart.every((id) => subjects.find((subject) => subject.subject_id === id)?.level === 'GCSE');
  let tab = context.query.level === 'gcse' || onlyGcse ? 'gcse' : 'alevel';

  async function draw() {
    const student = await loadStudent();
    const enrolledIds = new Set(student.progress.enrolled_subjects);
    const enrolled = student.progress.enrolled_subjects.map((id) => student.bundles.get(id)).filter(Boolean);
    const levels = LEVEL_TABS.find((candidate) => candidate.id === tab).levels;

    setHtml(
      element,
      html`${pageHead({
          title: 'My subjects',
          sub: 'Add the subjects you study. Each one is mapped to its exam board and specification, so questions and papers match your course.',
        })}
        <div class="stack stack--lg">
          ${context.query.welcome && !enrolled.length
            ? banner(html`<strong>Welcome.</strong> Start by adding your subjects below. Next you will tick the topics you have learned so far.`)
            : ''}
          <section>
            <div class="section-title"><h2 class="h2">Studying now</h2></div>
            ${enrolled.length
              ? html`<div class="grid">
                  ${enrolled.map(
                    (bundle) =>
                      html`<div class="enrolled">
                        ${subjectCard(bundle, subjectSummary(bundle, student))}
                        <button type="button" class="linkbtn small" data-unenrol="${bundle.subject.subject_id}">Remove ${bundle.subject.subject}</button>
                      </div>`,
                  )}
                </div>`
              : emptyState({ iconName: 'cap', title: 'No subjects yet', text: 'Add your first subject from the list below.' })}
          </section>
          <section>
            <div class="section-title"><h2 class="h2">Add subjects</h2></div>
            <div class="tabs" role="tablist">
              ${LEVEL_TABS.map(
                (option) =>
                  html`<button type="button" role="tab" class="tab ${option.id === tab ? 'is-active' : ''}" aria-selected="${option.id === tab}" data-tab="${option.id}">
                    ${option.label}
                  </button>`,
              )}
            </div>
            <div class="grid">
              ${subjects
                .filter((subject) => levels.includes(subject.level))
                .map(
                  (subject) =>
                    html`<article class="card catalogue-card">
                      <p class="small muted">${groupDot(subject)} ${subject.subject_category}</p>
                      <h3 class="h3">${subject.subject}</h3>
                      <p class="small"><span class="mono">${subject.board} · ${subject.spec_code}</span></p>
                      <p class="small muted">${subject.spec_notes}</p>
                      ${subject.board_note ? html`<p class="small note">${icon('info', { size: 15 })} <span>${subject.board_note}</span></p>` : ''}
                      ${subject.has_written_exam ? '' : html`<p class="small note">${icon('info', { size: 15 })} <span>${subject.no_written_exam}</span></p>`}
                      <footer class="row row--tight">
                        ${enrolledIds.has(subject.subject_id)
                          ? html`<button type="button" class="btn btn--sm" data-unenrol="${subject.subject_id}">${icon('check', { size: 15 })} Added</button>`
                          : html`<button type="button" class="btn btn--sm btn--primary" data-enrol="${subject.subject_id}">${icon('plus', { size: 15 })} Add subject</button>`}
                        <a class="btn btn--sm btn--ghost" href="#/subject/${subject.subject_id}">View topics</a>
                      </footer>
                    </article>`,
                )}
            </div>
          </section>
        </div>`,
    );
  }

  on(element, 'click', '[data-tab]', (event, button) => {
    tab = button.dataset.tab;
    draw();
  });
  on(element, 'click', '[data-enrol]', async (event, button) => {
    button.disabled = true;
    const subject = subjects.find((candidate) => candidate.subject_id === button.dataset.enrol);
    await api.setEnrolled(subject.subject_id, true);
    await draw();
    toast(`${subject.subject} added. Next, tick what you have learned.`, { type: 'success' });
  });
  on(element, 'click', '[data-unenrol]', async (event, button) => {
    button.disabled = true;
    const subject = subjects.find((candidate) => candidate.subject_id === button.dataset.unenrol);
    await api.setEnrolled(subject.subject_id, false);
    await draw();
    toast(`${subject.subject} removed. Your progress in it is kept.`);
  });

  await draw();
}
