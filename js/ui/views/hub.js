// The Comprehensive Data Hub (PRD 4.4): every question attempt, topic mastery with
// Red / Amber / Green ratings, and paper and test history with grade trends.
// One filter row (subject) scopes every number, chart and table on the page.

import { DIFFICULTIES, GRADE_SCHEMES, LIMITS, PAPER_TYPES, RAG, RAG_LABELS } from '../../config/app.config.js';
import { isEnabled } from '../../config/phases.js';
import { $, html, on, setHtml } from '../../core/dom.js';
import { fmtDate, fmtDayMonth, fmtDuration, fmtRelative, percent, plural, uniq } from '../../core/utils.js';
import * as api from '../../data/api.js';
import { getBundles, specIndex } from '../../data/content-repository.js';
import {
  attemptCounts, byDifficulty, currentStreak, latestByQuestion, masteryByNode, paperHistory, ragFor, scoreOf, totals, weeklyActivity,
} from '../../engine/analytics.js';
import { columnChart, lineChart } from '../charts.js';
import { icon } from '../icons.js';
import { questionRef, questionSnippet } from '../question-view.js';
import { attemptInSubject, loadStudent, startQuestionSet, startSingle } from '../student.js';
import { tintPage } from '../subject-colours.js';
import { difficultyBadge, emptyState, fmtPercent, groupDot, meter, pageHead, ragBadge, soonBadge, subjectName } from '../ui.js';

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
    return `#/hub?tab=${target.tab}${target.subject === 'all' ? '' : `&subject=${target.subject}`}`;
  };

  const attempts = progress.question_attempts.filter((attempt) => scope.some((bundle) => attemptInSubject(attempt, bundle)));
  const latest = latestByQuestion(attempts);
  const latestList = [...latest.values()].sort((a, b) => (a.timestamp < b.timestamp ? 1 : -1));
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
    const recent = [...attempts].sort((a, b) => (a.timestamp < b.timestamp ? 1 : -1)).slice(0, 8);
    return html`<div class="stack stack--lg">
      <section class="grid grid--stats" aria-label="Summary">
        <div class="stat ruled"><i class="tape tape--c" aria-hidden="true"></i><span class="stat__label">Questions answered</span><span class="stat__value">${latest.size}</span><span class="stat__note">${plural(attempts.length, 'attempt')} in total</span></div>
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
              ${ragBadge(ragFor(scoreOf(attempt)), null, { label: false })}<span class="num small">${attempt.marks_awarded}/${attempt.max_marks}</span>
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

  const questionFilters = { status: 'all', difficulty: 'all' };

  function questionsTable() {
    const counts = attemptCounts(attempts);
    const rows = latestList.filter(
      (attempt) =>
        (questionFilters.status === 'all' || ragFor(scoreOf(attempt)) === questionFilters.status) &&
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
                    ? html`<span class="small muted">${subjectId === 'all' ? `${found.bundle.subject.subject} · ` : ''}${questionRef(found.question, found.bundle.papersById)}</span>
                        <span class="qcell__text">${questionSnippet(found.question, 90)}</span>`
                    : html`<span class="muted">Question no longer in the bank</span>`}
                </td>
                <td>${found ? html`<span class="tag">${specIndex.topicOf(found.question.primary_spec_points[0])?.title || '—'}</span>` : ''}</td>
                <td>${difficultyBadge(attempt.difficulty)}</td>
                <td class="nowrap">${ragBadge(ragFor(score), score, { label: false })} <span class="small muted num">${attempt.marks_awarded}/${attempt.max_marks}</span></td>
                <td class="num">${counts.get(attempt.question_id)}</td>
                <td class="nowrap small">${fmtRelative(attempt.timestamp)}</td>
                <td class="right">${found ? html`<button type="button" class="btn btn--sm" data-retry="${attempt.question_id}">Retry</button>` : ''}</td>
              </tr>`;
            })}
          </tbody>
        </table>
      </div>
      ${rows.length > 200 ? html`<p class="small muted" style="margin-top:10px">Showing the 200 most recent of ${rows.length}.</p>` : ''}`;
  }

  function questionsTab() {
    const weak = latestList.filter((attempt) => scoreOf(attempt) < RAG.green && find(attempt.question_id));
    const chip = (group, value, label) =>
      html`<button type="button" class="chip" data-qfilter="${group}" data-value="${value}" aria-pressed="${questionFilters[group] === value}">${label}</button>`;
    return html`<section class="card ruled tilt-2">
          <i class="tape tape--l" aria-hidden="true"></i>
      <div class="card__head">
        <h2 class="card__title">Every question you have answered</h2>
        ${subjectId === 'all'
          ? html`<span class="small muted">Choose a subject above to retry its weak questions as a set.</span>`
          : html`<button type="button" class="btn btn--sm btn--primary" data-retry-weak ${weak.length ? '' : 'disabled'}>
              ${icon('refresh', { size: 15 })} Retry ${Math.min(weak.length, LIMITS.questionSetMax)} below ${RAG.green}%
            </button>`}
      </div>
      <div class="stack stack--sm" style="margin-bottom:14px">
        <div class="chips" role="group" aria-label="Filter by result">
          ${chip('status', 'all', 'All results')} ${chip('status', 'red', RAG_LABELS.red)} ${chip('status', 'amber', RAG_LABELS.amber)} ${chip('status', 'green', RAG_LABELS.green)}
        </div>
        <div class="chips" role="group" aria-label="Filter by difficulty">
          ${chip('difficulty', 'all', 'All difficulties')} ${DIFFICULTIES.map((difficulty) => chip('difficulty', difficulty.id, difficulty.label))}
        </div>
      </div>
      <div data-qtable>${questionsTable()}</div>
    </section>`;
  }

  // ───────────────────────────────── topics ─────────────────────────────────

  function difficultyLine(entry) {
    const parts = DIFFICULTIES.filter((difficulty) => entry.byDifficulty[difficulty.id]).map((difficulty) => {
      const level = entry.byDifficulty[difficulty.id];
      return `${difficulty.label} ${fmtPercent(percent(level.awarded, level.max))}`;
    });
    return parts.join(' · ');
  }

  function topicsForSubject(bundle) {
    const mastery = masteryByNode(latest, bundle.questionsById, specIndex);
    const learned = api.learnedSet();
    return html`${bundle.spec.sections.map(
      (section) =>
        html`<section class="card ruled tilt-4">
          <i class="tape tape--c" aria-hidden="true"></i>
          <div class="card__head">
            <h2 class="card__title">${section.title}</h2>
            ${mastery.get(section.id) ? ragBadge(mastery.get(section.id).rag, mastery.get(section.id).percentage) : html`<span class="small muted">No attempts yet</span>`}
          </div>
          ${section.topics.map((topic) => {
            const entry = mastery.get(topic.id);
            const leaves = specIndex.leavesOf(topic.id);
            const learnedCount = leaves.filter((id) => learned.has(id)).length;
            return html`<details class="fold fold--row">
              <summary>
                <span class="fold__title"><span class="tree__code">${topic.code}</span> ${topic.title}</span>
                <span class="small muted nowrap">${learnedCount}/${leaves.length} learned</span>
                <span class="topicbar">${entry ? meter(entry.percentage, entry.rag, `${topic.title}: ${fmtPercent(entry.percentage)}`) : meter(0, 'none', 'No attempts')}</span>
                <span class="topicbar__value">${entry ? ragBadge(entry.rag, entry.percentage, { label: false }) : html`<span class="small muted">—</span>`}</span>
              </summary>
              <div class="stack stack--sm" style="padding:10px 0 4px">
                ${entry
                  ? html`<p class="small muted">${plural(entry.count, 'question')} answered · ${entry.awarded}/${entry.max} marks · ${difficultyLine(entry)}</p>`
                  : html`<p class="small muted">No questions answered in this topic yet.</p>`}
                <ul class="pointlist">
                  ${topic.points.map((point) => {
                    const pointEntry = mastery.get(point.id);
                    return html`<li>
                      <span class="tree__code">${point.code}</span>
                      <span class="pointlist__title">${point.title}</span>
                      <span class="small muted nowrap">${learned.has(point.id) ? html`${icon('check', { size: 14 })} Learned` : 'Not yet learned'}</span>
                      <span class="nowrap">${pointEntry ? ragBadge(pointEntry.rag, pointEntry.percentage, { label: false }) : html`<span class="small muted">No data</span>`}</span>
                    </li>`;
                  })}
                </ul>
                <p><a class="btn btn--sm" href="#/practice?subject=${bundle.subject.subject_id}&topic=${encodeURIComponent(topic.id)}">Practise this topic</a></p>
              </div>
            </details>`;
          })}
        </section>`,
    )}`;
  }

  function topicsTab() {
    if (subjectId !== 'all') {
      return html`<div class="stack">
        <p class="muted">
          ${ragBadge('green')} ${RAG.green}% or more &nbsp; ${ragBadge('amber')} ${RAG.amber}–${RAG.green - 1}% &nbsp; ${ragBadge('red')} below ${RAG.amber}%.
          Ratings use your latest attempt at each question. <a href="#/subject/${subjectId}">Edit what you have learned</a>
        </p>
        ${topicsForSubject(scope[0])}
      </div>`;
    }
    return html`<div class="grid grid--2">
      ${scope.map((bundle) => {
        const mastery = masteryByNode(latest, bundle.questionsById, specIndex);
        const rated = bundle.spec.sections
          .flatMap((section) => section.topics)
          .map((topic) => ({ topic, entry: mastery.get(topic.id) }))
          .filter((item) => item.entry)
          .sort((a, b) => a.entry.percentage - b.entry.percentage);
        return html`<section class="card ruled tilt-1">
          <i class="tape tape--r" aria-hidden="true"></i>
          <div class="card__head">
            <h2 class="card__title">${subjectName(bundle.subject)}</h2>
            <a class="btn btn--sm" href="${href({ subject: bundle.subject.subject_id })}">All topics</a>
          </div>
          ${rated.length
            ? html`<p class="label" style="margin-bottom:8px">Lowest scoring topics</p>
                <div class="meterlist">
                  ${rated.slice(0, 4).map(
                    ({ topic, entry }) =>
                      html`<span class="meterlist__name">${topic.title}</span>${meter(entry.percentage, entry.rag, `${topic.title}: ${fmtPercent(entry.percentage)}`)}
                        <span class="meterlist__value">${ragBadge(entry.rag, entry.percentage, { label: false })}</span>`,
                  )}
                </div>`
            : html`<p class="muted small">No questions answered yet.</p>`}
        </section>`;
      })}
    </div>`;
  }

  // ───────────────────────────────── papers and tests ─────────────────────────────────

  let historyType = 'all';

  function historyTable() {
    const rows = paperAttempts.filter((attempt) => historyType === 'all' || attempt.paper_type === historyType);
    if (!rows.length) return html`<p class="muted" style="padding:16px 0">Nothing here yet.</p>`;
    return html`<div class="table-wrap">
      <table class="table">
        <thead>
          <tr><th>Date</th><th>Paper or test</th><th>Type</th><th class="num">Score</th><th>Result</th><th>Time taken</th><th><span class="sr-only">Actions</span></th></tr>
        </thead>
        <tbody>
          ${rows.map((attempt) => {
            const bundle = bundles.get(attempt.subject_id);
            const isPaper = bundle?.papersById.has(attempt.paper_id);
            return html`<tr>
              <td class="nowrap">${fmtDate(attempt.timestamp)}</td>
              <td>
                ${isPaper
                  ? html`<a href="#/paper/${attempt.subject_id}/${encodeURIComponent(attempt.paper_id)}">${attempt.title}</a>`
                  : attempt.title || 'Practice'}
                ${bundle ? html`<br /><span class="small muted">${subjectName(bundle.subject)}</span>` : ''}
              </td>
              <td><span class="badge ${attempt.paper_type === 'real_past_paper' ? 'badge--official' : ''}">${PAPER_TYPES[attempt.paper_type]?.label || attempt.paper_type}</span></td>
              <td class="num">${attempt.marks_awarded}/${attempt.max_marks}</td>
              <td class="nowrap">${ragBadge(ragFor(attempt.percentage), attempt.percentage, { label: false })} ${attempt.grade ? html`<span class="tag">Grade ${attempt.grade}</span>` : ''}</td>
              <td class="nowrap small">${attempt.duration_seconds ? fmtDuration(attempt.duration_seconds) : '—'}</td>
              <td class="right">
                ${attempt.session_id && api.getSession(attempt.session_id) ? html`<a class="btn btn--sm btn--ghost" href="#/session/${attempt.session_id}">Review</a>` : ''}
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
        <div class="card__head"><h2 class="card__title">History</h2></div>
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

  const hasData = progress.question_attempts.length > 0 || progress.paper_attempts.length > 0;
  const body = !hasData
    ? emptyState({
        iconName: 'chart',
        title: 'Your Data Hub fills up as you practise',
        text: 'Answer questions, sit a paper or build a timed test. Every mark is logged here by question, topic and paper.',
        action: html`<a class="btn btn--primary" href="#/practice">Start practising</a>`,
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
        crumbs: [{ label: 'Home', href: '#/' }, { label: 'Data Hub', href: '#/hub' }, ...(subjectId === 'all' ? [] : [{ label: bundles.get(subjectId).subject.subject }])],
      })}
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
