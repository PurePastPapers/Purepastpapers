// Markup for the student's own sets in the site's notebook style: the "Make your own set"
// dialog, the set page (cards list + side cards), the Add a card dialog and the Import page.
// flashcards.js owns the state and the actions; everything here is plain markup.
import { html, raw } from '../../core/dom.js';
import { icon } from '../icons.js';
import { progressLine } from './flashcards-pages.js?v=own-sets-ppp-1';

const n = (value) => Number(value || 0).toLocaleString('en-GB');
const plural = (count, word, many = `${word}s`) => `${n(count)} ${count === 1 ? word : many}`;
const checked = (on) => (on ? raw('checked') : '');

const crumbs = (label) => html`<nav class="crumbs" aria-label="Breadcrumb"><a href="#/">Home</a><span aria-hidden="true">/</span>
  <a href="#/flashcards" data-action="back-decks">Flashcards</a><span aria-hidden="true">/</span><span>${label}</span></nav>`;

/** Small line drawings for the three ways to add cards. */
const WAY_ART = {
  write: raw('<svg viewBox="0 0 40 40" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="5" y="9" width="24" height="18" rx="2" transform="rotate(-6 17 18)"/><path d="M14 33l3-1 15-15-2-2-15 15z"/></svg>'),
  anki: raw('<svg viewBox="0 0 40 40" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="8" y="6" width="20" height="26" rx="2"/><rect x="13" y="10" width="20" height="26" rx="2" fill="var(--surface)"/><path d="M18 18h10M18 23h10M18 28h6"/></svg>'),
  file: raw('<svg viewBox="0 0 40 40" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10 5h14l7 7v23H10z"/><path d="M24 5v7h7M15 20h11M15 25h11M15 30h7"/></svg>'),
};
const DROP_ART = raw('<svg viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="10" y="14" width="30" height="38" rx="3" transform="rotate(-8 25 33)" fill="#f3a37f"/><rect x="22" y="10" width="30" height="38" rx="3" fill="var(--surface)"/><path d="M37 34V20M31 26l6-6 6 6"/></svg>');

/** Radio tiles: one picked, ticked and lifted. `name` and `values` decide what a form reads. */
function wayTiles(name, picked, options, attrs = '') {
  return html`<div class="fc-ways" role="radiogroup">${options.map(([value, art, title, note]) => html`<label class="fc-way">
    <input class="sr-only" type="radio" name="${name}" value="${value}" ${checked(value === picked)} ${raw(attrs)}>
    <span class="fc-way__art">${WAY_ART[art]}</span><b>${title}</b><span>${note}</span></label>`)}</div>`;
}

const ADD_WAYS = [
  ['write', 'write', 'Write them myself', 'Type a front and a back for each card.'],
  ['anki', 'anki', 'From Anki', 'An .apkg file. Cards start fresh.'],
  ['file', 'file', 'Quizlet or CSV', 'Paste a Quizlet export or pick a CSV.'],
];
const IMPORT_WAYS = [
  ['anki', 'anki', 'From Anki', 'An .apkg file. Cards start fresh.'],
  ['quizlet', 'file', 'From Quizlet', 'Paste the text from Quizlet’s Export.'],
  ['csv', 'file', 'A CSV file', 'One column for the front, one for the back.'],
];

/** Subject chips (radio inputs) with each subject's colour dot. */
export function subjectChips(subjects, current) {
  return html`<div class="chips fc-pick" role="radiogroup" aria-label="Subject">
    <label class="chip"><input class="sr-only" type="radio" name="subject" value="" ${checked(!current)}>No subject</label>
    ${subjects.map((subject) => html`<label class="chip"><input class="sr-only" type="radio" name="subject" value="${subject.id}" ${checked(subject.id === current)}>
      <span class="dot" style="--sc:${subject.colour};background:${subject.colour}" aria-hidden="true"></span>${subject.name}</label>`)}</div>`;
}

