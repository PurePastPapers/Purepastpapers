// Helpers shared by the signed-in views: load a student's subjects with their content,
// summarise progress per subject, and start practice sessions.

import { enabledSourceTypes } from '../config/phases.js';
import { html, on, setHtml } from '../core/dom.js';
import * as api from '../data/api.js';
import { getBundles, specIndex } from '../data/content-repository.js';
import { createSession } from '../data/sessions.js';
import { TARGET_BANDS, latestByQuestion, masteryByNode, paperHistory, ragFor, targetBand, totals } from '../engine/analytics.js';
import { filterQuestions } from '../engine/filter-engine.js';
import { icon } from './icons.js';
import { SUBJECT_SWATCHES, scStyle, setSubjectColour, subjectColour, subjectSwatchId, targetGrade } from './subject-colours.js';
import { fmtPercent, groupDot } from './ui.js';

/**
 * Progress plus content for a set of subjects (default: the enrolled ones).
 * @returns {Promise<{progress, bundles: Map, latest: Map, learned: Set}>}
 */
export async function loadStudent(subjectIds = null) {
  const progress = api.getProgress();
  const bundles = await getBundles(subjectIds || progress.enrolled_subjects);
  return { progress, bundles, latest: latestByQuestion(progress.question_attempts), learned: api.learnedSet() };
}

/** Does this attempt belong to the subject? (Older exports may lack subject_id.) */
export const attemptInSubject = (attempt, bundle) =>
  attempt.subject_id ? attempt.subject_id === bundle.subject.subject_id : bundle.questionsById.has(attempt.question_id);

/** Questions a student may currently practise from: in the custom pool and from a live source. */
export function practicePool(bundle) {
  const sources = enabledSourceTypes();
  const available = bundle.questions.filter((question) => question.include_in_custom_pool !== false && sources.includes(question.source_type));
  // An assessable parent and its assessable children represent overlapping content.
  // Prefer the independently answerable parts; parent-only legacy questions remain.
  const parents = new Set(available.map((question) => question.parent_question_id).filter(Boolean));
  return available.filter((question) => question.part_label || !parents.has(question.question_id));
}

export function subjectSummary(bundle, { progress, latest, learned }) {
  const leaves = specIndex.subjectLeaves(bundle.subject.subject_id);
  const pool = practicePool(bundle);
  const { matches } = filterQuestions(pool, {}, { specIndex, learned, latestAttempts: latest });
  const answered = [...latest.values()].filter((attempt) => attemptInSubject(attempt, bundle));
  const score = totals(answered);
  // One segment per topic (up to 8): its RAG from the latest attempts, or empty with no evidence yet.
  const mastery = masteryByNode(latest, bundle.questionsById, specIndex);
  const topics = (bundle.spec?.sections || []).flatMap((section) => section.topics);
  const segments = topics.slice(0, 8).map((topic) => {
    const entry = mastery.get(topic.id);
    return { title: topic.title, rag: entry && entry.max > 0 ? entry.rag : 'none' };
  });
  return {
    leaves: leaves.length,
    learned: leaves.filter((id) => learned.has(id)).length,
    pool: pool.length,
    unlocked: matches.length,
    answered: answered.length,
    percentage: score.percentage,
    rag: ragFor(score.percentage),
    segments,
    papers: progress.paper_attempts.filter((attempt) => attempt.subject_id === bundle.subject.subject_id).length,
  };
}

