// My subjects (approved mockups, inner-pages/4-my-subjects): the subjects a student is
// studying, with colour and target grade, plus the catalogue to add more (PRD section 2).

import { CATEGORY_GROUPS } from '../../config/app.config.js';
import { $, html, on, setHtml } from '../../core/dom.js';
import * as api from '../../data/api.js';
import { getBundle, getCurriculum, getSubjects, specIndex } from '../../data/content-repository.js';
import { icon } from '../icons.js';
import { saveSubjectSettings } from '../subject-colours.js';
import { subjectDialog } from '../subject-dialog.js';
import { mountSpecTree } from '../spec-tree.js';
import { filterSpecForCurriculum, mountCurriculumSelector } from '../curriculum-selector.js';
import { loadStudent, manageCard, subjectSummary, wireColourPicker } from '../student.js';
import { banner, emptyState, openModal, pageHead, toast } from '../ui.js';

const LEVELS = [
  { id: 'gcse', label: 'GCSE', level: 'GCSE' },
  { id: 'alevel', label: 'A-Level', level: 'A-Level' },
  { id: 'level3', label: 'Level 3', level: 'Level 3' },
];

const shortName = (name) => name.replace(/\s*\(.*\)$/, '');
const listNames = (names) => names.join(', ').replace(/, ([^,]*)$/, ' and $1');

/** Up to three subjects that fit the ones already chosen: same level, same subject group. */
function suggestionsFor(subjects, enrolled) {
  if (!enrolled.length) return [];
  const chosen = new Set(enrolled.map((subject) => subject.subject_id));
  const chosenNames = new Set(enrolled.map((subject) => shortName(subject.subject)));
  const levels = new Set(enrolled.map((subject) => subject.level));
  const picks = [];
  for (const subject of subjects) {
    if (chosen.has(subject.subject_id) || chosenNames.has(shortName(subject.subject)) || !levels.has(subject.level) || !subject.has_written_exam) continue;
    const partners = enrolled.filter((other) => other.category_group === subject.category_group && other.level === subject.level);
    if (!partners.length) continue;
    if (picks.some((pick) => shortName(pick.subject.subject) === shortName(subject.subject))) continue;
    picks.push({ subject, partners });
  }
  return picks.sort((a, b) => b.partners.length - a.partners.length).slice(0, 3);
}

