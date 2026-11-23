Warning: truncated output (original token count: 9350)
Total output lines: 600

// The Comprehensive Data Hub (PRD 4.4): every question attempt, topic mastery with
// Red / Amber / Green ratings, and paper and test history with grade trends.
// One filter row (subject) scopes every number, chart and table on the page.

import { DIFFICULTIES, GRADE_SCHEMES, LIMITS, PAPER_TYPES, RAG, RAG_LABELS } from '../../config/app.config.js';
import { isEnabled } from '../../config/phases.js';
import { $, html, on, setHtml } from '../../core/dom.js';
import { fmtDate, fmtDayMonth, fmtDuration, fmtRelative, percent, plural, uniq } from '../../core/utils.js';
import * as api from '../../data/api.js';
import { privateStudySummary } from '../../data/study-summary.js';
import { getBundles, specIndex } from '../../data/content-repository.js';
import {
  attemptCounts, byDifficulty, currentStreak, latestByQuestion, masteryByNode, paperHistory, ragFor, scoreOf, totals, weeklyActivity,
} from '../../engine/analytics.js';
import { columnChart, lineChart } from '../charts.js';
import { icon } from '../icons.js';
import { questionRef, questionSnippet } from '../question-view.js';
import { attemptInSubject, loadStudent, startQuestionSet, startSingle } from '../student.js';
import { tintPage } from '../subject-colours.js';
import { confirmDialog, difficultyBadge, emptyState, fmtPercent, groupDot, meter, openModal, pageHead, ragBadge, soonBadge, subjectName, toast } from '../ui.js';
import { bindMarkPickers, markPicker } from '../mark-picker.js';
import { links } from '../../core/links.js';
import { bindInkPreviews, inkPreview } from '../ink-preview.js';

const TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'questions', label: 'Questions' },
  { id: 'topics', label: 'Topics' },
  { id: 'papers', label: 'Papers and tests' },
];

const HISTORY_TYPES = [
  { id: 'all', label: 'All' },
  { id: 'real_past_paper', label: PAPER_TYPES.real_past_paper.plural },
  { id: 'user_custom_test', label: PAPER_TYPES.user_custom_test.plural },
  { id: 'ai_past_paper', label: PAPER_TYPES.ai_past_paper.plural, feature: 'aiPastPapers' },
  { id: 'predicted_paper', label: PAPER_TYPES.predicted_paper.plural, feature: 'predictedPapers' },
];

