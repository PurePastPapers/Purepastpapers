// Read-only controls for verified alternate curriculum organisations. Choosing a
// view does not change learned coverage; consumers decide how to use the result.
import { html, on, setHtml } from '../core/dom.js';

/** Build a presentation-only tree without mutating the canonical specification. */
export function filterSpecForCurriculum(spec, visible) {
  if (!visible) return spec;
  return { ...spec, sections: spec.sections.map((section) => ({
    ...section,
    topics: section.topics.map((topic) => ({
      ...topic,
      points: topic.points.filter((point) => visible.has(point.id)),
      _curriculumVisible: topic.points.length ? topic.points.some((point) => visible.has(point.id)) : visible.has(topic.id),
    })).filter((topic) => topic._curriculumVisible),
  })).filter((section) => section.topics.length) };
}

export function mountCurriculumSelector(root, { curriculum, specIndex, initial = {}, emitInitial = true, onChange = () => {} }) {
  const { years, books, coverage } = curriculum;
  if (!years.length && !books.length) {
    const stale = Boolean(initial.year || initial.bookId || initial.chapterId);
    setHtml(root, html`<p class="small muted">${stale ? 'A saved curriculum filter is no longer available and has been cleared. ' : ''}Year and textbook chapter views are not yet verified for this subject. Browse the specification below.</p>`);
    if (emitInitial) onChange({ visible: null, full: new Set(), partial: new Map(), state: { year: '', bookId: '', chapterId: '' }, stale });
    return { getState: () => ({ year: '', bookId: '', chapterId: '' }) };
  }
  let year = ['12', '13'].includes(initial.year) && years.some((item) => String(item.year) === initial.year) ? initial.year : '';
  let bookId = books.some((item) => item.id === initial.bookId) ? initial.bookId : '';
  let chapterId = books.find((item) => item.id === bookId)?.chapters.some((item) => item.id === initial.chapterId) ? initial.chapterId : '';
  let stale = Boolean((initial.year && initial.year !== year) || (initial.bookId && initial.bookId !== bookId) || (initial.chapterId && initial.chapterId !== chapterId));
  // Book identity includes edition; it is never inferred from a chapter title.
  const bookKey = (book) => book.id;
  const intersect = (a, b) => new Set([...a].filter((id) => b.has(id)));

  function draw(emit = true) {
    const book = books.find((item) => bookKey(item) === bookId);
    const chapter = book?.chapters.find((item) => item.id === chapterId);
    const yearEntries = year ? years.filter((item) => String(item.year) === year) : years;
    const yearCoverage = yearEntries.length ? coverage(yearEntries) : null;
    const bookCoverage = chapter ? coverage([chapter]) : null;
    let visible = null;
    if (year && yearCoverage) visible = yearCoverage.visible;
    if (bookCoverage) visible = visible ? intersect(visible, bookCoverage.visible) : bookCoverage.visible;
    let chosen = bookCoverage || (year ? yearCoverage : null);
    if (year && yearCoverage && bookCoverage) {
      const full = intersect(yearCoverage.full, bookCoverage.full);
      const partial = new Map();
      for (const id of visible) if (!full.has(id)) {
        partial.set(id, [...(yearCoverage.partial.get(id) || []), ...(bookCoverage.partial.get(id) || [])]);
      }
      chosen = { full, partial, visible };
    }
    setHtml(root, html`<div class="stack">
      ${stale ? html`<p class="small muted">A saved curriculum filter is no longer available and has been cleared.</p>` : ''}
      ${years.length ? html`<label class="field"><span class="field__label">Content year</span><select class="select" data-curriculum-year><option value="">Both years</option>${[12, 13].filter((n) => years.some((item) => item.year === n)).map((n) => html`<option value="${n}" ${year === String(n) ? 'selected' : ''}>Year ${n}</option>`)}</select></label>` : ''}
      ${books.length ? html`<label class="field"><span class="field__label">Organisation</span><select class="select" data-curriculum-book><option value="">Official specification</option>${books.map((item) => html`<option value="${bookKey(item)}" ${bookId === bookKey(item) ? 'selected' : ''}>${item.publisher} · ${item.book} · ${item.edition}</option>`)}</select></label>` : ''}
      ${book ? html`<label class="field"><span class="field__label">Textbook chapter</span><select class="select" data-curriculum-chapter><option value="">All chapters</option>${book.chapters.map((item) => html`<option value="${item.id}" ${chapterId === item.id ? 'selected' : ''}>${item.title}</option>`)}</select></label>` : ''}
      ${chosen ? html`<p class="small muted">This view includes ${chosen.full.size} fully mapped and ${chosen.partial.size} partially mapped spec points. Changing the view does not change what you have covered.</p>${[...chosen.partial].map(([id, notes]) => html`<p class="small muted"><strong>${specIndex.label(id)}</strong> · Partial: ${notes.join('; ')}</p>`)}` : ''}
    </div>`);
    if (emit) onChange({ visible, full: chosen?.full || new Set(), partial: chosen?.partial || new Map(), state: { year, bookId, chapterId }, stale });
  }
  on(root, 'change', '[data-curriculum-year]', (event, select) => { year = select.value; stale = false; draw(); });
  on(root, 'change', '[data-curriculum-book]', (event, select) => { bookId = select.value; chapterId = ''; stale = false; draw(); });
  on(root, 'change', '[data-curriculum-chapter]', (event, select) => { chapterId = select.value; stale = false; draw(); });
  draw(emitInitial);
  return { getState: () => ({ year, bookId, chapterId }) };
}
