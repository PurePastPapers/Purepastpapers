// Specification tree with checkboxes: sections → topics → spec points.
// Used to mark what a student has LEARNED (subject page) and to choose which learned
// topics to FOCUS on (practice filters). Ticking a topic ticks all of its spec points.

import { $, $$, html, on, setHtml } from '../core/dom.js';
import { icon } from './icons.js';

const KIND_TAGS = { option: 'Option', set_text: 'Set text', skill: 'Skill' };

/**
 * @param {HTMLElement} root
 * @param {object} options
 *   spec        specification document for one subject
 *   selected    Iterable of ticked spec point ids
 *   enabled     Set of ids that may be ticked (null = all). Others render disabled.
 *   noun        word for the counter, e.g. "learned" → "34 of 90 learned"
 *   disabledHint  tooltip for disabled rows
 *   pointMeta   (pointId) → markup shown at the end of a spec point row
 *   topicMeta   (topic, { selected, total }) → markup shown at the end of a topic row
 *   filterLayout  use collapsible section rows in the question-browser filter panel
 *   onChange    (selected: Set, changedIds: string[], checked: boolean) → void
 * @returns {{ getSelected(): Set<string>, refreshMeta(): void, setSelected(ids): void }}
 */
export function mountSpecTree(root, { spec, selected, enabled = null, noun = 'selected', disabledHint = '', pointMeta = null, topicMeta = null, filterLayout = false, onChange = () => {} }) {
  const state = new Set(selected);
  const usable = (id) => !enabled || enabled.has(id);
  const leavesOf = (topic) => (topic.points.length ? topic.points.map((point) => point.id) : [topic.id]);
  const topics = spec.sections.flatMap((section) => section.topics);
  const usableLeaves = topics.flatMap(leavesOf).filter(usable);

  const sectionTopics = (section) => section.topics.map(
    (topic) => html`<details class="tree__topic" data-topic="${topic.id}">
      <summary>
        <span class="tree__caret">${icon('chevronRight', { size: 16 })}</span>
        <input type="checkbox" class="tree__check" data-topic-check="${topic.id}" aria-label="${topic.title}: select every spec point" />
        <span class="tree__code">${topic.code}</span>
        <span class="tree__title">
          ${topic.title} ${KIND_TAGS[topic.kind] ? html`<span class="tag">${KIND_TAGS[topic.kind]}</span>` : ''}
        </span>
        <span class="tree__meta" data-topic-meta="${topic.id}"></span>
      </summary>
      <ul class="tree__points">
        ${topic.points.map((point) => html`<li class="tree__point ${usable(point.id) ? '' : 'is-disabled'}" data-point-row="${point.id}" title="${usable(point.id) ? '' : disabledHint}">
          <label>
            <input type="checkbox" class="tree__check" data-point="${point.id}" ${usable(point.id) ? '' : 'disabled'} />
            <span class="tree__code">${point.code}</span>
            <span class="tree__title">
              ${point.title} ${point.tier ? html`<span class="tag">${point.tier}</span>` : ''}
            </span>
          </label>
          <span class="tree__meta" data-point-meta="${point.id}"></span>
        </li>`)}
      </ul>
    </details>`,
  );

  setHtml(
    root,
    html`<div class="tree">
      <div class="tree__toolbar">
        <label class="searchbox">
          ${icon('search', { size: 16 })}
          <input class="input input--sm" type="search" placeholder="Search topics" aria-label="Search topics" data-tree-search />
        </label>
        <button type="button" class="btn btn--sm" data-tree-bulk="all">Select all</button>
        <button type="button" class="btn btn--sm" data-tree-bulk="none">Clear</button>
        <span class="tree__count" data-tree-count></span>
      </div>
      ${spec.sections.map(
        (section) =>
          filterLayout ? html`<details class="tree__section tree__section--filter" data-section="${section.id}">
            <summary>
              <input type="checkbox" class="tree__check tree__section-check" data-section-check="${section.id}" aria-label="${section.title}: select every spec point" />
              <span class="tree__section-title">${section.title}</span>
              <span class="tree__section-count">${section.topics.length} ${section.topics.length === 1 ? 'topic' : 'topics'}</span>
              <span class="tree__section-caret">${icon('chevronRight', { size: 16 })}</span>
            </summary>
            ${section.note ? html`<p class="small muted">${section.note}</p>` : ''}
            <div class="tree__topics">${sectionTopics(section)}</div>
          </details>` : html`<section class="tree__section" data-section="${section.id}">
            <header class="tree__section-head">
              <h3 class="h3">${section.title}</h3>
              ${section.note ? html`<span class="small muted">${section.note}</span>` : ''}
              <span class="spacer"></span>
              <button type="button" class="linkbtn small" data-section-bulk="${section.id}">Select section</button>
            </header>
            ${sectionTopics(section)}
          </section>`,
      )}
    </div>`,
  );

  function sync() {
    for (const box of $$('[data-point]', root)) box.checked = state.has(box.dataset.point);
    if (filterLayout) for (const section of spec.sections) {
      const leaves = section.topics.flatMap(leavesOf).filter(usable);
      const count = leaves.filter((id) => state.has(id)).length;
      const box = $(`[data-section-check="${CSS.escape(section.id)}"]`, root);
      box.checked = leaves.length > 0 && count === leaves.length;
      box.indeterminate = count > 0 && count < leaves.length;
      box.disabled = leaves.length === 0;
    }
    for (const topic of topics) {
      const leaves = leavesOf(topic).filter(usable);
      const count = leaves.filter((id) => state.has(id)).length;
      const box = $(`[data-topic-check="${CSS.escape(topic.id)}"]`, root);
      box.checked = leaves.length > 0 && count === leaves.length;
      box.indeterminate = count > 0 && count < leaves.length;
      box.disabled = leaves.length === 0;
      const meta = $(`[data-topic-meta="${CSS.escape(topic.id)}"]`, root);
      setHtml(meta, topicMeta ? topicMeta(topic, { selected: count, total: leavesOf(topic).length }) : html`<span>${count}/${leavesOf(topic).length}</span>`);
    }
    if (pointMeta) for (const cell of $$('[data-point-meta]', root)) setHtml(cell, pointMeta(cell.dataset.pointMeta));
    const total = usableLeaves.filter((id) => state.has(id)).length;
    $('[data-tree-count]', root).textContent = `${total} of ${usableLeaves.length} ${noun}`;
  }

  function apply(ids, checked) {
    const changed = ids.filter((id) => usable(id) && state.has(id) !== checked);
    if (!changed.length) {
      sync();
      return;
    }
    for (const id of changed) {
      if (checked) state.add(id);
      else state.delete(id);
    }
    sync();
    onChange(new Set(state), changed, checked);
  }

  on(root, 'change', '[data-point]', (event, box) => apply([box.dataset.point], box.checked));
  on(root, 'change', '[data-topic-check]', (event, box) => {
    const topic = topics.find((candidate) => candidate.id === box.dataset.topicCheck);
    apply(leavesOf(topic), box.checked);
  });
  on(root, 'click', '[data-tree-bulk]', (event, button) => apply(usableLeaves, button.dataset.treeBulk === 'all'));
  on(root, 'change', '[data-section-check]', (event, box) => {
    const section = spec.sections.find((candidate) => candidate.id === box.dataset.sectionCheck);
    apply(section.topics.flatMap(leavesOf), box.checked);
  });
  on(root, 'click', '[data-section-bulk]', (event, button) => {
    const section = spec.sections.find((candidate) => candidate.id === button.dataset.sectionBulk);
    const leaves = section.topics.flatMap(leavesOf).filter(usable);
    apply(leaves, !leaves.every((id) => state.has(id))); // acts as a toggle
  });

  on(root, 'input', '[data-tree-search]', (event, input) => {
    const query = input.value.trim().toLowerCase();
    for (const section of spec.sections) {
      const sectionHit = filterLayout && query && section.title.toLowerCase().includes(query);
      let sectionVisible = false;
      for (const topic of section.topics) {
        const element = $(`[data-topic="${CSS.escape(topic.id)}"]`, root);
        const topicHit = !query || sectionHit || `${topic.code} ${topic.title}`.toLowerCase().includes(query);
        let anyPoint = false;
        for (const point of topic.points) {
          const hit = topicHit || `${point.code} ${point.title}`.toLowerCase().includes(query);
          $(`[data-point-row="${CSS.escape(point.id)}"]`, root).hidden = !hit;
          anyPoint ||= hit;
        }
        element.hidden = !(topicHit || anyPoint);
        if (query) element.open = topicHit || anyPoint;
        sectionVisible ||= !element.hidden;
      }
      const sectionElement = $(`[data-section="${CSS.escape(section.id)}"]`, root);
      sectionElement.hidden = !sectionVisible;
      if (filterLayout && query) sectionElement.open = sectionVisible;
    }
  });

  sync();
  return {
    getSelected: () => new Set(state),
    refreshMeta: sync,
    setSelected(ids) {
      state.clear();
      for (const id of ids) state.add(id);
      sync();
    },
  };
}
