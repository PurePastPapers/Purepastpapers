// Private flashcards. The data adapter keeps content and scheduling in the account backend.
import { $, html, on, raw, setHtml } from '../../core/dom.js';
import { confirmDialog, openModal, toast } from '../ui.js';
import * as flashcards from '../../flashcards/api.js?v=flashcards-sets-1';
import { icon } from '../icons.js';
import { cloudAccountId, getProgress, learnedSet, setPreference } from '../../data/api.js';
import { ensureSpec, getSubject, specIndex } from '../../data/content-repository.js';
import { subjectColour } from '../subject-colours.js';
import { catalogueScreen, homePage, setPage } from './flashcards-pages.js?v=flashcards-sets-3';
import {
  cardsPerPoint, countInPlay, createTagMapper, describeSets, generalCount, inPlay, requestSignature, selectionRequest,
} from '../../flashcards/spec-map.js';

const plural = (n, singular, pluralForm = `${singular}s`) => `${n} ${n === 1 ? singular : pluralForm}`;
const dateLabel = (value) => value ? new Date(value).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : '';
const tagList = (tags) => Array.isArray(tags) ? tags : [];
const specOrder = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });
const specLabel = (tag) => tag.replace(/^(?:PPP::)?Spec::/i, '')
  .replace(/^AQA_(?:PSYCH|SOC)_/, '').replaceAll('::', ' ').replaceAll('_', ' ');
const safeAnkiUrl = (value) => {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && url.hostname === 'ankiweb.net' ? url.href : null;
  } catch { return null; }
};

function newReviewRequestId() {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

// Flashcard HTML is untrusted. Remote URLs and embedded code are never loaded here.
// Media is resolved separately to account-scoped blob URLs by the adapter.
function cardMarkup(content, variant = '', revealed = true, { previewMedia = null, previewUrls = null, showMedia = true } = {}) {
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
      } else if (!showMedia && node.tagName === 'IMG') {
        node.replaceWith(document.createTextNode('[Image]'));
      } else if (source && /^media:[a-zA-Z0-9_-]+$/.test(source)) {
        node.setAttribute('data-media', source.slice(6));
        node.setAttribute('alt', alt || '');
      } else if (node.tagName === 'IMG') {
        node.replaceWith(document.createTextNode('[Image unavailable]'));
      }
      if (!showMedia && audio) node.replaceWith(document.createTextNode('[Audio]'));
      else if (audio && /^media:[a-zA-Z0-9_-]+$/.test(audio)) node.setAttribute('data-audio', audio.slice(6));
      else if (audio) node.textContent = '[Audio unavailable]';
    }
  }
  walk(template.content);
  return raw(template.innerHTML);
}

function questionFace(card) {
  const front = card.variant === 'reverse' ? card.back : card.front;
  return cardMarkup(front, card.variant, false);
}

function answerContent(card) {
  const back = card.variant === 'reverse' ? card.front : card.back;
  return card.variant?.startsWith('cloze:') ? cardMarkup(card.front, card.variant, true) : cardMarkup(back, card.variant, true);
}

function answerExtra(card) {
  return card.variant?.startsWith('cloze:') && card.back ? html`<div class="flashcards__extra">${cardMarkup(card.back)}</div>` : '';
}

function faces(card, answerShown) {
  return html`<div class="flashcards__content">${questionFace(card)}</div>
    ${answerShown ? html`<hr class="flashcards__divider"><div class="flashcards__content">${answerContent(card)}</div>${answerExtra(card)}` : ''}`;
}

