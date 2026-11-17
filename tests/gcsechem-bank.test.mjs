// GCSE Chemistry 1CH0 and Combined Science 1SC0 (chemistry papers): source-backed bank checks.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';

const read = path => JSON.parse(readFileSync(new URL('../' + path, import.meta.url), 'utf8'));
const entries = read('data/packs/index.json').packs.filter(p => p.file.startsWith('gcsechem/'));
const packs = entries.map(p => read('data/packs/' + p.file));
const units = packs.flatMap(p => p.questions);
const registry = read('data/imports/gcsechem/identities.json').units;
const coverage = read('data/imports/gcsechem/coverage.json');
const SPECS = {
  '1CH0': {subject: 'EDX_GCSE_CHEM_1CH0', prefix: 'EDX_GCSE_CHEM_OFF_', marks: 100, codes: /^[12][FH]$/},
  '1SC0': {subject: 'EDX_GCSE_COMBSCI_1SC0', prefix: 'EDX_GCSE_COMBSCI_CHEM_', marks: 60, codes: /^[12]C[FH]$/},
};
const leavesOf = qual => {
  const spec = read(`data/specs/${SPECS[qual].subject}.json`);
  const points = spec.sections.flatMap(s => s.topics.flatMap(t => t.points)).filter(p => p.id.startsWith(SPECS[qual].prefix));
  return {all: new Set(points.map(p => p.id)), higher: new Set(points.filter(p => p.tier === 'Higher').map(p => p.id)), points};
};
const LEAVES = {'1CH0': leavesOf('1CH0'), '1SC0': leavesOf('1SC0')};

test('active GCSE Chemistry booklets reconcile to their printed totals and match the coverage inventory', () => {
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
      assert(['easy', 'medium', 'hard'].includes(q.difficulty), q.question_id);
      assert.equal(q.provenance.reviewer_type, 'model');
    }
  }
});

test('the chemistry specifications are the verified official trees with string codes', () => {
  const chem = read('data/specs/EDX_GCSE_CHEM_1CH0.json');
  assert.equal(chem.order_status, 'verified');
  assert.equal(LEAVES['1CH0'].all.size, 237);
  assert.equal(LEAVES['1CH0'].higher.size, 26);
  assert.equal(LEAVES['1SC0'].all.size, 171);
  assert.equal(LEAVES['1SC0'].higher.size, 17);
  assert(LEAVES['1SC0'].points.every(p => !p.code.endsWith('C')), 'no separate-Chemistry-only statement in Combined Science');
  assert(LEAVES['1CH0'].points.some(p => p.code === '5.8C') && LEAVES['1CH0'].points.some(p => p.code === '1.1'));
  // Combined Science biology and physics sections are untouched by this import.
  const comb = read('data/specs/EDX_GCSE_COMBSCI_1SC0.json');
  assert(comb.sections.some(s => s.id === 'EDX_GCSE_COMBSCI_SEC_BIO') && comb.sections.some(s => s.id === 'EDX_GCSE_COMBSCI_SEC_PHYS'));
});

test('GCSE Chemistry identities and original tariff occurrences remain complete', () => {
  assert.deepEqual(Object.keys(registry).sort(), units.map(q => q.question_id).sort());
  let tariffs = 0;
  for (const pack of packs) {
    const review = read('data/imports/gcsechem/reviews/' + pack.papers[0].paper_id + '.json');
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

test('every referenced GCSE Chemistry crop is packaged losslessly with its recorded checksum', () => {
  let assetsChecked = 0;
  for (const pack of packs) {
    const pid = pack.papers[0].paper_id;
    const catalogue = read('data/gcsechem-assets/' + pid + '.json');
    assert.equal(catalogue.paper_id, pid);
    const references = new Set([...JSON.stringify(pack).matchAll(/assets\/gcsechem\/[A-Z0-9_]+\/([A-Za-z0-9_]+\.webp)/g)].map(m => m[1]));
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