/** A subject's card: a band in the student's colour (the dot changes it), learned count, topic segments and average. */
export function subjectCard(bundle, summary, { actions = true, tilt = 0 } = {}) {
  const { subject } = bundle;
  const id = subject.subject_id;
  return html`<article class="card subject-card ${tilt ? `tilt-${tilt}` : ''}" style="${scStyle(subject)}" data-subject-card="${id}">
    <header class="subject-card__band">
      <h3><a href="#/subject/${id}">${subject.level === 'GCSE' ? 'GCSE ' : ''}${subject.subject}</a></h3>
      <button type="button" class="cdot" data-colour-for="${id}" aria-label="Change the colour for ${subject.subject}" aria-haspopup="dialog"></button>
    </header>
    <div class="subject-card__body">
      <p class="subject-card__meta">${subject.level} · ${subject.board} ${subject.spec_code}${subject.has_written_exam ? ` · ${summary.learned}/${summary.leaves} learned` : ''}</p>
      ${subject.has_written_exam
        ? html`${summary.segments.length
              ? html`<span class="segbar" role="img" aria-label="Topic scores">${summary.segments.map((segment) => html`<i data-rag="${segment.rag}" title="${segment.title}"></i>`)}</span>`
              : ''}
            <p class="subject-card__score"><span>${summary.answered ? 'average' : 'no answers yet'}</span><b>${summary.answered ? fmtPercent(summary.percentage) : ''}</b></p>
            ${actions
              ? html`<footer class="row row--tight">
                  <a class="btn btn--sm" href="#/papers?subject=${id}">Papers</a>
                  <a class="btn btn--sm" href="#/practice?subject=${id}">Practice</a>
                  <a class="btn btn--sm" href="#/subject/${id}">Topics</a>
                </footer>`
              : ''}`
        : html`<p class="small muted">${subject.no_written_exam}</p>`}
    </div>
  </article>`;
}

/** Target grade box with the last paper's grade judged against it. */
export function targetLine(subject, progress) {
  const target = targetGrade(subject);
  const last = paperHistory(progress.paper_attempts, { subjectId: subject.subject_id }).find((attempt) => attempt.grade);
  const band = last && target ? targetBand(last.grade, target, subject.grade_scheme) : null;
  return html`<div class="target">
    <span class="target__grade" title="Target grade">${target || '–'}</span>
    <span>
      <span class="target__label">Target grade${target ? '' : ': not set'}</span>
      Last paper: <b>${last ? last.grade : 'none yet'}</b>
      ${band ? html`<span class="band" data-band="${band}">${TARGET_BANDS[band].label}</span>` : ''}
    </span>
  </div>`;
}

/** The card used on My subjects: colour band, target grade, topic segments and manage buttons. */
export function manageCard(bundle, summary, progress, { tilt = 0 } = {}) {
  const { subject } = bundle;
  const id = subject.subject_id;
  return html`<article class="card subject-card ${tilt ? `tilt-${tilt}` : ''}" style="${scStyle(subject)}" data-subject-card="${id}">
    <header class="subject-card__band">
      <h3><a href="#/subject/${id}">${subject.level === 'GCSE' ? 'GCSE ' : ''}${subject.subject}</a></h3>
      <button type="button" class="cdot" data-colour-for="${id}" aria-label="Change the colour for ${subject.subject}" aria-haspopup="dialog"></button>
    </header>
    <div class="subject-card__body">
      <p class="subject-card__meta">${subject.level} · ${subject.board} ${subject.spec_code}</p>
      ${targetLine(subject, progress)}
      ${subject.has_written_exam
        ? html`<span class="segbar" role="img" aria-label="Topic scores">${summary.segments.map((segment) => html`<i data-rag="${segment.rag}" title="${segment.title}"></i>`)}</span>
            <p class="subject-card__meta">${summary.learned}/${summary.leaves} spec points learned</p>`
        : html`<p class="small muted">${subject.no_written_exam}</p>`}
      <footer class="row row--tight">
        ${subject.has_written_exam ? html`<a class="btn btn--sm btn--primary" href="#/subject/${id}">Topics learned</a>` : ''}
        ${subject.has_written_exam ? html`<a class="btn btn--sm" href="#/practice?subject=${id}&mode=individual">Browse questions</a>` : ''}
        <button type="button" class="btn btn--sm" data-edit="${id}">Edit</button>
        <button type="button" class="linkbtn small subject-card__remove" data-unenrol="${id}">Remove</button>
      </footer>
    </div>
  </article>`;
}

/**
 * Wires the colour dots on subject cards: a small card of preset swatches opens under
 * the dot; picking one saves it and recolours the page without a reload.
 */
