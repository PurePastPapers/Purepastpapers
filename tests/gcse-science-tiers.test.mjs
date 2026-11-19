// Foundation / Higher tiers for GCSE Combined Science 1SC0 and the separate sciences 1BI0,
// 1CH0, 1PH0 (owner request 2026-11-19): registry, spec trees, question and paper filtering.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createSpecIndex} from '../js/engine/spec-index.js';
import {filterQuestions} from '../js/engine/filter-engine.js';
import {
  isTiered, papersForTier, pointInTier, questionTier, questionsForTier, savedTier, searchTierIntent,
  specForTier, tierLeaves, tierRequired, validTier,
} from '../js/engine/tiers.js';

const read = path => JSON.parse(readFileSync(new URL('../' + path, import.meta.url), 'utf8'));
const SCIENCES = {
  EDX_GCSE_COMBSCI_1SC0: {code: '1SC0', papers: ['1BF', '1CF', '1PF', '2BF', '2CF', '2PF']},
  EDX_GCSE_BIOL_1BI0: {code: '1BI0', papers: ['1F', '2F']},
  EDX_GCSE_CHEM_1CH0: {code: '1CH0', papers: ['1F', '2F']},
  EDX_GCSE_PHYS_1PH0: {code: '1PH0', papers: ['1F', '2F']},
};
const IDS = Object.keys(SCIENCES);
const registry = read('data/subjects.json');
const subjectOf = id => registry.find(s => s.subject_id === id);
const specs = Object.fromEntries(IDS.map(id => [id, read(`data/specs/${id}.json`)]));
const index = createSpecIndex();
for (const id of IDS) index.add(specs[id]);
const points = spec => spec.sections.filter(s => !s.legacy).flatMap(s => s.topics.flatMap(t => t.points || []));

