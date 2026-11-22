import { UnzipInflate, Unzip } from '../vendor/flashcards/fflate/index.mjs';
import { Decompress as ZstdDecompress } from '../vendor/flashcards/fzstd/index.mjs';

export const IMPORT_LIMITS = Object.freeze({
  compressedBytes: 100 * 1024 * 1024,
  expandedBytes: 250 * 1024 * 1024,
  databaseBytes: 180 * 1024 * 1024,
  mediaFileBytes: 10 * 1024 * 1024,
  totalMediaBytes: 64 * 1024 * 1024,
  mediaFiles: 500,
  rows: 10_000
});

const normalizedNote = (key, front, back, tags = [], card = {}) => ({
  key: String(key), type: 'basic', front, back, tags,
  cards: [{ variant: 'forward', sourceKey: String(card.sourceKey ?? `${key}:0`), ...(card.deck ? { deck: card.deck } : {}), ...(card.suspended ? { suspended: true } : {}) }]
});


function stableContentKey(prefix, front, back, deck = '') {
  const source = `${front.length}:${front}${back.length}:${back}${deck.length}:${deck}`;
  let hash = 14695981039346656037n;
  for (const char of source) {
    hash ^= BigInt(char.codePointAt(0));
    hash = BigInt.asUintN(64, hash * 1099511628211n);
  }
  return `${prefix}:${hash.toString(16)}-${front.length}-${back.length}`;
}

function parseDelimitedRows(text, delimiter) {
  const rows = [];
  let row = [], field = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (quoted) {
      if (char === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (char === '"') quoted = false;
      else field += char;
    } else if (char === '"' && field === '') quoted = true;
    else if (char === delimiter) { row.push(field); field = ''; }
    else if (char === '\n' || char === '\r') {
      if (char === '\r' && text[i + 1] === '\n') i++;
      row.push(field); rows.push(row); row = []; field = '';
    } else field += char;
  }
  if (quoted) throw new Error('A quoted field is missing its closing quote.');
  if (field || row.length) { row.push(field); rows.push(row); }
  return rows;
}

export function parseCsv(text, mapping = {}) {
  const errors = [];
  const warnings = [];
  if (typeof text !== 'string') throw new TypeError('CSV input must be text.');
  if (text.length > 10 * 1024 * 1024) throw new Error('CSV files must be smaller than 10 MB.');
  const delimiter = mapping.delimiter ?? ',';
  if (![';', ',', '\t'].includes(delimiter)) throw new Error('Choose comma, semicolon or tab as the delimiter.');
  let rows;
  try { rows = parseDelimitedRows(text.replace(/^\uFEFF/, ''), delimiter); }
  catch (error) { return { notes: [], errors: [{ row: 1, reason: error.message }], warnings }; }
  const header = mapping.header !== false;
  const column = { front: mapping.front, back: mapping.back, tags: mapping.tags, deck: mapping.deck };
  let start = 0;
  if (header && rows.length) {
    const names = rows[0].map(value => value.trim().toLowerCase());
    for (const key of Object.keys(column)) {
      if (column[key] === undefined) {
        const found = names.findIndex(name => (key === 'front' ? ['front', 'question', 'term'].includes(name) : key === 'back' ? ['back', 'answer', 'definition'].includes(name) : name === key));
        if (found >= 0) column[key] = found;
      }
    }
    start = 1;
  }
  if (!Number.isInteger(column.front) || !Number.isInteger(column.back)) {
    return { notes: [], errors: [{ row: 1, reason: 'Choose a Front and a Back column.' }], warnings };
  }
  const notes = [];
  for (let index = start; index < rows.length; index++) {
    const values = rows[index];
    if (values.every(value => !value.trim())) continue;
    if (notes.length >= IMPORT_LIMITS.rows) { warnings.push(`Only the first ${IMPORT_LIMITS.rows.toLocaleString()} rows are imported.`); break; }
    const front = values[column.front]?.trim();
    const back = values[column.back]?.trim();
    if (!front || !back) { errors.push({ row: index + 1, reason: !front && !back ? 'Front and Back are both empty.' : !front ? 'Front is empty.' : 'Back is empty.' }); continue; }
    const deck = Number.isInteger(column.deck) ? values[column.deck]?.trim() : '';
    const id = stableContentKey('csv', front, back, deck);
    const tags = Number.isInteger(column.tags) ? (values[column.tags] ?? '').split(/[ ,]+/).filter(Boolean) : [];
    notes.push(normalizedNote(id, front, back, tags, { deck }));
  }
  return { source: 'csv', notes, errors, warnings };
}

