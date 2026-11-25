// Helpers shared by the signed-in views: load a student's subjects with their content,
// summarise progress per subject, and start practice sessions.

import { enabledSourceTypes } from '../config/phases.js';
import { html, on, setHtml } from '../core/dom.js';
import * as api from '../data/api.js';
import { getBundles, specIndex } from '../data/content-repository.js';
import { createSession } from '../data/sessions.js';
import { TARGET_BANDS, latestByQuestion, masteryByNode, paperHistory, ragFor, targetBand, totals } from '../engine/analytics.js';
import { filterQuestions } from '../engine/filter-engine.js';
import { paperInScope, questionInScope, scopeLeaves, scopeOf, scopeSpec } from '../engine/module-routes.js';
import { practiceAvailability, testEntries, testPool } from '../engine/practice-modes.js';
import { textbookMasteryByNode } from '../engine/textbook-index.js';
import { isTiered, questionsForTier, savedTier, tierLeaves, tierRequired } from '../engine/tiers.js';
import { icon } from './icons.js';
import { patternMark } from './patterns.js';
import { SUBJECT_SWATCHES, scStyle, setSubjectColour, subjectColour, subjectSwatchId, targetGrade } from './subject-colours.js';
import { fmtPercent, groupDot } from './ui.js';
import { links, routeOf } from '../core/links.js';

/**
 * Progress plus content for a set of subjects (default: the enrolled ones).
 * @returns {Promise<{progress, bundles: Map, latest: Map, learned: Set}>}
 */
export async function loadStudent(subjectIds = null) {
  const progress = api.getProgress();
  const bundles = await getBundles(subjectIds || progress.enrolled_subjects);
  for (const [id, bundle] of bundles) bundles.set(id, scopeBundle(bundle, progress));
  return { progress, bundles, latest: latestByQuestion(progress.question_attempts), learned: api.learnedSet() };
}

/**
 * For subjects with optional-module routes (Further Mathematics), the student's view:
 * the spec tree, papers and questions of their qualification(s), Core Pure and chosen
 * modules only. papersById/questionsById stay complete so saved sessions still resolve.
 * Other subjects are returned unchanged.
 */
export function scopeBundle(bundle, progress = null) {
  let preferences = null;
  try {
    preferences = (progress || api.getProgress()).preferences;
  } catch {
    preferences = null;
  }
  const scope = scopeOf(bundle.subject, preferences?.moduleRoutes?.[bundle.subject.subject_id]);
  if (!scope) return bundle;
  const leaves = scopeLeaves(bundle.spec, scope);
  const visible = new Set(leaves);
  return {
    ...bundle,
    scope,
    unscopedQuestions: bundle.questions,
    scopeLeaves: leaves,
    spec: scopeSpec(bundle.spec, scope),
    papers: bundle.papers.filter((paper) => paperInScope(paper, scope)),
    questions: bundle.questions.filter((question) => questionInScope(question, bundle.papersById.get(question.paper_id), scope, visible)),
  };
}

/** The official leaves a learned-topic list should offer: the scoped ones when a route applies. */
export const bundleLeaves = (bundle, tier = null) => bundle.scopeLeaves || tierLeaves(specIndex, bundle.subject.subject_id, tier);

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
  // Once a subject has reviewed source units, demo questions never enter its pool.
  const hasRealSource = available.some(question => !question.is_sample && question.provenance?.review_status === 'model_reviewed');
  return available.filter((question) => !parents.has(question.question_id) && !(hasRealSource && question.is_sample));
}

/** Mode availability uses the whole enabled bank, before saved route or tier choices. */
export function practiceModes(bundle) {
  const questions = bundle.unscopedQuestions || bundle.questions;
  const pool = testPool(practicePool({ questions }), bundle.papersById);
  return practiceAvailability(bundle.subject, testEntries(pool, pool, bundle.questionsById));
}

/**
 * Learning counts for each tier of a tiered subject ('' = every tier), so the add/edit window
 * can show the right number for the tier picked. Null for an untiered subject.
 */
export function tierLearningCounts(subject, learned = api.learnedSet()) {
  if (!isTiered(subject)) return null;
  return Object.fromEntries(['', ...subject.tiers].map((tier) => {
    const ids = tierLeaves(specIndex, subject.subject_id, tier || null);
    return [tier, { leaves: ids.length, covered: ids.filter((id) => learned.has(id)).length }];
  }));
}

