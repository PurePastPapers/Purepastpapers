import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from '../config/supabase.config.js';
import { cloudAccountId } from '../data/api.js';
import { getClient } from '../data/adapters/supabase-adapter.js';

const rest = '/rest/v1/';
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const requiredAccount = 'Sign in with a cloud account to use private flashcard decks.';
const mediaTypes = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'audio/mpeg', 'audio/ogg', 'audio/wav', 'audio/mp4']);

export const hasCloudAccount = () => Boolean(cloudAccountId());

class FlashcardError extends Error {
  constructor(message, { status, code, retryable = false } = {}) {
    super(message);
    this.status = status;
    this.code = code;
    this.retryable = retryable;
  }
}

// Capture the session owner at the start of a workflow. Each request validates it
// again so switching accounts cannot publish a previous account's staged imports.
async function connection() {
  const owner = cloudAccountId();
  if (!owner) throw new FlashcardError(requiredAccount);
  const client = await getClient();
  async function request(path, { query, method = 'GET', body, preference } = {}) {
    const { data, error } = await client.auth.getSession();
    const session = data?.session;
    if (error || session?.user?.id !== owner || cloudAccountId() !== owner) {
      throw new FlashcardError('Your account changed. Sign in again to continue.', { status: 401 });
    }
    const url = new URL(path, SUPABASE_URL);
    if (query) url.search = new URLSearchParams(query);
    const headers = {
      apikey: SUPABASE_PUBLISHABLE_KEY,
      Authorization: `Bearer ${session.access_token}`,
    };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (preference) headers.Prefer = preference;
    let response;
    try {
      response = await fetch(url, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), cache: 'no-store' });
    } catch {
      throw new FlashcardError('Could not connect. Check your connection and retry.', { retryable: true });
    }
    if (cloudAccountId() !== owner) throw new FlashcardError('Your account changed. Open Flashcards again.', { status: 401 });
    const result = await response.json().catch(() => null);
    if (!response.ok) {
      let message = 'Flashcards could not save your changes. Please try again.';
      if (response.status === 401) message = 'Sign in again to use Flashcards.';
      if (response.status === 403 || result?.code === '42501') message = 'This deck or card is unavailable for your account.';
      if (result?.code === '23503') message = 'This item is linked to other cards or decks. Refresh and try again.';
      if (result?.code === '23514' || result?.code === '22023') message = 'Check the card content or deck settings and try again.';
      if (response.status === 413) message = 'This file or card is too large to upload.';
      throw new FlashcardError(message, {
        status: response.status,
        code: result?.code,
        retryable: response.status === 408 || response.status === 429 || response.status >= 500,
      });
    }
    return result;
  }
  return {
    owner,
    request,
    read: (table, query) => request(`${rest}${table}`, { query }),
    write: (table, method, body, query, preference = 'return=representation') =>
      request(`${rest}${table}`, { method, body, query, preference }),
    rpc: (name, body = {}) => request(`${rest}rpc/${name}`, { method: 'POST', body }),
  };
}

const eq = (value) => `eq.${value}`;
const record = (rows) => rows?.[0];
const selectId = (id) => ({ id: eq(id) });

async function readAll(db, table, query) {
  const pageSize = 200;
  const rows = [];
  for (let offset = 0; ; offset += pageSize) {
    const page = await db.read(table, { ...query, limit: pageSize, offset });
    rows.push(...page);
    if (page.length < pageSize) return rows;
  }
}

export async function listDecks() {
  if (!hasCloudAccount()) return [];
  const db = await connection();
  await db.rpc('flashcard_sync_catalogue_decks');
  return db.rpc('flashcard_list_decks');
}

export async function createDeck({ title, parent_id = null }) {
  const db = await connection();
  return record(await db.write('flashcard_decks', 'POST', {
    user_id: db.owner, title: title.trim(), parent_id,
  }));
}

export async function updateDeck(id, { title, target_retention, new_limit, parent_id }) {
  const db = await connection();
  if (parent_id !== undefined) await checkParent(db, id, parent_id);
  return record(await db.write('flashcard_decks', 'PATCH', {
    title: title?.trim(), retention: target_retention, new_limit, parent_id,
  }, selectId(id)));
}

async function checkParent(db, id, parentId) {
  const decks = await db.rpc('flashcard_list_decks');
  const byId = new Map(decks.map((deck) => [deck.id, deck]));
  const seen = new Set([id]);
  for (let parent = parentId; parent; parent = byId.get(parent)?.parent_id) {
    if (seen.has(parent) || !byId.has(parent) || byId.get(parent).catalogue_id) {
      throw new FlashcardError('Choose a parent deck outside this deck’s own hierarchy.');
    }
    seen.add(parent);
  }
}

