// GCSE Physics 1PH0 and Combined Science 1SC0 (physics papers): source-backed bank checks.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {collapseLinked, linkGroups} from '../js/engine/linked-parts.js';

const read = path => JSON.parse(readFileSync(new URL('../' + path, import.meta.url), 'utf8'));
const entries = read('data/packs/index.json').packs.filter(p => p.file.startsWith('gcsephys/'));
const packs = entries.map(p => read('data/packs/' + p.file));
const units = packs.flatMap(p => p.questions);
const registry = read('data/imports/gcsephys/identities.json').units;
const coverage = read('data/imports/gcsephys/coverage.json');
const SPECS = {
  '1PH0': {subject: 'EDX_GCSE_PHYS_1PH0', prefix: 'EDX_GCSE_PHYS_OFF_', marks: 100, codes: /^[12][FH]$/},
  '1SC0': {subject: 'EDX_GCSE_COMBSCI_1SC0', prefix: 'EDX_GCSE_COMBSCI_PHYS_', marks: 60, codes: /^[12]P[FH]$/},
};
const leavesOf = qual => {
  const spec = read(`data/specs/${SPECS[qual].subject}.json`);
  const points = spec.sections.flatMap(s => s.topics.flatMap(t => t.points)).filter(p => p.id.startsWith(SPECS[qual].prefix));
  return {all: new Set(points.map(p => p.id)), higher: new Set(points.filter(p => p.tier === 'Higher').map(p => p.id)), points};
};
const LEAVES = {'1PH0': leavesOf('1PH0'), '1SC0': leavesOf('1SC0')};

test('Foundation electromagnet questions keep the choice and its reasons together', () => {
  const parents = ['EDX_1PH0_2022_JUNE_2F_Q04', 'EDX_1SC0_2022_JUNE_2PF_Q02'];
  for (const parent of parents) {
    const siblings = units.filter(q => q.parent_question_id === parent);
    const questions = new Map(siblings.map(q => [q.question_id, q]));
    const choice = `${parent}_U01`;
    const reasons = `${parent}_U02`;
    assert.deepEqual(questions.get(reasons).depends_on_question_ids, [choice]);
    linkGroups(questions);
    const cards = collapseLinked([...questions.values()], questions);
    assert.deepEqual(cards[0].part_ids, [choice, reasons]);
    assert.equal(cards[0].marks, 3);
    assert.deepEqual(cards.slice(1).map(q => q.question_id), siblings.slice(2).map(q => q.question_id));
  }
});

test('reviewed Physics context, links and equation-booklet exclusions survive publication', () => {
  const reviews = read('data/imports/gcsephys/part-display-overrides.json');
  const questions = new Map(units.map(q => [q.question_id, q]));
  for (const [id, review] of Object.entries(reviews)) {
    const question = questions.get(id);
    assert.ok(question, id);
    assert.equal(question.provenance.question_source_sha256, review.source_sha256, id);
    if (review.reviewed_dependencies) {
      assert.deepEqual(question.provenance.reviewed_dependencies, review.reviewed_dependencies, id);
      assert.deepEqual(question.depends_on_question_ids || [], review.reviewed_dependencies, id);
    }
    if (review.context_regions) {
      assert.equal(Boolean(question.context.stem_image_url), review.context_regions.length > 0, id);
      assert.deepEqual(question.provenance.context_regions || [], review.context_regions, id);
    }
    if (review.source_regions) assert.deepEqual(question.provenance.source_regions, review.source_regions, id);
    if (review.full_question_regions) assert.deepEqual(question.provenance.full_question_regions, review.full_question_regions, id);
    if (review.scheme_regions) {
      assert.equal(question.scheme_scope, 'part', id);
      assert.equal(question.provenance.scheme_source_sha256, review.scheme_source_sha256, id);
      assert.deepEqual(question.provenance.part_scheme_regions, review.scheme_regions, id);
    }
  }

  const paper = 'EDX_1PH0_2022_JUNE_2F';
  const question = questions.get(`${paper}_Q10_U07`);
  assert.equal(question.part_label, '(c)');
  assert.equal(question.marks, 2);
  assert.deepEqual(question.provenance.source_regions.map(region => region.page), [38]);
  assert.equal(question.provenance.full_question_regions.at(-1).page, 38);
});