const packEntries = read('data/packs/index.json').packs.filter(p => /^gcse(bio|chem|phys)\//.test(p.file));
const packs = packEntries.map(p => read('data/packs/' + p.file));
const papers = packs.flatMap(p => p.papers);
const questions = packs.flatMap(p => p.questions);
const papersById = new Map(papers.map(p => [p.paper_id, p]));
const coverage = ['gcsebio', 'gcsechem', 'gcsephys'].map(name => read(`data/imports/${name}/coverage.json`));

test('the four GCSE sciences are four separate registry subjects that each declare both tiers', () => {
  const records = IDS.map(subjectOf);
  assert.equal(new Set(records.map(r => r.subject_id)).size, 4);
  for (const record of records) {
    assert.deepEqual(record.tiers, ['Foundation', 'Higher'], record.subject_id);
    assert.equal(record.tier_required, true, record.subject_id);
    assert(isTiered(record) && tierRequired(record));
    assert.equal(record.spec_code, SCIENCES[record.subject_id].code);
  }
  // No duplicate "Foundation/Higher Combined Science" catalogue entries.
  assert.equal(registry.filter(r => /Combined Science/.test(r.subject)).length, 1);
  // GCSE Maths keeps its optional tier ("Not decided yet" stays available).
  const maths = subjectOf('EDX_GCSE_MATH_1MA1');
  assert(isTiered(maths) && !tierRequired(maths));
});

test('a saved tier is read per subject from preferences.tiers and never shared between subjects', () => {
  const progress = {preferences: {tiers: {EDX_GCSE_COMBSCI_1SC0: 'Foundation', EDX_GCSE_BIOL_1BI0: 'Higher', EDX_GCSE_PHYS_1PH0: 'Bogus'}}};
  assert.equal(savedTier(subjectOf('EDX_GCSE_COMBSCI_1SC0'), progress), 'Foundation');
  assert.equal(savedTier(subjectOf('EDX_GCSE_BIOL_1BI0'), progress), 'Higher');
  assert.equal(savedTier(subjectOf('EDX_GCSE_CHEM_1CH0'), progress), null); // not chosen: no default
  assert.equal(savedTier(subjectOf('EDX_GCSE_PHYS_1PH0'), progress), null); // invalid value ignored
  assert.equal(validTier(subjectOf('EDX_GCSE_CHEM_1CH0'), 'Higher'), 'Higher');
  assert.equal(validTier(subjectOf('AQA_GCSE_GEOG_8035'), 'Higher'), null);
});

test('Foundation spec trees drop Higher-only points and keep common and Higher-extension points', () => {
  for (const id of IDS) {
    const all = points(specs[id]);
    const higherOnly = all.filter(p => p.tier === 'Higher');
    assert(higherOnly.length > 0, id);
    for (const point of all) {
      // The spec metadata agrees with itself: tier "Higher" ⇔ not assessed at Foundation.
      assert.equal(point.tier === 'Higher', !point.official_reference.tiers.includes('Foundation'), point.id);
    }
    const foundation = specForTier(specs[id], 'Foundation');
    const higher = specForTier(specs[id], 'Higher');
    const fIds = new Set(points(foundation).map(p => p.id));
    const hIds = new Set(points(higher).map(p => p.id));
    assert.equal(fIds.size, all.length - higherOnly.length, id);
    assert.equal(hIds.size, all.length, id);
    for (const point of higherOnly) assert(!fIds.has(point.id) && hIds.has(point.id), point.id);
    for (const point of all.filter(p => !p.tier)) assert(fIds.has(point.id), point.id);
    // Leaf lists (learned-topic denominators and "I've covered everything") match the trees.
    assert.deepEqual(new Set(tierLeaves(index, id, 'Foundation')), fIds);
    assert.deepEqual(new Set(tierLeaves(index, id, 'Higher')), hIds);
    assert.equal(tierLeaves(index, id, null).length, index.subjectLeaves(id).length);
    // Empty topics/sections are dropped; the original spec is untouched.
    for (const section of foundation.sections) for (const topic of section.topics) assert(!topic.points || topic.points.length);
    assert.equal(points(specs[id]).length, all.length);
  }
  // Statements with only a Higher extension stay visible at Foundation.
  const extended = points(specs.EDX_GCSE_PHYS_1PH0).filter(p => p.official_reference.higher_extension);
  assert(extended.length >= 1);
  const physF = new Set(tierLeaves(index, 'EDX_GCSE_PHYS_1PH0', 'Foundation'));
  for (const point of extended) assert(physF.has(point.id), point.id);
  assert(pointInTier({tier: 'Higher'}, 'Higher') && !pointInTier({tier: 'Higher'}, 'Foundation') && pointInTier({}, 'Foundation'));
});

test('switching tier hides Higher-only learned ticks without clearing them', () => {
  const id = 'EDX_GCSE_BIOL_1BI0';
  const learned = new Set(tierLeaves(index, id, 'Higher')); // "covered everything" on Higher
  const foundation = tierLeaves(index, id, 'Foundation');
  const visible = foundation.filter(leaf => learned.has(leaf));
  assert.equal(visible.length, foundation.length);
  assert(learned.size > visible.length); // the Higher-only ticks are still saved
  assert.equal([...learned].filter(leaf => !foundation.includes(leaf)).length, points(specs[id]).filter(p => p.tier === 'Higher').length);
});

test('Combined Science keeps to the 1SC0 specification and the separate sciences keep their own', () => {
  const comb = points(specs.EDX_GCSE_COMBSCI_1SC0);
  for (const point of comb) {
    assert(point.id.startsWith('EDX_GCSE_COMBSCI_'), point.id);
    assert(!/\d[BCP]$/.test(point.code), `${point.id} is separate-science only`);
    const ref = point.official_reference;
    assert(!ref.biology_only && !ref.chemistry_only && !ref.physics_only, point.id);
  }
  for (const id of IDS.filter(i => i !== 'EDX_GCSE_COMBSCI_1SC0')) {
    for (const point of points(specs[id])) assert(!point.id.startsWith('EDX_GCSE_COMBSCI_'), point.id);
  }
  for (const question of questions) {
    const owner = id => IDS.find(subject => index.subjectOf(id) === subject);
    for (const tag of [...question.primary_spec_points, ...(question.crossover_spec_points || [])]) {
      if (index.has(tag)) assert.equal(owner(tag), question.subject_id, `${question.question_id} ${tag}`);
    }
    assert.equal(papersById.get(question.paper_id).subject_id, question.subject_id, question.question_id);
  }
  for (const paper of papers) {
    assert.equal(paper.spec_code, SCIENCES[paper.subject_id].code, paper.paper_id);
    assert(paper.paper_id.includes(`_${paper.spec_code}_`), paper.paper_id);
  }
});

test('every science question and paper has a consistent tier, so nothing leaks into both tiers', () => {
  for (const paper of papers) assert.equal(paper.tier, paper.paper_code.endsWith('F') ? 'Foundation' : 'Higher', paper.paper_id);
  for (const question of questions) {
    assert(['Foundation', 'Higher'].includes(question.tier), question.question_id);
    assert.equal(questionTier(question, papersById), papersById.get(question.paper_id).tier, question.question_id);
  }
  // An untagged question never matches a chosen tier.
  const orphan = {question_id: 'X', paper_id: 'NONE'};
  assert.equal(questionsForTier([orphan], 'Foundation', papersById).length, 0);
  assert.equal(questionsForTier([orphan], 'Higher', papersById).length, 0);
  assert.equal(questionsForTier([orphan], null, papersById).length, 1);
  // The parent paper's tier is the fallback when a question has none.
  const inherits = {question_id: 'Y', paper_id: papers[0].paper_id};
  assert.equal(questionTier(inherits, papersById), papers[0].tier);
});

test('tier filters return one tier by default and both only when asked; counts match coverage', () => {
  const expected = {};
  for (const file of coverage) {
    for (const [label, count] of Object.entries(file.tiers)) {
      const [code, tier] = label.split(' ');
      const id = IDS.find(i => SCIENCES[i].code === code);
      expected[`${id}|${tier}`] = (expected[`${id}|${tier}`] || 0) + count;
    }
  }
  const context = {specIndex: index, learned: new Set(), latestAttempts: new Map(), papersById};
  for (const id of IDS) {
    const pool = questions.filter(q => q.subject_id === id);
    for (const tier of ['Foundation', 'Higher']) {
      const other = tier === 'Foundation' ? 'Higher' : 'Foundation';
      const {matches} = filterQuestions(pool, {tiers: [tier], learnedOnly: false, poolOnly: false}, context);
      assert.equal(matches.length, expected[`${id}|${tier}`], `${id} ${tier}`);
      assert(matches.every(q => q.tier === tier));
      assert.equal(questionsForTier(pool, tier, papersById).length, matches.length);
      // Generic search and difficulty filters keep the tier restriction.
      const easy = filterQuestions(pool, {tiers: [tier], difficulties: ['easy'], search: 'the', learnedOnly: false, poolOnly: false}, context).matches;
      assert(easy.length > 0 && easy.every(q => q.tier === tier && q.difficulty === 'easy'));
      // Year and series filters combine with the tier.
      const year = papers.find(p => p.subject_id === id && p.tier === tier).year;
      const byYear = filterQuestions(pool, {tiers: [tier], years: [year], learnedOnly: false, poolOnly: false}, context).matches;
      assert(byYear.length > 0 && byYear.every(q => q.tier === tier && papersById.get(q.paper_id).year === year));
      assert.equal(filterQuestions(pool, {tiers: [tier], paperIds: [papers.find(p => p.subject_id === id && p.tier === other).paper_id], learnedOnly: false, poolOnly: false}, context).matches.length, 0);
    }
    const both = filterQuestions(pool, {tiers: ['Foundation', 'Higher'], learnedOnly: false, poolOnly: false}, context).matches;
    assert.equal(both.length, pool.length, `${id} both tiers`);
  }
});

test('every indexed public paper is reachable on its own tier, and tiers partition the list', () => {
  for (const id of IDS) {
    const list = papers.filter(p => p.subject_id === id);
    const foundation = papersForTier(list, 'Foundation');
    const higher = papersForTier(list, 'Higher');
    assert.equal(foundation.length + higher.length, list.length, id);
    assert(foundation.every(p => p.tier === 'Foundation') && higher.every(p => p.tier === 'Higher'));
    assert.equal(papersForTier(list, null).length, list.length);
    // Each tier has every paper code for every session (1SC0: six papers per tier).
    const sessions = new Set(list.map(p => `${p.year}|${p.series}`));
    for (const [tier, group] of [['F', foundation], ['H', higher]]) {
      const codes = SCIENCES[id].papers.map(code => code.replace(/F$/, tier));
      assert.deepEqual([...new Set(group.map(p => p.paper_code))].sort(), [...codes].sort(), `${id} ${tier}`);
      assert.equal(group.length, sessions.size * codes.length, `${id} ${tier}`);
    }
  }
  // The coverage files list the same booklet count as the packs.
  assert.equal(papers.length, coverage.reduce((sum, file) => sum + file.totals.booklets, 0));
  assert.equal(questions.length, coverage.reduce((sum, file) => sum + file.totals.scored_units, 0));
});

test('a search that names a tier or one of its paper codes selects that tier on purpose', () => {
  const comb = papers.filter(p => p.subject_id === 'EDX_GCSE_COMBSCI_1SC0');
  const bio = papers.filter(p => p.subject_id === 'EDX_GCSE_BIOL_1BI0');
  assert.deepEqual(searchTierIntent('osmosis', comb), {tiers: [], search: 'osmosis'});
  assert.deepEqual(searchTierIntent('Higher osmosis', comb), {tiers: ['Higher'], search: 'osmosis'});
  assert.deepEqual(searchTierIntent('foundation tier', comb), {tiers: ['Foundation'], search: ''});
  assert.deepEqual(searchTierIntent('1BH', comb), {tiers: ['Higher'], search: '1BH'});
  assert.deepEqual(searchTierIntent('2pf current', comb), {tiers: ['Foundation'], search: '2pf current'});
  assert.deepEqual(searchTierIntent('foundation higher', comb).tiers, ['Foundation', 'Higher']);
  // A spec code is not a paper code: "1CH0" names no 1SC0 chemistry paper.
  assert.deepEqual(searchTierIntent('1CH0', comb).tiers, []);
  // Paper codes belong to their own qualification.
  assert.deepEqual(searchTierIntent('1BH', bio).tiers, []);
  assert.deepEqual(searchTierIntent('1H', bio).tiers, ['Higher']);
  assert.deepEqual(searchTierIntent('', comb), {tiers: [], search: ''});
});