/** Body of the "Make your own set" dialog. */
export function makeSetBody({ subjects, currentSubject, parents, way = 'write' }) {
  const subject = subjects.find((item) => item.id === currentSubject);
  return html`<div class="fc-make"><div class="fc-make__fields">
      <label class="field"><span class="field__label">Set name</span><input class="input" name="title" maxlength="100" required placeholder="e.g. Key studies" data-make-title></label>
      ${subjects.length ? html`<div class="field"><span class="field__label">Subject</span>${subjectChips(subjects, currentSubject)}<span class="field__hint">The set shows on this subject’s tab.</span></div>` : ''}
    </div>
    <div class="fc-make__preview" aria-hidden="true"><div class="card ruled fc-own fc-make__tile tilt-4"><i class="tape tape--c"></i>
      <h3 class="fc-own__title" data-make-preview-title>Your new set</h3><p class="fc-own__by">made by you<span data-make-preview-subject>${subject ? ` · ${subject.name}` : ''}</span> · 0 cards</p></div>
      <p class="fc-make__note">how it will look</p></div></div>
    <div class="field"><span class="field__label">How will you add cards?</span>${wayTiles('way', way, ADD_WAYS)}</div>
    ${parents.length ? html`<details class="fc-more"><summary>Put it inside another set (optional)</summary>
      <label class="field"><span class="field__label">Inside another set</span><select class="input" name="parent"><option value="">Not inside another set</option>${parents.map((item) => html`<option value="${item.id}">${item.title}</option>`)}</select></label></details>` : ''}`;
}

/** Body of the Add / Edit a card dialog: two taped index cards. */
export function cardEditorBody({ card, deckTitle, added = 0, editing = false }) {
  const type = card?.type || 'basic';
  const tags = Array.isArray(card?.tags) ? card.tags : [];
  const types = [['basic', 'Front and back'], ['reverse', 'Both ways round'], ['cloze', 'Fill the gap']];
  return html`<div class="fc-editor__top"><div class="seg" role="radiogroup" aria-label="Card type">${types.map(([value, label]) => html`<label class="seg__opt fc-seg">
      <input class="sr-only" type="radio" name="type" value="${value}" ${checked(value === type)} ${editing ? raw('disabled') : ''}>${label}</label>`)}</div>
    <span class="fc-hand">${editing ? 'editing a card in' : 'adding to'} ${deckTitle}</span></div>
    <p class="field__hint fc-cloze-hint">For fill the gap, put the hidden words in double braces: {{c1::Zimbardo}} ran the study in {{c2::1973}}. Each c number makes its own card.</p>
    <div class="fc-faces">
      <label class="card ruled fc-face tilt-1"><i class="tape tape--c" aria-hidden="true"></i><span class="fc-face__label" data-face-front>front</span>
        <textarea name="front" rows="5" required placeholder="The question or prompt">${editing ? card.front || '' : ''}</textarea></label>
      <label class="card ruled fc-face fc-face--back tilt-2"><i class="tape tape--c" aria-hidden="true"></i><span class="fc-face__label" data-face-back>back</span>
        <textarea name="back" rows="5" placeholder="The answer">${editing ? card.back || '' : ''}</textarea></label>
    </div>
    <div class="field"><span class="field__label" id="fc-tags-label">Tags</span><div class="fc-tagrow" data-tag-row>
      ${tags.map((tag) => html`<span class="chip" data-tag="${tag}">${tag}<button type="button" class="fc-tag-x" data-remove-tag aria-label="Remove tag ${tag}">×</button></span>`)}
      <input class="input" data-tag-input placeholder="Add a tag and press Enter" aria-labelledby="fc-tags-label"></div>
      <input type="hidden" name="tags" value="${tags.join(', ')}"></div>
    ${editing ? html`<p class="small muted">Editing keeps the card’s review history. The card type can’t be changed here.</p>`
      : added ? html`<p class="small muted" role="status">${plural(added, 'card')} added so far.</p>` : ''}`;
}

