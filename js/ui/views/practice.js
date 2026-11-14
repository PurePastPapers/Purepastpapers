// Customisable Practice (PRD 4.1–4.3).
//   STEM subjects       → "Timed test" builder + "Individual questions"
//   Humanities subjects → untimed "Question picker" (plus a timed test for mixed subjects)
// Everything here draws from the unified question pool through the filtering engine, so a
// student is never given a question that needs a topic they have not marked as learned.

import {
  APP, DEFAULT_TEST_MINUTES, DIFFICULTIES, LIMITS, MARK_BANDS, MIXED, PRACTICE_MODES, TEST_DURATIONS,
} from '../../config/app.config.js';
import { FEATURES, enabledSourceTypes, isEnabled } from '../../config/phases.js';
import { $, html, on, setHtml } from '../../core/dom.js';
import { debounce, fmtMinutes, plural, sum, uid } from '../../core/utils.js';
import * as api from '../../data/api.js';
import { getCurriculum, specIndex } from '../../data/content-repository.js';
import { createSession } from '../../data/sessions.js';
import { countByNode, filterQuestions } from '../../engine/filter-engine.js';
import { latestByQuestion } from '../../engine/analytics.js';
import { buildTest, minutesOf } from '../../engine/test-builder.js';
import { icon } from '../icons.js';
import { markSchemeBody, marksPill, questionBody, questionMeta, questionRef } from '../question-view.js';
import { mountSpecTree } from '../spec-tree.js';
import { mountCurriculumSelector } from '../curriculum-selector.js';
import { loadStudent, practicePool, startQuestionSet, subjectPills } from '../student.js';
import { scStyle, tintPage } from '../subject-colours.js';
import { banner, difficultyBadge, emptyState, pageHead, soonBadge, toast } from '../ui.js';

/** Question sources. The AI options unlock when Phase 2 is enabled in phases.js. */
const SOURCE_CHOICES = [
  { id: 'official', label: 'Past-paper practice', types: ['real_past_paper'] },
  { id: 'ai', label: 'AI questions', types: ['ai_past_paper', 'ai_spec_question'], feature: 'aiQuestionPool' },
  { id: 'both', label: 'Both', types: ['real_past_paper', 'ai_past_paper', 'ai_spec_question'], feature: 'aiQuestionPool' },
];

const SORTS = {
  newest: 'Newest first',
  oldest: 'Oldest first',
  shuffle: 'Shuffled',
  spec: 'Specification order',
  marks_asc: 'Marks: low to high',
  marks_desc: 'Marks: high to low',
  difficulty: 'Difficulty',
};

const defaults = () => ({
  mode: null,
  source: 'official',
  focus: null, // null = unrestricted; [] = no selected points
  difficulties: [],
  bands: [],
  statuses: [],
  learnedOnly: false,
  search: '',
  sort: 'newest',
  markStatus: 'all',
  selectionMode: 'strict',
  focusMode: 'any',
  focusScope: 'primary',
  rangeFrom: '',
  rangeTo: '',
  year: '',
  series: '',
  tier: '',
  paper: '',
  sampleMode: 'all',
  page: 1,
  minutes: DEFAULT_TEST_MINUTES,
  difficulty: 'mixed',
  preferUnseen: true,
  prioritiseWeak: false,
  seed: Math.floor(Math.random() * 1e9),
  selected: [],
  openQuestion: '',
  showScheme: false,
  drafts: {},
  stopwatch: false,
  showTree: false,
  curriculum: {},
});

const toggle = (list, value) => (list.includes(value) ? list.filter((item) => item !== value) : [...list, value]);