export async function deleteDeck(id) {
  return (await connection()).rpc('flashcard_delete_deck', { p_deck_id: id });
}

export async function listCards(deckId) {
  return readAll(await connection(), 'flashcard_visible_cards', {
    deck_id: eq(deckId), order: 'created_at.asc,id.asc',
    select: 'id,note_id,deck_id,variant,suspended,type,front,back,tags,revision,state,due_at,subdeck_path',
  });
}

export async function saveNote({ id = null, deck_id, type, front, back, tags, confirm_remove = false }) {
  const db = await connection();
  let variants = type === 'cloze'
    ? [...new Set(Array.from(front.matchAll(/\{\{c([1-9]\d{0,3})::[\s\S]+?\}\}/g), (match) => `cloze:${match[1]}`))]
    : type === 'reverse' ? ['forward', 'reverse'] : ['forward'];
  if (id && type !== 'cloze') {
    const existing = await db.read('flashcard_visible_cards', { note_id: eq(id), select: 'variant', limit: 100 });
    variants = existing.map((card) => card.variant);
  }
  if (!variants.length) throw new FlashcardError('Add a valid cloze deletion or reload the card.');
  return db.rpc('flashcard_save_note', {
    p_note_id: id, p_deck_id: deck_id, p_type: type, p_front: front, p_back: back,
    p_tags: [...new Set(tags)], p_variants: variants, p_confirm_remove: confirm_remove,
  });
}

export async function updateCard(id, { deck_id, suspended }) {
  return record(await (await connection()).write('flashcard_cards', 'PATCH', { deck_id, suspended }, selectId(id)));
}

export async function deleteCard(id) {
  return (await connection()).rpc('flashcard_delete_card', { p_card_id: id });
}

export async function deleteNote(id) {
  return (await connection()).write('flashcard_notes', 'DELETE', undefined, selectId(id));
}

export async function getStudyQueue(deckId, { subdeckPath = null } = {}) {
  const result = await (await connection()).rpc('flashcard_study_queue', {
    p_deck_id: deckId, p_subdeck_path: subdeckPath,
  });
  if (!result) throw new FlashcardError('This deck is unavailable. Return to My decks and refresh.');
  return result;
}

export async function setTopicSuspension(deckId, subdeckPath, suspended) {
  return (await connection()).rpc('flashcard_set_topic_suspension', {
    p_deck_id: deckId, p_subdeck_path: subdeckPath || null, p_suspended: suspended,
  });
}

export async function reviewCard(card, grade, requestId) {
  const result = await (await connection()).request('/functions/v1/flashcard-review', {
    method: 'POST',
    body: { cardId: card.id, revision: card.revision, grade, requestId },
  });
  if (result?.status === 'saved') return result;
  const messages = {
    conflict: 'This card was already rated in another session.',
    missing_or_moved: 'This card has moved. Reload its study queue.',
    settings_changed: 'The deck settings changed. Show the answer and rate the card again.',
    suspended: 'This card is suspended.',
    not_due: 'This card is scheduled for later.',
    new_limit_reached: 'You reached this deck’s daily limit for new cards.',
  };
  throw new FlashcardError(messages[result?.status] || 'This card is no longer available.', { code: result?.status });
}

const hexLookup = Array.from({ length: 256 }, (_, byte) => byte.toString(16).padStart(2, '0'));
function hex(buffer) {
  const bytes = new Uint8Array(buffer);
  const output = [];
  for (let start = 0; start < bytes.length; start += 8192) {
    output.push(Array.from(bytes.subarray(start, start + 8192), (byte) => hexLookup[byte]).join(''));
  }
  return output.join('');
}

async function digest(value) {
  const bytes = typeof value === 'string' ? new TextEncoder().encode(value) : value;
  return hex(await crypto.subtle.digest('SHA-256', bytes));
}