function stateBadge(card) {
  if (card.suspended) return html`<span class="fc-state fc-state--paused">Paused</span>`;
  if (!(card.revision > 0)) return html`<span class="fc-state">New</span>`;
  const due = card.due_at && Date.parse(card.due_at) <= Date.now();
  if (due) return html`<span class="fc-state fc-state--due">Due</span>`;
  const learning = /learn/i.test(card.state?.state || '');
  return learning ? html`<span class="fc-state fc-state--learning">Learning</span>` : html`<span class="fc-state fc-state--known">Known</span>`;
}

/** One row on the set page. `front` and `back` are already-rendered card faces. */
export function cardRow(card, { front, back, readOnly, points = [], otherTags = [] }) {
  return html`<li class="fc-row"><div class="fc-row__front"><div class="fc-row__text">${front}</div>
      <div class="fc-row__meta">${stateBadge(card)}${points.map((point) => html`<span class="tag">Spec ${point}</span>`)}${otherTags.map((tag) => html`<span class="tag">${tag}</span>`)}</div></div>
    <div class="fc-row__back">${back}</div>
    <div class="fc-row__acts">${readOnly ? html`<button class="btn btn--sm" data-action="preview-card" data-id="${card.id}">Preview</button>`
      : html`<button class="btn btn--sm" data-action="edit-card" data-id="${card.id}">${icon('pencil', { size: 14 })} Edit</button>
      <details class="fc-menu"><summary class="btn btn--sm fc-menu__btn" aria-label="More for this card">···</summary><div class="fc-menu__list">
        <button type="button" data-action="preview-card" data-id="${card.id}">Preview</button>
        <button type="button" data-action="move-card" data-id="${card.id}">Move to another set</button>
        <button type="button" data-action="suspend-card" data-id="${card.id}">${card.suspended ? 'Unpause this card' : 'Pause this card'}</button>
        <button type="button" class="is-danger" data-action="delete-card" data-id="${card.id}">Delete card</button></div></details>`}</div></li>`;
}

/** The status chips above the cards: status and paused share one row. */
export function filterChips(current) {
  const options = [['all', 'All'], ['new', 'New'], ['learning', 'Learning'], ['due', 'Due now'], ['reviewed', 'Reviewed'], ['paused', 'Paused']];
  return html`<div class="chips fc-filter-chips" role="group" aria-label="Show cards">${options.map(([value, label]) => html`<button type="button" class="chip ${value === current ? 'is-on' : ''}"
    aria-pressed="${value === current}" data-action="card-filter" data-id="${value}">${label}</button>`)}</div>`;
}

