const DATABASE_NAME = 'purepastpapers-ink';
const DATABASE_VERSION = 1;
const RECORDS_STORE = 'responses';
const OUTBOX_STORE = 'outbox';
const MAX_RECORD_BYTES = 1_000_000;
const MAX_SECTIONS = 24;
const MAX_STROKES_PER_SECTION = 5_000;
const MAX_POINTS_PER_STROKE = 20_000;
const MAX_TOTAL_POINTS = 100_000;

function validId(value, name) {
  if (typeof value !== 'string' || value.length === 0 || value.length > 256 || value.includes('\u0000')) {
    throw new TypeError(`${name} must be a non-empty string of at most 256 characters.`);
  }
  return value;
}

function recordKey(ownerId, responseId, partId) {
  return `${ownerId}\u0000${responseId}\u0000${partId}`;
}

function sameAnswer(first, second) {
  return first.status === second.status && JSON.stringify(first.sections) === JSON.stringify(second.sections);
}

function storeConflict(records, key, record, conflictId = null) {
  const conflictKey = `${key}\u0000conflict\u0000${conflictId || crypto.randomUUID()}`;
  records.put({ key: conflictKey, record: { ...record, conflict: true, conflictId } });
}

function storedRecord(entry) {
  if (!entry) return null;
  const { record, key } = entry;
  if (!record.conflict) return record;
  if (key !== recordKey(record.ownerId, record.responseId, record.partId)) return { ...record, conflictKey: key };
  const { conflict, conflictId, conflictKey, conflictOfRevision, ...canonical } = record;
  return canonical;
}

function validateRecord(input, ownerId) {
  const responseId = validId(input?.responseId, 'responseId');
  const partId = validId(input?.partId, 'partId');
  if (!Array.isArray(input.sections) || input.sections.length === 0 || input.sections.length > MAX_SECTIONS) {
    throw new TypeError(`Ink must contain between 1 and ${MAX_SECTIONS} sections.`);
  }

  let totalPoints = 0;
  const sections = input.sections.map((section, sectionIndex) => {
    if (!section || typeof section !== 'object') throw new TypeError('Each ink section must be an object.');
    const id = validId(section.id || `section-${sectionIndex + 1}`, 'section id');
    const width = Number(section.width);
    const height = Number(section.height);
    if (!Number.isFinite(width) || width <= 0 || width > 100_000 || !Number.isFinite(height) || height <= 0 || height > 100_000) {
      throw new TypeError('Ink section dimensions must be positive finite logical dimensions.');
    }
    if (!Array.isArray(section.strokes) || section.strokes.length > MAX_STROKES_PER_SECTION) {
      throw new TypeError(`A section may contain at most ${MAX_STROKES_PER_SECTION} strokes.`);
    }
    const strokes = section.strokes.map((stroke) => {
      if (!stroke || typeof stroke !== 'object' || !Array.isArray(stroke.points) || stroke.points.length === 0 || stroke.points.length > MAX_POINTS_PER_STROKE) {
        throw new TypeError(`Each stroke must contain between 1 and ${MAX_POINTS_PER_STROKE} points.`);
      }
      totalPoints += stroke.points.length;
      const color = String(stroke.color || '#111111');
      if (color.length > 64) throw new TypeError('Stroke colour is too long.');
      const lineWidth = Number(stroke.width);
      if (!Number.isFinite(lineWidth) || lineWidth <= 0 || lineWidth > 256) throw new TypeError('Stroke width is invalid.');
      const points = stroke.points.map((point) => {
        const x = Number(point?.x);
        const y = Number(point?.y);
        const pressure = point?.pressure == null ? 0.5 : Number(point.pressure);
        if (!Number.isFinite(x) || !Number.isFinite(y) || x < 0 || y < 0 || x > width || y > height || !Number.isFinite(pressure) || pressure < 0 || pressure > 1) {
          throw new TypeError('Ink points must use finite logical coordinates inside their section.');
        }
        return { x, y, pressure };
      });
      const tool = stroke.tool || 'pen';
      if (tool !== 'pen' && tool !== 'eraser') throw new TypeError('Stroke tool must be pen or eraser.');
      return { id: validId(stroke.id || crypto.randomUUID(), 'stroke id'), color, width: lineWidth, tool, points };
    });
    return { id, width, height, strokes };
  });
  if (totalPoints > MAX_TOTAL_POINTS) throw new TypeError(`An answer may contain at most ${MAX_TOTAL_POINTS} points.`);

  const revision = Number(input.revision || 1);
  if (!Number.isSafeInteger(revision) || revision < 1) throw new TypeError('Ink revision must be a positive integer.');
  const status = input.status || 'saved';
  if (status !== 'draft' && status !== 'saved') throw new TypeError('Ink status must be draft or saved.');
  const updatedAt = typeof input.updatedAt === 'string' ? input.updatedAt : new Date().toISOString();
  const record = { schemaVersion: 1, ownerId, responseId, partId, revision, status, sections, updatedAt };
  if (input.cloudRevision != null) {
    const cloudRevision = Number(input.cloudRevision);
    if (!Number.isSafeInteger(cloudRevision) || cloudRevision < 1) throw new TypeError('Cloud revision must be a positive integer.');
    record.cloudRevision = cloudRevision;
  }
  if (Number.isSafeInteger(input.conflictOfRevision) && input.conflictOfRevision > 0) record.conflictOfRevision = input.conflictOfRevision;
  if (input.conflict === true) record.conflict = true;
  if (typeof input.conflictId === 'string') record.conflictId = input.conflictId;
  if (typeof input.conflictKey === 'string') record.conflictKey = input.conflictKey;
  if (new TextEncoder().encode(JSON.stringify(record)).byteLength > MAX_RECORD_BYTES) {
    throw new TypeError(`An ink answer may not exceed ${MAX_RECORD_BYTES} bytes.`);
  }
  return record;
}

