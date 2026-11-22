// The session runner: sit a paper, a timed test or a set of questions, mark it against the
// mark scheme, and review the result. One view, three stages:
//   in_progress → answering          marking → self-marking (papers and tests)
//   completed   → results and review
// Marking goes through the provider in engine/marking.js, so AI marking (Phase 4) slots in
// without changing this view.

import { isEnabled } from '../../config/phases.js';
import { $, $$, html, isSafeUrl, on, setHtml } from '../../core/dom.js';
import { backLabel, links, routeOf } from '../../core/links.js';
import { clamp, debounce, fmtClock, fmtDate, fmtDuration, fmtMinutes, percent, plural, sum } from '../../core/utils.js';
import * as api from '../../data/api.js';
import { getBundle, specIndex } from '../../data/content-repository.js';
import { isMultiLevel, levelOf, qualificationCode } from '../../engine/paper-identity.js';
import { loadReportIndex, reportFold } from '../../data/examiner-reports.js';
import { zoomButton } from '../zoom.js';
import { ANSWER_MIN, placeQuestion } from '../question-fit.js';
import { bindMarkPickers, markPicker } from '../mark-picker.js';
import { elapsedMs, finishSession, isRunning, pauseTimer, remainingSeconds, retrySession, startTimer } from '../../data/sessions.js';
import { byDifficulty, paperHistory, ragFor, TARGET_BANDS, targetBand } from '../../engine/analytics.js';
import { targetGrade, tintPage } from '../subject-colours.js';
import { icon } from '../icons.js';
import { linkedIntro, linkedNote, linkedPartBody, linkedPartLabel, linkedRef, linkedUses, markSchemeBody, marksPill, questionBody, questionRef } from '../question-view.js';
import { groupEntry, runnerItems } from '../../engine/linked-parts.js';
import { banner, confirmDialog, openModal, difficultyBadge, emptyState, fmtPercent, meter, soonBadge, toast } from '../ui.js';

const KIND_LABELS = { full_paper: 'Past paper', custom_test: 'Timed test', question_set: 'Question set', single: 'Single question' };

