// Helpers shared by the signed-in views: load a student's subjects with their content,
// summarise progress per subject, and start practice sessions.

import { enabledSourceTypes } from '../config/phases.js';
import { html } from '../core/dom.js';
import { percent } from '../core/utils.js';
import * as api from '../data/api.js';
import { getBundles, specIndex } from '../data/content-repository.js';
import { createSession } from '../data/sessions.js';
import { latestByQuestion, ragFor, totals } from '../engine/analytics.js';
import { filterQuestions } from '../engine/filter-engine.js';
import { icon } from './icons.js';
import { groupDot, meter, ragBadge } from './ui.js';

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
  return bundle.questions.filter((question) => question.include_in_custom_pool !== false && sources.includes(question.source_type));
}

export function subjectSummary(bundle, { progress, latest, learned }) {
  const leaves = specIndex.subjectLeaves(bundle.subject.subject_id);
  const pool = practicePool(bundle);
  const { matches } = filterQuestions(pool, {}, { specIndex, learned, latestAttempts: latest });
  const answered = [...latest.values()].filter((attempt) => attemptInSubject(attempt, bundle));
  const score = totals(answered);
  return {
    leaves: leaves.length,
    learned: leaves.filter((id) => learned.has(id)).length,
    pool: pool.length,
    unlocked: matches.length,
    answered: answered.length,
    percentage: score.percentage,
    rag: ragFor(score.percentage),
    papers: progress.paper_attempts.filter((attempt) => attempt.subject_id === bundle.subject.subject_id).length,
  };
}

export function subjectCard(bundle, summary, { actions = true } = {}) {
  const { subject } = bundle;
  const id = subject.subject_id;
  const learnedShare = percent(summary.learned, summary.leaves);
  return html`<article class="card subject-card">
    <header class="row row--between row--top row--nowrap">
      <div style="min-width:0">
        <p class="small muted">${groupDot(subject)} ${subject.level} · ${subject.board} ${subject.spec_code}</p>
        <h3 class="h3"><a class="subject-card__name" href="#/subject/${id}">${subject.subject}</a></h3>
      </div>
      ${summary.answered ? ragBadge(summary.rag, summary.percentage, { label: false }) : ''}
    </header>
    ${subject.has_written_exam
      ? html`<div class="stack stack--sm">
            <p class="small muted">Learned ${summary.learned} of ${summary.leaves} spec points</p>
            ${meter(learnedShare, 'accent', `${Math.round(learnedShare)}% of spec points learned`)}
            <p class="small muted">${summary.unlocked} of ${summary.pool} questions unlocked · ${summary.answered} answered</p>
          </div>
          ${actions
            ? html`<footer class="row row--tight">
                <a class="btn btn--sm btn--primary" href="#/practice?subject=${id}">Practise</a>
                <a class="btn btn--sm" href="#/subject/${id}">Topics</a>
                <a class="btn btn--sm" href="#/papers?subject=${id}">Papers</a>
              </footer>`
            : ''}`
      : html`<p class="small muted">${subject.no_written_exam}</p>`}
  </article>`;
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