/** The tier a student studies a subject at: saved tier, or whether a required choice is missing. */
export function tierStatus(subject, progress = api.getProgress()) {
  const tier = savedTier(subject, progress);
  return { tiered: isTiered(subject), required: tierRequired(subject), tier, missing: tierRequired(subject) && !tier };
}

/** A short tier label for subject cards ("Foundation tier", "Tier not chosen"), or ''. */
export function tierLabel(subject, progress) {
  const status = tierStatus(subject, progress);
  if (!status.tiered) return '';
  if (status.tier) return html` · <span class="tier-label">${status.tier} tier</span>`;
  return status.required ? html` · <span class="tier-label tier-label--missing">Tier not chosen</span>` : html` · <span class="tier-label">Both tiers</span>`;
}

export function subjectSummary(bundle, { progress, latest, learned }) {
  const textbookMode = bundle.textbooks && progress.preferences[`coveredView:${bundle.subject.subject_id}`] !== 'official';
  // A tiered subject counts only its chosen tier's spec points and questions; a subject with
  // module routes counts only its chosen modules (bundleLeaves).
  const tier = savedTier(bundle.subject, progress);
  const leaves = textbookMode ? bundle.textbooks.ids : bundleLeaves(bundle, tier);
  const pool = questionsForTier(practicePool(bundle), tier, bundle.papersById);
  const { matches } = filterQuestions(pool, {learnedNamespace:textbookMode ? 'textbook' : 'official'}, { specIndex, learned, latestAttempts: latest });
  const answered = [...latest.values()].filter((attempt) => attemptInSubject(attempt, bundle));
  const score = totals(answered);
  // One segment per topic (up to 8): its RAG from the latest attempts, or empty with no evidence yet.
  const mastery = textbookMode ? textbookMasteryByNode(latest,bundle.questionsById,bundle.textbooks) : masteryByNode(latest, bundle.questionsById, specIndex);
  const topics = textbookMode ? bundle.textbooks.tree.sections : (bundle.spec?.sections || []).flatMap((section) => section.topics);
  const segments = topics.slice(0, 8).map((topic) => {
    const entry = mastery.get(topic.id);
    return { title: topic.title, rag: entry && entry.max > 0 ? entry.rag || ragFor(entry.percentage) : 'none' };
  });
  return {
    leaves: leaves.length,
    learningUnit: textbookMode ? 'textbook sections' : 'spec points',
    learned: leaves.filter((id) => learned.has(id)).length,
    pool: pool.length,
    unlocked: matches.length,
    answered: answered.length,
    percentage: score.percentage,
    rag: ragFor(score.percentage),
    segments,
    papers: progress.paper_attempts.filter((attempt) => attempt.subject_id === bundle.subject.subject_id).length,
    tier,
  };
}

