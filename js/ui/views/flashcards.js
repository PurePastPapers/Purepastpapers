// Private flashcards. The data adapter keeps content and scheduling in the account backend.
import { $, html, on, raw, setHtml } from '../../core/dom.js';
import { confirmDialog, openModal, pageHead, toast } from '../ui.js';
import * as flashcards from '../../flashcards/api.js';
import { cloudAccountId } from '../../data/api.js';

const plural = (n, singular, pluralForm = `${singular}s`) => `${n} ${n === 1 ? singular : pluralForm}`;
const dateLabel = (value) => value ? new Date(value).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : '';
const tagList = (tags) => Array.isArray(tags) ? tags : [];
const safeAnkiUrl = (value) => {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && url.hostname === 'ankiweb.net' ? url.href : null;
  } catch { return null; }
};

// Flashcard HTML is untrusted. Remote URLs and embedded code are never loaded here.
// Media is resolved separately to account-scoped blob URLs by the adapter.
function cardMarkup(content, variant = '', revealed = true, previewMedia = null, previewUrls = null) {
  const template = document.createElement('template');
  template.innerHTML = String(content || '').replace(/\[sound:([^\]]+)\]/g, '<span data-audio="$1"></span>');
  const allowed = new Set(['P', 'BR', 'B', 'STRONG', 'I', 'EM', 'U', 'SUB', 'SUP', 'SPAN', 'DIV', 'UL', 'OL', 'LI', 'TABLE', 'THEAD', 'TBODY', 'TR', 'TH', 'TD', 'IMG', 'AUDIO', 'CODE', 'PRE', 'BLOCKQUOTE', 'HR']);
  const discard = new Set(['SCRIPT', 'STYLE', 'IFRAME', 'OBJECT', 'EMBED', 'LINK', 'META', 'TEMPLATE', 'SVG', 'MATH', 'FORM']);
  function walk(parent) {
    for (const node of [...parent.childNodes]) {
      if (node.nodeType === Node.COMMENT_NODE) { node.remove(); continue; }
      if (node.nodeType === Node.TEXT_NODE) {
        if (variant.startsWith('cloze:')) {
          const n = variant.slice(6);
          const text = node.textContent.replace(/\{\{c(\d+)::([\s\S]*?)(?:::(.*?))?\}\}/g, (_, index, answer, hint) => index === n && !revealed ? `[${hint || '…'}]` : answer);
          node.textContent = text;
        }
        continue;
      }
      if (node.nodeType !== Node.ELEMENT_NODE) continue;
      if (discard.has(node.tagName)) { node.remove(); continue; }
      walk(node);
      if (!allowed.has(node.tagName)) { node.replaceWith(...node.childNodes); continue; }
      const source = node.tagName === 'IMG' ? node.getAttribute('src') : null;
      const audio = node.getAttribute('data-audio');
      const previewName = node.getAttribute('data-flashcard-name');
      const alt = node.tagName === 'IMG' ? node.getAttribute('alt') : null;
      for (const attr of [...node.attributes]) node.removeAttribute(attr.name);
      // Media references are opaque identifiers, never remote or relative URLs.
      if (previewName && previewMedia?.has(previewName) && ['IMG', 'AUDIO'].includes(node.tagName)) {
        const url = URL.createObjectURL(previewMedia.get(previewName));
        previewUrls?.add(url);
        node.setAttribute('src', url);
        if (node.tagName === 'AUDIO') node.setAttribute('controls', '');
        else node.setAttribute('alt', alt || '');
      } else if (source && /^media:[a-zA-Z0-9_-]+$/.test(source)) {
        node.setAttribute('data-media', source.slice(6));
        node.setAttribute('alt', alt || '');
      } else if (node.tagName === 'IMG') {
        node.replaceWith(document.createTextNode('[Image unavailable]'));
      }
      if (audio && /^media:[a-zA-Z0-9_-]+$/.test(audio)) node.setAttribute('data-audio', audio.slice(6));
      else if (audio) node.textContent = '[Audio unavailable]';
    }
  }
  walk(template.content);
  return raw(template.innerHTML);
}

function faces(card, answerShown) {
  const reverse = card.variant === 'reverse';
  const front = reverse ? card.back : card.front;
  const back = reverse ? card.front : card.back;
  return html`<div class="flashcards__content">${cardMarkup(front, card.variant, false)}</div>
    ${answerShown ? html`<hr class="flashcards__divider"><div class="flashcards__content">${card.variant?.startsWith('cloze:') ? cardMarkup(card.front, card.variant, true) : cardMarkup(back, card.variant, true)}</div>${card.variant?.startsWith('cloze:') && card.back ? html`<div class="flashcards__extra">${cardMarkup(card.back)}</div>` : ''}` : ''}`;
}

async function resolveMedia(root, urls) {
  for (const image of root.querySelectorAll('img[data-media]')) {
    try { const url = await flashcards.readMedia(image.dataset.media); if (url && !image.isConnected) { if (url.startsWith('blob:')) URL.revokeObjectURL(url); } else if (url) { image.src = url; if (url.startsWith('blob:')) urls.add(url); } }
    catch { image.replaceWith(document.createTextNode('[Image unavailable]')); }
  }
  for (const target of root.querySelectorAll('[data-audio]')) {
    try { const url = await flashcards.readMedia(target.dataset.audio); if (url && !target.isConnected) { if (url.startsWith('blob:')) URL.revokeObjectURL(url); } else if (url) { const player = document.createElement('audio'); player.controls = true; player.src = url; target.replaceWith(player); if (url.startsWith('blob:')) urls.add(url); } }
    catch { target.textContent = '[Audio unavailable]'; }
  }
}