function openDatabase() {
  if (!globalThis.indexedDB) return Promise.reject(new Error('This browser does not support local ink storage.'));
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(RECORDS_STORE)) db.createObjectStore(RECORDS_STORE, { keyPath: 'key' });
      if (!db.objectStoreNames.contains(OUTBOX_STORE)) db.createObjectStore(OUTBOX_STORE, { keyPath: 'key' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Could not open local ink storage.'));
    request.onblocked = () => reject(new Error('Local ink storage is busy in another tab. Close older PPP tabs and try again.'));
  });
}

function requestResult(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Local ink storage request failed.'));
  });
}

function transactionDone(transaction) {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = resolve;
    transaction.onabort = transaction.onerror = () => reject(transaction.error || new Error('Local ink storage transaction failed.'));
  });
}

export function createInkRepository(owner) {
  const ownerId = validId(typeof owner === 'string' ? owner : owner?.ownerId, 'ownerId');

  async function load(responseId, partId) {
    const db = await openDatabase();
    try {
      const transaction = db.transaction(RECORDS_STORE, 'readonly');
      const key = recordKey(ownerId, validId(responseId, 'responseId'), validId(partId, 'partId'));
      const stored = await requestResult(transaction.objectStore(RECORDS_STORE).get(key));
      await transactionDone(transaction);
      return storedRecord(stored);
    } finally { db.close(); }
  }

  async function save(input) {
    const record = validateRecord(input, ownerId);
    const key = recordKey(ownerId, record.responseId, record.partId);
    const db = await openDatabase();
    try {
      const transaction = db.transaction([RECORDS_STORE, OUTBOX_STORE], 'readwrite');
      const records = transaction.objectStore(RECORDS_STORE);
      const outbox = transaction.objectStore(OUTBOX_STORE);
      const previous = await requestResult(records.get(key));
      if (previous && sameAnswer(record, previous.record)) {
        await transactionDone(transaction);
        return storedRecord(previous);
      }
      const candidate = {
        ...record,
        revision: Math.max(record.revision, (previous?.record.revision || 0) + 1),
        cloudRevision: previous?.record.cloudRevision ?? record.cloudRevision,
        updatedAt: new Date().toISOString(),
      };
      if (previous && record.revision < previous.record.revision) {
        const conflict = { ...candidate, conflictOfRevision: previous.record.revision, conflict: true };
        storeConflict(records, key, conflict);
        await transactionDone(transaction);
        return conflict;
      }
      records.put({ key, record: candidate });
      if (ownerId !== 'guest') outbox.put({ key, record: candidate, queuedAt: candidate.updatedAt });
      await transactionDone(transaction);
      return candidate;
    } finally { db.close(); }
  }

  async function listByResponse(responseId) {
    const safeResponseId = validId(responseId, 'responseId');
    const db = await openDatabase();
    try {
      const transaction = db.transaction(RECORDS_STORE, 'readonly');
      const stored = await requestResult(transaction.objectStore(RECORDS_STORE).getAll());
      await transactionDone(transaction);
      return stored.filter((entry) => entry.record.ownerId === ownerId && entry.record.responseId === safeResponseId)
        .map(storedRecord);
    } finally { db.close(); }
  }

  async function remove(responseId, partId) {
    const safeResponseId = validId(responseId, 'responseId');
    const safePartId = validId(partId, 'partId');
    const db = await openDatabase();
    try {
      const transaction = db.transaction([RECORDS_STORE, OUTBOX_STORE], 'readwrite');
      for (const storeName of [RECORDS_STORE, OUTBOX_STORE]) {
        const store = transaction.objectStore(storeName);
        const entries = await requestResult(store.getAll());
        for (const entry of entries) {
          if (entry.record.ownerId === ownerId && entry.record.responseId === safeResponseId && entry.record.partId === safePartId) store.delete(entry.key);
        }
      }
      await transactionDone(transaction);
      return true;
    } finally { db.close(); }
  }

  async function listOutbox() {
    const db = await openDatabase();
    try {
      const transaction = db.transaction(OUTBOX_STORE, 'readonly');
      const entries = await requestResult(transaction.objectStore(OUTBOX_STORE).getAll());
      await transactionDone(transaction);
      return entries.filter((entry) => entry.record.ownerId === ownerId).map(({ key, record, queuedAt }) => ({ key, record, queuedAt }));
    } finally { db.close(); }
  }

  async function acknowledge(key, { localRevision = null, cloudRevision = null } = {}) {
    if (typeof key !== 'string' || !key.startsWith(`${ownerId}\u0000`)) throw new Error('Outbox record belongs to a different account.');
    const db = await openDatabase();
    try {
      const transaction = db.transaction([RECORDS_STORE, OUTBOX_STORE], 'readwrite');
      const outbox = transaction.objectStore(OUTBOX_STORE);
      const records = transaction.objectStore(RECORDS_STORE);
      const queued = await requestResult(outbox.get(key));
      if (!queued || localRevision == null || queued.record.revision === localRevision) {
        outbox.delete(key);
      } else {
        const latest = { ...queued.record, cloudRevision: Math.max(queued.record.cloudRevision || 0, cloudRevision || 0) || undefined };
        outbox.put({ ...queued, record: latest, queuedAt: new Date().toISOString() });
      }
      const stored = await requestResult(records.get(key));
      if (stored && (localRevision == null || stored.record.revision >= localRevision)) {
        const latest = { ...storedRecord(stored), cloudRevision: Math.max(stored.record.cloudRevision || 0, cloudRevision || 0) || undefined };
        records.put({ ...stored, record: latest });
      }
      await transactionDone(transaction);
    } finally { db.close(); }
  }

  async function preserveConflict(outboxEntry, conflictId = null) {
    const sent = outboxEntry.record;
    const key = recordKey(ownerId, sent.responseId, sent.partId);
    if (outboxEntry.key !== key || sent.ownerId !== ownerId) throw new Error('Outbox record belongs to a different account.');
    const db = await openDatabase();
    try {
      const transaction = db.transaction([RECORDS_STORE, OUTBOX_STORE], 'readwrite');
      const records = transaction.objectStore(RECORDS_STORE);
      const outbox = transaction.objectStore(OUTBOX_STORE);
      const queued = await requestResult(outbox.get(key));
      if (queued?.record.revision === sent.revision) outbox.delete(key);
      storeConflict(records, key, sent, conflictId);
      await transactionDone(transaction);
    } finally { db.close(); }
  }

  async function resolveConflict(responseId, partId, selected, { useConflict, cloudRevision = null, alreadySynced = false } = {}) {
    const safeResponseId = validId(responseId, 'responseId');
    const safePartId = validId(partId, 'partId');
    const canonicalKey = recordKey(ownerId, safeResponseId, safePartId);
    const db = await openDatabase();
    try {
      const transaction = db.transaction([RECORDS_STORE, OUTBOX_STORE], 'readwrite');
      const records = transaction.objectStore(RECORDS_STORE);
      const outbox = transaction.objectStore(OUTBOX_STORE);
      const all = await requestResult(records.getAll());
      const selectedEntries = all.filter((entry) => entry.record.ownerId === ownerId
        && entry.record.responseId === safeResponseId && entry.record.partId === safePartId
        && entry.key !== canonicalKey && entry.record.conflict
        && ((selected?.conflictId && entry.record.conflictId === selected.conflictId)
          || (selected?.conflictKey && entry.key === selected.conflictKey)
          || (selected && sameAnswer(entry.record, selected))));
      const currentEntry = await requestResult(records.get(canonicalKey));
      const selectedRecord = selectedEntries[0]?.record || (selected?.responseId === safeResponseId && selected?.partId === safePartId ? selected : null);
      if (useConflict && !selectedRecord) throw new Error('That handwriting conflict is no longer available. Reload and choose again.');
      let chosen = useConflict ? selectedRecord : storedRecord(currentEntry);
      if (!chosen) throw new Error('The current handwritten answer is unavailable.');

      for (const entry of selectedEntries) records.delete(entry.key);
      if (useConflict) {
        const canonicalInput = {
          ...chosen,
          ownerId,
          responseId: safeResponseId,
          partId: safePartId,
          revision: (currentEntry?.record.revision || 0) + 1,
          cloudRevision: cloudRevision ?? chosen.cloudRevision,
        };
        delete canonicalInput.conflict;
        delete canonicalInput.conflictId;
        delete canonicalInput.conflictKey;
        delete canonicalInput.conflictOfRevision;
        chosen = validateRecord(canonicalInput, ownerId);
        records.put({ key: canonicalKey, record: chosen });
        if (alreadySynced) outbox.delete(canonicalKey);
        else if (ownerId !== 'guest') outbox.put({ key: canonicalKey, record: chosen, queuedAt: new Date().toISOString() });
      }
      await transactionDone(transaction);
      return { record: chosen, conflictRemoved: selectedEntries.length > 0 };
    } finally { db.close(); }
  }

  return { ownerId, load, save, listByResponse, remove, listOutbox, acknowledge, preserveConflict, resolveConflict };
}

