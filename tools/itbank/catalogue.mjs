import { readFile, writeFile } from 'node:fs/promises';
import { subjects } from '../seed/subjects.mjs';
import specs from '../seed/specs/alevel-humanities.mjs';

const id = 'OCR_L3_IT_AAQ';
const source = subjects.find(item => item.subject_id === id);
const root = new URL('../../', import.meta.url);
const read = async path => JSON.parse(await readFile(new URL(path, root), 'utf8'));
const save = (path, value) => writeFile(new URL(path, root), JSON.stringify(value, null, 2) + '\n');

const byUnit = {};
const sections = specs[id].map(section => {
  byUnit[section.key] = [];
  return {
    id: `OCR_L3IT_SEC_${section.key}`, title: section.title, note: section.note,
    topics: section.topics.map(([key, code, title, points]) => ({
      id: `OCR_L3IT_${key}`, code, title, kind: 'topic',
      points: points.map(point => {
        const [pointCode, pointTitle] = point.split('|');
        const pointId = `OCR_L3IT_${key}_${pointCode}`;
        byUnit[section.key].push(pointId);
        return { id: pointId, code: pointCode, title: pointTitle };
      }),
    })),
  };
});
await save(`data/specs/${id}.json`, {
  subject_id: id, sections,
  legacy_ids: Object.fromEntries(Object.entries(byUnit).map(([unit, points]) => [`OCR_L3IT_${unit}.1`, points])),
  point_order: Object.values(byUnit).flat(),
});

const registry = await read('data/subjects.json');
const record = registry.find(item => item.subject_id === id);
Object.assign(record, source, { has_catalogue: true });
// Preserve the registry's compact per-field formatting and all other records.
const registryPath = new URL('data/subjects.json', root);
const registryText = await readFile(registryPath, 'utf8');
const oldRecord = registryText.match(/  \{\n    "subject_id": "OCR_L3_IT_AAQ",[\s\S]*?\n  \}/)?.[0];
if (!oldRecord) throw new Error('Cannot locate the existing IT subject record');
await writeFile(registryPath, registryText.replace(oldRecord, JSON.stringify(record, null, 2).replace(/^/gm, '  ')));

const packIndexPath = new URL('data/packs/index.json', root);
let packIndexText = await readFile(packIndexPath, 'utf8');
for (const unit of Object.keys(byUnit)) {
  const file = `itbank/OCR_${unit}_SAMPLE.json`;
  const index = JSON.parse(packIndexText);
  if (index.packs.some(entry => entry.file === file)) continue;
  const entry = { file, subject_id: id, enabled: true };
  packIndexText = packIndexText.replace(/(\n  \]\s*\}\s*)$/, `,\n${JSON.stringify(entry, null, 2).replace(/^/gm, '    ')}$1`);
}
await writeFile(packIndexPath, packIndexText);

// Update only the two placeholder aliases. Other subjects can be imported concurrently.
const migrationsPath = new URL('js/config/spec-id-migrations.js', root);
let migrations = await readFile(migrationsPath, 'utf8');
for (const [unit, points] of Object.entries(byUnit)) {
  const oldId = `OCR_L3IT_${unit}.1`;
  const entry = JSON.stringify({[oldId]: points}, null, 2).slice(2, -2);
  const existing = new RegExp(`  "${oldId.replace('.', '\\.')}": \\[.*?\\n  \\]`, 's');
  migrations = existing.test(migrations)
    ? migrations.replace(existing, entry)
    : migrations.replace('Object.freeze({\n', `Object.freeze({\n${entry},\n`);
}
await writeFile(migrationsPath, migrations);