export async function mount(element, context) {
  context.setTitle('Data Hub');
  const student = await loadStudent();
  const { progress } = student;
  const bundles = new Map(student.bundles);
  // Keep history for subjects that have since been removed from "My subjects".
  const strays = uniq([...progress.question_attempts, ...progress.paper_attempts].map((attempt) => attempt.subject_id).filter(Boolean)).filter((id) => !bundles.has(id));
  for (const [id, bundle] of await getBundles(strays)) bundles.set(id, bundle);
  const subjectOrder = [...bundles.keys()];

  const tab = TABS.some((candidate) => candidate.id === context.query.tab) ? context.query.tab : 'overview';
  const subjectId = bundles.has(context.query.subject) ? context.query.subject : 'all';
  const scope = subjectId === 'all' ? [...bundles.values()] : [bundles.get(subjectId)];
  const href = (next) => {
    const target = { tab, subject: subjectId, ...next };
    return links.hub({ tab: target.tab, subject: target.subject === 'all' ? null : target.subject });
  };

  const attempts = progress.question_attempts.filter((attempt) => scope.some((bundle) => attemptInSubject(attempt, bundle)));
  const latest = latestByQuestion(attempts);
  const latestList = [...latest.values()].sort((a, b) => (a.timestamp < b.timestamp ? 1 : -1));
  // Answers saved to mark later: done, but with no score yet.
  const waitingList = (progress.saved_answers || []).filter((entry) => scope.some((bundle) => attemptInSubject(entry, bundle)))
    .sort((a, b) => (a.updated_at < b.updated_at ? 1 : -1));
  const answeredCount = new Set([...latest.keys(), ...waitingList.map((entry) => entry.question_id)]).size;
  const paperAttempts = paperHistory(progress.paper_attempts, { subjectId: subjectId === 'all' ? null : subjectId });
  const find = (questionId) => {
    for (const bundle of scope) {
      const question = bundle.questionsById.get(questionId);
      if (question) return { question, bundle };
    }
    return null;
  };
  const cleanups = [];

  // ───────────────────────────────── overview ─────────────────────────────────

  function overview() {
    const score = totals(latestList);
    const levels = byDifficulty(latestList).filter((level) => level.count);
    const recent = [...attempts, ...waitingList.map((entry) => ({ ...entry, waiting: true, timestamp: entry.updated_at }))]
      .sort((a, b) => (a.timestamp < b.timestamp ? 1 : -1)).slice(0, 8);
    return html`<div class="stack stack--lg">
      <section class="grid grid--stats" aria-label="Summary">
        <div class="stat ruled"><i class="tape tape--c" aria-hidden="true"></i><span class="stat__label">Questions answered</span><span class="stat__value">${answeredCount}</span><span class="stat__note">${plural(attempts.length, 'marked attempt')}${waitingList.length ? html` · <a href="${links.hub({ tab: 'questions', subject: subjectId === 'all' ? null : subjectId, show: 'waiting' })}">${waitingList.length} not marked yet</a>` : ''}</span></div>
        <div class="stat ruled"><i class="tape tape--c" aria-hidden="true"></i>
          <span class="stat__label">Average score</span><span class="stat__value">${fmtPercent(score.percentage)}</span>
          <span class="stat__note">${score.count ? ragBadge(ragFor(score.percentage)) : 'latest attempt at each question'}</span>
        </div>
        <div class="stat ruled"><i class="tape tape--c" aria-hidden="true"></i><span class="stat__label">Marks earned</span><span class="stat__value">${score.awarded}<span class="stat__of"> / ${score.max}</span></span></div>
        <div class="stat ruled"><i class="tape tape--c" aria-hidden="true"></i><span class="stat__label">Papers and tests</span><span class="stat__value">${paperAttempts.length}</span></div>
        <div class="stat ruled"><i class="tape tape--c" aria-hidden="true"></i><span class="stat__label">Day streak</span><span class="stat__value">${currentStreak(attempts)}</span></div>
      </section>
      <div class="grid grid--2">
        <section class="card ruled tilt-2">
          <i class="tape tape--l" aria-hidden="true"></i>
          <div class="card__head"><h2 class="card__title">Questions answered each week</h2><span class="small muted">Last 8 weeks</span></div>
          <div data-chart="activity"></div>
        </section>
        <section class="card ruled tilt-4">
          <i class="tape tape--c" aria-hidden="true"></i>
          <div class="card__head"><h2 class="card__title">Accuracy by difficulty</h2><span class="small muted">Latest attempt at each question</span></div>
          ${levels.length
            ? html`<div class="meterlist">
                ${levels.map(
                  (level) =>
                    html`<span class="meterlist__name">${level.label}</span>${meter(level.percentage, level.rag, `${level.label}: ${fmtPercent(level.percentage)}`)}
                      <span class="meterlist__value">${fmtPercent(level.percentage)} · ${plural(level.count, 'question')}</span>`,
                )}
              </div>`
            : html`<p class="muted small">Answer some questions to see how you do at each level.</p>`}
        </section>
      </div>
      ${subjectId === 'all' && scope.length > 1
        ? html`<section class="card ruled tilt-1">
          <i class="tape tape--r" aria-hidden="true"></i>
            <div class="card__head"><h2 class="card__title">By subject</h2></div>
            <div class="table-wrap">
              <table class="table">
                <thead><tr><th>Subject</th><th class="num">Questions</th><th>Average score</th><th class="num">Papers and tests</th><th><span class="sr-only">Open</span></th></tr></thead>
                <tbody>
                  ${scope.map((bundle) => {
                    const mine = latestList.filter((attempt) => attemptInSubject(attempt, bundle));
                    const result = totals(mine);
                    return html`<tr>
                      <td>${groupDot(bundle.subject)} <a href="${href({ subject: bundle.subject.subject_id })}">${subjectName(bundle.subject)}</a></td>
                      <td class="num">${mine.length}</td>
                      <td>${mine.length ? ragBadge(ragFor(result.percentage), result.percentage) : html`<span class="muted small">No attempts</span>`}</td>
                      <td class="num">${progress.paper_attempts.filter((attempt) => attempt.subject_id === bundle.subject.subject_id).length}</td>
                      <td class="right"><a class="btn btn--sm btn--ghost" href="${href({ tab: 'topics', subject: bundle.subject.subject_id })}">Topics</a></td>
                    </tr>`;
                  })}
                </tbody>
              </table>
            </div>
          </section>`
        : ''}
      <section class="card ruled tilt-3">
          <i class="tape tape--c" aria-hidden="true"></i>
        <div class="card__head"><h2 class="card__title">Recent activity</h2><a class="small" href="${href({ tab: 'questions' })}">All questions</a></div>
        <ul class="activity">
          ${recent.map((attempt) => {
            const found = find(attempt.question_id);
            return html`<li>
              <span class="small muted nowrap">${fmtRelative(attempt.timestamp)}</span>
              <span class="activity__what">
                ${found ? html`${found.bundle.subject.subject} · ${questionRef(found.question, found.bundle.papersById)}` : 'Question no longer in the bank'}
              </span>
              ${attempt.waiting
                ? html`<span class="tag tag--waiting">${icon('clock', { size: 13 })} Not marked yet</span>`
                : html`${ragBadge(ragFor(scoreOf(attempt)), null, { label: false })}<span class="num small">${attempt.marks_awarded}/${attempt.max_marks}</span>`}
            </li>`;
          })}
        </ul>
      </section>
    </div>`;
  }

  function mountOverviewCharts() {
    const target = $('[data-chart="activity"]', element);
    if (!target) return;
    const weeks = weeklyActivity(attempts, 8);
    cleanups.push(
      columnChart(target, {
        unit: 'questions',
        tableLabel: 'Week starting',
        data: weeks.map((week) => ({
          label: fmtDayMonth(week.start),
          value: week.questions,
          detail: `Week of ${fmtDayMonth(week.start)}${week.max ? ` · ${week.awarded}/${week.max} marks` : ''}`,
        })),
      }),
    );
  }

  // ───────────────────────────────── questions ─────────────────────────────────

  const questionFilters = { status: context.query.show === 'waiting' && waitingList.length ? 'waiting' : 'all', difficulty: 'all' };

  function questionsTable() {
    const counts = attemptCounts(attempts);
    const difficultyOf = (entry) => entry.difficulty ?? find(entry.question_id)?.question.difficulty;
    // A question answered again and saved to mark later shows once, as waiting for its mark.
    const newestWaiting = new Map();
    for (const entry of waitingList) if (!newestWaiting.has(entry.question_id)) newestWaiting.set(entry.question_id, entry);
    const waitingCounts = new Map();
    for (const entry of waitingList) waitingCounts.set(entry.question_id, (waitingCounts.get(entry.question_id) || 0) + 1);
    const all = [
      ...[...newestWaiting.values()].map((entry) => ({ ...entry, waiting: true, timestamp: entry.updated_at, difficulty: difficultyOf(entry) })),
      ...latestList.filter((attempt) => !newestWaiting.has(attempt.question_id)),
    ].sort((a, b) => (a.timestamp < b.timestamp ? 1 : -1));
    const rows = all.filter(
      (attempt) =>
        (questionFilters.status === 'all' || (questionFilters.status === 'waiting' ? attempt.waiting : !attempt.waiting && ragFor(scoreOf(attempt)) === questionFilters.status)) &&
        (questionFilters.difficulty === 'all' || attempt.difficulty === questionFilters.difficulty),
    );
    if (!rows.length) return html`<p class="muted" style="padding:16px 0">No questions match these filters.</p>`;
    return html`<div class="table-wrap">
        <table class="table">
          <thead>
            <tr><th>Question</th><th>Topic</th><th>Difficulty</th><th>Latest score</th><th class="num">Tries</th><th>Last tried</th><th><span class="sr-only">Actions</span></th></tr>
          </thead>
          <tbody>
            ${rows.slice(0, 200).map((attempt) => {
              const found = find(attempt.question_id);
              const score = scoreOf(attempt);
              return html`<tr>
                <td class="qcell">
                  ${found
                    ? html`<span class="small muted">${subjectId === …2850 tokens truncated…   ? html`<a class="btn btn--sm btn--ghost" href="${links.exportedTest(attempt.paper_id, { attempt: attempt.session_id })}">Review ${attempt.score_mode === 'overall' ? 'overall score' : 'question marks'}</a>`
                    : '')
                  : attempt.session_id && api.getSession(attempt.session_id) ? html`<a class="btn btn--sm btn--ghost" href="${links.session(attempt.session_id)}">Review</a>` : ''}
              </td>
            </tr>`;
          })}
        </tbody>
      </table>
    </div>`;
  }

  function papersTab() {
    const schemes = uniq(scope.map((bundle) => GRADE_SCHEMES[bundle.subject.grade_scheme]?.label).filter(Boolean));
    return html`<div class="stack stack--lg">
      <section class="card ruled tilt-3">
          <i class="tape tape--c" aria-hidden="true"></i>
        <div class="card__head"><h2 class="card__title">Scores over time</h2><span class="small muted">Each point is one paper or test</span></div>
        ${paperAttempts.length ? html`<div data-chart="trend"></div>` : html`<p class="muted small">Sit a paper or a timed test and your scores will be plotted here.</p>`}
      </section>
      <section class="card ruled tilt-2">
          <i class="tape tape--l" aria-hidden="true"></i>
        <div class="card__head"><h2 class="card__title">History</h2><a class="btn btn--sm" href="${links.exportedTests()}">Exported tests</a></div>
        <div class="chips" role="group" aria-label="Filter by type" style="margin-bottom:14px">
          ${HISTORY_TYPES.map((type) => {
            const available = !type.feature || isEnabled(type.feature);
            return html`<button type="button" class="chip" data-history="${type.id}" aria-pressed="${historyType === type.id}" ${available ? '' : 'disabled'}>
              ${type.label}${available ? '' : html` ${soonBadge(type.feature)}`}
            </button>`;
          })}
        </div>
        <div data-history-table>${historyTable()}</div>
        <p class="small muted" style="margin-top:12px">Grades are indicative (${schemes.join(', ')}): real boundaries change with every paper and series.</p>
      </section>
    </div>`;
  }

  function mountTrendChart() {
    const target = $('[data-chart="trend"]', element);
    if (!target) return;
    const series = [];
    for (const [id, bundle] of bundles) {
      const points = paperAttempts
        .filter((attempt) => attempt.subject_id === id)
        .sort((a, b) => (a.timestamp < b.timestamp ? -1 : 1))
        .map((attempt) => ({ t: attempt.timestamp, value: attempt.percentage, title: attempt.title }));
      // The colour slot is fixed by the subject's position in the student's list, so a
      // subject keeps its colour whatever the filter shows.
      if (points.length) series.push({ name: bundle.subject.subject, slot: Math.min(8, subjectOrder.indexOf(id) + 1), points });
    }
    if (series.length) cleanups.push(lineChart(target, { series: series.slice(0, 8) }));
  }

  // ───────────────────────────────── page ─────────────────────────────────

  const hasData = api.exportedTests().length || progress.question_attempts.length > 0 || progress.paper_attempts.length > 0 || (progress.saved_answers || []).length > 0;
  const body = !hasData
    ? emptyState({
        iconName: 'chart',
        title: 'Your Data Hub fills up as you practise',
        text: 'Answer questions, sit a paper or build a timed test. Every mark is logged here by question, topic and paper.',
        action: html`<a class="btn btn--primary" href="${links.practice()}">Start practising</a>`,
      })
    : tab === 'questions'
      ? questionsTab()
      : tab === 'topics'
        ? topicsTab()
        : tab === 'papers'
          ? papersTab()
          : overview();

  tintPage(subjectId === 'all' ? null : bundles.get(subjectId).subject);
  setHtml(
    element,
    html`${pageHead({
        title: 'Data Hub',
        sub: 'everything you’ve done, in one place: questions, topics, papers and tests',
        crumbs: [{ label: 'Home', href: links.home() }, { label: 'Data Hub', href: links.hub() }, ...(subjectId === 'all' ? [] : [{ label: bundles.get(subjectId).subject.subject }])],
      })}
      <div data-study-summary-link hidden></div>
      <nav class="chips subject-pills" aria-label="Subject">
        <a class="chip ${subjectId === 'all' ? 'is-on' : ''}" href="${href({ subject: 'all' })}" aria-current="${subjectId === 'all' ? 'true' : 'false'}">All subjects</a>
        ${[...bundles.values()].map(
          (bundle) =>
            html`<a class="chip ${bundle.subject.subject_id === subjectId ? 'is-on' : ''}" href="${href({ subject: bundle.subject.subject_id })}" aria-current="${bundle.subject.subject_id === subjectId ? 'true' : 'false'}">${groupDot(bundle.subject)}${bundle.subject.subject}</a>`,
        )}
      </nav>
      <nav class="seg hub-tabs" aria-label="Data Hub sections">
        ${TABS.map((item) => html`<a class="seg__opt ${item.id === tab ? 'is-on' : ''}" href="${href({ tab: item.id })}" aria-current="${item.id === tab ? 'page' : 'false'}">${item.label}</a>`)}
      </nav>
      ${body}`,
  );
  const cloudAccount = api.cloudAccountId();
  if (cloudAccount) {
    privateStudySummary({ accessOnly: true }).then((allowed) => {
      if (allowed !== true || api.cloudAccountId() !== cloudAccount || !element.isConnected) return;
      const slot = $('[data-study-summary-link]', element);
      setHtml(slot, html`<a class="btn btn--sm" href="${links.studySummary()}">My study summary</a>`);
      slot.hidden = false;
    }).catch(() => {});
  }
  if (hasData && tab === 'overview') mountOverviewCharts();
  if (hasData && tab === 'papers') mountTrendChart();

  on(element, 'click', '[data-qfilter]', (event, button) => {
    questionFilters[button.dataset.qfilter] = button.dataset.value;
    for (const chip of element.querySelectorAll(`[data-qfilter="${button.dataset.qfilter}"]`)) chip.setAttribute('aria-pressed', String(chip === button));
    setHtml($('[data-qtable]', element), questionsTable());
  });
  on(element, 'click', '[data-history]', (event, button) => {
    historyType = button.dataset.history;
    for (const chip of element.querySelectorAll('[data-history]')) chip.setAttribute('aria-pressed', String(chip === button));
    setHtml($('[data-history-table]', element), historyTable());
  });
  // Every go at a question, with its answer: change any mark, or mark a go saved for later.
  const reload = () => context.navigate(location.hash.slice(1) || '/hub', { replace: true });
  const clock = (iso) => new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  const whenLabel = (iso) => `${fmtRelative(iso)} at ${clock(iso)}`;
  const markLater = (attemptId) => {
    const entry = (progress.saved_answers || []).find((candidate) => candidate.attempt_id === attemptId);
    const found = entry && find(entry.question_id);
    if (found) startSingle(found.question, context.navigate, { attempts: { [entry.question_id]: entry } });
  };
  async function changeMark(attempt, found) {
    const value = await openModal({
      title: `Change your mark for ${questionRef(found.question, found.bundle.papersById)}`,
      body: html`<p class="small muted">Your attempt from ${whenLabel(attempt.answered_at || attempt.timestamp).toLowerCase()} is marked ${attempt.marks_awarded}/${attempt.max_marks}. Changing it corrects that attempt; your other attempts stay as they are.</p>
        ${attempt.answer ? html`<p class="attempt-answer small">${attempt.answer}</p>` : ''}
        <div style="margin-top:14px">${markPicker({ id: 'change', max: attempt.max_marks, value: attempt.marks_awarded, attr: 'change-mark-value' })}</div>`,
      onOpen: (dialog) => bindMarkPickers(dialog),
      actions: [
        { label: 'Cancel', cancel: true },
        { label: 'Save new mark', variant: 'primary', collect: (dialog) => Number(dialog.querySelector('[data-change-mark-value]').value) },
      ],
    });
    if (value == null || Number.isNaN(value)) return;
    await api.changeQuestionMark(attempt.attempt_id, value);
    toast(`Mark changed to ${value}/${attempt.max_marks}.`, { type: 'success' });
    reload();
  }
  on(element, 'click', '[data-attempts]', async (event, button) => {
    const questionId = button.dataset.attempts;
    const found = find(questionId);
    if (!found) return;
    const list = api.attemptsFor(questionId);
    const picked = await openModal({
      title: `Your attempts at ${questionRef(found.question, found.bundle.papersById)}`,
      wide: true,
      body: html`<p class="small muted">Every attempt is kept with your answer. Your progress uses the newest marked one.</p>
        <ol class="attempt-list-full">
          ${list.map((attempt, index) => html`<li class="attempt-full">
            <div class="attempt-full__head">
              <b>Attempt ${list.length - index}</b><span class="small muted">${whenLabel(attempt.answered_at || attempt.timestamp)}</span>
              ${attempt.waiting
                ? html`<span class="tag tag--waiting">${icon('clock', { size: 13 })} Not marked yet</span>`
                : html`${ragBadge(ragFor(scoreOf(attempt)), null, { label: false })}<span class="num small">${attempt.marks_awarded}/${attempt.max_marks}</span>${attempt.mark_edits?.length ? html`<span class="small muted">(changed)</span>` : ''}`}
              <span class="attempt-full__actions">${attempt.waiting
                ? html`<button type="submit" class="btn btn--sm btn--primary" name="pick" value="mark:${attempt.attempt_id}">Mark it</button>`
                : html`<button type="submit" class="btn btn--sm" name="pick" value="change:${attempt.attempt_id}">Change mark</button>`}
                <button type="submit" class="btn btn--sm btn--ghost attempt-full__remove" name="pick" value="remove:${attempt.attempt_id}" aria-label="Remove attempt ${list.length - index}">${icon('trash', { size: 15 })} Remove</button></span>
            </div>
            ${attempt.answer ? html`<p class="attempt-answer small">${attempt.answer}</p>` : !attempt.has_ink ? html`<p class="attempt-answer small muted">No typed answer (done on paper)</p>` : ''}
            ${attempt.has_ink ? inkPreview(attempt.attempt_id, attempt.question_id) : ''}
          </li>`)}
        </ol>`,
      onOpen: (dialog) => {
        // The buttons in the list close the dialog with their own choice.
        dialog.addEventListener('click', (clickEvent) => {
          const pick = clickEvent.target.closest('button[name="pick"]');
          if (!pick) return;
          clickEvent.preventDefault();
          dialog.dataset.pick = pick.value;
          dialog.querySelector('.modal__foot button[type="submit"]').click();
        });
      },
      onOpen: bindInkPreviews,
      actions: [
        { label: 'Close', cancel: true },
        { label: 'Answer it again', variant: 'primary', collect: (dialog) => dialog.dataset.pick || 'retry' },
      ],
    });
    if (!picked) return;
    const [kind, attemptId] = picked.split(':');
    if (kind === 'retry') return startSingle(found.question, context.navigate);
    if (kind === 'mark') return markLater(attemptId);
    const attempt = list.find((candidate) => candidate.attempt_id === attemptId);
    if (kind === 'remove' && attempt) {
      const number = list.length - list.indexOf(attempt);
      const sure = await confirmDialog({
        title: `Remove attempt ${number}?`,
        message: `Your attempt from ${whenLabel(attempt.answered_at || attempt.timestamp).toLowerCase()} ${attempt.waiting ? '(not marked yet)' : `(${attempt.marks_awarded}/${attempt.max_marks})`} and its answer will be deleted. Your other attempts stay. This can’t be undone.`,
        confirmLabel: 'Remove attempt',
        danger: true,
      });
      if (!sure) return;
      await api.removeAttempt(attempt.attempt_id);
      toast(`Attempt ${number} removed.`, { type: 'success' });
      return reload();
    }
    if (attempt) changeMark(attempt, found);
  });
  on(element, 'click', '[data-mark-later]', (event, button) => markLater(button.dataset.markLater));
  on(element, 'click', '[data-retry]', (event, button) => {
    const found = find(button.dataset.retry);
    if (found) startSingle(found.question, context.navigate);
  });
  on(element, 'click', '[data-retry-weak]', () => {
    const bundle = scope[0];
    const questions = latestList
      .filter((attempt) => scoreOf(attempt) < RAG.green)
      .sort((a, b) => scoreOf(a) - scoreOf(b))
      .map((attempt) => bundle.questionsById.get(attempt.question_id))
      .filter(Boolean)
      .slice(0, LIMITS.questionSetMax);
    if (questions.length) startQuestionSet({ subject: bundle.subject, questions, title: `${bundle.subject.subject}: retry ${plural(questions.length, 'question')}` }, context.navigate);
  });

  return () => cleanups.forEach((dispose) => dispose());
}