async function mergeCloudRecord(ownerId, input) {
  if (input.ownerId !== ownerId) throw new Error('Synced handwriting belongs to a different account.');
  const record = validateRecord(input, ownerId);
  const key = recordKey(ownerId, record.responseId, record.partId);
  const db = await openDatabase();
  try {
    const transaction = db.transaction([RECORDS_STORE, OUTBOX_STORE], 'readwrite');
    const records = transaction.objectStore(RECORDS_STORE);
    const outbox = transaction.objectStore(OUTBOX_STORE);
    const existing = await requestResult(records.get(key));
    const queued = await requestResult(outbox.get(key));
    if (record.conflict) {
      storeConflict(records, key, record, record.conflictId);
    } else if (!existing) {
      records.put({ key, record });
    } else if ((record.cloudRevision ?? record.revision) >= (existing.record.cloudRevision ?? 0)) {
      const cloudRevision = record.cloudRevision ?? record.revision;
      const identical = sameAnswer(record, existing.record);
      if (identical) {
        records.put({ key, record: { ...storedRecord(existing), cloudRevision } });
        if (queued) outbox.delete(key);
      } else if (queued && cloudRevision > (queued.record.cloudRevision ?? 0)) {
        // A concurrent cloud edit diverged from this draft's base. Keep both copies.
        storeConflict(records, key, existing.record);
        outbox.delete(key);
        records.put({ key, record: { ...record, cloudRevision, revision: existing.record.revision + 1 } });
      } else if (!queued && cloudRevision > (existing.record.cloudRevision ?? 0)) {
        records.put({ key, record: { ...record, cloudRevision, revision: existing.record.revision + 1 } });
      }
    }
    await transactionDone(transaction);
  } finally { db.close(); }
}