export async function mount(element, context) {
  context.setTitle('My subjects');
  const subjects = await getSubjects();
  const enrolledAtStart = api.getProgress().enrolled_subjects;
  const startLevel = subjects.find((subject) => subject.subject_id === enrolledAtStart[0])?.level;
  let level = LEVELS.find((option) => option.id === context.query.level)?.id || LEVELS.find((option) => option.level === startLevel)?.id || 'alevel';
  let group = 'all';
  let search = '';
  let stopPicker = null;

  const catalogue = (enrolledIds) => {
    const wanted = LEVELS.find((option) => option.id === level).level;
    const words = search.trim().toLowerCase();
    const list = subjects.filter(
      (subject) =>
        subject.level === wanted &&
        (group === 'all' || subject.category_group === group) &&
        (!words || `${subject.subject} ${subject.board} ${subject.spec_code} ${subject.subject_category}`.toLowerCase().includes(words)),
    );
    if (!list.length) return emptyState({ iconName: 'search', title: 'No subjects match', text: 'Try another level, group or search.' });
    return html`<div class="catalogue">
      ${list.map(
        (subject, index) =>
          html`<article class="card ruled catalogue-card tilt-${[3, 2, 4][index % 3]}">
            <i class="tape tape--c" aria-hidden="true"></i>
            <p class="catalogue-card__cat">${CATEGORY_GROUPS[subject.category_group]?.label || subject.subject_category}</p>
            <h3>${subject.subject}</h3>
            <p>${subject.board} · ${subject.spec_code}</p>
            <p class="muted small">${subject.spec_notes}</p>
            ${subject.board_note ? html`<p class="small note">${icon('info', { size: 15 })} <span>${subject.board_note}</span></p>` : ''}
            ${subject.has_written_exam ? '' : html`<p class="small warn-note">${subject.no_written_exam}</p>`}
            <footer class="row row--tight">
              ${enrolledIds.has(subject.subject_id)
                ? html`<span class="btn btn--sm is-added" aria-disabled="true">${icon('check', { size: 15 })} Added</span>`
                : html`<button type="button" class="btn btn--sm btn--primary" data-enrol="${subject.subject_id}">+ Add subject</button>`}
              <a class="btn btn--sm" href="#/subject/${subject.subject_id}">View topics</a>
            </footer>
          </article>`,
      )}
    </div>`;
  };

  async function draw() {
    stopPicker?.();
    const student = await loadStudent();
    const enrolledIds = new Set(student.progress.enrolled_subjects);
    const enrolled = student.progress.enrolled_subjects.map((id) => student.bundles.get(id)).filter(Boolean);
    const suggestions = suggestionsFor(subjects, enrolled.map((bundle) => bundle.subject));

    setHtml(
      element,
      html`${pageHead({
          title: 'My subjects',
          sub: 'what you study, your target grades and the topics you’ve learned',
          crumbs: [{ label: 'Home', href: '#/' }, { label: 'My subjects' }],
        })}
        ${context.query.welcome && !enrolled.length
          ? banner(html`<strong>Welcome.</strong> Start by adding your subjects below. Next you will tick the topics you have learned so far.`)
          : ''}
        ${!api.isSignedIn() ? banner(html`Browse and filter for free. Your guest choices last until you refresh or close this page. <a href="#/signup">Create a free account</a> to save progress in this browser.`) : ''}
        <section class="dash-block" style="margin-top:10px" aria-labelledby="now-title">
          <div class="section-title">
            <h2 id="now-title">Studying now</h2>
            ${enrolled.length ? html`<span class="hand">tap the dot to change a subject’s colour</span>` : ''}
          </div>
          ${enrolled.length
            ? html`<div class="dash-subjects">
                ${enrolled.map((bundle, index) => manageCard(bundle, subjectSummary(bundle, student), student.progress, { tilt: [1, 2, 3, 4][index % 4] }))}
              </div>`
            : html`<div class="empty">
                <h3 class="empty__title">No subjects yet</h3>
                <p class="empty__text">Pick the subjects you study from the list below. Each one is matched to its exam board and specification.</p>
              </div>`}
          ${enrolled.length ? html`<div class="row" style="margin-top:16px"><a class="btn" href="#add-title" data-add-another>Add another subject</a><a class="btn btn--primary" href="#/practice?mode=individual">Finish setup · Find questions</a></div>` : ''}
        </section>

        <section class="dash-block" aria-labelledby="add-title">
          <div class="section-title"><h2 id="add-title">Add subjects</h2><span class="hand">each one is matched to its exam board and specification</span></div>
          ${suggestions.length
            ? html`<div class="section-title" style="margin-top:6px"><h3 class="h3">Suggested for you</h3><span class="hand">based on ${listNames(enrolled.map((bundle) => shortName(bundle.subject.subject)))}</span></div>
                <div class="suggestions">
                  ${suggestions.map(
                    ({ subject, partners }, index) =>
                      html`<article class="card suggestion tilt-${[2, 3, 1][index]}">
                        <div><h3>${shortName(subject.subject)}</h3><p class="muted small">${subject.level} · ${subject.board} · ${subject.spec_code}</p></div>
                        <button type="button" class="btn btn--sm btn--primary" data-enrol="${subject.subject_id}">+ Add</button>
                        <p class="hand">fits with ${listNames(partners.map((partner) => shortName(partner.subject)))}</p>
                      </article>`,
                  )}
                </div>`
            : ''}
          <div class="catalogue-bar">
            <div class="seg" role="tablist" aria-label="Level">
              ${LEVELS.map((option) => html`<button type="button" role="tab" class="seg__opt" aria-selected="${option.id === level}" data-level="${option.id}">${option.label}</button>`)}
            </div>
            <label class="searchbox catalogue-bar__search">${icon('search', { size: 16 })}<input class="input" type="search" placeholder="Search subjects or spec codes" value="${search}" data-search aria-label="Search subjects" /></label>
            <div class="chips" role="radiogroup" aria-label="Subject group">
              ${[['all', 'All'], ...Object.entries(CATEGORY_GROUPS).map(([id, entry]) => [id, entry.label])].map(
                ([id, label]) => html`<button type="button" class="chip chip--sm" role="radio" aria-checked="${group === id}" data-group="${id}">${label}</button>`,
              )}
            </div>
          </div>
          <div data-catalogue>${catalogue(enrolledIds)}</div>
        </section>`,
    );
    stopPicker = wireColourPicker(element);
  }

  const redrawCatalogue = () => setHtml($('[data-catalogue]', element), catalogue(new Set(api.getProgress().enrolled_subjects)));

  on(element, 'click', '[data-level]', (event, button) => {
    level = button.dataset.level;
    for (const other of element.querySelectorAll('[data-level]')) other.setAttribute('aria-selected', String(other === button));
    redrawCatalogue();
  });
  on(element, 'click', '[data-group]', (event, button) => {
    group = button.dataset.group;
    for (const other of element.querySelectorAll('[data-group]')) other.setAttribute('aria-checked', String(other === button));
    redrawCatalogue();
  });
  on(element, 'input', '[data-search]', (event, input) => {
    search = input.value;
    redrawCatalogue();
  });
  async function chooseCoverage(bundle, leaves) {
    let tree;
    const curriculum = await getCurriculum(bundle.subject.subject_id);
    return openModal({
      title: `Covered topics · ${bundle.subject.subject}`,
      wide: true,
      body: html`<p class="muted">${bundle.subject.level} · ${bundle.subject.board} ${bundle.subject.spec_code}. Choose the topics and exact specification points you have covered. Changes are applied only when you save.</p><div data-coverage-curriculum></div><div data-coverage-tree></div>`,
      actions: [
        { label: 'Cancel', cancel: true },
        { label: 'Save and continue adding subjects', variant: 'primary', collect: () => [...tree.getSelected()] },
      ],
      onOpen: (dialog) => {
        const root = dialog.querySelector('[data-coverage-tree]');
        let selected = leaves.filter((id) => api.learnedSet().has(id));
        const drawTree = ({ visible = null, full = null } = {}) => {
          if (tree) selected = [...tree.getSelected()];
          const treeRoot = document.createElement('div');
          root.replaceChildren(treeRoot);
          tree = mountSpecTree(treeRoot, {
            spec: filterSpecForCurriculum(bundle.spec, visible),
            selected,
            enabled: visible ? new Set([...visible].filter((id) => full.has(id))) : null,
            disabledHint: 'Partially mapped points cannot be marked covered from this view. Use the official specification.',
            noun: 'covered',
          });
        };
        drawTree();
        mountCurriculumSelector(dialog.querySelector('[data-coverage-curriculum]'), {
          curriculum, specIndex,
          onChange: drawTree,
        });
      },
    });
  }

  on(element, 'click', '[data-add-another]', (event) => {
    event.preventDefault();
    $('[data-search]', element)?.focus();
  });
  on(element, 'click', '[data-enrol]', async (event, button) => {
    const subject = subjects.find((candidate) => candidate.subject_id === button.dataset.enrol);
    const bundle = subject.has_written_exam ? await getBundle(subject.subject_id) : null;
    const leaves = bundle ? specIndex.subjectLeaves(subject.subject_id) : [];
    const choice = await subjectDialog({ subject, mode: 'add', leaves: leaves.length });
    if (!choice) return;
    await api.setEnrolled(subject.subject_id, true);
    await saveSubjectSettings(subject.subject_id, { swatch: choice.swatch, target: choice.target });
    if (choice.learned === 'all') await api.setLearned(leaves, true);
    if (choice.learned === 'tick') {
      const selected = await chooseCoverage(bundle, leaves);
      if (selected) {
        const selectedSet = new Set(selected);
        await api.setLearned(leaves.filter((id) => selectedSet.has(id)), true);
        await api.setLearned(leaves.filter((id) => !selectedSet.has(id)), false);
      }
    }
    await draw();
    $('[data-search]', element)?.focus();
    toast(`${subject.subject} added.`, { type: 'success' });
  });
  on(element, 'click', '[data-edit]', async (event, button) => {
    const subject = subjects.find((candidate) => candidate.subject_id === button.dataset.edit);
    const choice = await subjectDialog({ subject, mode: 'edit' });
    if (!choice) return;
    await saveSubjectSettings(subject.subject_id, { swatch: choice.swatch, target: choice.target });
    await draw();
  });
  on(element, 'click', '[data-unenrol]', async (event, button) => {
    button.disabled = true;
    const subject = subjects.find((candidate) => candidate.subject_id === button.dataset.unenrol);
    await api.setEnrolled(subject.subject_id, false);
    await draw();
    toast(`${subject.subject} removed. Your progress in it is kept.`);
  });

  await draw();
  return () => stopPicker?.();
}
