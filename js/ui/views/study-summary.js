import { $, html, setHtml } from '../../core/dom.js';
import { links } from '../../core/links.js';
import { migrateLearnedIds } from '../../data/api.js';
import { getBundle, getSubjects, specIndex } from '../../data/content-repository.js';
import { getClient } from '../../data/adapters/supabase-adapter.js';
import { privateStudySummary } from '../../data/study-summary.js';
import { hasValidMark } from '../../engine/analytics.js';
import { levelLabel } from '../../engine/module-routes.js';
import { activitySummary, studyDay, studyRange, topicScores } from '../../engine/study-summary.js';
import { questionRef } from '../question-view.js';
import { fmtPercent } from '../ui.js';
import { applyTheme } from '../theme.js';

const root = $('#summary');
const PAGE_SIZE = 20;
const dateTime = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', dateStyle: 'medium', timeStyle: 'short' });
const stamp = value => value ? dateTime.format(new Date(value)) : 'Unavailable';
const subjectLabel = subject => `${subject.subject} · ${subject.level} · ${subject.board}`;
const fallbackSubject = 'Subject unavailable';
const nodeLabel = node => [node.code, node.title].filter(Boolean).join(' ');
const scoreLabel = score => score.max ? `${score.awarded}/${score.max} (${fmtPercent(score.percentage)})` : '—';
const modes = { overall: 'Overall marks only', parts: 'Per-question marks', unmarked: 'Saved as completed, unmarked' };
let request;
let authOwner;
let range = studyRange(30);
let subjectFilter = '';

function unavailable() {
  setHtml(root, html`<p role="status">Study summary unavailable.</p>
    ${authOwner ? '' : html`<p><a class="btn" href="${links.login('/hub/study-summary')}">Go to PPP sign-in</a></p>`}`);
}

function section(title, content) {
  return html`<section class="card"><div class="card__head"><h2 class="card__title">${title}</h2></div>
    <div class="card__body stack">${content}</div></section>`;
}

function table(title, headers, rows) {
  return html`<div class="table-wrap" role="region" aria-label="${title}" tabindex="0">
    <table class="table" aria-label="${title}">
      <thead><tr>${headers.map(header => html`<th scope="col">${header}</th>`)}</tr></thead>
      <tbody>${rows.map(row => html`<tr><th scope="row">${row[0]}</th>${row.slice(1).map(cell => html`<td>${cell}</td>`)}</tr>`)}</tbody>
    </table>
  </div>`;
}

function paged(title, headers, rows, empty) {
  if (!rows.length) return html`<p class="muted">${empty}</p>`;
  const render = (page) => {
    const start = page * PAGE_SIZE;
    return html`${table(title, headers, rows.slice(start, start + PAGE_SIZE))}
      ${rows.length > PAGE_SIZE ? html`<div class="row row--tight">
        <button class="btn btn--sm" type="button" data-page="${page - 1}" ${page === 0 ? html`disabled` : ''}>Previous</button>
        <span role="status">${start + 1}–${Math.min(start + PAGE_SIZE, rows.length)} of ${rows.length}</span>
        <button class="btn btn--sm" type="button" data-page="${page + 1}" ${start + PAGE_SIZE >= rows.length ? html`disabled` : ''}>Next</button>
      </div>` : ''}`;
  };
  const container = document.createElement('div');
  container.className = 'stack';
  setHtml(container, render(0));
  container.addEventListener('click', event => {
    const button = event.target.closest('button[data-page]');
    if (!button) return;
    setHtml(container, render(Number(button.dataset.page)));
    container.querySelector('button:not(:disabled)')?.focus({ preventScroll: true });
  });
  return container;
}