/** A subject's card: a band in the student's colour (the dot changes it), learned count, topic segments and average. */
export function subjectCard(bundle, summary, { actions = true, tilt = 0 } = {}) {
  const { subject } = bundle;
  const id = subject.subject_id;
  return html`<article class="card subject-card ${tilt ? `tilt-${tilt}` : ''}" style="${scStyle(subject)}" data-subject-card="${id}">
    <header class="subject-card__band">
      ${patternMark(subject)}
      <h3><a href="${links.subject(id)}">${subject.level === 'GCSE' ? 'GCSE ' : ''}${subject.subject}</a></h3>
      <button type="button" class="cdot" data-colour-for="${id}" aria-label="Change the colour for ${subject.subject}" aria-haspopup="dialog"></button>
    </header>
    <div class="subject-card__body">
      <p class="subject-card__meta">${subject.level} · ${subject.board} ${subject.spec_code}${tierLabel(subject)}${subject.has_written_exam ? ` · ${summary.learned}/${summary.leaves} learned` : ''}</p>
      ${subject.has_written_exam
        ? html`${summary.segments.length
              ? html`<span class="segbar" role="img" aria-label="Topic scores">${summary.segments.map((segment) => html`<i data-rag="${segment.rag}" title="${segment.title}"></i>`)}</span>`
              : ''}
            <p class="subject-card__score"><span>${summary.answered ? 'average' : 'no answers yet'}</span><b>${summary.answered ? fmtPercent(summary.percentage) : ''}</b></p>
            ${actions
              ? html`<footer class="row row--tight">
                  <a class="btn btn--sm" href="${links.papers(id)}">Papers</a>
                  <a class="btn btn--sm" href="${links.practice({ subject: id })}">Practice</a>
                  <a class="btn btn--sm" href="${links.subject(id)}">Topics</a>
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
      ${patternMark(subject)}
      <h3><a href="${links.subject(id)}">${subject.level === 'GCSE' ? 'GCSE ' : ''}${subject.subject}</a></h3>
      <button type="button" class="cdot" data-colour-for="${id}" aria-label="Change the colour for ${subject.subject}" aria-haspopup="dialog"></button>
    </header>
    <div class="subject-card__body">
      <p class="subject-card__meta">${subject.level} · ${subject.board} ${subject.spec_code}${tierLabel(subject, progress)}</p>
      ${tierStatus(subject, progress).missing ? html`<p class="small tier-missing"><button type="button" class="linkbtn" data-edit="${id}">Choose Foundation or Higher</button> to see this subject’s topics, questions and papers.</p>` : ''}
      ${targetLine(subject, progress)}
      ${subject.has_written_exam
        ? html`<span class="segbar" role="img" aria-label="Topic scores">${summary.segments.map((segment) => html`<i data-rag="${segment.rag}" title="${segment.title}"></i>`)}</span>
            <p class="subject-card__meta">${summary.learned}/${summary.leaves} ${summary.learningUnit} learned</p>`
        : html`<p class="small muted">${subject.no_written_exam}</p>`}
      <footer class="row row--tight">
        ${subject.has_written_exam ? html`<a class="btn btn--sm btn--primary" href="${links.subject(id)}">Topics learned</a>` : ''}
        ${subject.has_written_exam ? html`<a class="btn btn--sm" href="${links.practice({ subject: id, mode: 'individual' })}">Browse questions</a>` : ''}
        <button type="button" class="btn btn--sm" data-edit="${id}">Edit</button>
        <button type="button" class="linkbtn small subject-card__remove" data-unenrol="${id}">Remove</button>
      </footer>
    </div>
  </article>`;
}

/** The round "+" next to a subjects heading and the dashed tile after the cards: both open Add subjects. */
export function addSubjectButton(href) {
  return html`<a class="btn btn--icon add-subject-btn" href="${href}" data-add-subject aria-label="Add a subject" title="Add a subject">${icon('plus', { size: 20 })}</a>`;
}
export function addSubjectTile(href, { tilt = 0 } = {}) {
  return html`<a class="add-subject-tile ${tilt ? `tilt-${tilt}` : ''}" href="${href}" data-add-subject>
    <span class="add-subject-tile__plus" aria-hidden="true">${icon('plus', { size: 26 })}</span>
    <span>Add a subject</span>
  </a>`;
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
    <a class="chip" href="${links.subjects()}">${icon('plus', { size: 15 })} Subjects</a>
  </nav>`;
}

// ── starting sessions ──

/** Opens one question for practice (marked straight away against its mark scheme). */
export async function startSingle(question, navigate, { attempts = null } = {}) {
  // A part of a linked question opens with the rest of it: they are one question.
  const ids = question.linked_group?.prerequisite_question_ids || question.linked_group?.question_ids || [question.question_id];
  const session = createSession({
    kind: 'single',
    subject_id: question.subject_id,
    title: `Question ${question.question_number}`,
    question_ids: ids,
    mark_mode: 'each',
  });
  // Marking a go saved earlier: it opens with that answer in the box, and marking it marks that go.
  if (attempts) {
    session.attempt_ids = {};
    for (const [id, attempt] of Object.entries(attempts)) {
      session.attempt_ids[id] = attempt.attempt_id;
      if (attempt.answer) session.answers[id] = attempt.answer;
      if (attempt.has_ink) (session.ink_answers ||= {})[id] = attempt.attempt_id;
    }
  }
  await api.saveSession(session, { silent: true });
  navigate(routeOf(links.session(session.session_id)));
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
  navigate(routeOf(links.session(session.session_id)));
}
