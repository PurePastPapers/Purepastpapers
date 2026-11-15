import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';

const read = path => JSON.parse(readFileSync(new URL('../' + path, import.meta.url), 'utf8'));
const packs = read('data/packs/index.json').packs.filter(p => p.file.startsWith('physics/'))
  .map(p => read('data/packs/' + p.file));
const units = packs.flatMap(p => p.questions);
const registry = read('data/imports/physics/identities.json').units;
const coverage = read('data/imports/physics/coverage.json');
const spec = read('data/specs/EDX_ALEVEL_PHYS_9PH0.json');
const leaves = new Set(spec.sections.flatMap(s => s.topics.flatMap(t => t.points.map(p => p.id))));

test('active Physics booklets reconcile to their printed totals and match the coverage inventory', () => {
  assert(packs.length >= 1);
  assert.equal(packs.length, coverage.totals.booklets);
  assert.equal(units.length, coverage.totals.scored_units);
  assert.equal(new Set(units.map(q => q.question_id)).size, units.length);
  assert.equal(units.reduce((sum, q) => sum + q.marks, 0), coverage.totals.marks);
  const expected = {'9PH0': {'01': 90, '02': 90, '03': 120}, '8PH0': {'01': 80, '02': 80}};
  for (const pack of packs) {
    const paper = pack.papers[0];
    assert.equal(pack.questions.reduce((sum, q) => sum + q.marks, 0), paper.total_marks);
    if (!paper.is_official_sample) assert.equal(paper.total_marks, expected[paper.qualification_code][paper.paper_code]);
    assert(pack.questions.every(q => q.provenance.review_status === 'model_reviewed' && !q.is_sample));
    assert(pack.questions.every(q => q.source_type === 'real_past_paper' && q.year !== 2026));
  }
});

test('every Physics unit is tagged to official statements, with AS units kept to Year 12 content', () => {
  for (const q of units) {
    assert(q.primary_spec_points.length > 0, q.question_id);
    for (const id of [...q.primary_spec_points, ...q.crossover_spec_points]) assert(leaves.has(id), id);
    const numbers = q.official_statements.map(Number);
    assert.equal(q.introduced_year, numbers.some(n => n > 96) ? 13 : 12, q.question_id);
    if (q.is_as) assert(numbers.every(n => n <= 96), q.question_id);
    assert(['easy', 'medium', 'hard'].includes(q.difficulty), q.question_id);
  }
});

test('Physics identities and original tariff occurrences remain complete', () => {
  assert.deepEqual(Object.keys(registry).sort(), units.map(q => q.question_id).sort());
  let tariffs = 0;
  for (const pack of packs) {
    const review = read('data/imports/physics/reviews/' + pack.papers[0].paper_id + '.json');
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

test('every referenced Physics crop is packaged losslessly with its recorded checksum', () => {
  let assetsChecked = 0;
  for (const pack of packs) {
    const pid = pack.papers[0].paper_id;
    const catalogue = read('data/physics-assets/' + pid + '.json');
    assert.equal(catalogue.paper_id, pid);
    const references = new Set([...JSON.stringify(pack).matchAll(/assets\/physics\/[A-Z0-9_]+\/([A-Za-z0-9_]+\.webp)/g)].map(m => m[1]));
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
