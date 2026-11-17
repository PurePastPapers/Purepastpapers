import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';

const read = path => JSON.parse(readFileSync(new URL('../' + path, import.meta.url), 'utf8'));
const packs = read('data/packs/index.json').packs.filter(p => p.file.startsWith('gcsemaths/'))
  .map(p => read('data/packs/' + p.file));
const units = packs.flatMap(p => p.questions);
const registry = read('data/imports/gcsemaths/identities.json').units;
const coverage = read('data/imports/gcsemaths/coverage.json');
const spec = read('data/specs/EDX_GCSE_MATH_1MA1.json');
const leaves = new Set(spec.sections.flatMap(s => s.topics.flatMap(t => t.points.map(p => p.id))));

test('active GCSE Maths booklets reconcile to their printed totals and match the coverage inventory', () => {
  assert(packs.length >= 1);
  assert.equal(packs.length, coverage.totals.booklets);
  assert.equal(units.length, coverage.totals.scored_units);
  assert.equal(new Set(units.map(q => q.question_id)).size, units.length);
  assert.equal(units.reduce((sum, q) => sum + q.marks, 0), coverage.totals.marks);
  for (const pack of packs) {
    const paper = pack.papers[0];
    assert.equal(pack.questions.reduce((sum, q) => sum + q.marks, 0), paper.total_marks);
    assert.equal(paper.total_marks, 80);
    assert.match(paper.paper_code, /^[123][FH]$/);
    assert.equal(paper.tier, paper.paper_code.endsWith('F') ? 'Foundation' : 'Higher');
    assert(pack.questions.every(q => q.provenance.review_status === 'model_reviewed' && !q.is_sample));
    assert(pack.questions.every(q => q.source_type === 'real_past_paper' && q.year !== 2026));
  }
});

const higherOnly = new Set(spec.sections.flatMap(s => s.topics.flatMap(t => t.points.filter(p => p.tier === 'Higher').map(p => p.id))));

test('every GCSE Maths unit is tagged to official 1MA1 statements and keeps its paper tier', () => {
  for (const pack of packs) {
    const paper = pack.papers[0];
    for (const q of pack.questions) {
      assert(q.primary_spec_points.length > 0, q.question_id);
      for (const id of [...q.primary_spec_points, ...q.crossover_spec_points]) assert(leaves.has(id), id);
      assert.equal(q.tier, paper.tier, q.question_id);
      if (q.tier === 'Foundation') for (const id of [...q.primary_spec_points, ...q.crossover_spec_points]) assert(!higherOnly.has(id), q.question_id + ' ' + id);
      assert(['easy', 'medium', 'hard'].includes(q.difficulty), q.question_id);
      assert.equal(q.provenance.reviewer_type, 'model');
    }
  }
});

test('the 1MA1 specification is the verified Issue 2 tree with string codes', () => {
  assert.equal(spec.order_status, 'verified');
  assert.equal(leaves.size, 97);
  assert.equal(higherOnly.size, 11);
  assert(spec.point_order.every(id => /^EDX_GCSE_MATH_[NARGPS]\d{1,2}$/.test(id)));
});

test('GCSE Maths identities and original tariff occurrences remain complete', () => {
  assert.deepEqual(Object.keys(registry).sort(), units.map(q => q.question_id).sort());
  let tariffs = 0;
  for (const pack of packs) {
    const review = read('data/imports/gcsemaths/reviews/' + pack.papers[0].paper_id + '.json');
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

test('every referenced GCSE Maths crop is packaged losslessly with its recorded checksum', () => {
  let assetsChecked = 0;
  for (const pack of packs) {
    const pid = pack.papers[0].paper_id;
    const catalogue = read('data/gcsemaths-assets/' + pid + '.json');
    assert.equal(catalogue.paper_id, pid);
    const references = new Set([...JSON.stringify(pack).matchAll(/assets\/gcsemaths\/[A-Z0-9_]+\/([A-Za-z0-9_]+\.webp)/g)].map(m => m[1]));
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
