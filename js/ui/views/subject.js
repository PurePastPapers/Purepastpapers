// One subject: tick what you have LEARNED (the input to the filtering engine, PRD 4.1),
// see mastery per topic, and find out which spec points would unlock the most questions.

import { $, html, on, setHtml } from '../../core/dom.js';
import { percent, plural } from '../../core/utils.js';
import * as api from '../../data/api.js';
import { getBundle, getSubjects, specIndex } from '../../data/content-repository.js';
import { gradesIn, latestByQuestion, masteryByNode, paperHistory, ragFor, targetBand, totals } from '../../engine/analytics.js';
import { countByNode, filterQuestions, foreignSpecPoints, unlockSuggestions } from '../../engine/filter-engine.js';
import { icon } from '../icons.js';
import { mountSpecTree } from '../spec-tree.js';
import { topicOrganisationControl } from '../topic-organisation.js';
import { textbookMasteryByNode } from '../../engine/textbook-index.js';
import { attemptInSubject, practicePool, scopeBundle } from '../student.js';
import { moduleScopeBanner } from '../module-scope.js';
import { saveSubjectSettings, scStyle, targetGrade, tintPage } from '../subject-colours.js';
import { addSubject, editSubject } from '../enrol.js';
import { isTiered, questionsForTier, savedTier, specForTier, tierLeaves, tierRequired, validTier } from '../../engine/tiers.js';
import { banner, confirmDialog, emptyState, fmtPercent, meter, pageHead, ragBadge, subjectName, toast } from '../ui.js';
import { links } from '../../core/links.js';

