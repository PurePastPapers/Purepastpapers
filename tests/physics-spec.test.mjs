import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createSpecIndex} from '../js/engine/spec-index.js';
import {LEGACY_SPEC_IDS} from '../js/config/spec-id-migrations.js';

const read = path => JSON.parse(readFileSync(new URL('../' + path, import.meta.url), 'utf8'));
const spec = read('data/specs/EDX_ALEVEL_PHYS_9PH0.json');
const leaves = spec.sections.flatMap(s => s.topics.flatMap(t => t.points));

test('Physics runtime leaves are exactly the 191 official Issue 3 statements, as strings', () => {
  assert.equal(spec.official_source.issue, 'Issue 3');
  assert.equal(leaves.length, 191);
  assert.deepEqual(leaves.map(p => p.code).sort((a, b) => a - b), Array.from({length: 191}, (_, i) => String(i + 1)));
  assert(leaves.every(p => typeof p.code === 'string' && p.id === `EDX_PHYS_S${p.code.padStart(3, '0')}`));
  assert.equal(spec.sections.length, 13);
  // AS content (Topics 1–5) is statements 1–96 and Year 12; the rest is Year 13.
  for (const p of leaves) assert.equal(p.introduced_year, Number(p.code) <= 96 ? 12 : 13);
  const index = createSpecIndex(); index.add(spec);
  assert.equal(index.subjectLeaves('EDX_ALEVEL_PHYS_9PH0').length, 191);
  assert.equal(index.subjectLeaves('EDX_ALEVEL_PHYS_9PH0')[156], 'EDX_PHYS_S157');
});

test('every earlier Physics skill id migrates to the official statements of its group', () => {
  const old = ['EDX_PHYS_M2_2.1', 'EDX_PHYS_M9_9.4', 'EDX_PHYS_M10_10.1'];
  assert.deepEqual(LEGACY_SPEC_IDS[old[0]], ['EDX_PHYS_S009', 'EDX_PHYS_S010', 'EDX_PHYS_S011']);
  assert.deepEqual(LEGACY_SPEC_IDS[old[1]], ['EDX_PHYS_S149', 'EDX_PHYS_S152']);
  // Black body radiation is Topic 9 in Issue 3; the kept group id now sits there.
  const thermo = spec.sections.find(s => s.code === 'Topic 9');
  assert(thermo.topics.some(t => t.id === old[2]));
  const index = createSpecIndex(); index.add(spec);
  for (const [id, statements] of Object.entries(LEGACY_SPEC_IDS)) {
    assert(statements.length && statements.every(s => index.get(s)?.type === 'point'), id);
    if (index.has(id)) assert.deepEqual([...index.expand([id])], statements);
  }
  assert.equal(Object.keys(LEGACY_SPEC_IDS).length, 65);
});
