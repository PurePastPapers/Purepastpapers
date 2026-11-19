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
import { saveSubjectSettings, scStyle, tintPage } from '../subject-colours.js';
import { isTiered, savedTier, tierRequired, validTier } from '../../engine/tiers.js';
import { banner, emptyState, meter, pageHead, ragBadge, sourceBadge } from '../ui.js';
import { links } from '../../core/links.js';

const INTRO = {
  real_past_paper: 'every exam series for your subjects, sit one against the clock',
  ai_past_paper: 'full practice papers written by AI, always kept apart from official papers',
  predicted_paper: 'predicted papers for the next exam series, built from past paper trends',
};

export async function mount(element, context) {
  const paperType = context.options.paperType || 'real_past_paper';
  const typeInfo = PAPER_TYPES[paperType];
  context.setTitle(paperType === 'real_past_paper' ? 'Past papers' : typeInfo.plural);

  const student = await loadStudent();
  const { progress, bundles } = student;
  const enrolled = progress.enrolled_subjects.map((id) => bundles.get(id)).filter((bundle) => bundle?.subject.has_written_exam);
  const pageTitle = paperType === 'real_past_paper' ? 'Past papers' : typeInfo.plural;
  const head = (crumb) =>
    pageHead({ title: pageTitle, sub: INTRO[paperType], crumbs: [{ label: 'Home', href: links.home() }, { label: pageTitle, href: `#${context.path}` }, ...(crumb ? [{ label: crumb }] : [])] });

  if (!enrolled.length) {
    setHtml(
      element,
      html`${head()}${emptyState({
        iconName: 'cap',
        title: 'Add a subject first',
        text: 'Papers are listed for the subjects you study.',
        action: html`<a class="btn btn--primary" href="${links.subjects()}">Choose subjects</a>`,
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
  const tiers = [...new Set(papers.map((paper) => paper.tier).filter(Boolean))];
  // Tiered GCSEs list the student's saved tier by default (owner request 2026-11-19). The other
  // tier appears only when they switch the visible Tier control (or a link names a tier).
  // A science with no saved tier asks for one before listing papers.
  const tieredSubject = isTiered(subject) && tiers.length > 1;
  const chosenTier = savedTier(subject, progress);
  const needsTier = tieredSubject && tierRequired(subject) && !chosenTier;
  const linkTier = context.query.tier === 'all' ? 'all' : validTier(subject, context.query.tier);
  const filters = { year: 'all', code: 'all', status: 'all', tier: linkTier || (tiers.includes(chosenTier) ? chosenTier : 'all') };
  const codesFor = (tier) => [...new Set(papers.filter((paper) => !paper.is_sample && (tier === 'all' || paper.tier === tier)).map((paper) => paper.paper_code))].sort(naturalCompare);
  let codes = codesFor(filters.tier);

  const statusOf = (paper) => {
    const summary = summaries.get(paper.paper_id);
    if (summary) return 'done';
    return inProgress.has(paper.paper_id) ? 'progress' : 'todo';
  };

  const resumeFor = new Map(api.resumableSessions().filter((session) => session.paper_id).map((session) => [session.paper_id, session]));
  const paperHref = (paper) => links.paper(subject.subject_id, paper.paper_id);
  const shortTitle = (paper) => (paper.title.includes(': ') ? paper.title.split(': ').slice(1).join(': ') : paper.title);
  const codeLine = (paper) =>
    paper.is_sample ? 'Demo paper' : `${subject.spec_code} · ${/^P\d+$/.test(paper.paper_code) ? `Paper ${paper.paper_code.slice(1)}` : paper.paper_code}${paper.tier ? ` · ${paper.tier}` : ''}`;

  function card(paper, index) {
    const summary = summaries.get(paper.paper_id);
    const status = statusOf(paper);
    const session = resumeFor.get(paper.paper_id);
    return html`<li class="card ruled paper-card tilt-${[3, 2, 4, 1][index % 4]}">
      <i class="tape tape--c" aria-hidden="true"></i>
      <p class="paper-card__code">${codeLine(paper)}</p>
      <h3><a href="${paperHref(paper)}">${shortTitle(paper)}</a></h3>
      <p class="paper-card__meta">
        ${paper.total_marks} marks · ${fmtMinutes(paper.duration_minutes)}${paper.question_ids.length ? html` · ${plural(paper.question_ids.length, 'question')}` : ''}
      </p>
      ${paper.is_sample ? html`<p style="margin-top:8px">${sourceBadge(paper)}</p>` : ''}
      <div class="paper-card__foot">
        ${status === 'done'
          ? html`<span class="paper-card__score"><b>${Math.round(summary.best.percentage)}%</b>${summary.best.grade
                ? html`<span class="grade-stamp" data-rag="${ragFor(summary.best.percentage)}" title="Indicative grade">${summary.best.grade}</span>`
                : ragBadge(ragFor(summary.best.percentage), null, { label: false })}</span>
              <a class="btn btn--sm" href="${paperHref(paper)}">Review</a>`
          : status === 'progress'
            ? html`<span class="paper-card__status is-progress">In progress</span>
                <a class="btn btn--sm btn--primary" href="${session ? links.session(session.session_id) : paperHref(paper)}">Resume</a>`
            : html`<span class="paper-card__status">Not started</span><a class="btn btn--sm" href="${paperHref(paper)}">Sit paper</a>`}
      </div>
    </li>`;
  }

  function list() {
    const visible = papers.filter(
      (paper) =>
        (filters.status === 'all' || statusOf(paper) === filters.status) &&
        (paper.is_sample || ((filters.year === 'all' || String(paper.year) === filters.year) && (filters.code === 'all' || paper.paper_code === filters.code) && (filters.tier === 'all' || paper.tier === filters.tier))),
    );
    const demo = visible.filter((paper) => paper.is_sample);
    const bySeries = groupBy(visible.filter((paper) => !paper.is_sample), (paper) => `${paper.year}|${paper.series || ''}`);
    if (!visible.length) {
      return emptyState({
        iconName: 'file',
        title: papers.length ? 'No papers match these filters' : 'No papers here yet',
        text: papers.length ? 'Change the filters to see more.' : subject.catalogue_note || 'Papers for this subject have not been added.',
      });
    }
    const keys = [...bySeries.keys()].sort((a, b) => {
      const [yearA, seriesA] = a.split('|');
      const [yearB, seriesB] = b.split('|');
      return yearB - yearA || seriesA.localeCompare(seriesB);
    });
    return html`${keys.map((key) => {
        const [year, series] = key.split('|');
        return html`<section class="paper-group">
          <div class="paper-group__head"><h2>${year}</h2>${series ? html`<span class="hand">${series} series</span>` : ''}</div>
          <ul class="paper-cards">${bySeries.get(key).map(card)}</ul>
        </section>`;
      })}
      ${demo.length
        ? html`<section class="paper-group">
            <div class="paper-group__head"><h2>Demo papers</h2><span class="hand">sample content to try question-by-question</span></div>
            <ul class="paper-cards">${demo.map(card)}</ul>
          </section>`
        : ''}`;
  }

  // Progress counts the papers of the tier on show.
  const tierPapers = () => papers.filter((paper) => filters.tier === 'all' || paper.tier === filters.tier);
  const hasCatalogue = papers.some((paper) => paper.catalogue_generated);
  const filterGroup = (key, label, options) =>
    html`<div class="filter-group" role="radiogroup" aria-label="${label}">
      <p class="field__label">${label}</p>
      <div class="chips">
        ${options.map(([value, text]) => html`<button type="button" class="chip chip--sm" role="radio" aria-checked="${filters[key] === value}" data-filter="${key}" data-value="${value}">${text}</button>`)}
      </div>
    </div>`;
  const sidebar = () => html`<div class="card ruled tilt-3 side-subject">
      <i class="tape tape--c" aria-hidden="true"></i>
      <div class="side-subject__band"></div>
      <h2 class="h3">${subject.subject}</h2>
      <p class="muted">${subject.level} · ${subject.board} ${subject.spec_code}</p>
      <p class="muted small" style="margin-top:10px">
        ${paperType === 'real_past_paper'
          ? html`Question papers and mark schemes are published by ${subject.board}. Open the paper there, sit it here against the clock, then log your marks.`
          : `${plural(papers.length, 'paper')} available.`}
        ${hasCatalogue ? ' Paper details come from the specification, so check them against the board if something looks wrong.' : ''}
      </p>
      ${paperType === 'real_past_paper' && subject.official_url
        ? html`<a class="btn btn--sm" style="margin-top:14px" href="${subject.official_url}" target="_blank" rel="noopener">${subject.board} past papers ${icon('external', { size: 15 })}</a>`
        : ''}
    </div>
    <div class="card tilt-2 side-filters">
      <i class="tape tape--l" aria-hidden="true"></i>
      <h2 class="h3">Find a paper</h2>
      ${tiers.length > 1 && !tieredSubject ? filterGroup('tier', 'Tier', [['all', 'Both'], ...tiers.map((tier) => [tier, tier])]) : ''}
      ${filterGroup('year', 'Year', [['all', 'All'], ...years.map((year) => [String(year), String(year)])])}
      ${codes.length > 1 ? filterGroup('code', 'Paper', [['all', 'All'], ...codes.map((code) => [code, /^P\d+$/.test(code) ? `Paper ${code.slice(1)}` : code])]) : ''}
      ${filterGroup('status', 'Status', [['all', 'All'], ['todo', 'Not started'], ['progress', 'In progress'], ['done', 'Completed']])}
    </div>
    <div class="card tilt-1 side-progress">
      <i class="tape tape--r" aria-hidden="true"></i>
      <h2 class="h3">Completed</h2>
      ${(() => {
        const shown = tierPapers();
        const completed = shown.filter((paper) => summaries.has(paper.paper_id)).length;
        return html`<p class="side-progress__row"><span class="muted small">papers sat${tieredSubject && filters.tier !== 'all' ? ` · ${filters.tier}` : ''}</span><b>${completed} <span>of ${shown.length}</span></b></p>
          ${meter(shown.length ? (completed / shown.length) * 100 : 0, 'accent', `${completed} of ${shown.length} papers completed`)}`;
      })()}
    </div>`;

  // The visible tier control above the list (tiered GCSEs).
  const tierBar = () => (tieredSubject && !needsTier
    ? html`<div class="tier-switch tier-switch--papers" data-tier-bar>
        <span class="tier-switch__label" id="papers-tier-label">Tier</span>
        <div class="seg" role="radiogroup" aria-labelledby="papers-tier-label">
          ${[...tiers.map((tier) => [tier, tier]), ['all', 'Both tiers']].map(([value, label]) => html`<button type="button" class="seg__opt" role="radio" aria-checked="${filters.tier === value}" data-filter="tier" data-value="${value}">${label}</button>`)}
        </div>
        <span class="small muted tier-switch__note">${chosenTier
          ? filters.tier === chosenTier ? `Showing your saved tier. Switch to see ${tiers.filter((tier) => tier !== chosenTier).join(' or ')} papers.` : `Your saved tier is ${chosenTier}.`
          : 'Choose a tier in your subject settings to start on it.'}</span>
      </div>`
    : '');
  const tierPrompt = () => html`<section class="card ruled tier-prompt" data-tier-prompt>
      <h2 class="card__title">Choose Foundation or Higher</h2>
      <p class="muted">${subject.subject} papers are set at Foundation (grades 1 to 5) and Higher (grades 4 to 9). Choose your tier to list its papers. Your saved marks and history are kept.</p>
      <div class="row row--tight">${subject.tiers.map((tier) => html`<button type="button" class="btn" data-save-tier="${tier}">${tier}</button>`)}</div>
    </section>`;

  tintPage(subject);
  setHtml(
    element,
    html`${head(subject.subject)}
      <div class="stack stack--lg" style="${scStyle(subject)}">
        ${subjectPills(enrolled, subject.subject_id, (id) => links.papers(id, paperType))}
        ${subject.catalogue_note ? banner(subject.catalogue_note) : ''}
        <div class="with-side">
          <aside class="with-side__side" data-side>${sidebar()}</aside>
          <div class="stack" style="min-width:0">${tierBar() ? html`<div data-tier-holder>${tierBar()}</div>` : ''}<div data-list>${needsTier ? tierPrompt() : list()}</div></div>
        </div>
      </div>`,
  );

  on(element, 'click', '[data-filter]', (event, chip) => {
    filters[chip.dataset.filter] = chip.dataset.value;
    if (chip.dataset.filter === 'tier') {
      // Paper codes follow the tier; a code from the other tier no longer applies.
      codes = codesFor(filters.tier);
      if (!codes.includes(filters.code)) filters.code = 'all';
      setHtml($('[data-side]', element), sidebar());
      const holder = $('[data-tier-holder]', element);
      if (holder) setHtml(holder, tierBar());
      $(`[data-tier-bar] [data-value="${CSS.escape(filters.tier)}"]`, element)?.focus();
    }
    for (const other of element.querySelectorAll(`[data-filter="${chip.dataset.filter}"]`)) other.setAttribute('aria-checked', String(other.dataset.value === filters[chip.dataset.filter]));
    setHtml($('[data-list]', element), list());
  });
  on(element, 'click', '[data-save-tier]', async (event, button) => {
    await saveSubjectSettings(subject.subject_id, { tier: validTier(subject, button.dataset.saveTier) });
    context.refresh();
  });
}