/** Uploads queued answers one at a time and preserves newer strokes written during an upload. */
export async function syncInkOutbox(owner, adapter) {
  const ownerId = validId(typeof owner === 'string' ? owner : owner?.ownerId, 'ownerId');
  if (ownerId === 'guest') return { synced: 0, conflicts: 0, failed: 0 };
  if (!adapter?.saveInkResponse) throw new TypeError('A cloud adapter with saveInkResponse is required.');
  const repository = createInkRepository(ownerId);
  const queued = await repository.listOutbox();
  const result = { synced: 0, conflicts: 0, failed: 0 };
  for (const entry of queued) {
    const expectedRevision = entry.record.cloudRevision ?? null;
    const cloudRecord = {
      ...entry.record,
      ownerId,
      revision: (expectedRevision || 0) + 1,
    };
    try {
      const saved = await adapter.saveInkResponse(ownerId, cloudRecord, expectedRevision);
      if (saved?.status === 'conflict') {
        await repository.preserveConflict(entry, saved.conflict_id || null);
        result.conflicts += 1;
        continue;
      }
      if (saved?.status !== 'saved' || !Number.isSafeInteger(saved.revision)) throw new Error('The cloud returned an invalid handwriting save result.');
      await repository.acknowledge(entry.key, { localRevision: entry.record.revision, cloudRevision: saved.revision });
      result.synced += 1;
    } catch {
      result.failed += 1;
    }
  }
  return result;
}