export async function mount(element, context) {
  context.setTitle('Flashcards');
  let decks = [];
  let catalogue = { entries: [], schoolEligible: false };
  let cards = [];
  let view = 'decks';
  let selectedDeck = null;
  let query = '';
  let subdeckPath = '';
  let page = 1;
  let queueTimer = null;
  let study = null;
  let exampleShown = false;
  let importState = null;
  let busy = false;
  let disposed = false;
  const mediaUrls = new Set();
  const closeMedia = () => { for (const url of mediaUrls) URL.revokeObjectURL(url); mediaUrls.clear(); };
  const cloudReady = () => typeof flashcards.hasCloudAccount === 'function' && flashcards.hasCloudAccount();
  const pendingKey = (deckId) => `ppp.flashcards.pending.${cloudAccountId()}.${deckId}`;
  const readPending = (deckId) => {
    try {
      const value = JSON.parse(sessionStorage.getItem(pendingKey(deckId)) || 'null');
      return value && typeof value.cardId === 'string' && Number.isInteger(value.revision) && [1, 2, 3, 4].includes(value.grade) && typeof value.requestId === 'string' ? value : null;
    } catch { return null; }
  };
  const writePending = (deckId, value) => {
    try { if (value) sessionStorage.setItem(pendingKey(deckId), JSON.stringify(value)); else sessionStorage.removeItem(pendingKey(deckId)); } catch { /* The in-memory retry still works. */ }
  };
  const activeDeck = () => decks.find((deck) => deck.id === selectedDeck);
  const refreshDecks = async () => { decks = await flashcards.listDecks(); };
  const refreshCards = async () => { cards = await flashcards.listCards(selectedDeck); };
  const presentError = (error) => toast(error?.message || 'Something went wrong. Please try again.', { type: 'error' });
  const task = async (fn) => {
    if (busy) return;
    busy = true;
    try { await fn(); } catch (error) { presentError(error); } finally { busy = false; }
  };

  function deckList() {
    const depthOf = (deck) => {
      let depth = 0; let parent = deck.parent_id; const seen = new Set([deck.id]);
      while (parent && depth < 8 && !seen.has(parent)) { seen.add(parent); const found = decks.find((item) => item.id === parent); if (!found) break; depth++; parent = found.parent_id; }
      return depth;
    };
    const children = (parent = null, seen = new Set()) => decks.filter((deck) => (deck.parent_id || null) === parent && !seen.has(deck.id)).flatMap((deck) => { const next = new Set(seen).add(deck.id); return [deck, ...children(deck.id, next)]; });
    const ordered = children();
    for (const deck of decks) if (!ordered.includes(deck)) ordered.push(deck);
    return html`${cloudReady() ? '' : html`<p class="banner banner--warn">Sign in with an account to create, import and sync private decks.</p>`}<div class="flashcards__toolbar"><div><h2>My decks</h2><p class="muted">Your decks and progress are private to your account.</p></div><div class="flashcards__actions"><button class="btn" data-action="import" ${cloudReady() ? '' : raw('disabled')}>Import</button><button class="btn btn--primary" data-action="create-deck" ${cloudReady() ? '' : raw('disabled')}>Create deck</button></div></div>
      ${decks.length ? html`<div class="flashcards__deck-grid">${ordered.map((deck) => html`<article class="card ruled flashcards__deck"><h3>${depthOf(deck) ? '↳ ' : ''}${deck.title}</h3>${deck.parent_id ? html`<p class="small muted">Inside ${decks.find((parent) => parent.id === deck.parent_id)?.title || 'another deck'}</p>` : ''}<p class="small muted">${plural(deck.card_count || 0, 'card')}</p><div class="flashcards__counts" aria-label="Study counts"><span><strong>${deck.new_count || 0}</strong> New</span><span><strong>${deck.learning_count || 0}</strong> Learning</span><span><strong>${deck.due_count || 0}</strong> Due</span></div><div class="flashcards__actions"><button class="btn btn--primary" data-action="study" data-id="${deck.id}">Study</button><button class="btn" data-action="open-deck" data-id="${deck.id}">Manage</button></div></article>`)}</div>` : html`<div class="card flashcards__empty"><h3>Start your first deck</h3><p>Make your own cards or bring cards from Anki, Quizlet or a CSV file.</p><div class="flashcards__actions"><button class="btn btn--primary" data-action="create-deck" ${cloudReady() ? '' : raw('disabled')}>Create deck</button><button class="btn" data-action="import" ${cloudReady() ? '' : raw('disabled')}>Import cards</button></div></div>`}`;
  }

  function deckPage() {
    const deck = activeDeck();
    if (!deck) return html`<p>Deck unavailable.</p>`;
    const readOnly = Boolean(deck.catalogue_id);
    const paths = new Set();
    for (const card of cards) {
      const parts = String(card.subdeck_path || '').split('::').filter(Boolean);
      for (let i = 1; i <= parts.length; i++) paths.add(parts.slice(0, i).join('::'));
    }
    const topics = [...paths].sort((a, b) => a.localeCompare(b));
    const matched = cards.filter((card) => (!subdeckPath || card.subdeck_path === subdeckPath || card.subdeck_path?.startsWith(`${subdeckPath}::`)) && `${card.front} ${card.back} ${tagList(card.tags).join(' ')}`.toLowerCase().includes(query.toLowerCase()));
    return html`<button class="linkbtn" data-action="back-decks">← My decks</button><div class="flashcards__toolbar"><div><h2>${deck.title}</h2><p class="muted">${plural(cards.length, 'card')} · ${deck.target_retention || 90}% target retention${readOnly ? ' · Official deck' : ''}</p></div><div class="flashcards__actions"><button class="btn btn--primary" data-action="study" data-id="${deck.id}">Study</button>${readOnly ? '' : html`<button class="btn" data-action="add-card">Add card</button>`}<button class="btn" data-action="settings">Deck settings</button></div></div>
      ${readOnly && topics.length ? html`<div class="flashcards__topic"><label class="field"><span class="field__label">Topic</span><select class="input" data-topic><option value="">All topics</option>${topics.map((path) => html`<option value="${path}" ${path === subdeckPath ? raw('selected') : ''}>${path.split('::').join(' › ')}</option>`)}</select></label><p class="small muted">Cards start suspended. Unsuspend the topics you are ready to study. Archived and optional cards stay suspended when you unsuspend a topic.</p><div class="flashcards__actions"><button class="btn btn--sm" data-action="topic-unsuspend">Unsuspend ${subdeckPath ? 'topic' : 'all topics'}</button><button class="btn btn--sm" data-action="topic-suspend">Suspend ${subdeckPath ? 'topic' : 'all topics'}</button></div></div>` : ''}
      <label class="field"><span class="field__label">Search cards and tags</span><input class="input" type="search" data-search value="${query}" placeholder="Search this deck"></label>
      <div class="flashcards__card-list">${matched.length ? matched.slice((page - 1) * 50, page * 50).map((card) => html`<article class="card flashcards__row"><div class="flashcards__row-content"><div class="flashcards__snippet">${cardMarkup(card.variant === 'reverse' ? card.back : card.front, card.variant, false)}</div><p class="small muted">${card.variant === 'reverse' ? 'Reverse' : card.variant?.startsWith('cloze:') ? 'Cloze' : 'Basic'}${card.suspended ? ' · Suspended' : ''}${card.subdeck_path ? ` · ${card.subdeck_path.split('::').join(' › ')}` : ''}${card.revision > 0 && card.due_at ? ` · ${card.state?.state || 'Scheduled'} · Due ${dateLabel(card.due_at)}` : ' · New'}${tagList(card.tags).length ? ` · ${tagList(card.tags).join(', ')}` : ''}</p></div><div class="flashcards__actions"><button class="btn btn--sm" data-action="preview-card" data-id="${card.id}">Preview</button>${readOnly || card.catalogue_card_id ? '' : html`<button class="btn btn--sm" data-action="edit-card" data-id="${card.id}">Edit</button><button class="btn btn--sm" data-action="move-card" data-id="${card.id}">Move</button>`}<button class="btn btn--sm" data-action="suspend-card" data-id="${card.id}">${card.suspended ? 'Unsuspend' : 'Suspend'}</button>${readOnly || card.catalogue_card_id ? '' : html`<button class="btn btn--sm" data-action="delete-card" data-id="${card.id}">Delete</button>`}</div></article>`) : html`<p class="muted">${query ? 'No cards match your search.' : 'No cards in this deck yet.'}</p>`}</div>${matched.length > 50 ? html`<div class="flashcards__pagination"><button class="btn btn--sm" data-action="prev-page" ${page <= 1 ? raw('disabled') : ''}>Previous</button><span>Page ${page} of ${Math.ceil(matched.length / 50)}</span><button class="btn btn--sm" data-action="next-page" ${page * 50 >= matched.length ? raw('disabled') : ''}>Next</button></div>` : ''}`;
  }

  function cataloguePage() {
    return html`<div class="flashcards__toolbar"><div><h2>PurePastPapers decks</h2><p class="muted">Spec-aligned cards made for your subjects.</p></div></div>
      <p class="banner banner--info">Verified Reach Free School students can use available PurePastPapers decks free during the pilot. ${catalogue.schoolEligible ? 'Your account is eligible.' : 'Personal decks remain available to every signed-in student.'}</p>
      <div class="flashcards__filters"><label class="field"><span class="field__label">Subject</span><select class="input" data-catalogue-subject><option value="">All subjects</option>${[...new Set(catalogue.entries.map((entry) => entry.subject).filter(Boolean))].map((subject) => html`<option>${subject}</option>`)}</select></label><label class="field"><span class="field__label">Qualification</span><select class="input" data-catalogue-level><option value="">All qualifications</option>${[...new Set(catalogue.entries.map((entry) => entry.qualification).filter(Boolean))].map((level) => html`<option>${level}</option>`)}</select></label></div>
      <div class="flashcards__deck-grid" data-catalogue-list>${catalogue.entries.length ? catalogue.entries.map((entry) => html`<article class="card flashcards__catalogue-card" data-subject="${entry.subject || ''}" data-level="${entry.qualification || ''}"><h3>${entry.title}</h3><p class="small muted">${[entry.qualification, entry.subject, entry.board, entry.deck_type].filter(Boolean).join(' · ')}</p><p>${entry.description || ''}</p>${entry.card_count ? html`<p class="small muted">${plural(entry.card_count, 'card')}</p>` : ''}${safeAnkiUrl(entry.sourceUrl) ? html`<p class="small muted">Download this deck from AnkiWeb and import it into My decks.</p><a class="btn" href="${safeAnkiUrl(entry.sourceUrl)}" target="_blank" rel="noopener noreferrer">On AnkiWeb</a>` : entry.available ? html`<button class="btn btn--primary" data-action="add-catalogue" data-id="${entry.id}" ${catalogue.schoolEligible ? '' : raw('disabled')}>${catalogue.schoolEligible ? 'Add deck' : 'School access required'}</button>` : html`<span class="tag">Coming soon</span>`}</article>`) : html`<p class="muted">PurePastPapers decks are coming soon.</p>`}</div>`;
  }

  function studyPage() {
    if (!study) return '';
    if (!study.card) return html`<section class="card flashcards__study"><h2>All caught up</h2><p>${study.nextDue ? `Next card due ${dateLabel(study.nextDue)}.` : 'There are no cards ready to study in this deck.'}</p><button class="btn" data-action="exit-study">Back to deck</button></section>`;
    return html`<div class="flashcards__study-top"><button class="linkbtn" data-action="exit-study">← Back to deck</button><span class="muted small">${study.deckTitle}${subdeckPath ? ` · ${subdeckPath.split('::').join(' › ')}` : ''}</span></div><section class="card ruled flashcards__study" aria-live="polite"><p class="small muted">${study.shown ? 'Answer' : 'Question'}</p>${faces(study.card, study.shown)}${study.pending ? html`<p class="banner banner--warn" role="status">Your rating is waiting to be saved. Retry when you are connected.</p>` : ''}<div class="flashcards__study-actions">${study.shown ? html`<p class="small muted">Again means you forgot. Hard means you remembered with difficulty.</p><div class="flashcards__grades">${[ ['Again', 1], ['Hard', 2], ['Good', 3], ['Easy', 4] ].map(([label, grade]) => html`<button class="btn ${grade === 3 ? 'btn--primary' : ''}" data-action="grade" data-grade="${grade}" ${study.pending && study.pending.grade !== grade ? raw('disabled') : ''}>${study.pending && study.pending.grade === grade ? `Retry ${label}` : label} <span>${grade}</span></button>`)}</div>` : html`<button class="btn btn--primary" data-action="show-answer">Show answer <span class="small">Space</span></button>`}</div></section>`;
  }

  function example() {
    return html`<details class="card flashcards__example"><summary>Try an example card</summary><p class="small muted">This example does not affect your decks or progress.</p><div class="flashcards__example-card"><p>What is the powerhouse of the cell?</p>${exampleShown ? html`<hr><p>The mitochondrion</p>` : ''}</div><button class="btn btn--sm" data-action="example">${exampleShown ? 'Hide answer' : 'Show answer'}</button></details>`;
  }

  function importPage() {
    return html`<button class="linkbtn" data-action="back-decks">← My decks</button><h2>Import cards</h2><p>Import cards into a private deck. Review the preview before saving.</p><form class="card flashcards__import" data-import-form><label class="field"><span class="field__label">Import into</span><select class="input" name="deck" required>${decks.filter((deck) => !deck.catalogue_id).map((deck) => html`<option value="${deck.id}" ${deck.id === selectedDeck ? raw('selected') : ''}>${deck.title}</option>`)}</select></label><label class="field"><span class="field__label">Source</span><select class="input" name="source" data-import-source><option value="anki">Anki package (.apkg)</option><option value="quizlet">Quizlet export text</option><option value="csv">CSV file</option></select></label><div data-import-fields><label class="field"><span class="field__label">Anki package</span><input class="input" name="file" type="file" accept=".apkg"></label><p class="small muted">Cards start fresh with FSRS. A package may contain existing scheduling information, which will not be imported.</p></div><button class="btn btn--primary" type="submit">Preview import</button><button class="btn" type="button" data-action="cancel-import">Cancel an unfinished import</button></form><div data-import-preview></div>`;
  }

  function draw() {
    if (disposed) return;
    clearTimeout(queueTimer);
    if (view === 'study' && study && !study.card && study.nextDue) {
      const delay = Math.max(1000, new Date(study.nextDue).getTime() - Date.now());
      if (Number.isFinite(delay) && delay <= 2147483647) queueTimer = setTimeout(() => task(() => beginStudy(selectedDeck)), delay);
    }
    closeMedia();
    setHtml(element, html`<div class="flashcards">${pageHead({ title: 'Flashcards', sub: 'Build knowledge one card at a time.', badge: html`<span class="tag">Beta</span>` })}<p class="banner banner--info">Flashcards are in beta. Your private decks sync with your account.</p>${view === 'study' ? studyPage() : view === 'import' ? importPage() : view === 'deck' ? deckPage() : html`<nav class="flashcards__tabs" aria-label="Flashcard decks"><button class="flashcards__tab ${view === 'decks' ? 'is-active' : ''}" data-action="back-decks" aria-current="${view === 'decks' ? 'page' : 'false'}">My decks</button><button class="flashcards__tab ${view === 'catalogue' ? 'is-active' : ''}" data-action="catalogue" aria-current="${view === 'catalogue' ? 'page' : 'false'}">PurePastPapers decks</button></nav>${view === 'catalogue' ? cataloguePage() : html`${deckList()}${example()}`}`}</div>`);
    resolveMedia(element, mediaUrls);
  }

  async function deckDialog(deck = null) {
    const result = await openModal({
      title: deck ? 'Deck settings' : 'Create a deck',
      body: html`<label class="field"><span class="field__label">Deck name</span><input class="input" name="title" maxlength="100" required value="${deck?.title || ''}" ${deck?.catalogue_id ? raw('readonly') : ''}></label>${!deck?.catalogue_id ? html`<label class="field"><span class="field__label">Inside another deck (optional)</span><select class="input" name="parent"><option value="">No parent deck</option>${decks.filter((item) => item.id !== deck?.id && !item.catalogue_id).map((item) => html`<option value="${item.id}" ${deck?.parent_id === item.id ? raw('selected') : ''}>${item.title}</option>`)}</select></label>` : ''}${deck ? html`<label class="field"><span class="field__label">Target retention</span><input class="input" name="retention" type="number" min="80" max="92" step="1" value="${deck.target_retention || 90}"><span class="field__hint">A higher target usually means more reviews. Changes apply to future reviews.</span></label><label class="field"><span class="field__label">New cards per day</span><input class="input" name="newLimit" type="number" min="0" max="999" step="1" value="${deck.new_limit ?? 20}"></label>` : ''}`,
      actions: [{ label: 'Cancel', cancel: true }, { label: deck ? 'Save changes' : 'Create deck', variant: 'primary', validate: (dialog) => {
        const title = dialog.querySelector('[name=title]').value.trim();
        const retention = Number(dialog.querySelector('[name=retention]')?.value || 90);
        const limit = Number(dialog.querySelector('[name=newLimit]')?.value ?? 20);
        return !title ? 'Enter a deck name.' : !Number.isInteger(retention) || retention < 80 || retention > 92 ? 'Choose a whole percentage from 80 to 92.' : !Number.isInteger(limit) || limit < 0 || limit > 999 ? 'Choose a daily limit from 0 to 999.' : null;
      }, collect: (dialog) => ({ title: dialog.querySelector('[name=title]').value.trim(), target_retention: Number(dialog.querySelector('[name=retention]')?.value || 90), new_limit: Number(dialog.querySelector('[name=newLimit]')?.value ?? 20), parent_id: dialog.querySelector('[name=parent]') ? dialog.querySelector('[name=parent]').value || null : undefined }) }],
    });
    if (!result) return;
    if (deck) await flashcards.updateDeck(deck.id, result);
    else await flashcards.createDeck(result);
    await refreshDecks(); draw();
  }

  async function cardDialog(card = null) {
    const result = await openModal({
      title: card ? 'Edit card' : 'Add a card',
      body: html`<label class="field"><span class="field__label">Card type</span><select class="input" name="type" ${card ? raw('disabled') : ''}><option value="basic" ${card?.type === 'basic' ? raw('selected') : ''}>Basic</option><option value="reverse" ${card?.type === 'reverse' ? raw('selected') : ''}>Basic and reverse</option><option value="cloze" ${card?.type === 'cloze' ? raw('selected') : ''}>Cloze deletion</option></select><span class="field__hint">For cloze, write {{c1::the answer}} in the front. Use c2, c3 and so on for separate cards.</span></label><label class="field"><span class="field__label">Front</span><textarea class="textarea" name="front" rows="5" required>${card?.front || ''}</textarea></label><label class="field"><span class="field__label">Back or extra information</span><textarea class="textarea" name="back" rows="5">${card?.back || ''}</textarea></label><label class="field"><span class="field__label">Tags</span><input class="input" name="tags" value="${tagList(card?.tags).join(', ')}"><span class="field__hint">Separate tags with commas.</span></label>${card ? html`<p class="small muted">Editing the note preserves its cards and their review history. The card type cannot be changed here.</p>` : ''}`,
      wide: true,
      actions: [{ label: 'Cancel', cancel: true }, { label: 'Save card', variant: 'primary', validate: (dialog) => {
        const front = dialog.querySelector('[name=front]').value.trim();
        const back = dialog.querySelector('[name=back]').value.trim();
        const type = dialog.querySelector('[name=type]').value;
        if (!front) return 'Enter the front of the card.';
        if (type === 'cloze' && !/\{\{c\d+::.+?\}\}/s.test(front)) return 'Add a cloze deletion such as {{c1::answer}} to the front.';
        if (type !== 'cloze' && !back) return 'Enter the back of the card.';
        return null;
      }, collect: (dialog) => ({ id: card?.note_id, deck_id: selectedDeck, type: dialog.querySelector('[name=type]').value, front: dialog.querySelector('[name=front]').value, back: dialog.querySelector('[name=back]').value, tags: dialog.querySelector('[name=tags]').value.split(',').map((tag) => tag.trim()).filter(Boolean) }) }],
    });
    if (!result) return;
    const saved = await flashcards.saveNote(result);
    if (saved?.status === 'confirm_remove') {
      const count = Number(saved.removed_cards) || 0;
      if (!await confirmDialog({ title: 'Remove cards?', message: `This edit removes ${plural(count, 'card')} from study. Their review logs are retained.`, confirmLabel: 'Save changes', danger: true })) return;
      await flashcards.saveNote({ ...result, confirm_remove: true });
    }
    await refreshCards(); await refreshDecks(); draw();
  }

  async function beginStudy(deckId) {
    selectedDeck = deckId;
    const saved = readPending(deckId);
    if (saved?.subdeckPath !== undefined) subdeckPath = saved.subdeckPath || '';
    const queue = await flashcards.getStudyQueue(deckId, { subdeckPath: subdeckPath || null });
    study = { card: queue.cards[0] || null, nextDue: queue.nextDue, deckTitle: activeDeck()?.title || 'Study', shown: false, pending: null };
    if (saved) {
      const original = (await flashcards.listCards(deckId)).find((card) => card.id === saved.cardId);
      if (original) {
        study.card = { ...original, revision: saved.revision };
        study.shown = true;
        study.pending = { card: study.card, grade: saved.grade, requestId: saved.requestId };
      } else writePending(deckId, null);
    }
    view = 'study'; draw();
  }

  async function saveGrade(grade) {
    if (!study?.card || !study.shown) return;
    if (!study.pending) {
      study.pending = { grade, requestId: crypto.randomUUID(), card: study.card };
      writePending(selectedDeck, { cardId: study.card.id, revision: study.card.revision, grade, requestId: study.pending.requestId, subdeckPath });
    }
    if (study.pending.grade !== grade) return;
    try {
      await flashcards.reviewCard(study.pending.card, study.pending.grade, study.pending.requestId);
    } catch (error) {
      if (error?.retryable) { draw(); presentError(error); return; }
      study.pending = null;
      writePending(selectedDeck, null);
      study.card = null;
      draw();
      try {
        const queue = await flashcards.getStudyQueue(selectedDeck, { subdeckPath: subdeckPath || null });
        study.card = queue.cards[0] || null;
        study.nextDue = queue.nextDue;
        study.shown = false;
        draw();
      } catch { /* The deck can be reopened when connectivity returns. */ }
      presentError(error);
      return;
    }
    study.pending = null;
    writePending(selectedDeck, null);
    study.card = null;
    study.nextDue = null;
    study.shown = false;
    draw();
    try {
      const queue = await flashcards.getStudyQueue(selectedDeck, { subdeckPath: subdeckPath || null });
      study.card = queue.cards[0] || null;
      study.nextDue = queue.nextDue;
      await refreshDecks();
      draw();
    } catch (error) {
      presentError(error);
    }
  }

  function importFields(source) {
    if (source === 'quizlet') return html`<p class="small muted">In Quizlet, open your set and choose Export. Choose a tab between term and definition, and a new line between cards, then paste the text below.</p><label class="field"><span class="field__label">Exported text</span><textarea class="textarea" name="text" rows="8" required></textarea></label><label class="field"><span class="field__label">Card front</span><select class="input" name="quizletFront"><option value="term">Term (definition on the back)</option><option value="definition">Definition (term on the back)</option></select></label>`;
    if (source === 'csv') return html`<label class="field"><span class="field__label">CSV file</span><input class="input" name="file" type="file" accept=".csv,.txt,text/csv" required></label><label class="field"><span class="field__label">Delimiter</span><select class="input" name="delimiter"><option value=",">Comma</option><option value="tab">Tab</option><option value=";">Semicolon</option></select></label><p class="small muted">Choose the column numbers from your file, starting at 1.</p><div class="flashcards__mapping"><label class="field"><span class="field__label">Front column</span><input class="input" type="number" name="front" min="1" value="1" required></label><label class="field"><span class="field__label">Back column</span><input class="input" type="number" name="back" min="1" value="2" required></label><label class="field"><span class="field__label">Tags column (optional)</span><input class="input" type="number" name="tags" min="1"></label><label class="field"><span class="field__label">Deck column (optional)</span><input class="input" type="number" name="deckColumn" min="1"></label></div><label><input type="checkbox" name="header"> First row contains headers</label>`;
    return html`<label class="field"><span class="field__label">Anki package</span><input class="input" name="file" type="file" accept=".apkg" required></label><p class="small muted">Cards start fresh with FSRS. Existing Anki study progress is not imported.</p>`;
  }

  async function previewImport(form) {
    const source = form.elements.source.value;
    const deckId = form.elements.deck.value;
    const preview = $('[data-import-preview]', element);
    if (!deckId) throw new Error('Create a deck before importing.');
    setHtml(preview, html`<p role="status">Reading your cards…</p>`);
    const parser = await import('../../flashcards/import.js');
    let parsed;
    if (source === 'anki') {
      if (!form.elements.file.files[0]) throw new Error('Choose an Anki package.');
      parsed = await parser.parseAnkiPackage(form.elements.file.files[0], { onProgress: ({ loaded, total }) => { preview.textContent = `Reading package · ${(loaded / 1048576).toFixed(1)} MB of ${(total / 1048576).toFixed(1)} MB`; } });
    } else if (source === 'quizlet') {
      parsed = parser.parseQuizlet(form.elements.text.value, { front: form.elements.quizletFront?.value || 'term' });
    } else {
      if (!form.elements.file.files[0]) throw new Error('Choose a CSV file.');
      const column = (name) => form.elements[name].value ? Number(form.elements[name].value) - 1 : undefined;
      parsed = parser.parseCsv(await form.elements.file.files[0].text(), { front: column('front'), back: column('back'), tags: column('tags'), deck: column('deckColumn'), delimiter: form.elements.delimiter.value === 'tab' ? '\t' : form.elements.delimiter.value, header: form.elements.header.checked });
    }
    const info = await flashcards.previewImport(deckId, parsed);
    importState = { deckId, parsed };
    const accepted = info.accepted ?? parsed.notes.reduce((total, note) => total + note.cards.length, 0);
    const firstCards = parsed.notes.flatMap((note) => note.cards.map((card) => ({ front: card.front ?? note.front, back: card.back ?? note.back }))).slice(0, 3);
    setHtml(preview, html`<section class="card flashcards__preview"><h3>Import preview</h3><p>Target deck: <strong>${decks.find((deck) => deck.id === deckId)?.title || 'Selected deck'}</strong></p><p>${plural(accepted, 'card')} ready · ${plural(info.duplicates || 0, 'duplicate')} skipped · ${plural(parsed.errors?.length || 0, 'invalid row')}</p>${parsed.decks?.length ? html`<p class="small muted">Source decks: ${parsed.decks.map((deck) => typeof deck === 'string' ? deck : deck.name).join(', ')}</p>` : ''}${source === 'anki' ? html`<p class="small muted">${parsed.scheduling ? 'This package contains scheduling information. ' : ''}Cards will start a fresh FSRS schedule. Suspended cards stay suspended.</p>` : ''}${parsed.warnings?.length ? html`<ul>${parsed.warnings.map((warning) => html`<li>${warning}</li>`)}</ul>` : ''}${parsed.errors?.length ? html`<details><summary>Invalid rows</summary><ul>${parsed.errors.slice(0, 100).map((error) => html`<li>Row ${error.row}: ${error.reason}</li>`)}</ul></details>` : ''}<div class="flashcards__preview-cards">${firstCards.map((note) => html`<article class="flashcards__example-card"><div>${cardMarkup(note.front, '', true, parsed.media, mediaUrls)}</div><hr><div>${cardMarkup(note.back, '', true, parsed.media, mediaUrls)}</div></article>`)}</div>${source === 'quizlet' || source === 'csv' ? html`<p class="small muted">Front shows ${source === 'quizlet' ? (parsed.front === 'definition' ? 'the definition' : 'the term') : `column ${form.elements.front.value}`}. <button type="button" class="btn btn--sm" data-action="swap-import-sides">Swap front and back</button></p>` : ''}<p class="small muted">Existing matching cards are skipped to protect their progress.</p><button class="btn btn--primary" data-action="commit-import" ${accepted ? '' : raw('disabled')}>Import cards</button><p role="status" data-import-progress></p></section>`);
    resolveMedia(preview, mediaUrls);
  }

  const offClick = on(element, 'click', '[data-action]', (event, button) => task(async () => {
    const action = button.dataset.action;
    const id = button.dataset.id;
    const card = cards.find((item) => item.id === id);
    if (action === 'back-decks') { view = 'decks'; query = ''; await refreshDecks(); draw(); }
    else if (action === 'catalogue') { catalogue = await flashcards.listCatalogue(); view = 'catalogue'; draw(); }
    else if (action === 'create-deck') await deckDialog();
    else if (action === 'settings') {
      const choice = await openModal({ title: activeDeck().title, body: html`<p>Change this deck’s study settings${activeDeck().catalogue_id ? '.' : ', rename it, or remove it and its cards from study.'}</p>`, actions: [{ label: 'Cancel', cancel: true }, { label: 'Edit settings', value: 'edit', variant: 'primary' }, ...(!activeDeck().catalogue_id ? [{ label: 'Delete deck', value: 'delete', variant: 'danger' }] : [])] });
      if (choice === 'edit') await deckDialog(activeDeck());
      if (choice === 'delete') {
        const deck = activeDeck();
        if (await confirmDialog({ title: 'Delete deck?', message: `Remove “${deck.title}” and its ${plural(deck.card_count || cards.length, 'card')} from study? ${decks.some((item) => item.parent_id === deck.id) ? 'Its subdecks will move to the next level. ' : ''}Their review logs are retained.`, confirmLabel: 'Delete deck', danger: true })) { await flashcards.deleteDeck(deck.id); selectedDeck = null; view = 'decks'; await refreshDecks(); draw(); }
      }
    }
    else if (action === 'prev-page') { page = Math.max(1, page - 1); draw(); }
    else if (action === 'next-page') { page++; draw(); }
    else if (action === 'open-deck') { selectedDeck = id; view = 'deck'; query = ''; subdeckPath = ''; page = 1; await refreshCards(); draw(); }
    else if (action === 'add-card') await cardDialog();
    else if (action === 'edit-card' && card) await cardDialog(card);
    else if (action === 'preview-card' && card) { await openModal({ title: 'Card preview', body: html`<div class="flashcards__preview-card">${faces(card, true)}</div>`, onOpen: (dialog) => resolveMedia(dialog, mediaUrls) }); }
    else if (action === 'move-card' && card) {
      const target = await openModal({ title: 'Move card', body: html`<label class="field"><span class="field__label">Move to deck</span><select class="input" name="deck">${decks.filter((deck) => deck.id !== selectedDeck && !deck.catalogue_id).map((deck) => html`<option value="${deck.id}">${deck.title}</option>`)}</select></label><p class="small muted">The card keeps its review history and due date.</p>`, actions: [{ label: 'Cancel', cancel: true }, { label: 'Move card', variant: 'primary', validate: (dialog) => dialog.querySelector('[name=deck]').value ? null : 'Create another deck first.', collect: (dialog) => dialog.querySelector('[name=deck]').value }] });
      if (target) { await flashcards.updateCard(id, { deck_id: target }); await refreshCards(); await refreshDecks(); draw(); }
    }
    else if (action === 'suspend-card' && card) { await flashcards.updateCard(id, { suspended: !card.suspended }); await refreshCards(); await refreshDecks(); draw(); }
    else if (action === 'delete-card' && card) {
      if (await confirmDialog({ title: 'Delete card?', message: `Remove this card from study in “${activeDeck().title}”? Its review logs are retained.`, confirmLabel: 'Delete card', danger: true })) { await flashcards.deleteCard(id); await refreshCards(); await refreshDecks(); draw(); }
    }
    else if (action === 'study') { if (view !== 'deck' || selectedDeck !== id) subdeckPath = ''; await beginStudy(id); }
    else if (action === 'topic-unsuspend' || action === 'topic-suspend') {
      const suspended = action === 'topic-suspend';
      const topicName = subdeckPath ? subdeckPath.split('::').join(' › ') : 'all topics';
      const confirmed = await confirmDialog({ title: suspended ? 'Suspend cards?' : 'Unsuspend cards?', message: `${suspended ? 'Suspend' : 'Unsuspend'} cards in ${topicName}? ${suspended ? 'They will leave your study queue.' : 'Archived and optional cards stay suspended.'}`, confirmLabel: suspended ? 'Suspend' : 'Unsuspend' });
      if (confirmed) {
        const result = await flashcards.setTopicSuspension(selectedDeck, subdeckPath || null, suspended);
        await refreshCards(); await refreshDecks(); draw();
        toast(`${plural(result?.changed || 0, 'card')} ${suspended ? 'suspended' : 'unsuspended'}.${result?.excluded ? ` ${plural(result.excluded, 'archived or optional card')} left unchanged.` : ''}`, { type: 'success' });
      }
    }
    else if (action === 'show-answer' && study?.card) { study.shown = true; draw(); }
    else if (action === 'grade') await saveGrade(Number(button.dataset.grade));
    else if (action === 'exit-study') { study = null; view = 'deck'; await refreshCards(); await refreshDecks(); draw(); }
    else if (action === 'example') { exampleShown = !exampleShown; const details = button.closest('details'); const wasOpen = details?.open; draw(); if (wasOpen) $('details.flashcards__example', element).open = true; }
    else if (action === 'add-catalogue') { await flashcards.addCatalogueDeck(id); await refreshDecks(); toast('Deck added to My decks.', { type: 'success' }); view = 'decks'; draw(); }
    else if (action === 'import') { if (!decks.length) { toast('Create a deck first, then import your cards.'); return; } view = 'import'; importState = null; draw(); }
    else if (action === 'cancel-import') {
      if (await confirmDialog({ title: 'Cancel unfinished import?', message: 'Remove the staged cards and media from your unfinished import?', confirmLabel: 'Cancel import', danger: true })) { await flashcards.cancelImport(); importState = null; setHtml($('[data-import-preview]', element), ''); toast('Unfinished import cancelled.', { type: 'success' }); }
    }
    else if (action === 'swap-import-sides') {
      const form = $('[data-import-form]', element);
      if (form.elements.quizletFront) form.elements.quizletFront.value = form.elements.quizletFront.value === 'definition' ? 'term' : 'definition';
      else if (form.elements.front && form.elements.back) [form.elements.front.value, form.elements.back.value] = [form.elements.back.value, form.elements.front.value];
      await previewImport(form);
    }
    else if (action === 'commit-import' && importState) {
      const progress = $('[data-import-progress]', element);
      button.disabled = true;
      const importForm = $('[data-import-form]', element);
      importForm.inert = true;
      try {
        const result = await flashcards.commitImport(importState.deckId, importState.parsed, { onProgress: (value) => { progress.textContent = typeof value === 'string' ? value : `Importing ${value.done || 0} of ${value.total || 0} cards…`; } });
        importState = null;
        // Refresh first so the completion message appears only once the view is idle again.
        await refreshDecks().catch(() => {});
        progress.textContent = `Imported ${plural(result?.imported || 0, 'card')}. ${plural(result?.duplicates || 0, 'duplicate')} skipped.`;
      } catch (error) { progress.textContent = 'The import could not finish. You can retry.'; button.disabled = false; throw error; } finally { importForm.inert = false; }
    }
  }));
  const offChange = on(element, 'change', '[data-import-source], [data-catalogue-subject], [data-catalogue-level], [data-topic]', (event, control) => {
    if (control.matches('[data-import-source]')) { setHtml($('[data-import-fields]', element), importFields(control.value)); setHtml($('[data-import-preview]', element), ''); importState = null; }
    else if (control.matches('[data-topic]')) { subdeckPath = control.value; page = 1; draw(); }
    else {
      const subject = $('[data-catalogue-subject]', element).value;
      const level = $('[data-catalogue-level]', element).value;
      for (const item of element.querySelectorAll('[data-catalogue-list] [data-subject]')) item.hidden = Boolean((subject && item.dataset.subject !== subject) || (level && item.dataset.level !== level));
    }
  });
  const offInput = on(element, 'input', '[data-search]', (event, control) => {
    query = control.value;
    page = 1;
    const start = control.selectionStart;
    draw();
    const replacement = $('[data-search]', element);
    replacement.focus();
    try { replacement.setSelectionRange(start, start); } catch { /* Selection support varies by browser. */ }
  });
  const clearImportPreview = () => {
    if (!importState) return;
    importState = null;
    setHtml($('[data-import-preview]', element), '');
  };
  const offImportInput = on(element, 'input', '[data-import-form] input, [data-import-form] textarea, [data-import-form] select', clearImportPreview);
  const offImportChange = on(element, 'change', '[data-import-form] input, [data-import-form] textarea, [data-import-form] select', clearImportPreview);
  const offSubmit = on(element, 'submit', '[data-import-form]', (event, form) => { event.preventDefault(); task(() => previewImport(form)); });
  const onKey = (event) => {
    if (view !== 'study' || !study?.card || event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement || event.target instanceof HTMLSelectElement || event.repeat) return;
    if (!study.shown && event.code === 'Space') { event.preventDefault(); study.shown = true; draw(); }
    else if (study.shown && ['1', '2', '3', '4'].includes(event.key)) { event.preventDefault(); task(() => saveGrade(Number(event.key))); }
  };
  document.addEventListener('keydown', onKey);
  try { await refreshDecks(); } catch (error) { presentError(error); }
  draw();
  return () => { disposed = true; clearTimeout(queueTimer); closeMedia(); offClick(); offChange(); offInput(); offImportInput(); offImportChange(); offSubmit(); document.removeEventListener('keydown', onKey); };
}
