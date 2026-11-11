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
import { debounce, fmtMinutes, fmtRelative, percent, plural, sum, uid } from '../../core/utils.js';
import * as api from '../../data/api.js';
import { specIndex } from '../../data/content-repository.js';
import { createSession } from '../../data/sessions.js';
import { countByNode, filterQuestions, questionStatus } from '../../engine/filter-engine.js';
import { buildTest, minutesOf } from '../../engine/test-builder.js';
import { icon } from '../icons.js';
import { marksPill, questionMeta, questionRef, questionSnippet } from '../question-view.js';
import { mountSpecTree } from '../spec-tree.js';
import { loadStudent, practicePool, startQuestionSet, startSingle, subjectPills } from '../student.js';
import { banner, difficultyBadge, emptyState, liveBadge, pageHead, ragBadge, soonBadge } from '../ui.js';

const STATUS_OPTIONS = [
  { id: 'unseen', label: 'Not attempted' },
  { id: 'red', label: 'Needs work' },
  { id: 'amber', label: 'Developing' },
  { id: 'green', label: 'Secure' },
];

/** Question sources. The AI options unlock when Phase 2 is enabled in phases.js. */
const SOURCE_CHOICES = [
  { id: 'official', label: 'Official past papers', types: ['real_past_paper'] },
  { id: 'ai', label: 'AI questions', types: ['ai_past_paper', 'ai_spec_question'], feature: 'aiQuestionPool' },
  { id: 'both', label: 'Both', types: ['real_past_paper', 'ai_past_paper', 'ai_spec_question'], feature: 'aiQuestionPool' },
];

const SORTS = {
  paper: { label: 'Paper order', compare: () => 0 },
  marks: { label: 'Marks: low to high', compare: (a, b) => a.marks - b.marks },
  'marks-desc': { label: 'Marks: high to low', compare: (a, b) => b.marks - a.marks },
  difficulty: {
    label: 'Difficulty',
    compare: (a, b) => DIFFICULTIES.findIndex((d) => d.id === a.difficulty) - DIFFICULTIES.findIndex((d) => d.id === b.difficulty),
  },
};

const defaults = () => ({
  mode: null,
  source: 'official',
  focus: null, // null = every learned spec point; otherwise the chosen spec point ids
  difficulties: [],
  bands: [],
  statuses: [],
  learnedOnly: true,
  search: '',
  sort: 'paper',
  minutes: DEFAULT_TEST_MINUTES,
  difficulty: 'mixed',
  preferUnseen: true,
  prioritiseWeak: false,
  seed: Math.floor(Math.random() * 1e9),
  selected: [],
  stopwatch: false,
  showTree: false,
});

const toggle = (list, value) => (list.includes(value) ? list.filter((item) => item !== value) : [...list, value]);

