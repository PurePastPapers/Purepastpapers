// One paper: how to get it, sit it (timed or untimed), log a score, see its questions
// and your attempt history. Works for official, AI and predicted papers alike.

import { GRADE_SCHEMES, PAPER_TYPES } from '../../config/app.config.js';
import { $, html, isSafeUrl, on, setHtml } from '../../core/dom.js';
import { links, routeOf } from '../../core/links.js';
import { fmtDate, fmtMinutes, localDayKey, percent, plural, round1 } from '../../core/utils.js';
import * as api from '../../data/api.js';
import { getBundle, specIndex } from '../../data/content-repository.js';
import { loadReportIndex, reportSourceUrl } from '../../data/examiner-reports.js';
import { createSession } from '../../data/sessions.js';
import { gradeFor, latestByQuestion, paperHistory, ragFor, TARGET_BANDS, targetBand } from '../../engine/analytics.js';
import { missingSpecPoints, questionStatus } from '../../engine/filter-engine.js';
import { collapseLinked, expandLinkedIds } from '../../engine/linked-parts.js';
import { levelLabel, qualificationCode } from '../../engine/paper-identity.js';
import { paperChoiceGroups, paperQuestionSelection, paperSessionQuestionIds } from '../../engine/paper-choice.js';
import { icon } from '../icons.js';
import { assessmentResourceLinks } from '../assessment-resources.js';
import { linkedRef, marksPill, questionRef, questionSnippet } from '../question-view.js';
import { startSingle } from '../student.js';
import { targetGrade } from '../subject-colours.js';
import { banner, confirmDialog, difficultyBadge, emptyState, fmtPercent, groupDot, openModal, pageHead, sourceBadge, toast } from '../ui.js';