async function prepare(summary) {
  const subjects = await getSubjects();
  const registered = new Map(subjects.map(subject => [subject.subject_id, subject]));
  const ticks = migrateLearnedIds(summary.specTicks);
  const ids = new Set([...summary.enrolled, ...summary.activity.map(row => row.subject_id), ...summary.results.map(row => row.subject_id)]);
  const legacyQuestions = summary.activity.some(row => !row.subject_id);
  for (const subject of subjects) {
    if (ticks.some(id => id.startsWith(subject.sp_prefix + '_'))
      || (subject.textbooks && summary.textbookTicks.length) || legacyQuestions) ids.add(subject.subject_id);
  }
  const known = [...ids].filter(id => registered.has(id));
  // Keep readable counts available if a public subject bank or spec cannot load.
  const settled = await Promise.allSettled(known.map(async id => [id, await getBundle(id)]));
  const bundles = new Map();
  for (const result of settled) {
    if (result.status === 'fulfilled') bundles.set(...result.value);
  }

  const questionOwners = new Map();
  for (const [id, bundle] of bundles) {
    for (const questionId of bundle.questionsById.keys()) questionOwners.set(questionId, id);
  }
  const activity = summary.activity.map(row => ({
    ...row, subject_id: row.subject_id || questionOwners.get(row.question_id) || null,
  }));
  const specs = ticks.map(id => specIndex.get(id)).filter(Boolean);
  const textbooks = [];
  for (const bundle of bundles.values()) {
    if (!bundle.textbooks) continue;
    for (const id of summary.textbookTicks) {
      const point = bundle.textbooks.points.get(id);
      if (point) textbooks.push({ ...point, subject_id: bundle.subject.subject_id });
    }
  }
  const options = new Set([
    ...summary.enrolled, ...activity.map(row => row.subject_id), ...summary.results.map(row => row.subject_id),
    ...specs.map(node => node.subject_id), ...textbooks.map(node => node.subject_id),
  ]);
  return { registered, bundles, activity, specs, textbooks, options, missingBanks: settled.some(result => result.status === 'rejected') };
}