test('whole Physics schemes keep all pages assigned to the printed question', () => {
  const reviews = read('data/imports/gcsephys/scheme-display-overrides.json');
  for (const question of units) {
    const review = reviews[question.parent_question_id];
    if (!review) continue;
    assert.equal(question.provenance.scheme_source_sha256, review.scheme_source_sha256, question.question_id);
    assert.deepEqual(question.provenance.scheme_regions, review.scheme_regions, question.question_id);
    assert.equal(question.provenance.scheme_region_page_pixels.length, review.scheme_regions.length, question.question_id);
  }
  const pages = id => reviews[id].scheme_regions.map(region => region.page);
  assert.deepEqual(pages('EDX_1PH0_2020_NOVEMBER_1F_Q01'), [5]);
  assert.deepEqual(pages('EDX_1PH0_2022_JUNE_2H_Q10'), [27, 28, 29, 30]);
  const sharedTier = 'EDX_1PH0_2021_NOVEMBER_2H';
  assert.deepEqual(pages(`${sharedTier}_Q01`), [5, 6]);
  assert.deepEqual(pages(`${sharedTier}_Q02`), [7, 8]);
  assert.deepEqual(pages(`${sharedTier}_Q03`), [9, 10, 11]);
  assert.ok(reviews[`${sharedTier}_Q02`].scheme_regions[0].bbox[1] < 0.09);
  assert.ok(reviews[`${sharedTier}_Q03`].scheme_regions[0].bbox[1] < 0.11);
});

test('printed reference variants keep the first part scheme and its full fallback', () => {
  const reviews = read('data/imports/gcsephys/scheme-display-overrides.json');
  for (const id of ['EDX_1SC0_2022_JUNE_1PH_Q04_U01', 'EDX_1PH0_2021_NOVEMBER_1H_Q10_U01']) {
    const question = units.find(item => item.question_id === id);
    const review = reviews[id];
    const shorthand = id.slice(question.paper_id.length + 1);
    assert.equal(question.scheme_scope, 'part', id);
    assert.equal(question.provenance.part_scheme_check, 'verified', id);
    assert.equal(question.provenance.scheme_source_sha256, review.scheme_source_sha256, id);
    assert.deepEqual(question.provenance.part_scheme_regions, review.scheme_regions, id);
    assert.ok(question.content.mark_scheme_image_url.endsWith(`/${shorthand}_scheme.webp`), id);
    assert.ok(question.context.full_scheme_image_url.endsWith(`/${shorthand.split('_')[0]}_scheme.webp`), id);
  }
});

test('active GCSE Physics booklets reconcile to their printed totals and match the coverage inventory', () => {
  assert(packs.length >= 1);
  assert.equal(packs.length, coverage.totals.booklets);
  assert.equal(units.length, coverage.totals.scored_units);
  assert.equal(new Set(units.map(q => q.question_id)).size, units.length);
  assert.equal(units.reduce((sum, q) => sum + q.marks, 0), coverage.totals.marks);
  for (const [i, pack] of packs.entries()) {
    const paper = pack.papers[0];
    const spec = SPECS[paper.qualification_code];
    assert.equal(entries[i].subject_id, spec.subject);
    assert.equal(paper.subject_id, spec.subject);
    assert.equal(pack.questions.reduce((sum, q) => sum + q.marks, 0), paper.total_marks);
    assert.equal(paper.total_marks, spec.marks);
    assert.match(paper.paper_code, spec.codes);
    assert.equal(paper.tier, paper.paper_code.endsWith('F') ? 'Foundation' : 'Higher');
    assert(pack.questions.every(q => q.provenance.review_status === 'model_reviewed' && !q.is_sample));
    assert(pack.questions.every(q => q.source_type === 'real_past_paper' && q.year !== 2026));
  }
});