function uuidFromHash(hash) {
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-8${hash.slice(13, 16)}-a${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
}

export async function readMedia(id) {
  if (!uuid.test(id)) throw new FlashcardError('Invalid media reference.');
  const db = await connection();
  const row = record(await db.read('flashcard_media', { id: eq(id), select: 'data,mime_type' }))
    ?? record(await db.rpc('flashcard_catalogue_media_content', { p_id: id }));
  if (!row || !mediaTypes.has(row.mime_type) || typeof row.data !== 'string' || !row.data.startsWith('\\x')) {
    throw new FlashcardError('This media is unavailable.');
  }
  const value = row.data.slice(2);
  const data = new Uint8Array(value.length / 2);
  for (let index = 0; index < data.length; index++) data[index] = parseInt(value.slice(index * 2, index * 2 + 2), 16);
  return URL.createObjectURL(new Blob([data], { type: row.mime_type }));
}

const preparedImports = new WeakMap();

function prepareImport(deckId, parsed) {
  let targets = preparedImports.get(parsed);
  if (!targets) { targets = new Map(); preparedImports.set(parsed, targets); }
  if (!targets.has(deckId)) {
    targets.set(deckId, (async () => {
      const notes = await Promise.all(parsed.notes.map(async (note) => ({
        ...note,
        key: await digest(note.key ?? JSON.stringify([note.type, note.front, note.back])),
        cards: await Promise.all(note.cards.map(async (card) => ({
          variant: card.variant,
          deck: card.deck || '',
          suspended: card.suspended === true,
          sourceKey: await digest(card.sourceKey || JSON.stringify([note.type, note.front, note.back, card.variant])),
        }))),
      })));
      const allKeys = notes.flatMap((note) => note.cards.map((card) => card.sourceKey));
      const fingerprint = await digest(JSON.stringify([deckId, ...allKeys, ...notes.map((note) => [note.front, note.back, note.tags, note.cards.map((card) => card.deck)])]));
      return { notes, allKeys, fingerprint };
    })());
  }
  return targets.get(deckId);
}

async function countDuplicates(db, allKeys) {
  const unique = [...new Set(allKeys)];
  let duplicates = allKeys.length - unique.length;
  for (let start = 0; start < unique.length; start += 5000) {
    duplicates += await db.rpc('flashcard_count_existing_sources', { p_source_keys: unique.slice(start, start + 5000) });
  }
  return duplicates;
}

export async function previewImport(deckId, parsed) {
  const db = await connection();
  const { allKeys } = await prepareImport(deckId, parsed);
  const duplicates = await countDuplicates(db, allKeys);
  return { accepted: allKeys.length - duplicates, duplicates };
}

async function uploadMedia(db, batchId, media, onProgress) {
  const references = new Map();
  let count = 0;
  for (const [name, blob] of media || []) {
    if (!mediaTypes.has(blob.type) || !blob.size || blob.size > 10 * 1024 * 1024) continue;
    const bytes = await blob.arrayBuffer();
    const source = await digest(`${blob.type}:${await digest(bytes)}`);
    let row = record(await db.read('flashcard_media', { source_key: eq(source), select: 'id' }));
    if (!row) {
      row = record(await db.write('flashcard_media', 'POST', {
        user_id: db.owner, source_key: source, mime_type: blob.type,
        data: `\\x${hex(bytes)}`, import_id: batchId,
      }, { select: 'id', on_conflict: 'user_id,source_key' }, 'resolution=ignore-duplicates,return=representation'));
      row ??= record(await db.read('flashcard_media', { source_key: eq(source), select: 'id' }));
    }
    if (!row) throw new FlashcardError('A media upload could not be confirmed. Please retry.');
    references.set(name, row.id);
    onProgress?.(`Uploading media (${++count}/${media.size})…`);
  }
  return references;
}

function storedMedia(content, references) {
  if (!content?.includes('data-flashcard-name')) return content || '';
  const template = document.createElement('template');
  template.innerHTML = content;
  for (const node of template.content.querySelectorAll('img[data-flashcard-name],audio[data-flashcard-name]')) {
    const id = references.get(node.dataset.flashcardName);
    if (!id) {
      node.replaceWith(document.createTextNode(node.localName === 'img' ? '[Image unavailable]' : '[Audio unavailable]'));
    } else if (node.localName === 'audio') {
      node.replaceWith(document.createTextNode(`[sound:media:${id}]`));
    } else {
      node.removeAttribute('data-flashcard-name');
      node.setAttribute('src', `media:${id}`);
    }
  }
  return template.innerHTML;
}

function importDecks(db, batchId, rootId, decks) {
  const children = new Map(decks.map((deck) => [JSON.stringify([deck.parent_id, deck.title]), deck.id]));
  const paths = new Map([['', rootId]]);
  async function deckFor(path) {
    if (paths.has(path)) return paths.get(path);
    const names = path.split('::').map((name) => name.trim()).filter(Boolean);
    let parent = rootId;
    for (const title of names) {
      const part = title.slice(0, 200);
      const key = JSON.stringify([parent, part]);
      let child = children.get(key);
      if (!child) {
        child = uuidFromHash(await digest(JSON.stringify([batchId, parent, part])));
        await db.write('flashcard_decks', 'POST', {
          id: child, user_id: db.owner, title: part, parent_id: parent, import_id: batchId,
        }, { on_conflict: 'id' }, 'resolution=ignore-duplicates,return=minimal');
        children.set(key, child);
      }
      parent = child;
    }
    paths.set(path, parent);
    return parent;
  }
  return deckFor;
}

export async function commitImport(deckId, parsed, { onProgress } = {}) {
  const db = await connection();
  const prepared = await prepareImport(deckId, parsed);
  // Batch ids are derived from the file so an interrupted upload resumes in the same
  // batch. A finished batch is reused only while all of its cards still exist; if the
  // student deleted some, the next attempt id stages just the missing cards.
  let batchId;
  for (let attempt = 0; ; attempt++) {
    if (attempt >= 50) throw new FlashcardError('This file has been imported too many times. Edit it or import into another deck.');
    batchId = uuidFromHash(await digest(attempt ? `${db.owner}:${prepared.fingerprint}:${attempt}` : `${db.owner}:${prepared.fingerprint}`));
    const started = await db.rpc('flashcard_begin_import', { p_batch_id: batchId });
    if (started?.status === 'active_batch') {
      throw new FlashcardError('Another import is unfinished. Open its original file to finish it or cancel it from Import.');
    }
    if (started?.status !== 'complete') break;
    if (await countDuplicates(db, prepared.allKeys) < prepared.allKeys.length) continue;
    // Everything is already saved, for example after a lost confirmation: report that batch.
    const result = await db.rpc('flashcard_finish_import', { p_batch_id: batchId });
    return { imported: result.accepted, duplicates: Math.max(0, prepared.allKeys.length - result.accepted) };
  }

  const decks = await db.rpc('flashcard_list_decks');
  const deckFor = importDecks(db, batchId, deckId, decks.filter((deck) => !deck.catalogue_id));
  const references = await uploadMedia(db, batchId, parsed.media, onProgress);
  let done = 0;
  let chunk = [];
  let chunkSize = 0;
  async function flush() {
    if (!chunk.length) return;
    await db.rpc('flashcard_import_chunk', { p_batch_id: batchId, p_notes: chunk });
    done += chunk.reduce((count, note) => count + note.cards.length, 0);
    onProgress?.({ done, total: prepared.allKeys.length });
    chunk = [];
    chunkSize = 0;
  }
  for (const note of prepared.notes) {
    const cards = [];
    for (const { deck, ...card } of note.cards) cards.push({ ...card, deckId: await deckFor(deck) });
    const row = { key: note.key, type: note.type, front: storedMedia(note.front, references), back: storedMedia(note.back, references), tags: note.tags, cards };
    const size = new TextEncoder().encode(JSON.stringify(row)).length;
    if (chunk.length >= 100 || chunkSize + size > 1_500_000) await flush();
    chunk.push(row);
    chunkSize += size;
  }
  await flush();
  onProgress?.('Publishing your cards…');
  const result = await db.rpc('flashcard_finish_import', { p_batch_id: batchId });
  const imported = result?.accepted;
  if (!Number.isSafeInteger(imported)) throw new FlashcardError('The import could not be confirmed. Retry this preview to check.');
  return { imported, duplicates: Math.max(0, prepared.allKeys.length - imported) };
}

export async function cancelImport() {
  return (await connection()).rpc('flashcard_cancel_import');
}

const subjectLabels = {
  EDX_ALEVEL_BIOL_9BN0: 'Biology',
  EDX_ALEVEL_PHYS_9PH0: 'Physics',
  EDX_ALEVEL_MATH_9MA0: 'Mathematics',
};

// The shared packages stay at their original download pages. Students can
// import those packages to a private deck using the same Anki workflow.
const sharedGcseDecks = [
  ['Biology', '377190157'],
  ['Chemistry', '526813556'],
  ['Physics', '642243480'],
].map(([subject, id]) => ({
  id: `ankiweb-${id}`,
  title: `GCSE ${subject} Triple Science`,
  subject,
  board: 'Edexcel',
  qualification: 'GCSE',
  deck_type: 'Shared deck',
  status: 'external',
  sourceUrl: `https://ankiweb.net/shared/info/${id}`,
  description: 'Paper 1 and Paper 2 from the original AnkiWeb author.',
}));

export async function listCatalogue() {
  if (!hasCloudAccount()) return { entries: sharedGcseDecks, schoolEligible: false };
  const catalogue = await (await connection()).rpc('flashcard_list_catalogue');
  return {
    ...catalogue,
    entries: [...catalogue.entries.filter((entry) => entry.status !== 'retired').map((entry) => ({
      ...entry,
      subject: subjectLabels[entry.subject_id] ?? entry.subject_id,
      board: entry.exam_board,
      deck_type: entry.deck_type === 'atomic' ? 'Atomic' : 'Mark scheme',
      available: entry.status === 'published',
      description: entry.deck_type === 'atomic' ? 'Short questions that test one idea at a time.' : 'Practise the wording and steps that earn marks.',
    })), ...sharedGcseDecks],
  };
}

export async function addCatalogueDeck(id) {
  const result = await (await connection()).rpc('flashcard_add_catalogue_deck', { p_catalogue_id: id });
  if (result?.status !== 'added') throw new FlashcardError('This catalogue deck is unavailable for your account.');
  return result;
}
