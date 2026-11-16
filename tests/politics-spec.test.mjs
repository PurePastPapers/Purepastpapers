import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {LEGACY_SPEC_IDS} from '../js/config/spec-id-migrations.js';

const spec = JSON.parse(readFileSync(new URL('../data/specs/AQA_ALEVEL_POL_7152.json', import.meta.url), 'utf8'));
const leaves = spec.sections.flatMap(s => s.topics.flatMap(t => t.points));

test('Politics leaves are the 32 official AQA 7152 content sections, in specification order', () => {
  assert.equal(spec.official_source.sha256, '4c04788bde25edd5361da396f743943225ab5e8f8e198646ccb3a1fd76f37b68');
  assert.equal(leaves.length, 32);
  assert.deepEqual(leaves.map(p => p.id), spec.point_order);
  for (const p of leaves) {
    assert.equal(p.id, `AQA_POL_${p.code}`);
    assert.match(p.code, /^3\.[123]\.\d\.\d$/);
    assert(p.focus.length > 0 && p.official_reference.source_pages.length > 0, p.id);
  }
  assert.deepEqual(spec.sections.map(s => s.topics.reduce((n, t) => n + t.points.length, 0)), [10, 14, 8]);
});

test('every earlier Politics skill id migrates to official sections', () => {
  const ids = new Set(leaves.map(p => p.id));
  const politics = Object.entries(LEGACY_SPEC_IDS).filter(([id]) => id.startsWith('AQA_POL_'));
  assert.equal(politics.length, 31);
  for (const [, next] of politics) assert(next.length && next.every(id => ids.has(id)));
  assert.deepEqual(LEGACY_SPEC_IDS['AQA_POL_COMP_4.5'], ['AQA_POL_3.2.2.5', 'AQA_POL_3.2.2.6']);
});