export function parseQuizlet(text) {
  if (typeof text !== 'string') throw new TypeError('Quizlet export must be text.');
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/);
  const notes = [], errors = [], warnings = [];
  for (let i = 0; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    const splitAt = lines[i].indexOf('\t');
    if (splitAt < 0) { errors.push({ row: i + 1, reason: 'Expected a term and definition separated by a tab.' }); continue; }
    const front = lines[i].slice(0, splitAt).trim(), back = lines[i].slice(splitAt + 1).trim();
    if (!front || !back) { errors.push({ row: i + 1, reason: 'Term and definition must both contain text.' }); continue; }
    notes.push(normalizedNote(stableContentKey('quizlet', front, back), front, back));
    if (notes.length >= IMPORT_LIMITS.rows) { warnings.push(`Only the first ${IMPORT_LIMITS.rows.toLocaleString()} rows are imported.`); break; }
  }
  return { source: 'quizlet', notes, errors, warnings };
}

const tableNames = db => new Set(db.exec("SELECT name FROM sqlite_master WHERE type='table'")[0]?.values.map(row => row[0]) ?? []);
const queryRows = (db, query) => {
  const result = db.exec(query)[0];
  if (!result) return [];
  return result.values.map(values => Object.fromEntries(result.columns.map((name, i) => [name, values[i]])));
};

function parseStoredJson(value, fallback = {}) {
  try {
    if (value instanceof Uint8Array) value = new TextDecoder().decode(value);
    return JSON.parse(value || '');
  } catch { return fallback; }
}

function protoVarintField(bytes, number) {
  return protobufFields(bytes).find(([field, value]) => field === number && typeof value === 'number')?.[1] ?? 0;
}

function protoStringField(bytes, number) {
  const value = protobufFields(bytes).find(([field, content]) => field === number && content instanceof Uint8Array)?.[1];
  return value ? new TextDecoder().decode(value) : '';
}

function readCollection(db) {
  const tables = tableNames(db);
  if (!tables.has('col') || !tables.has('notes') || !tables.has('cards')) throw new Error('This Anki package does not contain a supported collection database.');
  const col = queryRows(db, 'SELECT models, decks FROM col LIMIT 1')[0];
  const models = parseStoredJson(col?.models, {});
  const decks = parseStoredJson(col?.decks, {});
  const notes = queryRows(db, 'SELECT id, mid, flds, tags FROM notes');
  const cards = queryRows(db, 'SELECT id, nid, did, ord, queue FROM cards');
  if (Object.keys(models).length || !tables.has('notetypes')) return { models, decks, notes, cards, tables };

  const types = queryRows(db, 'SELECT id, name, config FROM notetypes');
  const fieldsByType = new Map();
  for (const field of queryRows(db, 'SELECT ntid, ord, name FROM fields ORDER BY ntid, ord')) {
    const fields = fieldsByType.get(String(field.ntid)) ?? [];
    fields.push({ name: field.name, ord: Number(field.ord) });
    fieldsByType.set(String(field.ntid), fields);
  }
  const templatesByType = new Map();
  for (const row of queryRows(db, 'SELECT ntid, ord, name, config FROM templates ORDER BY ntid, ord')) {
    const config = parseStoredJson(row.config, {});
    const templates = templatesByType.get(String(row.ntid)) ?? [];
    templates.push({
      name: row.name,
      qfmt: config.q_format ?? config.qfmt ?? (row.config instanceof Uint8Array ? protoStringField(row.config, 1) : ''),
      afmt: config.a_format ?? config.afmt ?? (row.config instanceof Uint8Array ? protoStringField(row.config, 2) : '')
    });
    templatesByType.set(String(row.ntid), templates);
  }
  for (const type of types) {
    const config = parseStoredJson(type.config, {});
    models[type.id] = {
      id: Number(type.id), name: type.name,
      type: Number(config.kind ?? (type.config instanceof Uint8Array ? protoVarintField(type.config, 1) : 0)),
      flds: fieldsByType.get(String(type.id)) ?? [],
      tmpls: templatesByType.get(String(type.id)) ?? []
    };
  }
  if (tables.has('decks')) {
    for (const deck of queryRows(db, 'SELECT id, name FROM decks')) decks[deck.id] = { id: Number(deck.id), name: deck.name };
  }
  return { models, decks, notes, cards, tables };
}