export function wireColourPicker(element, onChange = null) {
  const close = () => element.querySelector('.colour-pop')?.remove();
  const stop = on(element, 'click', '[data-colour-for]', (event, dot) => {
    event.stopPropagation();
    const open = element.querySelector('.colour-pop');
    close();
    if (open?.dataset.for === dot.dataset.colourFor) return;
    const card = dot.closest('[data-subject-card]');
    const subjectId = dot.dataset.colourFor;
    const name = card.querySelector('h3').textContent.trim();
    const current = subjectSwatchId(subjectId);
    const pop = document.createElement('div');
    pop.className = 'card colour-pop';
    pop.dataset.for = subjectId;
    pop.setAttribute('role', 'dialog');
    pop.setAttribute('aria-label', `Colour for ${name}`);
    setHtml(
      pop,
      html`<h4>Colour for ${name}</h4>
        <div class="swatches" role="radiogroup" aria-label="Colour">
          ${SUBJECT_SWATCHES.map(
            (swatch) =>
              html`<button type="button" class="swatch" role="radio" style="--sc:${swatch.hex}" aria-checked="${swatch.id === current}" aria-label="${swatch.label}" data-swatch="${swatch.id}"></button>`,
          )}
        </div>
        <p class="hand">used for headers &amp; charts</p>`,
    );
    card.append(pop);
    pop.querySelector('[aria-checked="true"]')?.focus();
    pop.addEventListener('click', async (clickEvent) => {
      clickEvent.stopPropagation();
      const swatch = clickEvent.target.closest('[data-swatch]');
      if (!swatch) return;
      await setSubjectColour(subjectId, swatch.dataset.swatch);
      card.style.setProperty('--sc', subjectColour(subjectId));
      for (const dotEl of document.querySelectorAll(`[data-subject-id="${subjectId}"]`)) dotEl.style.setProperty('--sc', subjectColour(subjectId));
      close();
      onChange?.(subjectId);
    });
  });
  const outside = (event) => {
    if (!event.target.closest('.colour-pop')) close();
  };
  const escape = (event) => {
    if (event.key === 'Escape') close();
  };
  document.addEventListener('click', outside);
  document.addEventListener('keydown', escape);
  return () => {
    stop?.();
    document.removeEventListener('click', outside);
    document.removeEventListener('keydown', escape);
  };
}

/** Row of subject pills used to switch subject on the papers, practice and hub pages. */
export function subjectPills(bundles, activeId, hrefFor) {
  return html`<nav class="chips subject-pills" aria-label="Subject">
    ${bundles.map(
      (bundle) =>
        html`<a class="chip ${bundle.subject.subject_id === activeId ? 'is-on' : ''}" href="${hrefFor(bundle.subject.subject_id)}" aria-current="${bundle.subject.subject_id === activeId ? 'true' : 'false'}">
          ${groupDot(bundle.subject)}${bundle.subject.level === 'GCSE' ? 'GCSE ' : ''}${bundle.subject.subject}
        </a>`,
    )}
    <a class="chip" href="#/subjects">${icon('plus', { size: 15 })} Subjects</a>
  </nav>`;
}

// ── starting sessions ──

/** Opens one question for practice (marked straight away against its mark scheme). */
export async function startSingle(question, navigate) {
  const session = createSession({
    kind: 'single',
    subject_id: question.subject_id,
    title: `Question ${question.question_number}`,
    question_ids: [question.question_id],
    mark_mode: 'each',
  });
  await api.saveSession(session, { silent: true });
  navigate(`/session/${session.session_id}`);
}

/** Starts an untimed set of chosen questions (the humanities picker, retries, quick practice). */
export async function startQuestionSet({ subject, questions, title, stopwatch = false }, navigate) {
  if (questions.length === 1 && !stopwatch) return startSingle(questions[0], navigate);
  const session = createSession({
    kind: 'question_set',
    subject_id: subject.subject_id,
    title: title || `${subject.subject}: ${questions.length} chosen questions`,
    question_ids: questions.map((question) => question.question_id),
    paper_type: 'user_custom_test',
    timer: stopwatch ? 'stopwatch' : 'off',
    mark_mode: 'each',
  });
  await api.saveSession(session, { silent: true });
  navigate(`/session/${session.session_id}`);
}
