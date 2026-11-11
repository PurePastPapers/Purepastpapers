// One paper: how to get it, sit it (timed or untimed), log a score, see its questions
// and your attempt history. Works for official, AI and predicted papers alike.

import { GRADE_SCHEMES, PAPER_TYPES } from '../../config/app.config.js';
import { $, html, isSafeUrl, on, setHtml } from '../../core/dom.js';
import { fmtDate, fmtMinutes, localDayKey, percent, plural, round1 } from '../../core/utils.js';
import * as api from '../../data/api.js';
import { getBundle, specIndex } from '../../data/content-repository.js';
import { createSession } from '../../data/sessions.js';
import { gradeFor, latestByQuestion, paperHistory, ragFor } from '../../engine/analytics.js';
import { missingSpecPoints, questionStatus } from '../../engine/filter-engine.js';
import { icon } from '../icons.js';
import { marksPill, questionSnippet } from '../question-view.js';
import { startSingle } from '../student.js';
import { banner, confirmDialog, difficultyBadge, emptyState, fmtPercent, openModal, pageHead, ragBadge, sourceBadge, toast } from '../ui.js';

const ROUTES = { real_past_paper: '/papers', ai_past_paper: '/ai-papers', predicted_paper: '/predicted' };

export async function mount(element, context) {
  const bundle = await getBundle(context.params.subjectId);
  const { subject } = bundle;
  const paper = bundle.papersById.get(context.params.paperId);
  if (!paper) {
    setHtml(element, emptyState({ iconName: 'file', title: 'Paper not found', text: 'It may have been removed.', action: html`<a class="btn" href="#/papers">Back to papers</a>` }));
    return;
  }
  context.setTitle(paper.title);
  const progress = api.getProgress();
  const learned = api.learnedSet();
  const latest = latestByQuestion(progress.question_attempts);
  const questions = paper.question_ids.map((id) => bundle.questionsById.get(id)).filter(Boolean);
  const locked = questions.filter((question) => missingSpecPoints(question, learned, specIndex).length > 0);
  const listRoute = ROUTES[paper.paper_type] || '/papers';
  const openSession = api.resumableSessions().find((session) => session.paper_id === paper.paper_id);
  const pdf = isSafeUrl(paper.full_paper_pdf_url) ? paper.full_paper_pdf_url : null;
  const markScheme = isSafeUrl(paper.full_mark_scheme_pdf_url) ? paper.full_mark_scheme_pdf_url : null;

  function attemptsCard() {
    const attempts = paperHistory(progress.paper_attempts).filter((attempt) => attempt.paper_id === paper.paper_id);
    return html`<section class="card">
      <div class="card__head"><h2 class="card__title">Your attempts</h2></div>
      ${attempts.length
        ? html`<div class="table-wrap">
              <table class="table table--compact">
                <thead>
                  <tr><th>Date</th><th class="num">Score</th><th>Result</th><th><span class="sr-only">Actions</span></th></tr>
                </thead>
                <tbody>
                  ${attempts.map(
                    (attempt, index) =>
                      html`<tr>
                        <td>${fmtDate(attempt.timestamp)}</td>
                        <td class="num">${attempt.marks_awarded}/${attempt.max_marks}</td>
                        <td>
                          ${ragBadge(ragFor(attempt.percentage), attempt.percentage, { label: false })}
                          ${attempt.grade ? html`<span class="tag">Grade ${attempt.grade}</span>` : ''}
                        </td>
                        <td class="right">
                          ${attempt.session_id && api.getSession(attempt.session_id)
                            ? html`<a class="btn btn--sm btn--ghost" href="#/session/${attempt.session_id}">Review</a>`
                            : ''}
                          <button type="button" class="btn btn--sm btn--ghost btn--icon" data-delete-attempt="${index}" aria-label="Delete this attempt">
                            ${icon('trash', { size: 15 })}
                          </button>
                        </td>
                      </tr>`,
                  )}
                </tbody>
              </table>
            </div>
            <p class="small muted" style="margin-top:10px">
              Grades are indicative (${GRADE_SCHEMES[subject.grade_scheme]?.label}): real boundaries change with every paper and series.
            </p>`
        : html`<p class="muted small">No attempts yet. Sit the paper, or log a score if you have already done it on paper.</p>`}
    </section>`;
  }

  setHtml(
    element,
    html`${pageHead({
        crumbs: [{ label: PAPER_TYPES[paper.paper_type]?.plural || 'Papers', href: `#${listRoute}?subject=${subject.subject_id}` }, { label: subject.subject }],
        title: paper.title,
        badge: sourceBadge(paper),
        sub: html`<span class="mono">${subject.board} · ${subject.spec_code}</span> · ${paper.total_marks} marks · ${fmtMinutes(paper.duration_minutes)}${paper.tier ? ` · ${paper.tier} tier` : ''}`,
        actions: openSession
          ? html`<a class="btn btn--primary" href="#/session/${openSession.session_id}">${icon('play', { size: 16 })} Resume paper</a>`
          : html`<button type="button" class="btn btn--primary" data-start="timed">${icon('clock')} Sit timed (${fmtMinutes(paper.duration_minutes)})</button>
              <button type="button" class="btn" data-start="untimed">Sit untimed</button>
              <button type="button" class="btn" data-log>Log a score</button>`,
      })}
      <div class="split">
        <div class="stack">
          ${paper.is_sample ? banner(paper.sample_note || 'Demo content.', { type: 'demo' }) : ''}
          <section class="card">
            <div class="card__head"><h2 class="card__title">Get the paper</h2></div>
            ${pdf || markScheme
              ? html`<div class="row">
                  ${pdf ? html`<a class="btn" href="${pdf}" target="_blank" rel="noopener">${icon('file')} Question paper (PDF)</a>` : ''}
                  ${markScheme ? html`<a class="btn" href="${markScheme}" target="_blank" rel="noopener">${icon('checkCircle')} Mark scheme (PDF)</a>` : ''}
                </div>`
              : questions.length
                ? html`<p class="muted">This paper is available here question by question, with its mark scheme.</p>`
                : html`<p class="muted">
                      The PDF for this paper is not hosted here. Open ${subject.board}'s past papers page and look for the
                      <strong>${paper.series} ${paper.year}</strong> series, <strong>${paper.title.replace(`${paper.series} ${paper.year} `, '')}</strong>. Then sit it here
                      against the clock and log your marks.
                    </p>
                    ${paper.official_source_url
                      ? html`<p style="margin-top:12px">
                          <a class="btn" href="${paper.official_source_url}" target="_blank" rel="noopener">Open ${subject.board} past papers ${icon('external', { size: 15 })}</a>
                        </p>`
                      : ''}`}
          </section>
          <section class="card">
            <div class="card__head">
              <h2 class="card__title">Questions</h2>
              ${questions.length ? html`<span class="small muted">${plural(questions.length, 'question')} · ${paper.total_marks} marks</span>` : ''}
            </div>
            ${questions.length
              ? html`${locked.length
                    ? banner(html`${plural(locked.length, 'question')} on this paper ${locked.length === 1 ? 'needs' : 'need'} topics you have not marked as learned. <a href="#/subject/${subject.subject_id}">Update learned topics</a>`, { type: 'warn' })
                    : ''}
                  <ol class="paper-questions">
                    ${questions.map((question) => {
                      const missing = missingSpecPoints(question, learned, specIndex);
                      const status = questionStatus(question, latest);
                      const attempt = latest.get(question.question_id);
                      return html`<li>
                        <span class="paper-questions__num">Q${question.question_number}</span>
                        <div style="min-width:0">
                          <p class="paper-questions__text">${questionSnippet(question, 110)}</p>
                          <p class="row row--tight small muted">
                            ${difficultyBadge(question.difficulty)}
                            ${[...new Set(question.primary_spec_points.map((id) => specIndex.topicOf(id)?.title || specIndex.label(id)))].map((topic) => html`<span class="tag">${topic}</span>`)}
                            ${missing.length ? html`<span class="tag" title="${missing.map((id) => specIndex.label(id)).join('; ')}">${icon('lock', { size: 13 })} needs ${plural(missing.length, 'more spec point')}</span>` : ''}
                            ${attempt ? ragBadge(status, percent(attempt.marks_awarded, attempt.max_marks), { label: false }) : ''}
                          </p>
                        </div>
                        <span class="row row--tight row--nowrap">${marksPill(question.marks)}<button type="button" class="btn btn--sm" data-open="${question.question_id}">Practise</button></span>
                      </li>`;
                    })}
                  </ol>`
              : html`<p class="muted">
                  Individual questions from this paper have not been extracted yet, so it is sat as a whole paper and scored as one total. Once its questions
                  are added they appear here with topic tags, and feed the customisable practice pool.
                </p>`}
          </section>
        </div>
        <aside class="stack" data-attempts>${attemptsCard()}</aside>
      </div>`,
  );

  async function start(timed) {
    const session = createSession({
      kind: 'full_paper',
      subject_id: subject.subject_id,
      title: paper.title,
      question_ids: paper.question_ids,
      paper_id: paper.paper_id,
      paper_type: paper.paper_type,
      time_limit_minutes: timed ? paper.duration_minutes : null,
      timer: timed ? 'countdown' : 'off',
      mark_mode: 'end',
      total_marks: paper.total_marks,
    });
    await api.saveSession(session, { silent: true });
    context.navigate(`/session/${session.session_id}`);
  }

  on(element, 'click', '[data-start]', (event, button) => start(button.dataset.start === 'timed'));
  on(element, 'click', '[data-open]', (event, button) => startSingle(bundle.questionsById.get(button.dataset.open), context.navigate));

  on(element, 'click', '[data-log]', async () => {
    const entry = await openModal({
      title: 'Log a score',
      body: html`<div class="stack">
        <p class="muted">Already sat this paper on paper? Record your mark to add it to your Data Hub.</p>
        <label class="field">
          <span class="field__label">Marks out of ${paper.total_marks}</span>
          <input class="input" type="number" name="marks" min="0" max="${paper.total_marks}" step="1" inputmode="numeric" required />
        </label>
        <label class="field">
          <span class="field__label">Date sat</span>
          <input class="input" type="date" name="date" value="${localDayKey(new Date())}" max="${localDayKey(new Date())}" required />
        </label>
      </div>`,
      actions: [
        { label: 'Cancel', cancel: true },
        {
          label: 'Save score',
          variant: 'primary',
          validate: (dialog) => {
            const marks = Number($('[name="marks"]', dialog).value);
            if ($('[name="marks"]', dialog).value === '' || !Number.isInteger(marks) || marks < 0 || marks > paper.total_marks) {
              return `Enter a whole number of marks from 0 to ${paper.total_marks}.`;
            }
            return $('[name="date"]', dialog).value ? null : 'Choose the date you sat the paper.';
          },
          collect: (dialog) => ({ marks: Number($('[name="marks"]', dialog).value), date: $('[name="date"]', dialog).value }),
        },
      ],
    });
    if (!entry) return;
    const percentage = round1(percent(entry.marks, paper.total_marks));
    await api.addPaperAttempt({
      paper_id: paper.paper_id,
      paper_type: paper.paper_type,
      marks_awarded: entry.marks,
      max_marks: paper.total_marks,
      percentage,
      timestamp: new Date(`${entry.date}T12:00:00`).toISOString(),
      subject_id: subject.subject_id,
      title: paper.title,
      session_kind: 'logged',
      grade: gradeFor(percentage, subject.grade_scheme, paper.grade_boundaries),
    });
    setHtml($('[data-attempts]', element), attemptsCard());
    toast(`Saved: ${entry.marks}/${paper.total_marks} (${fmtPercent(percentage)}).`, { type: 'success' });
  });

  on(element, 'click', '[data-delete-attempt]', async (event, button) => {
    const attempts = paperHistory(progress.paper_attempts).filter((attempt) => attempt.paper_id === paper.paper_id);
    const attempt = attempts[Number(button.dataset.deleteAttempt)];
    if (!attempt) return;
    const confirmed = await confirmDialog({
      title: 'Delete this attempt?',
      message: `Your score of ${attempt.marks_awarded}/${attempt.max_marks} from ${fmtDate(attempt.timestamp)} will be removed from your history.`,
      confirmLabel: 'Delete',
      danger: true,
    });
    if (!confirmed) return;
    await api.deletePaperAttempt(attempt);
    setHtml($('[data-attempts]', element), attemptsCard());
  });
}
