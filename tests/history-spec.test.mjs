import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createSpecIndex} from '../js/engine/spec-index.js';
import {LEGACY_SPEC_IDS} from '../js/config/spec-id-migrations.js';

const spec = JSON.parse(readFileSync(new URL('../data/specs/EDX_ALEVEL_HIST_9HI0.json', import.meta.url), 'utf8'));
const leaves = spec.sections.flatMap(s => s.topics.flatMap(t => t.points));

test('History leaves are the official Route H content bullets for 1H, 2H.2 and option 33 only', () => {
  assert.equal(spec.official_source.sha256, 'fdb12503123b24101ba7b47c25d1199c39c17493e0aaee98740b03af17a17735');
  assert.deepEqual(spec.sections.map(s => s.code), ['1H', '2H.2', '33']);
  assert.deepEqual(spec.sections.map(s => s.topics.reduce((n, t) => n + t.points.length, 0)), [16, 16, 19]);
  assert.deepEqual(leaves.map(p => p.id), spec.point_order);
  assert(!JSON.stringify(spec.sections).includes('2H.1'));
  for (const p of leaves) assert(p.content.length > p.title.length - 1 && p.official_reference.source_pages.length, p.id);
});

test('earlier History ids that grouped several bullets migrate to all of them', () => {
  const index = createSpecIndex(); index.add(spec);
  const history = Object.entries(LEGACY_SPEC_IDS).filter(([id]) => id.startsWith('EDX_HIST_') && !id.startsWith('EDX_HIST_GCSE'));
  assert.equal(history.length, 10);
  for (const [, next] of history) assert(next.every(id => index.get(id)?.type === 'point'));
  assert.equal(LEGACY_SPEC_IDS['EDX_HIST_1H_INT_5.1'].length, 4);
  assert.equal(LEGACY_SPEC_IDS.EDX_HIST_33_D.length, 15);
});
