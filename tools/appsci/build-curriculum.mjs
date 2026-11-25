// Build only the Applied Science curriculum file from the keyed seed record.
// This leaves unrelated generated subject and paper files untouched.
import { readFile, writeFile } from 'node:fs/promises';
import seed from '../seed/specs/alevel-humanities.mjs';

const subjectId = 'OCR_L3_APPSCI_AAQ';
const prefix = 'OCR_L3SCI';
const sections = (seed[subjectId] || []).map((source) => ({
  id: `${prefix}_SEC_${source.key}`,
  title: source.title,
  ...(source.note ? { note: source.note } : {}),
  topics: source.topics.map(([key, code, title, rawPoints]) => ({
    id: `${prefix}_${key}`,
    code,
    title,
    kind: 'topic',
    points: rawPoints.map((raw) => {
      const divider = raw.indexOf('|');
      const pointCode = raw.slice(0, divider);
      const pointTitle = raw.slice(divider + 1);
      const id = pointCode.startsWith(key) ? `${prefix}_${pointCode}` : `${prefix}_${key}_${pointCode}`;
      return { id, code: pointCode, title: pointTitle };
    }),
  })),
}));

const spec = {
  subject_id: subjectId,
  sections,
  practical_crosswalk: [
    { practical: '1', title: 'Light microscopy', point_id: 'OCR_L3SCI_B1.2.2' },
    { practical: '2', title: 'Sampling', point_id: 'OCR_L3SCI_B4.2.2' },
    { practical: '3', title: 'Volumetric analysis', point_id: 'OCR_L3SCI_C2.1.5' },
    { practical: '4', title: 'Investigating reaction rates', point_id: 'OCR_L3SCI_C4.1.2' },
    { practical: '5', title: 'Potential divider circuits', point_id: 'OCR_L3SCI_P1.1.6' },
    { practical: '6', title: 'Investigating motion', point_id: 'OCR_L3SCI_P2.1.6' },
  ],
};
const idsByUnit = Object.fromEntries(['F180', 'F181'].map((unit) => [unit,
  sections.filter((section) => section.id.includes(`_${unit}_`) || section.id.endsWith(`_${unit}`))
    .flatMap((section) => section.topics.flatMap((topic) => topic.points.map((point) => point.id))),
]));
spec.legacy_ids = {
  "OCR_L3SCI_F180.1": idsByUnit.F180,
  "OCR_L3SCI_F181.1": idsByUnit.F181,
};
const pointOrder = sections.flatMap((section) => section.topics.flatMap((topic) => topic.points.map((point) => point.id)));
spec.point_order = pointOrder;
const destination = new URL('../../data/specs/OCR_L3_APPSCI_AAQ.json', import.meta.url);
await writeFile(destination, `${JSON.stringify(spec, null, 2)}\n`);
console.log(`Wrote ${pointOrder.length} Applied Science learning points (${idsByUnit.F180.length} F180, ${idsByUnit.F181.length} F181).`);