test('every unit is tagged to its own qualification, keeps its tier and has no Higher-only tag on Foundation', () => {
  for (const pack of packs) {
    const paper = pack.papers[0];
    const leaves = LEAVES[paper.qualification_code];
    for (const q of pack.questions) {
      assert.equal(q.subject_id, paper.subject_id, q.question_id);
      assert(q.primary_spec_points.length > 0, q.question_id);
      for (const id of [...q.primary_spec_points, ...q.crossover_spec_points]) assert(leaves.all.has(id), q.question_id + ' ' + id);
      assert.equal(q.tier, paper.tier, q.question_id);
      if (q.tier === 'Foundation') for (const id of [...q.primary_spec_points, ...q.crossover_spec_points]) assert(!leaves.higher.has(id), q.question_id + ' ' + id);
      if (paper.qualification_code === '1SC0') assert(q.official_statements.every(c => !/P$/.test(c)), q.question_id);
      assert(['easy', 'medium', 'hard'].includes(q.difficulty), q.question_id);
      assert.equal(q.provenance.reviewer_type, 'model');
    }
  }
});

test('the physics specifications are the verified official trees with string codes', () => {
  const phys = read('data/specs/EDX_GCSE_PHYS_1PH0.json');
  assert.equal(phys.order_status, 'verified');
  assert.equal(LEAVES['1PH0'].all.size, 296);
  assert.equal(LEAVES['1PH0'].higher.size, 42);
  assert.equal(LEAVES['1SC0'].all.size, 205);
  assert.equal(LEAVES['1SC0'].higher.size, 22);
  assert(LEAVES['1SC0'].points.every(p => !p.code.endsWith('P')), 'no separate-Physics-only statement in Combined Science');
  assert(LEAVES['1PH0'].points.some(p => p.code === '7.1P') && LEAVES['1PH0'].points.some(p => p.code === '1.1'));
  // Combined Science biology and chemistry sections are untouched by this import.
  const comb = read('data/specs/EDX_GCSE_COMBSCI_1SC0.json');
  assert(comb.sections.some(s => s.id === 'EDX_GCSE_COMBSCI_SEC_BIO') && comb.sections.some(s => s.id === 'EDX_GCSE_COMBSCI_SEC_CHEM'));
});

test('GCSE Physics identities and original tariff occurrences remain complete', () => {
  assert.deepEqual(Object.keys(registry).sort(), units.map(q => q.question_id).sort());
  let tariffs = 0;
  for (const pack of packs) {
    const review = read('data/imports/gcsephys/reviews/' + pack.papers[0].paper_id + '.json');
    for (const question of review.questions) {
      const selected = pack.questions.filter(q => String(q.question_number) === String(question.number));
      assert.equal(selected.length, question.units.length);
      const indices = selected.flatMap(q => q.provenance.original_tariff_indices);
      assert.deepEqual([...indices].sort((a, b) => a - b), Array.from({length: indices.length}, (_, i) => i));
      tariffs += indices.length;
      for (const q of selected) {
        assert.deepEqual(registry[q.question_id], {
          parent_question_id: q.parent_question_id,
          source_sha256: q.provenance.question_source_sha256,
          original_tariff_indices: q.provenance.original_tariff_indices,
          marks: q.marks,
        });
      }
    }
  }
  assert.equal(tariffs, coverage.totals.original_tariffs);
});

test('every referenced GCSE Physics crop is packaged losslessly with its recorded checksum', () => {
  let assetsChecked = 0;
  for (const pack of packs) {
    const pid = pack.papers[0].paper_id;
    const catalogue = read('data/gcsephys-assets/' + pid + '.json');
    assert.equal(catalogue.paper_id, pid);
    const references = new Set([...JSON.stringify(pack).matchAll(/assets\/gcsephys\/[A-Z0-9_]+\/([A-Za-z0-9_]+\.webp)/g)].map(m => m[1]));
    assert.deepEqual(Object.keys(catalogue.assets).sort(), [...references].sort());
    for (const asset of Object.values(catalogue.assets)) {
      const bytes = Buffer.from(asset.base64, 'base64');
      assert.equal(bytes.toString('ascii', 8, 12), 'WEBP');
      assert.equal(createHash('sha256').update(bytes).digest('hex'), asset.sha256);
      assetsChecked++;
    }
  }
  assert.equal(assetsChecked, coverage.totals.image_assets);
});