export async function mount(element, context) {
  const session = api.getSession(context.params.sessionId);
  if (!session) {
    setHtml(
      element,
      emptyState({
        iconName: 'clock',
        title: 'This session is no longer available',
        text: 'It may have been discarded, or it belongs to a different account.',
        action: html`<a class="btn btn--primary" href="${links.home()}">Go to the home page</a>`,
      }),
    );
    return undefined;
  }

  const [bundle] = await Promise.all([getBundle(session.subject_id), loadReportIndex()]);
  const { subject } = bundle;
  const paper = bundle.papersById.get(session.paper_id) || api.getCustomTest(session.paper_id) || null;
  const questions = session.question_ids.map((id) => bundle.questionsById.get(id)).filter(Boolean);
  const wholePaper = questions.length === 0; // sat from the PDF and scored as one total
  const fullPaper = session.kind === 'full_paper';
  const each = session.mark_mode === 'each';
  session.revealed ||= {};
  context.setTitle(session.title);
  element.classList.add('view--runner');
  tintPage(subject); // the page takes a soft tint of the subject's colour
  // Papers and timed tests marked at the end show every question in one scrolling list.
  const scrollMode = !each && questions.length > 0;

  // Leaving returns to the page the student came from (the paper, practice, the dashboard…),
  // falling back to the paper or practice when the runner was opened directly.
  const fallbackRoute = routeOf(
    session.kind === 'full_paper' && bundle.papersById.has(session.paper_id)
      ? links.paper(subject.subject_id, session.paper_id)
      : bundle.papersById.has(session.source_paper_id)
        ? links.paper(subject.subject_id, session.source_paper_id)
        : links.practice({ subject: subject.subject_id }),
  );
  const exitRoute = context.backTarget(fallbackRoute);
  const exitHref = `#${exitRoute}`;
  const leave = () => context.back(fallbackRoute);
  let removed = false; // set once the session has been deleted, so a late save cannot bring it back
  let resultSaveFailed = false;
  const persist = debounce(() => {
    if (!removed) api.saveSession(session, { silent: true });
  }, 400);
  const topicOf = (question) => specIndex.topicOf(question.primary_spec_points[0])?.title || 'Other';
  const markedCount = () => questions.filter((question) => session.marks[question.question_id] != null).length;
  // Linked parts that follow each other are one question in the runner (engine/linked-parts.js):
  // one item, numbered once, with an answer box and marks for each part.
  const items = runnerItems(questions);
  const itemIndexOf = new Map();
  items.forEach((item, position) => {
    if (item.group) item.entry = groupEntry(item.group.id, bundle.questionsById);
    if (item.group && !item.entry) item.group = null;
    item.questions.forEach((question) => itemIndexOf.set(question.question_id, position));
  });
  const itemAt = (questionIndex) => itemIndexOf.get(questions[questionIndex]?.question_id) ?? 0;
  const partOf = (question) => {
    const item = items[itemIndexOf.get(question.question_id)];
    return item?.group ? linkedPartLabel(question, item.entry) : '';
  };
  /** "Question 3", or "Question 3 (b)" for a part of a linked question. */
  const numberOf = (question) => {
    if (fullPaper) return questionRef(question).replace(/^Q/, 'Question ');
    const part = partOf(question);
    return `Question ${(itemIndexOf.get(question.question_id) ?? 0) + 1}${part ? ` ${part}` : ''}`;
  };

  // ───────────────────────────────── timer ─────────────────────────────────

  function timerText() {
    const remaining = remainingSeconds(session);
    if (remaining !== null) return remaining >= 0 ? fmtClock(remaining) : `+${fmtClock(-remaining)}`;
    return fmtClock(elapsedMs(session) / 1000);
  }

  function tick() {
    const display = $('[data-timer]', element);
    if (!display) return;
    display.textContent = timerText();
    const remaining = remainingSeconds(session);
    const wrap = display.closest('.timer');
    wrap.classList.toggle('is-warn', remaining !== null && remaining > 0 && remaining <= 300);
    wrap.classList.toggle('is-over', remaining !== null && remaining <= 0);
    if (session.time_limit_minutes) {
      const used = clamp(elapsedMs(session) / (session.time_limit_minutes * 60000), 0, 1);
      wrap.closest('.runner')?.style.setProperty('--elapsed', used.toFixed(4));
    }
    if (remaining !== null && remaining <= 0 && !session.time_up_noted) {
      session.time_up_noted = true;
      persist();
      toast('Time is up. Finish when you are ready: the extra time is recorded.', { type: 'info', timeout: 7000 });
    }
  }

  if (session.status === 'in_progress' && session.timer.mode !== 'off' && !isRunning(session) && session.timer.elapsed_ms === 0) {
    startTimer(session);
    persist();
  }
  const interval = setInterval(tick, 500);

  // ───────────────────────────────── pieces ─────────────────────────────────

  // A paper session names the paper's own qualification (AS 8BN0, A-Level 9BN0), not the subject's.
  const sessionPaper = session.paper_id ? bundle.papersById.get(session.paper_id) : null;
  const sessionLevel = sessionPaper ? levelOf(sessionPaper, subject) || subject.level : subject.level;
  const sessionCode = sessionPaper && isMultiLevel(subject, bundle.papers) ? qualificationCode(sessionPaper, subject) : '';
  function bar({ stage, question = null, position = 0 }) {
    const running = isRunning(session);
    const timed = session.timer.mode !== 'off';
    return html`<header class="card runner__bar">
      <a class="btn btn--sm" href="${exitHref}" data-exit>${icon('chevronLeft', { size: 16 })} <span class="runner__exit-text">${stage === 'result' ? backLabel(exitRoute) : 'Save and exit'}</span></a>
      ${stage === 'run' && question && !timed
        ? html`<div class="runner__title">
            <p class="h3">${items.length > 1 ? html`Question ${position + 1}<span class="muted"> of ${items.length}</span>` : html`Question ${question.question_number}`}</p>
            <p class="small muted row row--tight">${topicOf(question)} ${difficultyBadge(question.difficulty)}</p>
          </div>`
        : html`<div class="runner__title">
            <p class="h3">${session.title}</p>
            <p class="small muted">${sessionLevel} ${subject.subject}${sessionCode ? ` · ${sessionCode}` : ''} · ${KIND_LABELS[session.kind]}</p>
          </div>`}
      <span class="spacer"></span>
      ${stage === 'run' && timed
        ? html`<div class="timer ${running ? '' : 'is-paused'}">
            ${icon(session.timer.mode === 'countdown' ? 'clock' : 'stopwatch')}
            <span class="timer__value" data-timer aria-label="${session.timer.mode === 'countdown' ? 'Time remaining' : 'Time elapsed'}">${timerText()}</span>
            ${session.timer.mode === 'countdown' || !running ? html`<span class="timer__left">${running ? 'left' : 'paused'}</span>` : ''}
            <button type="button" class="btn btn--icon btn--sm btn--ghost" data-pause aria-label="${running ? 'Pause the clock' : 'Resume the clock'}">
              ${icon(running ? 'pause' : 'play', { size: 16 })}
            </button>
          </div>`
        : ''}
      ${stage !== 'result'
        ? html`<details class="runner__more">
            <summary class="btn btn--sm btn--ghost" aria-label="More options">⋯</summary>
            <div class="runner__more-menu" role="group" aria-label="This attempt">
              ${stage === 'run' && !timed && !wholePaper ? html`<button type="button" class="btn btn--sm btn--ghost" data-stopwatch>${icon('stopwatch', { size: 15 })} Start stopwatch</button>` : ''}
              <button type="button" class="btn btn--sm btn--ghost" data-restart title="Clear everything and start this attempt again">${icon('refresh', { size: 15 })} Restart attempt</button>
            </div>
          </details>
          <button type="button" class="btn btn--sm runner__abandon" data-abandon title="Leave without saving anything from this attempt">Abandon</button>`
        : ''}
      ${stage === 'run' && !wholePaper
        ? html`<button type="button" class="btn btn--sm btn--primary" data-finish>${each ? 'Finish' : html`<span class="runner__finish-long">Finish and mark</span><span class="runner__finish-short">Finish</span>`}</button>`
        : ''}
    </header>`;
  }

  function marksInput(question, label) {
    const value = session.marks[question.question_id];
    return html`<div class="markbox" data-markbox="${question.question_id}">
      ${markPicker({ id: question.question_id, max: question.marks, value, attr: 'marks', label })}
    </div>`;
  }

  const aiMarkingNote = () =>
    isEnabled('aiMarking')
      ? ''
      : html`<p class="small muted aisoon">${icon('sparkle', { size: 15 })}<span>You mark this yourself for now. AI marking of typed answers:</span> ${soonBadge('aiMarking')}</p>`;

  const answerBlock = (question) => {
    const answer = session.answers[question.question_id];
    return answer
      ? html`<div><p class="label">Your answer</p><div class="answer-text">${answer}</div></div>`
      : html`<p class="small muted">No typed answer for this question. Mark the work you did on paper.</p>`;
  };

  // ───────────────────────────────── stage: answering ─────────────────────────────────

  const paused = () => session.timer.mode !== 'off' && !isRunning(session);
  const pausedPanel = () => {
    const remaining = remainingSeconds(session);
    const at = remaining !== null ? `${fmtClock(Math.max(remaining, 0))} left` : `${fmtClock(elapsedMs(session) / 1000)} in`;
    return html`<section class="paused-panel">
      <p class="hand">take a breather</p>
      <h1 tabindex="-1">Paused</h1>
      <p>The clock stopped at ${at}. The questions are hidden while you’re paused, so the timing stays fair.</p>
      <button type="button" class="btn btn--primary btn--lg" data-pause>${icon('play', { size: 18 })} Resume</button>
      <p class="small muted">${api.isSignedIn() ? 'Your answers are saved in this browser.' : 'Your guest answers last until you refresh or close this page.'}</p>
    </section>`;
  };

  function drawRun() {
    if (wholePaper) return drawWholePaper();
    if (scrollMode) return drawScroll();
    const index = clamp(session.current_index, 0, questions.length - 1);
    const position = itemAt(index);
    if (items[position].group) return drawLinkedRun(position);
    const question = questions[index];
    const id = question.question_id;
    const last = position === items.length - 1;
    const revealed = Boolean(session.revealed[id]);
    const exam = session.timer.mode === 'countdown';
    const compare = each && revealed; // question and mark scheme side by side

    setHtml(
      element,
      html`<div class="runner ${exam ? 'runner--exam' : 'runner--practice'}">
        ${bar({ stage: 'run', question, position })}
        ${eachPalette(position)}
        ${paused()
          ? pausedPanel()
          : html`<div class="runner__grid ${compare ? 'runner__grid--compare' : ''}" ${compare ? '' : 'data-qfit'}>
        <article class="card ruled tilt-1 qview" data-zoom-src="Question ${questions.length > 1 ? position + 1 : question.question_number}">
          <i class="tape tape--c" aria-hidden="true"></i>
          <header class="qview__head">
            <h1 class="qview__num" tabindex="-1">
              ${questions.length > 1
                ? html`Question ${position + 1}<span class="muted"> of ${items.length}</span>`
                : html`Question ${question.question_number}`}
            </h1>
            <div class="row row--tight">${marksPill(question.marks)} ${zoomButton('question')}</div>
          </header>
          <div data-zoom-body ${compare ? '' : 'data-fit'}>${questionBody(question)}</div>
        </article>
        <div class="stack runner__side">
        ${compare
          ? html`<article class="card ruled tilt-1 qview qview--scheme" data-zoom-src="Mark scheme · question ${questions.length > 1 ? position + 1 : question.question_number}">
              <i class="tape tape--c" aria-hidden="true"></i>
              <header class="qview__head">
                <h1 class="qview__num" tabindex="-1">Mark scheme</h1>
                <div class="row row--tight">${marksPill(question.marks)} ${zoomButton('mark scheme')}</div>
              </header>
              <div data-zoom-body>${markSchemeBody(question)}</div>
              ${reportFold({ key: question.question_id, units: [question], paper: bundle.papersById.get(question.paper_id) })}
            </article>
            <section class="card stack">${marksInput(question)} ${aiMarkingNote()}</section>`
          : ''}
        <section class="card ruled tilt-3 answer-card" data-zoom-src="Your answer">
          <i class="tape tape--c" aria-hidden="true"></i>
          <label class="field">
            <span class="card__title row row--between">Your answer <span class="muted">(optional)</span> ${zoomButton('answer box')}</span>
            ${api.isSignedIn() ? '' : html`<span class="hand">guest answers are temporary</span>`}
            <textarea class="textarea" data-answer="${id}" placeholder="Type your working here, or answer on paper.">${session.answers[id] || ''}</textarea>
          </label>
        </section>
        </div>
        </div>
        ${each
          ? html`<footer class="runner__nav runner__nav--pinned">
              ${revealed
                ? html`<button type="button" class="btn" data-unreveal="${id}">${icon('chevronLeft', { size: 16 })} Go back</button>
                    <span class="spacer"></span>
                    ${last
                      ? html`<button type="button" class="btn btn--primary" data-finish>Finish</button>`
                      : html`<button type="button" class="btn btn--primary" data-go="${items[position + 1]?.start}">Next question ${icon('chevronRight', { size: 16 })}</button>`}`
                : html`<button type="button" class="btn" data-flag="${id}" aria-pressed="${Boolean(session.flagged[id])}">
                      ${icon('flag', { size: 16 })} ${session.flagged[id] ? 'Flagged' : 'Flag question'}
                    </button>
                    <span class="spacer"></span>
                    ${position > 0 ? html`<button type="button" class="btn" data-go="${items[position - 1].start}">${icon('chevronLeft', { size: 16 })} Previous</button>` : ''}
                    ${last
                      ? html`<button type="button" class="btn" data-finish>Finish</button>`
                      : html`<button type="button" class="btn" data-go="${items[position + 1]?.start}">Next ${icon('chevronRight', { size: 16 })}</button>`}
                    <button type="button" class="btn btn--primary" data-reveal="${id}">${icon('eye', { size: 16 })} Mark scheme</button>`}
            </footer>`
          : html`<footer class="runner__nav">
          <button type="button" class="btn" data-flag="${id}" aria-pressed="${Boolean(session.flagged[id])}">
            ${icon('flag', { size: 16 })} ${session.flagged[id] ? 'Flagged' : 'Flag for review'}
          </button>
          <span class="spacer"></span>
          ${questions.length > 1
            ? html`<button type="button" class="btn" data-go="${items[position - 1]?.start ?? 0}" ${position === 0 ? 'disabled' : ''}>${icon('chevronLeft', { size: 16 })} Previous</button>`
            : ''}
          ${last
            ? html`<button type="button" class="btn btn--primary" data-finish>${each ? 'Finish' : 'Finish and mark'}</button>`
            : html`<button type="button" class="btn btn--primary" data-go="${items[position + 1]?.start}">Next ${icon('chevronRight', { size: 16 })}</button>`}
        </footer>`}`}
      </div>`,
    );
    if (!compare && !paused()) fitQuestions();
    return undefined;
  }

  /** The number row in mark-as-you-go sessions: one button per question (a linked question is one). */
  function eachPalette(current) {
    if (items.length < 2) return '';
    return html`<nav class="palette" aria-label="Questions">
      ${items.map((item, position) => {
        const ids = item.questions.map((question) => question.question_id);
        const state = [
          position === current ? 'is-current' : '',
          ids.some((id) => session.answers[id]) ? 'is-answered' : '',
          ids.some((id) => session.flagged[id]) ? 'is-flagged' : '',
          ids.every((id) => session.marks[id] != null) ? 'is-marked' : '',
        ].join(' ');
        const notes = [ids.some((id) => session.flagged[id]) ? 'flagged' : '', ids.every((id) => session.marks[id] != null) ? 'marked' : ''].filter(Boolean).join(', ');
        return html`<button type="button" class="palette__item ${state}" data-go="${item.start}" aria-label="Question ${position + 1}${notes ? ` (${notes})` : ''}" aria-current="${position === current ? 'true' : 'false'}">
          ${position + 1}
        </button>`;
      })}
    </nav>`;
  }

  /** One linked question's parts, each with its own answer box (and, once revealed, scheme and marks). */
  function linkedParts(item, { scheme = false, fit = false, placeholder = 'Type your working here, or answer on paper.' } = {}) {
    const { entry } = item;
    return html`${linkedNote(entry)}
      <div data-zoom-body ${fit ? 'data-fit' : ''}>
        <div class="qgroup__intro">${linkedIntro(entry)}</div>
        ${item.questions.map((part) => {
          const label = linkedPartLabel(part, entry);
          const uses = linkedUses(part, entry);
          return html`<section class="runner__part qgroup__part" aria-label="Part ${label}">
            <div class="qsplit__head"><span class="field__label qgroup__partlabel"><b>${scheme ? 'Mark scheme ' : 'Part '}${label}</b><span class="small muted">${plural(part.marks, 'mark')}</span>${uses.length && !scheme ? html`<span class="qgroup__uses">${icon('chevronLeft', { size: 12 })} uses your answer to ${uses.join(' and ')}</span>` : ''}</span></div>
            ${scheme ? markSchemeBody(part, { wholeQuestion: false }) : linkedPartBody(part)}
            ${scheme && session.answers[part.question_id] ? html`<div><p class="label">Your answer</p><div class="answer-text">${session.answers[part.question_id]}</div></div>` : ''}
            ${scheme
              ? marksInput(part, `Marks for ${label}, out of ${part.marks}`)
              : html`<label class="field"><span class="field__label">Your answer to ${label}</span>
                  <textarea class="textarea" data-answer="${part.question_id}" placeholder="${placeholder}">${session.answers[part.question_id] || ''}</textarea></label>`}
          </section>`;
        })}
      </div>`;
  }

  function drawLinkedRun(position) {
    const item = items[position];
    const id = item.questions[0].question_id;
    const ref = linkedRef(item.entry, bundle.papersById);
    const revealed = Boolean(session.revealed[id]);
    const last = position === items.length - 1;
    const exam = session.timer.mode === 'countdown';
    const total = sum(item.questions, (part) => part.marks);
    setHtml(
      element,
      html`<div class="runner ${exam ? 'runner--exam' : 'runner--practice'}">
        ${bar({ stage: 'run', question: item.questions[0], position })}
        ${eachPalette(position)}
        ${paused()
          ? pausedPanel()
          : html`<article class="card ruled tilt-1 qview qgroup ${revealed ? 'qview--scheme' : ''}" data-zoom-src="Question ${position + 1} · ${ref}">
              <i class="tape tape--c" aria-hidden="true"></i>
              <header class="qview__head">
                <h1 class="qview__num" tabindex="-1">${items.length > 1 ? html`Question ${position + 1}<span class="muted"> of ${items.length}</span>` : html`Question ${item.questions[0].question_number}`}<span class="muted"> · ${ref}</span></h1>
                <div class="row row--tight">${marksPill(total)} ${zoomButton('question')}</div>
              </header>
              ${api.isSignedIn() ? '' : html`<span class="hand">guest answers are temporary</span>`}
              ${linkedParts(item, { scheme: revealed && each })}
              ${revealed && each ? reportFold({ key: id, units: item.questions, paper: bundle.papersById.get(item.questions[0].paper_id), group: item.questions.length > 1 }) : ''}
              ${revealed && each ? aiMarkingNote() : ''}
            </article>`}
        ${each
          ? html`<footer class="runner__nav runner__nav--pinned">
              ${revealed
                ? html`<button type="button" class="btn" data-unreveal="${id}">${icon('chevronLeft', { size: 16 })} Go back</button>
                    <span class="spacer"></span>
                    ${last
                      ? html`<button type="button" class="btn btn--primary" data-finish>Finish</button>`
                      : html`<button type="button" class="btn btn--primary" data-go="${items[position + 1].start}">Next question ${icon('chevronRight', { size: 16 })}</button>`}`
                : html`<button type="button" class="btn" data-flag="${id}" aria-pressed="${Boolean(session.flagged[id])}">
                      ${icon('flag', { size: 16 })} ${session.flagged[id] ? 'Flagged' : 'Flag question'}
                    </button>
                    <span class="spacer"></span>
                    ${position > 0 ? html`<button type="button" class="btn" data-go="${items[position - 1].start}">${icon('chevronLeft', { size: 16 })} Previous</button>` : ''}
                    ${last
                      ? html`<button type="button" class="btn" data-finish>Finish</button>`
                      : html`<button type="button" class="btn" data-go="${items[position + 1].start}">Next ${icon('chevronRight', { size: 16 })}</button>`}
                    <button type="button" class="btn btn--primary" data-reveal="${id}">${icon('eye', { size: 16 })} Mark scheme for all parts</button>`}
            </footer>`
          : html`<footer class="runner__nav">
              <button type="button" class="btn" data-flag="${id}" aria-pressed="${Boolean(session.flagged[id])}">${icon('flag', { size: 16 })} ${session.flagged[id] ? 'Flagged' : 'Flag for review'}</button>
              <span class="spacer"></span>
              ${items.length > 1 ? html`<button type="button" class="btn" data-go="${items[position - 1]?.start ?? 0}" ${position === 0 ? 'disabled' : ''}>${icon('chevronLeft', { size: 16 })} Previous</button>` : ''}
              ${last
                ? html`<button type="button" class="btn btn--primary" data-finish>Finish and mark</button>`
                : html`<button type="button" class="btn btn--primary" data-go="${items[position + 1].start}">Next ${icon('chevronRight', { size: 16 })}</button>`}
            </footer>`}
      </div>`,
    );
    return undefined;
  }

  // ── scrolling list (papers and timed tests marked at the end) ──

  const flagButton = (id) => html`<button type="button" class="btn btn--sm runner__flag" data-flag="${id}" aria-pressed="${Boolean(session.flagged[id])}">
    ${icon('flag', { size: 15 })} <span data-flag-label>${session.flagged[id] ? 'Flagged' : 'Flag for review'}</span>
  </button>`;

  function paletteItem(item, position, current) {
    const ids = item.questions.map((question) => question.question_id);
    const flagged = ids.some((id) => session.flagged[id]);
    const state = [
      position === current ? 'is-current' : '',
      ids.some((id) => session.answers[id]) ? 'is-answered' : '',
      flagged ? 'is-flagged' : '',
    ].join(' ');
    const label = fullPaper ? paperItemNumber(item) : position + 1;
    return html`<button type="button" class="palette__item ${state}" data-jump="${position}" aria-label="Question ${label}${flagged ? ' (flagged)' : ''}" aria-current="${position === current ? 'true' : 'false'}">${label}</button>`;
  }

  function paperItemNumber(item) {
    return (item.group ? linkedRef(item.entry) : questionRef(item.questions[0])).replace(/^Q/, '');
  }

  function drawScroll() {
    // In the scrolling list the remembered position counts questions as shown (a linked question is one).
    const current = clamp(session.current_index, 0, items.length - 1);
    const many = items.length > 1;
    setHtml(
      element,
      html`<div class="runner runner--scroll">
        <div class="runner__top">
          ${bar({ stage: 'run' })}
          ${many ? html`<nav class="palette" aria-label="Jump to a question">${items.map((item, position) => paletteItem(item, position, current))}</nav>` : ''}
        </div>
        ${paused()
          ? pausedPanel()
          : html`<div class="runner__list">
              ${items.map((item, position) => {
                const question = item.questions[0];
                const id = question.question_id;
                const label = fullPaper ? `Question ${paperItemNumber(item)}` : `Question ${many ? position + 1 : question.question_number}`;
                const title = !fullPaper && many ? html`${label}<span class="muted"> of ${items.length}</span>` : label;
                if (item.group) {
                  return html`<section class="runner__item" data-item="${position}" id="runner-q${position + 1}" aria-label="${label}">
                    <article class="card ruled qview qgroup" data-zoom-src="${label}">
                      <i class="tape tape--c" aria-hidden="true"></i>
                      <header class="qview__head">
                        ${position === 0 ? html`<h1 class="sr-only" tabindex="-1">${session.title}</h1>` : ''}
                        <h2 class="qview__num">${title}${!fullPaper ? html`<span class="muted"> · ${linkedRef(item.entry, bundle.papersById)}</span>` : ''}</h2>
                        <div class="row row--tight">${marksPill(sum(item.questions, (part) => part.marks))} ${zoomButton('question')}</div>
                      </header>
                      ${api.isSignedIn() ? '' : html`<span class="hand">guest answers are temporary</span>`}
                      ${linkedParts(item, { placeholder: 'Optional. Type your working here, or answer on paper.' })}
                      <div class="row" style="margin-top:12px">${flagButton(id)}</div>
                    </article>
                  </section>`;
                }
                return html`<section class="runner__item" data-item="${position}" id="runner-q${position + 1}" aria-label="${label}">
                  <div class="runner__grid">
                    <article class="card ruled qview" data-zoom-src="${label}">
                      <i class="tape tape--c" aria-hidden="true"></i>
                      <header class="qview__head">
                        ${position === 0 ? html`<h1 class="sr-only" tabindex="-1">${session.title}</h1>` : ''}
                        <h2 class="qview__num">
                          ${title}${!fullPaper && question.part_label ? html`<span class="muted"> · Part ${question.part_label}</span>` : ''}
                        </h2>
                        <div class="row row--tight">${marksPill(question.marks)} ${zoomButton('question')}</div>
                      </header>
                      <div data-zoom-body data-fit>${questionBody(question)}</div>
                    </article>
                    <div class="stack runner__side">
                      <section class="card ruled answer-card" data-zoom-src="Your answer · ${label.toLowerCase()}">
                        <i class="tape tape--c" aria-hidden="true"></i>
                        <label class="field">
                          <span class="card__title row row--between">Your answer ${zoomButton('answer box')}</span>
                          ${api.isSignedIn() ? '' : html`<span class="hand">guest answers are temporary</span>`}
                          <textarea class="textarea" data-answer="${id}" placeholder="Optional. Type your working here, or answer on paper.">${session.answers[id] || ''}</textarea>
                        </label>
                      </section>
                      ${flagButton(id)}
                    </div>
                  </div>
                </section>`;
              })}
              <footer class="runner__end">
                <p class="muted">That’s the last question.</p>
                <button type="button" class="btn btn--primary" data-finish>Finish and mark</button>
              </footer>
            </div>`}
      </div>`,
    );
    if (!paused()) {
      fitQuestions();
      if (current > 0) requestAnimationFrame(() => scrollToItem(current, 'auto'));
    }
    return undefined;
  }

  const topOffset = () => ($('.runner__top', element)?.offsetHeight || 0) + 12;

  function scrollToItem(position, behavior = 'smooth') {
    const target = $(`[data-item="${position}"]`, element);
    if (!target) return;
    window.scrollTo({ top: target.getBoundingClientRect().top + window.scrollY - topOffset(), behavior });
  }

  // Answer box below short questions and beside long ones, each question sized to fit one
  // screen (js/ui/question-fit.js). Scrolling papers fit every item; one-at-a-time runners
  // fit the current question above the pinned footer.
  function fitQuestions() {
    if (scrollMode) {
      return Promise.all($$('.runner__grid', element).map((grid) => placeQuestion(grid, {
        body: $('[data-fit]', grid),
        card: $('.qview', grid),
        available: () => window.innerHeight - topOffset() - 16,
        answer: ANSWER_MIN + 22 + 46, // gap, then the flag button under the answer card
      })));
    }
    const grid = $('.runner__grid[data-qfit]', element);
    if (!grid) return Promise.resolve();
    const footer = $('.runner__nav', element);
    return placeQuestion(grid, {
      body: $('[data-fit]', grid),
      card: $('.qview', grid),
      available: () => window.innerHeight - (grid.getBoundingClientRect().top + window.scrollY) - (footer ? footer.offsetHeight + 28 : 24),
      answer: ANSWER_MIN + 28,
    });
  }

  // The number row follows the question in view, and remembers it for when the student returns.
  let scrollFrame = 0;
  const onScroll = () => {
    if (scrollFrame || !scrollMode || session.status !== 'in_progress') return;
    scrollFrame = requestAnimationFrame(() => {
      scrollFrame = 0;
      const items = $$('[data-item]', element);
      if (!items.length) return;
      const line = topOffset() + window.innerHeight * 0.25;
      let current = 0;
      items.forEach((item, position) => { if (item.getBoundingClientRect().top <= line) current = position; });
      if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4) current = items.length - 1;
      if (current === session.current_index) return;
      session.current_index = current;
      persist();
      $$('.palette__item', element).forEach((button, position) => {
        button.classList.toggle('is-current', position === current);
        button.setAttribute('aria-current', position === current ? 'true' : 'false');
      });
    });
  };
  const onResize = debounce(() => { if (session.status === 'in_progress') fitQuestions(); }, 250);
  window.addEventListener('resize', onResize);
  if (scrollMode) window.addEventListener('scroll', onScroll, { passive: true });

  function drawWholePaper() {
    const pdf = isSafeUrl(paper?.full_paper_pdf_url) ? paper.full_paper_pdf_url : null;
    setHtml(
      element,
      html`<div class="runner">
        ${bar({ stage: 'run' })}
        ${session.timer.mode !== 'off' && !isRunning(session)
          ? banner(html`<strong>Paused.</strong> The clock is stopped. <button type="button" class="linkbtn" data-pause>Resume</button>`, { type: 'warn' })
          : ''}
        <article class="card stack">
          <h1 class="h2" tabindex="-1">Sit the paper</h1>
          <p class="muted">
            Work through the paper from its PDF or a printed copy. ${session.timer.mode === 'countdown' ? `You have ${fmtMinutes(session.time_limit_minutes)}, as in the exam.` : 'There is no time limit.'}
            When you finish, mark it with the mark scheme and enter your total out of ${session.total_marks}.
          </p>
          <div class="row">
            ${pdf
              ? html`<a class="btn" href="${pdf}" target="_blank" rel="noopener">${icon('file')} Open the question paper</a>`
              : paper?.official_source_url
                ? html`<a class="btn" href="${paper.official_source_url}" target="_blank" rel="noopener">Find it on the ${subject.board} site ${icon('external', { size: 15 })}</a>`
                : ''}
            <button type="button" class="btn btn--primary" data-finish>Finish and enter marks</button>
          </div>
          ${pdf ? html`<iframe class="pdfframe" src="${pdf}" title="Question paper"></iframe>` : ''}
        </article>
      </div>`,
    );
  }

  // ───────────────────────────────── stage: marking ─────────────────────────────────

  function markbarText() {
    const awarded = sum(questions, (question) => session.marks[question.question_id] || 0);
    const max = sum(questions, (question) => question.marks);
    return `${markedCount()} of ${questions.length} marked · ${awarded}/${max} so far`;
  }

  function drawMarking() {
    const markScheme = isSafeUrl(paper?.full_mark_scheme_pdf_url) ? paper.full_mark_scheme_pdf_url : null;
    setHtml(
      element,
      html`<div class="runner">
        ${bar({ stage: 'mark' })}
        <header class="mark-head">
          <h1 tabindex="-1">${wholePaper ? 'Mark your paper' : 'Mark your answers'}</h1>
          <span class="hand">you took ${fmtDuration(elapsedMs(session) / 1000)}${session.time_limit_minutes ? ` of ${fmtMinutes(session.time_limit_minutes)}` : ''}</span>
          ${wholePaper
            ? ''
            : html`<p class="muted">Compare each answer with its mark scheme and enter the marks you earned. Be strict: only give a mark where the mark scheme allows it.</p>`}
        </header>
        ${wholePaper
          ? html`<section class="card ruled stack mark-step">
              <i class="tape tape--c" aria-hidden="true"></i>
              <h2 class="card__title">1. Open the mark scheme</h2>
              <p>Mark your script with ${subject.board}’s official mark scheme. Be strict: only give a mark where the mark scheme allows it.</p>
              <div class="row">
                ${markScheme
                  ? html`<a class="btn" href="${markScheme}" target="_blank" rel="noopener">${icon('checkCircle')} Open the mark scheme</a>`
                  : paper?.official_source_url
                    ? html`<a class="btn" href="${paper.official_source_url}" target="_blank" rel="noopener">Find the mark scheme on the ${subject.board} site ${icon('external', { size: 15 })}</a>`
                    : ''}
              </div>
            </section>
            <section class="card ruled stack mark-step">
              <i class="tape tape--c" aria-hidden="true"></i>
              <h2 class="card__title">2. Enter your total</h2>
              <label class="field" style="max-width:260px">
                <span class="field__label">Marks out of ${session.total_marks}</span>
                <input class="input" type="number" min="0" max="${session.total_marks}" step="1" inputmode="numeric" value="${session.total_awarded ?? ''}" data-total />
              </label>
            </section>`
          : questions.map(
              (question, index) =>
                html`<article class="card ruled stack markcard">
                  <header class="row row--between">
                    <h2 class="h2">${numberOf(question)}</h2>
                    <div class="row row--tight">${session.flagged[question.question_id] ? html`<span class="tag">${icon('flag', { size: 13 })} Flagged</span>` : ''} ${marksPill(question.marks)}</div>
                  </header>
                  <details class="fold">
                    <summary>Show the question</summary>
                    ${questionBody(question)}
                  </details>
                  ${answerBlock(question)}
                  <div><p class="label" style="margin-bottom:6px">Mark scheme</p>${markSchemeBody(question)}</div>
                  ${reportFold({ key: question.question_id, units: [question], paper: bundle.papersById.get(question.paper_id) })}
                  ${marksInput(question)}
                </article>`,
            )}
        <div class="markbar">
          <p class="num" data-markbar>${wholePaper ? 'Enter your total to finish' : markbarText()}</p>
          <button type="button" class="btn btn--primary btn--lg" data-save-results>Save results</button>
        </div>
      </div>`,
    );
  }

  // ───────────────────────────────── stage: results ─────────────────────────────────

  function drawResults() {
    const result = session.result;
    const rag = ragFor(result.percentage);
    const scored = questions.filter((question) => session.marks[question.question_id] != null);
    const topics = new Map();
    for (const question of scored) {
      const entry = topics.get(topicOf(question)) || { awarded: 0, max: 0 };
      entry.awarded += session.marks[question.question_id];
      entry.max += question.marks;
      topics.set(topicOf(question), entry);
    }
    const target = targetGrade(subject);
    const band = target && result.grade ? targetBand(result.grade, target, subject.grade_scheme) : null;
    // Below target (or, with no target/grade, a red score) is flagged plainly as needing improvement.
    const belowTarget = band === 'developing' || band === 'needs_work';
    const needsImprovement = belowTarget || (!band && rag === 'red');
    const weakTopics = [...topics]
      .map(([name, entry]) => ({ name, share: percent(entry.awarded, entry.max) }))
      .filter((topic) => topic.share < 60)
      .sort((x, y) => x.share - y.share)
      .slice(0, 3);
    const history = session.paper_id
      ? paperHistory(api.getProgress().paper_attempts).filter((attempt) => attempt.paper_id === session.paper_id).reverse().slice(-5)
      : [];
    const levels = byDifficulty(
      scored.map((question) => ({ difficulty: question.difficulty, marks_awarded: session.marks[question.question_id], max_marks: question.marks })),
    ).filter((level) => level.count);

    setHtml(
      element,
      html`<div class="runner">
        ${bar({ stage: 'result' })}
        ${resultSaveFailed ? banner(html`Could not save your results. <button type="button" class="linkbtn" data-retry-save>Try saving again</button>`, { type: 'warn' }) : ''}
        ${!api.isSignedIn() ? banner(html`Your results are temporary. <a href="${links.signup('/hub')}">Create a free account</a> to save and track your marks and progress in this browser.`) : ''}
        <section class="card ruled result-hero">
          <i class="tape tape--c" aria-hidden="true"></i>
          <div class="result-hero__left">
            <p class="hand">${KIND_LABELS[session.kind].toLowerCase()} complete</p>
            ${result.questions_unmarked ? html`<p class="small muted">${plural(result.questions_unmarked, 'question')} left unmarked. This score covers marked questions only and is not a full paper result.</p>` : ''}
            <h1 class="result-hero__score" tabindex="-1">
              <span class="result-hero__value">${result.marks_awarded}</span><span class="result-hero__max"> / ${result.max_marks}</span>
            </h1>
          </div>
          <div class="result-hero__right">
            <div class="row" style="gap:16px;flex-wrap:nowrap">
              ${result.grade ? html`<span class="grade-stamp grade-stamp--lg" data-band="${band || ''}" data-rag="${band ? '' : rag}">${result.grade}</span>` : ''}
              <div>
                <p class="result-hero__pct">${fmtPercent(result.percentage)}</p>
                <p class="muted">
                  ${[
                    result.grade ? `grade ${result.grade} on ${paper?.grade_boundaries?.length ? 'this paper’s boundaries' : 'indicative boundaries'}` : '',
                    band ? TARGET_BANDS[band].label.toLowerCase() + ` (target ${target})` : '',
                    result.duration_seconds ? `${fmtDuration(result.duration_seconds)}${session.time_limit_minutes ? ` of ${fmtMinutes(session.time_limit_minutes)}` : ''}` : '',
                  ].filter(Boolean).join(' · ')}
                </p>
              </div>
            </div>
            ${meter(result.percentage, rag, `Score ${fmtPercent(result.percentage)}`)}
            <div class="row">
              <a class="btn btn--primary" href="${exitHref}" data-exit>${backLabel(exitRoute)}</a>
              ${api.isSignedIn() ? html`<a class="btn" href="${links.hub()}">Open the Data Hub</a>` : html`<a class="btn" href="${links.signup('/hub')}">Create a free account</a>`}
              ${!resultSaveFailed && (questions.length || sessionPaper) ? html`<button type="button" class="btn" data-retry>${icon('refresh', { size: 16 })} ${session.kind === 'full_paper' ? 'Sit it again' : 'Try these again'}</button>` : ''}
            </div>
            ${resultSaveFailed ? '' : html`<p class="small muted"><span class="rag-dot" data-rag="green" style="width:10px;height:10px;vertical-align:-1px"></span> ${api.isSignedIn() ? 'Saved in this browser and added to your Data Hub.' : 'Temporary guest result; create an account to save it in this browser.'}</p>`}
          </div>
        </section>
        ${needsImprovement
          ? html`<section class="card improve-note" data-band="${band || 'needs_work'}" role="note">
              <h2 class="improve-note__title">${belowTarget ? `Below your target of ${target}: this needs improvement` : 'This score needs improvement'}</h2>
              <p>${belowTarget
                ? `You got grade ${result.grade}, ${band === 'developing' ? 'one grade' : 'two or more grades'} under your target. `
                : ''}${weakTopics.length
                ? html`Focus on: ${weakTopics.map((topic, i) => html`${i ? ', ' : ''}<b>${topic.name}</b> (${fmtPercent(topic.share)})`)}. Re-read the mark scheme for the questions you dropped marks on, then try them again.`
                : 'Go through the mark scheme for the questions you dropped marks on, then try them again.'}</p>
            </section>`
          : ''}
        ${scored.length > 1 || history.length > 1
          ? html`<div class="result-cards">
              ${scored.length > 1
                ? html`<section class="card ruled tilt-2">
                    <i class="tape tape--l" aria-hidden="true"></i>
                    <h2 class="card__title">By topic</h2>
                    <div class="meterlist">
                      ${[...topics].map(([name, entry]) => {
                        const share = percent(entry.awarded, entry.max);
                        return html`<span class="meterlist__name">${name}</span>${meter(share, ragFor(share), `${name}: ${fmtPercent(share)}`)}
                          <span class="meterlist__value">${entry.awarded}/${entry.max}</span>`;
                      })}
                    </div>
                  </section>
                  <section class="card ruled tilt-3">
                    <i class="tape tape--r" aria-hidden="true"></i>
                    <h2 class="card__title">By difficulty</h2>
                    <div class="meterlist">
                      ${levels.map(
                        (level) =>
                          html`<span class="meterlist__name">${level.label}</span>${meter(level.percentage, level.rag, `${level.label}: ${fmtPercent(level.percentage)}`)}
                            <span class="meterlist__value">${level.awarded}/${level.max}</span>`,
                      )}
                    </div>
                  </section>`
                : ''}
              ${history.length > 1
                ? html`<section class="card ruled tilt-1">
                    <i class="tape tape--c" aria-hidden="true"></i>
                    <h2 class="card__title">This paper over time</h2>
                    <div class="minibars" role="img" aria-label="${history.map((attempt) => `${fmtDate(attempt.timestamp)}: ${fmtPercent(attempt.percentage)}`).join(', ')}">
                      ${history.map(
                        (attempt, index) =>
                          html`<span class="minibars__col ${index === history.length - 1 ? 'is-now' : ''}">
                            <b>${fmtPercent(attempt.percentage)}</b>
                            <i style="height:${Math.max(4, attempt.percentage)}%"></i>
                            <small>${index === history.length - 1 ? 'This time' : fmtDate(attempt.timestamp).replace(/ \d{4}$/, '')}</small>
                          </span>`,
                      )}
                    </div>
                  </section>`
                : ''}
            </div>`
          : ''}
        ${questions.length
          ? html`<section class="card ruled review-card">
              <i class="tape tape--c" aria-hidden="true"></i>
              <h2 class="card__title">Review</h2>
              <p class="hand">open a question to see your answer next to the mark scheme</p>
              ${questions.map((question, index) => {
                const marks = session.marks[question.question_id];
                const share = marks == null ? null : percent(marks, question.marks);
                return html`<details class="fold fold--row" ${questions.length === 1 ? 'open' : ''}>
                  <summary>
                    <span class="fold__title">${numberOf(question)}</span>
                    <span class="tag">${topicOf(question)}</span>
                    ${session.answers[question.question_id] ? '' : html`<span class="small muted">not typed</span>`}
                    <span class="spacer"></span>
                    ${marks == null ? html`<span class="small muted">Not marked</span>` : html`<span class="rag-dot" data-rag="${ragFor(share)}"></span><span class="review-card__marks">${marks}/${question.marks}</span>`}
                  </summary>
                  <div class="stack" style="padding-top:12px">
                    ${questionBody(question)} ${answerBlock(question)}
                    <div><p class="label" style="margin-bottom:6px">Mark scheme</p>${markSchemeBody(question)}</div>
                    ${reportFold({ key: question.question_id, units: [question], paper: bundle.papersById.get(question.paper_id) })}
                  </div>
                </details>`;
              })}
            </section>`
          : ''}
      </div>`,
    );
  }

  function draw({ focus = true } = {}) {
    if (session.status === 'completed') drawResults();
    else if (session.status === 'marking') drawMarking();
    else drawRun();
    if (focus) $('h1', element)?.focus({ preventScroll: true });
  }

  // ───────────────────────────────── actions ─────────────────────────────────

  /** Unmarked questions with a typed answer: these are saved to mark later when the session ends. */
  const typedUnmarked = () => questions.filter((question) => !Number.isInteger(session.marks[question.question_id]) && String(session.answers[question.question_id] || '').trim());
  const unmarkedMessage = (unmarked) => `${plural(unmarked, 'question')} ${unmarked === 1 ? 'has' : 'have'} no mark and will be left out of the score.`;

  let savingResults = false;
  async function complete() {
    if (savingResults) return;
    savingResults = true;
    try {
      await finishSession(session, { questions, subject, paper, totalAwarded: session.total_awarded });
      resultSaveFailed = false;
      draw();
      window.scrollTo(0, 0);
      toast(api.isSignedIn() ? 'Results saved to your Data Hub.' : 'Results are temporary. Create a free account to save them.', { type: 'success' });
    } catch {
      if (session.status === 'completed') {
        resultSaveFailed = true;
        draw();
        window.scrollTo(0, 0);
      } else {
        toast('Could not calculate your results. Try again.', { type: 'error' });
      }
    } finally {
      savingResults = false;
    }
  }

  async function finishAnswering() {
    if (each) {
      const typed = typedUnmarked();
      if (markedCount() === 0) {
        // Nothing marked: nothing to record. A typed answer is not kept as a separate "mark later" record.
        if (typed.length && !(await confirmDialog({ title: 'Leave without marking?', message: 'No marks were given, so nothing will be recorded.', confirmLabel: 'Leave' }))) return;
        removed = true;
        await api.deleteSession(session.session_id);
        leave();
        return;
      }
      const unmarked = questions.length - markedCount();
      if (unmarked > 0) {
        const proceed = await confirmDialog({
          title: 'Finish now?',
          message: unmarkedMessage(unmarked),
          confirmLabel: 'Finish',
        });
        if (!proceed) return;
      }
      return complete();
    }
    const remaining = remainingSeconds(session);
    const clockLine = remaining !== null && remaining > 0 ? `The clock stops with ${fmtClock(remaining)} left` : 'The clock stops';
    const numbers = (list) => list.map((question) => numberOf(question).replace('Question ', 'Q').replace(' ', '')).join(', ');
    const unanswered = questions.filter((question) => !session.answers[question.question_id]);
    const flagged = questions.filter((question) => session.flagged[question.question_id]);
    const proceed = await confirmDialog({
      title: wholePaper ? 'Finish the paper?' : 'Finish and mark?',
      message: wholePaper
        ? `${clockLine} and you can enter your marks.`
        : `${clockLine} and you’ll mark each answer against its mark scheme. You can’t go back to answering.`,
      extra: wholePaper
        ? ''
        : html`<p class="row row--tight" style="margin-top:14px">
            <span class="tag">${questions.length - unanswered.length} typed</span>
            ${unanswered.length ? html`<span class="tag">${unanswered.length} not typed${unanswered.length <= 6 ? `: ${numbers(unanswered)}` : ''}</span>` : ''}
            ${flagged.length ? html`<span class="tag">${flagged.length} flagged: ${numbers(flagged)}</span>` : ''}
          </p>`,
      cancelLabel: 'Keep going',
      confirmLabel: 'Finish',
    });
    if (!proceed) return;
    pauseTimer(session);
    session.status = 'marking';
    await api.saveSession(session, { silent: true });
    draw();
    window.scrollTo(0, 0);
  }

  function setMarks(input, raw) {
    const id = input.dataset.marks;
    const question = bundle.questionsById.get(id);
    if (raw === '' || raw == null || Number.isNaN(Number(raw))) {
      delete session.marks[id];
      input.value = '';
    } else {
      const value = clamp(Math.round(Number(raw)), 0, question.marks);
      session.marks[id] = value;
      input.value = String(value);
    }
    persist();
    const markbar = $('[data-markbar]', element);
    if (markbar && !wholePaper) markbar.textContent = markbarText();
  }

  on(element, 'click', '[data-go]', (event, button) => {
    session.current_index = clamp(Number(button.dataset.go), 0, questions.length - 1);
    persist();
    draw();
    window.scrollTo(0, 0);
  });
  on(element, 'click', '[data-jump]', (event, button) => {
    const position = clamp(Number(button.dataset.jump), 0, items.length - 1);
    session.current_index = position;
    persist();
    $$('.palette__item', element).forEach((item, index) => {
      item.classList.toggle('is-current', index === position);
      item.setAttribute('aria-current', index === position ? 'true' : 'false');
    });
    scrollToItem(position);
  });
  const paletteFor = (id) => $$('.palette__item', element)[itemIndexOf.get(id) ?? -1];
  on(element, 'input', '[data-answer]', (event, area) => {
    if (area.value.trim()) session.answers[area.dataset.answer] = area.value;
    else delete session.answers[area.dataset.answer];
    persist();
    if (scrollMode) paletteFor(area.dataset.answer)?.classList.toggle('is-answered', Boolean(session.answers[area.dataset.answer]));
  });
  on(element, 'click', '[data-flag]', (event, button) => {
    const id = button.dataset.flag;
    if (session.flagged[id]) delete session.flagged[id];
    else session.flagged[id] = true;
    persist();
    if (scrollMode) {
      // Update in place so the page keeps its scroll position.
      button.setAttribute('aria-pressed', String(Boolean(session.flagged[id])));
      const label = $('[data-flag-label]', button);
      if (label) label.textContent = session.flagged[id] ? 'Flagged' : 'Flag for review';
      paletteFor(id)?.classList.toggle('is-flagged', Boolean(session.flagged[id]));
      return;
    }
    draw({ focus: false });
  });
  on(element, 'click', '[data-pause]', () => {
    if (isRunning(session)) pauseTimer(session);
    else startTimer(session);
    persist();
    draw({ focus: false });
  });
  on(element, 'click', '[data-stopwatch]', () => {
    session.timer.mode = 'stopwatch';
    startTimer(session);
    persist();
    draw({ focus: false });
  });
  on(element, 'click', '[data-unreveal]', (event, button) => {
    session.revealed[button.dataset.unreveal] = false;
    persist();
    draw({ focus: false });
  });
  on(element, 'click', '[data-reveal]', (event, button) => {
    session.revealed[button.dataset.reveal] = true;
    persist();
    draw({ focus: false });
  });
  bindMarkPickers(element);
  on(element, 'change', '[data-marks]', (event, input) => {
    setMarks(input, input.value);
    if (each && session.status === 'in_progress') advanceAfterMark();
  });
  on(element, 'input', '[data-total]', (event, input) => {
    session.total_awarded = input.value === '' ? null : clamp(Math.round(Number(input.value) || 0), 0, session.total_marks);
    const line = $('[data-markbar]', element);
    if (line) line.textContent = session.total_awarded == null ? 'Enter your total to finish' : `${session.total_awarded} out of ${session.total_marks}`;
    persist();
  });
  on(element, 'click', '[data-finish]', finishAnswering);
  on(element, 'click', '[data-retry-save]', complete);

  /** In mark-as-you-go mode, show a "Next" prompt once the current question has marks. */
  function advanceAfterMark() {
    const palette = $$('.palette__item', element);
    const item = items[itemAt(session.current_index)];
    if (item.questions.every((question) => session.marks[question.question_id] != null)) palette[itemAt(session.current_index)]?.classList.add('is-marked');
  }

  on(element, 'click', '[data-save-results]', async () => {
    if (wholePaper) {
      if (session.total_awarded == null) return toast(`Enter your total out of ${session.total_marks} first.`, { type: 'error' });
      return complete();
    }
    const unmarked = questions.length - markedCount();
    if (unmarked > 0) {
      const proceed = await confirmDialog({
        title: 'Some questions are not marked',
        message: unmarkedMessage(unmarked),
        confirmLabel: 'Save results',
      });
      if (!proceed) return undefined;
    }
    return complete();
  });

  // Exit links step back through history rather than adding a new entry, so the browser's
  // Back button never reopens a session the student has just left.
  on(element, 'click', '[data-exit]', (event) => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    leave();
  });

  on(element, 'click', '[data-restart]', async () => {
    const proceed = await confirmDialog({
      title: 'Restart this attempt?',
      message: 'Your typed answers, flags and marks in this attempt are cleared and the clock goes back to the start. Nothing from it is recorded.',
      cancelLabel: 'Keep going',
      confirmLabel: 'Restart',
    });
    if (!proceed) return;
    Object.assign(session, {
      answers: {},
      flagged: {},
      marks: {},
      revealed: {},
      current_index: 0,
      status: 'in_progress',
      total_awarded: null,
      time_up_noted: false,
      started_at: new Date().toISOString(),
      timer: { mode: session.timer.mode, elapsed_ms: 0, running_since: null },
    });
    if (session.timer.mode !== 'off') startTimer(session);
    await api.saveSession(session, { silent: true });
    draw();
    window.scrollTo(0, 0);
    toast('Restarted. Nothing from the earlier attempt was kept.', { type: 'info' });
  });

  on(element, 'click', '[data-abandon]', async () => {
    const proceed = await confirmDialog({
      title: 'Abandon this attempt?',
      message: 'You leave now and nothing from this attempt is saved: no answers, no marks and nothing in your Data Hub. Results you saved before are not affected.',
      cancelLabel: 'Keep going',
      confirmLabel: 'Abandon',
      danger: true,
    });
    if (!proceed) return;
    removed = true;
    await api.deleteSession(session.session_id);
    leave();
    toast('Attempt abandoned. Nothing was recorded.', { type: 'info' });
  });

  on(element, 'click', '[data-retry]', async () => {
    const retry = retrySession(session);
    await api.saveSession(retry, { silent: true });
    context.navigate(routeOf(links.session(retry.session_id)), { replace: true });
  });

  const saveOnHide = () => {
    if (document.visibilityState === 'hidden' && !removed) api.saveSession(session, { silent: true });
  };
  document.addEventListener('visibilitychange', saveOnHide);
  // Closing or reloading the tab stops the clock, so a test never runs on unattended.
  const pauseOnLeave = () => {
    if (removed) return;
    if (session.status === 'in_progress') pauseTimer(session);
    api.saveSession(session, { silent: true });
  };
  window.addEventListener('pagehide', pauseOnLeave);

  draw();

  return () => {
    clearInterval(interval);
    window.removeEventListener('scroll', onScroll);
    window.removeEventListener('resize', onResize);
    if (scrollFrame) cancelAnimationFrame(scrollFrame);
    document.removeEventListener('visibilitychange', saveOnHide);
    window.removeEventListener('pagehide', pauseOnLeave);
    // Skip if it was deleted, or the student signed out (it then belongs to another progress record).
    if (removed || !api.getSession(session.session_id)) return;
    if (session.status === 'in_progress') pauseTimer(session); // the clock only runs while the paper is open
    // Opening something to have a look should not leave an "in progress" attempt behind:
    // an attempt with nothing typed, flagged or marked, and under a minute on the clock, is dropped.
    const untouched =
      session.status === 'in_progress' &&
      !Object.keys(session.marks).length &&
      !Object.keys(session.answers).length &&
      !Object.keys(session.flagged).length &&
      (session.kind === 'single' || elapsedMs(session) < 60_000);
    removed = untouched;
    if (untouched) api.deleteSession(session.session_id);
    else if (session.status !== 'completed') api.saveSession(session, { silent: true });
  };
}
