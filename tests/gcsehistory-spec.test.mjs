import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createSpecIndex} from '../js/engine/spec-index.js';
import {LEGACY_SPEC_IDS} from '../js/config/spec-id-migrations.js';

const read = path => JSON.parse(readFileSync(new URL('../' + path, import.meta.url), 'utf8'));
const spec = read('data/specs/EDX_GCSE_HIST_1HI0.json');
const leaves = spec.sections.flatMap(s => s.topics.flatMap(t => t.points));

test('GCSE History leaves are the official content bullets of options 10, B1 and 31 only (Pearson Issue 6, June 2024)', () => {
  assert.equal(spec.official_source.sha256, 'a5d760fd3856bf16cc724ca33794d7b57b0e1c5d41c9d792a3001629c0fe9c09');
  assert.equal(spec.official_source.issue, 'Issue 6');
  assert.deepEqual(spec.sections.map(s => s.code), ['10', 'B1', '31']);
  assert.deepEqual(spec.sections.map(s => s.topics.reduce((n, t) => n + t.points.length, 0)), [33, 27, 35]);
  assert.deepEqual(spec.sections.map(s => s.topics.map(t => t.points.length)), [[5, 6, 6, 6, 10], [9, 8, 10], [10, 7, 10, 8]]);
  assert.deepEqual(leaves.map(p => p.id), spec.point_order);
  assert.equal(new Set(spec.point_order).size, 95);
  for (const p of leaves) {
    assert(p.content.length > 10 && p.official_reference.source_pages.length && p.official_reference.strand, p.id);
    assert(!/Key topic|Pearson Edexcel|Specification –|●/.test(p.content + p.official_reference.strand_title), `bleed in ${p.id}`);
    assert(p.code.startsWith(spec.sections.find(s => s.topics.some(t => t.points.includes(p))).code + '.'), p.id);
  }
  // Whitechapel is the historic environment of option 10: strand 1 content, strand 2 sources.
  assert.equal(leaves.filter(p => p.id.startsWith('EDX_GCSE_HIST_CRIME_10.5.')).length, 10);
  assert(!JSON.stringify(spec).match(/Medicine in Britain|Elizabethan|Cold War|American West/) || /Elizabethan|Cold War|American West/.test(JSON.stringify(spec.scope)));
});

test('earlier grouped ids migrate to every bullet they covered, and nothing outside the three options remains', () => {
  const index = createSpecIndex(); index.add(spec);
  const old = Object.entries(LEGACY_SPEC_IDS).filter(([id]) => id.startsWith('EDX_GCSE_HIST_'));
  assert.equal(old.length, 12);
  for (const [, next] of old) assert(next.length && next.every(id => index.get(id)?.type === 'point'));
  assert.equal(LEGACY_SPEC_IDS['EDX_GCSE_HIST_CRIME_10.1'].length, 5);
  assert.equal(LEGACY_SPEC_IDS['EDX_GCSE_HIST_CRIME_10.5'].length, 10);
  assert.equal(LEGACY_SPEC_IDS['EDX_GCSE_HIST_NORMAN_B1.3'].length, 10);
  assert.equal(LEGACY_SPEC_IDS['EDX_GCSE_HIST_GERMANY_31.2'].length, 7);
  assert.equal(spec.scope.dropped_legacy_ids.length, 22);
  for (const id of spec.scope.dropped_legacy_ids) assert(!index.has(id), id);
});