export async function mount(element, context) {
  const [bundle] = await Promise.all([getBundle(context.params.subjectId), loadReportIndex()]);
  const { subject } = bundle;
  const paper = bundle.papersById.get(context.params.paperId);
  if (!paper) {
    setHtml(element, emptyState({ iconName: 'file', title: 'Paper not found', text: 'It may have been removed.', action: html`<a class="btn" href="${links.papers()}">Back to past papers</a>` }));
    return;
  }
  context.setTitle(paper.title);
  const progress = api.getProgress();
  const learned = api.learnedSet();
  const latest = latestByQuestion(progress.question_attempts);
  const questions = paper.question_ids.map((id) => bundle.questionsById.get(id)).filter(Boolean);
  const practiceQuestions = collapseLinked(questions, bundle.questionsById);
  const locked = practiceQuestions.filter((question) => missingSpecPoints(question, learned, specIndex).length > 0);
  const openSession = api.resumableSessions().find((session) => session.paper_id === paper.paper_id);
  const pdf = isSafeUrl(paper.full_paper_pdf_url) ? paper.full_paper_pdf_url : null;
  const examinerReport = reportSourceUrl(paper);
  const markScheme = isSafeUrl(paper.full_mark_scheme_pdf_url) ? paper.full_mark_scheme_pdf_url : null;
  const sourceLinks = assessmentResourceLinks(paper, { className: 'btn btn--block btn--left' });

  const target = targetGrade(subject);
  const schemeBands = GRADE_SCHEMES[subject.grade_scheme]?.bands || [];
  const bounds = paper.grade_boundaries?.length
    ? [...paper.grade_boundaries].sort((a, b) => b.min_percentage - a.min_percentage).map((b) => [b.grade, b.min_percentage])
    : schemeBands;
  const officialBounds = Boolean(paper.grade_boundaries?.length);
  const SHOW_FIRST = 7;
  let showAll = false;

  function attemptsCard() {
    const attempts = paperHistory(progress.paper_attempts).filter((attempt) => attempt.paper_id === paper.paper_id);
    return html`<section class="card ruled tilt-2 paper-attempts">
      <i class="tape tape--c" aria-hidden="true"></i>
      <h2 class="card__title">Your attempts</h2>
      ${attempts.length
        ? html`<ul class="attempt-list">
              ${attempts.map((attempt, index) => {
                const band = target && attempt.grade ? targetBand(attempt.grade, target, subject.grade_scheme) : null;
                const session = attempt.session_id && api.getSession(attempt.session_id);
                return html`<li>
                  <span>${fmtDate(attempt.timestamp)}</span>
                  <b class="attempt-list__score">${attempt.marks_awarded}/${attempt.max_marks}</b>
                  <span class="rag-dot" data-rag="${ragFor(attempt.percentage)}" title="${fmtPercent(attempt.percentage)}"></span>
                  ${attempt.grade ? html`<span class="grade-stamp grade-stamp--sm" data-band="${band || ''}" title="${band ? TARGET_BANDS[band].label : `Grade ${attempt.grade}`}">${attempt.grade}</span>` : html`<span></span>`}
                  <span class="attempt-list__act">
                    ${session ? html`<a class="btn btn--sm" href="${links.session(attempt.session_id)}">Review</a>` : html`<span class="muted small">${attempt.session_kind === 'logged' ? 'logged' : ''}</span>`}
                    <button type="button" class="btn btn--sm btn--ghost btn--icon" data-delete-attempt="${index}" aria-label="Delete the attempt from ${fmtDate(attempt.timestamp)}">${icon('trash', { size: 15 })}</button>
                  </span>
                </li>`;
              })}
            </ul>
            <p class="small muted">${officialBounds ? 'Grades use this paper’s official grade boundaries.' : `Grades are indicative (${GRADE_SCHEMES[subject.grade_scheme]?.label}). Real boundaries change with every paper.`}</p>`
        : html`<p class="muted small">No attempts yet. Sit the paper here, or log a score if you have already done it on paper.</p>`}
    </section>`;
  }

  function questionRows() {
    const shown = showAll ? practiceQuestions : practiceQuestions.slice(0, SHOW_FIRST);
    return html`<ol class="paper-questions">
        ${shown.map((question) => {
          const missing = missingSpecPoints(question, learned, specIndex);
          const attempts = (question.part_ids || [question.question_id]).map((id) => latest.get(id));
          const marked = attempts.every(Boolean);
          const awarded = marked ? attempts.reduce((sum, attempt) => sum + attempt.marks_awarded, 0) : 0;
          const status = question.is_linked_group ? ragFor(percent(awarded, question.marks)) : questionStatus(question, latest);
          return html`<li>
            <span class="paper-questions__num ${question.is_linked_group || question.part_label ? 'paper-questions__num--part' : ''}">${question.is_linked_group ? linkedRef(question) : questionRef(question)}</span>
            <div style="min-width:0">
              <p class="paper-questions__text">${questionSnippet(question, 120)}</p>
              <p class="row row--tight small">
                ${difficultyBadge(question.difficulty)}
                ${[...new Set(question.primary_spec_points.map((id) => specIndex.topicOf(id)?.title || specIndex.label(id)))].map((topic) => html`<span class="tag">${topic}</span>`)}
                ${missing.length ? html`<span class="tag tag--locked" title="${missing.map((id) => specIndex.label(id)).join('; ')}">${icon('lock', { size: 13 })} needs ${plural(missing.length, 'topic')} you have not learned yet</span>` : ''}
                ${marked ? html`<span class="lasttime"><span class="rag-dot" data-rag="${status}"></span>last time ${awarded}/${question.marks}</span>` : ''}
              </p>
            </div>
            <span class="row row--tight row--nowrap">${marksPill(question.marks)}<button type="button" class="btn btn--sm" data-open="${question.question_id}">Practise</button></span>
          </li>`;
        })}
      </ol>
      ${practiceQuestions.length > SHOW_FIRST
        ? html`<p class="center" style="margin-top:14px"><button type="button" class="btn btn--sm" data-more>${showAll ? 'Show fewer questions' : `Show ${practiceQuestions.length - SHOW_FIRST} more questions`}</button></p>`
        : ''}`;
  }

  const time = `${paper.duration_label || fmtMinutes(paper.duration_minutes)}${paper.component_of ? ' practice' : ''}`;
  const facts = [levelLabel(paper, subject, bundle.papers), subject.board, paper.official_paper_code || `${qualificationCode(paper, subject)}${paper.paper_code ? `/${paper.paper_code}` : ''}`, paper.pearson_series || (paper.year ? `${paper.series} ${paper.year}` : null), `${paper.total_marks} marks`, time, paper.tier ? `${paper.tier} tier` : null]
    .filter(Boolean)
    .join(' · ');

  setHtml(
    element,
    html`${pageHead({
        crumbs: [
          { label: 'Home', href: links.home() },
          { label: PAPER_TYPES[paper.paper_type]?.plural === 'Official past papers' ? 'Past papers' : PAPER_TYPES[paper.paper_type]?.plural || 'Papers', href: links.papers(null, paper.paper_type) },
          { label: subject.subject, href: links.papers(subject.subject_id, paper.paper_type, progress.enrolled_subjects.includes(subject.subject_id) ? null : paper.tier) },
          ...(paper.year ? [{ label: `${paper.series} ${paper.year}` }] : []),
        ],
        title: paper.title.replace(paper.year ? `${paper.series} ${paper.year} ` : '', ''),
        actions: openSession
          ? html`<a class="btn btn--primary" href="${links.session(openSession.session_id)}">${icon('play', { size: 16 })} Resume paper</a>
              <button type="button" class="btn" data-discard-open>${icon('x', { size: 16 })} Discard attempt</button>`
          : paper.resources_only ? '' : html`<button type="button" class="btn btn--primary" data-start="timed">${icon('clock')} Sit timed (${time})</button>
              <button type="button" class="btn" data-start="untimed">Sit untimed</button>
              <button type="button" class="btn" data-log>Log a score</button>`,
      })}
      <p class="row row--tight paper-facts">
        <span class="tag">${groupDot(subject)} ${paper.level || subject.level} ${subject.subject}</span>
        ${sourceBadge(paper)}
        <span class="muted">${facts}</span>
      </p>
      ${paper.duration_note ? html`<p class="small muted">${paper.duration_note}</p>` : ''}
      ${paper.is_sample ? banner(paper.sample_note || 'Demo content.', { type: 'demo' }) : ''}
      <div class="split paper-layout">
        <section class="card ruled tilt-1 paper-qs">
          <i class="tape tape--c" aria-hidden="true"></i>
          <div class="section-title">
            <h2 class="card__title">${paper.resources_only ? 'Assessment resources' : 'Questions'}</h2>
            ${practiceQuestions.length ? html`<span class="hand">choose a question to practise</span><span class="small muted paper-qs__count">${plural(practiceQuestions.length, 'question')} · ${paper.total_marks} marks</span>` : ''}
          </div>
          ${paper.choice_note ? html`<p class="small muted">${paper.choice_note}</p>` : ''}
          ${questions.length
            ? html`${locked.length
                  ? banner(html`${plural(locked.length, 'question')} on this paper ${locked.length === 1 ? 'needs a topic' : 'need topics'} you have not marked as learned. <a href="${links.subject(subject.subject_id)}">Update learned topics</a>`, { type: 'warn' })
                  : ''}
                <div data-questions>${questionRows()}</div>`
            : paper.assessment_note ? html`<p class="muted">${paper.assessment_note}</p>` : paper.component_of ? html`<div class="empty paper-qs__whole">
                <h3 class="empty__title">Practise this component from the PDF</h3>
                <p class="empty__text">Open the question paper, then log your score for this component. Individual questions will appear here once they are available in Practice.</p>
              </div>` : html`<div class="empty paper-qs__whole">
                <h3 class="empty__title">Sat as a whole paper</h3>
                <p class="empty__text">This paper’s questions have not been split out yet, so you sit it from the PDF and score it as one total. Once its questions are added they appear here with topic tags and feed Practice.</p>
              </div>`}
        </section>
        <aside class="stack">
          <section class="card ruled tilt-3">
            <i class="tape tape--c" aria-hidden="true"></i>
            <h2 class="card__title">${paper.resources_only ? 'Official links' : 'Get the paper'}</h2>
            ${paper.source_bundle_url ? html`<a class="btn btn--block btn--left" href="${paper.source_bundle_url}" target="_blank" rel="noopener">Official assessment source bundle (ZIP)</a>` : ''}
            ${pdf || markScheme || examinerReport || sourceLinks.length
              ? html`<div class="stack stack--sm">
                  ${pdf ? html`<a class="btn btn--block btn--left" href="${pdf}" target="_blank" rel="noopener">${icon('file')} Question paper (PDF)</a>` : ''}
                  ${sourceLinks}
                  ${examinerReport ? html`<a class="btn btn--block btn--left" href="${examinerReport}" target="_blank" rel="noopener">Official examiner’s report (PDF)</a>` : ''}
                  ${markScheme ? html`<a class="btn btn--block btn--left" href="${markScheme}" target="_blank" rel="noopener">${icon('check')} Mark scheme (PDF)</a>` : ''}
                </div>`
              : questions.length
                ? html`<p class="muted">This paper is here question by question, with its mark scheme.</p>`
                : html`${paper.resources_only ? '' : html`<p class="muted">
                      Open ${subject.board}’s past papers page and look for the <strong>${paper.series} ${paper.year}</strong> series,
                      <strong>${paper.title.replace(`${paper.series} ${paper.year} `, '')}</strong>.
                    </p>`}
                    ${paper.official_source_url
                      ? html`<p style="margin-top:12px"><a class="btn btn--block" href="${paper.official_source_url}" target="_blank" rel="noopener">Open ${subject.board} past papers ${icon('external', { size: 15 })}</a></p>`
                      : ''}`}
            ${bounds.length && !paper.resources_only
              ? html`<p class="field__label" style="margin-top:20px">${officialBounds ? `Grade boundaries${paper.year ? ` · ${paper.series} ${paper.year}` : ''}` : 'Indicative grade boundaries'}</p>
                  <div class="boundaries">
                    ${bounds.map(([grade, minimum]) => html`<span>${grade}<b>${Math.ceil((minimum / 100) * paper.total_marks)}</b></span>`)}
                  </div>
                  <p class="small muted" style="margin-top:8px">
                    Out of ${paper.total_marks}. ${officialBounds ? `From ${subject.board}, used for your grade on this paper.` : 'Typical boundaries for the level, not this paper’s official ones.'}
                  </p>`
              : ''}
          </section>
          ${paper.resources_only && !paperHistory(progress.paper_attempts).some(attempt => attempt.paper_id === paper.paper_id) ? '' : html`<div data-attempts>${attemptsCard()}</div>`}
        </aside>
      </div>`,
  );

  on(element, 'click', '[data-more]', () => {
    showAll = !showAll;
    setHtml($('[data-questions]', element), questionRows());
  });

  async function chooseQuestions() {
    const groups = paperChoiceGroups(paper);
    if (!groups.length) return paper.question_ids;
    const choices = (dialog) => groups.map((_, index) =>
      [...dialog.querySelectorAll(`[name="paper-option-${index}"]:checked`)].map(input => Number(input.value)));
    return openModal({
      title: 'Choose your paper questions',
      body: html`<div class="stack">
        ${paper.choice_note ? html`<p>${paper.choice_note}</p>` : ''}
        <p>Compulsory questions are included. Choose the optional questions you will answer before you start.</p>
        ${pdf ? html`<a href="${pdf}" target="_blank" rel="noopener">Open the original question paper (PDF)</a>` : ''}
        ${groups.map(({ options, count }, index) => {
          const units = options.map(ids => ids.map(id => bundle.questionsById.get(id)).filter(Boolean));
          const numbers = units.map(option => [...new Set(option.map(question => question.question_number))].join(', '));
          return html`<fieldset class="stack stack--sm">
            <legend>Choice ${index + 1} · Choose ${count}</legend>
            ${units.map((option, optionIndex) => {
              const number = numbers[optionIndex];
              const ambiguous = numbers.some((other, otherIndex) => otherIndex !== optionIndex && other === number);
              const label = ambiguous ? option.map(question => questionRef(question)).join(', ') : number ? `Question ${number}` : `Option ${optionIndex + 1}`;
              return html`<label class="check">
                <input type="${count === 1 ? 'radio' : 'checkbox'}" name="paper-option-${index}" value="${optionIndex}" />
                <span>${label}</span>
              </label>`;
            })}
          </fieldset>`;
        })}
      </div>`,
      actions: [
        {label: 'Cancel', cancel: true},
        {
          label: 'Continue',
          variant: 'primary',
          validate: (dialog) => {
            const selections = choices(dialog);
            const missing = groups.findIndex(({ count }, index) => selections[index].length !== count);
            return missing < 0 ? null : `Choose exactly ${groups[missing].count} in choice ${missing + 1}.`;
          },
          collect: (dialog) => paperQuestionSelection(paper, groups, choices(dialog)),
        },
      ],
    });
  }

  async function start(timed) {
    const selection = await chooseQuestions();
    if (!selection) return;
    const questionIds = paperSessionQuestionIds(paper, selection, bundle.questionsById);
    if (selection.length && !questionIds.length && !(await confirmDialog({
      title: 'Sit the complete paper from its source',
      message: `Some questions needed for this sitting are missing here. Use the full source paper and enter your score out of ${paper.total_marks}.`,
      confirmLabel: 'Sit from source',
    }))) return;
    const session = createSession({
      kind: 'full_paper',
      subject_id: subject.subject_id,
      title: paper.title,
      question_ids: questionIds,
      paper_id: paper.paper_id,
      paper_type: paper.paper_type,
      time_limit_minutes: timed ? paper.duration_minutes : null,
      timer: timed ? 'countdown' : 'off',
      mark_mode: 'end',
      total_marks: paper.total_marks,
    });
    await api.saveSession(session, { silent: true });
    context.navigate(routeOf(links.session(session.session_id)));
  }

  on(element, 'click', '[data-discard-open]', async () => {
    const confirmed = await confirmDialog({
      title: 'Discard your unfinished attempt?',
      message: 'Its answers and timing are removed and nothing is recorded. Results you have already saved for this paper are not affected.',
      confirmLabel: 'Discard',
      danger: true,
    });
    if (!confirmed) return;
    await api.deleteSession(openSession.session_id);
    toast('Unfinished attempt discarded.', { type: 'info' });
    context.refresh();
  });

  on(element, 'click', '[data-start]', (event, button) => start(button.dataset.start === 'timed'));
  // Practising one question opens the whole paper as a mark-as-you-go set, starting on that
  // question, so the number row and Next move straight on without returning here.
  on(element, 'click', '[data-open]', async (event, button) => {
    const question = practiceQuestions.find((item) => item.question_id === button.dataset.open);
    if (!question) return;
    if (practiceQuestions.length < 2) return startSingle(question, context.navigate);
    const branchRoot = question.linked_group?.root_id;
    const chosen = branchRoot ? practiceQuestions.filter((item) => item === question || item.linked_group?.root_id !== branchRoot) : practiceQuestions;
    const questionIds = expandLinkedIds(chosen.map((item) => item.question_id), bundle.questionsById);
    const session = createSession({
      kind: 'question_set',
      subject_id: subject.subject_id,
      title: `${paper.title}: questions`,
      question_ids: questionIds,
      paper_type: 'user_custom_test',
      mark_mode: 'each',
    });
    session.current_index = Math.max(0, questionIds.indexOf(question.part_ids?.[0] || question.question_id));
    session.source_paper_id = paper.paper_id; // where "Save and exit" falls back to
    await api.saveSession(session, { silent: true });
    context.navigate(routeOf(links.session(session.session_id)));
  });

  on(element, 'click', '[data-log]', async () => {
    const entry = await openModal({
      title: 'Log a score',
      body: html`<div class="stack">
        <p class="muted">${api.isSignedIn() ? 'Already sat this paper on paper? Record your mark to add it to your Data Hub.' : 'Already sat this paper on paper? Record your mark temporarily, then create a free account to save it in this browser.'}</p>
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
    toast(`${api.isSignedIn() ? 'Saved' : 'Recorded temporarily'}: ${entry.marks}/${paper.total_marks} (${fmtPercent(percentage)}).`, { type: 'success' });
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
