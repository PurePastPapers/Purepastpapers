import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createSpecIndex } from '../js/engine/spec-index.js';
import {
  createTagMapper, describeSets, countInPlay, generalCount, cardsPerPoint, selectionRequest, isSpecTag,
} from '../js/flashcards/spec-map.js';

const index = createSpecIndex();
for (const id of ['AQA_ALEVEL_PSYCH_7182', 'AQA_ALEVEL_SOC_7192', 'EDX_ALEVEL_BIOL_9BN0', 'EDX_ALEVEL_PHYS_9PH0', 'EDX_ALEVEL_MATH_9MA0']) {
  index.add(JSON.parse(readFileSync(new URL(`../data/specs/${id}.json`, import.meta.url), 'utf8')));
}

test('catalogue spec tags map to the site spec points', () => {
  const psych = createTagMapper('AQA_ALEVEL_PSYCH_7182', index);
  assert.deepEqual(psych('PPP::Spec::AQA_PSYCH_4.1.1_b01'), ['AQA_PSYCH_4.1.1_b1']);
  const soc = createTagMapper('AQA_ALEVEL_SOC_7192', index);
  assert.deepEqual(soc('PPP::Spec::AQA_SOC_4.1.1_b03'), ['AQA_SOC_4.1.1_b3']);
  const bio = createTagMapper('EDX_ALEVEL_BIOL_9BN0', index);
  assert.deepEqual(bio('spec::1.4::ii'), ['EDX_BIOL_OFF_T1_1.4']);
  assert.deepEqual(bio('spec::1.10'), ['EDX_BIOL_OFF_T1_1.10']);
  const phys = createTagMapper('EDX_ALEVEL_PHYS_9PH0', index);
  assert.deepEqual(phys('spec::002'), ['EDX_PHYS_S002']);
  const maths = createTagMapper('EDX_ALEVEL_MATH_9MA0', index);
  assert.deepEqual(maths('spec::1.1'), ['EDX_MATH_PURE_PROOF_1.1']);
});

test('exam skills tags and other tags match nothing', () => {
  const bio = createTagMapper('EDX_ALEVEL_BIOL_9BN0', index);
  for (const tag of ['spec::appendix7', 'spec::cp::01', 'audit_purity::DirectSpec', 'topic::1']) assert.deepEqual(bio(tag), [], tag);
  assert.equal(isSpecTag('spec::1.1'), true);
  assert.equal(isSpecTag('audit_purity::DirectSpec'), false);
  // A tag from another subject never maps.
  assert.deepEqual(createTagMapper('EDX_ALEVEL_BIOL_9BN0', index)('PPP::Spec::AQA_PSYCH_4.1.1_b01'), []);
});

test('only what I have learnt counts and selects the right cards', () => {
  const bio = createTagMapper('EDX_ALEVEL_BIOL_9BN0', index);
  const sets = describeSets([
    { tags: ['spec::1.1'], cards: 10, active: 0, optional: false },
    { tags: ['spec::1.1', 'spec::5.1'], cards: 4, active: 0, optional: false },
    { tags: ['spec::5.1'], cards: 6, active: 0, optional: false },
    { tags: ['spec::appendix7'], cards: 3, active: 0, optional: false },
    { tags: ['spec::1.1'], cards: 2, active: 0, optional: true },
  ], bio);
  const learned = new Set(['EDX_BIOL_OFF_T1_1.1']);
  const picked = (id) => learned.has(id);
  assert.equal(countInPlay(sets, { mode: 'learnt', general: true }, picked), 13);
  assert.equal(countInPlay(sets, { mode: 'learnt', general: false }, picked), 10);
  assert.equal(countInPlay(sets, { mode: 'all' }, picked), 25);
  assert.equal(generalCount(sets), 3);
  assert.equal(cardsPerPoint(sets).get('EDX_BIOL_OFF_T5_5.1'), 10);
  const request = selectionRequest(sets, bio, { mode: 'learnt', general: true }, picked);
  assert.deepEqual(request, { mapped: ['spec::1.1', 'spec::5.1'], allowed: ['spec::1.1'], general: true });
  assert.deepEqual(selectionRequest(sets, bio, { mode: 'all' }, picked), { mapped: null, allowed: null, general: true });
});