/** The set page frame. Results, spec point filter and topics fill their slots later. */
export function setPage({ deck, subject, readOnly, query, filter, sortOptions, results, specPoints, topics }) {
  const parts = deck.card_count || 0;
  const studyCount = (deck.due_count || 0) + (deck.learning_count || 0) + (deck.new_count || 0);
  const actions = readOnly
    ? html`<button class="btn" data-action="back-set" data-id="${deck.id}">${icon('chevronLeft', { size: 16 })} Back to the set</button><button class="btn btn--primary" data-action="study" data-id="${deck.id}">${icon('play', { size: 14 })} Study</button>`
    : html`<button class="btn btn--primary" data-action="study" data-id="${deck.id}">${icon('play', { size: 14 })} Study</button>
      <button class="btn" data-action="add-card">${icon('plus', { size: 16 })} Add card</button>
      <button class="btn" data-action="import-into" data-id="${deck.id}">${icon('upload', { size: 16 })} Import</button>
      <button class="btn" data-action="edit-settings">${icon('sliders', { size: 16 })} Settings</button>`;
  return html`<header class="page-head"><div class="page-head__text">${crumbs(deck.title)}
      <h1 class="page-head__title" tabindex="-1">${deck.title}</h1>
      <p class="page-head__sub">${readOnly ? 'PurePastPapers set' : 'made by you'}${subject ? ` · ${subject.name}` : ''} · <span data-manager-card-count>${plural(parts, 'card')}</span></p></div>
    <div class="page-head__actions">${actions}</div></header>
    <div class="fc-os">
      <section class="card ruled tilt-3 fc-os__card fc-os__cards" aria-labelledby="fc-cards-title"><i class="tape tape--l" aria-hidden="true"></i>
        <h2 class="card__title" id="fc-cards-title">Cards</h2>
        <div data-manager-topics>${topics}</div>
        <div class="fc-os__filters">
          <input class="input fc-os__search" type="search" data-search value="${query}" placeholder="Search cards and tags" aria-label="Search cards and tags">
          ${filterChips(filter)}
          <select class="input fc-os__sort" data-card-sort aria-label="Sort cards">${sortOptions}</select>
          <div data-manager-spec-points>${specPoints}</div>
        </div>
        <div data-manager-results>${results}</div>
      </section>
      <aside class="fc-os__side">
        <section class="card ruled tilt-2 fc-os__card"><i class="tape tape--c" aria-hidden="true"></i><h2 class="card__title">This set</h2>
          <p class="fc-hand">${readOnly ? 'made by PurePastPapers' : 'made by you'}${subject ? ` · ${subject.name}` : ''}</p>
          ${progressLine(deck)}
          <div class="fc-os__stats"><div><b>${n(deck.due_count)}</b><span>due</span></div><div><b>${n(deck.new_count)}</b><span>new</span></div><div><b>${n(deck.learning_count)}</b><span>learning</span></div></div>
          <button class="btn btn--primary fc-os__wide" data-action="study" data-id="${deck.id}">${icon('play', { size: 14 })} ${studyCount ? `Study ${plural(studyCount, 'card')}` : 'Study'}</button>
        </section>
        <section class="card ruled tilt-1 fc-os__card"><i class="tape tape--l" aria-hidden="true"></i><h2 class="card__title">Study settings</h2>
          <dl class="fc-os__kv"><div><dt>Remember</dt><dd>${deck.target_retention || 90}% of cards</dd></div><div><dt>New cards a day</dt><dd>${deck.new_limit ?? 999}</dd></div>
            ${readOnly ? '' : html`<div><dt>Subject</dt><dd>${subject ? html`<span class="dot" style="background:${subject.colour}" aria-hidden="true"></span> ${subject.name}` : 'None'}</dd></div>`}</dl>
          <div class="fc-os__kvfoot"><button class="btn btn--sm" data-action="edit-settings">Change</button>${readOnly ? '' : html`<button class="fc-os__danger" data-action="delete-deck">Delete set</button>`}</div>
        </section>
      </aside>
    </div>`;
}

/** Above the list: how many cards match, plus pause / unpause for everything shown. */
export function resultsSummary({ total, active, unsuspendable, readOnly, scope, filtered, protectedCount }) {
  if (readOnly) return html`<p class="fc-os__count" role="status">${plural(total, 'card')} · ${n(active)} in play</p>`;
  return html`<div class="fc-os__summary"><p class="fc-os__count" role="status">${plural(total, filtered ? 'matching card' : 'card')} · ${n(active)} active · ${n(total - active)} paused</p>
    <div class="fc-os__bulk"><button class="btn btn--sm" data-action="topic-suspend" ${active ? '' : raw('disabled')}>Pause ${scope}</button>
    <button class="btn btn--sm" data-action="topic-unsuspend" ${unsuspendable ? '' : raw('disabled')}>Unpause ${scope}</button>
    ${filtered ? html`<button class="linkbtn" data-action="clear-card-filters">Clear filters</button>` : ''}</div>
    ${protectedCount ? html`<p class="small muted">Archived and optional cards are skipped when unpausing.</p>` : ''}</div>`;
}

