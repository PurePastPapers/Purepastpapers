// The session runner: sit a paper, a timed test or a set of questions, mark it against the
// mark scheme, and review the result. One view, three stages:
//   in_progress → answering          marking → self-marking (papers and tests)
//   completed   → results and review
// Marking goes through the provider in engine/marking.js, so AI marking (Phase 4) slots in
// without changing this view.

import { isEnabled } from '../../config/phases.js';
import { $, $$, html, isSafeUrl, on, setHtml } from '../../core/dom.js';
import { clamp, debounce, fmtClock, fmtDate, fmtDuration, fmtMinutes, percent, plural, sum } from '../../core/utils.js';
import * as api from '../../data/api.js';
import { getBundle, specIndex } from '../../data/content-repository.js';
import { createSession, elapsedMs, finishSession, isRunning, pauseTimer, remainingSeconds, startTimer } from '../../data/sessions.js';
import { byDifficulty, paperHistory, ragFor, TARGET_BANDS, targetBand } from '../../engine/analytics.js';
import { targetGrade } from '../subject-colours.js';
import { icon } from '../icons.js';
import { markSchemeBody, marksPill, questionBody } from '../question-view.js';
import { banner, confirmDialog, difficultyBadge, emptyState, fmtPercent, meter, soonBadge, sourceBadge, toast } from '../ui.js';

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
        action: html`<a class="btn btn--primary" href="#/">Back to the dashboard</a>`,
      }),
    );
    return undefined;
  }

  const bundle = await getBundle(session.subject_id);
  const { subject } = bundle;
  const paper = bundle.papersById.get(session.paper_id) || api.getCustomTest(session.paper_id) || null;
  const questions = session.question_ids.map((id) => bundle.questionsById.get(id)).filter(Boolean);
  const wholePaper = questions.length === 0; // sat from the PDF and scored as one total
  const each = session.mark_mode === 'each';
  session.revealed ||= {};
  context.setTitle(session.title);
  element.classList.add('view--runner');

  const backHref =
    session.kind === 'full_paper' && bundle.papersById.has(session.paper_id)
      ? `#/paper/${subject.subject_id}/${encodeURIComponent(session.paper_id)}`
      : `#/practice?subject=${subject.subject_id}`;
  let removed = false; // set once the session has been deleted, so a late save cannot bring it back
  const persist = debounce(() => {
    if (!removed) api.saveSession(session, { silent: true });
  }, 400);
  const topicOf = (question) => specIndex.topicOf(question.primary_spec_points[0])?.title || 'Other';
  const markedCount = () => questions.filter((question) => session.marks[question.question_id] != null).length;

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

  function bar({ stage }) {
    const running = isRunning(session);
    const timed = session.timer.mode !== 'off';
    return html`<header class="card runner__bar">
      <a class="btn btn--sm" href="${backHref}">${icon('chevronLeft', { size: 16 })} ${stage === 'run' ? 'Save and exit' : stage === 'result' && session.kind === 'full_paper' ? 'Back to the paper' : 'Back'}</a>
      <div class="runner__title">
        <p class="h3">${session.title}</p>
        <p class="small muted">${subject.level} ${subject.subject} · ${KIND_LABELS[session.kind]}</p>
      </div>
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
      ${stage === 'run' && !timed && !wholePaper
        ? html`<button type="button" class="btn btn--sm" data-stopwatch>${icon('stopwatch', { size: 16 })} Start stopwatch</button>`
        : ''}
      ${stage === 'run' && !wholePaper
        ? html`<button type="button" class="btn btn--sm btn--primary" data-finish>${each ? 'Finish' : 'Finish and mark'}</button>`
        : ''}
    </header>`;
  }

  function marksInput(question) {
    const value = session.marks[question.question_id];
    const half = Math.round(question.marks / 2);
    return html`<div class="markbox" data-markbox="${question.question_id}">
      <span class="field__label">Marks awarded</span>
      <div class="row row--tight row--nowrap">
        <button type="button" class="btn btn--icon btn--sm" data-step="-1" aria-label="One mark fewer">${icon('minus', { size: 16 })}</button>
        <input
          class="input input--num"
          type="number"
          min="0"
          max="${question.marks}"
          step="1"
          inputmode="numeric"
          value="${value ?? ''}"
          data-marks="${question.question_id}"
          aria-label="Marks awarded out of ${question.marks}"
        />
        <button type="button" class="btn btn--icon btn--sm" data-step="1" aria-label="One mark more">${icon('plus', { size: 16 })}</button>
        <span class="muted nowrap">out of ${question.marks}</span>
      </div>
      <div class="chips">
        <button type="button" class="chip" data-set="0">0</button>
        ${question.marks > 2 ? html`<button type="button" class="chip" data-set="${half}">${half}</button>` : ''}
        <button type="button" class="chip" data-set="${question.marks}">Full marks</button>
      </div>
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
      <p class="small muted">Your answers are saved in this browser.</p>
    </section>`;
  };

  function drawRun() {
    if (wholePaper) return drawWholePaper();
    const index = clamp(session.current_index, 0, questions.length - 1);
    const question = questions[index];
    const id = question.question_id;
    const last = index === questions.length - 1;
    const revealed = Boolean(session.revealed[id]);

    setHtml(
      element,
      html`<div class="runner">
        ${bar({ stage: 'run' })}
        ${questions.length > 1
          ? html`<nav class="palette" aria-label="Questions">
              ${questions.map((item, position) => {
                const state = [
                  position === index ? 'is-current' : '',
                  session.answers[item.question_id] ? 'is-answered' : '',
                  session.flagged[item.question_id] ? 'is-flagged' : '',
                  session.marks[item.question_id] != null ? 'is-marked' : '',
                ].join(' ');
                const notes = [session.flagged[item.question_id] ? 'flagged' : '', session.marks[item.question_id] != null ? 'marked' : ''].filter(Boolean).join(', ');
                return html`<button type="button" class="palette__item ${state}" data-go="${position}" aria-label="Question ${position + 1}${notes ? ` (${notes})` : ''}" aria-current="${position === index ? 'true' : 'false'}">
                  ${position + 1}
                </button>`;
              })}
              <span class="hand palette__key">blue = answered, red dot = flagged</span>
            </nav>`
          : ''}
        ${paused()
          ? pausedPanel()
          : html`<div class="runner__grid">
        <article class="card ruled tilt-1 qview">
          <i class="tape tape--c" aria-hidden="true"></i>
          <header class="qview__head">
            <h1 class="qview__num" tabindex="-1">
              ${questions.length > 1
                ? html`Question ${index + 1}<span class="muted"> of ${questions.length}</span>`
                : html`Question ${question.question_number}`}
            </h1>
            <div class="row row--tight">${marksPill(question.marks)} ${difficultyBadge(question.difficulty)} ${sourceBadge(question)}</div>
          </header>
          ${questionBody(question)}
        </article>
        <div class="stack">
        <section class="card ruled tilt-3 answer-card">
          <i class="tape tape--c" aria-hidden="true"></i>
          <label class="field">
            <span class="card__title">Your answer</span>
            <span class="hand">optional: type here, it saves as you go, or answer on paper</span>
            <textarea class="textarea" data-answer="${id}" placeholder="Type your working or essay here.">${session.answers[id] || ''}</textarea>
          </label>
        </section>
        ${each
          ? html`<section class="card stack">
              ${revealed
                ? html`<h2 class="card__title">Mark scheme</h2>
                    ${markSchemeBody(question)} ${marksInput(question)} ${aiMarkingNote()}`
                : html`<div class="row row--between">
                    <div>
                      <h2 class="card__title">Ready to mark?</h2>
                      <p class="small muted">Compare your answer with the mark scheme and award yourself the marks.</p>
                    </div>
                    <button type="button" class="btn btn--primary" data-reveal="${id}">${icon('eye', { size: 16 })} Show mark scheme</button>
                  </div>`}
            </section>`
          : ''}
        </div>
        </div>
        <footer class="runner__nav">
          <button type="button" class="btn" data-flag="${id}" aria-pressed="${Boolean(session.flagged[id])}">
            ${icon('flag', { size: 16 })} ${session.flagged[id] ? 'Flagged' : 'Flag for review'}
          </button>
          <span class="spacer"></span>
          ${questions.length > 1
            ? html`<button type="button" class="btn" data-go="${index - 1}" ${index === 0 ? 'disabled' : ''}>${icon('chevronLeft', { size: 16 })} Previous</button>`
            : ''}
          ${last
            ? html`<button type="button" class="btn btn--primary" data-finish>${each ? 'Finish' : 'Finish and mark'}</button>`
            : html`<button type="button" class="btn btn--primary" data-go="${index + 1}">Next ${icon('chevronRight', { size: 16 })}</button>`}
        </footer>`}
      </div>`,
    );
    return undefined;
  }

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
                    <h2 class="h2">Question ${index + 1}</h2>
                    <div class="row row--tight">${session.flagged[question.question_id] ? html`<span class="tag">${icon('flag', { size: 13 })} Flagged</span>` : ''} ${marksPill(question.marks)}</div>
                  </header>
                  <details class="fold">
                    <summary>Show the question</summary>
                    ${questionBody(question)}
                  </details>
                  ${answerBlock(question)}
                  <div><p class="label" style="margin-bottom:6px">Mark scheme</p>${markSchemeBody(question)}</div>
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
        <section class="card ruled result-hero">
          <i class="tape tape--c" aria-hidden="true"></i>
          <div class="result-hero__left">
            <p class="hand">${KIND_LABELS[session.kind].toLowerCase()} complete</p>
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
              <a class="btn btn--primary" href="${backHref}">${session.kind === 'full_paper' ? 'Back to the paper' : 'More practice'}</a>
              <a class="btn" href="#/hub">Open the Data Hub</a>
              ${questions.length ? html`<button type="button" class="btn" data-retry>${icon('refresh', { size: 16 })} ${session.kind === 'full_paper' ? 'Sit it again' : 'Try these again'}</button>` : ''}
            </div>
            <p class="small muted"><span class="rag-dot" data-rag="green" style="width:10px;height:10px;vertical-align:-1px"></span> Saved in this browser and added to your Data Hub.</p>
          </div>
        </section>
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
                    <span class="fold__title">Question ${index + 1}</span>
                    <span class="tag">${topicOf(question)}</span>
                    ${session.answers[question.question_id] ? '' : html`<span class="small muted">not typed</span>`}
                    <span class="spacer"></span>
                    ${marks == null ? html`<span class="small muted">Not marked</span>` : html`<span class="rag-dot" data-rag="${ragFor(share)}"></span><span class="review-card__marks">${marks}/${question.marks}</span>`}
                  </summary>
                  <div class="stack" style="padding-top:12px">
                    ${questionBody(question)} ${answerBlock(question)}
                    <div><p class="label" style="margin-bottom:6px">Mark scheme</p>${markSchemeBody(question)}</div>
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

  async function complete() {
    await finishSession(session, { questions, subject, paper, totalAwarded: session.total_awarded });
    draw();
    window.scrollTo(0, 0);
    toast('Results saved to your Data Hub.', { type: 'success' });
  }

  async function finishAnswering() {
    if (each) {
      if (markedCount() === 0) {
        const leave = await confirmDialog({
          title: 'Nothing has been marked',
          message: 'No marks have been saved in this session, so nothing will be recorded. Leave anyway?',
          confirmLabel: 'Leave',
        });
        if (!leave) return;
        removed = true;
        await api.deleteSession(session.session_id);
        location.hash = backHref;
        return;
      }
      const unmarked = questions.length - markedCount();
      if (unmarked > 0) {
        const proceed = await confirmDialog({
          title: 'Finish now?',
          message: `${plural(unmarked, 'question')} ${unmarked === 1 ? 'has' : 'have'} not been marked and will be left out of your results.`,
          confirmLabel: 'Finish',
        });
        if (!proceed) return;
      }
      return complete();
    }
    const remaining = remainingSeconds(session);
    const clockLine = remaining !== null && remaining > 0 ? `The clock stops with ${fmtClock(remaining)} left` : 'The clock stops';
    const numbers = (list) => list.map((question) => `Q${questions.indexOf(question) + 1}`).join(', ');
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
  on(element, 'input', '[data-answer]', (event, area) => {
    if (area.value.trim()) session.answers[area.dataset.answer] = area.value;
    else delete session.answers[area.dataset.answer];
    persist();
  });
  on(element, 'click', '[data-flag]', (event, button) => {
    const id = button.dataset.flag;
    if (session.flagged[id]) delete session.flagged[id];
    else session.flagged[id] = true;
    persist();
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
  on(element, 'click', '[data-reveal]', (event, button) => {
    session.revealed[button.dataset.reveal] = true;
    persist();
    draw({ focus: false });
  });
  on(element, 'click', '[data-step], [data-set]', (event, button) => {
    const input = $('[data-marks]', button.closest('[data-markbox]'));
    const next = button.dataset.set != null ? Number(button.dataset.set) : (Number(input.value) || 0) + Number(button.dataset.step);
    setMarks(input, next);
    if (each && session.status === 'in_progress') advanceAfterMark();
  });
  on(element, 'change', '[data-marks]', (event, input) => setMarks(input, input.value));
  on(element, 'input', '[data-total]', (event, input) => {
    session.total_awarded = input.value === '' ? null : clamp(Math.round(Number(input.value) || 0), 0, session.total_marks);
    const line = $('[data-markbar]', element);
    if (line) line.textContent = session.total_awarded == null ? 'Enter your total to finish' : `${session.total_awarded} out of ${session.total_marks}`;
    persist();
  });
  on(element, 'click', '[data-finish]', finishAnswering);

  /** In mark-as-you-go mode, show a "Next" prompt once the current question has marks. */
  function advanceAfterMark() {
    const palette = $$('.palette__item', element);
    palette[session.current_index]?.classList.add('is-marked');
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
        message: `${plural(unmarked, 'question')} ${unmarked === 1 ? 'has' : 'have'} no marks entered and will be scored 0.`,
        confirmLabel: 'Save results',
      });
      if (!proceed) return undefined;
    }
    return complete();
  });

  on(element, 'click', '[data-retry]', async () => {
    const retry = createSession({
      kind: session.kind === 'full_paper' ? 'question_set' : session.kind,
      subject_id: session.subject_id,
      title: session.title,
      question_ids: [...session.question_ids],
      paper_id: session.kind === 'custom_test' ? session.paper_id : null,
      paper_type: session.kind === 'custom_test' ? session.paper_type : 'user_custom_test',
      time_limit_minutes: session.time_limit_minutes,
      timer: session.time_limit_minutes ? 'countdown' : 'off',
      mark_mode: session.mark_mode,
      total_marks: session.total_marks,
    });
    await api.saveSession(retry, { silent: true });
    context.navigate(`/session/${retry.session_id}`);
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
    document.removeEventListener('visibilitychange', saveOnHide);
    window.removeEventListener('pagehide', pauseOnLeave);
    if (removed || !api.isSignedIn()) return;
    if (session.status === 'in_progress') pauseTimer(session); // the clock only runs while the paper is open
    const untouched = session.kind === 'single' && session.status === 'in_progress' && !Object.keys(session.marks).length && !Object.keys(session.answers).length;
    removed = untouched;
    if (untouched) api.deleteSession(session.session_id);
    else if (session.status !== 'completed') api.saveSession(session, { silent: true });
  };
}