function readVarint(bytes, offset) {
  let value = 0n, shift = 0n;
  while (offset < bytes.length && shift < 70n) {
    const byte = bytes[offset++];
    value |= BigInt(byte & 0x7f) << shift;
    if (!(byte & 0x80)) return [Number(value), offset];
    shift += 7n;
  }
  throw new Error('The Anki media index protobuf is invalid.');
}

function protobufFields(bytes) {
  const fields = [];
  for (let offset = 0; offset < bytes.length;) {
    let tag;
    [tag, offset] = readVarint(bytes, offset);
    const number = tag >>> 3, wire = tag & 7;
    if (!number || wire === 3 || wire === 4 || wire > 5) throw new Error('The Anki media index protobuf is invalid.');
    if (wire === 0) {
      let value; [value, offset] = readVarint(bytes, offset); fields.push([number, value]);
    } else if (wire === 2) {
      let length; [length, offset] = readVarint(bytes, offset);
      if (length < 0 || offset + length > bytes.length) throw new Error('The Anki media index protobuf is truncated.');
      fields.push([number, bytes.subarray(offset, offset + length)]); offset += length;
    } else {
      const skip = wire === 1 ? 8 : 4;
      if (offset + skip > bytes.length) throw new Error('The Anki media index protobuf is truncated.');
      offset += skip;
    }
  }
  return fields;
}

function decodeModernMediaIndex(bytes) {
  const entries = [];
  for (const [field, nested] of protobufFields(bytes)) {
    if (field !== 1 || !(nested instanceof Uint8Array)) continue;
    let name = '', size = 0;
    for (const [number, value] of protobufFields(nested)) {
      if (number === 1 && value instanceof Uint8Array) name = new TextDecoder().decode(value);
      if (number === 2 && typeof value === 'number') size = value;
    }
    if (!name || !Number.isSafeInteger(size)) throw new Error('The Anki media index contains an invalid entry.');
    entries.push({ name, size });
    if (entries.length > IMPORT_LIMITS.mediaFiles) throw new Error('The package contains too many media files.');
  }
  return entries;
}

function decompressZstd(bytes, limit) {
  const chunks = [];
  let size = 0;
  let overflow = false;
  const decoder = new ZstdDecompress((chunk) => {
    size += chunk.byteLength;
    if (size > limit) { overflow = true; throw new Error('The expanded Anki collection exceeds the safe import size.'); }
    chunks.push(chunk);
  });
  try {
    for (let offset = 0; offset < bytes.length; offset += 64 * 1024) decoder.push(bytes.subarray(offset, Math.min(bytes.length, offset + 64 * 1024)), offset + 64 * 1024 >= bytes.length);
  } catch (error) {
    if (overflow) throw error;
    throw new Error('The Anki collection uses an unsupported or damaged Zstandard stream.');
  }
  const output = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { output.set(chunk, offset); offset += chunk.byteLength; }
  return output;
}

function modelFields(model, rawFields) {
  const names = Array.isArray(model?.flds) ? model.flds.map(field => field.name) : [];
  const fields = rawFields.split('\x1f');
  return Object.fromEntries(fields.map((value, i) => [names[i] || `Field${i + 1}`, value]));
}