export async function mount(element, context) {
  context.setTitle('Customisable practice');
  const student = await loadStudent();
  const { progress, bundles, latest } = student;
  const user = api.currentUser();
  const enrolled = progress.enrolled_subjects.map((id) => bundles.get(id)).filter((bundle) => bundle?.subject.practice_modes.length);
  const head = pageHead({
    title: 'Customisable practice',
    badge: liveBadge(),
    sub: 'Practice built around what you have learned. Choose topics, difficulty and length, and only matching questions are used.',
  });

  if (!enrolled.length) {
    setHtml(
      element,
      html`${head}${emptyState({
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
  if (progress.preferences.lastSubject !== subjectId) api.setPreference('lastSubject', subjectId);

  // ── state (kept for the browser tab, so filters survive opening a question and coming back) ──
  const storageKey = `${APP.storageNamespace}:practice:${user.user_id}:${subjectId}`;
  let state = defaults();
  try {
    state = { ...state, ...JSON.parse(sessionStorage.getItem(storageKey) || '{}') };
  } catch {
    /* start from defaults */
  }
  const save = () => {
    try {
      sessionStorage.setItem(storageKey, JSON.stringify(state));
    } catch {
      /* not essential */
    }
  };

  const modes = subject.practice_modes;
  if (modes.includes(context.query.mode)) state.mode = context.query.mode;
  if (!modes.includes(state.mode)) state.mode = modes[0];
  if (!SOURCE_CHOICES.some((choice) => choice.id === state.source && (!choice.feature || isEnabled(choice.feature)))) state.source = 'official';

  const learned = api.learnedSet();
  const subjectLeaves = specIndex.subjectLeaves(subjectId);
  const learnedLeaves = subjectLeaves.filter((id) => learned.has(id));
  if (context.query.topic) {
    // "Practise this topic" links arrive here with a topic or spec point id.
    const wantedLeaves = specIndex.leavesOf(context.query.topic).filter((id) => learned.has(id) && subjectLeaves.includes(id));
    if (wantedLeaves.length) state.focus = wantedLeaves;
  }
  state.selected = state.selected.filter((id) => bundle.questionsById.has(id));
  save();

  const pool = practicePool(bundle);
  const engineContext = { specIndex, learned, latestAttempts: latest };
  const timed = () => state.mode === 'timed_test';
  const sourceTypes = () => SOURCE_CHOICES.find((choice) => choice.id === state.source).types.filter((type) => enabledSourceTypes().includes(type));
  const scopedPool = () => pool.filter((question) => sourceTypes().includes(question.source_type));
  const treeEnabled = () => (timed() || state.learnedOnly ? new Set(learnedLeaves) : null);
  const setTexts = spec.sections.flatMap((section) => section.topics.filter((topic) => topic.kind === 'set_text').flatMap((topic) => topic.points));
  const exactTariffs = !modes.includes('individual'); // essay subjects filter by exact mark tariff
  const bandOptions = exactTariffs
    ? [...new Set(pool.map((question) => question.marks))].sort((a, b) => a - b).map((marks) => ({ id: `=${marks}`, label: `${marks} marks`, min: marks, max: marks }))
    : MARK_BANDS;

  /** The focus actually applied: chosen spec points, limited to what may be ticked right now. */
  function activeFocus() {
    if (state.focus === null) return null; // no narrowing: the learned-topics rule alone decides
    const allowed = treeEnabled();
    return allowed ? state.focus.filter((id) => allowed.has(id)) : state.focus;
  }

  const criteria = (extra = {}) => ({
    sourceTypes: sourceTypes(),
    focus: activeFocus(),
    learnedOnly: timed() ? true : state.learnedOnly,
    ...extra,
  });

  // ───────────────────────────────── shared controls ─────────────────────────────────

  function focusSummary() {
    const focus = activeFocus();
    if (!learnedLeaves.length && (timed() || state.learnedOnly)) return 'You have not ticked any topics as learned yet.';
    if (focus === null) return timed() || state.learnedOnly ? `All ${plural(learnedLeaves.length, 'spec point')} you have learned` : 'Every topic in the specification';
    if (!focus.length) return 'No topics chosen.';
    const topics = new Set(focus.map((id) => specIndex.topicOf(id)?.title || specIndex.label(id)));
    return `${plural(focus.length, 'spec point')} across ${plural(topics.size, 'topic')}: ${[...topics].slice(0, 3).join(', ')}${topics.size > 3 ? '…' : ''}`;
  }

  function topicsControl() {
    return html`<fieldset class="field">
      <legend class="field__label">Topics</legend>
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
        ${state.focus !== null ? html`<button type="button" class="linkbtn small" data-focus-reset>Use all topics</button>` : ''}
        <a class="small" href="#/subject/${subjectId}">Edit what I have learned</a>
      </div>
      <div class="focus-tree" data-tree ${state.showTree ? '' : 'hidden'}></div>
    </fieldset>`;
  }

  function sourceControl() {
    return html`<fieldset class="field">
      <legend class="field__label">Question source</legend>
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
    return html`<div class="card stack">
      <fieldset class="field">
        <legend class="field__label">Length</legend>
        <div class="chips">
          ${TEST_DURATIONS.map((minutes) => html`<button type="button" class="chip" data-minutes="${minutes}" aria-pressed="${state.minutes === minutes}">${minutes} min</button>`)}
          <label class="row row--tight row--nowrap small">
            <span class="muted">Custom</span>
            <input class="input input--sm input--num" type="number" min="5" max="240" step="5" value="${state.minutes}" data-minutes-input aria-label="Custom length in minutes" />
          </label>
        </div>
      </fieldset>
      <fieldset class="field">
        <legend class="field__label">Difficulty</legend>
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
      ${topicsControl()} ${sourceControl()}
      <fieldset class="field">
        <legend class="field__label">Question choice</legend>
        <label class="check"><input type="checkbox" data-flag="preferUnseen" ${state.preferUnseen ? 'checked' : ''} /><span>Prefer questions I have not done yet</span></label>
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
    return html`<div class="card stack testpreview">
      <div class="card__head" style="margin-bottom:0">
        <h2 class="card__title">Your test</h2>
        <button type="button" class="btn btn--sm" data-shuffle>${icon('shuffle', { size: 15 })} Shuffle</button>
      </div>
      <div class="grid grid--3">
        <div class="stat stat--flat"><span class="stat__label">Questions</span><span class="stat__value">${test.questions.length}</span></div>
        <div class="stat stat--flat"><span class="stat__label">Marks</span><span class="stat__value">${test.total_marks}</span></div>
        <div class="stat stat--flat"><span class="stat__label">Estimated time</span><span class="stat__value">${test.total_minutes}<span class="stat__of"> min</span></span></div>
      </div>
      ${test.short
        ? banner(
            html`Only <strong>${fmtMinutes(test.available_minutes)}</strong> of questions match these settings, so this test is shorter than ${state.minutes} minutes. Widen
              the topics or difficulty for a full-length test.`,
            { type: 'warn' },
          )
        : ''}
      <div>
        <p class="label" style="margin-bottom:6px">What is in it</p>
        <ol class="testlist">
          ${test.questions.map(
            (question, index) =>
              html`<li>
                <span class="testlist__num">${index + 1}</span>
                <span class="testlist__topic">${specIndex.topicOf(question.primary_spec_points[0])?.title || 'Topic'}</span>
                ${difficultyBadge(question.difficulty)}
                <span class="num small">${question.marks}</span>
              </li>`,
          )}
        </ol>
      </div>
      <button type="button" class="btn btn--primary btn--lg btn--block" data-start-test>${icon('play', { size: 16 })} Start ${fmtMinutes(state.minutes)} test</button>
      <p class="small muted">
        The clock starts when you begin. At the end you mark your answers against the mark scheme, and the result is saved to your Data Hub.
        ${lockedCount ? html`<br />${plural(lockedCount, 'question')} left out because ${lockedCount === 1 ? 'it needs' : 'they need'} topics you have not ticked.` : ''}
      </p>
    </div>`;
  }

  // ───────────────────────────────── question browser / picker ─────────────────────────────────

  function browserFilters(base) {
    const count = (predicate) => base.filter(predicate).length;
    return html`<div class="card stack">
      ${topicsControl()}
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
      <fieldset class="field">
        <legend class="field__label">My progress</legend>
        <div class="chips">
          ${STATUS_OPTIONS.map(
            (status) =>
              html`<button type="button" class="chip" data-multi="statuses" data-value="${status.id}" aria-pressed="${state.statuses.includes(status.id)}">
                ${status.label}<span class="chip__count">${count((q) => questionStatus(q, latest) === status.id)}</span>
              </button>`,
          )}
        </div>
      </fieldset>
      ${sourceControl()}
      <label class="check">
        <input type="checkbox" data-flag="learnedOnly" ${state.learnedOnly ? 'checked' : ''} />
        <span>Only show questions I can answer with what I have learned <span class="small muted">(recommended)</span></span>
      </label>
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
    return html`<article class="qcard ${selected ? 'is-selected' : ''}">
      <span class="qcard__select">
        <input type="checkbox" class="tree__check" data-select="${question.question_id}" ${selected ? 'checked' : ''} aria-label="Select question ${question.question_number}" />
      </span>
      <div style="min-width:0">
        <p class="qcard__ref">
          ${questionRef(question, bundle.papersById)}
          ${attempt
            ? html` · ${ragBadge(questionStatus(question, latest), percent(attempt.marks_awarded, attempt.max_marks), { label: false })}
                <span class="muted">last tried ${fmtRelative(attempt.timestamp).toLowerCase()}</span>`
            : ''}
        </p>
        <p class="qcard__text">${questionSnippet(question)}</p>
        ${questionMeta(question, { specIndex })}
      </div>
      <div class="qcard__side">
        ${marksPill(question.marks)}
        <button type="button" class="btn btn--sm" data-open="${question.question_id}">Open</button>
      </div>
    </article>`;
  }

  function browserResults() {
    const bands = bandOptions.filter((band) => state.bands.includes(band.id));
    const { matches, locked } = filterQuestions(
      scopedPool(),
      criteria({ difficulties: state.difficulties, markBands: bands, statuses: state.statuses, search: state.search }),
      engineContext,
    );
    const sorted = [...matches].sort(SORTS[state.sort]?.compare || SORTS.paper.compare);
    const chosen = state.selected.map((id) => bundle.questionsById.get(id)).filter(Boolean);
    const picker = state.mode === 'picker';
    return html`<div class="row row--between">
        <p><strong>${plural(sorted.length, 'question')}</strong> <span class="muted">match</span></p>
        <div class="row row--tight">
          <label class="searchbox" style="flex:0 1 220px">
            ${icon('search', { size: 16 })}
            <input class="input input--sm" type="search" placeholder="Search question text" value="${state.search}" data-search aria-label="Search question text" />
          </label>
          <select class="select input--sm" data-sort aria-label="Sort questions" style="width:auto">
            ${Object.entries(SORTS).map(([id, sort]) => html`<option value="${id}" ${state.sort === id ? 'selected' : ''}>${sort.label}</option>`)}
          </select>
        </div>
      </div>
      ${chosen.length
        ? html`<div class="selectbar">
            <p>
              <strong>${plural(chosen.length, 'question')} chosen</strong>
              <span class="muted"> · ${sum(chosen, (q) => q.marks)} marks · about ${fmtMinutes(sum(chosen, minutesOf))}</span>
            </p>
            <div class="row row--tight">
              <label class="check small"><input type="checkbox" data-flag="stopwatch" ${state.stopwatch ? 'checked' : ''} /><span>Run a stopwatch</span></label>
              <button type="button" class="btn btn--sm btn--ghost" data-clear-selection>Clear</button>
              <button type="button" class="btn btn--sm btn--primary" data-start-set>${icon('play', { size: 15 })} Start ${chosen.length === 1 ? 'question' : 'these'}</button>
            </div>
          </div>`
        : sorted.length
          ? html`<p class="small muted">
              ${picker ? 'Tick the questions you want, then start. There is no time limit.' : 'Open a question to answer it now, or tick several to work through as a set.'}
            </p>`
          : ''}
      ${sorted.length
        ? html`<div class="qlist">${sorted.map((question) => questionCard(question))}</div>`
        : emptyState({
            iconName: 'filter',
            title: 'No questions match',
            text: !learnedLeaves.length && state.learnedOnly
              ? 'Tick the topics you have learned and questions will appear here.'
              : 'Change the filters to see more questions.',
            action: !learnedLeaves.length && state.learnedOnly ? html`<a class="btn btn--primary" href="#/subject/${subjectId}">Tick learned topics</a>` : null,
          })}
      ${locked.length
        ? html`<details class="locked">
            <summary>${icon('lock', { size: 16 })} ${plural(locked.length, 'more question')} ${locked.length === 1 ? 'needs' : 'need'} topics you have not ticked as learned</summary>
            <div class="qlist" style="margin-top:12px">${locked.slice(0, 40).map((entry) => questionCard(entry.question, { locked: entry.missing }))}</div>
            <p class="small" style="margin-top:10px"><a href="#/subject/${subjectId}">Update what I have learned</a> to unlock them.</p>
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
      return;
    }
    const scroll = window.scrollY;
    draw();
    window.scrollTo(0, scroll);
  }

  setHtml(
    element,
    html`${head}
      <div class="stack stack--lg">
        ${subjectPills(enrolled, subjectId, (id) => `#/practice?subject=${id}`)}
        ${modes.length > 1
          ? html`<div class="tabs" role="tablist" style="margin-bottom:0">
              ${modes.map(
                (mode) =>
                  html`<button type="button" role="tab" class="tab" aria-selected="${state.mode === mode}" data-mode="${mode}" title="${PRACTICE_MODES[mode].blurb}">
                    ${PRACTICE_MODES[mode].label}
                  </button>`,
              )}
            </div>`
          : html`<p class="muted"><strong>${PRACTICE_MODES[modes[0]].label}.</strong> ${PRACTICE_MODES[modes[0]].blurb}</p>`}
        <div data-body></div>
      </div>`,
  );
  draw();

  // ───────────────────────────────── events ─────────────────────────────────

  const change = (mutate, options) => {
    mutate();
    save();
    update(options);
  };

  on(element, 'click', '[data-mode]', (event, button) => {
    state.mode = button.dataset.mode;
    for (const tab of element.querySelectorAll('[data-mode]')) tab.setAttribute('aria-selected', String(tab === button));
    save();
    draw();
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
    change(() => (state[box.dataset.flag] = box.checked), { keepControls: box.dataset.flag === 'stopwatch' || box.dataset.flag === 'preferUnseen' || box.dataset.flag === 'prioritiseWeak' }),
  );
  on(element, 'click', '[data-shuffle]', () => change(() => (state.seed = Math.floor(Math.random() * 1e9)), { keepControls: true }));
  on(element, 'click', '[data-toggle-tree]', () => change(() => (state.showTree = !state.showTree)));
  on(element, 'click', '[data-focus-reset]', () => change(() => (state.focus = null)));
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
      save();
      update({ keepControls: true });
      const box = $('[data-search]', element); // the results redraw replaces the input: restore typing position
      box?.focus();
      box?.setSelectionRange(box.value.length, box.value.length);
    }, 300),
  );
  on(element, 'change', '[data-select]', (event, box) => change(() => (state.selected = toggle(state.selected, box.dataset.select).slice(-LIMITS.questionSetMax)), { keepControls: true }));
  on(element, 'click', '[data-clear-selection]', () => change(() => (state.selected = []), { keepControls: true }));
  on(element, 'click', '[data-open]', (event, button) => startSingle(bundle.questionsById.get(button.dataset.open), context.navigate));

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
      settings: { difficulty: state.difficulty, source: state.source, focus: activeFocus(), seed: test.seed },
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
