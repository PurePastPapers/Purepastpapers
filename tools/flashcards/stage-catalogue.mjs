// Prepare versioned catalogue SQL for a private administrative staging run.
// The generated files contain deck material. Keep the output outside the repo.
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseAnkiPackage } from '../../js/flashcards/import.js';

const [manifestPath, packagePath, outPath, format] = process.argv.slice(2);
const apiBatches = format === '--api-batches';
if (!manifestPath || !packagePath || !outPath) {
  throw new Error('Usage: node tools/flashcards/stage-catalogue.mjs manifest.json deck.apkg /private/staging/deck [--api-batches]');
}
const output = resolve(outPath);
const repo = fileURLToPath(new URL('../..', import.meta.url));
if (output === repo.slice(0, -1) || output.startsWith(repo.endsWith(sep) ? repo : repo + sep)) {
  throw new Error('Choose a private staging directory outside the repository.');
}

const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
const { catalogue_id: catalogue, subject_id: subject, qualification, deck_type: type, version, expected_cards: expected } = manifest;
if (![catalogue, subject, qualification, version].every((value) => typeof value === 'string' && value.trim()) ||
    !['atomic', 'mark_scheme'].includes(type) || !Number.isSafeInteger(expected) || expected < 1) {
  throw new Error('Provide catalogue_id, subject_id, qualification, deck_type, version and expected_cards.');
}

const packageBytes = await readFile(packagePath);
const digest = (value) => createHash('sha256').update(value).digest('hex');
const fileHash = digest(packageBytes);
if (manifest.sha256 && manifest.sha256 !== fileHash) throw new Error('The archive does not match the approved SHA-256.');
function stableUuid(value) {
  const hash = digest(value);
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-8${hash.slice(13, 16)}-a${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
}

const versionId = stableUuid(JSON.stringify([catalogue, version]));
const parsed = await parseAnkiPackage(new Blob([packageBytes]), { administrative: true });
const references = new Map();
const mediaRows = [];
for (const [name, blob] of parsed.media || []) {
  const bytes = Buffer.from(await blob.arrayBuffer());
  const id = stableUuid(JSON.stringify([catalogue, blob.type, digest(bytes)]));
  references.set(name, id);
  mediaRows.push({ id, bytes, type: blob.type });
}

function mediaReferences(content) {
  return (content || '').replace(/<(img|audio)\b([^>]*?)data-flashcard-name="([^"]+)"([^>]*)>(?:<\/audio>)?/gi,
    (_match, tag, before, name, after) => {
      const id = references.get(name);
      if (!id) throw new Error('A referenced media file could not be staged.');
      if (tag.toLowerCase() === 'audio') return `[sound:media:${id}]`;
      return `<img${before}src="media:${id}"${after}>`;
    });
}

const cardRows = parsed.notes.flatMap((note) => note.cards.map((card) => ({
  stable_key: card.sourceKey,
  front: mediaReferences(note.front),
  back: mediaReferences(note.back),
  note_type: note.type,
  variant: card.variant,
  tags: note.tags,
  suspended: card.suspended === true,
  subdeck_path: card.deck || '',
})));

if (cardRows.length !== expected || cardRows.some((card) => !card.stable_key) ||
    new Set(cardRows.map((card) => card.stable_key)).size !== cardRows.length) {
  throw new Error(`Parsed ${cardRows.length} unique-source candidates. The approved release expects ${expected} cards. Review the package compatibility before staging.`);
}

const literal = (value) => `'${String(value).replaceAll("'", "''")}'`;
const qCatalogue = literal(catalogue);
const qVersion = `${literal(versionId)}::uuid`;
await mkdir(output, { recursive: true, mode: 0o700 });
let fileNumber = 0;
let statements = [];
let size = 0;
async function flush() {
  if (!statements.length) return;
  const path = resolve(output, `${String(fileNumber++).padStart(3, '0')}-stage.sql`);
  await writeFile(path, `set standard_conforming_strings = on;\n${statements.join('\n')}\n`, { flag: 'wx', mode: 0o600 });
  statements = [];
  size = 0;
}
async function append(statement) {
  const bytes = Buffer.byteLength(statement);
  if (size + bytes > 640_000) await flush();
  statements.push(statement);
  size += bytes;
}

