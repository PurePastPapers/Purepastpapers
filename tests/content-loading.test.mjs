// How a subject's papers reach the page: only its own pack files are fetched, a dropped
// request is retried, and a pack that still cannot be fetched is reported instead of its
// papers silently disappearing.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { paperCodeLabel } from '../js/core/utils.js';

const read = (path) => JSON.parse(readFileSync(new URL(`../${path}`, import.meta.url), 'utf8'));
const GEOGRAPHY = 'AQA_ALEVEL_GEOG_7037';

/** A fresh copy of the loader reading /data from disk; `failures` maps a path fragment to how many times it fails. */
async function loader(failures = {}) {
  const requested = [];
  const remaining = { ...failures };
  globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
  globalThis.fetch = async (url) => {
    const path = fileURLToPath(url);
    requested.push(path.split('/data/')[1]);
    const failing = Object.keys(remaining).find((fragment) => path.includes(fragment) && remaining[fragment] > 0);
    if (failing) {
      remaining[failing] -= 1;
      return { ok: false, status: 503, json: async () => ({}) };
    }
    try {
      const text = readFileSync(path, 'utf8');
      return { ok: true, status: 200, json: async () => JSON.parse(text) };
    } catch {
      return { ok: false, status: 404, json: async () => ({}) };
    }
  };
  const repository = await import(`../js/data/content-repository.js?copy=${Math.random()}`);
  return { repository, requested };
}

const withQuestions = (bundle) => bundle.papers.filter((paper) => paper.question_ids.length);
const quietly = async (run) => {
  const warn = console.warn;
  console.warn = () => {};
  try { return await run(); } finally { console.warn = warn; }
};

test('every pack index entry names the one subject its records belong to', () => {
  for (const entry of read('data/packs/index.json').packs) {
    const pack = read(`data/packs/${entry.file}`);
    const subjects = new Set([...pack.papers, ...pack.questions].map((record) => record.subject_id));
    assert.deepEqual([...subjects], [entry.subject_id], entry.file);
  }
});

test('a subject fetches only its own packs', async () => {
  const { repository, requested } = await loader();
  const bundle = await repository.getBundle(GEOGRAPHY);
  const packs = requested.filter((path) => path.startsWith('packs/') && path !== 'packs/index.json');
  assert.equal(packs.length, 26);
  assert(packs.every((path) => path.startsWith('packs/geography/')), 'another subject’s pack was fetched');
  assert.equal(withQuestions(bundle).length, 26);
  assert.equal(bundle.questions.length, 605);
  assert.deepEqual(bundle.failedPacks, []);
});

test('a request that fails once is retried, so no paper goes missing', async () => {
  const { repository } = await loader({ 'packs/geography/AQA_7037_2024_JUNE_01.json': 1, 'packs/index.json': 1 });
  const bundle = await repository.getBundle(GEOGRAPHY);
  assert.deepEqual(bundle.failedPacks, []);
  assert(bundle.papersById.get('AQA_7037_2024_JUNE_01').question_ids.length > 0);
  assert.equal(withQuestions(bundle).length, 26);
});

test('a pack that cannot be fetched is reported, and the next read recovers it', async () => {
  const file = 'geography/AQA_7037_2024_JUNE_01.json';
  const { repository } = await loader({ [`packs/${file}`]: 2 });
  const first = await quietly(() => repository.getBundle(GEOGRAPHY));
  assert.deepEqual(first.failedPacks, [file]);
  assert.equal(withQuestions(first).length, 25);
  await new Promise((resolve) => setTimeout(resolve)); // let the incomplete bundle be dropped
  const second = await repository.getBundle(GEOGRAPHY);
  assert.deepEqual(second.failedPacks, []);
  assert.equal(withQuestions(second).length, 26);
  assert.equal(await repository.getBundle(GEOGRAPHY), second, 'a complete bundle is kept');
});

test('an unreachable pack index is reported rather than read as "no papers"', async () => {
  const { repository } = await loader({ 'packs/index.json': 2 });
  const first = await quietly(() => repository.getBundle(GEOGRAPHY));
  assert.deepEqual(first.failedPacks, ['index.json']);
  await new Promise((resolve) => setTimeout(resolve));
  const second = await repository.getBundle(GEOGRAPHY);
  assert.deepEqual(second.failedPacks, []);
  assert.equal(withQuestions(second).length, 26);
});

test('paper codes read as "Paper n" only where that is what the code means', () => {
  assert.equal(paperCodeLabel('P1'), 'Paper 1');
  assert.equal(paperCodeLabel('01'), 'Paper 1');
  assert.equal(paperCodeLabel('02'), 'Paper 2');
  assert.equal(paperCodeLabel('1H'), '1H');
  assert.equal(paperCodeLabel('21'), '21');
  assert.equal(paperCodeLabel(undefined), '');
});

test('a topic choice saved before a specification import still finds questions', async () => {
  const { currentFocus, filterQuestions } = await import('../js/engine/filter-engine.js');
  const { repository } = await loader();
  const bundle = await repository.getBundle(GEOGRAPHY);
  const { specIndex } = repository;
  const leaves = specIndex.subjectLeaves(GEOGRAPHY);
  // The Practice page's default criteria, with only the topic choice varying.
  const matching = (focus) =>
    filterQuestions(bundle.questions, { sourceTypes: ['real_past_paper'], focus, focusMode: 'any', focusScope: 'primary', selectionMode: 'crossover', learnedOnly: false }, { specIndex, learned: new Set(), latestAttempts: new Map(), papersById: bundle.papersById }).matches.length;

  // Seeded leaf ids from before the official 7037 tree: carried to the points that replaced them.
  const saved = ['AQA_GEOG_WC_1.1', 'AQA_GEOG_WC_1.2', 'AQA_GEOG_HD_2.1'];
  assert.equal(matching(saved), 0, 'the retired ids match nothing as saved');
  const carried = currentFocus(saved, leaves, specIndex);
  assert.deepEqual(carried, ['AQA_GEOG_3.1.1.1', 'AQA_GEOG_3.1.1.2', 'AQA_GEOG_3.1.2.1']);
  assert(matching(carried) > 0);
  assert.equal(matching(null), 605);

  // Ids with no current point are dropped; when none is left the restriction is lifted.
  assert.deepEqual(currentFocus(['AQA_GEOG_3.1.1.1', 'NO_SUCH_POINT'], leaves, specIndex), ['AQA_GEOG_3.1.1.1']);
  assert.equal(currentFocus(['NO_SUCH_POINT'], leaves, specIndex), null);
  // A current choice, "nothing selected" and "unrestricted" are left exactly as they are.
  assert.deepEqual(currentFocus(['AQA_GEOG_3.1.3.2'], leaves, specIndex), ['AQA_GEOG_3.1.3.2']);
  assert.deepEqual(currentFocus([], leaves, specIndex), []);
  assert.equal(currentFocus(null, leaves, specIndex), null);
});
