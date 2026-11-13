// One subject: tick what you have LEARNED (the input to the filtering engine, PRD 4.1),
// see mastery per topic, and find out which spec points would unlock the most questions.

import { $, html, on, setHtml } from '../../core/dom.js';
import { percent, plural } from '../../core/utils.js';
import * as api from '../../data/api.js';
import { getBundle, getSubjects, specIndex } from '../../data/content-repository.js';
import { TARGET_BANDS, gradesIn, latestByQuestion, masteryByNode, paperHistory, ragFor, targetBand, totals } from '../../engine/analytics.js';
import { countByNode, filterQuestions, foreignSpecPoints, unlockSuggestions } from '../../engine/filter-engine.js';
import { icon } from '../icons.js';
import { mountSpecTree } from '../spec-tree.js';
import { attemptInSubject, practicePool } from '../student.js';
import { saveSubjectSettings, scStyle, targetGrade, tintPage } from '../subject-colours.js';
import { subjectDialog } from '../subject-dialog.js';
import { banner, confirmDialog, emptyState, fmtPercent, meter, pageHead, ragBadge, subjectName, toast } from '../ui.js';

export async function mount(element, context) {
  const [bundle, subjects] = await Promise.all([getBundle(context.params.subjectId), getSubjects()]);
  const { subject, spec } = bundle;
  const subjectId = subject.subject_id;
  const subjectById = new Map(subjects.map((candidate) => [candidate.subject_id, candidate]));
  context.setTitle(subject.subject);

  const progress = api.getProgress();
  const pool = practicePool(bundle);
  const questionCounts = countByNode(pool, specIndex);
  const foreign = foreignSpecPoints(pool, subjectId, specIndex); // spec points owned by other subjects
  const leaves = specIndex.subjectLeaves(subjectId);

  let derived = null;
  function compute() {
    const learned = api.learnedSet();
    const latest = latestByQuestion(progress.question_attempts);
    const result = filterQuestions(pool, {}, { specIndex, learned, latestAttempts: latest });
    derived = {
      learned,
      mastery: masteryByNode(latest, bundle.questionsById, specIndex),
      unlocked: result.matches.length,
      locked: result.locked,
      suggestions: unlockSuggestions(result.locked, 6),
      score: totals([...latest.values()].filter((attempt) => attemptInSubject(attempt, bundle))),
    };
  }
  compute();

  const enrolled = () => progress.enrolled_subjects.includes(subjectId);

  tintPage(subject);
  setHtml(
    element,
    html`${pageHead({
        crumbs: [{ label: 'Home', href: '#/' }, { label: 'My subjects', href: '#/subjects' }, { label: subject.subject }],
        title: subject.subject,
        sub: `${subject.level} · ${subject.board} ${subject.spec_code} · ${subject.spec_notes}`,
        actions: subject.has_written_exam
          ? html`<a class="btn btn--primary" href="#/practice?subject=${subjectId}">${icon('sliders')} Practise</a>
              <a class="btn" href="#/papers?subject=${subjectId}">Past papers</a>
              <a class="btn btn--ghost" href="${subject.official_url}" target="_blank" rel="noopener">${subject.board} site ${icon('external', { size: 15 })}</a>`
          : '',
      })}
      <div class="stack stack--lg" style="${scStyle(subject)}">
        <div class="row row--tight subject-settings" data-settings></div>
        <div data-enrol-banner></div>
        ${subject.board_note ? banner(subject.board_note, { type: 'warn' }) : ''}
        ${subject.has_written_exam
          ? html`<section class="grid grid--stats" data-stats aria-label="Summary"></section>
              <div class="split">
                <section class="card ruled tilt-4">
          <i class="tape tape--l" aria-hidden="true"></i>
                  <div class="card__head">
                    <h2 class="card__title">What have you learned so far?</h2>
                  </div>
                  <p class="muted" style="margin-bottom:16px">
                    Tick each topic or spec point once you have covered it. You will only be given questions where every spec point they need,
                    including crossover knowledge, is ticked.
                  </p>
                  ${leaves.length ? html`<div data-tree></div>` : emptyState({ title: 'No specification tree yet', text: 'Topics for this subject have not been added.' })}
                </section>
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
    const learnedCount = leaves.filter((id) => derived.learned.has(id)).length;
    setHtml(
      target,
      html`<div class="stat ruled">
          <span class="stat__label">Spec points learned</span>
          <span class="stat__value">${learnedCount}<span class="stat__of"> / ${leaves.length}</span></span>
          ${meter(percent(learnedCount, leaves.length), 'accent', 'Share of spec points learned')}
        </div>
        <div class="stat ruled">
          <span class="stat__label">Questions unlocked</span>
          <span class="stat__value">${derived.unlocked}<span class="stat__of"> / ${pool.length}</span></span>
          <span class="stat__note">${derived.locked.length ? `${derived.locked.length} need topics you have not ticked` : 'Everything in the bank is available'}</span>
        </div>
        <div class="stat ruled">
          <span class="stat__label">Questions answered</span>
          <span class="stat__value">${derived.score.count}</span>
        </div>
        ${lastVsTarget()
          ? html`<div class="stat ruled">
              <span class="stat__label">Last paper vs target</span>
              <span class="stat__value">${lastVsTarget().last.grade}<span class="stat__of"> / target ${lastVsTarget().target}</span></span>
              <span class="stat__note small">${lastVsTarget().band ? html`<span class="band" data-band="${lastVsTarget().band}">${TARGET_BANDS[lastVsTarget().band].label}</span>` : ''} ${lastVsTarget().last.title || ''}, ${fmtPercent(lastVsTarget().last.percentage)}</span>
            </div>`
          : html`<div class="stat ruled">
              <span class="stat__label">Average score</span>
              <span class="stat__value">${fmtPercent(derived.score.percentage)}</span>
              <span class="stat__note">${derived.score.count ? ragBadge(ragFor(derived.score.percentage)) : 'No attempts yet'}</span>
            </div>`}`,
    );
  }

  function lastVsTarget() {
    const target = targetGrade(subject);
    const history = paperHistory(progress.paper_attempts, { subjectId }).filter((attempt) => attempt.grade);
    if (!target || !history.length) return null;
    return { target, last: history[0], history: history.slice(0, 5), band: targetBand(history[0].grade, target, subject.grade_scheme) };
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
          <h2 class="card__title">Unlock more questions</h2>
          ${pool.length === 0
            ? html`<p class="muted small" style="margin-top:8px">There are no questions for this subject yet.</p>`
            : derived.locked.length === 0
              ? html`<p class="muted small" style="margin-top:8px">Every question in the bank is available to you.</p>`
              : html`<p class="muted small" style="margin:8px 0 12px">
                    ${plural(derived.locked.length, 'question')} ${derived.locked.length === 1 ? 'is' : 'are'} locked. Learning these spec points opens the most:
                  </p>
                  <ul class="unlocklist">
                    ${derived.suggestions.map(
                      (entry) =>
                        html`<li>
                          <div style="min-width:0">
                            <p>${labelWithSubject(entry.id)}</p>
                            <p class="small muted">
                              ${entry.unlocks ? `Unlocks ${plural(entry.unlocks, 'question')} on its own` : `Needed by ${plural(entry.needed_by, 'locked question')}`}
                            </p>
                          </div>
                          <button type="button" class="btn btn--sm" data-learn="${entry.id}">Mark learned</button>
                        </li>`,
                    )}
                  </ul>`}
        </section>
        ${foreignGroups.size
          ? html`<section class="card ruled tilt-3">
          <i class="tape tape--c" aria-hidden="true"></i>
              <h2 class="card__title">Crossover knowledge</h2>
              <p class="muted small" style="margin:8px 0 12px">
                Some ${subject.subject} questions also draw on other subjects. Tick what you know so those questions can be unlocked.
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
  if (treeElement) {
    tree = mountSpecTree(treeElement, {
      spec,
      selected: leaves.filter((id) => derived.learned.has(id)),
      noun: 'learned',
      topicMeta: (topic, { selected, total }) => {
        const entry = derived.mastery.get(topic.id);
        const count = questionCounts.get(topic.id) || 0;
        return html`${entry ? ragBadge(entry.rag, entry.percentage, { label: false }) : ''}
          <span>${count} ${count === 1 ? 'question' : 'questions'}</span><span>${selected}/${total} learned</span>`;
      },
      pointMeta: (id) => {
        const entry = derived.mastery.get(id);
        const count = questionCounts.get(id) || 0;
        return html`${entry ? ragBadge(entry.rag, entry.percentage, { label: false }) : ''}${count ? html`<span>${count} q</span>` : ''}`;
      },
      onChange: async (selected, changed, checked) => {
        await api.setLearned(changed, checked);
        refresh();
      },
    });
  }

  function refresh() {
    compute();
    tree?.refreshMeta();
    drawStats();
    drawSide();
  }

  on(element, 'click', '[data-learn]', async (event, button) => {
    const id = button.dataset.learn;
    await api.setLearned([id], true);
    if (leaves.includes(id)) tree?.setSelected(leaves.filter((leaf) => api.learnedSet().has(leaf)));
    refresh();
    toast(`Marked as learned: ${specIndex.label(id)}`, { type: 'success' });
  });
  on(element, 'change', '[data-foreign]', async (event, box) => {
    await api.setLearned([box.dataset.foreign], box.checked);
    refresh();
  });
  on(element, 'click', '[data-settings-edit]', async () => {
    const choice = await subjectDialog({ subject, mode: 'edit' });
    if (!choice) return;
    await saveSubjectSettings(subjectId, { swatch: choice.swatch, target: choice.target });
    context.refresh();
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