/** Loads account ink while preserving unsynced local edits and storing divergent copies. */
export async function loadSyncedInk(owner, responseId, partId, adapter) {
  const ownerId = validId(typeof owner === 'string' ? owner : owner?.ownerId, 'ownerId');
  const safeResponseId = validId(responseId, 'responseId');
  const safePartId = validId(partId, 'partId');
  const repository = createInkRepository(ownerId);
  if (ownerId !== 'guest') {
    if (!adapter?.loadInkResponses) throw new TypeError('A cloud adapter with loadInkResponses is required.');
    const remoteRecords = await adapter.loadInkResponses(ownerId, safeResponseId);
    for (const record of remoteRecords) {
      if (record.responseId === safeResponseId && record.partId === safePartId) await mergeCloudRecord(ownerId, record);
    }
  }
  const records = await repository.listByResponse(safeResponseId);
  return {
    record: await repository.load(safeResponseId, safePartId),
    conflicts: records.filter((record) => record.partId === safePartId && record.conflict && record.conflictKey),
  };
}

/** Resolves one divergent copy while retaining every unrelated conflict and checking cloud revisions. */
export async function resolveInkConflict(owner, responseId, partId, conflict, { useConflict }, adapter = null) {
  const ownerId = validId(typeof owner === 'string' ? owner : owner?.ownerId, 'ownerId');
  const safeResponseId = validId(responseId, 'responseId');
  const safePartId = validId(partId, 'partId');
  if (!conflict || typeof conflict !== 'object' || typeof useConflict !== 'boolean') throw new TypeError('Choose which handwritten copy to keep.');
  const repository = createInkRepository(ownerId);
  if (ownerId !== 'guest' && adapter?.loadInkResponses) await loadSyncedInk(ownerId, safeResponseId, safePartId, adapter);
  const localCopies = await repository.listByResponse(safeResponseId);
  const localConflict = localCopies.find((entry) => entry.partId === safePartId && entry.conflict
    && ((conflict.conflictId && entry.conflictId === conflict.conflictId)
      || (conflict.conflictKey && entry.conflictKey === conflict.conflictKey)
      || JSON.stringify(entry.sections) === JSON.stringify(conflict.sections))) || conflict;
  let cloudRevision = null;
  let alreadySynced = false;

  if (ownerId !== 'guest' && adapter?.loadInkResponses && adapter?.saveInkResponse && useConflict) {
    const remote = await adapter.loadInkResponses(ownerId, safeResponseId);
    const current = remote.find((entry) => entry.partId === safePartId && !entry.conflict);
    const selected = remote.find((entry) => entry.partId === safePartId && entry.conflict
      && ((conflict.conflictId && entry.conflictId === conflict.conflictId)
        || JSON.stringify(entry.sections) === JSON.stringify(conflict.sections))) || localConflict;
    const expectedRevision = current?.cloudRevision ?? current?.revision ?? null;
    const candidate = {
      ...selected,
      ownerId,
      responseId: safeResponseId,
      partId: safePartId,
      revision: (expectedRevision || 0) + 1,
      ...(expectedRevision == null ? {} : { cloudRevision: expectedRevision }),
      conflict: false,
    };
    delete candidate.conflictId;
    delete candidate.conflictKey;
    delete candidate.conflictOfRevision;
    const saved = await adapter.saveInkResponse(ownerId, candidate, expectedRevision);
    if (saved?.status !== 'saved' || !Number.isSafeInteger(saved.revision)) {
      throw new Error('The cloud answer changed again. Reload the question and resolve the latest copies.');
    }
    cloudRevision = saved.revision;
    alreadySynced = true;
  }

  if (ownerId !== 'guest' && adapter?.deleteInkConflict && conflict.conflictId) {
    await adapter.deleteInkConflict(ownerId, conflict.conflictId);
  }
  return repository.resolveConflict(safeResponseId, safePartId, localConflict, { useConflict, cloudRevision, alreadySynced });
}

