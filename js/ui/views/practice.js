// Customisable Practice (PRD 4.1–4.3).
// The timed test builder and the individual-question browser share the subject's question bank.
// Everything here draws from the unified question pool through the filtering engine, so a
// student is never given a question that needs a topic they have not marked as learned.

import {
  APP, DEFAULT_TEST_MINUTES, DIFFICULTIES, LIMITS, MARK_BANDS, MIXED, PRACTICE_MODES, TEST_DURATIONS,
} from '../../config/app.config.js';
import { FEATURES, enabledSourceTypes, isEnabled } from '../../config/phases.js';
import { $, html, on, setHtml } from '../../core/dom.js';
import { debounce, fmtMinutes, fmtRelative, plural, sum, uid } from '../../core/utils.js';
import * as api from '../../data/api.js';
import { getCurriculum, specIndex } from '../../data/content-repository.js';
import { createSession } from '../../data/sessions.js';
import { countByNode, filterQuestions } from '../../engine/filter-engine.js';
import { latestByQuestion } from '../../engine/analytics.js';
import { resolvePracticeMode, testEntries, testPool } from '../../engine/practice-modes.js';
import { buildTest, minutesOf } from '../../engine/test-builder.js';
import { collapseLinked, collapseLocked, expandLinkedIds, groupEntry, linkGroups } from '../../engine/linked-parts.js';
import { icon } from '../icons.js';
import { linkedIntro, linkedNote, linkedPartBody, linkedPartLabel, linkedRef, linkedUses, markSchemeBody, marksPill, questionBody, questionMeta, questionRef, questionSnippet } from '../question-view.js';
import { mountSpecTree } from '../spec-tree.js';
import { mountCurriculumSelector } from '../curriculum-selector.js';
import { topicOrganisationControl } from '../topic-organisation.js';
import { loadStudent, practiceModes, practicePool, startQuestionSet, subjectPills } from '../student.js';
import { saveSubjectSettings, scStyle, tintPage } from '../subject-colours.js';
import { questionsForScience, scienceLeaves, sciencesOf, specForScience, validScience } from '../../engine/sciences.js';
import { isTiered, questionsForTier, savedTier, searchTierIntent, specForTier, tierLeaves, tierRequired, validTier } from '../../engine/tiers.js';
import { zoomButton } from '../zoom.js';
import { hasExaminerReport, loadReportIndex, reportPanel, reportQuestionLabel, revealPanel } from '../../data/examiner-reports.js';
import { placeQuestion } from '../question-fit.js';
import { bindMarkPickers, markPicker } from '../mark-picker.js';
import { banner, difficultyBadge, emptyState, openModal, pageHead, soonBadge, toast } from '../ui.js';
import { links, routeOf } from '../../core/links.js?v=exported-tests-1';
import { levelLabel } from '../../engine/paper-identity.js';
import { moduleScopeBanner } from '../module-scope.js';
import { createTestSnapshot, resolveTestSnapshot } from '../../engine/test-snapshot.js?v=20261122-pdf2';
import { createInkEditor, renderInkPreview, transferPencilStroke } from '../ink-editor.js?v=pencil-3';

/** Question sources. The AI options unlock when Phase 2 is enabled in phases.js. */
const SOURCE_CHOICES = [
  { id: 'official', label: 'Past-paper practice', types: ['real_past_paper'] },
  { id: 'ai', label: 'AI questions', types: ['ai_past_paper', 'ai_spec_question'], feature: 'aiQuestionPool' },
  { id: 'both', label: 'Both', types: ['real_past_paper', 'ai_past_paper', 'ai_spec_question'], feature: 'aiQuestionPool' },
];

const SORTS = {
  newest: 'Newest first',
  oldest: 'Oldest first',
  spec: 'Specification order',
  marks_asc: 'Marks: low to high',
  marks_desc: 'Marks: high to low',
  difficulty: 'Difficulty',
};

const PROGRESS_FILTERS = { unmarked: 'Not tried yet', answered: 'Answered, not marked', marked: 'Marked', lost: 'Lost marks', full: 'Full marks' };

const defaults = () => ({
  mode: null,
  source: 'official',
  focus: null, // null = unrestricted; [] = no selected points
  textbookFocus: null,
  testFocus: null,
  testTextbookFocus: null,
  testFocusVersion: 0,
  topicOrganisation: null,
  difficulties: [],
  qualifications: [],
  bands: [],
  markMin: '',
  markMax: '',
  statuses: [],
  // null = automatic: on when the student has ticked topics in this view.
  learnedOnly: null,
  coveredDefaultVersion: 1,
  search: '',
  sort: 'newest',
  shuffled: false,
  markStatuses: [],
  selectionMode: 'crossover',
  focusMode: 'any',
  focusScope: 'primary',
  rangeFrom: '',
  rangeTo: '',
  year: '',
  years: [],
  series: '',
  tier: '',
  science: '',
  paper: '',
  sampleMode: 'all',
  page: 1,
  minutes: DEFAULT_TEST_MINUTES,
  difficulty: 'mixed',
  preferUnseen: true,
  prioritiseWeak: false,
  seed: Math.floor(Math.random() * 1e9),
  selected: [],
  selectionVersion: 1,
  closedQuestions: [],
  schemeQuestions: [],
  reportQuestions: [],
  contextQuestions: [],
  referenceQuestions: [],
  drafts: {},
  stopwatch: false,
  showTree: true,
  curriculum: {},
});

const toggle = (list, value) => (list.includes(value) ? list.filter((item) => item !== value) : [...list, value]);

let pendingChoiceFocus;