export async function mount(element, context) {
  context.setTitle('Practice');
  const student = await loadStudent();
  const { progress, bundles, latest } = student;
  const user = api.currentUser();
  const enrolled = progress.enrolled_subjects.map((id) => bundles.get(id)).filter((bundle) => bundle?.subject.practice_modes.length);
  const head = (crumb) =>
    pageHead({
      title: 'Find questions',
      sub: 'Browse questions or build a test',
      crumbs: [{ label: 'Home', href: '#/' }, { label: 'Practice', href: '#/practice' }, ...(crumb ? [{ label: crumb }] : [])],
    });

  if (!enrolled.length) {
    setHtml(
      element,
      html`${head()}${emptyState({
        iconName: 'cap',
        title: 'Add a subject first',
        text: 'Practice is built from the subjects you study and the topics you have ticked as learned.',
        action: html`<a class="btn btn--primary" href="#/subjects">Choose subjects</a>`,
      })}`,
    );
    return;
  }

  const wanted = context.query.subject || progress.preferences.lastSubject;
  const bundle = enrolled.find((candidate) => candidate.subject.subject_id === wanted) || enrolled[0];
  const { subject, spec } = bundle;
  const subjectId = subject.subject_id;
  const curriculum = await getCurriculum(subjectId);
  let curriculumPoints = null;
  if (progress.preferences.lastSubject !== subjectId) api.setPreference('lastSubject', subjectId);

  // ── state (kept for the browser tab, so filters survive opening a question and coming back) ──
  const storageKey = `${APP.storageNamespace}:practice:${user?.user_id || 'guest'}:${subjectId}`;
  let state = { ...defaults(), mode: subject.practice_modes.includes('individual') ? 'individual' : subject.practice_modes.includes('picker') ? 'picker' : subject.practice_modes[0] };
  const storage = user ? localStorage : sessionStorage;
  try {
    state = { ...state, ...JSON.parse(storage.getItem(storageKey) || '{}') };
  } catch {
    /* start from defaults */
  }
  const save = () => {
    try {
      storage.setItem(storageKey, JSON.stringify(state));
    } catch {
      /* not essential */
    }
  };

  const modes = subject.practice_modes;
  if (modes.includes(context.query.mode)) state.mode = context.query.mode;
  else state.mode = modes.includes('individual') ? 'individual' : modes.includes('picker') ? 'picker' : modes[0];
  state.sort = ({ paper: 'paper_order', marks: 'marks_asc', 'marks-desc': 'marks_desc' })[state.sort] || state.sort;
  if (!SORTS[state.sort]) state.sort = 'newest';
  if (!['strict', 'crossover'].includes(state.selectionMode)) state.selectionMode = 'strict';
  if (!['all', 'unmarked', 'marked', 'lost', 'full'].includes(state.markStatus)) state.markStatus = 'all';
  if (!state.drafts || typeof state.drafts !== 'object') state.drafts = {};
  if (!['any', 'all'].includes(state.focusMode)) state.focusMode = 'any';
  if (!['primary', 'primary_and_crossover'].includes(state.focusScope)) state.focusScope = 'primary';
  if (!['all', 'hide', 'only'].includes(state.sampleMode)) state.sampleMode = 'all';
  state.page = Math.max(1, Math.floor(Number(state.page) || 1));
  if (!SOURCE_CHOICES.some((choice) => choice.id === state.source && (!choice.feature || isEnabled(choice.feature)))) state.source = 'official';

  const learned = api.learnedSet();
  const subjectLeaves = specIndex.subjectLeaves(subjectId);
  const learnedLeaves = subjectLeaves.filter((id) => learned.has(id));
  if (context.query.topic) {
    // "Practise this topic" links arrive here with a topic or spec point id.
    const wantedLeaves = specIndex.leavesOf(context.query.topic).filter((id) => subjectLeaves.includes(id));
    if (wantedLeaves.length) state.focus = wantedLeaves;
  }
  state.selected = state.selected.filter((id) => bundle.questionsById.has(id));
  save();

  const pool = practicePool(bundle);
  const representedParents = new Set(pool.map((question) => question.parent_question_id).filter(Boolean));
  const suppressedParents = bundle.questions.filter((question) => !question.part_label && representedParents.has(question.question_id) && question.include_in_custom_pool !== false && enabledSourceTypes().includes(question.source_type)).length;
  const engineContext = { specIndex, learned, latestAttempts: latest, papersById: bundle.papersById };
  const specNodes = specIndex.subjectNodes(subjectId).filter((node) => node.type !== 'section');
  const PAGE_SIZE = 30;
  const timed = () => state.mode === 'timed_test';
  const sourceTypes = () => SOURCE_CHOICES.find((choice) => choice.id === state.source).types.filter((type) => enabledSourceTypes().includes(type));
  const scopedPool = () => pool.filter((question) => sourceTypes().includes(question.source_type));
  const treeEnabled = () => null; // Choosing a focus and knowing a topic are independent filters.
  const setTexts = spec.sections.flatMap((section) => section.topics.filter((topic) => topic.kind === 'set_text').flatMap((topic) => topic.points));
  const exactTariffs = !modes.includes('individual'); // essay subjects filter by exact mark tariff
  const bandOptions = exactTariffs
    ? [...new Set(pool.map((question) => question.marks))].sort((a, b) => a - b).map((marks) => ({ id: `=${marks}`, label: `${marks} marks`, min: marks, max: marks }))
    : MARK_BANDS;

  function activeFocus() {
    return state.focus;
  }

  const criteria = (extra = {}) => ({
    sourceTypes: sourceTypes(),
    focus: activeFocus(),
    focusMode: state.focusMode,
    focusScope: state.focusScope,
    selectionMode: state.selectionMode,
    curriculumPoints,
    specRange: state.rangeFrom || state.rangeTo
      ? { subjectId, fromId: state.rangeFrom, toId: state.rangeTo } : null,
    years: state.year ? [Number(state.year)] : null,
    series: state.series ? [state.series] : null,
    tiers: state.tier ? [state.tier] : null,
    paperIds: state.paper ? [state.paper] : null,
    sampleMode: state.sampleMode,
    learnedOnly: timed() ? true : state.learnedOnly,
    sortBy: state.sort,
    shuffleSeed: state.seed,
    ...extra,
  });

  function metadataControls() {
    const papers = [...new Set(scopedPool().map((question) => question.paper_id))].map((id) => bundle.papersById.get(id)).filter(Boolean);
    const years = [...new Set(papers.map((paper) => paper.year).filter(Number.isInteger))].sort((a, b) => b - a);
    const series = [...new Set(papers.map((paper) => paper.series).filter(Boolean))];
    const tiers = [...new Set(scopedPool().map((question) => question.tier !== undefined ? question.tier : bundle.papersById.get(question.paper_id)?.tier).filter(Boolean))];
    const select = (key, label, values, all) => html`<label class="field"><span class="field__label">${label}</span><select class="select" data-filter="${key}"><option value="">${all}</option>${state[key] && !values.some((value) => String(value) === String(state[key])) ? html`<option value="${state[key]}" selected>Unavailable saved filter: ${state[key]}</option>` : ''}${values.map((value) => html`<option value="${value}" ${String(state[key]) === String(value) ? 'selected' : ''}>${value}</option>`)}</select></label>`;
    return html`<details class="filter-details" ${state.year || state.series || state.tier || state.paper || state.sampleMode !== 'all' ? 'open' : ''}><summary>Paper & content filters</summary><div class="stack">
      <div class="filter-grid">${select('year', 'Exam year', years, 'Any year')}${select('series', 'Exam series', series, 'Any series')}${select('tier', 'Tier', tiers, 'Any tier')}</div>
      <label class="field"><span class="field__label">Paper</span><select class="select" data-filter="paper"><option value="">Any paper</option>${state.paper && !papers.some((paper) => paper.paper_id === state.paper) ? html`<option value="${state.paper}" selected>Saved paper unavailable — clear this filter</option>` : ''}${papers.map((paper) => html`<option value="${paper.paper_id}" ${state.paper === paper.paper_id ? 'selected' : ''}>${paper.title}</option>`)}</select></label>
      <label class="field"><span class="field__label">Demo content</span><select class="select" data-filter="sampleMode"><option value="all" ${state.sampleMode === 'all' ? 'selected' : ''}>Include demo questions</option><option value="hide" ${state.sampleMode === 'hide' ? 'selected' : ''}>Hide demo questions</option><option value="only" ${state.sampleMode === 'only' ? 'selected' : ''}>Demo questions only</option></select></label>
      <p class="field__hint">Only papers with extracted questions appear here. The current question bank is demo content; catalogue listings alone do not add questions. Missing year or tier data does not match a specific filter.</p>
    </div></details>`;
  }

  function rangeControl() {
    const from = specIndex.get(state.rangeFrom);
    const to = specIndex.get(state.rangeTo);
    const active = Boolean(state.rangeFrom || state.rangeTo);
    const valid = active && specIndex.range(subjectId, state.rangeFrom, state.rangeTo).size > 0;
    const optionLabel = (node) => `${node.code ? node.code + ' · ' : ''}${node.title} — ${specIndex.get(node.type === 'topic' ? node.parent : specIndex.get(node.parent)?.parent)?.title || ''}`;
    return html`<details class="filter-details" ${active ? 'open' : ''}><summary>Specification range</summary><div class="stack stack--sm">
      <p class="field__hint">Choose an inclusive range, such as 2.1 to 2.5. Codes are labels, not decimals: 2.11 means point eleven. Ranges follow the stored order for this subject, not alphabetical order.</p>
      <div class="filter-grid filter-grid--two">${[['rangeFrom', 'From'], ['rangeTo', 'To']].map(([key, label]) => html`<label class="field"><span class="field__label">${label}</span><select class="select" data-filter="${key}"><option value="">Choose a spec point or topic</option>${state[key] && !specNodes.some((node) => node.id === state[key]) ? html`<option value="${state[key]}" selected>Saved spec point unavailable</option>` : ''}${specNodes.map((node) => html`<option value="${node.id}" ${state[key] === node.id ? 'selected' : ''}>${optionLabel(node)}</option>`)}</select></label>`)}</div>
      ${active ? html`<p class="small ${valid ? 'muted' : 'form-error'}" role="status">${valid ? `${from.code || from.title} to ${to.code || to.title}: ${specIndex.range(subjectId, state.rangeFrom, state.rangeTo).size} spec points. Also applies any topic selections above.` : 'Choose both endpoints in specification order. No questions match an incomplete or reversed range.'}</p><button type="button" class="linkbtn small" data-range-reset>Clear range</button>` : ''}
    </div></details>`;
  }

  // ───────────────────────────────── shared controls ─────────────────────────────────

  function focusSummary() {
    const focus = activeFocus();
    if (focus === null) return 'Every topic in the specification. Learned-topic filtering applies separately.';
    if (!focus.length) return 'No topics chosen.';
    const topics = new Set(focus.map((id) => specIndex.topicOf(id)?.title || specIndex.label(id)));
    return `${plural(focus.length, 'spec point')} across ${plural(topics.size, 'topic')}: ${[...topics].slice(0, 3).join(', ')}${topics.size > 3 ? '…' : ''}`;
  }

  function topicsControl() {
    return html`<fieldset class="field">
      <legend class="field__label">Topics & specification points</legend>
      <div data-curriculum></div>
      <p class="small muted" data-focus-summary>${focusSummary()}</p>
      ${setTexts.length
        ? html`<div class="chips" role="group" aria-label="Set texts">
            ${setTexts.map((point) => {
              const usable = !treeEnabled() || treeEnabled().has(point.id);
              const on_ = state.focus?.includes(point.id) || false;
              return html`<button type="button" class="chip" data-text="${point.id}" aria-pressed="${on_}" ${usable ? '' : 'disabled'} title="${usable ? '' : 'Not ticked as learned'}">
                ${point.title}
              </button>`;
            })}
          </div>`
        : ''}
      <div class="row row--tight">
        <button type="button" class="btn btn--sm" data-toggle-tree aria-expanded="${state.showTree}">
          ${icon('list', { size: 15 })} ${state.showTree ? 'Hide topic list' : 'Choose topics'}
        </button>
        <button type="button" class="linkbtn small" data-focus-reset ${state.focus === null ? 'hidden' : ''}>Use all topics</button>
        <button type="button" class="linkbtn small" data-focus-clear>Clear selection</button>
        <a class="small" href="#/subject/${subjectId}">Edit what I have learned</a>
      </div>
      <div class="focus-tree" data-tree ${state.showTree ? '' : 'hidden'}></div>
      ${rangeControl()}
      <label class="field"><span class="field__label">Specification selection</span><select class="select" data-filter="selectionMode"><option value="strict" ${state.selectionMode === 'strict' ? 'selected' : ''}>Only these spec points</option><option value="crossover" ${state.selectionMode === 'crossover' ? 'selected' : ''}>Include crossover questions</option></select></label>
      <p class="field__hint">Only these points includes questions that assess at least one selected point and need no points outside the selection. Crossover also includes questions needing other points, which are shown on each card. Covered-topic filtering is separate.</p>
    </fieldset>`;
  }

  function sourceControl() {
    return html`<fieldset class="field">
      <legend class="field__label">Question source</legend>
      <p class="field__hint">The current extracted-question examples are demo content, not official exam questions. Other sources will appear only when available.</p>
      <div class="seg" role="radiogroup" aria-label="Question source">
        ${SOURCE_CHOICES.map((choice) => {
          const available = !choice.feature || isEnabled(choice.feature);
          return html`<button type="button" class="seg__opt" role="radio" aria-checked="${state.source === choice.id}" data-source="${choice.id}" ${available ? '' : 'disabled'}>
            ${choice.label}
          </button>`;
        })}
      </div>
      ${isEnabled('aiQuestionPool') ? '' : html`<p class="field__hint">${soonBadge('aiQuestionPool')} ${FEATURES.aiQuestionPool.title} join the pool in Phase 2.</p>`}
    </fieldset>`;
  }

  let tree = null;
  function mountTree() {
    const curriculumTarget = $('[data-curriculum]', element);
    if (curriculumTarget) {
      let mounting = true;
      mountCurriculumSelector(curriculumTarget, { curriculum, specIndex, initial: state.curriculum, onChange: ({ visible, partial, state: next }) => {
        state.curriculum = next;
        curriculumPoints = visible ? [...visible] : null;
        if (partial.size) {
          const note = document.createElement('p');
          note.className = 'small muted';
          note.textContent = 'Partially mapped points may contain questions beyond this chapter or year; check the specification tags.';
          curriculumTarget.append(note);
        }
        if (!mounting) { state.page = 1; save(); update({ keepControls: true }); }
      }});
      mounting = false;
    }
    const target = $('[data-tree]', element);
    if (!target || !state.showTree) {
      tree = null;
      return;
    }
    const enabledSet = treeEnabled();
    const all = enabledSet ? learnedLeaves : subjectLeaves;
    const counts = countByNode(scopedPool(), specIndex);
    tree = mountSpecTree(target, {
      spec,
      selected: state.focus === null ? all : state.focus,
      enabled: enabledSet,
      noun: 'chosen',
      disabledHint: 'Not ticked as learned yet',
      topicMeta: (topic, { selected }) => {
        const count = counts.get(topic.id) || 0;
        return html`<span>${count} ${count === 1 ? 'question' : 'questions'}</span><span>${selected} chosen</span>`;
      },
      onChange: (selected) => {
        state.focus = selected.size === all.length ? null : [...selected];
        state.page = 1;
        save();
        update({ keepControls: true }); // leave the tree as the student has it open
      },
    });
  }

  // ───────────────────────────────── timed test (STEM) ─────────────────────────────────

  let currentTest = null;

  function builderControls(matches) {
    const perLevel = (id) => matches.filter((question) => question.difficulty === id).length;
    const mixedCount = matches.filter((question) => question.difficulty !== 'extra_hard').length;
    const levels = [...DIFFICULTIES.filter((d) => !d.beyondSpec || subject.extra_hard || perLevel(d.id) > 0), MIXED];
    return html`<div class="builder">
      <fieldset class="card ruled builder__card tilt-3">
        <i class="tape tape--c" aria-hidden="true"></i>
        <legend class="builder__title">Length</legend>
        <p class="hand builder__note">roughly how long you have</p>
        <div class="chips">
          ${TEST_DURATIONS.map((minutes) => html`<button type="button" class="chip" data-minutes="${minutes}" aria-pressed="${state.minutes === minutes}">${fmtMinutes(minutes)}</button>`)}
          <label class="row row--tight row--nowrap small">
            <span class="muted">Custom</span>
            <input class="input input--sm input--num" type="number" min="5" max="240" step="5" value="${state.minutes}" data-minutes-input aria-label="Custom length in minutes" />
          </label>
        </div>
      </fieldset>
      <fieldset class="card ruled builder__card tilt-2">
        <i class="tape tape--c" aria-hidden="true"></i>
        <legend class="builder__title">Difficulty</legend>
        <p class="hand builder__note">numbers show how many questions match</p>
        <div class="chips" role="radiogroup" aria-label="Difficulty">
          ${levels.map((level) => {
            const count = level.id === 'mixed' ? mixedCount : perLevel(level.id);
            return html`<button type="button" class="chip" role="radio" aria-checked="${state.difficulty === level.id}" data-difficulty="${level.id}" title="${level.description}">
              ${level.label}<span class="chip__count">${count}</span>
            </button>`;
          })}
        </div>
        <p class="field__hint">${(DIFFICULTIES.find((d) => d.id === state.difficulty) || MIXED).description}</p>
      </fieldset>
      <div class="card ruled builder__card builder__card--wide tilt-3">
        <i class="tape tape--l" aria-hidden="true"></i>
        <h2 class="builder__title">Topics</h2>
        <p class="hand builder__note">only topics you’ve ticked as learned are used, change them on the subject page</p>
        <div class="stack">${topicsControl()} ${metadataControls()} ${sourceControl()}</div>
      </div>
      <fieldset class="card ruled builder__card tilt-1">
        <i class="tape tape--c" aria-hidden="true"></i>
        <legend class="builder__title">Question choice</legend>
        <label class="check"><input type="checkbox" data-flag="preferUnseen" ${state.preferUnseen ? 'checked' : ''} /><span>Prefer questions I haven’t done yet</span></label>
        <label class="check"><input type="checkbox" data-flag="prioritiseWeak" ${state.prioritiseWeak ? 'checked' : ''} /><span>Bring back questions I scored below 70% on</span></label>
      </fieldset>
    </div>`;
  }

  function testPreview(matches, lockedCount) {
    currentTest = buildTest(matches, {
      minutes: state.minutes,
      difficulty: state.difficulty,
      seed: state.seed,
      latestAttempts: latest,
      preferUnseen: state.preferUnseen,
      prioritiseWeak: state.prioritiseWeak,
      topicOf: (question) => specIndex.topicOf(question.primary_spec_points[0])?.id || '',
    });
    const test = currentTest;
    if (!test.questions.length) {
      return html`<div class="card">
        ${emptyState({
          iconName: 'filter',
          title: 'No questions match yet',
          text: !learnedLeaves.length
            ? 'Tick the topics you have learned and questions will appear here.'
            : lockedCount
              ? `${plural(lockedCount, 'question')} in this subject need topics you have not ticked. Try another difficulty or widen your topics.`
              : 'Try another difficulty, widen your topics, or add questions for this subject.',
          action: html`<a class="btn btn--primary" href="#/subject/${subjectId}">Tick learned topics</a>`,
        })}
      </div>`;
    }
    return html`<div class="card testpreview tilt-2">
      <i class="tape tape--c" aria-hidden="true"></i>
      <header class="testpreview__band"><h2>Your test</h2><span class="hand">ready when you are</span></header>
      <div class="testpreview__body stack">
        <div class="glance glance--3">
          <div><b>${test.questions.length}</b><span>questions</span></div>
          <div><b>${test.total_marks}</b><span>marks</span></div>
          <div><b>${test.total_minutes}</b><span>minutes</span></div>
        </div>
        ${test.short
          ? banner(
              html`Only <strong>${fmtMinutes(test.available_minutes)}</strong> of questions match these settings, so this test is shorter than ${state.minutes} minutes. Widen
                the topics or difficulty for a full-length test.`,
              { type: 'warn' },
            )
          : ''}
        <ol class="testlist">
          ${test.questions.map(
            (question, index) =>
              html`<li>
                <span class="testlist__num">${index + 1}</span>
                <span class="testlist__topic">${specIndex.topicOf(question.primary_spec_points[0])?.title || 'Topic'}</span>
                ${difficultyBadge(question.difficulty)}
                <span class="small muted nowrap">${plural(question.marks, 'mark')}</span>
              </li>`,
          )}
        </ol>
        <div class="testpreview__actions">
          <button type="button" class="btn btn--lg" data-shuffle>Shuffle</button>
          <button type="button" class="btn btn--primary btn--lg" data-start-test>Start test</button>
        </div>
        <p class="hand testpreview__note">the clock starts when you press start</p>
        <p class="small muted">
          ${user ? 'At the end you mark your answers against the mark scheme, and the result is saved to your Data Hub.' : 'At the end you mark your answers against the mark scheme. Create a free account to save your result in this browser.'}
          ${lockedCount ? html`${plural(lockedCount, 'question')} left out because ${lockedCount === 1 ? 'it needs' : 'they need'} topics you have not ticked.` : ''}
        </p>
      </div>
    </div>`;
  }

  // ───────────────────────────────── question browser / picker ─────────────────────────────────

  function browserFilters(base) {
    const count = (predicate) => base.filter(predicate).length;
    return html`<div class="card ruled stack tilt-3">
      <i class="tape tape--c" aria-hidden="true"></i>
      <div><h2 class="builder__title">Filter questions</h2><p class="hand builder__note" style="margin:0">numbers show how many match</p></div>
      ${topicsControl()}
      <label class="check">
        <input type="checkbox" data-flag="learnedOnly" ${state.learnedOnly ? 'checked' : ''} />
        <span>Only content I’ve covered</span>
      </label>
      <details class="filter-details" ${state.difficulties.length || state.bands.length || state.markStatus !== 'all' || state.year || state.series || state.tier || state.paper || state.sampleMode !== 'all' ? 'open' : ''}><summary>More filters</summary><div class="stack">
      <fieldset class="field">
        <legend class="field__label">Difficulty</legend>
        <div class="chips">
          ${DIFFICULTIES.filter((d) => !d.beyondSpec || subject.extra_hard || count((q) => q.difficulty === d.id) > 0).map(
            (d) =>
              html`<button type="button" class="chip" data-multi="difficulties" data-value="${d.id}" aria-pressed="${state.difficulties.includes(d.id)}" title="${d.description}">
                ${d.label}<span class="chip__count">${count((q) => q.difficulty === d.id)}</span>
              </button>`,
          )}
        </div>
      </fieldset>
      <fieldset class="field">
        <legend class="field__label">${exactTariffs ? 'Marks (essay length)' : 'Marks'}</legend>
        <div class="chips">
          ${bandOptions.map(
            (band) =>
              html`<button type="button" class="chip" data-multi="bands" data-value="${band.id}" aria-pressed="${state.bands.includes(band.id)}">
                ${band.label}<span class="chip__count">${count((q) => q.marks >= band.min && q.marks <= band.max)}</span>
              </button>`,
          )}
        </div>
      </fieldset>
      <label class="field"><span class="field__label">My progress</span><select class="select" data-filter="markStatus">${[['all', 'All questions'], ['unmarked', 'Unmarked'], ['marked', 'Marked'], ['lost', 'Lost marks'], ['full', 'Full marks']].map(([value, label]) => html`<option value="${value}" ${state.markStatus === value ? 'selected' : ''}>${label}</option>`)}</select></label>
      ${metadataControls()}
      ${sourceControl()}
      </div></details>
    </div>`;
  }

  function questionCard(question, { locked = null } = {}) {
    const attempt = latest.get(question.question_id);
    const selected = state.selected.includes(question.question_id);
    if (locked) {
      return html`<article class="qcard is-locked">
        <span class="qcard__select muted">${icon('lock', { size: 16, label: 'Locked' })}</span>
        <div style="min-width:0">
          <p class="qcard__ref">${questionRef(question, bundle.papersById)}</p>
          <p class="small">Needs: ${locked.slice(0, 4).map((id) => specIndex.label(id)).join(' · ')}${locked.length > 4 ? ` and ${locked.length - 4} more` : ''}</p>
        </div>
        <div class="qcard__side">${marksPill(question.marks)}</div>
      </article>`;
    }
    const open = state.openQuestion === question.question_id;
    const draft = state.drafts[question.question_id] || {};
    const value = draft.mark ?? (attempt ? String(attempt.marks_awarded) : '');
    const canUndo = Boolean(attempt?.inline || attempt?.mark_edits?.length);
    const paper = bundle.papersById.get(question.paper_id);
    return html`<article class="qcard ${selected ? 'is-selected' : ''}">
      <span class="qcard__select">
        <input type="checkbox" class="tree__check" data-select="${question.question_id}" ${selected ? 'checked' : ''} aria-label="Add ${questionRef(question, bundle.papersById)} to set" />
      </span>
      <div style="min-width:0">
        <p class="qcard__ref">${questionRef(question, bundle.papersById)} ${attempt ? html`<span class="tag">Saved ${attempt.marks_awarded}/${attempt.max_marks}</span>` : html`<span class="tag">Unmarked</span>`}</p>
        <p class="small muted">${subject.board} · ${subject.subject} · ${subject.level}${Number.isInteger(paper?.year) ? ` · ${paper.year}` : ''}${paper?.series && paper.series !== 'Demo' ? ` · ${paper.series}` : ''}</p>
        ${questionMeta(question, { specIndex })}
        ${open ? html`<div class="stack" style="margin-top:16px">
          ${questionBody(question)}
          <label class="field"><span class="field__label">Your notes or answer (optional)</span><textarea class="textarea" rows="3" data-answer="${question.question_id}" placeholder="You can also answer on paper">${draft.answer || ''}</textarea></label>
          <div class="row row--tight"><button type="button" class="btn btn--sm" data-scheme="${question.question_id}" aria-expanded="${state.showScheme}">${state.showScheme ? 'Hide mark scheme' : 'Show mark scheme'}</button>
            ${paper ? html`<a class="btn btn--sm" href="#/paper/${subjectId}/${question.paper_id}">View full paper</a>` : html`<span class="small muted">Full paper unavailable</span>`}</div>
          <p class="small muted">A verified examiner’s report has not been linked to this question.</p>
          ${state.showScheme ? html`<section class="card stack stack--sm"><h3>Mark scheme</h3>${markSchemeBody(question)}
            <label class="field"><span class="field__label">Marks awarded out of ${question.marks}</span>
              ${question.marks <= 10 ? html`<select class="select" data-mark="${question.question_id}"><option value="">Choose marks</option>${Array.from({length: question.marks + 1}, (_, n) => html`<option value="${n}" ${String(n) === value ? 'selected' : ''}>${n}</option>`)}</select>` : html`<input class="input" type="number" min="0" max="${question.marks}" step="1" inputmode="numeric" value="${value}" data-mark="${question.question_id}" />`}
            </label>
            <p class="small muted">Only save a mark when you choose to. Zero is a valid mark; leaving this blank records nothing.</p>
            <div class="row row--tight"><button type="button" class="btn btn--primary btn--sm" data-save-mark="${question.question_id}">${user ? 'Save mark' : 'Create free account to save mark'}</button>
              ${attempt ? html`<button type="button" class="btn btn--sm" data-reattempt="${question.question_id}">Save as new attempt</button>` : ''}
              ${canUndo ? html`<button type="button" class="btn btn--sm" data-undo="${question.question_id}">Undo last save</button>` : ''}</div>
            <p class="small form-error" role="alert" data-mark-error hidden></p>
          </section>` : ''}
        </div>` : ''}
      </div>
      <div class="qcard__side">${marksPill(question.marks)}<button type="button" class="btn btn--sm" data-open="${question.question_id}" aria-expanded="${open}">${open ? 'Close' : 'Open'}</button></div>
    </article>`;
  }

  function browserResults() {
    const bands = bandOptions.filter((band) => state.bands.includes(band.id));
    const { matches, locked } = filterQuestions(
      scopedPool(),
      criteria({ difficulties: state.difficulties, markBands: bands, markStatus: state.markStatus, search: state.search }),
      engineContext,
    );
    const sorted = matches;
    const pageCount = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
    state.page = Math.min(pageCount, state.page);
    const matchIds = new Set(matches.map((question) => question.question_id));
    save();
    const visible = sorted.slice((state.page - 1) * PAGE_SIZE, state.page * PAGE_SIZE);
    const chosen = state.selected.map((id) => bundle.questionsById.get(id)).filter(Boolean);
    const picker = state.mode === 'picker';
    const active = [
      ...(state.focus !== null ? [{key: 'focus', label: `${state.focus.length} spec points selected`}] : []),
      ...(state.rangeFrom || state.rangeTo ? [{key: 'range', label: 'Specification range'}] : []),
      ...(state.learnedOnly ? [{key: 'learnedOnly', label: 'Only covered content'}] : []),
      ...(state.markStatus !== 'all' ? [{key: 'markStatus', label: `Progress: ${state.markStatus}`}] : []),
      ...(state.sampleMode !== 'all' ? [{key: 'sampleMode', label: state.sampleMode === 'hide' ? 'Hide demo content' : 'Demo content only'}] : []),
      ...state.difficulties.map((value) => ({key: 'difficulties', value, label: value.replaceAll('_', ' ')})),
      ...state.bands.map((value) => ({key: 'bands', value, label: bandOptions.find((b) => b.id === value)?.label || value})),
      ...['year', 'series', 'tier', 'paper'].filter((key) => state[key]).map((key) => ({key, label: `${key}: ${state[key]}`})),
      ...(state.search ? [{key: 'search', label: `Search: ${state.search}`}] : []),
    ];
    return html`${active.length ? html`<div class="chips" aria-label="Active filters">${active.map((chip) => html`<button type="button" class="chip" data-clear-chip="${chip.key}" data-chip-value="${chip.value || ''}" aria-label="Remove filter ${chip.label}">${chip.label} ×</button>`)}</div>` : ''}<div class="row row--between">
        <p role="status" aria-live="polite"><strong>${plural(sorted.length, 'question')}</strong> <span class="muted">match</span></p>
        <div class="row row--tight">
          <label class="searchbox" style="flex:0 1 220px">
            ${icon('search', { size: 16 })}
            <input class="input input--sm" type="search" placeholder="Search text or spec code" value="${state.search}" data-search aria-label="Search text or spec code" />
          </label>
          <select class="select input--sm" data-sort aria-label="Sort questions" style="width:auto">
            ${Object.entries(SORTS).map(([id, label]) => html`<option value="${id}" ${state.sort === id ? 'selected' : ''}>${label}</option>`)}
          </select>
          ${state.sort === 'shuffle' ? html`<button class="btn btn--sm" type="button" data-reshuffle>Reshuffle</button>` : ''}
        </div>
      </div>
      ${chosen.length
        ? html`<div class="selectbar">
            <p>
              <strong>${plural(chosen.length, 'question')} chosen</strong>
              <span class="muted"> · ${sum(chosen, (q) => q.marks)} marks · about ${fmtMinutes(sum(chosen, minutesOf))} · ${chosen.filter((q) => !matchIds.has(q.question_id)).length} outside current filters</span>
            </p>
            <details><summary>Review selected questions</summary><ul>${chosen.map((q) => html`<li>${questionRef(q, bundle.papersById)} · ${q.marks} marks <button type="button" class="linkbtn small" data-remove-selected="${q.question_id}">Remove</button></li>`)}</ul></details>
            <div class="row row--tight">
              <label class="check small"><input type="checkbox" data-flag="stopwatch" ${state.stopwatch ? 'checked' : ''} /><span>Run a stopwatch</span></label>
              <button type="button" class="btn btn--sm btn--ghost" data-clear-selection>Clear</button>
              <button type="button" class="btn btn--sm btn--primary" data-start-set>${icon('play', { size: 15 })} Start ${chosen.length === 1 ? 'question' : 'these'}</button>
            </div>
          </div>`
        : sorted.length
          ? html`<p class="small muted">
              ${picker ? 'Tick the questions you want, then start. There is no time limit.' : 'Open a question to read and mark it, or add questions to a set. Selections stay as you change filters.'}
            </p>`
          : ''}
      ${sorted.length
        ? html`<div class="qlist">${visible.map((question) => questionCard(question))}</div>`
        : emptyState({
            iconName: 'filter',
            title: 'No questions match',
            text: !learnedLeaves.length && state.learnedOnly
              ? 'Tick the topics you have learned and questions will appear here.'
              : 'Change the filters to see more questions.',
            action: !learnedLeaves.length && state.learnedOnly ? html`<a class="btn btn--primary" href="#/subject/${subjectId}">Tick learned topics</a>` : null,
          })}
      ${sorted.length > PAGE_SIZE ? html`<nav class="row row--between filter-pagination" aria-label="Question results pages"><button type="button" class="btn btn--sm" data-page="${state.page - 1}" ${state.page <= 1 ? 'disabled' : ''}>Previous</button><span class="small muted" role="status">Page ${state.page} of ${pageCount} · ${(state.page - 1) * PAGE_SIZE + 1}–${Math.min(state.page * PAGE_SIZE, sorted.length)} of ${sorted.length}</span><button type="button" class="btn btn--sm" data-page="${state.page + 1}" ${state.page >= pageCount ? 'disabled' : ''}>Next</button></nav>` : ''}
      ${locked.length
        ? html`<details class="locked">
            <summary>${icon('lock', { size: 16 })} ${plural(locked.length, 'more question')} ${locked.length === 1 ? 'needs' : 'need'} topics you have not ticked as learned</summary>
            <div class="qlist" style="margin-top:12px">${locked.slice(0, 40).map((entry) => questionCard(entry.question, { locked: entry.missing }))}</div>
            <p class="small" style="margin-top:10px"><a href="#/subject/${subjectId}">Update your covered topics</a>, or turn off the covered-content filter to browse them.</p>
          </details>`
        : ''}`;
  }

  // ───────────────────────────────── drawing ─────────────────────────────────

  function draw() {
    if (timed()) {
      const { matches, locked } = filterQuestions(scopedPool(), criteria(), engineContext);
      setHtml(
        $('[data-body]', element),
        html`<div class="split split--wide-aside">
          <div data-controls>${builderControls(matches)}</div>
          <aside class="sticky" data-output>${testPreview(matches, locked.length)}</aside>
        </div>`,
      );
    } else {
      const base = filterQuestions(scopedPool(), criteria(), engineContext).matches;
      setHtml(
        $('[data-body]', element),
        html`<div class="browser">
          <aside data-controls>${browserFilters(base)}</aside>
          <div class="stack" data-output>${browserResults()}</div>
        </div>`,
      );
    }
    mountTree();
    // The selector resolves saved year/chapter mappings on mount; apply them to the
    // result list immediately, without remounting the controls.
    if (timed()) {
      const { matches, locked } = filterQuestions(scopedPool(), criteria(), engineContext);
      setHtml($('[data-output]', element), testPreview(matches, locked.length));
    } else {
      setHtml($('[data-output]', element), browserResults());
    }
  }

  /** Re-renders after a filter change. The topic tree keeps its own state, so only the rest redraws. */
  function update({ keepControls = false } = {}) {
    if (keepControls) {
      if (timed()) {
        const { matches, locked } = filterQuestions(scopedPool(), criteria(), engineContext);
        setHtml($('[data-output]', element), testPreview(matches, locked.length));
      } else {
        setHtml($('[data-output]', element), browserResults());
      }
      const summary = $('[data-focus-summary]', element);
      if (summary) summary.textContent = focusSummary();
      const focusReset = $('[data-focus-reset]', element);
      if (focusReset) focusReset.hidden = state.focus === null;
      return;
    }
    const scroll = window.scrollY;
    const focusedFilter = document.activeElement?.dataset?.filter;
    draw();
    if (focusedFilter) element.querySelector(`[data-filter="${CSS.escape(focusedFilter)}"]`)?.focus({ preventScroll: true });
    window.scrollTo(0, scroll);
  }

  tintPage(subject);
  setHtml(
    element,
    html`${head(subject.subject)}
      ${!user ? banner(html`Browsing and filters are free. Your guest progress lasts until you refresh or close this page. <a href="#/signup?next=%2Fpractice">Create a free account</a> to save it in this browser.`) : ''}
      ${suppressedParents ? banner(html`${plural(suppressedParents, 'full question')} ${suppressedParents === 1 ? 'is represented by its' : 'are represented by their'} available parts to avoid counting the same content twice.`) : ''}
      <div class="stack stack--lg" style="${scStyle(subject)}">
        ${subjectPills(enrolled, subjectId, (id) => `#/practice?subject=${id}`)}
        ${modes.length > 1
          ? html`<div class="seg mode-switch" role="tablist">
              ${[...modes].sort((a, b) => (a === 'timed_test') - (b === 'timed_test')).map(
                (mode) =>
                  html`<button type="button" role="tab" class="seg__opt" aria-selected="${state.mode === mode}" data-mode="${mode}" title="${PRACTICE_MODES[mode].blurb}">
                    ${mode === 'timed_test' ? 'Build a test' : 'Individual questions'}
                  </button>`,
              )}
            </div>`
          : html`<p class="muted"><strong>${PRACTICE_MODES[modes[0]].label}.</strong> ${PRACTICE_MODES[modes[0]].blurb}</p>`}
        <div class="row row--between"><p class="hand" style="font-size:20px">${user ? 'your filters stay saved for this subject in this browser' : 'your filters stay in this tab'}</p><button type="button" class="btn btn--sm btn--ghost" data-reset-filters>Reset filters</button></div>
        <div data-body></div>
      </div>`,
  );
  draw();

  // ───────────────────────────────── events ─────────────────────────────────

  const change = (mutate, options) => {
    mutate();
    if (!options?.keepPage) state.page = 1;
    save();
    update(options);
  };

  on(element, 'click', '[data-mode]', (event, button) => {
    state.mode = button.dataset.mode;
    for (const tab of element.querySelectorAll('[data-mode]')) tab.setAttribute('aria-selected', String(tab === button));
    save();
    draw();
  });
  on(element, 'change', '[data-filter]', (event, select) => change(() => (state[select.dataset.filter] = select.value)));
  on(element, 'click', '[data-range-reset]', () => change(() => { state.rangeFrom = ''; state.rangeTo = ''; }));
  on(element, 'click', '[data-reset-filters]', () => change(() => {
    const kept = { mode: state.mode, selected: state.selected };
    state = { ...defaults(), ...(user ? {} : { learnedOnly: false }), ...kept };
  }));
  on(element, 'click', '[data-clear-chip]', (event, button) => change(() => {
    const key = button.dataset.clearChip;
    if (key === 'focus') state.focus = null;
    else if (key === 'range') { state.rangeFrom = ''; state.rangeTo = ''; }
    else if (key === 'learnedOnly') state.learnedOnly = false;
    else if (key === 'markStatus' || key === 'sampleMode') state[key] = 'all';
    else if (key === 'difficulties' || key === 'bands') state[key] = state[key].filter((value) => value !== button.dataset.chipValue);
    else state[key] = '';
  }));
  on(element, 'click', '[data-page]', (event, button) => {
    state.page = Math.max(1, Number(button.dataset.page));
    save();
    update({ keepControls: true });
    $('[data-output]', element)?.scrollIntoView({ block: 'start' });
  });
  on(element, 'click', '[data-minutes]', (event, button) => change(() => (state.minutes = Number(button.dataset.minutes))));
  on(
    element,
    'input',
    '[data-minutes-input]',
    debounce((event, input) => {
      const minutes = Math.round(Number(input.value));
      if (minutes >= 5 && minutes <= 240) change(() => (state.minutes = minutes), { keepControls: true });
    }, 350),
  );
  on(element, 'click', '[data-difficulty]', (event, button) => change(() => (state.difficulty = button.dataset.difficulty)));
  on(element, 'click', '[data-source]', (event, button) => change(() => (state.source = button.dataset.source)));
  on(element, 'click', '[data-multi]', (event, button) => change(() => (state[button.dataset.multi] = toggle(state[button.dataset.multi], button.dataset.value))));
  on(element, 'change', '[data-flag]', (event, box) =>
    change(() => (state[box.dataset.flag] = box.checked), { keepControls: box.dataset.flag === 'stopwatch' || box.dataset.flag === 'preferUnseen' || box.dataset.flag === 'prioritiseWeak', keepPage: box.dataset.flag === 'stopwatch' }),
  );
  on(element, 'click', '[data-shuffle]', () => change(() => (state.seed = Math.floor(Math.random() * 1e9)), { keepControls: true }));
  on(element, 'click', '[data-toggle-tree]', () => change(() => (state.showTree = !state.showTree)));
  on(element, 'click', '[data-focus-reset]', () => change(() => (state.focus = null)));
  on(element, 'click', '[data-focus-clear]', () => change(() => { state.focus = []; state.showTree = true; }));
  on(element, 'click', '[data-text]', (event, button) =>
    change(() => {
      const next = toggle(state.focus || [], button.dataset.text);
      state.focus = next.length ? next : null;
    }),
  );
  on(element, 'change', '[data-sort]', (event, select) => change(() => (state.sort = select.value), { keepControls: true }));
  on(
    element,
    'input',
    '[data-search]',
    debounce((event, input) => {
      state.search = input.value;
      state.page = 1;
      save();
      update({ keepControls: true });
      const box = $('[data-search]', element); // the results redraw replaces the input: restore typing position
      box?.focus();
      box?.setSelectionRange(box.value.length, box.value.length);
    }, 300),
  );
  on(element, 'change', '[data-select]', (event, box) => change(() => {
    const question = bundle.questionsById.get(box.dataset.select);
    if (!box.checked) { state.selected = state.selected.filter((id) => id !== question.question_id); return; }
    // A full parent and one of its parts must not both contribute marks.
    const conflicts = state.selected.filter((id) => {
      const existing = bundle.questionsById.get(id);
      return existing && (existing.question_id === question.parent_question_id || existing.parent_question_id === question.question_id);
    });
    const retained = state.selected.filter((id) => !conflicts.includes(id) && id !== question.question_id);
    if (retained.length >= LIMITS.questionSetMax) {
      toast(`A set can contain up to ${LIMITS.questionSetMax} questions. Remove one before adding another.`, { type: 'error' });
      return;
    }
    state.selected = [...retained, question.question_id];
    if (conflicts.length) toast('Removed the overlapping full question or part from the set.', { type: 'success' });
  }, { keepControls: true, keepPage: true }));
  on(element, 'click', '[data-remove-selected]', (event, button) => change(() => (state.selected = state.selected.filter((id) => id !== button.dataset.removeSelected)), { keepControls: true, keepPage: true }));
  on(element, 'click', '[data-clear-selection]', () => change(() => (state.selected = []), { keepControls: true, keepPage: true }));
  on(element, 'click', '[data-open]', (event, button) => change(() => {
    state.openQuestion = state.openQuestion === button.dataset.open ? '' : button.dataset.open;
    state.showScheme = false;
  }, { keepControls: true, keepPage: true }));
  on(element, 'click', '[data-scheme]', () => change(() => (state.showScheme = !state.showScheme), { keepControls: true, keepPage: true }));
  on(element, 'click', '[data-reshuffle]', () => change(() => (state.seed = Math.floor(Math.random() * 1e9)), { keepControls: true }));
  on(element, 'input', '[data-answer]', (event, input) => {
    (state.drafts[input.dataset.answer] ||= {}).answer = input.value;
    save();
  });
  on(element, 'change', '[data-mark]', (event, input) => {
    (state.drafts[input.dataset.mark] ||= {}).mark = input.value;
    save();
  });
  const refreshLatest = () => {
    latest.clear();
    for (const [id, attempt] of latestByQuestion(api.getProgress().question_attempts)) latest.set(id, attempt);
  };
  const saveMark = async (id, reattempt = false) => {
    const question = bundle.questionsById.get(id);
    const value = element.querySelector(`[data-mark="${CSS.escape(id)}"]`)?.value ?? state.drafts[id]?.mark;
    (state.drafts[id] ||= {}).mark = value;
    const error = $('[data-mark-error]', element);
    if (value == null || value === '' || !Number.isInteger(Number(value)) || Number(value) < 0 || Number(value) > question.marks) {
      error.hidden = false;
      error.textContent = `Choose a whole number from 0 to ${question.marks}.`;
      return;
    }
    if (!user) {
      save();
      return context.navigate(`/signup?next=${encodeURIComponent(`/practice?subject=${subjectId}`)}`);
    }
    try {
      await api.saveQuestionMark(question, Number(value), { reattempt });
      refreshLatest();
      update({ keepControls: true, keepPage: true });
      toast(`Saved ${value}/${question.marks}.`, { type: 'success' });
    } catch (failure) {
      error.hidden = false;
      error.textContent = failure.message;
    }
  };
  on(element, 'click', '[data-save-mark]', (event, button) => saveMark(button.dataset.saveMark));
  on(element, 'click', '[data-reattempt]', (event, button) => saveMark(button.dataset.reattempt, true));
  on(element, 'click', '[data-undo]', async (event, button) => {
    const id = button.dataset.undo;
    await api.undoQuestionMark(id);
    delete state.drafts[id]?.mark;
    refreshLatest();
    save();
    update({ keepControls: true, keepPage: true });
    toast('Last mark save undone.', { type: 'success' });
  });

  on(element, 'click', '[data-start-set]', async () => {
    const questions = state.selected.map((id) => bundle.questionsById.get(id)).filter(Boolean);
    if (!questions.length) return;
    const stopwatch = state.stopwatch;
    state.selected = [];
    save();
    await startQuestionSet({ subject, questions, stopwatch }, context.navigate);
  });

  on(element, 'click', '[data-start-test]', async (event, button) => {
    const test = currentTest;
    if (!test?.questions.length) return;
    button.disabled = true;
    const minutes = state.minutes;
    const paper = {
      paper_id: uid('CUSTOM'),
      paper_type: 'user_custom_test',
      subject_id: subjectId,
      board: subject.board,
      level: subject.level,
      subject: subject.subject,
      title: `Custom ${fmtMinutes(minutes)} test · ${subject.subject}`,
      total_marks: test.total_marks,
      duration_minutes: minutes,
      question_ids: test.question_ids,
      full_paper_pdf_url: null,
      full_mark_scheme_pdf_url: null,
      created_at: new Date().toISOString(),
      settings: { difficulty: state.difficulty, source: state.source, focus: activeFocus(), filters: criteria(), seed: test.seed },
    };
    await api.saveCustomTest(paper);
    const session = createSession({
      kind: 'custom_test',
      subject_id: subjectId,
      title: paper.title,
      question_ids: paper.question_ids,
      paper_id: paper.paper_id,
      paper_type: 'user_custom_test',
      time_limit_minutes: minutes,
      timer: 'countdown',
      mark_mode: 'end',
      total_marks: paper.total_marks,
    });
    await api.saveSession(session, { silent: true });
    state.seed = Math.floor(Math.random() * 1e9); // a fresh test next time
    save();
    context.navigate(`/session/${session.session_id}`);
  });
}