function render(summary, data) {
  const { registered, bundles, activity, specs, textbooks, options, missingBanks } = data;
  const label = id => registered.has(id) ? subjectLabel(registered.get(id)) : fallbackSubject;
  const scoped = rows => rows.filter(row => !subjectFilter || row.subject_id === subjectFilter);
  const rows = scoped(activity);
  const score = activitySummary(rows);
  const periods = ['7 days', '30 days', 'This month'];
  const currentOptions = [...options].filter(id => registered.has(id)).sort((a, b) => label(a).localeCompare(label(b)));
  if (subjectFilter && !currentOptions.includes(subjectFilter)) currentOptions.push(subjectFilter);
  const filter = html`<form class="stack" aria-label="Study summary filters">
    <div class="row row--tight">${periods.map((name, index) => html`<button class="btn btn--sm" type="button" data-period="${index}">${name}</button>`)}</div>
    <div class="row">
      <label class="field"><span class="field__label">Subject</span>
        <select class="select" name="subject"><option value="">All subjects</option>
          ${currentOptions.map(id => html`<option value="${id}" ${id === subjectFilter ? html`selected` : ''}>${label(id)}</option>`)}
        </select>
      </label>
      <label class="field"><span class="field__label">From</span><input class="input" type="date" name="from" required value="${summary.from}" max="${studyDay(summary.asOf)}"></label>
      <label class="field"><span class="field__label">To</span><input class="input" type="date" name="to" required value="${summary.to}" max="${studyDay(summary.asOf)}"></label>
      <button class="btn btn--primary" type="submit">Apply</button>
    </div>
  </form>`;

  const subjects = [...new Set(rows.map(row => row.subject_id))].map(id => {
    const subject = activitySummary(rows.filter(row => row.subject_id === id));
    return [label(id), subject.distinct, subject.answered.length, subject.marked, subject.waiting, scoreLabel(subject.latestScore), scoreLabel(subject.allScore)];
  });
  setHtml(root, html`
    ${section('Filters', html`${filter}
      <p class="small muted">Dates include both endpoints and use Europe/London. As of ${stamp(summary.asOf)}.</p>
      <p class="small muted">${summary.progressUpdatedAt ? `Cloud progress last saved ${stamp(summary.progressUpdatedAt)}. Work waiting to sync is unavailable here.` : 'No synced cloud progress is available yet.'}</p>`)}
    ${missingBanks ? html`<p role="status">Some subject data could not load. Question and topic labels may be incomplete.</p>` : ''}
    ${section('Question activity and marks', html`
      <p class="small muted">Activity uses the date the question was answered. Marks use the date they were recorded. Each separately marked question part counts as one question, as in the Data Hub.</p>
      ${table('Question activity and marks', ['Subject', 'Distinct questions', 'Attempts', 'Marked', 'Saved unmarked', 'Latest mark per question', 'All recorded marks'],
        [['Total', score.distinct, score.answered.length, score.marked, score.waiting, scoreLabel(score.latestScore), scoreLabel(score.allScore)], ...subjects])}
      <h3>Daily activity</h3><div data-section="daily"></div>
      <h3>Recent attempts</h3><div data-section="activity"></div>`)}
    ${section('Performance by official topic', html`
      <p class="small muted">Latest marks in the period, ordered by marks dropped. A question can contribute to more than one assessed topic.</p>
      <div data-section="mastery"></div>`)}
    ${section('Papers and custom tests', html`
      <p class="small muted">These results are separate from the question totals. Grades appear when recorded by PPP.</p>
      <div data-section="results"></div>`)}
    ${section('Enrolment and manually marked coverage', html`
      <p class="small muted">Current coverage and qualifications. The date filter applies to activity and marks.</p>
      <div data-section="enrolled"></div>
      <h3>Official spec points and topics</h3><div data-section="spec"></div>
      <h3>Textbook sections</h3><div data-section="textbook"></div>`)}
    ${section('Flashcards', html`<p>Reviews in the date range across all decks: <strong>${summary.flashcards.reviews}</strong>.</p>
      <p>Previously introduced cards due now across all decks: <strong>${summary.flashcards.due}</strong>.</p>`)}
  `);

  function place(key, ...args) {
    const target = $(`[data-section="${key}"]`, root);
    const details = paged(...args);
    if (details instanceof HTMLElement) target.append(details);
    else setHtml(target, details);
  }
  const recent = [...score.answered].sort((a, b) => Date.parse(b.activity_at) - Date.parse(a.activity_at));
  const days = new Map();
  for (const row of recent) {
    const day = studyDay(row.activity_at);
    if (!days.has(day)) days.set(day, []);
    days.get(day).push(row);
  }
  place('daily', 'Daily question activity', ['London date', 'Distinct questions', 'Attempts', 'Marked', 'Saved unmarked'],
    [...days].map(([day, attempts]) => {
      const waiting = attempts.filter(row => row.waiting).length;
      return [day, new Set(attempts.map(row => row.question_id)).size, attempts.length, attempts.length - waiting, waiting];
    }), 'No daily activity in this period.');
  place('activity', 'Recent question attempts', ['Question', 'Subject', 'Answered', 'Marks'], recent.map(row => {
    const bundle = bundles.get(row.subject_id);
    const question = bundle?.questionsById.get(row.question_id);
    const ref = question ? questionRef(question, bundle.papersById) : row.question_id;
    return [ref, label(row.subject_id), stamp(row.activity_at), row.waiting ? 'Saved unmarked' : `${row.marks_awarded}/${row.max_marks}`];
  }), 'No question attempts in this period.');

  const topicRows = topicScores([...bundles.values()].filter(bundle => !subjectFilter || bundle.subject.subject_id === subjectFilter), score.latest, specIndex);
  place('mastery', 'Topic performance', ['Topic', 'Subject', 'Questions', 'Latest marks', 'Marks dropped'],
    topicRows.map(row => [nodeLabel(row.topic), label(row.topic.subject_id), row.count, scoreLabel(row), row.dropped]),
    'No topic scores in this period.');

  place('results', 'Paper and custom test results', ['Paper or test', 'Subject', 'Recorded', 'Result type', 'Marks', 'Grade'], scoped(summary.results).map(row => [
    bundles.get(row.subject_id)?.papersById.get(row.paper_id)?.title || row.title || 'Practice',
    label(row.subject_id), stamp(row.timestamp), modes[row.mode] || 'Marking detail unavailable',
    hasValidMark(row) ? scoreLabel({ awarded: row.marks_awarded, max: row.max_marks, percentage: 100 * row.marks_awarded / row.max_marks }) : '—',
    row.grade || '—',
  ]), 'No paper or test results in this period.');

  place('enrolled', 'Enrolled qualifications', ['Subject', 'Qualification'], summary.enrolled.filter(id => !subjectFilter || id === subjectFilter).map(id => {
    const subject = registered.get(id);
    const choices = subject?.qualifications?.filter(item => summary.qualifications[id]?.includes(item.code)) || [];
    const qualification = choices.length ? choices.map(({ code }) => `${levelLabel(subject, code)} (${code})`).join(', ')
      : subject?.module_routes ? 'Qualification selection unavailable' : subject?.spec_code || 'Unavailable';
    return [label(id), qualification];
  }), 'No enrolled qualifications for this selection.');

  const ticked = new Set(specs.map(node => node.id));
  const fullyCovered = [...bundles.keys()].flatMap(id => specIndex.subjectNodes(id)).filter(node =>
    node.type === 'topic' && !ticked.has(node.id) && node.leaves.length && node.leaves.every(id => ticked.has(id)));
  place('spec', 'Official coverage', ['Spec point or topic', 'Subject', 'Coverage'],
    scoped([...specs, ...fullyCovered]).map(node => [nodeLabel(node), label(node.subject_id), ticked.has(node.id) ? 'Marked covered' : 'All spec points marked covered']),
    'No recognised official coverage ticks for this selection.');
  place('textbook', 'Textbook coverage', ['Section', 'Subject', 'Textbook'],
    scoped(textbooks).map(point => [nodeLabel(point), label(point.subject_id), point.book.title]),
    'No recognised textbook coverage ticks for this selection.');

  if (specs.length < summary.specTicks.length || textbooks.length < summary.textbookTicks.length) {
    root.querySelector('[data-section="textbook"]').insertAdjacentText('afterend', 'Some saved coverage references could not be matched to the current catalogue.');
  }

  const form = $('form', root);
  form.addEventListener('submit', event => {
    event.preventDefault();
    const values = new FormData(form);
    subjectFilter = values.get('subject');
    load({ from: values.get('from'), to: values.get('to') }, true);
  });
  for (const button of form.querySelectorAll('[data-period]')) {
    button.addEventListener('click', () => {
      subjectFilter = form.elements.subject.value;
      load(studyRange([7, 30, 'month'][button.dataset.period]), true);
    });
  }
}