await append(`insert into public.flashcard_catalogue_versions (id,catalogue_id,version)
values (${qVersion},${qCatalogue},${literal(version)}) on conflict (id) do nothing;`);
await flush();

if (apiBatches) {
  let batch = { p_version_id: versionId, p_cards: [], p_media: [] };
  let batchBytes = 0;
  async function writeBatch() {
    if (!batchBytes) return;
    await writeFile(resolve(output, `${String(fileNumber++).padStart(3, '0')}-batch.json`),
      JSON.stringify(batch), { flag: 'wx', mode: 0o600 });
    batch = { p_version_id: versionId, p_cards: [], p_media: [] };
    batchBytes = 0;
  }
  async function addBatchItem(key, item) {
    const bytes = Buffer.byteLength(JSON.stringify(item));
    if (batchBytes + bytes > 850_000 || batch.p_cards.length >= 150 || batch.p_media.length >= 12) await writeBatch();
    batch[key].push(item);
    batchBytes += bytes;
  }
  for (const card of cardRows) await addBatchItem('p_cards', card);
  await writeBatch();
  for (const media of new Map(mediaRows.map((row) => [row.id, row])).values()) {
    for (let offset = 0; offset < media.bytes.length; offset += 260_000) {
      await addBatchItem('p_media', {
        id: media.id, mime_type: media.type, position: offset,
        base64: media.bytes.subarray(offset, offset + 260_000).toString('base64'),
      });
    }
  }
  await writeBatch();
} else {
  const rowColumns = 'stable_key text, front text, back text, note_type text, variant text, tags text[], suspended boolean, subdeck_path text';
  for (let index = 0; index < cardRows.length; index += 100) {
    const values = literal(JSON.stringify(cardRows.slice(index, index + 100)));
    await append(`with input as (select * from jsonb_to_recordset(${values}::jsonb) as r(${rowColumns})),
  inserted as (
    insert into public.flashcard_catalogue_items (catalogue_id,stable_key)
    select ${qCatalogue}, stable_key from input on conflict (catalogue_id,stable_key) do nothing
    returning id,stable_key
  ), items as (
    select id,stable_key from inserted
    union all select i.id,i.stable_key from public.flashcard_catalogue_items i
      join input r on r.stable_key=i.stable_key where i.catalogue_id=${qCatalogue}
  )
  insert into public.flashcard_catalogue_material(version_id,catalogue_id,catalogue_card_id,front,back,note_type,variant,tags,suspended,subdeck_path)
  select ${qVersion},${qCatalogue},i.id,r.front,r.back,r.note_type,r.variant,r.tags,r.suspended,r.subdeck_path
  from input r join items i using (stable_key)
  on conflict (version_id,catalogue_card_id) do nothing;`);
  }
  await flush();

  for (const media of new Map(mediaRows.map((row) => [row.id, row])).values()) {
    const id = literal(media.id);
    for (let offset = 0; offset < media.bytes.length; offset += 260_000) {
      const bytes = literal(media.bytes.subarray(offset, offset + 260_000).toString('base64'));
      const value = `decode(${bytes},'base64')`;
      if (offset === 0) {
        await append(`insert into public.flashcard_catalogue_media(id,catalogue_id,version_id,mime_type,data)
  values (${id},${qCatalogue},${qVersion},${literal(media.type)},${value}) on conflict (version_id,id) do nothing;`);
      } else {
        await append(`update public.flashcard_catalogue_media set data=data||${value}
  where version_id=${qVersion} and id=${id} and octet_length(data)=${offset};`);
      }
    }
  }
  await flush();
}
await writeFile(resolve(output, 'publish.sql'), `select public.flashcard_publish_catalogue(${qCatalogue},${qVersion},${literal(subject)},${literal(qualification)},${literal(type)},${expected});\n`, { flag: 'wx', mode: 0o600 });
console.log(JSON.stringify({ catalogue, versionId, cardCount: cardRows.length, suspended: cardRows.filter((row) => row.suspended).length,
  subdeckCount: new Set(cardRows.map((row) => row.subdeck_path).filter(Boolean)).size, mediaCount: references.size, stagingFiles: fileNumber,
  warnings: parsed.warnings }));