export async function mount(element, context) {
  const [fullBundle, subjects] = await Promise.all([getBundle(context.params.subjectId), getSubjects()]);
  // Further Maths: Core Pure plus the student's chosen modules (ticks elsewhere are kept).
  const bundle = scopeBundle(fullBundle);
  const { subject, spec, textbooks } = bundle;
  const subjectId = subject.subject_id;
  const subjectById = new Map(subjects.map((candidate) => [candidate.subject_id, candidate]));
  context.setTitle(subject.subject);

  const progress = api.getProgress();
  const enrolled = () => progress.enrolled_subjects.includes(subjectId);
  // Tiered GCSEs (owner request 2026-11-19): the page shows one tier's spec points, counts and
  // questions. An enrolled student sees their saved tier; anyone else picks one here first.
  // A science (`tier_required`) with no tier shows a "Choose a tier" prompt instead of content.
  const tiered = isTiered(subject);
  const required = tierRequired(subject);
  const viewTier = tiered ? (enrolled() ? savedTier(subject, progress) : validTier(subject, context.query.tier)) : null;
  const needsTier = tiered && required && !viewTier;
  const tierSpec = specForTier(spec, viewTier);
  const pool = questionsForTier(practicePool(bundle), viewTier, bundle.papersById);
  const questionCounts = countByNode(pool, specIndex);
  const foreign = foreignSpecPoints(pool, subjectId, specIndex); // spec points owned by other subjects
  // Module routes (Further Maths) list Core Pure plus chosen modules; tiers list one tier.
  const leaves = bundle.scopeLeaves || tierLeaves(specIndex, subjectId, viewTier);
  const textbookCounts = textbooks?.counts(pool);
  let organisation = textbooks ? progress.preferences[`coveredView:${subjectId}`] || 'textbook' : 'official';
  if (!['textbook', 'official'].includes(organisation)) organisation = 'textbook';
  const textbookMode = () => Boolean(textbooks && organisation === 'textbook');
  const viewLeaves = () => textbookMode() ? textbooks.ids : leaves;

  let derived = null;
  function compute() {
    const learned = api.learnedSet();
    const latest = latestByQuestion(progress.question_attempts);
    const result = filterQuestions(pool, {learnedNamespace: textbookMode() ? 'textbook' : 'official'}, { specIndex, learned, latestAttempts: latest });
    const suggestions = textbookMode() ? result.locked.map(({question, missing}) => ({question,
      missing: [...new Set(missing.flatMap(id => question.textbook_requirements?.[id]?.ids || [id]))].filter(id => !learned.has(id))})) : result.locked;
    derived = {
      learned,
      mastery: masteryByNode(latest, bundle.questionsById, specIndex),
      textbookMastery: textbooks ? textbookMasteryByNode(latest,bundle.questionsById,textbooks) : null,
      unlocked: result.matches.length,
      locked: result.locked,
      suggestions: unlockSuggestions(suggestions, 6),
      score: totals([...latest.values()].filter((attempt) => attemptInSubject(attempt, bundle))),
    };
  }
  compute();

  // The tier control: Foundation / Higher (plus Both tiers where a choice is optional).
  const tierOptions = tiered ? [...subject.tiers.map((tier) => [tier, tier]), ...(required ? [] : [['', 'Both tiers']])] : [];
  const tierControl = () => (tiered
    ? html`<div class="tier-switch" data-tier-switch>
        <span class="tier-switch__label" id="tier-switch-label">${viewTier ? 'Tier' : 'Choose a tier'}</span>
        <div class="seg" role="radiogroup" aria-labelledby="tier-switch-label">
          ${tierOptions.map(([value, label]) => html`<button type="button" class="seg__opt" role="radio" aria-checked="${(viewTier || '') === value && !(needsTier && !value)}" data-set-tier="${value}">${label}</button>`)}
        </div>
        <span class="small muted tier-switch__note">${viewTier
          ? enrolled() ? `Saved for ${subject.spec_code}. Changing it keeps your ticks and scores.` : 'Add the subject to save this tier.'
          : required ? 'Pick Foundation or Higher to see its specification points and questions.' : 'Showing both tiers.'}</span>
      </div>`
    : '');

  tintPage(subject);
  setHtml(
    element,
    html`${pageHead({
        crumbs: [{ label: 'Home', href: links.home() }, { label: 'My subjects', href: links.subjects() }, { label: subject.subject }],
        title: subject.subject,
        sub: `${subject.level} · ${subject.board} ${subject.spec_code} · ${subject.spec_notes}`,
        actions: subject.has_written_exam
          ? html`<a class="btn btn--primary" href="${links.practice({ subject: subjectId, mode: 'individual' })}">${icon('sliders')} Find questions</a>
              <a class="btn" href="${links.papers(subjectId)}">Full past papers</a>
              <a class="btn btn--ghost" href="${subject.official_url}" target="_blank" rel="noopener">${subject.board} site ${icon('external', { size: 15 })}</a>`
          : '',
      })}
      <div class="stack stack--lg" style="${scStyle(subject)}">
        <div class="row row--tight subject-settings" data-settings></div>
        <div data-enrol-banner></div>
        ${moduleScopeBanner(bundle)}
        ${subject.board_note ? banner(subject.board_note, { type: 'warn' }) : ''}
        ${tierControl()}
        ${subject.has_written_exam && needsTier
          ? html`<section class="card ruled tier-prompt" data-tier-prompt>
              <h2 class="card__title">Choose Foundation or Higher</h2>
              <p class="muted">${subject.subject} is sat at Foundation (grades 1 to 5) or Higher (grades 4 to 9). Your tier sets the specification points, questions, tests and past papers shown${enrolled() ? '. Your saved ticks, marks and history are kept.' : '.'}</p>
              <div class="row row--tight">${subject.tiers.map((tier) => html`<button type="button" class="btn" data-set-tier="${tier}">${tier}</button>`)}</div>
            </section>`
          : subject.has_written_exam
          ? html`<p class="muted">Find questions: browse individual questions by topic, specification point, difficulty and exam year. Full past papers opens original papers by year, series and paper.</p><section class="grid grid--stats" data-stats aria-label="Summary"></section>
              <div class="split">
                ${api.currentUser() ? html`<details class="card ruled tilt-4" open>
          <i class="tape tape--l" aria-hidden="true"></i>
                  <summary class="card__title">Topics I’ve covered</summary>
                  <p class="muted" style="margin-bottom:16px">
                    Tick the chapters and points you have covered. Textbook and official-spec ticks are saved separately; a textbook subsection never marks an entire official point learned.
                  </p>
                  ${topicOrganisationControl(organisation, {available: Boolean(textbooks), name: 'covered-organisation'})}
                  ${leaves.length ? html`<div data-tree></div>` : emptyState({ title: 'No specification tree yet', text: 'Topics for this subject have not been added.' })}
                </details>` : html`<section class="card"><h2>Choose topics for practice</h2><p>You can select any topics without saving a learned-topic list.</p><a class="btn" href="${links.practice({ subject: subjectId })}">Find questions</a></section>`}
                <aside class="stack" data-side></aside>
              </div>`
          : emptyState({ iconName: 'info', title: 'No written exam', text: subject.no_written_exam })}
      </div>`,
  );

  function drawSettings() {
    const holder = $('[data-settings]', element);
    const target = targetGrade(subject);
    setHtml(
      holder,
      enrolled()
        ? html`<button type="button" class="tag tag--btn" data-settings-edit><span class="cdot cdot--sm" aria-hidden="true"></span>Colour</button>
            <button type="button" class="tag tag--btn" data-settings-edit>Target grade <b>${target || 'not set'}</b> ▾</button>
            ${bundle.scope ? html`<button type="button" class="tag tag--btn" data-module-routes="${subjectId}">Modules <b>${bundle.scope.configured ? 'chosen' : 'not set'}</b> ▾</button>` : ''}
            <button type="button" class="tag tag--btn" data-unenrol>Remove subject</button>`
        : '',
    );
  }

  function drawEnrolBanner() {
    setHtml(
      $('[data-enrol-banner]', element),
      enrolled()
        ? ''
        : banner(html`This subject is not in your list yet. <button type="button" class="linkbtn" data-enrol>Add ${subject.subject} to my subjects</button>`),
    );
  }

  function drawStats() {
    const target = $('[data-stats]', element);
    if (!target) return;
    const currentLeaves = viewLeaves();
    const learnedCount = currentLeaves.filter(id => derived.learned.has(id)).length;
    setHtml(
      target,
      html`<div class="stat ruled">
          <span class="stat__label">${textbookMode() ? 'Textbook sections learned' : 'Official points learned'}</span>
          <span class="stat__value">${learnedCount}<span class="stat__of"> / ${currentLeaves.length}</span></span>
          ${meter(percent(learnedCount, currentLeaves.length), 'accent', 'Share of selected curriculum learned')}
        </div>
        <div class="stat ruled">
          <span class="stat__label">Questions matching your covered topics</span>
          <span class="stat__value">${derived.unlocked}<span class="stat__of"> / ${pool.length}</span></span>
          <span class="stat__note">${derived.locked.length ? `${derived.locked.length} need topics you have not ticked. Browse them with the covered-content filter off.` : 'All questions match your covered topics'}</span>
        </div>
        <div class="stat ruled">
          <span class="stat__label">Questions marked</span>
          <span class="stat__value">${derived.score.count}</span>
          <span class="stat__note">Distinct questions with a saved mark</span>
        </div>
        <div class="stat ruled">
              <span class="stat__label">Average score</span>
              <span class="stat__value">${fmtPercent(derived.score.percentage)}</span>
              <span class="stat__note">${derived.score.count ? ragBadge(ragFor(derived.score.percentage)) : 'No attempts yet'}</span>
        </div>`,
    );
  }

  function targetCard() {
    const target = targetGrade(subject);
    const grades = gradesIn(subject.grade_scheme).filter((grade) => grade !== 'U');
    const at = grades.indexOf(target);
    const recent = paperHistory(progress.paper_attempts, { subjectId }).filter((attempt) => attempt.grade).slice(0, 5);
    return html`<section class="card ruled tilt-2">
      <i class="tape tape--r" aria-hidden="true"></i>
      <h2 class="card__title">Your target</h2>
      <div class="target" style="margin:12px 0 14px">
        <span class="target__grade">${target || '–'}</span>
        <span class="small muted">${target ? 'Papers are rated against it.' : 'No target grade yet. Set one to see how your papers compare.'}<br /><button type="button" class="linkbtn" data-settings-edit>${target ? 'Change target' : 'Set a target'}</button></span>
      </div>
      ${target
        ? html`<p class="label">How papers are rated</p>
            <ul class="band-key">
              <li><span class="band" data-band="exceeding">Exceeding target</span>${at > 0 ? grades.slice(0, at).join(', ') : '—'}</li>
              <li><span class="band" data-band="secure">Secure</span>${target}</li>
              <li><span class="band" data-band="developing">Developing</span>${grades[at + 1] || '—'}</li>
              <li><span class="band" data-band="needs_work">Needs work</span>${grades[at + 2] ? `${grades[at + 2]} or lower` : '—'}</li>
            </ul>
            ${recent.length
              ? html`<p class="label" style="margin-top:14px">Your last ${recent.length === 1 ? 'paper' : `${recent.length} papers`}</p>
                  <p class="row row--tight" style="margin-top:6px">${recent.map((attempt) => html`<span class="band" data-band="${targetBand(attempt.grade, target, subject.grade_scheme)}" title="${attempt.title || ''}">${attempt.grade}</span>`)}</p>`
              : ''}`
        : ''}
    </section>`;
  }

  const labelWithSubject = (id) => {
    const textbook = textbooks?.points.get(id);
    if (textbook) return `${textbook.book.short_title} · ${textbook.code} ${textbook.title}`;
    const owner = specIndex.subjectOf(id);
    const name = specIndex.label(id);
    return owner && owner !== subjectId ? `${name} (${subjectById.get(owner)?.subject || 'another subject'})` : name;
  };

  function drawSide() {
    const target = $('[data-side]', element);
    if (!target) return;

    const foreignGroups = new Map(); // other subject → [{ id, count }]
    for (const [id, count] of foreign) {
      const owner = specIndex.subjectOf(id);
      if (!foreignGroups.has(owner)) foreignGroups.set(owner, []);
      foreignGroups.get(owner).push({ id, count });
    }

    setHtml(
      target,
      html`${enrolled() ? targetCard() : ''}<section class="card ruled tilt-1">
          <i class="tape tape--c" aria-hidden="true"></i>
          <h2 class="card__title">More questions match when you cover…</h2>
          ${pool.length === 0
            ? html`<p class="muted small" style="margin-top:8px">There are no questions for this subject yet.</p>`
            : derived.locked.length === 0
              ? html`<p class="muted small" style="margin-top:8px">All questions in the bank match your covered topics.</p>`
              : html`<p class="muted small" style="margin:8px 0 12px">
                    ${plural(derived.locked.length, 'question')} need topics you have not marked as covered. These points match the most additional questions:
                  </p>
                  <ul class="unlocklist">
                    ${derived.suggestions.map(
                      (entry) =>
                        html`<li>
                          <div style="min-width:0">
                            <p>${labelWithSubject(entry.id)}</p>
                            <p class="small muted">
                              ${entry.unlocks ? `Matches ${plural(entry.unlocks, 'question')} on its own` : `Needed by ${plural(entry.needed_by, 'question')}`}
                            </p>
                          </div>
                          ${api.currentUser() ? html`<button type="button" class="btn btn--sm" data-learn="${entry.id}">Mark learned</button>` : ''}
                        </li>`,
                    )}
                  </ul>`}
        </section>
        ${foreignGroups.size
          ? html`<section class="card ruled tilt-3">
          <i class="tape tape--c" aria-hidden="true"></i>
              <h2 class="card__title">Crossover knowledge</h2>
              <p class="muted small" style="margin:8px 0 12px">
                Some ${subject.subject} questions also draw on other subjects. Tick what you know to include those questions in covered-content results.
              </p>
              ${[...foreignGroups].map(
                ([owner, entries]) =>
                  html`<p class="label" style="margin-top:10px">${subjectById.get(owner) ? subjectName(subjectById.get(owner)) : 'Other subject'}</p>
                    <ul class="stack stack--sm" style="margin-top:6px">
                      ${entries
                        .sort((a, b) => specIndex.label(a.id).localeCompare(specIndex.label(b.id), 'en', { numeric: true }))
                        .map(
                          ({ id, count }) =>
                            html`<li>
                              <label class="check">
                                <input type="checkbox" data-foreign="${id}" ${derived.learned.has(id) ? 'checked' : ''} />
                                <span>${specIndex.label(id)} <span class="small muted">· ${plural(count, 'question')}</span></span>
                              </label>
                            </li>`,
                        )}
                    </ul>`,
              )}
            </section>`
          : ''}`,
    );
  }

  let tree = null;
  const treeElement = $('[data-tree]', element);
  function mountCoveredTree() {
    if (!treeElement) return;
    tree = mountSpecTree(treeElement, {
      spec: textbookMode() ? textbooks.tree : tierSpec,
      filterLayout: true,
      selected: viewLeaves().filter(id => derived.learned.has(id)),
      noun: 'learned',
      topicMeta: (topic, { selected, total }) => {
        const entry = textbookMode() ? derived.textbookMastery.get(topic.id) : derived.mastery.get(topic.id);
        const count = textbookMode() ? textbookCounts.get(topic.id) || 0 : questionCounts.get(topic.id) || 0;
        return html`${entry ? ragBadge(entry.rag || ragFor(entry.percentage), entry.percentage, { label: false }) : ''}
          <span>${count} ${count === 1 ? 'question' : 'questions'}</span><span>${selected}/${total} learned</span>`;
      },
      pointMeta: (id) => {
        const entry = textbookMode() ? derived.textbookMastery.get(id) : derived.mastery.get(id);
        const count = textbookMode() ? textbookCounts.get(id) || 0 : questionCounts.get(id) || 0;
        return html`${entry ? ragBadge(entry.rag || ragFor(entry.percentage), entry.percentage, { label: false }) : ''}${count ? html`<span>${count} q</span>` : ''}`;
      },
      onChange: async (selected, changed, checked) => {
        if (textbookMode()) await api.setTextbookLearned(changed, checked);
        else await api.setLearned(changed, checked);
        refresh();
      },
    });
  }
  mountCoveredTree();
  on(element, 'change', '[data-topic-organisation]', async (event, input) => {
    organisation = input.value;
    await api.setPreference(`coveredView:${subjectId}`, organisation);
    compute();
    mountCoveredTree();
    refresh();
  });

  function refresh() {
    compute();
    tree?.refreshMeta();
    drawStats();
    drawSide();
  }

  on(element, 'click', '[data-learn]', async (event, button) => {
    const id = button.dataset.learn;
    if (textbooks?.points.has(id)) await api.setTextbookLearned([id], true);
    else await api.setLearned([id], true);
    tree?.setSelected(viewLeaves().filter(leaf => api.learnedSet().has(leaf)));
    refresh();
    toast(`Marked as learned: ${labelWithSubject(id)}`, { type: 'success' });
  });
  on(element, 'change', '[data-foreign]', async (event, box) => {
    await api.setLearned([box.dataset.foreign], box.checked);
    refresh();
  });
  on(element, 'click', '[data-settings-edit]', async () => {
    if (await editSubject(subject)) context.refresh();
  });
  on(element, 'click', '[data-set-tier]', async (event, button) => {
    const tier = validTier(subject, button.dataset.setTier);
    if ((tier || '') === (viewTier || '') && !needsTier) return;
    if (needsTier && !tier) return;
    if (enrolled()) {
      // Only the preference changes: learned ticks, attempts and history stay as they are.
      await saveSubjectSettings(subjectId, { tier });
      toast(tier ? `${subject.subject}: ${tier} tier.` : `${subject.subject}: both tiers.`, { type: 'success' });
      context.refresh();
    } else {
      context.navigate(`/subject/${encodeURIComponent(subjectId)}${tier ? `?tier=${encodeURIComponent(tier)}` : ''}`);
    }
  });
  on(element, 'click', '[data-unenrol]', async () => {
    const confirmed = await confirmDialog({
      title: `Remove ${subject.subject}?`,
      message: 'It leaves your subject list. Your learned topics and scores are kept, so you can add it back later.',
      confirmLabel: 'Remove subject',
      danger: true,
    });
    if (!confirmed) return;
    await api.setEnrolled(subjectId, false);
    context.navigate('/subjects');
  });
  on(element, 'click', '[data-enrol]', async () => {
    if (tiered) {
      // A tiered GCSE is added through the same window as My subjects, with the tier
      // chosen here already selected.
      if (!(await addSubject(subject, { initialTier: viewTier }))) return;
      toast(`${subject.subject} added to your subjects.`, { type: 'success' });
      context.refresh();
      return;
    }
    await api.setEnrolled(subjectId, true);
    drawSettings();
    drawSide();
    drawEnrolBanner();
    toast(`${subject.subject} added to your subjects.`, { type: 'success' });
  });

  drawSettings();
  drawEnrolBanner();
  drawStats();
  drawSide();
}