async function load(nextRange = range, focus = false) {
  request?.abort();
  const current = new AbortController();
  request = current;
  setHtml(root, html`<p role="status">Loading study summary…</p>`);
  try {
    const data = await privateStudySummary({ ...nextRange, signal: current.signal });
    if (current.signal.aborted) return;
    if (!data) return unavailable();
    const prepared = await prepare(data);
    if (current.signal.aborted) return;
    range = nextRange;
    render(data, prepared);
    if (focus) $('form select', root).focus({ preventScroll: true });
  } catch (error) {
    if (current.signal.aborted) return;
    const invalid = error.message.startsWith('Choose a date range');
    setHtml(root, html`<p role="status">${invalid ? error.message : 'Could not load the study summary.'}</p>
      <p><button class="btn" type="button">${invalid ? 'Return to previous dates' : 'Try again'}</button></p>`);
    $('button', root).addEventListener('click', () => load(invalid ? range : nextRange, true));
  }
}

applyTheme();
try {
  const { auth } = await getClient();
  auth.onAuthStateChange((event, session) => {
    const nextOwner = session?.user?.id || null;
    const accountChanged = authOwner && nextOwner !== authOwner;
    authOwner = nextOwner;
    if (event === 'SIGNED_OUT' || accountChanged) {
      request?.abort();
      unavailable();
    }
  });
} catch {
  // The load path supplies the retry state if Auth or its SDK is unavailable.
}
load();
window.addEventListener('pagehide', () => {
  request?.abort();
  setHtml(root, '');
});
window.addEventListener('pageshow', event => {
  if (event.persisted) load();
});
