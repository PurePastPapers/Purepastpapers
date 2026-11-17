import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {LEGACY_SPEC_IDS} from '../js/config/spec-id-migrations.js';

const spec = JSON.parse(readFileSync(new URL('../data/specs/OCR_ALEVEL_CS_H446.json', import.meta.url), 'utf8'));
const topics = spec.sections.flatMap(s => s.topics);
const leaves = topics.flatMap(t => t.points);
const ids = new Set(leaves.map(p => p.id));

test('Computer Science leaves are OCR H446 lettered content points, in specification order', () => {
  assert.equal(spec.official_source.sha256, '8551bc2636fa4d8718d97901b462b0642b4bb6148e06407f662c507750764a44');
  assert.equal(spec.official_source.as_qualification.code, 'H046');
  assert.equal(leaves.length, 113);
  assert.deepEqual(leaves.map(p => p.id), spec.point_order);
  assert.equal(ids.size, leaves.length);
  assert.deepEqual(topics.filter(t => !t.code.startsWith('AS')).map(t => t.code), ['1.1.1', '1.1.2', '1.1.3', '1.2.1', '1.2.2', '1.2.3', '1.2.4', '1.3.1', '1.3.2', '1.3.3', '1.3.4',
    '1.4.1', '1.4.2', '1.4.3', '1.5.1', '1.5.2', '2.1.1', '2.1.2', '2.1.3', '2.1.4', '2.1.5', '2.2.1', '2.2.2', '2.3.1']);
  for (const p of leaves) assert(typeof p.code === 'string' && p.content[0].length > 3 && !/Version|\s\d$/.test(p.content[0]), p.id);
  // Printed codes are strings: 1.4.1(j) exists and 1.5.2 is one unlettered paragraph.
  assert(ids.has('OCR_CS_1.4.1j') && ids.has('OCR_CS_1.5.2_whole'));
  assert.equal(leaves.find(p => p.id === 'OCR_CS_1.5.2_whole').code, '1.5.2');
});

test('AS H046 points map to matching A-level points; testing content stays AS-only', () => {
  const map = spec.as_section_map;
  assert.equal(Object.keys(map).length, 78); // every AS H046 lettered point
  assert.equal(map['1.3.1(a)'].leaf, 'OCR_CS_1.3.2a'); // AS Databases = A-level 1.3.2
  assert.equal(map['2.3.1(e)'].leaf, 'OCR_CS_1.4.2c'); // lead override, recorded
  assert(map['2.3.1(e)'].lead_override);
  assert.deepEqual(Object.entries(map).filter(([, v]) => v.as_only).map(([k]) => k), ['2.2.2(d)', '2.2.2(e)']);
  for (const v of Object.values(map)) assert(ids.has(v.leaf));
});

test('earlier topic-level skill ids migrate to all of their lettered points', () => {
  const cs = Object.entries(LEGACY_SPEC_IDS).filter(([id]) => /^OCR_CS_\d/.test(id));
  assert.equal(cs.length, 24);
  for (const [, next] of cs) assert(next.length && next.every(id => ids.has(id)));
  assert.deepEqual(LEGACY_SPEC_IDS['OCR_CS_1.1.2'], ['OCR_CS_1.1.2a', 'OCR_CS_1.1.2b', 'OCR_CS_1.1.2c']);
});
