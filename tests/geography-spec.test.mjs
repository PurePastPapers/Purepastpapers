import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {LEGACY_SPEC_IDS} from '../js/config/spec-id-migrations.js';

const spec = JSON.parse(readFileSync(new URL('../data/specs/AQA_ALEVEL_GEOG_7037.json', import.meta.url), 'utf8'));
const topics = spec.sections.flatMap(s => s.topics);
const leaves = topics.flatMap(t => t.points);

test('Geography leaves are the official AQA 7037 numbered content sections, in specification order', () => {
  assert.equal(spec.official_source.sha256, 'f7fac6d21e535784f1fb349797e4ee8501b4b885dbf264fa916386713b7fca72');
  assert.equal(spec.official_source.as_qualification.code, '7036');
  assert.equal(leaves.length, 83);
  assert.deepEqual(leaves.map(p => p.id), spec.point_order);
  assert.equal(new Set(leaves.map(p => p.id)).size, leaves.length);
  for (const p of leaves) {
    if (p.id === 'AQA_GEOG_AS_3.4') continue;
    assert.equal(p.id, `AQA_GEOG_${p.code}`);
    assert(typeof p.code === 'string' && p.content.length > 0 && p.official_reference.source_pages.length > 0, p.id);
  }
  // Printed codes are strings: 3.2.1.5 and 3.2.1.5.1 are distinct leaves.
  assert(leaves.some(p => p.code === '3.2.1.5') && leaves.some(p => p.code === '3.2.1.5.1'));
});

test('optional routes stay separate and scoped to their paper section', () => {
  const options = Object.fromEntries(topics.filter(t => t.kind === 'option').map(t => [t.code, t.route]));
  assert.deepEqual(Object.keys(options), ['3.1.2', '3.1.3', '3.1.4', '3.1.5', '3.1.6', '3.2.3', '3.2.4', '3.2.5']);
  assert.match(options['3.1.3'], /Paper 1 Section B/);
  assert.match(options['3.2.4'], /Paper 2 Section C/);
  assert.equal(topics.find(t => t.code === '3.2.2').kind, 'group'); // Changing places is compulsory
});

test('AS 7036 sections map onto matching A-level leaves; AS fieldwork keeps its own scope', () => {
  const ids = new Set(leaves.map(p => p.id));
  assert.equal(spec.as_section_map['3.1.2.4'], 'AQA_GEOG_3.1.3.4'); // AS coasts = A-level 3.1.3
  assert.equal(spec.as_section_map['3.3.1.3'], 'AQA_GEOG_3.1.5.3'); // AS hazards = A-level 3.1.5
  assert.equal(spec.as_section_map['3.4'], 'AQA_GEOG_AS_3.4');
  for (const id of Object.values(spec.as_section_map)) assert(ids.has(id), id);
  for (const p of leaves.filter(p => p.as_reference)) assert(p.as_reference.text_similarity >= 0.8, p.id);
});

test('every seeded Geography skill id migrates to official leaves', () => {
  const ids = new Set(leaves.map(p => p.id));
  const geography = Object.entries(LEGACY_SPEC_IDS).filter(([id]) => id.startsWith('AQA_GEOG_') && !ids.has(id));
  assert.equal(geography.length, 56);
  for (const [, next] of geography) assert(next.length && next.every(id => ids.has(id)));
  assert.deepEqual(LEGACY_SPEC_IDS['AQA_GEOG_GS_7.5'], ['AQA_GEOG_3.2.1.5', 'AQA_GEOG_3.2.1.5.1']);
});
