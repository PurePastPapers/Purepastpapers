// Paper lists. One view serves every paper section, kept apart by `paperType`:
//   /papers     → Official past papers (Phase 1)
//   /ai-papers  → AI past papers      (Phase 2, when its feature flag is enabled)
//   /predicted  → AI predicted papers (Phase 3, when its feature flag is enabled)

import { PAPER_TYPES } from '../../config/app.config.js';
import { $, html, on, setHtml } from '../../core/dom.js';
import { fmtMinutes, groupBy, naturalCompare, plural } from '../../core/utils.js';
import * as api from '../../data/api.js';
import { paperSummaries, ragFor } from '../../engine/analytics.js';
import { icon } from '../icons.js';
import { loadStudent, subjectPills } from '../student.js';
import { banner, emptyState, liveBadge, pageHead, ragBadge, sourceBadge } from '../ui.js';

const INTRO = {
  real_past_paper: 'Every exam series for your subjects. Sit a paper against the clock, mark it, and track your scores and indicative grades.',
  ai_past_paper: 'Full practice papers written by AI and modelled on real papers. Always kept separate from official papers.',
  predicted_paper: 'Predicted papers for the next exam series, built from past paper trends.',
};

export async function mount(element, context) {
  const paperType = context.options.paperType || 'real_past_paper';
  const typeInfo = PAPER_TYPES[paperType];
  context.setTitle(typeInfo.plural);

  const student = await loadStudent();
  const { progress, bundles } = student;
  const enrolled = progress.enrolled_subjects.map((id) => bundles.get(id)).filter((bundle) => bundle?.subject.has_written_exam);
  const head = pageHead({ title: typeInfo.plural, badge: liveBadge(), sub: INTRO[paperType] });

  if (!enrolled.length) {
    setHtml(
      element,
      html`${head}${emptyState({
        iconName: 'cap',
        title: 'Add a subject first',
        text: 'Papers are listed for the subjects you study.',
        action: html`<a class="btn btn--primary" href="#/subjects">Choose subjects</a>`,
      })}`,
    );
    return;
  }

  const wanted = context.query.subject || progress.preferences.lastSubject;
  const bundle = enrolled.find((candidate) => candidate.subject.subject_id === wanted) || enrolled[0];
  const { subject } = bundle;
  if (progress.preferences.lastSubject !== subject.subject_id) api.setPreference('lastSubject', subject.subject_id);

  const papers = bundle.papers.filter((paper) => paper.paper_type === paperType);
  const summaries = paperSummaries(progress.paper_attempts);
  const inProgress = new Set(api.resumableSessions().map((session) => session.paper_id).filter(Boolean));
  const years = [...new Set(papers.map((paper) => paper.year).filter(Boolean))].sort((a, b) => b - a);
  const codes = [...new Set(papers.filter((paper) => !paper.is_sample).map((paper) => paper.paper_code))].sort(naturalCompare);
  const filters = { year: 'all', code: 'all', status: 'all' };

  const statusOf = (paper) => {
    const summary = summaries.get(paper.paper_id);
    if (summary) return 'done';
    return inProgress.has(paper.paper_id) ? 'progress' : 'todo';
  };

  function row(paper) {
    const summary = summaries.get(paper.paper_id);
    const status = statusOf(paper);
    return html`<li>
      <a class="paper-row" href="#/paper/${subject.subject_id}/${encodeURIComponent(paper.paper_id)}">
        <span class="paper-row__main">
          <span class="paper-row__title">${paper.title}</span>
          <span class="paper-row__meta">
            ${paper.total_marks} marks · ${fmtMinutes(paper.duration_minutes)}
            ${paper.question_ids.length ? html` · ${plural(paper.question_ids.length, 'question')} to work through` : ''}
          </span>
        </span>
        <span class="paper-row__status">
          ${paper.is_sample ? sourceBadge(paper) : ''}
          ${status === 'done'
            ? html`${ragBadge(ragFor(summary.best.percentage), summary.best.percentage, { label: false })}
                ${summary.best.grade ? html`<span class="tag">Grade ${summary.best.grade}</span>` : ''}`
            : status === 'progress'
              ? html`<span class="tag">In progress</span>`
              : html`<span class="small muted">Not started</span>`}
        </span>
        ${icon('chevronRight', { size: 16 })}
      </a>
    </li>`;
  }

  function list() {
    const visible = papers.filter(
      (paper) =>
        (filters.status === 'all' || statusOf(paper) === filters.status) &&
        (paper.is_sample || ((filters.year === 'all' || String(paper.year) === filters.year) && (filters.code === 'all' || paper.paper_code === filters.code))),
    );
    const demo = visible.filter((paper) => paper.is_sample);
    const byYear = groupBy(visible.filter((paper) => !paper.is_sample), (paper) => paper.year);
    if (!visible.length) {
      return emptyState({
        iconName: 'file',
        title: papers.length ? 'No papers match these filters' : 'No papers here yet',
        text: papers.length ? 'Change the filters to see more.' : subject.catalogue_note || 'Papers for this subject have not been added.',
      });
    }
    return html`${demo.length
        ? html`<section class="paper-group">
            <div class="section-title">
              <h2 class="h3">Demo papers</h2>
              <p class="small muted">Sample content with questions extracted, to try the question-by-question experience.</p>
            </div>
            <ul class="paperlist">${demo.map(row)}</ul>
          </section>`
        : ''}
      ${[...byYear.keys()]
        .sort((a, b) => b - a)
        .map(
          (year) =>
            html`<section class="paper-group">
              <div class="section-title"><h2 class="h3">${year}</h2></div>
              <ul class="paperlist">${byYear.get(year).map(row)}</ul>
            </section>`,
        )}`;
  }

  const completed = papers.filter((paper) => summaries.has(paper.paper_id)).length;
  const hasCatalogue = papers.some((paper) => paper.catalogue_generated);

  setHtml(
    element,
    html`${head}
      <div class="stack stack--lg">
        ${subjectPills(enrolled, subject.subject_id, (id) => `#${context.path}?subject=${id}`)}
        <div class="card card--sunken paper-source">
          <div style="min-width:0">
            <p><strong>${subject.subject}</strong> <span class="mono small">${subject.board} · ${subject.spec_code}</span></p>
            <p class="small muted">
              ${paperType === 'real_past_paper'
                ? html`Question papers and mark schemes are published by ${subject.board}. Open the paper there, sit it here against the clock, then log your marks.`
                : `${plural(papers.length, 'paper')} available.`}
              ${hasCatalogue ? ' Paper details come from the specification, so check them against the board if something looks wrong.' : ''}
            </p>
          </div>
          ${paperType === 'real_past_paper' && subject.official_url
            ? html`<a class="btn" href="${subject.official_url}" target="_blank" rel="noopener">${subject.board} past papers ${icon('external', { size: 15 })}</a>`
            : ''}
        </div>
        ${subject.catalogue_note ? banner(subject.catalogue_note) : ''}
        <div class="row">
          <label class="field field--inline">
            <span class="field__label">Year</span>
            <select class="select" data-filter="year">
              <option value="all">All years</option>
              ${years.map((year) => html`<option value="${year}">${year}</option>`)}
            </select>
          </label>
          <label class="field field--inline">
            <span class="field__label">Paper</span>
            <select class="select" data-filter="code">
              <option value="all">All papers</option>
              ${codes.map((code) => html`<option value="${code}">${code}</option>`)}
            </select>
          </label>
          <label class="field field--inline">
            <span class="field__label">Status</span>
            <select class="select" data-filter="status">
              <option value="all">All</option>
              <option value="todo">Not started</option>
              <option value="progress">In progress</option>
              <option value="done">Completed</option>
            </select>
          </label>
          <span class="spacer"></span>
          <p class="small muted">${completed} of ${papers.length} completed</p>
        </div>
        <div data-list>${list()}</div>
      </div>`,
  );

  on(element, 'change', '[data-filter]', (event, select) => {
    filters[select.dataset.filter] = select.value;
    setHtml($('[data-list]', element), list());
  });
}