function escapeRegex(text) { return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
function replaceTemplate(template, fields) {
  let value = String(template ?? '');
  for (const [name, text] of Object.entries(fields)) {
    const regex = new RegExp(`{{(?:[^{}:]+:)*${escapeRegex(name)}(?:\\:\\w+)?}}`, 'gi');
    value = value.replace(regex, text);
  }
  value = value.replace(/{{#([\w -]+)}}([\s\S]*?){{\/\1}}/g, (_all, name, body) => fields[name] ? body : '');
  value = value.replace(/{{\^([\w -]+)}}([\s\S]*?){{\/\1}}/g, (_all, name, body) => fields[name] ? '' : body);
  return value.replace(/{{[^{}]+}}/g, '');
}

function renderCloze(text, ordinal, reveal = false) {
  const expression = /{{c(\d+)::([\s\S]*?)(?:::(.*?))?}}/g;
  return String(text).replace(expression, (match, number, answer, hint = '') => Number(number) === ordinal ? (reveal ? answer : `<span class="cloze">${hint || '[...]'}</span>`) : answer);
}

function mediaMimeType(name) {
  const extension = String(name).toLowerCase().split('.').pop();
  return ({
    png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp',
    mp3: 'audio/mpeg', ogg: 'audio/ogg', oga: 'audio/ogg', wav: 'audio/wav', m4a: 'audio/mp4', mp4: 'audio/mp4'
  })[extension] ?? '';
}

function safeMediaName(name) {
  const cleaned = String(name).replace(/\\/g, '/').split('/').pop().replace(/[^\w.() -]/g, '_').slice(0, 120);
  return cleaned && cleaned !== '.' && cleaned !== '..' ? cleaned : null;
}

export function sanitizeImportedHtml(input, mediaNames = new Set()) {
  let html = String(input ?? '');
  html = html.replace(/<(script|style|iframe|object|embed|form|input|button|textarea|video|audio|svg|math)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, '');
  html = html.replace(/<(script|style|iframe|object|embed|form|input|button|textarea|video|audio|svg|math)\b[^>]*\/?\s*>/gi, '');
  html = html.replace(/\s+on[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '');
  html = html.replace(/\s+style\s*=\s*("[^"]*"|'[^']*')/gi, (_match, quoted) => /url\s*\(|expression\s*\(|javascript:/i.test(quoted) ? '' : ` style=${quoted}`);
  html = html.replace(/\s+(href|src|xlink:href)\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/gi, (whole, attribute, _quoted, doubleValue, singleValue, bareValue) => {
    const value = doubleValue ?? singleValue ?? bareValue ?? '';
    const name = safeMediaName(value);
    if (attribute.toLowerCase() === 'src' && name && mediaNames.has(name)) return ` data-flashcard-name="${name}"`;
    if (attribute.toLowerCase() === 'href' && /^(https?:|mailto:)/i.test(value)) return ` href="${value.replace(/["<>]/g, '')}" rel="noreferrer"`;
    return '';
  });
  html = html.replace(/\[sound:([^\]]+)\]/gi, (_match, rawName) => {
    const name = safeMediaName(rawName);
    return name && mediaNames.has(name) ? `<audio data-flashcard-name="${name}" controls></audio>` : '';
  });
  return html;
}

function noteTags(rawTags) { return String(rawTags ?? '').trim().split(/\s+/).filter(Boolean); }
function deckName(decks, id) { return decks?.[id]?.name || ''; }

function normalizeAnki(collection, mediaNames, warnings) {
  const cardsByNote = new Map();
  for (const card of collection.cards) {
    const list = cardsByNote.get(String(card.nid)) ?? [];
    list.push(card); cardsByNote.set(String(card.nid), list);
  }
  const normalized = [];
  let unsupported = 0;
  const missingMedia = new Set();
  for (const sourceNote of collection.notes) {
    const model = collection.models?.[sourceNote.mid];
    if (!model) { unsupported++; continue; }
    const rawFields = modelFields(model, sourceNote.flds);
    for (const value of Object.values(rawFields)) {
      for (const match of String(value).matchAll(/<img\b[^>]*\bsrc\s*=\s*['"]([^'"]+)/gi)) { const name = safeMediaName(match[1]); if (name && !mediaNames.has(name)) missingMedia.add(name); }
      for (const match of String(value).matchAll(/\[sound:([^\]]+)\]/gi)) { const name = safeMediaName(match[1]); if (name && !mediaNames.has(name)) missingMedia.add(name); }
    }
    const fields = Object.fromEntries(Object.entries(rawFields).map(([key, value]) => [key, sanitizeImportedHtml(value, mediaNames)]));
    const templates = Array.isArray(model.tmpls) ? model.tmpls : [];
    const sourceCards = (cardsByNote.get(String(sourceNote.id)) ?? []).sort((a, b) => Number(a.ord) - Number(b.ord));
    const modelName = String(model.name ?? '').toLowerCase();
    const isImageOcclusion = modelName.includes('image occlusion');
    const isCloze = !isImageOcclusion && (modelName.includes('cloze') || model.type === 1);
    const isStockBasic = modelName.includes('basic') && !/type in the answer|image occlusion/i.test(modelName);
    const fieldsForCustom = ['Front', 'Question', 'Term'].find(name => fields[name] !== undefined);
    const answerForCustom = ['Back', 'Answer', 'Definition', 'FullCreditResponse'].find(name => fields[name] !== undefined);
    const hasSimpleCustomPair = !isImageOcclusion && !isCloze && !isStockBasic && templates.length === 1 && fieldsForCustom && answerForCustom;
    if (!isCloze && !isStockBasic && !hasSimpleCustomPair) { unsupported += (cardsByNote.get(String(sourceNote.id)) ?? []).length || 1; continue; }
    const tags = noteTags(sourceNote.tags);
    const fieldValues = Object.values(fields);
    const promptField = isCloze ? 'Text' : isStockBasic ? 'Front' : fieldsForCustom;
    const answerField = isCloze ? 'Extra' : isStockBasic ? 'Back' : answerForCustom;
    const mediaMarkup = ['QuestionMedia', 'Media'].map(name => fields[name]).filter(value => /data-flashcard-name=|<img\b|<audio\b/i.test(value ?? '')).join('<br>');
    const markSchemeExtra = hasSimpleCustomPair && /mark.?scheme/i.test(modelName)
      ? ['MarkingPoints', 'CommonTrap'].filter(name => fields[name]?.trim()).map(name => `<p><strong>${name === 'MarkingPoints' ? 'Marking points' : 'Common trap'}</strong></p>${fields[name]}`).join('')
      : '';
    const noteFront = isCloze ? (fields[promptField] ?? fieldValues[0] ?? '') : `${fields[promptField] ?? ''}${mediaMarkup ? `<br>${mediaMarkup}` : ''}`;
    const noteBack = isCloze ? (fields[answerField] ?? '') : `${fields[answerField] ?? ''}${markSchemeExtra}`;
    const note = { key: `anki-note:${sourceNote.id}`, type: isCloze ? 'cloze' : 'basic', front: noteFront, back: noteBack, tags, cards: [] };
    for (const card of sourceCards) {
      const template = templates[isCloze ? 0 : card.ord];
      if (!template) { unsupported++; continue; }
      const cardKey = `anki-card:${card.id}`;
      const deck = deckName(collection.decks, card.did);
      const isSuspended = Number(card.queue) === -1;
      let front, back, variant;
      if (isCloze) {
        const ordinal = Number(card.ord) + 1;
        const clozeField = Object.entries(fields).find(([, value]) => new RegExp(`{{c${ordinal}::`, 'i').test(value));
        if (!clozeField) { unsupported++; continue; }
        front = renderCloze(clozeField[1], ordinal, false);
        back = fields.Extra ?? '';
        variant = `cloze:${ordinal}`;
      } else {
        const usesBackAsFront = /{{(?:[^{}:]+:)*Back(?:}}|:)/i.test(template.qfmt ?? '') && !/{{(?:[^{}:]+:)*Front(?:}}|:)/i.test(template.qfmt ?? '');
        const reversed = Number(card.ord) > 0 && (/reverse/i.test(modelName + ' ' + template.name) || usesBackAsFront);
        if (reversed && fields.Back !== undefined && fields.Front !== undefined) {
          front = fields.Back; back = fields.Front; variant = 'reverse';
        } else {
          front = noteFront;
          back = noteBack;
          variant = Number(card.ord) === 0 ? 'forward' : `card:${card.ord + 1}`;
        }
      }
      if (!front.trim()) { unsupported++; continue; }
      note.cards.push({ variant, front, back, sourceKey: cardKey, ...(deck ? { deck } : {}), ...(isSuspended ? { suspended: true } : {}) });
    }
    if (note.cards.length) normalized.push(note);
  }
  if (missingMedia.size) warnings.push(`${missingMedia.size} referenced media file(s) were missing and their placeholders were removed.`);
  if (unsupported) warnings.push(`${unsupported} cards or notes use unsupported templates or missing fields and were skipped.`);
  if (normalized.some(note => note.type === 'basic') && normalized.some(note => note.type === 'cloze')) warnings.push('Basic, reverse and cloze notes are represented as reviewable cards. Custom note types may be skipped.');
  return normalized;
}

async function streamZip(file, onProgress) {
  const entries = new Map();
  const media = new Map();
  const rawMedia = new Map();
  const omittedMedia = new Set();
  let expanded = 0, mediaCount = 0, mediaBytes = 0, failure;
  const unzip = new Unzip(stream => {
    const name = stream.name;
    if (name.includes('..') || name.startsWith('/') || name.includes('\\')) { failure = new Error('The package contains an unsafe file path.'); stream.terminate(); return; }
    const database = /^collection\.anki(?:2|21|21b)$/i.test(name);
    const mediaIndex = name === 'media';
    const metadataEntry = name === 'meta';
    const mediaEntry = !database && !mediaIndex && !metadataEntry;
    const chunks = [];
    let size = 0;
    stream.ondata = (error, chunk, final) => {
      if (error) { failure = error; return; }
      size += chunk.length; expanded += chunk.length;
      if (expanded > IMPORT_LIMITS.expandedBytes || database && size > IMPORT_LIMITS.databaseBytes) {
        failure = new Error('The expanded Anki package exceeds the safe import size.'); stream.terminate(); return;
      }
      if (mediaEntry && size > IMPORT_LIMITS.mediaFileBytes) {
        omittedMedia.add(name); chunks.length = 0; stream.terminate(); return;
      }
      chunks.push(chunk);
      if (final) {
        const bytes = new Uint8Array(size); let offset = 0;
        for (const part of chunks) { bytes.set(part, offset); offset += part.length; }
        if (database || mediaIndex || metadataEntry) entries.set(name, bytes);
        else if (mediaEntry) {
          if (++mediaCount > IMPORT_LIMITS.mediaFiles) omittedMedia.add(name);
          else rawMedia.set(name, bytes);
        }
        onProgress?.({ loaded: expanded, total: Math.max(file.size || 0, 1) });
      }
    };
    stream.start();
  });
  unzip.register(UnzipInflate);
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (bytes.byteLength > IMPORT_LIMITS.compressedBytes) throw new Error('Anki packages must be smaller than 100 MB.');
  for (let offset = 0; offset < bytes.length; offset += 64 * 1024) {
    unzip.push(bytes.subarray(offset, Math.min(bytes.length, offset + 64 * 1024)), offset + 64 * 1024 >= bytes.length);
    if (failure) throw failure;
  }
  if (failure) throw failure;
  const latestFormat = entries.has('collection.anki21b');
  let mediaIndex = {};
  let modernMediaEntries = [];
  try {
    if (entries.has('media')) {
      if (latestFormat) modernMediaEntries = decodeModernMediaIndex(decompressZstd(entries.get('media'), 5 * 1024 * 1024));
      else mediaIndex = JSON.parse(new TextDecoder().decode(entries.get('media')));
    }
  } catch (error) { throw error instanceof Error && /Zstandard/.test(error.message) ? error : new Error('The Anki media index is invalid or unsupported.'); }
  const expectedMedia = latestFormat ? modernMediaEntries.map((entry, index) => [String(index), entry.name, entry.size]) : Object.entries(mediaIndex).map(([index, name]) => [index, name, null]);
  for (const [archiveName, originalName, expectedSize] of expectedMedia) {
    const packed = rawMedia.get(archiveName);
    if (!packed) { media.delete(safeMediaName(originalName)); omittedMedia.add(originalName); continue; }
    let bytes;
    try { bytes = latestFormat ? decompressZstd(packed, IMPORT_LIMITS.mediaFileBytes) : packed; }
    catch (error) { if (/safe import size/.test(error.message)) { omittedMedia.add(originalName); continue; } throw error; }
    if (expectedSize !== null && expectedSize !== bytes.byteLength) throw new Error(`Anki media file ${originalName} failed its size check.`);
    const safe = safeMediaName(originalName);
    const mimeType = mediaMimeType(safe ?? originalName);
    if (!mimeType) { omittedMedia.add(originalName); continue; }
    if (mediaBytes + bytes.byteLength > IMPORT_LIMITS.totalMediaBytes) { omittedMedia.add(originalName); continue; }
    mediaBytes += bytes.byteLength;
    if (safe && !media.has(safe)) media.set(safe, new Blob([bytes], { type: mimeType }));
    else if (safe) throw new Error('The package contains duplicate media filenames.');
  }
  return { entries, media, omittedMedia };
}

let sqlPromise;
async function loadSqlJs() {
  if (!sqlPromise) {
    if (typeof process !== 'undefined' && process.versions?.node) {
      const { createRequire } = await import('node:module');
      const initialize = createRequire(import.meta.url)('../vendor/flashcards/sql-wasm-node.cjs');
      sqlPromise = initialize({ locateFile: name => new URL(`../vendor/flashcards/${name}`, import.meta.url).pathname });
    } else {
      const module = await import('../vendor/flashcards/sql-wasm.js');
      sqlPromise = module.default({ locateFile: name => new URL(`../vendor/flashcards/${name}`, import.meta.url).href });
    }
  }
  return sqlPromise;
}

export async function parseAnkiPackage(file, { onProgress, initializeSql } = {}) {
  if (!file || typeof file.arrayBuffer !== 'function') throw new TypeError('Choose an Anki .apkg file.');
  if (file.size > IMPORT_LIMITS.compressedBytes) throw new Error('Anki packages must be smaller than 100 MB.');
  const { entries, media, omittedMedia } = await streamZip(file, onProgress);
  const dbEntry = ['collection.anki21b', 'collection.anki21', 'collection.anki2'].find(name => entries.has(name));
  if (!dbEntry) throw new Error('No Anki collection database was found in this package.');
  const SQL = await (initializeSql ? initializeSql() : loadSqlJs());
  let db;
  try {
    const databaseBytes = dbEntry === 'collection.anki21b' ? decompressZstd(entries.get(dbEntry), IMPORT_LIMITS.databaseBytes) : entries.get(dbEntry);
    db = new SQL.Database(databaseBytes);
    const collection = readCollection(db);
    const warnings = [];
    if (dbEntry === 'collection.anki21b' || dbEntry === 'collection.anki21') warnings.push('The modern Anki collection format was read from its SQLite export.');
    if (collection.tables.has('revlog') && queryRows(db, 'SELECT id FROM revlog LIMIT 1').length) warnings.push('This package contains review history. Import will start a fresh FSRS schedule.');
    else warnings.push('No review history was found. Imported cards will start with a fresh FSRS schedule.');
    const notes = normalizeAnki(collection, new Set(media.keys()), warnings);
    const scheduling = collection.tables.has('revlog') && queryRows(db, 'SELECT id FROM revlog LIMIT 1').length > 0;
    if (omittedMedia.size) warnings.push(`${omittedMedia.size} media file(s) exceeded import limits and were left out. Cards remain importable, with missing media placeholders removed.`);
    return { source: 'anki', notes, decks: Object.values(collection.decks).map(deck => ({ name: deck.name })), media, warnings, scheduling, errors: [] };
  } finally { db?.close(); }
}