export function mount(element, context) {
  context.setTitle('Flashcards');
  let decks = [];
  let catalogue = { entries: [], schoolEligible: false };
  let cards = [];
  let view = 'decks';
  let selectedDeck = null;
  let query = '';
  let subdeckPath = '';
  let specPoint = '';
  let cardStatus = 'all';
  let availability = 'all';
  let cardSort = 'oldest';
  let page = 1;
  const pageSize = 24;
  let totalCards = 0;
  let matchingActive = 0;
  let matchingUnsuspendable = 0;
  let matchingProtected = 0;
  let topics = [];
  let specPoints = [];
  let decksStatus = 'loading';
  let catalogueStatus = 'idle';
  let managerStatus = 'idle';
  let topicsStatus = 'idle';
  let specPointsStatus = 'idle';
  let decksRequest = null;
  let deckCountsDirty = true;
  let managerRequest = 0;
  let topicsRequest = 0;
  let specPointsRequest = 0;
  let studyRequest = 0;
  let searchTimer;
  let addingCatalogue = null;
  let queueTimer = null;
  let study = null;
  const activeReviews = new Map();
  let importState = null;
  let importPreviewRequest = null;
  let busy = false;
  let disposed = false;
  const mediaUrls = new Set();
  const mountOwner = cloudAccountId();
  const mediaCache = new Map();
  // Subject tabs and "which cards" choices for PurePastPapers sets.
  let homeTab = sessionStorage.getItem('ppp.flashcards.tab') || 'all';
  let subjects = [];
  let subjectsStatus = 'loading';
  const specSets = new Map(); // deck id → described spec-tag groups
  const specSetRequests = new Map();
  const mappers = new Map(); // subject id → tag mapper
  const openTopics = new Set();
  let applyStatus = '';
  let applyTimer = null;
  let sampleCards = null;
  let sampleDeck = null;

  const displayedMedia = new Map();
  function releaseDetachedMedia() {
    for (const [node, url] of displayedMedia) {
      if (node.isConnected && !disposed) continue;
      URL.revokeObjectURL(url);
      displayedMedia.delete(node);
    }
  }

  function resolveMedia(root, catalogueMedia = false, limit = Infinity) {
    releaseDetachedMedia();
    for (const target of [...root.querySelectorAll('img[data-media], [data-audio]')].slice(0, limit)) {
      const id = target.dataset.media || target.dataset.audio;
      const key = `${catalogueMedia}:${id}`;
      let request = mediaCache.get(key);
      if (!request) {
        request = flashcards.readMedia(id, { catalogue: catalogueMedia, asBlob: true });
        mediaCache.set(key, request);
        if (mediaCache.size > 16) {
          const oldest = mediaCache.keys().next().value;
          mediaCache.delete(oldest);
        }
        request.catch(() => { if (mediaCache.get(key) === request) mediaCache.delete(key); });
      }
      request.then((blob) => {
        if (disposed || mountOwner !== cloudAccountId() || !target.isConnected) return;
        const url = URL.createObjectURL(blob);
        if (target.dataset.media) {
          displayedMedia.set(target, url);
          target.src = url;
        } else {
          const player = document.createElement('audio');
          displayedMedia.set(player, url);
          player.controls = true;
          player.src = url;
          target.replaceWith(player);
        }
      }).catch(() => {
        if (target.isConnected) target.replaceWith(document.createTextNode(target.dataset.media ? '[Image unavailable]' : '[Audio unavailable]'));
      });
    }
  }
  const cloudReady = () => typeof flashcards.hasCloudAccount === 'function' && flashcards.hasCloudAccount();
  const pendingKey = (deckId) => `ppp.flashcards.pending.${mountOwner}.${deckId}`;
  const readPending = (deckId) => {
    try {
      const value = JSON.parse(sessionStorage.getItem(pendingKey(deckId)) || 'null');
      return value && typeof value.cardId === 'string' && Number.isInteger(value.revision) && [1, 2, 3, 4].includes(value.grade) && typeof value.requestId === 'string' ? value : null;
    } catch { return null; }
  };
  const writePending = (deckId, value) => {
    try { if (value) sessionStorage.setItem(pendingKey(deckId), JSON.stringify(value)); else sessionStorage.removeItem(pendingKey(deckId)); } catch { /* The in-memory retry still works. */ }
  };
  const clearPending = (deckId, requestId) => {
    if (readPending(deckId)?.requestId === requestId) writePending(deckId, null);
  };
  const activeDeck = () => decks.find((deck) => deck.id === selectedDeck);

  // ── subjects, PurePastPapers sets and "which cards" ──
  const preferences = () => { try { return getProgress().preferences || {}; } catch { return {}; } };
  const entryFor = (deck) => catalogue.entries.find((entry) => entry.id === deck?.catalogue_id) || null;
  const subjectById = (id) => subjects.find((subject) => subject.id === id) || null;
  function subjectFor(deck) {
    if (!deck) return null;
    if (deck.catalogue_id) return subjectById(entryFor(deck)?.subject_id);
    return subjectById(preferences().flashcardDeckSubjects?.[deck.id]);
  }
  const deckSubjectId = (deck) => deck?.catalogue_id ? entryFor(deck)?.subject_id || null : preferences().flashcardDeckSubjects?.[deck?.id] || null;
  function choiceFor(deck) {
    const saved = preferences().flashcardChoices?.[deck?.catalogue_id];
    const mode = ['learnt', 'all', 'choose'].includes(saved?.mode) ? saved.mode : 'learnt';
    return { mode, general: saved?.general !== false, points: Array.isArray(saved?.points) ? saved.points : [] };
  }
  async function saveChoice(deck, choice) {
    const all = { ...(preferences().flashcardChoices || {}) };
    all[deck.catalogue_id] = { mode: choice.mode, general: choice.general, ...(choice.mode === 'choose' ? { points: choice.points } : {}) };
    await setPreference('flashcardChoices', all);
  }
  function pickerFor(choice) {
    if (choice.mode === 'all') return () => true;
    if (choice.mode === 'choose') { const chosen = new Set(choice.points); return (id) => chosen.has(id); }
    let learned;
    try { learned = learnedSet(); } catch { learned = new Set(); }
    return (id) => learned.has(id);
  }
  function mapperFor(subjectId) {
    if (!subjectId || !specIndex.hasSubject(subjectId)) return null;
    if (!mappers.has(subjectId)) mappers.set(subjectId, createTagMapper(subjectId, specIndex));
    return mappers.get(subjectId);
  }

  async function loadSubjects() {
    try {
      const ids = getProgress().enrolled_subjects || [];
      const loaded = await Promise.all(ids.map(async (id) => {
        const subject = await getSubject(id);
        if (!subject) return null;
        await ensureSpec(id).catch(() => null);
        return {
          id, name: `${subject.level === 'GCSE' ? 'GCSE ' : ''}${subject.subject}`, board: subject.board, code: subject.spec_code,
          colour: subjectColour(subject), subject,
        };
      }));
      subjects = loaded.filter(Boolean);
    } catch { subjects = []; }
    subjectsStatus = 'ready';
    if (homeTab !== 'all' && !subjectById(homeTab)) homeTab = 'all';
  }

  /** The spec-tag groups of a PurePastPapers set, loaded once per visit. */
  function loadSpecSets(deck) {
    if (specSets.has(deck.id)) return Promise.resolve(specSets.get(deck.id));
    if (!specSetRequests.has(deck.id)) {
      const request = (async () => {
        const subjectId = deckSubjectId(deck);
        if (subjectId) await ensureSpec(subjectId).catch(() => null);
        const mapper = mapperFor(subjectId) || (() => []);
        const sets = describeSets(await flashcards.listDeckSpecSets(deck.id), mapper);
        specSets.set(deck.id, sets);
        return sets;
      })().finally(() => specSetRequests.delete(deck.id));
      specSetRequests.set(deck.id, request);
    }
    return specSetRequests.get(deck.id);
  }

  /** Cards in play for a PurePastPapers set under its saved choice (null while loading). */
  function inPlayFor(deck, choice = choiceFor(deck)) {
    const sets = specSets.get(deck.id);
    if (!sets) return null;
    const picked = pickerFor(choice);
    const total = sets.reduce((sum, set) => sum + set.cards, 0);
    const learnt = pickerFor({ mode: 'learnt' });
    const result = {
      choice, total, general: generalCount(sets), inPlay: countInPlay(sets, choice, picked),
      counts: {
        learnt: countInPlay(sets, { mode: 'learnt', general: choice.general }, learnt),
        all: total,
        choose: countInPlay(sets, { mode: 'choose', general: choice.general }, pickerFor({ ...choice, mode: 'choose' })),
      },
      topics: [],
    };
    if (view === 'set' && deck.id === selectedDeck) {
      const perPoint = cardsPerPoint(sets);
      const subjectId = deckSubjectId(deck);
      const leaves = specIndex.subjectLeaves(subjectId);
      const groups = new Map();
      const bigSubject = new Set(leaves.map((id) => specIndex.topicOf(id)?.id)).size > 30;
      for (const id of leaves) {
        if (!perPoint.has(id)) continue;
        const point = specIndex.get(id);
        let topic = specIndex.topicOf(id) || point;
        if (bigSubject && topic.parent) topic = specIndex.get(topic.parent) || topic;
        if (!groups.has(topic.id)) {
          groups.set(topic.id, { id: topic.id, title: /^\d+$/.test(topic.code || '') ? `Topic ${topic.code}: ${topic.title.replace(/^Topic \d+:\s*/, '')}` : (topic.code && !/^Topic/.test(topic.title) && /^Topic/.test(topic.code) ? `${topic.code}: ${topic.title}` : topic.title), points: [] });
        }
        groups.get(topic.id).points.push({ id, code: point.code || '', title: point.title, cards: perPoint.get(id), on: picked(id) });
      }
      result.topics = [...groups.values()];
    }
    return result;
  }

  /** Make the database match a set's choice. Skips when nothing changed. */
  async function syncSelection(deck, { force = false } = {}) {
    const sets = await loadSpecSets(deck);
    const choice = choiceFor(deck);
    const mapper = mapperFor(deckSubjectId(deck)) || (() => []);
    const request = selectionRequest(sets, mapper, choice, pickerFor(choice));
    const key = `ppp.flashcards.applied.${mountOwner}.${deck.id}`;
    const signature = requestSignature(request);
    const expected = countInPlay(sets, choice, pickerFor(choice));
    const active = sets.reduce((sum, set) => sum + set.active, 0);
    let stored = null;
    try { stored = localStorage.getItem(key); } catch { /* private mode */ }
    if (!force && stored === signature && active === expected) return false;
    const result = await flashcards.applySpecSelection(deck.id, request);
    try { localStorage.setItem(key, signature); } catch { /* private mode */ }
    for (const set of sets) set.active = inPlay(set, choice, pickerFor(choice)) ? set.cards : 0;
    deckCountsDirty = true;
    return Boolean(result?.changed);
  }

  /** After decks load: keep every PurePastPapers set in step with what has been learnt. */
  let syncing = null;
  function syncAllSelections() {
    if (syncing || !cloudReady()) return syncing;
    syncing = (async () => {
      let changed = false;
      for (const deck of decks.filter((item) => item.catalogue_id)) {
        try { changed = (await syncSelection(deck)) || changed; } catch { /* the set still opens; it retries next visit */ }
        if (disposed) return;
      }
      if (changed) { await refreshDecks().catch(() => {}); }
      if (!disposed && ['decks', 'catalogue', 'set'].includes(view)) draw();
    })().finally(() => { syncing = null; });
    return syncing;
  }

  function pagesModel() {
    return {
      tab: homeTab, subjects, decks, catalogue, cloud: cloudReady(), adding: addingCatalogue, openTopics, applyStatus,
      subjectFor, entryFor, choiceFor, inPlayFor, safeUrl: safeAnkiUrl,
      hasSets: (id) => id === 'all' || decks.some((deck) => subjectFor(deck)?.id === id) || catalogue.entries.some((entry) => entry.subject_id === id),
      topicSummary: (subjectId) => {
        const learned = learnedSet();
        return specIndex.subjectNodes(subjectId).filter((node) => node.type === 'topic' && node.leaves.length).map((node) => {
          const done = node.leaves.filter((id) => learned.has(id)).length;
          return { id: node.id, title: node.title.replace(/^Topic \d+:\s*/, ''), state: done === node.leaves.length ? 'all' : done ? 'part' : 'none' };
        });
      },
      samples: () => {
        if (sampleDeck !== selectedDeck || !sampleCards) return html`<p class="small muted" role="status">Loading cards…</p>`;
        if (!sampleCards.length) return html`<p class="small muted">No cards are in play yet. Tick spec points you’ve learnt, or choose Everything.</p>`;
        return html`${sampleCards.map((card) => html`<article class="card fc-sample"><div class="flashcards__snippet">${cardMarkup(card.variant === 'reverse' ? card.back : card.front, card.variant, false, { showMedia: false })}</div>
          <div class="fc-sample__tags">${tagList(card.tags).filter((tag) => /^(?:PPP::)?Spec::/i.test(tag)).slice(0, 2).map((tag) => html`<span class="tag">Spec ${specLabel(tag)}</span>`)}</div></article>`)}`;
      },
    };
  }

  async function loadSamples(deck) {
    sampleDeck = deck.id;
    sampleCards = null;
    try {
      const result = await flashcards.listCardPage(deck.id, { pageSize: 4, availability: 'active', sort: 'new-first' });
      if (disposed || selectedDeck !== deck.id) return;
      sampleCards = result.cards || [];
    } catch { sampleCards = []; }
    const target = $('[data-set-samples]', element);
    if (target && view === 'set') setHtml(target, pagesModel().samples());
  }

  async function openSet(deckId) {
    clearTimeout(applyTimer);
    selectedDeck = deckId;
    openTopics.clear();
    applyStatus = '';
    view = 'set';
    draw();
    $('.fc-sethead__title', element)?.focus({ preventScroll: true });
    const deck = activeDeck();
    void loadSamples(deck);
    try { await loadSpecSets(deck); } catch { applyStatus = 'Could not load this set’s spec points.'; }
    if (!disposed && view === 'set' && selectedDeck === deckId) draw();
  }

  /** The student changed which cards they want: save, redraw, then update study. */
  async function changeChoice(deck, choice) {
    await saveChoice(deck, choice);
    applyStatus = 'Updating your cards…';
    drawSetKeepingScroll();
    clearTimeout(applyTimer);
    applyTimer = setTimeout(async () => {
      try {
        await syncSelection(deck, { force: true });
        await refreshDecks();
        applyStatus = 'Saved. Study uses these cards now.';
        void loadSamples(deck);
      } catch (error) {
        applyStatus = error?.message || 'Could not update your cards. Try again.';
      }
      if (!disposed && view === 'set' && selectedDeck === deck.id) drawSetKeepingScroll();
    }, 450);
  }

  function drawSetKeepingScroll() {
    const y = window.scrollY;
    const focused = document.activeElement;
    const key = focused?.matches?.('input') ? [...element.querySelectorAll('input')].indexOf(focused) : -1;
    draw();
    window.scrollTo({ top: y });
    if (key >= 0) element.querySelectorAll('input')[key]?.focus({ preventScroll: true });
  }

  async function setMenu(deck) {
    const choice = await openModal({
      title: deck.title,
      onOpen: (dialog) => dialog.classList.add('flashcards-dialog'),
      body: html`<p>PurePastPapers set${subjectFor(deck) ? ` for ${subjectFor(deck).name}` : ''}.</p>`,
      actions: [{ label: 'Cancel', cancel: true }, { label: 'Choose cards', value: 'choose' }, { label: 'Study settings', value: 'settings' }, { label: 'Remove from my sets', value: 'remove', variant: 'danger' }],
    });
    if (choice === 'choose') return openSet(deck.id);
    if (choice === 'settings') return deckDialog(deck);
    if (choice !== 'remove') return;
    const name = [subjectFor(deck)?.name, entryFor(deck)?.deck_type].filter(Boolean).join(' ') || deck.title;
    const confirmed = await confirmDialog({
      title: `Remove ${name}?`,
      message: 'It goes from your sets and stops coming up in reviews. Your progress is kept: add it again from “Add a PurePastPapers set” and you carry on where you left off.',
      confirmLabel: 'Remove set', danger: true,
    });
    if (!confirmed) return;
    await flashcards.removeCatalogueDeck(deck.catalogue_id);
    try { localStorage.removeItem(`ppp.flashcards.applied.${mountOwner}.${deck.id}`); } catch { /* private mode */ }
    specSets.delete(deck.id);
    decks = decks.filter((item) => item.id !== deck.id);
    selectedDeck = null;
    view = 'decks';
    deckCountsDirty = true;
    draw();
    toast(`${name} removed from your sets.`, { type: 'success' });
    void refreshDecks().then(() => { if (!disposed && view === 'decks') draw(); }).catch(() => {});
  }
  const presentError = (error) => toast(error?.message || 'Something went wrong. Please try again.', { type: 'error' });
  const status = (message, retry = '') => html`<div class="flashcards__status" role="status">${icon(retry ? 'alert' : message.endsWith('…') ? 'clock' : 'info')}<p>${message}</p>${retry ? html`<button class="btn btn--sm" data-action="${retry}">Try again</button>` : ''}</div>`;
  // Keep mutations serial. Read-only screens render before their requests complete.
  let queued = null;
  const task = async (fn, { queue = false } = {}) => {
    if (busy) { if (queue) queued = fn; return; }
    busy = true;
    try { await fn(); } catch (error) { if (!disposed) presentError(error); } finally { busy = false; }
    if (queued && !disposed) { const next = queued; queued = null; await task(next, { queue: true }); }
  };
  const navigationActions = new Set(['back-decks', 'catalogue', 'open-deck', 'exit-study', 'study', 'home-tab', 'browse-cards', 'back-set']);

  async function refreshDecks({ sync = false } = {}) {
    if (decksRequest) return decksRequest;
    deckCountsDirty = false;
    decksRequest = flashcards.listDecks({ sync }).then((items) => {
      decks = items;
      decksStatus = 'ready';
    }).catch((error) => {
      deckCountsDirty = true;
      throw error;
    }).finally(() => { decksRequest = null; });
    return decksRequest;
  }

  async function loadDecks() {
    if (decksStatus === 'ready' && !deckCountsDirty) return;
    if (decksStatus === 'error') { decksStatus = 'loading'; if (view === 'decks') draw(); }
    try {
      await Promise.all([
        refreshDecks({ sync: decksStatus === 'loading' }),
        subjectsStatus === 'ready' ? null : loadSubjects(),
        catalogueStatus === 'ready' || !cloudReady() ? null : loadCatalogue({ quiet: true }),
      ]);
    }
    catch { if (decksStatus !== 'ready') decksStatus = 'error'; }
    if (!disposed && ['decks', 'catalogue'].includes(view)) draw();
    if (!disposed && decksStatus === 'ready') void syncAllSelections();
  }

  let catalogueRequest = null;
  async function loadCatalogue({ quiet = false } = {}) {
    if (catalogueStatus === 'ready') return;
    if (catalogueRequest) return catalogueRequest;
    catalogueStatus = 'loading';
    if (!quiet) draw();
    catalogueRequest = flashcards.listCatalogue().then((result) => { catalogue = result; catalogueStatus = 'ready'; })
      .catch(() => { catalogueStatus = 'error'; })
      .finally(() => { catalogueRequest = null; });
    await catalogueRequest;
    if (!disposed && ['catalogue', 'decks'].includes(view)) draw();
  }

  function updateCardList() {
    const results = $('[data-manager-results]', element);
    if (results && view === 'deck') setHtml(results, managerResults());
  }

  function managerFilters() {
    return { subdeckPath, query: query.trim(), specPoint, status: cardStatus, availability };
  }

  async function refreshCards() {
    const request = ++managerRequest;
    const deckId = selectedDeck;
    const filters = { ...managerFilters(), sort: cardSort, page, pageSize };
    managerStatus = 'loading';
    updateCardList();
    try {
      const result = await flashcards.listCardPage(deckId, filters);
      if (disposed || view !== 'deck' || selectedDeck !== deckId || request !== managerRequest) return;
      totalCards = result.total;
      matchingActive = result.active ?? 0;
      matchingUnsuspendable = result.unsuspendable ?? 0;
      matchingProtected = result.protected ?? 0;
      if (!filters.subdeckPath && !filters.query && !filters.specPoint && filters.status === 'all' && filters.availability === 'all') {
        const summary = $('[data-manager-card-count]', element);
        if (summary) summary.textContent = plural(totalCards, 'card');
      }
      const lastPage = Math.max(1, Math.ceil(totalCards / pageSize));
      if (page > lastPage) { page = lastPage; return refreshCards(); }
      cards = result.cards;
      managerStatus = 'ready';
    } catch {
      if (disposed || view !== 'deck' || selectedDeck !== deckId || request !== managerRequest) return;
      managerStatus = 'error';
    }
    updateCardList();
  }

  async function refreshSpecPoints() {
    const request = ++specPointsRequest;
    const deckId = selectedDeck;
    const panel = $('[data-manager-spec-points]', element);
    if (!panel) return;
    if (specPointsStatus === 'error') {
      specPointsStatus = 'loading';
      setHtml(panel, specPointFilter());
    }
    try {
      const result = await flashcards.listDeckSpecPoints(deckId);
      if (disposed || view !== 'deck' || selectedDeck !== deckId || specPointsRequest !== request) return;
      specPoints = result.sort((a, b) => specOrder.compare(specLabel(a), specLabel(b)) || a.localeCompare(b));
      specPointsStatus = 'ready';
      if (specPoint && !specPoints.includes(specPoint)) {
        specPoint = '';
        page = 1;
        void refreshCards();
      }
    } catch {
      if (disposed || view !== 'deck' || selectedDeck !== deckId || specPointsRequest !== request) return;
      specPointsStatus = 'error';
    }
    setHtml(panel, specPointFilter());
  }

  async function refreshTopics() {
    const request = ++topicsRequest;
    const deckId = selectedDeck;
    const panel = $('[data-manager-topics]', element);
    if (!activeDeck()?.catalogue_id || !panel) return;
    topicsStatus = 'loading';
    setHtml(panel, topicPanel());
    try {
      const result = await flashcards.listDeckTopics(deckId);
      if (disposed || view !== 'deck' || selectedDeck !== deckId || request !== topicsRequest) return;
      topics = result;
      topicsStatus = 'ready';
    } catch {
      if (disposed || view !== 'deck' || selectedDeck !== deckId || request !== topicsRequest) return;
      topicsStatus = 'error';
    }
    setHtml($('[data-manager-topics]', element), topicPanel());
  }

  function openManager(deckId, { keepTopic = false } = {}) {
    clearTimeout(searchTimer);
    selectedDeck = deckId;
    if (!keepTopic) resetManagerFilters();
    page = 1;
    cards = [];
    topics = [];
    specPoints = [];
    managerStatus = 'loading';
    topicsStatus = 'loading';
    specPointsStatus = 'loading';
    view = 'deck';
    draw();
    $('.flashcards__toolbar h2', element)?.focus({ preventScroll: true });
    void refreshCards();
    void refreshTopics();
    void refreshSpecPoints();
  }

  function resetManagerFilters() {
    query = '';
    subdeckPath = '';
    specPoint = '';
    cardStatus = 'all';
    availability = 'all';
    cardSort = 'oldest';
  }

  function topicPanel() {
    if (topicsStatus === 'loading') return status('Loading topics…');
    if (topicsStatus === 'error') return status('Could not load topics.', 'retry-topics');
    const topic = topics.find(({ path }) => path === subdeckPath);
    const available = topic ? topic.total - topic.suspended : 0;
    return html`<section class="flashcards__topic"><div class="flashcards__topic-heading"><h3>Study by topic</h3>${topic ? html`<span class="small muted">${available} of ${topic.total} active</span>` : ''}</div>
      <label class="field"><span class="field__label">Topic</span><select class="input" data-topic><option value="">All topics</option>${topics.map(({ path }) => html`<option value="${path}" ${path === subdeckPath ? raw('selected') : ''}>${path.split('::').join(' › ')}</option>`)}</select></label>
      </section>`;
  }

  function selectOptions(choices, current) {
    return choices.map(([value, label]) => html`<option value="${value}" ${value === current ? raw('selected') : ''}>${label}</option>`);
  }

  function specPointFilter() {
    if (specPointsStatus === 'loading') return html`<p class="small muted" role="status">Loading specification points…</p>`;
    if (specPointsStatus === 'error') return status('Could not load specification points.', 'retry-spec-points');
    if (!specPoints.length) return '';
    return html`<label class="field"><span class="field__label">Specification point</span>
      <select class="input" data-spec-point>${selectOptions([['', 'All specification points'], ...specPoints.map((point) => [point, specLabel(point)])], specPoint)}</select>
    </label>`;
  }

  function bulkScope() {
    if (query.trim() || specPoint || cardStatus !== 'all' || availability !== 'all') return 'matching cards';
    return subdeckPath ? 'topic' : 'all cards';
  }

  function bulkActions() {
    const scope = bulkScope();
    return html`<div class="flashcards__manager-summary">
      <p class="small muted flashcards__result-count" role="status">${plural(totalCards, 'matching card')} · ${matchingActive} active · ${totalCards - matchingActive} suspended</p>
      <div class="flashcards__bulk-actions flashcards__actions">
        <button class="btn btn--sm btn--primary" data-action="topic-unsuspend" ${matchingUnsuspendable ? '' : raw('disabled')}>Unsuspend ${scope}</button>
        <button class="btn btn--sm" data-action="topic-suspend" ${matchingActive ? '' : raw('disabled')}>Suspend ${scope}</button>
        ${scope !== 'all cards' ? html`<button class="linkbtn" data-action="clear-card-filters">Clear filters</button>` : ''}
      </div>
      <p class="small muted">Applies to matches across all pages.${matchingProtected ? ' Archived and optional cards are skipped when unsuspending.' : ''}</p>
    </div>`;
  }

  function cardMetadata(card) {
    const tags = tagList(card.tags);
    const points = tags.filter((tag) => /^(?:PPP::)?Spec::/i.test(tag));
    const schedule = card.revision > 0 ? card.state?.state || 'Reviewed' : 'New';
    return html`<div class="flashcards__card-meta">
      <span>${schedule}</span>${card.suspended ? html`<span>Suspended</span>` : ''}
      ${points.map((point) => html`<span class="flashcards__point-chip">Spec ${specLabel(point)}</span>`)}
    </div>
    ${card.revision > 0 && card.due_at ? html`<p class="small muted">Due ${dateLabel(card.due_at)}</p>` : ''}
    ${card.subdeck_path ? html`<p class="small muted">${card.subdeck_path.split('::').join(' › ')}</p>` : ''}
    ${tags.length > points.length ? html`<details class="flashcards__tags"><summary>All tags</summary><p>${tags.join(', ')}</p></details>` : ''}`;
  }

  function managerResults() {
    if (managerStatus === 'loading') return status('Loading cards…');
    if (managerStatus === 'error') return status('Could not load cards.', 'retry-cards');
    if (!cards.length) {
      if (bulkScope() === 'all cards') return status('This deck has no cards yet.');
      return html`${status('No cards match these filters.')}<button class="linkbtn" data-action="clear-card-filters">Clear filters</button>`;
    }
    const readOnly = Boolean(activeDeck()?.catalogue_id);
    return html`${readOnly ? html`<p class="small muted flashcards__result-count" role="status">${plural(totalCards, 'matching card')} · ${matchingActive} in play</p>` : bulkActions()}
      <div class="flashcards__card-list">${cards.map((card) => html`<article class="card flashcards__row"><div class="flashcards__row-content"><div class="flashcards__snippet">${cardMarkup(card.variant === 'reverse' ? card.back : card.front, card.variant, false, { showMedia: false })}</div>
        ${cardMetadata(card)}</div>
        <div class="flashcards__actions"><button class="btn btn--sm" data-action="preview-card" data-id="${card.id}">Preview</button>${readOnly ? '' : html`<button class="btn btn--sm" data-action="edit-card" data-id="${card.id}">Edit</button><button class="btn btn--sm" data-action="move-card" data-id="${card.id}">Move</button>`}${readOnly ? '' : html`<button class="btn btn--sm" data-action="suspend-card" data-id="${card.id}">${card.suspended ? 'Unsuspend' : 'Suspend'}</button><button class="btn btn--sm" data-action="delete-card" data-id="${card.id}">Delete</button>`}</div></article>`)}</div>
      ${totalCards > pageSize ? html`<nav class="flashcards__pagination" aria-label="Card pages"><button class="btn btn--sm" data-action="prev-page" ${page <= 1 ? raw('disabled') : ''}>Previous</button><span>Page ${page} of ${Math.ceil(totalCards / pageSize)}</span><button class="btn btn--sm" data-action="next-page" ${page * pageSize >= totalCards ? raw('disabled') : ''}>Next</button></nav>` : ''}`;
  }

  function deckPage() {
    const deck = activeDeck();
    if (!deck) return status('Deck unavailable.');
    const readOnly = Boolean(deck.catalogue_id);
    return html`${readOnly ? html`<button class="linkbtn" data-action="back-set">← Back to the set</button>` : html`<button class="linkbtn" data-action="back-decks">← My sets</button>`}<div class="flashcards__toolbar"><div><h2 tabindex="-1">${deck.title}</h2><p class="muted"><span data-manager-card-count>${plural(deck.card_count || 0, 'card')}</span> · ${deck.target_retention || 90}% target retention${readOnly ? ' · PurePastPapers set' : ''}</p></div>
      <div class="flashcards__actions"><button class="btn btn--primary" data-action="study" data-id="${deck.id}">Start studying</button>${readOnly ? '' : html`<button class="btn" data-action="add-card">Add card</button>`}<button class="btn" data-action="settings">Deck settings</button></div></div>
      <div data-manager-topics>${readOnly ? topicPanel() : ''}</div>
      <div class="flashcards__manager-filters">
        <label class="field flashcards__search"><span class="field__label">Search cards and tags</span><input class="input" type="search" data-search value="${query}" placeholder="Search this deck"></label>
        <div data-manager-spec-points>${specPointFilter()}</div>
        <label class="field"><span class="field__label">Card status</span><select class="input" data-card-status>${selectOptions([['all', 'Any status'], ['new', 'New'], ['learning', 'Learning'], ['due', 'Due now'], ['reviewed', 'Reviewed']], cardStatus)}</select></label>
        <label class="field"><span class="field__label">${readOnly ? 'In play' : 'Study availability'}</span><select class="input" data-card-availability>${selectOptions(readOnly ? [['all', 'All cards'], ['active', 'In play'], ['suspended', 'Not in play']] : [['all', 'Active and suspended'], ['active', 'Active only'], ['suspended', 'Suspended only']], availability)}</select></label>
        <label class="field"><span class="field__label">Sort cards</span><select class="input" data-card-sort>${selectOptions([['oldest', 'Oldest added'], ['newest', 'Newest added'], ['new-first', 'New cards first'], ['due', 'Due date']], cardSort)}</select></label>
      </div>
      <div data-manager-results>${managerResults()}</div>`;
  }

  function ratingStatus(session) {
    if (session.loading) return 'Loading the next card…';
    if (session.saving) return session.previewing ? 'Saving the previous rating…' : 'Saving rating…';
    if (session.pending) return 'Your rating is waiting to be saved. Retry when connected.';
    return '';
  }

  function studyPage() {
    const deck = activeDeck();
    const subject = subjectFor(deck);
    const label = deck?.catalogue_id
      ? html`<span class="fc-stamp" aria-hidden="true">P</span><span><b>${subject?.name || 'PurePastPapers'}</b> · ${entryFor(deck)?.deck_type || study.deckTitle}</span>`
      : html`${subject ? html`<span class="fc-dot" aria-hidden="true"></span>` : ''}<span><b>${study.deckTitle}</b>${subject ? ` · ${subject.name}` : ''}</span>`;
    return html`<div class="fc-studytop"><button class="linkbtn" data-action="exit-study">← Back to the set</button>
        <div class="fc-studyset ${deck?.catalogue_id ? '' : 'fc-studyset--own'}" style="--sc:${subject?.colour || 'var(--surface)'}">${label}${study.topic ? html`<span class="small"> · ${study.topic.split('::').join(' › ')}</span>` : ''}</div>
        <span class="muted small flashcards__study-progress" data-study-progress></span></div>
      <div class="fc-studymeter" style="--sc:${subject?.colour || 'var(--ink)'}" aria-hidden="true"><i data-study-meter></i></div>
      <section class="fc-studypanel" data-study-card></section>`;
  }

  function studyEmpty(session) {
    if (session.loading) return status(session.reviewed ? 'Loading the next card…' : 'Loading your study queue…');
    if (session.failed) return status('Could not load the study queue.', 'retry-study');
    if (!session.reviewed && !session.nextDue && activeDeck()?.catalogue_id) {
      return html`<h2 data-study-end tabindex="-1">No cards ready</h2><p>None of this set’s cards are in play yet. Tick the spec points you’ve learnt in My subjects, or choose cards yourself.</p><button class="btn btn--primary" data-action="exit-study">Choose cards</button>`;
    }
    return html`${icon('checkCircle', { size: 36 })}<h2 data-study-end tabindex="-1">All caught up</h2><p>${session.reviewed ? `You completed ${plural(session.reviewed, 'review')} in this session.` : 'There are no cards ready to study in this deck.'}</p>${session.nextDue ? html`<p>Next card due ${dateLabel(session.nextDue)}.</p>` : ''}`;
  }

  function studyControls(session) {
    if (!session.shown) return html`<button class="btn btn--primary" data-action="show-answer">Show answer <span class="small flashcards__shortcut">Space</span></button>`;
    return html`<div class="flashcards__grades" role="group" aria-label="Rate this card">${[['Again', 1], ['Hard', 2], ['Good', 3], ['Easy', 4]].map(([label, grade]) => html`
      <button class="btn" data-action="grade" data-grade="${grade}" data-grade-label="${label}">${label} <span aria-hidden="true">${grade}</span></button>`)}</div>`;
  }

  function studyMeter(session) {
    const meter = $('[data-study-meter]', element);
    if (!meter) return;
    const left = session.card ? 1 + session.buffer.length : 0;
    const total = Math.max(session.planned || 0, session.reviewed + left);
    meter.style.width = `${total ? Math.round((100 * session.reviewed) / total) : session.reviewed ? 100 : 0}%`;
  }

  function updateStudyFeedback(session) {
    const statusArea = $('[data-rating-status]', element);
    const message = ratingStatus(session);
    if (statusArea.textContent !== message) statusArea.textContent = message;
    $('[data-study-progress]', element).textContent = `${session.reviewed} reviewed`;
    studyMeter(session);
    const pendingGrade = !session.saving && session.pending?.grade;
    for (const button of element.querySelectorAll('[data-action="grade"]')) {
      const isRetry = pendingGrade === Number(button.dataset.grade);
      button.firstChild.textContent = `${isRetry ? 'Retry ' : ''}${button.dataset.gradeLabel} `;
      button.disabled = session.loading || session.saving || Boolean(pendingGrade && !isRetry);
    }
  }

  function drawStudy() {
    const panel = $('[data-study-card]', element);
    const previousFocus = document.activeElement;
    const restoreFocus = previousFocus === document.body || element.contains(previousFocus);
    const nextCard = study.card;
    panel.classList.toggle('card', !nextCard);
    panel.classList.toggle('flashcards__study-empty', !nextCard);
    scheduleStudyWake();
    if (!nextCard) {
      $('[data-study-progress]', element).textContent = `${study.reviewed} reviewed`;
      studyMeter(study);
      setHtml(panel, studyEmpty(study));
      delete panel.dataset.cardId;
      delete panel.dataset.cardRevision;
      if (restoreFocus && (!previousFocus.isConnected || previousFocus === document.body)) {
        $('[data-study-end], [data-action="retry-study"]', panel)?.focus();
      }
      return;
    }
    const cardChanged = panel.dataset.cardId !== nextCard.id || panel.dataset.cardRevision !== String(nextCard.revision);
    if (cardChanged) {
      panel.dataset.cardId = nextCard.id;
      panel.dataset.cardRevision = nextCard.revision;
      const points = tagList(nextCard.tags).filter((tag) => /^(?:PPP::)?Spec::/i.test(tag)).slice(0, 2);
      setHtml(panel, html`<div class="card ruled flashcards__faces fc-studycard"><i class="tape tape--c" aria-hidden="true"></i>
        ${points.length ? html`<span class="fc-studyspec">${points.map((tag) => html`<span class="tag">Spec ${specLabel(tag)}</span>`)}</span>` : ''}
        <div role="group" aria-labelledby="flashcard-question-label" aria-describedby="flashcard-question" tabindex="-1" data-study-question>
          <p class="flashcards__face-label hand" id="flashcard-question-label">question</p>
          <div class="flashcards__content" id="flashcard-question">${questionFace(nextCard)}</div>
        </div>
        <div data-study-answer hidden></div>
      </div>
      <div class="flashcards__study-actions">
        <p class="small muted flashcards__save-status" id="flashcard-rating-status" data-rating-status role="status"></p>
        <div data-study-controls></div>
      </div>`);
      resolveMedia($('[data-study-question]', panel), Boolean(activeDeck()?.catalogue_id));
    }
    const answer = $('[data-study-answer]', panel);
    const revealed = study.shown && answer.hidden;
    if (revealed) {
      answer.hidden = false;
      setHtml(answer, html`<hr class="flashcards__divider">
        <div role="group" aria-labelledby="flashcard-answer-label" aria-describedby="flashcard-answer flashcard-rating-status" tabindex="-1" data-study-answer-face>
          <p class="flashcards__face-label hand" id="flashcard-answer-label">answer</p>
          <div class="flashcards__content" id="flashcard-answer">${answerContent(nextCard)}</div>
          ${answerExtra(nextCard)}
        </div>`);
      resolveMedia(answer, Boolean(activeDeck()?.catalogue_id));
    }
    if (cardChanged || revealed) setHtml($('[data-study-controls]', panel), studyControls(study));
    updateStudyFeedback(study);
    if (!restoreFocus || previousFocus?.matches('[data-action="exit-study"]')) return;
    if (!cardChanged && !revealed) {
      if (study.shown && document.activeElement === document.body) {
        $('[data-study-answer-face]', panel)?.focus({ preventScroll: true });
      }
      return;
    }
    const selector = revealed ? '[data-study-answer-face]' : '[data-study-question]';
    const face = $(selector, panel);
    if (face) {
      face.focus({ preventScroll: true });
      $('.flashcards__face-label', face)?.scrollIntoView({ block: 'nearest' });
    }
  }

  function showAnswer() {
    if (view !== 'study' || !study?.card || study.shown) return;
    study.shown = true;
    drawStudy();
  }

  function importPage() {
    return html`<button class="linkbtn" data-action="back-decks">← My decks</button>
      <h2 tabindex="-1">Import cards</h2><p>Choose a private deck and an import source. You can review the cards before adding them.</p>
      <details class="card flashcards__import" data-import-settings open>
      <summary>Import settings</summary>
      <form data-import-form>
        <label class="field"><span class="field__label">Import into</span><select class="input" name="deck" required>${decks.filter((deck) => !deck.catalogue_id).map((deck) => html`<option value="${deck.id}" ${deck.id === selectedDeck ? raw('selected') : ''}>${deck.title}</option>`)}</select></label>
        <label class="field"><span class="field__label">Source</span><select class="input" name="source" data-import-source><option value="anki">Anki package (.apkg)</option><option value="quizlet">Quizlet export text</option><option value="csv">CSV file</option></select></label>
        <div data-import-fields>${importFields('anki')}</div>
        <div class="flashcards__actions"><button class="btn btn--primary" type="submit">Preview import</button></div>
      </form>
      </details>
      <div data-import-preview></div>
      <button class="btn btn--sm" data-action="cancel-import">Cancel an unfinished import</button>`;
  }

  function scheduleStudyWake() {
    clearTimeout(queueTimer);
    if (view === 'study' && study && !study.card && !study.loading && !study.failed && study.nextDue) {
      const session = study;
      const checkDue = () => {
        if (!isCurrentStudy(session)) return;
        const remaining = session.refreshAt - performance.now();
        if (remaining > 0) queueTimer = setTimeout(checkDue, Math.min(remaining, 2147483647));
        else void refillStudy(session);
      };
      if (Number.isFinite(session.refreshAt)) {
        queueTimer = setTimeout(checkDue, Math.min(Math.max(1000, session.refreshAt - performance.now()), 2147483647));
      }
    }
  }

  function overviewPage() {
    const head = html`<header class="fc-head"><div><h1>Flashcards</h1></div></header>`;
    if (decksStatus === 'loading' || subjectsStatus === 'loading') return html`${head}${status('Loading your sets…')}`;
    if (decksStatus === 'error') return html`${head}${status('Could not load your sets.', 'retry-decks')}`;
    if (view === 'catalogue') {
      if (catalogueStatus === 'error') return status('Could not load the PurePastPapers sets.', 'retry-catalogue');
      if (catalogueStatus !== 'ready') return status('Loading the PurePastPapers sets…');
      return catalogueScreen(pagesModel());
    }
    return homePage(pagesModel());
  }

  function draw() {
    if (disposed) return;
    clearTimeout(queueTimer);
    const page = view === 'study' ? studyPage() : view === 'import' ? importPage() : view === 'deck' ? deckPage()
      : view === 'set' ? (activeDeck() ? setPage(pagesModel(), activeDeck()) : status('This set is no longer in your sets.'))
      : overviewPage();
    const siteLook = view === 'decks' || view === 'catalogue' || view === 'set';
    setHtml(element, html`<div class="${siteLook ? 'fc' : view === 'study' ? 'flashcards flashcards--site' : 'flashcards'}" data-view="${view}">${page}</div>`);
    for (const box of element.querySelectorAll('[data-part]')) box.indeterminate = true;
    releaseDetachedMedia();
  }

  async function deckDialog(deck = null) {
    const own = !deck?.catalogue_id;
    const currentSubject = deck ? deckSubjectId(deck) : (homeTab !== 'all' ? homeTab : '');
    const subjectField = own && subjects.length ? html`<label class="field"><span class="field__label">Subject (optional)</span><select class="input" name="subject"><option value="">No subject</option>${subjects.map((item) => html`<option value="${item.id}" ${item.id === currentSubject ? raw('selected') : ''}>${item.name}</option>`)}</select><span class="field__hint">The set shows on this subject’s tab.</span></label>` : '';
    const result = await openModal({
      onOpen: (dialog) => dialog.classList.add('flashcards-dialog'),
      title: deck ? (own ? 'Set settings' : 'Study settings') : 'Make your own set',
      body: html`<label class="field"><span class="field__label">Set name</span><input class="input" name="title" maxlength="100" required value="${deck?.title || ''}" ${deck?.catalogue_id ? raw('readonly') : ''}></label>${subjectField}${!deck?.catalogue_id ? html`<label class="field"><span class="field__label">Inside another set (optional)</span><select class="input" name="parent"><option value="">Not inside another set</option>${decks.filter((item) => item.id !== deck?.id && !item.catalogue_id).map((item) => html`<option value="${item.id}" ${deck?.parent_id === item.id ? raw('selected') : ''}>${item.title}</option>`)}</select></label>` : ''}${deck ? html`<label class="field"><span class="field__label">Target retention</span><input class="input" name="retention" type="number" min="80" max="92" step="1" value="${deck.target_retention || 90}"><span class="field__hint">A higher target usually means more reviews. Changes apply to future reviews.</span></label><label class="field"><span class="field__label">New cards per day</span><input class="input" name="newLimit" type="number" min="0" max="999" step="1" value="${deck.new_limit ?? 20}"></label>` : ''}`,
      actions: [{ label: 'Cancel', cancel: true }, { label: deck ? 'Save changes' : 'Make set', variant: 'primary', validate: (dialog) => {
        const title = dialog.querySelector('[name=title]').value.trim();
        const retention = Number(dialog.querySelector('[name=retention]')?.value || 90);
        const limit = Number(dialog.querySelector('[name=newLimit]')?.value ?? 20);
        return !title ? 'Enter a set name.' : !Number.isInteger(retention) || retention < 80 || retention > 92 ? 'Choose a whole percentage from 80 to 92.' : !Number.isInteger(limit) || limit < 0 || limit > 999 ? 'Choose a daily limit from 0 to 999.' : null;
      }, collect: (dialog) => ({ title: dialog.querySelector('[name=title]').value.trim(), target_retention: Number(dialog.querySelector('[name=retention]')?.value || 90), new_limit: Number(dialog.querySelector('[name=newLimit]')?.value ?? 20), parent_id: dialog.querySelector('[name=parent]') ? dialog.querySelector('[name=parent]').value || null : undefined, subject: dialog.querySelector('[name=subject]')?.value }) }],
    });
    if (!result) return;
    const { subject, ...fields } = result;
    const saved = deck ? await flashcards.updateDeck(deck.id, fields) : await flashcards.createDeck(fields);
    const savedId = deck?.id || saved?.id;
    if (subject !== undefined && savedId && (subject || null) !== (deckSubjectId(deck || { id: savedId }) || null)) {
      const subjectLinks = { ...(preferences().flashcardDeckSubjects || {}) };
      if (subject) subjectLinks[savedId] = subject; else delete subjectLinks[savedId];
      try { await setPreference('flashcardDeckSubjects', subjectLinks); } catch { toast('The set was saved, but its subject could not be saved.', { type: 'error' }); }
    }
    await refreshDecks(); draw();
    return saved;
  }

  async function cardDialog(card = null) {
    const result = await openModal({
      onOpen: (dialog) => dialog.classList.add('flashcards-dialog', 'flashcards-editor'),
      title: card ? 'Edit card' : 'Add a card',
      body: html`<label class="field"><span class="field__label">Card type</span><select class="input" name="type" ${card ? raw('disabled') : ''}><option value="basic" ${card?.type === 'basic' ? raw('selected') : ''}>Basic</option><option value="reverse" ${card?.type === 'reverse' ? raw('selected') : ''}>Basic and reverse</option><option value="cloze" ${card?.type === 'cloze' ? raw('selected') : ''}>Cloze deletion</option></select><span class="field__hint flashcards__cloze-hint">For cloze, write {{c1::the answer}} in the front. Use c2, c3 and so on for separate cards.</span></label><div class="flashcards__editor-faces"><label class="field"><span class="field__label">Front</span><textarea class="textarea" name="front" rows="5" required>${card?.front || ''}</textarea></label><label class="field"><span class="field__label">Back or extra information</span><textarea class="textarea" name="back" rows="5">${card?.back || ''}</textarea></label></div><label class="field"><span class="field__label">Tags</span><input class="input" name="tags" value="${tagList(card?.tags).join(', ')}"><span class="field__hint">Separate tags with commas.</span></label>${card ? html`<p class="small muted">Editing the note preserves its cards and their review history. The card type cannot be changed here.</p>` : ''}`,
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
    deckCountsDirty = true;
    await Promise.all([refreshCards(), refreshSpecPoints()]);
  }

  function isCurrentStudy(session) {
    return !disposed && view === 'study' && study === session && mountOwner === cloudAccountId();
  }

  async function loadStudyQueue(session, saved = null) {
    const request = ++studyRequest;
    try {
      if (saved) {
        // Recover the original request before asking for another batch. The rating
        // may already have committed, so preserve its original card revision.
        const original = await flashcards.getCard(session.deckId, saved.cardId);
        if (!isCurrentStudy(session) || studyRequest !== request) return;
        if (original) {
          session.card = { ...original, revision: saved.revision };
          session.shown = true;
          session.pending = { card: session.card, grade: saved.grade, requestId: saved.requestId };
        } else clearPending(session.deckId, saved.requestId);
      }
      if (!session.pending) {
        const requestedAt = performance.now();
        const queue = await flashcards.getStudyQueue(session.deckId, { subdeckPath: session.topic || null });
        if (!isCurrentStudy(session) || studyRequest !== request) return;
        const next = queue.cards[0] || null;
        session.shown = Boolean(next && session.card?.id === next.id && session.card.revision === next.revision && session.shown);
        session.card = next;
        session.nextDue = queue.nextDue;
        session.buffer = queue.cards.slice(1);
        const untilDue = Date.parse(queue.nextDue) - Date.parse(queue.serverNow);
        session.refreshAt = Number.isFinite(untilDue) ? requestedAt + Math.max(0, untilDue) : Infinity;
      }
      session.failed = false;
    } catch {
      if (!isCurrentStudy(session) || studyRequest !== request) return;
      session.card = null;
      session.failed = true;
    }
    session.loading = false;
    drawStudy();
    preloadNextQuestion(session);
  }

  function preloadNextQuestion(session) {
    const next = session.buffer[0];
    if (!next) return;
    const preview = document.createElement('template');
    setHtml(preview, questionFace(next));
    resolveMedia(preview.content, Boolean(activeDeck()?.catalogue_id), 2);
  }

  function beginStudy(deckId) {
    clearTimeout(searchTimer);
    selectedDeck = deckId;
    const saved = readPending(deckId);
    if (saved?.subdeckPath !== undefined) subdeckPath = saved.subdeckPath || '';
    study = { deckId, topic: subdeckPath, card: null, buffer: [], nextDue: null, refreshAt: Infinity,
      deckTitle: activeDeck()?.title || 'Study', planned: (activeDeck()?.due_count || 0) + (activeDeck()?.learning_count || 0) + (activeDeck()?.new_count || 0), shown: false, reviewed: 0, pending: null, loading: true };
    view = 'study';
    draw();
    drawStudy();
    const session = study;
    const inFlight = activeReviews.get(deckId);
    if (inFlight) {
      void inFlight.then(() => {
        if (isCurrentStudy(session)) void loadStudyQueue(session, readPending(deckId));
      });
    } else void loadStudyQueue(session, saved);
  }

  function refillStudy(session) {
    session.buffer = [];
    session.nextDue = null;
    session.loading = true;
    drawStudy();
    return loadStudyQueue(session);
  }

  async function saveGrade(grade) {
    const session = study;
    if (!isCurrentStudy(session) || !session?.card || !session.shown || session.loading || session.saving || ![1, 2, 3, 4].includes(grade)) return;
    const replaying = Boolean(session.pending);
    if (!session.pending) {
      session.pending = { grade, requestId: newReviewRequestId(), card: session.card };
      writePending(session.deckId, { cardId: session.card.id, revision: session.card.revision, grade, requestId: session.pending.requestId, subdeckPath: session.topic });
    }
    if (session.pending.grade !== grade) return;
    session.saving = true;
    const requestedAt = performance.now();
    // Reveal the next buffered question immediately. Its rating stays unavailable
    // until the server confirms the previous one and its scheduling deadline.
    session.previewing = Boolean(!replaying && session.buffer.length && requestedAt < session.refreshAt);
    if (session.previewing) {
      session.card = session.buffer[0];
      session.shown = false;
    }
    drawStudy();
    let saved;
    try {
      saved = await flashcards.reviewCard(session.pending.card, grade, session.pending.requestId);
    } catch (error) {
      if (error?.retryable || error?.status === 401) {
        if (!isCurrentStudy(session)) return;
        session.card = session.pending.card;
        session.shown = true;
        session.saving = false;
        session.previewing = false;
        drawStudy();
        if (error?.status === 401) presentError(error);
        return;
      }
      if (isCurrentStudy(session)) presentError(error);
    }
    clearPending(session.deckId, session.pending.requestId);
    deckCountsDirty = true;
    if (!isCurrentStudy(session)) return;
    const previewing = session.previewing;
    session.previewing = false;
    session.pending = null;
    session.saving = false;
    if (saved) {
      session.reviewed++;
      const untilDue = Date.parse(saved.state?.due) - Date.parse(saved.reviewed_at);
      if (Number.isFinite(untilDue)) session.refreshAt = Math.min(session.refreshAt, requestedAt + Math.max(0, untilDue));
      if (previewing && performance.now() < session.refreshAt) {
        session.buffer.shift();
        updateStudyFeedback(session);
        preloadNextQuestion(session);
        return;
      }
    }
    if (!previewing) {
      session.card = null;
      session.shown = false;
    }
    void refillStudy(session);
  }

  function rateStudy(grade) {
    const session = study;
    if (!session || activeReviews.has(session.deckId)) return;
    const request = saveGrade(grade).catch((error) => {
      if (isCurrentStudy(session)) presentError(error);
    }).finally(() => activeReviews.delete(session.deckId));
    activeReviews.set(session.deckId, request);
  }

  function importFields(source) {
    if (source === 'quizlet') return html`<p class="small muted">In Quizlet, open your set and choose Export. Choose a tab between term and definition, and a new line between cards, then paste the text below.</p><label class="field"><span class="field__label">Exported text</span><textarea class="textarea" name="text" rows="8" required></textarea></label><label class="field"><span class="field__label">Card front</span><select class="input" name="quizletFront"><option value="term">Term (definition on the back)</option><option value="definition">Definition (term on the back)</option></select></label>`;
    if (source === 'csv') return html`<label class="field"><span class="field__label">CSV file</span><input class="input" name="file" type="file" accept=".csv,.txt,text/csv" required></label><label class="field"><span class="field__label">Delimiter</span><select class="input" name="delimiter"><option value=",">Comma</option><option value="tab">Tab</option><option value=";">Semicolon</option></select></label><p class="small muted">Choose the column numbers from your file, starting at 1.</p><div class="flashcards__mapping"><label class="field"><span class="field__label">Front column</span><input class="input" type="number" name="front" min="1" value="1" required></label><label class="field"><span class="field__label">Back column</span><input class="input" type="number" name="back" min="1" value="2" required></label><label class="field"><span class="field__label">Tags column (optional)</span><input class="input" type="number" name="tags" min="1"></label><label class="field"><span class="field__label">Deck column (optional)</span><input class="input" type="number" name="deckColumn" min="1"></label></div><label><input type="checkbox" name="header"> First row contains headers</label>`;
    return html`<label class="field"><span class="field__label">Anki package</span><input class="input" name="file" type="file" accept=".apkg" required></label><p class="small muted">Cards start fresh with FSRS. Existing Anki study progress is not imported.</p>`;
  }

  function clearImportPreview() {
    importPreviewRequest?.abort();
    importPreviewRequest = null;
    importState = null;
    for (const url of mediaUrls) URL.revokeObjectURL(url);
    mediaUrls.clear();
    const preview = $('[data-import-preview]', element);
    if (preview) setHtml(preview, '');
    const settings = $('[data-import-settings]', element);
    if (settings) $('summary', settings).textContent = 'Import settings';
    const submit = $('[data-import-form] button[type="submit"]', element);
    if (submit) submit.disabled = false;
  }

  function setImportProgress(output, meter, label, done, total) {
    output.textContent = label;
    meter.value = done || 0;
    meter.max = total || 1;
    meter.hidden = !total;
  }

  async function previewImport(form) {
    clearImportPreview();
    const preview = $('[data-import-preview]', element);
    const source = form.elements.source.value;
    const deckId = form.elements.deck.value;
    const submit = $('button[type="submit"]', form);
    const request = new AbortController();
    importPreviewRequest = request;
    submit.disabled = true;
    setHtml(preview, html`<p role="status">Reading your cards…</p><progress aria-label="Import preview progress" hidden></progress>`);
    const output = $('p', preview);
    const meter = $('progress', preview);
    const readProgress = ({ stage, loaded, total }) => {
      const mb = (bytes) => (bytes / 1048576).toFixed(1);
      if (stage === 'reading') setImportProgress(output, meter, `Reading package · ${mb(loaded)} of ${mb(total)} MB`, loaded, total);
      else setImportProgress(output, meter, stage === 'media' ? 'Checking package media…' : 'Reading the Anki cards…');
    };
    try {
      if (!deckId) throw new Error('Create a deck before importing.');
      const input = { source };
      if (source === 'quizlet') {
        input.text = form.elements.text.value;
        input.options = { front: form.elements.quizletFront.value };
      } else {
        input.file = form.elements.file.files[0];
        if (!input.file) throw new Error(source === 'anki' ? 'Choose an Anki package.' : 'Choose a CSV file.');
        if (source === 'csv') {
          if (input.file.size > 10 * 1024 * 1024) throw new Error('CSV files must be smaller than 10 MB.');
          const column = (name) => form.elements[name].value ? Number(form.elements[name].value) - 1 : undefined;
          input.options = {
            front: column('front'), back: column('back'), tags: column('tags'), deck: column('deckColumn'),
            delimiter: form.elements.delimiter.value === 'tab' ? '\t' : form.elements.delimiter.value, header: form.elements.header.checked,
          };
        }
      }
      const { parseImport } = await import('../../flashcards/import-client.js');
      const parsed = await parseImport(input, { onProgress: readProgress, signal: request.signal });
      request.signal.throwIfAborted();
      setImportProgress(output, meter, 'Checking for duplicate cards…');
      const info = await flashcards.previewImport(deckId, parsed);
      request.signal.throwIfAborted();
      importState = { deckId, parsed };
      drawImportPreview(preview, { source, deckId, parsed, info, options: input.options });
      const settings = $('[data-import-settings]', element);
      settings.open = !info.accepted && Boolean(parsed.errors?.length);
      $('summary', settings).textContent = 'Edit import settings';
      $('h3', preview).focus();
    } catch (error) {
      if (!request.signal.aborted) {
        setHtml(preview, html`<section class="card flashcards__preview"><h3 tabindex="-1">Could not preview this import</h3><p role="alert">${error.message}</p></section>`);
        $('h3', preview).focus();
      }
    } finally {
      if (importPreviewRequest === request) {
        importPreviewRequest = null;
        submit.disabled = false;
      }
    }
  }

  function drawImportPreview(preview, { source, deckId, parsed, info, options }) {
    const firstCards = [];
    for (const note of parsed.notes) {
      for (const card of note.cards) {
        if (firstCards.length === 3) break;
        firstCards.push({ front: card.front ?? note.front, back: card.back ?? note.back });
      }
      if (firstCards.length === 3) break;
    }
    const sourceDecks = parsed.decks?.map((deck) => typeof deck === 'string' ? deck : deck.name) || [];
    const errors = parsed.errors || [];
    const warnings = parsed.warnings || [];
    setHtml(preview, html`<section class="card flashcards__preview">
      <h3 tabindex="-1">Import preview</h3>
      <p>Target deck: <strong>${decks.find((deck) => deck.id === deckId)?.title || 'Selected deck'}</strong></p>
      <p>${plural(info.accepted, 'card')} ready · ${plural(info.duplicates, 'duplicate')} skipped · ${plural(errors.length, 'invalid row')}</p>
      ${sourceDecks.length ? html`<details><summary>${plural(sourceDecks.length, 'source deck')}</summary><ul>${sourceDecks.map((name) => html`<li>${name}</li>`)}</ul></details>` : ''}
      ${warnings.length ? html`<ul>${warnings.map((warning) => html`<li>${warning}</li>`)}</ul>` : ''}
      ${source === 'anki' ? html`<p class="small muted">Suspended cards stay suspended. Anki subdecks will appear inside the target deck.</p>` : ''}
      ${errors.length ? html`<details ${!info.accepted ? raw('open') : ''}><summary>Invalid rows${errors.length > 100 ? ' (first 100 shown)' : ''}</summary><ul>${errors.slice(0, 100).map((error) => html`<li>Row ${error.row}: ${error.reason}</li>`)}</ul></details>` : ''}
      ${firstCards.length ? html`<div class="flashcards__preview-cards">${firstCards.map((note) => html`<article class="flashcards__example-card"><div>${cardMarkup(note.front, '', true, { previewMedia: parsed.media, previewUrls: mediaUrls })}</div><hr><div>${cardMarkup(note.back, '', true, { previewMedia: parsed.media, previewUrls: mediaUrls })}</div></article>`)}</div>` : ''}
      ${source !== 'anki' ? html`<p class="small muted">Front shows ${source === 'quizlet' ? (parsed.front === 'definition' ? 'the definition' : 'the term') : `column ${options.front + 1}`}. <button type="button" class="btn btn--sm" data-action="swap-import-sides">Swap front and back</button></p>` : ''}
      <button class="btn btn--primary" data-action="commit-import" ${info.accepted ? '' : raw('disabled')}>Import cards</button>
      <p role="status" data-import-progress></p><progress aria-label="Import progress" data-import-meter hidden></progress><p data-import-error role="alert"></p>
    </section>`);
  }

  const offClick = on(element, 'click', '[data-action]', (event, button) => {
    const action = button.dataset.action;
    if (action === 'show-answer') { showAnswer(); return; }
    if (action === 'grade') { rateStudy(Number(button.dataset.grade)); return; }
    if (action === 'exit-study') {
      study = null;
      if (activeDeck()?.catalogue_id) void openSet(selectedDeck);
      else openManager(selectedDeck, { keepTopic: true });
      return;
    }
    return task(() => handleAction(button), { queue: navigationActions.has(action) });
  });

  async function handleAction(button) {
    const action = button.dataset.action;
    const id = button.dataset.id;
    const card = cards.find((item) => item.id === id);
    if (action === 'flashcards-guide') {
      await openModal({
        title: 'How to use Flashcards',
        onOpen: (dialog) => dialog.classList.add('flashcards-dialog'),
        body: html`<ol class="flashcards__guide">
          <li><strong>Choose a set.</strong> Add a PurePastPapers set for one of your subjects, make your own, or import cards.</li>
          <li><strong>Choose which cards.</strong> PurePastPapers sets start with only what you’ve learnt: the spec points you’ve ticked in My subjects. Open a set to choose Everything or pick spec points instead. Your progress is kept whatever you choose.</li>
          <li><strong>Review.</strong> Try the question, then show the answer. Pick Again if you forgot, Hard if recall took effort, Good if you remembered, or Easy if it felt effortless.</li>
        </ol><p class="small muted">On a keyboard, press Space to reveal and 1–4 to rate.</p>`,
        actions: [{ label: 'Got it', cancel: true }],
      });
      if (view === 'decks') $('[data-action="flashcards-guide"]', element)?.focus({ preventScroll: true });
      return;
    }
    if (action === 'back-decks' || action === 'retry-decks') {
      if (view === 'import') clearImportPreview();
      clearTimeout(searchTimer);
      view = 'decks';
      draw();
      void loadDecks();
    }
    else if (action === 'home-tab') {
      homeTab = id || 'all';
      try { sessionStorage.setItem('ppp.flashcards.tab', homeTab); } catch { /* private mode */ }
      draw();
      $(`.fc-tab[data-id="${CSS.escape(homeTab)}"]`, element)?.focus({ preventScroll: true });
    }
    else if (action === 'set-menu') { const deck = decks.find((item) => item.id === id); if (deck) await setMenu(deck); }
    else if (action === 'browse-cards') openManager(id);
    else if (action === 'back-set') void openSet(id);
    else if (action === 'catalogue' || action === 'retry-catalogue') {
      view = 'catalogue';
      if (catalogueStatus === 'error') catalogueStatus = 'idle';
      if (['ready', 'loading'].includes(catalogueStatus)) draw();
      else void loadCatalogue();
      $('h1', element)?.focus({ preventScroll: true });
    }
    else if (action === 'retry-cards') void refreshCards();
    else if (action === 'retry-topics') void refreshTopics();
    else if (action === 'retry-spec-points') void refreshSpecPoints();
    else if (action === 'clear-card-filters') {
      clearTimeout(searchTimer);
      const previousSort = cardSort;
      resetManagerFilters();
      cardSort = previousSort;
      page = 1;
      if (activeDeck()?.catalogue_id) setHtml($('[data-manager-topics]', element), topicPanel());
      const point = $('[data-spec-point]', element);
      if (point) point.value = '';
      $('[data-card-status]', element).value = cardStatus;
      $('[data-card-availability]', element).value = availability;
      const search = $('[data-search]', element);
      search.value = '';
      search.focus({ preventScroll: true });
      void refreshCards();
    }
    else if (action === 'retry-study' && study) {
      study.loading = true;
      drawStudy();
      void loadStudyQueue(study, readPending(study.deckId));
    }
    else if (action === 'create-deck') await deckDialog();
    else if (action === 'settings') {
      const choice = await openModal({ title: activeDeck().title, body: html`<p>Change this deck’s study settings${activeDeck().catalogue_id ? '.' : ', rename it, or remove it and its cards from study.'}</p>`, actions: [{ label: 'Cancel', cancel: true }, { label: 'Edit settings', value: 'edit', variant: 'primary' }, ...(!activeDeck().catalogue_id ? [{ label: 'Delete deck', value: 'delete', variant: 'danger' }] : [])] });
      if (choice === 'edit') await deckDialog(activeDeck());
      if (choice === 'delete') {
        const deck = activeDeck();
        if (await confirmDialog({ title: 'Delete deck?', message: `Remove “${deck.title}” and its ${plural(deck.card_count || cards.length, 'card')} from study? ${decks.some((item) => item.parent_id === deck.id) ? 'Its subdecks will move to the next level. ' : ''}Their review logs are retained.`, confirmLabel: 'Delete deck', danger: true })) { await flashcards.deleteDeck(deck.id); selectedDeck = null; view = 'decks'; await refreshDecks(); draw(); }
      }
    }
    else if (action === 'prev-page' || action === 'next-page') { page += action === 'prev-page' ? -1 : 1; void refreshCards(); }
    else if (action === 'open-deck') {
      if (decks.find((deck) => deck.id === id)?.catalogue_id) await openSet(id);
      else openManager(id);
    }
    else if (action === 'add-card') await cardDialog();
    else if (action === 'edit-card' && card) await cardDialog(card);
    else if (action === 'preview-card' && card) { await openModal({ title: 'Card preview', body: html`<div class="flashcards__preview-card">${faces(card, true)}</div>`, onOpen: (dialog) => { dialog.classList.add('flashcards-dialog'); resolveMedia(dialog, Boolean(activeDeck()?.catalogue_id)); } }); }
    else if (action === 'move-card' && card) {
      const target = await openModal({ title: 'Move card', body: html`<label class="field"><span class="field__label">Move to deck</span><select class="input" name="deck">${decks.filter((deck) => deck.id !== selectedDeck && !deck.catalogue_id).map((deck) => html`<option value="${deck.id}">${deck.title}</option>`)}</select></label><p class="small muted">The card keeps its review history and due date.</p>`, actions: [{ label: 'Cancel', cancel: true }, { label: 'Move card', variant: 'primary', validate: (dialog) => dialog.querySelector('[name=deck]').value ? null : 'Create another deck first.', collect: (dialog) => dialog.querySelector('[name=deck]').value }] });
      if (target) { await flashcards.updateCard(id, { deck_id: target }); deckCountsDirty = true; await Promise.all([refreshCards(), refreshSpecPoints()]); }
    }
    else if (action === 'suspend-card' && card) { await flashcards.updateCard(id, { suspended: !card.suspended }); deckCountsDirty = true; await Promise.all([refreshCards(), refreshTopics()]); }
    else if (action === 'delete-card' && card) {
      if (await confirmDialog({ title: 'Delete card?', message: `Remove this card from study in “${activeDeck().title}”? Its review logs are retained.`, confirmLabel: 'Delete card', danger: true })) { await flashcards.deleteCard(id); deckCountsDirty = true; await Promise.all([refreshCards(), refreshSpecPoints()]); }
    }
    else if (action === 'study') { if (view !== 'deck' || selectedDeck !== id) resetManagerFilters(); beginStudy(id); }
    else if ((action === 'topic-unsuspend' || action === 'topic-suspend') && managerStatus === 'ready') {
      const suspended = action === 'topic-suspend';
      const count = suspended ? matchingActive : matchingUnsuspendable;
      if (!count) return;
      const deckId = selectedDeck;
      const filters = managerFilters();
      const verb = suspended ? 'Suspend' : 'Unsuspend';
      const confirmed = await confirmDialog({ title: `${verb} cards?`, message: `${verb} ${plural(count, 'card')} across all pages of the current results?${!suspended && matchingProtected ? ' Archived and optional cards will be skipped.' : ''}`, confirmLabel: verb });
      if (confirmed) {
        button.disabled = true;
        let result;
        try { result = await flashcards.setFilteredSuspension(deckId, filters, suspended); }
        finally { button.disabled = false; }
        deckCountsDirty = true;
        await Promise.all([refreshCards(), refreshTopics()]);
        toast(`${plural(result?.changed || 0, 'card')} ${suspended ? 'suspended' : 'unsuspended'}.${result?.excluded ? ` ${plural(result.excluded, 'archived or optional card')} left unchanged.` : ''}`, { type: 'success' });
      }
    }
    else if (action === 'add-catalogue') {
      addingCatalogue = id;
      draw();
      try {
        const { deck_id: deckId } = await flashcards.addCatalogueDeck(id);
        if (disposed) return;
        const entry = catalogue.entries.find((item) => item.id === id);
        deckCountsDirty = true;
        if (decksRequest) await decksRequest.catch(() => {});
        if (deckId && entry && !decks.some((deck) => deck.id === deckId)) {
          decks = [...decks, { id: deckId, catalogue_id: id, title: entry.title, card_count: entry.card_count }];
          decksStatus = 'ready';
        }
        toast(`${[subjectById(entry?.subject_id)?.name, entry?.deck_type].filter(Boolean).join(' ') || 'Set'} added to your sets. It starts with only what you’ve learnt.`, { type: 'success' });
        await loadDecks();
      } finally {
        addingCatalogue = null;
        draw();
      }
    }
    else if (action === 'import') {
      if (!decks.some((deck) => !deck.catalogue_id)) {
        const created = await deckDialog();
        if (!created || disposed) return;
        selectedDeck = created.id;
      }
      view = 'import';
      draw();
      $('h2', element)?.focus({ preventScroll: true });
    }
    else if (action === 'cancel-import') {
      if (await confirmDialog({ title: 'Cancel unfinished import?', message: 'Remove the staged cards and media from your unfinished import?', confirmLabel: 'Cancel import', danger: true })) { await flashcards.cancelImport(); clearImportPreview(); toast('Unfinished import cancelled.', { type: 'success' }); }
    }
    else if (action === 'swap-import-sides') {
      const form = $('[data-import-form]', element);
      if (form.elements.quizletFront) form.elements.quizletFront.value = form.elements.quizletFront.value === 'definition' ? 'term' : 'definition';
      else if (form.elements.front && form.elements.back) [form.elements.front.value, form.elements.back.value] = [form.elements.back.value, form.elements.front.value];
      void previewImport(form);
    }
    else if (action === 'commit-import' && importState) {
      const progress = $('[data-import-progress]', element);
      const meter = $('[data-import-meter]', element);
      const errorOutput = $('[data-import-error]', element);
      const importForm = $('[data-import-form]', element);
      const swap = $('[data-action="swap-import-sides"]', element);
      const cancel = $('[data-action="cancel-import"]', element);
      button.disabled = true;
      importForm.inert = true;
      cancel.disabled = true;
      if (swap) swap.disabled = true;
      errorOutput.textContent = '';
      setImportProgress(progress, meter, 'Preparing your import…');
      try {
        const result = await flashcards.commitImport(importState.deckId, importState.parsed, {
          onProgress: ({ stage, done, total }) => {
            const label = stage === 'media' ? `Uploading media · ${done} of ${total} files`
              : stage === 'cards' ? `Preparing ${done} of ${total} cards…` : 'Publishing your cards…';
            setImportProgress(progress, meter, label, done, total);
          },
        });
        if (disposed || mountOwner !== cloudAccountId()) return;
        const targetId = importState.deckId;
        clearImportPreview();
        deckCountsDirty = true;
        const preview = $('[data-import-preview]', element);
        if (preview) {
          setHtml(preview, html`<section class="card flashcards__preview">
            <h3 tabindex="-1">Import complete</h3>
            <p role="status" data-import-progress>Imported ${plural(result.imported, 'card')}. ${plural(result.duplicates, 'duplicate')} skipped.</p>
            <button class="btn btn--primary" data-action="open-deck" data-id="${targetId}">Open deck</button>
          </section>`);
          $('h3', preview).focus({ preventScroll: true });
        }
      } catch (error) {
        setImportProgress(progress, meter, 'The import could not finish. You can retry.');
        errorOutput.textContent = error.message;
        button.disabled = false;
      } finally {
        importForm.inert = false;
        cancel.disabled = false;
        if (swap) swap.disabled = false;
      }
    }

  }
  const offChoice = on(element, 'change', '[data-choice-mode], [data-choice-general], [data-choice-topic], [data-choice-point]', (event, control) => {
    const deck = activeDeck();
    if (view !== 'set' || !deck) return;
    const choice = choiceFor(deck);
    if (control.matches('[data-choice-mode]')) {
      choice.mode = control.value;
      if (choice.mode === 'choose' && !choice.points.length) {
        const learned = learnedSet();
        choice.points = specIndex.subjectLeaves(deckSubjectId(deck)).filter((leaf) => learned.has(leaf));
      }
    } else if (control.matches('[data-choice-general]')) choice.general = control.checked;
    else {
      const ids = control.matches('[data-choice-topic]')
        ? [...element.querySelectorAll(`[data-topic-id="${CSS.escape(control.dataset.choiceTopic)}"] [data-choice-point]`)].map((box) => box.dataset.choicePoint)
        : [control.dataset.choicePoint];
      const chosen = new Set(choice.points);
      for (const leaf of ids) { if (control.checked) chosen.add(leaf); else chosen.delete(leaf); }
      choice.points = [...chosen];
      const topic = control.closest('[data-topic-id]')?.dataset.topicId;
      if (topic) openTopics.add(topic);
    }
    void changeChoice(deck, choice);
  });
  const offToggle = on(element, 'toggle', 'details.fc-topic', (event, details) => {
    if (details.open) openTopics.add(details.dataset.topicId);
    else openTopics.delete(details.dataset.topicId);
  }, { capture: true });
  const offChange = on(element, 'change', '[data-import-source], [data-topic], [data-spec-point], [data-card-status], [data-card-availability], [data-card-sort]', (event, control) => {
    if (control.matches('[data-import-source]')) setHtml($('[data-import-fields]', element), importFields(control.value));
    else if (control.matches('[data-topic]')) {
      clearTimeout(searchTimer);
      subdeckPath = control.value;
      page = 1;
      setHtml($('[data-manager-topics]', element), topicPanel());
      $('[data-topic]', element)?.focus({ preventScroll: true });
      void refreshCards();
    } else if (control.matches('[data-spec-point], [data-card-status], [data-card-availability], [data-card-sort]')) {
      clearTimeout(searchTimer);
      if (control.matches('[data-spec-point]')) specPoint = control.value;
      else if (control.matches('[data-card-status]')) cardStatus = control.value;
      else if (control.matches('[data-card-availability]')) availability = control.value;
      else cardSort = control.value;
      page = 1;
      void refreshCards();
    }
  });
  const offInput = on(element, 'input', '[data-search]', (event, control) => {
    query = control.value;
    page = 1;
    managerRequest++;
    managerStatus = 'loading';
    updateCardList();
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => { if (view === 'deck') void refreshCards(); }, 220);
  });
  const offImportInput = on(element, 'input', '[data-import-form] input, [data-import-form] textarea, [data-import-form] select', clearImportPreview);
  const offImportChange = on(element, 'change', '[data-import-form] input, [data-import-form] textarea, [data-import-form] select', clearImportPreview);
  const offSubmit = on(element, 'submit', '[data-import-form]', (event, form) => { event.preventDefault(); void previewImport(form); });
  const onKey = (event) => {
    if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey || event.repeat || view !== 'study' || !study?.card) return;
    if (event.target !== document.body && !element.contains(event.target)) return;
    if (event.target.closest?.('input, textarea, select, [contenteditable], audio, video')) return;
    if (!study.shown && event.code === 'Space' && !event.target.closest?.('button:not([data-action="show-answer"]), a')) { event.preventDefault(); showAnswer(); }
    else if (study.shown && ['1', '2', '3', '4'].includes(event.key)) { event.preventDefault(); rateStudy(Number(event.key)); }
  };
  document.addEventListener('keydown', onKey);
  draw();
  void loadDecks();
  return () => {
    disposed = true;
    importPreviewRequest?.abort();
    clearTimeout(queueTimer);
    clearTimeout(searchTimer);
    for (const url of mediaUrls) URL.revokeObjectURL(url);
    releaseDetachedMedia();
    mediaCache.clear();
    clearTimeout(applyTimer);
    offClick();
    offChoice();
    offToggle();
    offChange();
    offInput();
    offImportInput();
    offImportChange();
    offSubmit();
    document.removeEventListener('keydown', onKey);
  };
}