export async function exportInkOwnerData(owner) {
  const ownerId = validId(typeof owner === 'string' ? owner : owner?.ownerId, 'ownerId');
  const db = await openDatabase();
  try {
    const transaction = db.transaction(RECORDS_STORE, 'readonly');
    const entries = await requestResult(transaction.objectStore(RECORDS_STORE).getAll());
    await transactionDone(transaction);
    return {
      schemaVersion: 1,
      ownerId,
      records: entries.filter((entry) => entry.record.ownerId === ownerId).map(storedRecord),
    };
  } finally { db.close(); }
}

export async function importInkOwnerData(owner, payload) {
  const ownerId = validId(typeof owner === 'string' ? owner : owner?.ownerId, 'ownerId');
  if (!payload || payload.schemaVersion !== 1 || !Array.isArray(payload.records)) throw new TypeError('This file does not contain a supported handwriting backup.');
  if (payload.records.length > 10_000) throw new TypeError('The handwriting backup contains too many records.');
  const records = payload.records.map((input) => {
    // A backup is a copy of an answer, not authority to replace an account's cloud revision.
    const { cloudRevision, conflictId, conflictKey, ...record } = input;
    return validateRecord(record, ownerId);
  });
  const db = await openDatabase();
  try {
    const transaction = db.transaction([RECORDS_STORE, OUTBOX_STORE], 'readwrite');
    const recordStore = transaction.objectStore(RECORDS_STORE);
    const outboxStore = transaction.objectStore(OUTBOX_STORE);
    for (const record of records) {
      const key = recordKey(ownerId, record.responseId, record.partId);
      const existing = await requestResult(recordStore.get(key));
      if (record.conflict || (existing?.record && !sameAnswer(existing.record, record))) {
        storeConflict(recordStore, key, record);
        continue;
      }
      if (existing?.record) continue;
      recordStore.put({ key, record });
      if (ownerId !== 'guest') outboxStore.put({ key, record, queuedAt: new Date().toISOString() });
    }
    await transactionDone(transaction);
    return records.length;
  } finally { db.close(); }
}

export async function deleteInkOwnerData(owner) {
  const ownerId = validId(typeof owner === 'string' ? owner : owner?.ownerId, 'ownerId');
  const db = await openDatabase();
  try {
    const transaction = db.transaction([RECORDS_STORE, OUTBOX_STORE], 'readwrite');
    for (const storeName of [RECORDS_STORE, OUTBOX_STORE]) {
      const store = transaction.objectStore(storeName);
      const entries = await requestResult(store.getAll());
      for (const entry of entries) if (entry.record.ownerId === ownerId) store.delete(entry.key);
    }
    await transactionDone(transaction);
  } finally { db.close(); }
}

/** Restore only the guest answers associated with this sign-up, without replacing a current draft. */
export async function adoptGuestInk(ownerId, references = []) {
  if (!globalThis.indexedDB || !references.length) return;
  const guest = createInkRepository('guest');
  const records = [];
  for (const [responseId, partId] of references) {
    const record = await guest.load(responseId, partId);
    if (record) records.push(record);
  }
  if (records.length) await importInkOwnerData(ownerId, { schemaVersion: 1, records });
}