/** Import fields for one source (step 3). File inputs sit inside a drop zone. */
export function importFields(source) {
  const drop = (accept, label) => html`<label class="fc-drop">${DROP_ART}<b data-file-name>${label}</b><span class="small muted">or</span><span class="btn btn--sm">Choose a file</span>
    <input class="fc-drop__input" name="file" type="file" accept="${accept}" required></label>`;
  if (source === 'quizlet') return html`<p class="small muted">In Quizlet, open your set and choose Export. Pick a tab between term and definition and a new line between cards, then paste the text here.</p>
    <label class="field"><span class="field__label">Exported text</span><textarea class="textarea" name="text" rows="8" required></textarea></label>
    <label class="field"><span class="field__label">Card front</span><select class="input" name="quizletFront"><option value="term">Term (definition on the back)</option><option value="definition">Definition (term on the back)</option></select></label>`;
  if (source === 'csv') return html`${drop('.csv,.txt,text/csv', 'Drop your CSV file here')}
    <details class="fc-more"><summary>Columns and separator</summary>
      <label class="field"><span class="field__label">Separator</span><select class="input" name="delimiter"><option value=",">Comma</option><option value="tab">Tab</option><option value=";">Semicolon</option></select></label>
      <p class="small muted">Column numbers start at 1.</p>
      <div class="fc-mapping"><label class="field"><span class="field__label">Front column</span><input class="input" type="number" name="front" min="1" value="1" required></label><label class="field"><span class="field__label">Back column</span><input class="input" type="number" name="back" min="1" value="2" required></label><label class="field"><span class="field__label">Tags column (optional)</span><input class="input" type="number" name="tags" min="1"></label><label class="field"><span class="field__label">Set column (optional)</span><input class="input" type="number" name="deckColumn" min="1"></label></div>
      <label class="fc-check"><input type="checkbox" name="header"> The first row is headings</label></details>`;
  return drop('.apkg', 'Drop your .apkg file here');
}

/** The Import page: three numbered steps and a Good to know card. */
export function importPage({ ownDecks, selected, source = 'anki', subjectFor }) {
  return html`<header class="page-head"><div class="page-head__text">${crumbs('Import cards')}
      <h1 class="page-head__title" tabindex="-1">Import cards</h1><p class="page-head__sub">bring in cards you already made somewhere else</p></div></header>
    <div class="fc-os">
      <div class="fc-os__main">
      <section class="card ruled tilt-3 fc-os__card"><i class="tape tape--l" aria-hidden="true"></i>
        <form data-import-form novalidate>
          <div class="fc-step"><span class="fc-step__n" aria-hidden="true">1</span><fieldset><legend class="fc-step__title">Where are the cards from?</legend>${wayTiles('source', source, IMPORT_WAYS, 'data-import-source')}</fieldset></div>
          <div class="fc-step"><span class="fc-step__n" aria-hidden="true">2</span><fieldset><legend class="fc-step__title">Which set should they go in?</legend>
            <div class="chips fc-pick">${ownDecks.map((deck) => {
              const subject = subjectFor(deck);
              return html`<label class="chip"><input class="sr-only" type="radio" name="deck" value="${deck.id}" ${checked(deck.id === selected)}>${subject ? html`<span class="dot" style="background:${subject.colour}" aria-hidden="true"></span>` : ''}${deck.title}</label>`;
            })}<button type="button" class="chip" data-action="import-new-set">${icon('plus', { size: 14 })} A new set</button></div></fieldset></div>
          <div class="fc-step"><span class="fc-step__n" aria-hidden="true">3</span><div><h3 class="fc-step__title" data-import-step3>${source === 'quizlet' ? 'Paste the cards' : 'Choose the file'}</h3>
            <div class="fc-import-fields" data-import-fields>${importFields(source)}</div>
            <p class="small muted fc-step__note">You’ll see the cards before anything is added.</p></div></div>
          <div class="fc-os__formfoot"><button type="button" class="btn" data-action="back-decks">Cancel</button><button class="btn btn--primary" type="submit">Preview cards</button></div>
        </form>
      </section>
      <div data-import-preview></div>
      </div>
      <aside class="fc-os__side"><section class="card ruled tilt-2 fc-os__card"><i class="tape tape--c" aria-hidden="true"></i><h2 class="card__title">Good to know</h2>
        <ul class="fc-tips"><li>Anki cards start fresh here. Your Anki review history isn’t brought over.</li><li>Pictures and sound in Anki cards come across.</li>
        <li>From Quizlet: open the set, choose Export and paste the text.</li><li>A CSV needs a front column and a back column.</li></ul>
        <p class="fc-hand fc-tips__foot">stuck halfway? <button class="linkbtn" data-action="cancel-import">cancel an unfinished import</button></p></section></aside>
    </div>`;
}