export async function mount(element, context) {
  const choiceFocus = pendingChoiceFocus;
  pendingChoiceFocus = undefined;
  context.setTitle('Practice');
  const user = api.currentUser();
  if (!user && context.query.starter === '1') {
    const starter = await import('./starter-question.js');
    return starter.mount(element, context.query.subject);
  }
  const requested = context.query.subject;
  const subjectIds = api.getProgress().enrolled_subjects;
  const [student] = await Promise.all([
    loadStudent(requested ? [...subjectIds, requested] : subjectIds),
    loadReportIndex(),
  ]);
  const { progress, bundles, latest } = student;
  const availability = new Map([...bundles].map(([id, bundle]) => [id, practiceModes(bundle)]));
  const enrolled = progress.enrolled_subjects.filter(id => availability.get(id)?.modes.length).map(id => bundles.get(id));
  const explicit = bundles.get(requested);
  const bundle = availability.get(requested)?.modes.length
    ? explicit
    : !user && requested
      ? null
      : enrolled.find((candidate) => candidate.subject.subject_id === progress.preferences.lastSubject) || enrolled[0];
  const head = (crumb) => html`${pageHead({
      title: 'Find questions',
      sub: 'Browse questions or build a test',
      crumbs: [{ label: 'Home', href: links.home() }, { label: 'Practice', href: links.practice() }, ...(crumb ? [{ label: crumb }] : [])],
    })}`;

  if (!bundle) {
    if (!user && element.isConnected) {
      const browse = links.subjects({ browse: 1, mode: context.query.mode });
      return context.navigate(routeOf(browse), { replace: true });
    }
    setHtml(
      element,
      html`${head()}${emptyState({
        iconName: 'cap',
        title: 'Add a subject first',
        text: 'Practice is built from the subjects you study and the topics you have ticked as learned.',
        action: html`<a class="btn btn--primary" href="${links.subjects()}">Choose subjects</a>`,
      })}`,
    );
    return;
  }

  const { subject, spec, textbooks } = bundle;
  // Paper choices name their level when the subject holds AS and A-Level papers.
  const paperOptionLabel = (paper) => {
    const level = levelLabel(paper, subject, bundle.papers);
    return level && !paper.title.split(/[\s·:]+/).includes(level) ? `${level} · ${paper.title}` : paper.title;
  };
  const subjectId = subject.subject_id;
  const { modes } = availability.get(subjectId);
  const mode = resolvePracticeMode(availability.get(subjectId), context.query.mode);
  const switchSubject = (id) => links.practice({ subject: id, mode: resolvePracticeMode(availability.get(id), mode) });
  const hasExports = () => api.exportedTests().some(test => test.subject_id === subjectId);
  const exportedTestsLink = () => html`<a class="btn btn--sm" href="${links.exportedTests({ subject: subjectId })}"
    data-exported-tests ${hasExports() ? '' : 'hidden'}>Exported tests</a>`;
  const isEnrolled = progress.enrolled_subjects.includes(subjectId);
  const subjects = isEnrolled ? enrolled : [...enrolled, bundle];
  // Subjects whose scored units carry a reviewed introduced_year use it for the
  // Year 12 / Year 13-only filters, and treat Year 13 as cumulative.
  const unitContentYears = subject.content_year_source === 'introduced_year';
  const qualificationOptions = (subject.qualifications || []).filter(({ code }) => !bundle.scope || bundle.scope.levels.includes(code));
  const qualificationLabel = (code) => {
    const option = qualificationOptions.find((item) => item.code === code);
    return option ? `${option.label} papers` : `${code} papers`;
  };
  const curriculum = await getCurriculum(subjectId);
  let curriculumPoints = null;
  if (isEnrolled && progress.preferences.lastSubject !== subjectId) api.setPreference('lastSubject', subjectId);

  // ── tiers (owner request 2026-11-19) ──
  // A tiered GCSE starts on the student's saved tier. A science with no saved tier asks for one
  // before showing questions. The visible Tier control can switch to the other tier or both
  // tiers for this browser tab only; it never changes the saved tier.
  const tiered = isTiered(subject);
  const savedSubjectTier = savedTier(subject, progress);
  const linkedTier = !user || !isEnrolled ? validTier(subject, context.query.tier) : null;
  const linkedBothTiers = !user && context.query.tier === 'both';
  const tierPref = linkedBothTiers ? '' : linkedTier || savedSubjectTier || '';
  if (tiered && tierRequired(subject) && !tierPref && !linkedBothTiers) {
    tintPage(subject);
    setHtml(
      element,
      html`${head(subject.subject)}
        <div class="stack stack--lg" style="${scStyle(subject)}">
          ${subjectPills(subjects, subjectId, switchSubject)}
          ${hasExports() ? html`<div class="row">${exportedTestsLink()}</div>` : ''}
          <section class="card ruled tier-prompt" data-tier-prompt>
            <h2 class="card__title">Choose Foundation or Higher for ${subject.subject}</h2>
            <p class="muted">Questions and tests are built from one tier’s papers. ${isEnrolled ? 'Choose yours to start. You can change it later in the subject’s settings.' : 'Choose a tier to browse this subject.'}</p>
            <div class="row row--tight">${subject.tiers.map((tier) => html`<button type="button" class="btn" data-save-tier="${tier}">${tier}</button>`)}</div>
          </section>
        </div>`,
    );
    on(element, 'click', '[data-save-tier]', async (event, button) => {
      const tier = validTier(subject, button.dataset.saveTier);
      if (!user || !isEnrolled) return context.navigate(routeOf(links.practice({ ...context.query, subject: subjectId, tier })), { replace: true });
      await saveSubjectSettings(subjectId, { tier });
      context.refresh();
    });
    return;
  }
  const tierOverrideKey = `${APP.storageNamespace}:practice-tier:${subjectId}`;
  const readTierOverride = () => {
    try {
      const saved = JSON.parse(sessionStorage.getItem(tierOverrideKey) || 'null');
      return saved && saved.pref === tierPref && (saved.tier === '' || validTier(subject, saved.tier)) ? saved.tier : null;
    } catch {
      return null;
    }
  };
  const writeTierOverride = (tier) => {
    try {
      if (tier === null) sessionStorage.removeItem(tierOverrideKey);
      else sessionStorage.setItem(tierOverrideKey, JSON.stringify({ pref: tierPref, tier }));
    } catch {
      /* not essential */
    }
  };

  // ── state (kept for the browser tab, so filters survive opening a question and coming back) ──
  const storageKey = `${APP.storageNamespace}:practice:${user?.user_id || 'guest'}:${subjectId}`;
  let state = { ...defaults(), mode };
  const storage = user ? localStorage : sessionStorage;
  try {
    const saved = JSON.parse(storage.getItem(storageKey) || '{}');
    // Covered topics became the default in Nov 2026. Filters saved before then
    // had it off by default, so those return to the automatic setting once.
    if (saved.coveredDefaultVersion !== 1) { delete saved.learnedOnly; delete saved.testFocusVersion; }
    state = { ...state, ...saved, mode, coveredDefaultVersion: 1, selectionVersion: saved.selectionVersion || 0 };
  } catch {
    /* start from defaults */
  }
  let moduleScopeChanged = false;
  if (bundle.scope) {
    const moduleScopeKey = JSON.stringify([...bundle.scope.modules].map(([level, modules]) => [level, [...modules].sort()]));
    moduleScopeChanged = state.moduleScopeKey !== moduleScopeKey;
    state.moduleScopeKey = moduleScopeKey;
    state.qualifications = state.qualifications.filter((code) => qualificationOptions.some((option) => option.code === code));
    if (state.paper && !bundle.papers.some((paper) => paper.paper_id === state.paper)) state.paper = '';
    if (moduleScopeChanged) {
      state.testFocusVersion = 0;
      state.page = 1;
    }
  }
  // Preserve a previously saved single-year selection.
  if (!Array.isArray(state.years)) state.years = [];
  if (state.year && !state.years.length) state.years = [String(state.year)];
  state.year = '';
  // A tiered GCSE starts on the tier chosen when the subject was added (subject settings):
  // every visit starts there unless this tab switched tier on purpose. Changing the saved tier
  // drops that switch, so the new tier is the default for every later visit and test.
  if (tiered) {
    const override = !user && (linkedTier || linkedBothTiers) ? null : readTierOverride();
    state.tier = override ?? tierPref;
    state.tierPref = tierPref;
  } else if ((state.tierPref ?? '') !== tierPref) { state.tier = tierPref; state.tierPref = tierPref; }
  // The tier whose spec points are shown (null = every point).
  const viewTier = tiered ? validTier(subject, state.tier) : null;
  // Combined Science: '' = all three sciences, or one science's section, questions and papers.
  const sciences = sciencesOf(subject);
  state.science = validScience(subject, state.science) || '';
  const viewScience = state.science || null;
  const tierSpec = specForScience(specForTier(spec, viewTier), viewScience);
  const save = () => {
    try {
      storage.setItem(storageKey, JSON.stringify(state));
    } catch {
      /* not essential */
    }
  };

  state.sort = ({ paper: 'paper_order', marks: 'marks_asc', 'marks-desc': 'marks_desc' })[state.sort] || state.sort;
  if (state.sort === 'shuffle') { state.shuffled = true; state.sort = 'newest'; }
  if (!SORTS[state.sort]) state.sort = 'newest';
  if (!['strict', 'crossover'].includes(state.selectionMode)) state.selectionMode = 'strict';
  // Bring forward the old single progress filter without changing saved attempts.
  if (!Array.isArray(state.markStatuses)) state.markStatuses = [];
  if (state.markStatus && PROGRESS_FILTERS[state.markStatus] && !state.markStatuses.length) state.markStatuses = [state.markStatus];
  state.markStatuses = [...new Set(state.markStatuses)].filter((id) => PROGRESS_FILTERS[id]);
  delete state.markStatus;
  if (!state.drafts || typeof state.drafts !== 'object') state.drafts = {};
  if (!state.inkOpen || typeof state.inkOpen !== 'object') state.inkOpen = {};
  const inkIdentityKey = `${APP.storageNamespace}:ink-attempts:${user?.user_id || 'guest'}`;
  if (!state.inkAttempts || typeof state.inkAttempts !== 'object') {
    try {
      const persistedInkIds = JSON.parse(localStorage.getItem(inkIdentityKey) || '{}');
      state.inkAttempts = persistedInkIds.attempts || persistedInkIds;
      state.inkGroups ||= persistedInkIds.groups || {};
    } catch { state.inkAttempts = {}; }
  }
  if (!state.inkGroups || typeof state.inkGroups !== 'object') state.inkGroups = {};
  if (!state.inkSaved || typeof state.inkSaved !== 'object') state.inkSaved = {};
  // Which go is open on each question is chosen fresh on each visit (the "done this before?" popup).
  state.goes = {};
  if (user) for (const id of Object.keys(state.drafts)) if (api.attemptsFor(id).length) delete state.drafts[id];
  if (!Array.isArray(state.schemeQuestions)) state.schemeQuestions = state.showScheme && state.openQuestion ? [state.openQuestion] : [];
  if (!Array.isArray(state.closedQuestions)) state.closedQuestions = [];
  if (!Array.isArray(state.reportQuestions)) state.reportQuestions = [];
  delete state.openQuestions;
  delete state.openQuestion;
  if (!Array.isArray(state.contextQuestions)) state.contextQuestions = [];
  if (!Array.isArray(state.referenceQuestions)) state.referenceQuestions = [];
  if (state.textbookFocus !== null && !Array.isArray(state.textbookFocus)) state.textbookFocus = null;
  if (textbooks) { state.curriculum.bookId = ''; state.curriculum.chapterId = ''; }
  if (!['any', 'all'].includes(state.focusMode)) state.focusMode = 'any';
  if (!['primary', 'primary_and_crossover'].includes(state.focusScope)) state.focusScope = 'primary';
  state.sampleMode = 'all';
  state.page = Math.max(1, Math.floor(Number(state.page) || 1));
  if (!SOURCE_CHOICES.some((choice) => choice.id === state.source && (!choice.feature || isEnabled(choice.feature)))) state.source = 'official';

  const learned = api.learnedSet();
  // Module routes (Further Maths) scope the leaves first; tiered GCSEs use the viewed tier.
  const subjectLeaves = scienceLeaves(bundle.scopeLeaves || tierLeaves(specIndex, subjectId, viewTier), spec, viewScience, specIndex);
  if ((viewTier || viewScience || moduleScopeChanged) && Array.isArray(state.focus) && state.focus.length) {
    // Keep topic filters in the currently visible syllabus.
    const visible = new Set(subjectLeaves);
    state.focus = state.focus.filter((id) => specIndex.leavesOf(id).some((leaf) => visible.has(leaf)));
    if (!state.focus.length) state.focus = null;
  }
  if (!textbooks) state.topicOrganisation = 'official';
  else {
    const savedLearningView = progress.preferences[`coveredView:${subjectId}`];
    const hasTextbookLearning = textbooks.ids.some((id) => learned.has(id));
    const hasOfficialLearning = subjectLeaves.some((id) => learned.has(id));
    if (!['textbook', 'official'].includes(state.topicOrganisation)) {
      const useOfficial = savedLearningView === 'official' ||
        (!savedLearningView && (state.focus !== null || (!hasTextbookLearning && hasOfficialLearning)));
      state.topicOrganisation = useOfficial ? 'official' : 'textbook';
    } else if (state.testFocusVersion !== 1 && (
      savedLearningView === 'official' ||
      (!savedLearningView && state.topicOrganisation === 'textbook' && !hasTextbookLearning && hasOfficialLearning)
    )) {
      // Correct the old practice default once so official-only learners see
      // their checks when the test checklist is first seeded.
      state.topicOrganisation = 'official';
    }
  }
  // Whether "Only topics I've covered" is on for one topic view. Automatic means
  // on as soon as the student has ticked something in that view. Guests can tick topics too
  // (kept for the visit), so the switch works for them as well as for signed-in students.
  const hasLearning = (textbookView) => (textbookView ? textbooks.ids : subjectLeaves).some((id) => learned.has(id));
  const coveredFor = (textbookView) => (state.learnedOnly === null ? hasLearning(textbookView) : state.learnedOnly);
  // The test's topic list is a draft: covered topics when the switch is on, every topic when off.
  function seedTestFocus() {
    state.testFocus = coveredFor(false) ? subjectLeaves.filter((id) => learned.has(id)) : [...subjectLeaves];
    state.testTextbookFocus = textbooks ? coveredFor(true) ? textbooks.ids.filter((id) => learned.has(id)) : [...textbooks.ids] : null;
    state.testFocusVersion = 1;
  }
  const validTestFocus = state.testFocusVersion === 1 && Array.isArray(state.testFocus) && (!textbooks || Array.isArray(state.testTextbookFocus));
  if (!validTestFocus) {
    // The test's topic scope is a private draft, seeded once from the matching
    // learned namespace. It never writes to either saved learned-topic list.
    seedTestFocus();
    state.showTree = true;
  }
  if (context.query.topic) {
    // "Practise this topic" links arrive here with a topic or spec point id.
    const wantedLeaves = specIndex.leavesOf(context.query.topic).filter((id) => subjectLeaves.includes(id));
    if (wantedLeaves.length) { state.focus = wantedLeaves; state.learnedOnly = false; state.topicOrganisation = 'official'; }
  }
  // Retire the second browser topic selector without leaving invisible saved
  // range constraints. Its inclusive points become the single topic selection.
  function migrateBrowserRange() {
    if (!state.rangeFrom && !state.rangeTo) return;
    const range = specIndex.range(subjectId, state.rangeFrom, state.rangeTo);
    state.focus = state.focus === null ? [...range] : [...specIndex.expand(state.focus)].filter(id => range.has(id));
    state.rangeFrom = '';
    state.rangeTo = '';
    state.topicOrganisation = 'official';
  }
  migrateBrowserRange();
  // A linked group is selected by its group id (engine/linked-parts.js).
  const entryOf = (id) => bundle.questionsById.get(id) || (id.startsWith('LINKED_') ? groupEntry(id, bundle.questionsById) : null);
  const visibleQuestionIds = bundle.scope ? new Set(bundle.questions.map((question) => question.question_id)) : null;
  const selected = Array.isArray(state.selected) ? state.selected.filter((id) => typeof id === 'string') : [];
  // Older selections stored groups that also included independent siblings. Keep all
  // of those selected questions under the current groups and individual question ids.
  const oldGroups = state.selectionVersion < 1 && selected.some((id) => id.startsWith('LINKED_'))
    ? linkGroups(bundle.questionsById, bundle.papersById, { includeSiblingParts: true })
    : new Map();
  state.selected = [...new Set(selected.flatMap((id) => oldGroups.get(id) || [id])
    .map((id) => bundle.questionsById.get(id)?.linked_group?.id || id)
    .filter((id) => {
      const entry = entryOf(id);
      return entry && (!visibleQuestionIds || (entry.part_ids || [id]).every((partId) => visibleQuestionIds.has(partId)));
    }))];
  state.selectionVersion = 1;
  save();

  const availableQuestions = practicePool(bundle);
  const questionBank = mode === 'timed_test' ? testPool(availableQuestions, bundle.papersById) : availableQuestions;
  const pool = questionsForScience(questionBank, viewScience, spec, specIndex);
  const emptyBank = () => emptyState({
    iconName: 'file',
    title: 'No practice questions available yet',
    text: bundle.papers.length ? 'You can still browse the full past papers for this subject.' : 'There are no past papers listed for this subject yet.',
    action: bundle.papers.length ? html`<a class="btn btn--primary" href="${links.papers(subjectId, 'real_past_paper', viewTier)}">Browse past papers</a>` : '',
  });
  const representedParents = new Set(pool.map((question) => question.parent_question_id).filter(Boolean));
  const suppressedParents = bundle.questions.filter((question) => !question.part_label && representedParents.has(question.question_id) && question.include_in_custom_pool !== false && enabledSourceTypes().includes(question.source_type)).length;
  // Answers saved to mark later (kept in the account, so they follow the student between devices).
  const waiting = user ? api.savedAnswers() : new Map();
  // ── goes (attempts) at a question ──
  // Every go is kept, with its answer. state.goes[cardId] is undefined until the student
  // chooses, 'new' for a new go, or the key of the earlier go being changed. A linked
  // question's go spans all of its parts (grouped by group_attempt_id, or by the minute
  // they were saved for older records).
  const partsOf = (cardId) => {
    const single = bundle.questionsById.get(cardId);
    return single ? [single] : groupEntry(cardId, bundle.questionsById)?.parts || [];
  };
  const whenOf = (attempt) => attempt.answered_at || attempt.timestamp;
  function goOptions(cardId) {
    if (!user) return [];
    const parts = partsOf(cardId);
    const linked = !bundle.questionsById.has(cardId);
    const options = new Map();
    for (const part of parts) {
      for (const attempt of api.attemptsFor(part.question_id)) {
        const key = linked ? attempt.group_attempt_id || `at:${String(whenOf(attempt)).slice(0, 16)}` : attempt.attempt_id;
        if (!options.has(key)) options.set(key, { key, when: whenOf(attempt), parts: new Map() });
        const option = options.get(key);
        if (!option.parts.has(part.question_id)) option.parts.set(part.question_id, attempt);
        if (whenOf(attempt) > option.when) option.when = whenOf(attempt);
      }
    }
    const targetId = linked ? groupEntry(cardId, bundle.questionsById)?.linked_group?.target_id : null;
    return [...options.values()].filter((option) => !targetId || option.parts.has(targetId)).map((option) => {
      const marked = [...option.parts.values()].filter((attempt) => !attempt.waiting);
      return {
        ...option,
        waiting: [...option.parts.values()].some((attempt) => attempt.waiting),
        markedCount: marked.length,
        complete: marked.length === parts.length,
        awarded: sum(marked, (attempt) => attempt.marks_awarded),
        max: sum(parts, (part) => part.marks),
      };
    }).sort((a, b) => (a.when < b.when ? 1 : -1));
  }
  const currentGo = (cardId) => {
    const key = state.goes[cardId];
    return key && key !== 'new' ? goOptions(cardId).find((option) => option.key === key) || null : null;
  };
  const needsChoice = (cardId) => Boolean(user) && goOptions(cardId).length > 0 &&
    (state.goes[cardId] === undefined || (state.goes[cardId] !== 'new' && !currentGo(cardId)));
  const partAttempt = (cardId, partId) => currentGo(cardId)?.parts.get(partId) || null;
  // Two graph variants can both be visible. Keep their draft answers and marks separate.
  const partStateKey = (cardId, partId) => cardId?.startsWith('LINKED_BRANCH_') ? `${cardId}:${partId}` : partId;
  const answerOf = (cardId, partId = cardId) => state.drafts[partStateKey(cardId, partId)]?.answer ?? (partAttempt(cardId, partId)?.answer || '');
  const inkEditors = new Map();
  const pendingInkTargets = new WeakSet();
  const pencilTransfers = new Map();
  const inkValues = new Map();
  const inkSaveChains = new Map();
  const inkRevisions = new Map();
  const inkSyncTimers = new Map();
  const inkConflictPreviews = new Map();
  const inkKey = (responseId, partId) => `${responseId}\u0000${partId}`;
  function ensureInkAttemptId(cardId, partId) {
    const existing = partAttempt(cardId, partId)?.attempt_id;
    if (existing) return existing;
    const byCard = (state.inkAttempts[cardId] ||= {});
    if (!byCard[partId]) {
      byCard[partId] = uid('att');
      save();
      try { localStorage.setItem(inkIdentityKey, JSON.stringify({ attempts: state.inkAttempts, groups: state.inkGroups })); } catch { /* local draft still saves */ }
    }
    return byCard[partId];
  }
  function groupAttemptIdFor(cardId) {
    const current = currentGo(cardId);
    if (current) return current.key.startsWith('at:') ? null : current.key;
    if (bundle.questionsById.has(cardId)) return null;
    const groupAttempts = state.inkGroups;
    if (!groupAttempts[cardId]) {
      groupAttempts[cardId] = uid('go');
      save();
      try { localStorage.setItem(inkIdentityKey, JSON.stringify({ attempts: state.inkAttempts, groups: state.inkGroups })); } catch { /* local draft still saves */ }
    }
    return groupAttempts[cardId];
  }
  const activeInkResponseId = (cardId, partId) => ensureInkAttemptId(cardId, partId);
  function disposeInkEditors() {
    for (const transfer of pencilTransfers.values()) transfer.cancel();
    pencilTransfers.clear();
    for (const editor of inkEditors.values()) editor.destroy();
    inkEditors.clear();
    for (const previews of inkConflictPreviews.values()) previews.forEach((preview) => preview.destroy());
    inkConflictPreviews.clear();
  }
  async function mountInkEditors(targets = element.querySelectorAll('[data-ink-target]')) {
    for (const target of targets) {
      const partId = target.dataset.inkTarget;
      const button = target.parentElement.querySelector('[data-ink-toggle]');
      const cardId = button?.dataset.inkCard;
      const key = partStateKey(cardId, partId);
      if (!cardId || !state.inkOpen[key] || inkEditors.has(key) || pendingInkTargets.has(target)) continue;
      pendingInkTargets.add(target);
      const responseId = activeInkResponseId(cardId, partId);
      const valueKey = inkKey(responseId, partId);
      target.hidden = false;
      button?.setAttribute('aria-expanded', 'true');
      button.textContent = 'Use keyboard';
      let value = null;
      let conflicts = [];
      try {
        await inkSaveChains.get(valueKey)?.catch(() => {});
        const result = await api.loadInkState(responseId, partId, { waitForCloudMs: 1200 });
        value = result.record;
        conflicts = result.conflicts || [];
      } catch { /* the local editor remains available while storage recovers */ }
      pendingInkTargets.delete(target);
      if (!target.isConnected || target.hidden) continue;
      target.style.minBlockSize = '';
      value ||= inkValues.get(valueKey) || null;
      if (value) {
        inkValues.set(valueKey, value);
        inkRevisions.set(valueKey, value.revision);
        state.inkSaved[valueKey] = value.status === 'saved' && value.sections.some((section) => section.strokes.length > 0);
      }
      const editor = createInkEditor(target, {
        value,
        controlsBelow: true,
        onChange: (changed) => {
          const hadSavedInk = Boolean(state.inkSaved[valueKey]);
          const hasStrokes = changed.sections.some((section) => section.strokes.length > 0);
          const previousValue = inkValues.get(valueKey);
          const previouslyHadStrokes = previousValue?.sections?.some((section) => section.strokes.length > 0) || false;
          if (!hasStrokes && !previouslyHadStrokes) return;
          if (!hasStrokes) delete state.inkSaved[valueKey];
          const record = {
            ...(inkValues.get(valueKey) || {}),
            schemaVersion: 1,
            ownerId: api.inkRepository().ownerId,
            responseId,
            partId,
            revision: inkRevisions.get(valueKey) || inkValues.get(valueKey)?.revision || 1,
            status: !hasStrokes || state.inkSaved[valueKey] ? 'saved' : 'draft',
            sections: changed.sections,
            updatedAt: new Date().toISOString(),
          };
          inkValues.set(valueKey, record);
          state.inkOpen[key] = true;
          save();
          editor?.setSaveState('Saving on this device…');
          const repository = api.inkRepository();
          const previousSave = inkSaveChains.get(valueKey) || Promise.resolve();
          const pendingSave = previousSave.catch(() => {}).then(async () => {
            const latestRevision = inkRevisions.get(valueKey) || record.revision;
            const persisted = await repository.save({ ...record, revision: latestRevision });
            if (!persisted.conflict) {
              inkRevisions.set(valueKey, persisted.revision);
              if (inkValues.get(valueKey)?.updatedAt === record.updatedAt) inkValues.set(valueKey, persisted);
            }
            return persisted;
          });
          inkSaveChains.set(valueKey, pendingSave);
          void pendingSave.then((persisted) => {
            if (persisted.conflict) {
              inkValues.delete(valueKey);
              inkRevisions.delete(valueKey);
              editor.setSaveState('Another version is saved. Switch to keyboard and reopen writing to review both.');
              return;
            }
            editor?.setSaveState('Saved on this device');
            if (!hasStrokes) {
              const saveButton = target.querySelector('[data-ink-save]');
              if (saveButton) saveButton.textContent = 'Save handwritten answer';
              if (hadSavedInk) {
                void api.saveAnswerUnmarked(bundle.questionsById.get(partId), answerOf(cardId, partId), {
                  attemptId: responseId,
                  groupAttemptId: groupAttemptIdFor(cardId),
                  hasInk: false,
                }).catch(() => {});
              }
              void api.syncInk().then((synced) => {
                editor?.setSaveState(synced ? 'Cleared and synced' : 'Cleared on this device');
              }).catch(() => editor?.setSaveState('Cleared on this device · Sync will retry'));
              return;
            }
            clearTimeout(inkSyncTimers.get(key));
            inkSyncTimers.set(key, setTimeout(async () => {
              try {
                const synced = await api.syncInk();
                editor?.setSaveState(synced ? 'Synced' : 'Saved on this device');
                if (!synced && api.isSignedIn()) {
                  const latest = await api.loadInkState(responseId, partId);
                  if (latest.conflicts?.length) editor.setSaveState('Another version is saved. Switch to keyboard and reopen writing to review both.');
                }
              } catch { editor?.setSaveState('Saved on this device · Sync will retry'); }
            }, 1200));
          }).catch(() => editor?.setSaveState('Could not save · Try again'));
        },
      });
      inkEditors.set(key, editor);
      editor.setSaveState(value ? 'Saved on this device' : 'Ready to write');
      const saveButton = document.createElement('button');
      saveButton.type = 'button';
      saveButton.className = 'btn btn--sm btn--primary ink-answer__save';
      saveButton.dataset.inkSave = partId;
      saveButton.textContent = state.inkSaved[valueKey] ? 'Saved answer' : 'Save handwritten answer';
      target.append(saveButton);
      pencilTransfers.get(target)?.attach(editor);
      if (!value && !conflicts.length) void api.listInkForPart(partId).then((drafts) => {
        if (!target.isConnected || inkEditors.get(key) !== editor) return;
        const otherDrafts = drafts.filter((record) => record.responseId !== responseId);
        if (!otherDrafts.length) return;
        const section = document.createElement('details');
        section.className = 'ink-answer__drafts';
        const summary = document.createElement('summary');
        summary.textContent = `Resume another saved draft (${otherDrafts.length})`;
        section.append(summary);
        for (const draft of otherDrafts) {
          const row = document.createElement('div');
          row.className = 'ink-answer__draft';
          const label = document.createElement('span');
          label.textContent = draft.updatedAt ? `Saved ${new Date(draft.updatedAt).toLocaleString('en-GB')}` : 'Saved draft';
          const resume = document.createElement('button');
          resume.type = 'button';
          resume.className = 'btn btn--sm';
          resume.textContent = 'Resume synced draft';
          row.append(label, resume);
          section.append(row);
          resume.addEventListener('click', () => {
            const byCard = (state.inkAttempts[cardId] ||= {});
            byCard[partId] = draft.responseId;
            try { localStorage.setItem(inkIdentityKey, JSON.stringify({ attempts: state.inkAttempts, groups: state.inkGroups })); } catch { /* current session still has the chosen draft */ }
            save();
            update({ keepControls: true, keepPage: true });
          });
        }
        target.append(section);
      }).catch(() => {});
      if (conflicts.length) {
        const section = document.createElement('details');
        section.className = 'ink-answer__conflicts';
        const summary = document.createElement('summary');
        summary.textContent = `${conflicts.length} other saved version${conflicts.length === 1 ? '' : 's'} need review`;
        section.append(summary);
        const previews = [];
        for (const [index, conflict] of conflicts.entries()) {
          const panel = document.createElement('div');
          panel.className = 'ink-answer__conflict';
          const title = document.createElement('p');
          title.textContent = `Saved version ${index + 1}${conflict.updatedAt ? ` · ${new Date(conflict.updatedAt).toLocaleString('en-GB')}` : ''}`;
          const previewTarget = document.createElement('div');
          const actions = document.createElement('div');
          actions.className = 'row row--tight';
          const choose = document.createElement('button');
          choose.type = 'button';
          choose.className = 'btn btn--sm btn--primary';
          choose.textContent = 'Use this version';
          const keep = document.createElement('button');
          keep.type = 'button';
          keep.className = 'btn btn--sm';
          keep.textContent = 'Keep current version';
          actions.append(choose, keep);
          panel.append(title, previewTarget, actions);
          section.append(panel);
          previews.push(renderInkPreview(previewTarget, conflict));
          const resolve = async (useConflict) => {
            choose.disabled = true;
            keep.disabled = true;
            try {
              const result = await api.resolveInkConflict(responseId, partId, conflict, { useConflict });
              if (useConflict && result?.record) {
                inkValues.set(valueKey, result.record);
                inkRevisions.set(valueKey, result.record.revision || 1);
                state.inkSaved[valueKey] = result.record.status === 'saved';
              }
              const latest = await api.loadInkState(responseId, partId);
              if (latest.record) {
                inkValues.set(valueKey, latest.record);
                inkRevisions.set(valueKey, latest.record.revision || 1);
                state.inkSaved[valueKey] = latest.record.status === 'saved';
              }
              section.remove();
              previews.forEach((preview) => preview.destroy());
              editor.destroy();
              inkEditors.delete(key);
              inkConflictPreviews.delete(key);
              target.replaceChildren();
              state.inkOpen[key] = true;
              await mountInkEditors();
            } catch (error) {
              choose.disabled = false;
              keep.disabled = false;
              toast(error?.message || 'Could not resolve the saved handwriting versions.', { type: 'error' });
            }
          };
          choose.addEventListener('click', () => resolve(true));
          keep.addEventListener('click', () => resolve(false));
        }
        target.append(section);
        inkConflictPreviews.set(key, previews);
      }
    }
  }
  function writingControls(cardId, partId, open) {
    return html`<div class="ink-answer"><div data-ink-target="${partId}" ${open ? '' : 'hidden'}></div><button type="button" class="btn btn--sm" data-ink-toggle="${partId}" data-ink-card="${cardId}" data-ink-part="${partId}" aria-expanded="${open}">${open ? 'Use keyboard' : 'Write with Pencil'}</button></div>`;
  }
  const markOfPart = (cardId, partId = cardId) => {
    const attempt = partAttempt(cardId, partId);
    return state.drafts[partStateKey(cardId, partId)]?.mark ?? (attempt && !attempt.waiting ? String(attempt.marks_awarded) : '');
  };
  const cardOf = (node) => node.closest('[data-group]')?.dataset.group || node.closest('[data-card]')?.dataset.card;
  const clock = (iso) => new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  const whenLabel = (iso) => `${fmtRelative(iso)} at ${clock(iso)}`;
  const goScore = (option) => (option.complete
    ? html`<span class="tag">${option.awarded}/${option.max}</span>`
    : option.markedCount ? html`<span class="tag">Partly marked</span>` : html`<span class="tag tag--waiting">${icon('clock', { size: 13 })} Not marked yet</span>`);
  const engineContext = { specIndex, learned, latestAttempts: latest, savedAnswers: waiting, papersById: bundle.papersById };
  const PAGE_SIZE = 30;
  const timed = () => state.mode === 'timed_test';
  const sourceTypes = () => SOURCE_CHOICES.find((choice) => choice.id === state.source).types.filter((type) => enabledSourceTypes().includes(type));
  const scopedPool = () => pool.filter((question) => sourceTypes().includes(question.source_type));
  // Tiers in force: a search naming a tier or one of its paper codes ("higher", "1BH") is an
  // explicit choice of that tier; otherwise the Tier control (saved tier by default).
  const subjectPapers = [...bundle.papersById.values()].filter((paper) => paper.subject_id === subjectId);
  const searchIntent = () => (tiered && !timed() ? searchTierIntent(state.search, subjectPapers) : { tiers: [], search: state.search });
  const activeTiers = () => {
    const named = searchIntent().tiers;
    if (named.length) return named;
    return state.tier ? [state.tier] : null;
  };
  // The pool for counts and lists: the tiers in force only.
  const tierPool = () => {
    const tiers = activeTiers();
    return tiers ? scopedPool().filter((question) => tiers.includes(question.tier !== undefined ? question.tier : bundle.papersById.get(question.paper_id)?.tier)) : scopedPool();
  };
  // With "Only topics I've covered" on, the topic list holds only the covered points, so
  // the student narrows within what they have learned. Off, it holds every point.
  const treeEnabled = () => (coveredOnly() ? new Set((textbookMode() ? textbooks.ids : subjectLeaves).filter((id) => learned.has(id))) : null);
  const setTexts = tierSpec.sections.flatMap((section) => section.topics.filter((topic) => topic.kind === 'set_text').flatMap((topic) => topic.points));
  const exactTariffs = !modes.includes('individual'); // essay subjects filter by exact mark tariff
  const bandOptions = exactTariffs
    ? [...new Set(pool.map((question) => question.marks))].sort((a, b) => a - b).map((marks) => ({ id: `=${marks}`, label: `${marks} marks`, min: marks, max: marks }))
    : MARK_BANDS;

  const textbookMode = () => Boolean(textbooks && state.topicOrganisation === 'textbook');
  const focusKey = () => timed()
    ? textbookMode() ? 'testTextbookFocus' : 'testFocus'
    : textbookMode() ? 'textbookFocus' : 'focus';
  const labelPoint = id => textbooks?.points.has(id) ? `${textbooks.points.get(id).book.short_title} · ${textbooks.points.get(id).code} ${textbooks.points.get(id).title}` : specIndex.label(id);
  const manualFocus = () => state[focusKey()];
  const coveredOnly = () => coveredFor(textbookMode());
  const chosenFocus = () => manualFocus();
  const activeFocus = () => textbookMode() ? null : chosenFocus();
  const activeTextbookFocus = () => textbookMode() ? chosenFocus() : null;

  const criteria = (extra = {}) => ({
    sourceTypes: sourceTypes(),
    focus: activeFocus(),
    focusMode: state.focusMode,
    focusScope: state.focusScope,
    selectionMode: state.selectionMode,
    textbookFocus: activeTextbookFocus(),
    learnedNamespace: textbookMode() ? 'textbook' : 'official',
    qualificationCodes: state.qualifications,
    curriculumPoints,
    contentYear: unitContentYears ? (state.curriculum.year === '12' ? 12 : state.curriculum.year === '13' && state.curriculum.year13Only ? 13 : null) : null,
    years: state.years.length ? state.years.map(Number) : null,
    series: state.series ? [state.series] : null,
    tiers: activeTiers(),
    paperIds: state.paper ? [state.paper] : null,
    sampleMode: state.sampleMode,
    learnedOnly: timed() ? true : coveredOnly(),
    testTopicSelectionOnly: timed(),
    sortBy: !timed() && state.shuffled ? 'shuffle' : state.sort,
    shuffleSeed: state.seed,
    ...extra,
  });

  function metadataControls(browser = false) {
    const papers = [...new Set(tierPool().map((question) => question.paper_id))].map((id) => bundle.papersById.get(id)).filter(Boolean);
    const years = [...new Set(papers.map((paper) => paper.year).filter(Number.isInteger))].sort((a, b) => b - a);
    const series = [...new Set(papers.map((paper) => paper.series).filter(Boolean))];
    const tiers = [...new Set(scopedPool().map((question) => question.tier !== undefined ? question.tier : bundle.papersById.get(question.paper_id)?.tier).filter(Boolean))];
    const select = (key, label, values, all) => html`<label class="field"><span class="field__label">${label}</span><select class="select" data-filter="${key}"><option value="">${all}</option>${state[key] && !values.some((value) => String(value) === String(state[key])) ? html`<option value="${state[key]}" selected>Unavailable saved filter: ${state[key]}</option>` : ''}${values.map((value) => html`<option value="${value}" ${String(state[key]) === String(value) ? 'selected' : ''}>${value}</option>`)}</select></label>`;
    const papersAndYears = html`
      ${years.length || state.years.length ? html`<fieldset class="field"><legend class="field__label">Exam years</legend><div class="chips">${[...new Set([...state.years, ...years.map(String)])].map((year) => html`<button type="button" class="chip" data-multi="years" data-value="${year}" aria-pressed="${state.years.includes(year)}">${year}${years.includes(Number(year)) ? '' : ' (unavailable)'}</button>`)}</div>${state.years.length ? html`<button type="button" class="linkbtn small" data-clear-group="years">Clear exam years</button>` : ''}</fieldset>` : ''}
      ${series.length || state.series ? select('series', 'Exam series', series, 'Any series') : ''}
      ${!tiered && (tiers.length || state.tier) ? select('tier', 'Tier', tiers, 'Any tier') : ''}
      <label class="field"><span class="field__label">Paper</span><select class="select" data-filter="paper"><option value="">Any paper</option>${state.paper && !papers.some((paper) => paper.paper_id === state.paper) ? html`<option value="${state.paper}" selected>Saved paper unavailable — clear this filter</option>` : ''}${papers.map((paper) => html`<option value="${paper.paper_id}" ${state.paper === paper.paper_id ? 'selected' : ''}>${paperOptionLabel(paper)}</option>`)}</select></label>
    `;
    const qualifications = qualificationOptions.length > 1 ? html`<fieldset class="field"><legend class="field__label">Qualification</legend><div class="chips">${qualificationOptions.map(({code: value, label}) => html`<button type="button" class="chip" data-multi="qualifications" data-value="${value}" aria-pressed="${state.qualifications.includes(value)}">${label}</button>`)}</div><p class="field__hint">Both are included when neither is selected.</p></fieldset>` : '';
    return browser ? html`${qualifications}<div class="browser-paper-filters">${papersAndYears}
    </div>${sourceControl()}`
      : html`<details class="filter-details" ${state.years.length || state.series || state.tier || state.paper || (bundle.scope && state.qualifications.length) ? 'open' : ''}><summary>Paper filters</summary><div class="stack">${bundle.scope ? qualifications : ''}${papersAndYears}</div></details>`;
  }

  function focusSummary(browser = false) {
    const focus = manualFocus();
    if (focus === null) return browser ? 'Open a book or section to choose chapters and individual points.' : 'All topics are selected.';
    if (!focus.length) return 'No topics chosen.';
    return `${plural(focus.length, textbookMode() ? 'textbook subsection' : 'spec point')} selected.`;
  }

  function selectedPoints() {
    const focus = manualFocus();
    return focus?.length ? html`<details><summary>Review selected points</summary><div class="chips">${focus.map(id => html`<button type="button" class="chip" data-remove-focus="${id}" aria-label="Remove ${labelPoint(id)}">${labelPoint(id)} ×</button>`)}</div></details>` : '';
  }

  // The "Only topics I've covered" switch shown on the filter bar and the test builder.
  function coveredSwitch(builder) {
    const on = coveredOnly();
    const ticked = hasLearning(textbookMode());
    const hint = !ticked
      ? html`You haven’t ticked any topics for ${subject.subject} yet. <a href="${links.subject(subjectId)}">Tick covered topics</a>`
      : on
        ? html`${builder ? 'Your test only uses' : 'Only showing questions on'} topics you’ve ticked in My subjects. <a href="${links.subject(subjectId)}">Edit covered topics</a>`
        : html`${builder ? 'Your test can use' : 'Showing questions on'} every topic, including ones you haven’t covered yet.`;
    if (!builder) {
      return html`<label class="covered-pill ${on ? 'is-on' : ''}" title="${ticked ? 'Only show questions on topics you’ve ticked in My subjects' : `Tick topics for ${subject.subject} in My subjects first`}">
        <span class="switch"><input type="checkbox" role="switch" data-covered ${on ? 'checked' : ''} /><span aria-hidden="true"></span></span>
        <span class="covered-pill__text">Only topics I’ve covered</span>
      </label>`;
    }
    return html`<div class="covered-switch ${on ? 'is-on' : ''} covered-switch--builder">
      <label class="covered-switch__label">
        <span class="switch"><input type="checkbox" role="switch" data-covered ${on ? 'checked' : ''} /><span aria-hidden="true"></span></span>
        <span class="covered-switch__text">Only topics I’ve covered</span>
      </label>
      <p class="covered-switch__hint small">${hint}</p>
    </div>`;
  }

  function topicsControl(browser = false) {
    const learnedIds = textbookMode() ? textbooks.ids : subjectLeaves;
    const learnedCount = learnedIds.filter(id => learned.has(id)).length;
    return html`<fieldset class="field ${browser ? 'browser-topics' : ''}">
      <legend class="field__label">Topics</legend>
      ${topicOrganisationControl(state.topicOrganisation, {available: Boolean(textbooks)})}
      <p class="field__hint">${textbookMode() ? `Book numbers follow your supplied contents pages.${subject.textbook_example ? ` ${subject.textbook_example}` : ''}` : 'These are official exam-board references; textbook chapter numbers are separate.'}</p>
      ${curriculum.years.length ? html`<div data-curriculum></div>` : ''}
      ${browser && coveredOnly() ? html`<p class="field__hint">Showing the ${plural(learnedCount, textbookMode() ? 'textbook subsection' : 'spec point')} you’ve covered. Untick any you want to leave out. Turn off <b>Only topics I’ve covered</b> to see every topic. <a href="${links.subject(subjectId)}">Edit covered topics</a></p>` : ''}
      <div class="stack stack--sm" data-topic-picker>
        <p class="small muted" data-focus-summary>${focusSummary(browser)}</p>
        <div data-selected-points>${selectedPoints()}</div>
        ${!textbookMode() && setTexts.length ? html`<div class="chips" role="group" aria-label="Set texts">${setTexts.map(point => html`<button type="button" class="chip" data-text="${point.id}" aria-pressed="${state.focus?.includes(point.id) || false}">${point.title}</button>`)}</div>` : ''}
        ${browser ? '' : html`<button type="button" class="btn btn--sm" data-toggle-tree aria-expanded="${state.showTree}">${icon('list', {size: 15})} ${state.showTree ? 'Hide topic list' : 'Choose topics'}</button>`}
        <div class="focus-tree ${browser ? 'focus-tree--browser' : ''}" data-tree ${browser || state.showTree ? '' : 'hidden'}></div>
      </div>
      <fieldset class="field"><legend class="field__label">Question coverage</legend><div class="topic-choices">
        ${[['strict', 'Only these points'], ['crossover', 'Include crossover questions']].map(([id, label]) => html`<label class="check checkpoint"><input type="radio" name="question-coverage" data-topic-coverage="${id}" value="${id}" ${state.selectionMode === id ? 'checked' : ''} /><span>${label}</span></label>`)}
      </div><p class="field__hint">${state.selectionMode === 'strict' ? 'Every required topic must be in your selection.' : 'Questions may also need other topics; their references are shown on each question.'}</p></fieldset>
    </fieldset>`;
  }

  function sourceControl() {
    return html`<fieldset class="field">
      <legend class="field__label">Question source</legend>
      <p class="field__hint">Browse original past-paper questions and official sample assessments.</p>
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
      mountCurriculumSelector(curriculumTarget, { curriculum: textbooks ? {...curriculum, books: []} : curriculum, specIndex, cumulativeYear13: unitContentYears, initial: state.curriculum, onChange: ({ visible, partial, state: next }) => {
        state.curriculum = next;
        curriculumPoints = unitContentYears && !next.bookId && !next.chapterId ? null : visible ? [...visible] : null;
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
    if (!target || (timed() && !state.showTree)) {
      tree = null;
      return;
    }
    const enabledSet = treeEnabled();
    const all = enabledSet ? [...enabledSet] : textbookMode() ? textbooks.ids : subjectLeaves;
    const counts = countByNode(tierPool(), specIndex);
    const textbookCounts = textbookMode() ? textbooks.counts(tierPool()) : null;
    tree = mountSpecTree(target, {
      spec: textbookMode() ? textbooks.tree : tierSpec,
      filterLayout: !timed(),
      selected: manualFocus() === null ? all : manualFocus().filter((id) => !enabledSet || enabledSet.has(id)),
      enabled: enabledSet,
      hideDisabled: Boolean(enabledSet),
      noun: 'chosen',
      disabledHint: 'Not ticked as learned yet',
      topicMeta: (topic, { selected }) => {
        const count = textbookMode() ? textbookCounts.get(topic.id) || 0 : counts.get(topic.id) || 0;
        return html`<span>${count} ${count === 1 ? 'question' : 'questions'}</span><span>${selected} chosen</span>`;
      },
      onChange: (selected) => {
        state[focusKey()] = timed() ? [...selected] : selected.size === all.length ? null : [...selected];
        state.page = 1;
        save();
        update({ keepControls: true }); // leave the tree as the student has it open
      },
    });
  }

  // ───────────────────────────────── timed test ─────────────────────────────────

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
            return html`<button type="button" class="chip chip--difficulty chip--difficulty-${level.id}" role="radio" aria-checked="${state.difficulty === level.id}" data-difficulty="${level.id}" title="${level.description}">
              ${level.label}<span class="chip__count">${count}</span>
            </button>`;
          })}
        </div>
        <p class="field__hint">${(DIFFICULTIES.find((d) => d.id === state.difficulty) || MIXED).description}</p>
      </fieldset>
      <div class="card ruled builder__card builder__card--wide tilt-3">
        <i class="tape tape--l" aria-hidden="true"></i>
        <h2 class="builder__title">Topics</h2>
        <button type="button" class="btn btn--sm filter-reset" data-reset-filters>Reset filters</button>
        ${coveredSwitch(true)}
        <p class="hand builder__note">${coveredOnly() ? 'Starts with the topics you’ve covered. Add or remove topics below for this test only; your saved topics won’t change.' : 'Starts with every topic. Add or remove topics below for this test only.'}</p>
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

  function testPreview(unitMatches, lockedCount) {
    // A linked group goes into a test whole or not at all, and counts as one question.
    const matches = testEntries(unitMatches, pool, bundle.questionsById);
    currentTest = buildTest(matches, {
      minutes: state.minutes,
      difficulty: state.difficulty,
      seed: state.seed,
      latestAttempts: latest,
      preferUnseen: state.preferUnseen,
      prioritiseWeak: state.prioritiseWeak,
      topicOf: (question) => specIndex.topicOf(question.primary_spec_points[0])?.id || '',
    });
    currentTest.question_ids = expandLinkedIds(currentTest.question_ids, bundle.questionsById);
    const test = currentTest;
    if (!test.questions.length) {
      return html`<div class="card">
        ${emptyState({
          iconName: 'filter',
          title: 'No questions match yet',
          text: !manualFocus()?.length
            ? 'Choose one or more topics in the list to build this test. Your saved learned topics will stay unchanged.'
            : lockedCount
              ? `${plural(lockedCount, 'question')} need topics you haven’t learned or selected for this test. Add those topics to this test or widen your selection.`
              : 'Try another difficulty, widen your topics, or check the current paper, tier and module filters.',
          action: html`<button type="button" class="btn" data-reset-filters>Reset filters</button>`,
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
        ${test.time_limit_minutes > test.target_minutes
          ? banner(html`The shortest question that matches needs about ${fmtMinutes(test.total_minutes)}. That’s how much time this test will give you.`)
          : ''}
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
                <details data-test-preview="${index}">
                  <summary class="testlist__summary">
                    <span class="testlist__num">${index + 1}</span>
                    <span class="testlist__topic">${specIndex.topicOf(question.primary_spec_points[0])?.title || 'Question'}${question.is_linked_group ? html` <span class="small muted">· ${question.parts.length} linked parts</span>` : ''}</span>
                    ${difficultyBadge(question.difficulty)}
                    <span class="small muted nowrap">${plural(question.marks, 'mark')}</span>
                  </summary>
                  <div class="stack stack--sm" data-test-preview-body></div>
                </details>
              </li>`,
          )}
        </ol>
        <div class="testpreview__actions">
          <button type="button" class="btn btn--lg" data-shuffle>Shuffle</button>
          <button type="button" class="btn btn--lg" data-export-test="built">Export PDF</button>
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
    const focus = manualFocus();
    const topicsValue = focus === null ? (coveredOnly() ? 'Covered' : 'All') : !focus.length ? 'None' : `${focus.length} chosen`;
    const pick = (values, labelOf) => (values.length ? (values.length > 2 ? `${values.length} chosen` : values.map(labelOf).join(', ')) : 'Any');
    const difficultyValue = pick(state.difficulties, (id) => DIFFICULTIES.find((d) => d.id === id)?.label || id);
    const marksValue = state.markMin !== '' || state.markMax !== '' ? `${state.markMin || 0}–${state.markMax || 'any'}` : pick(state.bands, (id) => bandOptions.find((b) => b.id === id)?.label || id);
    const progressValue = pick(state.markStatuses, (id) => PROGRESS_FILTERS[id]);
    const moreCount = state.years.length + state.qualifications.length + [state.series, tiered ? '' : state.tier, state.paper].filter(Boolean).length;
    const pop = (key, label, value, body, wide = false) => html`<details class="fpop" data-section="fpop-${key}">
        <summary class="fpop__btn"><span class="fpop__label">${label}</span><span class="fpop__value ${['Any', 'All', 'Year, paper'].includes(value) ? '' : 'is-set'}">${value}</span>${icon('chevronDown', { size: 14 })}</summary>
        <div class="fpop__panel ${wide ? 'fpop__panel--wide' : ''}">${body}</div>
      </details>`;
    return html`<div class="card question-filters fbar" aria-labelledby="question-filters-title">
      <i class="tape tape--c" aria-hidden="true"></i>
      <h2 class="sr-only" id="question-filters-title">Filter questions</h2>
      <div class="fbar__row">
        ${coveredSwitch(false)}
        ${pop('topics', 'Topics', topicsValue, topicsControl(true), true)}
        ${pop('difficulty', 'Difficulty', difficultyValue, html`<fieldset class="field"><legend class="field__label">Difficulty</legend><div class="chips">
          ${DIFFICULTIES.map((d) => html`<button type="button" class="chip chip--difficulty chip--difficulty-${d.id}" data-multi="difficulties" data-value="${d.id}" aria-pressed="${state.difficulties.includes(d.id)}" title="${d.description}">${d.label}<span class="chip__count">${count((q) => q.difficulty === d.id)}</span></button>`)}
        </div>${state.difficulties.length ? html`<button type="button" class="linkbtn small" data-clear-group="difficulties">Clear difficulty</button>` : ''}</fieldset>`)}
        ${pop('marks', exactTariffs ? 'Marks' : 'Marks', marksValue, html`<fieldset class="field"><legend class="field__label">${exactTariffs ? 'Marks (essay length)' : 'Marks'}</legend><div class="chips">
          ${bandOptions.map((band) => html`<button type="button" class="chip" data-multi="bands" data-value="${band.id}" aria-pressed="${state.bands.includes(band.id)}">${band.label}<span class="chip__count">${count((q) => q.marks >= band.min && q.marks <= band.max)}</span></button>`)}
        </div>${state.bands.length ? html`<button type="button" class="linkbtn small" data-clear-group="bands">Clear marks</button>` : ''}
          <p class="field__hint">Or use an exact range:</p>
          <div class="filter-grid filter-grid--two">${[['markMin', 'Minimum'], ['markMax', 'Maximum']].map(([key, label]) => html`<label class="field"><span class="field__label">${label}</span><input type="number" class="input" min="0" step="1" value="${state[key]}" data-filter="${key}" /></label>`)}</div>
          ${state.markMin !== '' && state.markMax !== '' && Number(state.markMin) > Number(state.markMax) ? html`<p class="form-error" role="status">Minimum must not exceed maximum. No questions match this range.</p>` : ''}
        </fieldset>`)}
        ${pop('progress', 'Progress', progressValue, html`<fieldset class="field"><legend class="field__label">My progress</legend><div class="progress-checkpoints">
          ${Object.entries(PROGRESS_FILTERS).map(([value, label]) => html`<label class="check checkpoint"><input type="checkbox" data-progress="${value}" ${state.markStatuses.includes(value) ? 'checked' : ''} /><span>${label}</span></label>`)}
        </div><p class="field__hint">Leave all unticked to see every question.</p></fieldset>`)}
        ${pop('more', 'More', moreCount ? `${moreCount} set` : 'Year, paper', html`<div class="stack">${metadataControls(true)}</div>`, true)}
        <label class="fbar__sort"><span class="sr-only">Sort</span><select class="select select--sm" data-sort aria-label="Sort questions">
          <option value="" disabled ${state.shuffled ? 'selected' : ''}>Sort</option>
          ${Object.entries(SORTS).map(([id, label]) => html`<option value="${id}" ${!state.shuffled && state.sort === id ? 'selected' : ''}>${label}</option>`)}
        </select></label>
        <label class="fbar__search searchbox">${icon('search', { size: 16 })}<input class="input input--sm" type="search" placeholder="Search text or spec code" value="${state.search}" data-search aria-label="Search text or spec code" /></label>
        <button type="button" class="linkbtn small fbar__reset" data-reset-filters>Reset</button>
      </div>
    </div>`;
  }

  /** Which go is open: a new one, or an earlier one being changed. */
  function goLine(cardId) {
    const options = goOptions(cardId);
    if (!options.length) return '';
    const go = currentGo(cardId);
    const text = needsChoice(cardId)
      ? html`You have done this ${options.length === 1 ? 'once' : `${options.length} times`} before.`
      : go ? html`<b>Changing your attempt from ${whenLabel(go.when)}</b> ${goScore(go)}` : html`<b>New attempt</b> <span class="muted">· your ${options.length === 1 ? 'earlier attempt is' : `${options.length} earlier attempts are`} kept</span>`;
    return html`<p class="goline small">${icon('refresh', { size: 14 })}<span>${text}</span><button type="button" class="linkbtn small" data-choose-go="${cardId}">${needsChoice(cardId) ? 'Choose an attempt' : 'Switch'}</button></p>`;
  }

  /** Under the slider: what happened to the mark (saved in place, no button), an undo, and a nudge for guests. */
  function markFoot(cardId, { saved = '', canUndo = false, group = false } = {}) {
    return html`<div class="markfoot small">
      <span class="markfoot__saved" role="status" data-mark-confirmation ${saved ? '' : 'hidden'}>${saved}</span>
      ${group
        ? html`<button type="button" class="linkbtn small" data-undo-group="${cardId}" ${canUndo ? '' : 'hidden'}>Undo last save</button>`
        : html`<button type="button" class="linkbtn small" data-undo="${cardId}" ${canUndo ? '' : 'hidden'}>Undo last save</button>`}
      ${user ? '' : html`<span class="muted">Marks are not kept yet. <button type="button" class="linkbtn small" data-signup>Create a free account</button> to save your scores.</span>`}
    </div>
    <p class="small form-error" role="alert" data-mark-error hidden></p>`;
  }

  /** The examiner's report toggle. It opens a panel under the question or mark scheme, whichever is showing. */
  function reportButton(id, paper) {
    if (!hasExaminerReport(paper)) return '';
    const open = state.reportQuestions.includes(id);
    return html`<button type="button" class="btn btn--sm ${open ? 'is-on' : ''}" data-report="${id}" aria-expanded="${open}">${icon('book', { size: 15 })} ${open ? 'Hide examiner’s report' : 'Examiner’s report'}</button>`;
  }

  function questionCard(question, { locked = null, partsMissing = null } = {}) {
    if (question.is_linked_group) return linkedCard(question, { locked, partsMissing });
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
    const open = !state.closedQuestions.includes(question.question_id);
    const schemeOpen = state.schemeQuestions.includes(question.question_id);
    const qid = question.question_id;
    const value = markOfPart(qid);
    const current = partAttempt(qid, qid);
    const changing = Boolean(current && !current.waiting);
    const canUndo = changing && Boolean(current.inline || current.mark_edits?.length);
    const goes = goOptions(qid).length;
    const paper = bundle.papersById.get(question.paper_id);
    const reportOpen = hasExaminerReport(paper) && state.reportQuestions.includes(qid);
    return html`<article class="qcard ${selected ? 'is-selected' : ''}" data-card="${qid}">
      <span class="qcard__select">
        <input type="checkbox" class="tree__check" data-select="${question.question_id}" ${selected ? 'checked' : ''} aria-label="Add ${questionRef(question, bundle.papersById)} to set" />
      </span>
      <div style="min-width:0">
        <p class="qcard__ref">${questionRef(question, bundle.papersById)} ${attempt ? html`<span class="tag">Saved ${attempt.marks_awarded}/${attempt.max_marks}</span>` : ''}${waiting.has(qid) ? html`<span class="tag tag--waiting">${icon('clock', { size: 13 })} Answered, not marked</span>` : attempt ? '' : html`<span class="tag">Not tried yet</span>`}${goes > 1 ? html`<span class="tag">${goes} attempts</span>` : ''}</p>
        <p class="small muted">${subject.board} · ${subject.subject} · ${question.level || subject.level}${Number.isInteger(paper?.year) ? ` · ${paper.year}` : ''}${paper?.series && paper.series !== 'Demo' ? ` · ${paper.series}` : ''}</p>
        ${questionMeta(question, { specIndex, level: levelLabel(question, subject, bundle.papers), organisation: state.topicOrganisation, referencesOpen: state.referenceQuestions.includes(question.question_id) })}
        ${!open ? html`<p class="qcard__text">${questionSnippet(question)}</p>` : ''}
        ${open ? html`<div class="qsplit" data-qfit>
          <div class="qsplit__main ${schemeOpen ? 'is-scheme' : ''}" data-zoom-src="${schemeOpen ? 'Mark scheme' : 'Question'} · ${questionRef(question, bundle.papersById)}">
            <div class="qsplit__head"><span class="field__label">${schemeOpen ? html`${icon('eye', { size: 14 })} Mark scheme` : 'Question'}</span>${zoomButton(schemeOpen ? 'mark scheme' : 'question')}</div>
            ${schemeOpen
              ? markSchemeBody(question)
              : questionBody(question, { contextOpen: state.contextQuestions.includes(question.question_id) })}
            ${reportOpen ? reportPanel({ key: qid, units: [question], paper, view: schemeOpen ? 'scheme' : 'question', label: reportQuestionLabel(question), closeAttr: html`data-report="${qid}"` }) : ''}
          </div>
          <div class="qsplit__side stack stack--sm">
            ${goLine(qid)}
            <label class="field qsplit__answerfield" data-zoom-src="Your answer · ${questionRef(question, bundle.papersById)}" ${state.inkOpen[qid] ? 'hidden' : ''}><span class="field__label">Your answer (optional) ${zoomButton('answer box')}</span><textarea class="textarea qsplit__answer" rows="8" data-answer="${question.question_id}" placeholder="Type your answer here, or answer on paper">${answerOf(qid)}</textarea></label>
            ${writingControls(qid, question.question_id, Boolean(state.inkOpen[qid]))}
            ${schemeOpen ? html`<section class="markbox stack stack--sm">
              ${markPicker({ id: question.question_id, max: question.marks, value, attr: 'mark' })}
              ${markFoot(qid, { saved: changing && current && !current.waiting ? `Saved ${current.marks_awarded}/${question.marks}` : '', canUndo })}
            </section>` : ''}
            <div class="row row--tight">
              <button type="button" class="btn btn--sm ${schemeOpen ? '' : 'btn--primary'}" data-scheme="${question.question_id}" aria-expanded="${schemeOpen}">${schemeOpen ? html`${icon('chevronLeft', { size: 15 })} Back to question` : html`${icon('eye', { size: 15 })} Show mark scheme`}</button>
              ${reportButton(qid, paper)}
              <button type="button" class="btn btn--sm ${schemeOpen ? 'btn--primary' : ''}" data-next="${qid}">Next question ${icon('chevronRight', { size: 15 })}</button>
              ${paper ? html`<a class="btn btn--sm" href="${links.paper(subjectId, question.paper_id)}">View full paper</a>` : ''}
            </div>
          </div>
        </div>` : ''}
      </div>
      <div class="qcard__side">${marksPill(question.marks)}<button type="button" class="btn btn--sm" data-open="${question.question_id}" aria-expanded="${open}">${open ? 'Hide question' : 'Show question'}</button></div>
    </article>`;
  }

  /**
   * A linked group (engine/linked-parts.js): the question's introduction once, then every
   * part with its own crop and answer box. The mark scheme view gives each part its own
   * scheme and marks; one button saves them all, as an attempt on each part.
   */
  function linkedCard(entry, { locked = null, partsMissing = null } = {}) {
    const id = entry.question_id;
    const ref = linkedRef(entry, bundle.papersById);
    const label = (part) => linkedPartLabel(part, entry);
    if (locked) {
      return html`<article class="qcard is-locked qgroup">
        <span class="qcard__select muted">${icon('lock', { size: 16, label: 'Locked' })}</span>
        <div style="min-width:0">
          <p class="qcard__ref">${ref} <span class="tag">${entry.parts.length} linked parts</span></p>
          <p class="small">Shown as one question, so every part has to be on a topic you have learned.</p>
          <div class="qgroup__lockparts">${entry.parts.map((part) => {
            const missing = partsMissing?.get(part.question_id) || [];
            const own = missing.filter((point) => specIndex.expand([...(part.primary_spec_points || []), ...(part.crossover_spec_points || [])]).has(point));
            return own.length
              ? html`<span class="is-missing">${label(part)} needs: ${own.slice(0, 2).map((point) => specIndex.label(point)).join(' · ')}${own.length > 2 ? ` and ${own.length - 2} more` : ''}</span>`
              : html`<span class="is-ok">${label(part)} learned</span>`;
          })}</div>
        </div>
        <div class="qcard__side">${marksPill(entry.marks)}</div>
      </article>`;
    }
    const selected = state.selected.includes(id);
    const open = !state.closedQuestions.includes(id);
    const schemeOpen = state.schemeQuestions.includes(id);
    const reportOpen = hasExaminerReport(bundle.papersById.get(entry.paper_id)) && state.reportQuestions.includes(id);
    const attempts = entry.parts.map((part) => latest.get(part.question_id));
    const saved = attempts.every(Boolean);
    const paper = bundle.papersById.get(entry.paper_id);
    const markOf = (part) => markOfPart(id, part.question_id);
    const total = entry.parts.reduce((sum, part) => sum + (markOf(part) === '' ? 0 : Number(markOf(part))), 0);
    const go = currentGo(id);
    const changing = Boolean(go?.complete);
    const canUndo = entry.parts.some((part) => { const attempt = go?.parts.get(part.question_id); return attempt && !attempt.waiting && (attempt.inline || attempt.mark_edits?.length); });
    const goes = goOptions(id).length;
    return html`<article class="qcard qgroup ${selected ? 'is-selected' : ''}" data-group="${id}">
      <span class="qcard__select">
        <input type="checkbox" class="tree__check" data-select="${id}" ${selected ? 'checked' : ''} aria-label="Add ${ref} to set" />
      </span>
      <div style="min-width:0">
        <p class="qcard__ref">${ref} ${saved
          ? html`<span class="tag">Saved ${attempts.reduce((sum, attempt) => sum + attempt.marks_awarded, 0)}/${entry.marks}</span>`
          : attempts.some(Boolean) ? html`<span class="tag">Partly marked</span>` : entry.parts.some((part) => waiting.has(part.question_id)) ? '' : html`<span class="tag">Not tried yet</span>`}${entry.parts.some((part) => waiting.has(part.question_id)) ? html`<span class="tag tag--waiting">${icon('clock', { size: 13 })} Answered, not marked</span>` : ''}${goes > 1 ? html`<span class="tag">${goes} attempts</span>` : ''}</p>
        <p class="small muted">${subject.board} · ${subject.subject} · ${entry.level || subject.level}${Number.isInteger(paper?.year) ? ` · ${paper.year}` : ''}${paper?.series && paper.series !== 'Demo' ? ` · ${paper.series}` : ''}</p>
        ${questionMeta(entry, { specIndex, level: levelLabel(entry, subject, bundle.papers), organisation: state.topicOrganisation, referencesOpen: state.referenceQuestions.includes(id) })}
        ${!open ? html`<p class="qcard__text">${entry.parts.length} linked parts: ${entry.parts.map((part) => questionSnippet(part, 60)).join(' · ')}</p>` : ''}
        ${open ? html`${linkedNote(entry)}
          ${goLine(id)}
          <div class="qgroup__intro">${linkedIntro(entry)}</div>
          ${entry.parts.map((part) => {
            const uses = linkedUses(part, entry);
            const partId = part.question_id;
            const key = partStateKey(id, partId);
            return html`<section class="qgroup__part" aria-label="Part ${label(part)}">
              <div class="qsplit">
                <div class="qsplit__main ${schemeOpen ? 'is-scheme' : ''}" data-zoom-src="${schemeOpen ? 'Mark scheme' : 'Part'} ${label(part)} · ${ref}">
                  <div class="qsplit__head"><span class="field__label qgroup__partlabel"><b>${schemeOpen ? html`${icon('eye', { size: 14 })} Mark scheme ${label(part)}` : html`Part ${label(part)}`}</b><span class="small muted">${plural(part.marks, 'mark')}</span>${uses.length && !schemeOpen ? html`<span class="qgroup__uses">${icon('chevronLeft', { size: 12 })} uses your answer to ${uses.join(' and ')}</span>` : ''}</span>${zoomButton(schemeOpen ? 'mark scheme' : 'question')}</div>
                  ${schemeOpen ? markSchemeBody(part, { wholeQuestion: false }) : linkedPartBody(part)}
                </div>
                <div class="qsplit__side stack stack--sm">
                  <label class="field qsplit__answerfield" data-zoom-src="Your answer to ${label(part)} · ${ref}" ${state.inkOpen[key] ? 'hidden' : ''}><span class="field__label">Your answer to ${label(part)} ${zoomButton('answer box')}</span><textarea class="textarea qsplit__answer" rows="4" data-answer="${partId}" placeholder="Type your answer to ${label(part)}, or answer on paper">${answerOf(id, partId)}</textarea></label>
                  ${writingControls(id, partId, Boolean(state.inkOpen[key]))}
                  ${schemeOpen ? html`<section class="markbox">${markPicker({ id: partId, max: part.marks, value: markOf(part), attr: 'mark', labelId: `mp-${key}`, label: `Marks for ${label(part)}, out of ${part.marks}` })}</section>` : ''}
                </div>
              </div>
            </section>`;
          })}
          ${reportOpen ? reportPanel({ key: id, units: entry.parts, paper, view: schemeOpen ? 'scheme' : 'question', label: `${entry.parts.length} parts`, group: true, closeAttr: html`data-report="${id}"` }) : ''}
          <div class="qgroup__foot">
            ${schemeOpen
              ? html`<p class="qgroup__total" data-group-total>Total <b>${total}</b> / ${entry.marks}</p>
                ${markFoot(id, { saved: changing ? `Saved ${go.awarded}/${entry.marks}` : '', canUndo, group: true })}
                <div class="row row--tight">
                  <button type="button" class="btn btn--sm" data-scheme="${id}" aria-expanded="true">${icon('chevronLeft', { size: 15 })} Back to question</button>
                  ${reportButton(id, paper)}
                  <button type="button" class="btn btn--sm btn--primary" data-next="${id}">Next question ${icon('chevronRight', { size: 15 })}</button>
                </div>`
              : html`<p class="small muted">Answer all ${entry.parts.length} parts, then check them together.</p>
                <div class="row row--tight">
                  <button type="button" class="btn btn--primary btn--sm" data-scheme="${id}" aria-expanded="false">${icon('eye', { size: 15 })} Show mark scheme for all parts</button>
                  ${reportButton(id, paper)}
                  <button type="button" class="btn btn--sm" data-next="${id}">Next question ${icon('chevronRight', { size: 15 })}</button>
                  ${paper ? html`<a class="btn btn--sm" href="${links.paper(subjectId, entry.paper_id)}">View full paper</a>` : ''}
                </div>`}
          </div>` : ''}
      </div>
      <div class="qcard__side">${marksPill(entry.marks)}<button type="button" class="btn btn--sm" data-open="${id}" aria-expanded="${open}">${open ? 'Hide question' : 'Show question'}</button></div>
    </article>`;
  }

  function browserResults() {
    const customMarks = state.markMin !== '' || state.markMax !== '';
    const min = state.markMin === '' ? 0 : Number(state.markMin);
    const max = state.markMax === '' ? Infinity : Number(state.markMax);
    const valid = Number.isInteger(min) && min >= 0 && (max === Infinity || Number.isInteger(max)) && max >= min;
    const bands = customMarks ? [{ min: valid ? min : Infinity, max: valid ? max : -Infinity }]
      : bandOptions.filter((band) => state.bands.includes(band.id));
    const filtered = filterQuestions(
      scopedPool(),
      criteria({ difficulties: state.difficulties, markBands: bands, markStatuses: state.markStatuses, search: searchIntent().search }),
      engineContext,
    );
    // Linked parts are one question: one card, locked unless every part is learned.
    const matches = collapseLinked(filtered.matches, bundle.questionsById);
    const locked = collapseLocked(filtered.locked, bundle.questionsById);
    const sorted = matches;
    const pageCount = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
    state.page = Math.min(pageCount, state.page);
    const matchIds = new Set(matches.map((question) => question.question_id));
    save();
    const visible = sorted.slice((state.page - 1) * PAGE_SIZE, state.page * PAGE_SIZE);
    const chosen = state.selected.map(entryOf).filter(Boolean);
    const picker = state.mode === 'picker';
    const active = [
      ...(activeFocus() !== null ? [{key: 'focus', label: `${activeFocus().length} spec points selected`}] : []),
      ...(activeTextbookFocus() !== null ? [{key: 'textbookFocus', label: `${activeTextbookFocus().length} textbook subsections selected`}] : []),
      ...(coveredOnly() ? [{key: 'learnedOnly', label: 'Topics I’ve covered'}] : []),
      ...state.qualifications.map(value => ({key: 'qualifications', value, label: qualificationLabel(value)})),
      ...state.markStatuses.map((value) => ({key: 'markStatuses', value, label: PROGRESS_FILTERS[value]})),
      ...(state.sampleMode !== 'all' ? [{key: 'sampleMode', label: state.sampleMode === 'hide' ? 'Hide demo content' : 'Demo content only'}] : []),
      ...state.difficulties.map((value) => ({key: 'difficulties', value, label: value.replaceAll('_', ' ')})),
      ...(customMarks ? [{key: 'markRange', label: `Marks: ${state.markMin || '0'}–${state.markMax || 'any'}`}] : []),
      ...state.bands.map((value) => ({key: 'bands', value, label: bandOptions.find((b) => b.id === value)?.label || value})),
      ...state.years.map((value) => ({key: 'years', value, label: `Year: ${value}`})),
      ...['series', ...(tiered ? [] : ['tier']), 'paper'].filter((key) => state[key]).map((key) => ({key, label: `${key}: ${state[key]}`})),
      ...(state.search ? [{key: 'search', label: `Search: ${state.search}`}] : []),
    ];
    const namedTiers = searchIntent().tiers;
    const searchTierNote = namedTiers.length && namedTiers.join() !== (state.tier || '')
      ? html`<p class="small muted tier-search-note" role="status">Your search names ${namedTiers.join(' and ')}, so ${namedTiers.join(' and ')} questions are shown.</p>` : '';
    return html`${searchTierNote}${active.length ? html`<div class="chips" aria-label="Active filters">${active.map((chip) => html`<button type="button" class="chip" data-clear-chip="${chip.key}" data-chip-value="${chip.value || ''}" aria-label="Remove filter ${chip.label}">${chip.label} ×</button>`)}</div>` : ''}<div class="row row--between browser-results-heading">
        <p role="status" aria-live="polite"><strong>${plural(sorted.length, 'question')}</strong> <span class="muted">match</span></p>
        <button class="btn btn--primary btn--sm" type="button" data-shuffle-questions>${icon('shuffle', { size: 16 })} ${state.shuffled ? 'Shuffle again' : 'Shuffle questions'}</button>
      </div>
      ${state.shuffled ? html`<p class="small muted" role="status">Questions shuffled. Choose a sort order above to return to a fixed order.</p>` : ''}
      ${chosen.length
        ? html`<div class="selectbar">
            <p>
              <strong>${plural(chosen.length, 'question')} chosen</strong>
              <span class="muted"> · ${sum(chosen, (q) => q.marks)} marks · about ${fmtMinutes(sum(chosen, minutesOf))} · ${chosen.filter((q) => !matchIds.has(q.question_id)).length} outside current filters</span>
            </p>
            <details><summary>Review selected questions</summary><ul>${chosen.map((q) => html`<li>${q.is_linked_group ? linkedRef(q, bundle.papersById) : questionRef(q, bundle.papersById)} · ${q.marks} marks <button type="button" class="linkbtn small" data-remove-selected="${q.question_id}">Remove</button></li>`)}</ul></details>
            <div class="row row--tight">
              <label class="check small"><input type="checkbox" data-flag="stopwatch" ${state.stopwatch ? 'checked' : ''} /><span>Run a stopwatch</span></label>
              <button type="button" class="btn btn--sm btn--ghost" data-clear-selection>Clear</button>
              <button type="button" class="btn btn--sm" data-export-test="selection">Export PDF</button>
              <button type="button" class="btn btn--sm btn--primary" data-start-set>${icon('play', { size: 15 })} Start ${chosen.length === 1 ? 'question' : 'these'}</button>
            </div>
          </div>`
        : sorted.length
          ? html`<p class="small muted">
              ${picker ? 'Tick the questions you want, then start. There is no time limit.' : 'Answer a question, then show its mark scheme to check your work. Tick questions to add them to a set.'}
            </p>`
          : ''}
      ${sorted.length
        ? html`<div class="qlist">${visible.map((question) => questionCard(question))}</div>`
        : questionBank.length ? emptyState({
            iconName: 'filter',
            title: 'No questions match',
            text: !hasLearning(textbookMode()) && coveredOnly()
              ? 'Tick the topics you have learned and questions will appear here.'
              : 'Change the filters to see more questions.',
            action: !hasLearning(textbookMode()) && coveredOnly() ? html`<a class="btn btn--primary" href="${links.subject(subjectId)}">Tick learned topics</a>` : null,
          }) : emptyBank()}
      ${sorted.length > PAGE_SIZE ? html`<nav class="row row--between filter-pagination" aria-label="Question results pages"><button type="button" class="btn btn--sm" data-page="${state.page - 1}" ${state.page <= 1 ? 'disabled' : ''}>Previous</button><span class="small muted" role="status">Page ${state.page} of ${pageCount} · ${(state.page - 1) * PAGE_SIZE + 1}–${Math.min(state.page * PAGE_SIZE, sorted.length)} of ${sorted.length}</span><button type="button" class="btn btn--sm" data-page="${state.page + 1}" ${state.page >= pageCount ? 'disabled' : ''}>Next</button></nav>` : ''}
      ${locked.length
        ? html`<details class="locked">
            <summary>${icon('lock', { size: 16 })} ${plural(locked.length, 'more question')} ${locked.length === 1 ? 'needs' : 'need'} topics you have not ticked as learned</summary>
            <div class="qlist" style="margin-top:12px">${locked.slice(0, 40).map((entry) => questionCard(entry.question, { locked: entry.missing, partsMissing: entry.partsMissing }))}</div>
            <p class="small" style="margin-top:10px"><a href="${links.subject(subjectId)}">Update your covered topics</a>, or turn off the covered-content filter to browse them.</p>
          </details>`
        : ''}`;
  }

  // ───────────────────────────────── drawing ─────────────────────────────────

  // Preserve disclosure/search/scroll state when filter controls are rebuilt.
  // These are view preferences, not curriculum coverage or search criteria.
  function controlSnapshot() {
    const root = $('[data-controls]', element);
    if (!root) return null;
    return {
      details: new Map([...root.querySelectorAll('details')].map((node) => [node.dataset.topic || node.dataset.section || node.querySelector(':scope > summary')?.textContent.trim(), node.open])),
      treeSearch: root.querySelector('[data-tree-search]')?.value || '',
      treeScroll: root.querySelector('[data-tree]')?.scrollTop || 0,
    };
  }

  function restoreControls(snapshot) {
    if (!snapshot) return;
    const root = $('[data-controls]', element);
    root.querySelectorAll('details').forEach((node) => {
      const key = node.dataset.topic || node.dataset.section || node.querySelector(':scope > summary')?.textContent.trim();
      if (snapshot.details.has(key)) node.open = snapshot.details.get(key);
    });
    const search = root.querySelector('[data-tree-search]');
    if (search && snapshot.treeSearch) {
      search.value = snapshot.treeSearch;
      search.dispatchEvent(new Event('input', { bubbles: true }));
    }
    const tree = root.querySelector('[data-tree]');
    if (tree) tree.scrollTop = snapshot.treeScroll;
  }

  // Answer box below short questions and beside long ones, each question sized to fit the
  // screen (js/ui/question-fit.js).
  function fitOpenQuestions() {
    if (window.matchMedia('(any-pointer: coarse)').matches) return;
    for (const grid of element.querySelectorAll('.qsplit[data-qfit]')) {
      placeQuestion(grid, {
        body: grid.querySelector('.qsplit__main'),
        card: grid.querySelector('.qsplit__main'),
        side: grid.querySelector('.qsplit__side'),
        available: () => window.innerHeight - 110,
      });
    }
  }

  function draw() {
    disposeInkEditors();
    if (timed()) {
      const { matches, locked } = filterQuestions(scopedPool(), criteria(), engineContext);
      setHtml(
        $('[data-body]', element),
        html`<div class="split split--wide-aside">
          <div data-controls>${builderControls(testEntries(matches, pool, bundle.questionsById))}</div>
          <aside class="sticky" data-output>${testPreview(matches, collapseLocked(locked, bundle.questionsById).length)}</aside>
        </div>`,
      );
    } else {
      const base = filterQuestions(scopedPool(), criteria(), engineContext).matches;
      setHtml(
        $('[data-body]', element),
        html`<div class="browser">
          <section data-controls aria-label="Question filters">${browserFilters(base)}</section>
          <section class="stack" data-output aria-label="Question results">${browserResults()}</section>
        </div>`,
      );
    }
    mountTree();
    // The selector resolves saved year/chapter mappings on mount; apply them to the
    // result list immediately, without remounting the controls.
    if (timed()) {
      const { matches, locked } = filterQuestions(scopedPool(), criteria(), engineContext);
      setHtml($('[data-output]', element), testPreview(matches, collapseLocked(locked, bundle.questionsById).length));
    } else {
      setHtml($('[data-output]', element), browserResults());
    }
    void mountInkEditors();
  }

  /** Re-renders after a filter change. The topic tree keeps its own state, so only the rest redraws. */
  function update({ keepControls = false, resetControls = false } = {}) {
    disposeInkEditors();
    const controls = resetControls ? null : controlSnapshot();
    const scroll = window.scrollY;
    const active = document.activeElement;
    const focusKeys = ['open', 'scheme', 'report', 'saveMark', 'reattempt', 'undo', 'select', 'removeSelected', 'filter', 'flag', 'topicOrganisation', 'topicCoverage', 'multi', 'progress', 'sort', 'resetFilters', 'clearGroup', 'removeFocus', 'toggleTree', 'shuffleQuestions'];
    const key = focusKeys.find((name) => active?.dataset?.[name] !== undefined);
    const value = key ? active.dataset[key] : null;
    const restore = () => {
      if (key) {
        const attribute = key.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
        element.querySelector(`[data-${attribute}="${CSS.escape(value)}"]${key === 'multi' ? `[data-value="${CSS.escape(active.dataset.value)}"]` : ''}`)?.focus({ preventScroll: true });
      }
      window.scrollTo(0, scroll);
    };
    if (keepControls) {
      if (timed()) {
        const { matches, locked } = filterQuestions(scopedPool(), criteria(), engineContext);
        setHtml($('[data-output]', element), testPreview(matches, collapseLocked(locked, bundle.questionsById).length));
      } else {
        setHtml($('[data-output]', element), browserResults());
      }
      const summary = $('[data-focus-summary]', element);
      if (summary) summary.textContent = focusSummary(!timed());
      const points = $('[data-selected-points]', element);
      if (points) setHtml(points, selectedPoints());
      const focusReset = $('[data-focus-reset]', element);
      if (focusReset) focusReset.hidden = state.focus === null;
      if (!timed()) {
        const order = $('[data-sort]', element);
        if (order) order.value = state.shuffled ? '' : state.sort;
        const base = filterQuestions(scopedPool(), criteria(), engineContext).matches;
        for (const button of element.querySelectorAll('[data-multi="difficulties"], [data-multi="bands"]')) {
          const band = bandOptions.find((item) => item.id === button.dataset.value);
          const count = base.filter((question) => button.dataset.multi === 'difficulties'
            ? question.difficulty === button.dataset.value : question.marks >= band.min && question.marks <= band.max).length;
          $('.chip__count', button).textContent = count;
        }
      }
      restoreControls(controls);
      restore();
      fitOpenQuestions();
      void mountInkEditors();
      return;
    }
    draw();
    restoreControls(controls);
    restore();
    fitOpenQuestions();
    void mountInkEditors();
  }

  // The Tier control: saved tier by default, the other tier or both tiers on purpose.
  function tierBar() {
    const options = [...subject.tiers.map((tier) => [tier, tier]), ['', 'Both tiers']];
    return html`<div class="tier-switch" data-tier-bar>
      <span class="tier-switch__label" id="practice-tier-label">Tier</span>
      <div class="seg" role="radiogroup" aria-labelledby="practice-tier-label">
        ${options.map(([value, label]) => html`<button type="button" class="seg__opt" role="radio" aria-checked="${(state.tier || '') === value}" tabindex="${(state.tier || '') === value ? 0 : -1}" data-practice-tier="${value}">${label}</button>`)}
      </div>
      <span class="small muted tier-switch__note">${!user
        ? (state.tier ? `Showing ${state.tier} papers.` : 'Showing both tiers.')
        : savedSubjectTier ? (state.tier || '') === savedSubjectTier ? `Your saved tier. Questions and tests use ${savedSubjectTier} papers.` : `Your saved tier is ${savedSubjectTier}. This switch lasts for this tab.`
          : 'No tier saved. Choose one in the subject’s settings to start on it.'}</span>
    </div>`;
  }

  // The Science control (Combined Science): all three sciences, or one of them.
  function scienceBar() {
    const options = [['', 'All three'], ...sciences.map((name) => [name, name])];
    return html`<div class="tier-switch science-switch" data-science-bar>
      <span class="tier-switch__label" id="practice-science-label">Science</span>
      <div class="seg" role="radiogroup" aria-labelledby="practice-science-label">
        ${options.map(([value, label]) => html`<button type="button" class="seg__opt" role="radio" aria-checked="${state.science === value}" tabindex="${state.science === value ? 0 : -1}" data-practice-science="${value}">${label}</button>`)}
      </div>
      <span class="small muted tier-switch__note">${state.science
        ? `Only ${state.science} topics, questions and papers.`
        : 'Biology, chemistry and physics questions together.'}</span>
    </div>`;
  }

  tintPage(subject);
  setHtml(
    element,
    html`${head(subject.subject)}
      ${!user ? html`<p><a class="btn btn--sm" href="${links.subjects({ browse: 1, subject: subjectId, mode, tier: state.tier || (linkedBothTiers ? 'both' : null) })}">Choose another subject</a></p>` : ''}
      ${!user ? banner(html`Browsing and filters are free. Guest typed answers and marks last until you refresh or close this page. Handwriting is stored in this browser on this device and will not sync across devices. <a href="${links.signup('/practice')}">Create a free account</a> to save your progress.`) : ''}
      ${suppressedParents ? banner(html`${plural(suppressedParents, 'full question')} ${suppressedParents === 1 ? 'is represented by its' : 'are represented by their'} available parts to avoid counting the same content twice.`) : ''}
      <div class="stack stack--lg" style="${scStyle(subject)}">
        ${subjectPills(subjects, subjectId, switchSubject)}
        ${tiered ? tierBar() : ''}
        ${sciences.length ? scienceBar() : ''}
        ${moduleScopeBanner(bundle)}
        <div class="row" data-practice-modes>
          ${modes.length > 1
            ? html`<div class="seg mode-switch" role="tablist" aria-label="Practice mode">
                ${[...modes].sort((a, b) => (a === 'timed_test') - (b === 'timed_test')).map(
                  (mode) =>
                    html`<button type="button" role="tab" class="seg__opt" aria-selected="${state.mode === mode}" tabindex="${state.mode === mode ? 0 : -1}" id="practice-mode-${mode}" aria-controls="practice-mode-panel" data-mode="${mode}" title="${PRACTICE_MODES[mode].blurb}">
                      ${mode === 'timed_test' ? 'Build a test' : 'Individual questions'}
                    </button>`,
                )}
              </div>`
            : html`<p class="muted"><strong>${PRACTICE_MODES[modes[0]].label}.</strong> ${PRACTICE_MODES[modes[0]].blurb}</p>`}
          ${exportedTestsLink()}
        </div>
        <div data-body id="practice-mode-panel" ${modes.length > 1 ? html`role="tabpanel" aria-labelledby="practice-mode-${state.mode}"` : ''}></div>
      </div>`,
  );
  draw();
  if (choiceFocus?.subjectId === subjectId) $(choiceFocus.selector, element)?.focus({ preventScroll: true });
  if (context.query.filters === 'topics') {
    const topics = $('[data-section="fpop-topics"]', element);
    if (topics) {
      topics.open = true;
      requestAnimationFrame(() => topics.scrollIntoView({ block: 'nearest' }));
    }
  }
  fitOpenQuestions();
  const onResize = debounce(() => { if (element.isConnected) fitOpenQuestions(); else window.removeEventListener('resize', onResize); }, 250);
  window.addEventListener('resize', onResize);

  // ───────────────────────────────── events ─────────────────────────────────

  const change = (mutate, options) => {
    mutate();
    if (!options?.keepPage) state.page = 1;
    save();
    update(options);
  };

  // Filter bar: one dropdown open at a time; a click outside or Escape closes it.
  element.addEventListener('toggle', (event) => {
    const opened = event.target;
    if (opened.matches?.('[data-test-preview][open]')) {
      const question = currentTest?.questions[Number(opened.dataset.testPreview)];
      const body = $('[data-test-preview-body]', opened);
      if (question && !body.hasChildNodes()) {
        setHtml(body, html`<p class="small muted">${question.is_linked_group ? linkedRef(question, bundle.papersById) : questionRef(question, bundle.papersById)}</p>
          ${question.is_linked_group
            ? html`${linkedIntro(question)}${question.parts.map(part => linkedPartBody(part))}`
            : questionBody(question)}`);
      }
    }
    if (!opened.matches?.('.fpop') || !opened.open) return;
    for (const other of element.querySelectorAll('.fpop[open]')) if (other !== opened) other.open = false;
  }, true);
  on(element, 'click', '.fpop__btn', (event, summary) => {
    for (const other of element.querySelectorAll('.fpop[open]')) if (other !== summary.parentElement) other.open = false;
  });
  const closePops = (event) => {
    if (!element.isConnected) { document.removeEventListener('click', closePops); document.removeEventListener('keydown', closePops); return; }
    if (event.type === 'keydown' && event.key !== 'Escape') return;
    if (event.type === 'click' && event.target.closest?.('.fbar')) return;
    for (const pop of element.querySelectorAll('.fpop[open]')) pop.open = false;
  };
  document.addEventListener('click', closePops);
  document.addEventListener('keydown', closePops);

  const choiceButtons = '[data-practice-tier], [data-practice-science], [data-mode]';
  on(element, 'keydown', choiceButtons, (event, button) => {
    const choices = [...button.parentElement.querySelectorAll(choiceButtons)];
    const current = choices.indexOf(button);
    const radio = button.getAttribute('role') === 'radio';
    let next;
    if (event.key === 'Home') next = choices[0];
    else if (event.key === 'End') next = choices.at(-1);
    else if (event.key === 'ArrowRight' || (radio && event.key === 'ArrowDown')) next = choices[(current + 1) % choices.length];
    else if (event.key === 'ArrowLeft' || (radio && event.key === 'ArrowUp')) next = choices[(current - 1 + choices.length) % choices.length];
    if (!next) return;
    event.preventDefault();
    if (next === button) return;
    next.focus();
    next.click();
  });
  const keepChoiceFocus = (event, attribute, value) => {
    if (event.detail === 0) pendingChoiceFocus = { subjectId, selector: `[data-${attribute}="${CSS.escape(value)}"]` };
  };

  on(element, 'click', '[data-practice-tier]', (event, button) => {
    const tier = button.dataset.practiceTier === '' ? '' : validTier(subject, button.dataset.practiceTier);
    if (tier === null || tier === (state.tier || '')) return;
    keepChoiceFocus(event, 'practice-tier', tier);
    // A tab-only switch: the saved tier is unchanged. A test already running keeps its questions.
    if (user) writeTierOverride(tier === tierPref ? null : tier);
    state.tier = tier;
    state.page = 1;
    state.paper = '';
    state.testFocusVersion = 0; // the topic list is seeded again for the new tier
    save();
    if (!user) return context.navigate(routeOf(links.practice({ ...context.query, subject: subjectId, mode: state.mode, tier: tier || 'both' })), { replace: true });
    context.refresh();
  });
  on(element, 'click', '[data-practice-science]', (event, button) => {
    const science = validScience(subject, button.dataset.practiceScience) || '';
    if (science === state.science) return;
    keepChoiceFocus(event, 'practice-science', science);
    state.science = science;
    state.page = 1;
    state.paper = '';
    state.testFocusVersion = 0; // the test's topic list is seeded again for the new science
    save();
    context.refresh();
  });
  on(element, 'click', '[data-mode]', (event, button) => {
    const mode = button.dataset.mode;
    if (mode === state.mode) return;
    keepChoiceFocus(event, 'mode', mode);
    save();
    context.navigate(routeOf(links.practice({ ...context.query, subject: subjectId, mode, topic: null, filters: null })), { replace: true });
  });
  on(element, 'change', '[data-filter]', (event, select) => change(() => {
    state[select.dataset.filter] = select.value;
    if (['markMin', 'markMax'].includes(select.dataset.filter)) state.bands = [];
  }));
  on(element, 'click', '[data-range-reset]', () => change(() => { state.rangeFrom = ''; state.rangeTo = ''; }));
  on(element, 'click', '[data-reset-filters]', () => change(() => {
    const kept = {
      mode: state.mode, science: state.science, topicOrganisation: state.topicOrganisation,
      selected: state.selected, drafts: state.drafts, goes: state.goes,
      closedQuestions: state.closedQuestions, schemeQuestions: state.schemeQuestions,
      reportQuestions: state.reportQuestions, contextQuestions: state.contextQuestions,
      referenceQuestions: state.referenceQuestions,
      inkOpen: state.inkOpen, inkAttempts: state.inkAttempts,
      inkGroups: state.inkGroups, inkSaved: state.inkSaved,
    };
    state = { ...defaults(), ...kept, tier: tierPref, tierPref };
    if (tiered && (readTierOverride() ?? tierPref) !== tierPref) {
      // Reset returns to the saved tier; its spec points need the page drawn again.
      writeTierOverride(null);
      seedTestFocus();
      save();
      context.refresh();
      return;
    }
    seedTestFocus();
  }, { resetControls: true }));
  on(element, 'click', '[data-clear-chip]', (event, button) => change(() => {
    const key = button.dataset.clearChip;
    if (key === 'markRange') { state.markMin = ''; state.markMax = ''; }
    else if (key === 'focus') state.focus = null;
    else if (key === 'textbookFocus') state.textbookFocus = null;
    else if (key === 'range') { state.rangeFrom = ''; state.rangeTo = ''; }
    else if (key === 'learnedOnly') state.learnedOnly = false;
    else if (key === 'sampleMode') state[key] = 'all';
    else if (key === 'difficulties' || key === 'bands' || key === 'years' || key === 'markStatuses' || key === 'qualifications') state[key] = state[key].filter((value) => value !== button.dataset.chipValue);
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
  on(element, 'click', '[data-clear-group]', (event, button) => change(() => (state[button.dataset.clearGroup] = [])));
  on(element, 'click', '[data-remove-focus]', (event, button) => change(() => (state[focusKey()] = manualFocus().filter(id => id !== button.dataset.removeFocus))));
  on(element, 'change', '[data-topic-organisation]', (event, input) => change(() => { state.topicOrganisation = input.value; }));
  on(element, 'change', '[data-topic-coverage]', (event, input) => change(() => { state.selectionMode = input.value; }));
  on(element, 'click', '[data-multi]', (event, button) => change(() => {
    state[button.dataset.multi] = toggle(state[button.dataset.multi], button.dataset.value);
    if (button.dataset.multi === 'bands') { state.markMin = ''; state.markMax = ''; }
  }));
  on(element, 'change', '[data-progress]', (event, box) => change(() => {
    state.markStatuses = toggle(state.markStatuses, box.dataset.progress);
  }));
  on(element, 'change', '[data-covered]', (event, box) => change(() => {
    state.learnedOnly = box.checked;
    if (timed()) seedTestFocus();
    else { state.focus = null; state.textbookFocus = null; }
  }));
  on(element, 'change', '[data-flag]', (event, box) =>
    change(() => (state[box.dataset.flag] = box.checked), { keepControls: box.dataset.flag === 'stopwatch' || box.dataset.flag === 'preferUnseen' || box.dataset.flag === 'prioritiseWeak', keepPage: box.dataset.flag === 'stopwatch' }),
  );
  on(element, 'click', '[data-shuffle]', () => change(() => (state.seed = Math.floor(Math.random() * 1e9)), { keepControls: true }));
  on(element, 'click', '[data-toggle-tree]', () => change(() => (state.showTree = !state.showTree)));
  on(element, 'click', '[data-focus-reset]', () => change(() => (state[focusKey()] = null)));
  on(element, 'click', '[data-focus-clear]', () => change(() => { state[focusKey()] = []; state.showTree = true; }));
  on(element, 'click', '[data-text]', (event, button) =>
    change(() => {
      const next = toggle(state.focus || [], button.dataset.text);
      state.focus = next.length ? next : null;
    }),
  );
  on(element, 'change', '[data-sort]', (event, select) => change(() => { state.sort = select.value; state.shuffled = false; }, { keepControls: true }));
  on(
    element,
    'input',
    '[data-search]',
    debounce((event, input) => {
      state.search = input.value;
      state.page = 1;
      save();
      update({ keepControls: true });
      // Only results redraw, so the search input keeps its caret and focus.
    }, 300),
  );
  on(element, 'change', '[data-select]', (event, box) => change(() => {
    const question = entryOf(box.dataset.select);
    if (!box.checked) { state.selected = state.selected.filter((id) => id !== question.question_id); return; }
    // A full parent and one of its parts must not both contribute marks.
    const conflicts = state.selected.filter((id) => {
      const existing = entryOf(id);
      if (!existing) return false;
      // A linked group and one of its own parts must not both be in the set.
      const existingParts = new Set(existing.part_ids || [id]);
      if ((question.part_ids || [question.question_id]).some((partId) => existingParts.has(partId))) return true;
      return existing.question_id === question.parent_question_id || existing.parent_question_id === question.question_id;
    });
    const retained = state.selected.filter((id) => !conflicts.includes(id) && id !== question.question_id);
    if (retained.length >= LIMITS.questionSetMax) {
      toast(`A set can contain up to ${LIMITS.questionSetMax} questions. Remove one before adding another.`, { type: 'error' });
      return;
    }
    state.selected = [...retained, question.question_id];
    if (conflicts.length) toast('Removed the overlapping question from the set.', { type: 'success' });
  }, { keepControls: true, keepPage: true }));
  on(element, 'click', '[data-remove-selected]', (event, button) => change(() => (state.selected = state.selected.filter((id) => id !== button.dataset.removeSelected)), { keepControls: true, keepPage: true }));
  on(element, 'click', '[data-clear-selection]', () => change(() => (state.selected = []), { keepControls: true, keepPage: true }));
  on(element, 'click', '[data-open]', (event, button) => change(() => {
    state.closedQuestions = toggle(state.closedQuestions, button.dataset.open);
  }, { keepControls: true, keepPage: true }));
  on(element, 'click', '[data-scheme]', (event, button) => change(() => (state.schemeQuestions = toggle(state.schemeQuestions, button.dataset.scheme)), { keepControls: true, keepPage: true }));
  // The report is independent of the mark scheme: it stays open under whichever is showing.
  on(element, 'click', '[data-report]', (event, button) => {
    const id = button.dataset.report;
    const opening = !state.reportQuestions.includes(id);
    change(() => (state.reportQuestions = toggle(state.reportQuestions, id)), { keepControls: true, keepPage: true });
    if (opening) revealPanel(element, id);
  });
  element.addEventListener('toggle', (event) => {
    const id = event.target?.dataset?.questionContext || event.target?.dataset?.questionReferences;
    if (!id) return;
    const key = event.target.dataset.questionReferences ? 'referenceQuestions' : 'contextQuestions';
    const selected = new Set(state[key]);
    if (event.target.open) selected.add(id); else selected.delete(id);
    state[key] = [...selected];
    save();
  }, true);
  on(element, 'click', '[data-shuffle-questions]', () => change(() => {
    state.shuffled = true;
    state.seed = Math.floor(Math.random() * 1e9);
  }, { keepControls: true }));
  on(element, 'input', '[data-answer]', (event, input) => {
    (state.drafts[partStateKey(cardOf(input), input.dataset.answer)] ||= {}).answer = input.value;
    save();
  });
  function setWritingMode(button, open, pencil = null) {
    const partId = button.dataset.inkPart;
    const cardId = button.dataset.inkCard;
    const key = partStateKey(cardId, partId);
    const target = button.parentElement.querySelector('[data-ink-target]');
    const typedField = button.closest('.qsplit__side').querySelector('.qsplit__answerfield');
    target.style.minBlockSize = open ? `${typedField.offsetHeight}px` : '';
    state.inkOpen[key] = open;
    typedField.hidden = open;
    target.hidden = !open;
    button.setAttribute('aria-expanded', String(open));
    button.textContent = open ? 'Use keyboard' : 'Write with Pencil';
    if (open) {
      autoGo(cardId);
      if (pencil) pencilTransfers.set(target, pencil);
      target.textContent = 'Opening handwriting…';
      void mountInkEditors([target]);
    } else {
      pencilTransfers.get(target)?.cancel();
      pencilTransfers.delete(target);
      inkEditors.get(key)?.destroy();
      inkEditors.delete(key);
      inkConflictPreviews.get(key)?.forEach(preview => preview.destroy());
      inkConflictPreviews.delete(key);
      target.replaceChildren();
    }
    save();
  }
  on(element, 'click', '[data-ink-toggle]', (event, button) => {
    const key = partStateKey(button.dataset.inkCard, button.dataset.inkPart);
    setWritingMode(button, !state.inkOpen[key]);
  });
  on(element, 'pointerdown', 'textarea[data-answer]', (event, input) => {
    if (event.pointerType !== 'pen' || event.button !== 0) return;
    const button = input.closest('.qsplit__side')?.querySelector('[data-ink-toggle]');
    if (button) setWritingMode(button, true, transferPencilStroke(event, element));
  });
  on(element, 'click', '[data-ink-save]', async (event, button) => {
    const partId = button.dataset.inkSave;
    const cardId = cardOf(button);
    const key = partStateKey(cardId, partId);
    const question = bundle.questionsById.get(partId);
    if (!question || !cardId) return;
    const sections = inkEditors.get(key)?.getValue().sections || [];
    if (!sections.some(section => section.strokes.length)) {
      toast('Write something before saving a handwritten answer.', { type: 'info' });
      return;
    }
    button.disabled = true;
    const inkTarget = button.closest('[data-ink-target]');
    inkTarget?.querySelectorAll('.ink-editor__toolbar button, .ink-editor__toolbar input, .ink-editor__add-space, .ink-editor__canvas').forEach((control) => {
      control.disabled = true;
      control.style.pointerEvents = 'none';
    });
    const responseId = activeInkResponseId(cardId, partId);
    const valueKey = inkKey(responseId, partId);
    const editor = inkEditors.get(key);
    try {
      await inkSaveChains.get(valueKey)?.catch(() => {});
      const record = {
        ...(inkValues.get(valueKey) || editor?.getValue() || {}),
        schemaVersion: 1,
        ownerId: api.inkRepository().ownerId,
        responseId,
        partId,
        revision: inkRevisions.get(valueKey) || inkValues.get(valueKey)?.revision || 1,
        status: 'saved',
        sections: editor?.getValue().sections || inkValues.get(valueKey)?.sections || [],
        updatedAt: new Date().toISOString(),
      };
      const savedRecord = await api.inkRepository().save(record);
      if (savedRecord.conflict) {
        inkValues.delete(valueKey);
        inkRevisions.delete(valueKey);
        update({ keepControls: true, keepPage: true });
        toast('This answer changed in another tab. Choose which version to keep.', { type: 'info' });
        return;
      }
      await api.saveAnswerUnmarked(question, answerOf(cardId, partId), {
        attemptId: responseId,
        groupAttemptId: groupAttemptIdFor(cardId),
        hasInk: true,
      });
      inkValues.set(valueKey, savedRecord);
      inkRevisions.set(valueKey, savedRecord.revision);
      state.inkSaved[valueKey] = true;
      save();
      const synced = await api.syncInk().catch(() => false);
      editor?.setSaveState(synced ? 'Saved and synced' : 'Saved on this device');
      if (!synced && api.isSignedIn()) {
        const latest = await api.loadInkState(responseId, partId);
        if (latest.conflicts?.length) update({ keepControls: true, keepPage: true });
      }
      button.textContent = 'Answer saved';
      toast('Your handwritten answer is saved and ready to mark.', { type: 'success' });
    } catch (error) {
      editor?.setSaveState('Could not save · Try again');
      toast(error?.message || 'Could not save this handwritten answer.', { type: 'error' });
    } finally {
      button.disabled = false;
      inkTarget?.querySelectorAll('.ink-editor__toolbar button, .ink-editor__toolbar input, .ink-editor__add-space, .ink-editor__canvas').forEach((control) => {
        control.disabled = false;
        control.style.pointerEvents = '';
      });
    }
  });
  bindMarkPickers(element);
  on(element, 'input', '[data-mark]', (event, input) => {
    (state.drafts[partStateKey(cardOf(input), input.dataset.mark)] ||= {}).mark = input.value;
    save();
  });
  const refreshLatest = () => {
    latest.clear();
    for (const [id, attempt] of latestByQuestion(api.getProgress().question_attempts)) latest.set(id, attempt);
    waiting.clear();
    if (user) for (const [id, entry] of api.savedAnswers()) waiting.set(id, entry);
  };
  const pendingMarks = new Set();
  const redraw = () => { save(); refreshLatest(); update({ keepControls: true, keepPage: true }); };

  /** "You've done this question before": change an earlier go, or start a new one. */
  let choosing = false;
  async function chooseGo(cardId) {
    if (choosing) return false;
    choosing = true;
    try {
      const options = goOptions(cardId);
      const parts = partsOf(cardId);
      const answerText = (option) => {
        const texts = parts.map((part) => option.parts.get(part.question_id)?.answer || '').filter((text) => text.trim());
        const joined = texts.join(' · ');
        return joined ? (joined.length > 140 ? `${joined.slice(0, 140)}…` : joined) : 'No typed answer (done on paper)';
      };
      const choice = await openModal({
        title: 'You’ve done this question before',
        body: html`<p>Do you want to change one of your answers, or start a new attempt? Every attempt is kept.</p>
          <div class="golist" role="radiogroup" aria-label="Your attempts">
            ${options.map((option, index) => html`<label class="golist__item">
              <input type="radio" name="go" value="${option.key}" ${index === 0 ? 'checked' : ''} />
              <span class="golist__body"><span class="golist__head"><b>${whenLabel(option.when)}</b> ${goScore(option)}</span>
              <span class="golist__answer small muted">${answerText(option)}</span></span>
            </label>`)}
          </div>`,
        actions: [
          { label: 'Change this answer', collect: (dialog) => dialog.querySelector('input[name="go"]:checked')?.value || null },
          { label: 'Start a new attempt', value: 'new', variant: 'primary' },
        ],
      });
      if (!choice) return false;
      state.goes[cardId] = choice;
      if (choice === 'new') {
        delete state.inkAttempts[cardId];
        delete state.inkGroups[cardId];
        try { localStorage.setItem(inkIdentityKey, JSON.stringify({ attempts: state.inkAttempts, groups: state.inkGroups })); } catch { /* session state still has the new go */ }
      }
      const go = choice === 'new' ? null : options.find((option) => option.key === choice);
      for (const part of parts) {
        const draft = (state.drafts[partStateKey(cardId, part.question_id)] ||= {});
        const attempt = go?.parts.get(part.question_id);
        draft.answer = attempt?.answer || (go ? '' : draft.answer || '');
        if (attempt && !attempt.waiting) draft.mark = String(attempt.marks_awarded);
        else delete draft.mark;
      }
      return true;
    } finally {
      choosing = false;
    }
  }
  // Re-trying a question done before starts a new attempt without asking; "Switch" on the goline
  // still lets the student change an earlier one instead. Every attempt is kept.
  const autoGo = (cardId) => {
    if (!needsChoice(cardId)) return;
    state.goes[cardId] = 'new';
    delete state.inkAttempts[cardId];
    delete state.inkGroups[cardId];
    try { localStorage.setItem(inkIdentityKey, JSON.stringify({ attempts: state.inkAttempts, groups: state.inkGroups })); } catch { /* current session still has the new go */ }
  };
  on(element, 'focusin', '[data-answer]', (event, input) => {
    const cardId = cardOf(input);
    if (cardId) autoGo(cardId);
  });
  on(element, 'click', '[data-choose-go]', async (event, button) => {
    if (await chooseGo(button.dataset.chooseGo)) redraw();
  });
  /** Before saving, a question done before must have its go chosen. Returns true to carry on. */
  const goChosen = async (cardId) => {
    autoGo(cardId);
    return true;
  };
  /** The id a linked question's new go shares across its parts (kept once the go exists). */
  const groupGoId = (cardId) => {
    const go = currentGo(cardId);
    if (go) return go.key.startsWith('at:') ? null : go.key;
    return (state.goes[cardId] = uid('go'));
  };
  const goToSignup = () => {
    save();
    return context.navigate(routeOf(links.signup(routeOf(links.practice({ subject: subjectId })))));
  };

  /** Shows the result in place (no redraw), so the slider's colour and animation are not interrupted. */
  const showSaved = (card, text, canUndo, group = false) => {
    const confirmation = card?.querySelector('[data-mark-confirmation]');
    if (confirmation) { confirmation.hidden = false; confirmation.textContent = text; }
    const undo = card?.querySelector(group ? '[data-undo-group]' : '[data-undo]');
    if (undo) undo.hidden = !canUndo;
    const error = card?.querySelector('[data-mark-error]');
    if (error) error.hidden = true;
  };
  const showError = (card, message) => {
    const error = card?.querySelector('[data-mark-error]');
    if (error) { error.hidden = false; error.textContent = message; }
  };

  // A mark saves as soon as the slider settles: one attempt per question (later moves update it).
  const saveMark = async (id) => {
    const question = bundle.questionsById.get(id);
    const input = element.querySelector(`[data-mark="${CSS.escape(id)}"]`);
    const card = input?.closest('article');
    const value = input?.value ?? state.drafts[id]?.mark;
    if (!question || value == null || value === '') return;
    (state.drafts[id] ||= {}).mark = value;
    if (!Number.isInteger(Number(value)) || Number(value) < 0 || Number(value) > question.marks) return;
    if (!user) { save(); return; }   // guests keep the mark in their draft; the card says how to keep it
    if (pendingMarks.has(id)) { markAgain.add(id); return; }
    autoGo(id);
    pendingMarks.add(id);
    try {
      const attempt = partAttempt(id, id);
      const saved = await api.saveQuestionMark(question, Number(value), { attemptId: attempt?.attempt_id, reattempt: !attempt, answer: answerOf(id) });
      state.goes[id] = saved.attempt_id;
      save();
      refreshLatest();
      showSaved(card, `Saved ${value}/${question.marks}`, true);
    } catch (failure) {
      showError(card, failure.message);
    } finally {
      pendingMarks.delete(id);
      if (markAgain.delete(id) && element.isConnected) saveMark(id);
    }
  };
  const markAgain = new Set();
  const markTimers = new Map();
  const queueSave = (key, task) => {
    clearTimeout(markTimers.get(key));
    markTimers.set(key, setTimeout(() => { markTimers.delete(key); if (element.isConnected) task(); }, 350));
  };
  on(element, 'change', '[data-mark]', (event, input) => {
    const groupId = input.closest('[data-group]')?.dataset.group;
    if (groupId) queueSave(groupId, () => saveGroup(groupId));
    else queueSave(input.dataset.mark, () => saveMark(input.dataset.mark));
  });
  on(element, 'click', '[data-signup]', () => goToSignup());

  // A linked group saves one attempt per part as soon as every part has a mark.
  const saveGroup = async (groupId) => {
    const entry = groupEntry(groupId, bundle.questionsById);
    const card = element.querySelector(`[data-group="${CSS.escape(groupId)}"]`);
    if (!entry || !card) return;
    const values = entry.parts.map((part) => {
      const key = partStateKey(groupId, part.question_id);
      const value = card.querySelector(`[data-mark="${CSS.escape(part.question_id)}"]`)?.value ?? state.drafts[key]?.mark;
      (state.drafts[key] ||= {}).mark = value;
      return value;
    });
    const complete = entry.parts.every((part, index) => {
      const value = values[index];
      return value != null && value !== '' && Number.isInteger(Number(value)) && Number(value) >= 0 && Number(value) <= part.marks;
    });
    if (!complete) return;   // saves once every part has a mark; the running total shows meanwhile
    if (!user) { save(); return; }
    if (pendingMarks.has(groupId)) { markAgain.add(groupId); return; }
    autoGo(groupId);
    pendingMarks.add(groupId);
    try {
      const go = currentGo(groupId);
      const shared = groupGoId(groupId);
      for (const [index, part] of entry.parts.entries()) {
        const attempt = go?.parts.get(part.question_id);
        await api.saveQuestionMark(part, Number(values[index]), { attemptId: attempt?.attempt_id, reattempt: !attempt, answer: answerOf(groupId, part.question_id), groupAttemptId: shared });
      }
      state.goes[groupId] = shared || go.key;
      const total = values.reduce((sum, value) => sum + Number(value), 0);
      save();
      refreshLatest();
      showSaved(card, `Saved ${total}/${entry.marks}`, true, true);
    } catch (failure) {
      showError(card, failure.message);
    } finally {
      pendingMarks.delete(groupId);
      if (markAgain.delete(groupId) && element.isConnected) saveGroup(groupId);
    }
  };
  on(element, 'click', '[data-undo-group]', async (event, button) => {
    const groupId = button.dataset.undoGroup;
    const go = currentGo(groupId);
    for (const part of partsOf(groupId)) {
      const attempt = go?.parts.get(part.question_id);
      if (!attempt || attempt.waiting || (!attempt.inline && !attempt.mark_edits?.length)) continue;
      await api.undoQuestionMark(part.question_id, { attemptId: attempt.attempt_id });
      delete state.drafts[partStateKey(groupId, part.question_id)]?.mark;
    }
    redraw();
    toast('Last mark save undone.', { type: 'success' });
  });
  // The running total follows the mark buttons.
  on(element, 'input', '[data-group] [data-mark]', (event, input) => {
    const card = input.closest('[data-group]');
    const totalEl = card?.querySelector('[data-group-total] b');
    if (!totalEl) return;
    totalEl.textContent = [...card.querySelectorAll('[data-mark]')].reduce((sum, field) => sum + (field.value === '' ? 0 : Number(field.value)), 0);
  });
  on(element, 'click', '[data-undo]', async (event, button) => {
    const id = button.dataset.undo;
    await api.undoQuestionMark(id, { attemptId: partAttempt(id, id)?.attempt_id });
    delete state.drafts[id]?.mark;
    redraw();
    toast('Last mark save undone.', { type: 'success' });
  });

  // Next question: close this card and open the one below it. Never asks anything, and a typed
  // answer stays in the draft (state.drafts) whether or not it was marked.
  on(element, 'click', '[data-next]', (event, button) => {
    const cards = [...element.querySelectorAll('article[data-card], article[data-group]')];
    const here = button.closest('article');
    const next = cards[cards.indexOf(here) + 1];
    const id = button.dataset.next;
    const nextId = next?.dataset.card || next?.dataset.group;
    change(() => {
      if (!state.closedQuestions.includes(id)) state.closedQuestions.push(id);
      state.schemeQuestions = state.schemeQuestions.filter((item) => item !== id);
      if (nextId) state.closedQuestions = state.closedQuestions.filter((item) => item !== nextId);
    }, { keepControls: true, keepPage: true });
    if (nextId) requestAnimationFrame(() => element.querySelector(`[data-card="${CSS.escape(nextId)}"], [data-group="${CSS.escape(nextId)}"]`)?.scrollIntoView({ block: 'start', behavior: 'smooth' }));
    else toast('That was the last question in this list.', { type: 'info' });
  });

  on(element, 'click', '[data-export-test]', async (event, button) => {
    const built = button.dataset.exportTest === 'built';
    const ids = built ? currentTest?.question_ids : state.selected;
    if (!ids?.length) return;
    const title = built ? `Custom ${fmtMinutes(currentTest.time_limit_minutes)} test · ${subject.subject}` : `Question set · ${subject.subject}`;
    button.disabled = true;
    try {
      const snapshot = createTestSnapshot({ bundle, ids, title });
      const { offerTestPdf } = await import('../test-pdf.js?v=20261122-pdf2');
      await offerTestPdf({
        snapshot, questions: resolveTestSnapshot(snapshot, bundle), existing: Boolean(api.getCustomTest(snapshot.id)),
      });
    } catch (error) {
      toast(error.message, { type: 'error' });
    } finally {
      button.disabled = false;
      const exportedTests = $('[data-exported-tests]', element);
      if (exportedTests && element.isConnected) {
        exportedTests.hidden = !hasExports();
      }
    }
  });

  on(element, 'click', '[data-start-set]', async () => {
    // A linked group starts as all of its parts, together and in printed order.
    const questions = expandLinkedIds(state.selected.flatMap((id) => entryOf(id)?.part_ids || (entryOf(id) ? [id] : [])), bundle.questionsById)
      .map((id) => bundle.questionsById.get(id)).filter(Boolean);
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
    const minutes = test.time_limit_minutes;
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
    context.navigate(routeOf(links.session(session.session_id)));
  });
}
