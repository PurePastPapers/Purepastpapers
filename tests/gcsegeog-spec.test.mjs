import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {LEGACY_SPEC_IDS} from '../js/config/spec-id-migrations.js';

const spec = JSON.parse(readFileSync(new URL('../data/specs/AQA_GCSE_GEOG_8035.json', import.meta.url), 'utf8'));
const topics = spec.sections.flatMap(s => s.topics);
const leaves = topics.flatMap(t => t.points);
const ids = new Set(leaves.map(p => p.id));

test('GCSE Geography leaves are AQA key ideas, in specification order', () => {
  assert.equal(spec.official_source.sha256, '4563d2e6674402b6967055c393ad5d966e705cf8ab20ef7ec023f7bfbbf230b4');
  assert.equal(leaves.length, 56);
  assert.deepEqual(leaves.map(p => p.id), spec.point_order);
  assert.equal(ids.size, leaves.length);
  assert.deepEqual(spec.sections.map(s => s.title), ['Paper 1: Living with the physical environment', 'Paper 2: Challenges in the human environment', 'Paper 3: Geographical applications']);
  for (const p of leaves) assert(p.title.length > 3 && p.content.length && !/Key idea Specification content|Visit for the most/.test(p.content.join(' ')), p.id);
  assert.equal(leaves.filter(p => /^AQA_GCSE_GEOG_APP_7\.3\./.test(p.id)).length, 7);
});

test('earlier unverified leaf ids migrate to the key ideas they covered', () => {
  const old = Object.entries(LEGACY_SPEC_IDS).filter(([id]) => /^AQA_GCSE_GEOG_/.test(id));
  assert(old.length >= 25);
  for (const [, next] of old) assert(next.length && next.every(id => ids.has(id)));
  assert.deepEqual(LEGACY_SPEC_IDS['AQA_GCSE_GEOG_URBAN_4.1'], ['AQA_GCSE_GEOG_URBAN_4.k1', 'AQA_GCSE_GEOG_URBAN_4.k2']);
});
