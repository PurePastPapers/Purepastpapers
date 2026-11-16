import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {createSpecIndex} from '../js/engine/spec-index.js';

const read = path => JSON.parse(readFileSync(new URL('../' + path, import.meta.url), 'utf8'));
const entries = read('data/packs/index.json').packs.filter(p => p.file.startsWith('biology/'));
const packs = entries.map(p => read('data/packs/' + p.file));
const units = packs.flatMap(p => p.questions);
const coverage = read('data/imports/biology/coverage.json');
const registry = read('data/imports/biology/identities.json').units;
const spec = read('data/specs/EDX_ALEVEL_BIOL_9BN0.json');
const official = new Map(spec.sections.filter(s => !s.legacy).flatMap(s => s.topics.flatMap(t => t.points)).map(p => [p.id, p]));
const inventories = ['9bn0-inventory', '8bn0-inventory', 'samples-inventory']
  .map(name => read(`data/imports/biology/inventory/${name}.json`));

test('every public Biology A booklet is active and reconciles to its printed total', () => {
  const publicPapers = inventories.flatMap(i => i.papers).filter(p => p.documents.question_paper.availability === 'verified_public_pdf');
  assert.equal(packs.length, publicPapers.length);
  assert.equal(packs.length, coverage.totals.booklets);
  assert.equal(units.length, coverage.totals.scored_units);
  assert.equal(new Set(units.map(q => q.parent_question_id)).size, coverage.totals.source_questions);
  assert.equal(new Set(units.map(q => q.question_id)).size, units.length);
  assert.equal(units.reduce((sum, q) => sum + q.marks, 0), coverage.totals.marks);
  assert(entries.every(entry => entry.subject_id === 'EDX_ALEVEL_BIOL_9BN0'));
  for (const pack of packs) {
    const paper = pack.papers[0];
    assert.equal(pack.questions.reduce((sum, q) => sum + q.marks, 0), paper.total_marks);
    assert.equal(paper.total_marks, paper.spec_code === '9BN0' ? 100 : 80);
    assert.equal(paper.is_official_sample, paper.series === 'Sample');
    if (paper.is_official_sample) assert.equal(paper.year, null);
    assert(pack.questions.every(q => q.provenance.review_status === 'model_reviewed' && q.provenance.reviewer_type === 'model'));
    assert(pack.questions.every(q => !q.is_sample && q.year !== 2026));
  }
});

test('restricted sources stay out and are recorded, not fabricated', () => {
  const restricted = inventories.flatMap(i => i.papers).filter(p => p.documents.question_paper.availability !== 'verified_public_pdf');
  assert.deepEqual(restricted.map(p => p.paper_id).sort(), [...coverage.restricted_booklets].sort());
  for (const paper of restricted) assert(!entries.some(e => e.file.includes(paper.paper_id)));
});

test('tags are official Issue 4 IDs, AS units stay in Topics 1-4 and Year 12, content years follow tags', () => {
  for (const q of units) {
    const tags = [...q.primary_spec_points, ...q.crossover_spec_points];
    assert(q.primary_spec_points.length > 0, q.question_id);
    for (const id of tags) {
      assert(official.has(id), `${q.question_id} uses ${id}`);
      assert(!id.startsWith('EDX_BIOL_T'), 'legacy seed ids are never used as tags');
    }
    assert(['easy', 'medium', 'hard'].includes(q.difficulty));
    const needsYear13 = tags.some(id => official.get(id).introduced_year === 13);
    if (q.is_as) {
      assert.equal(q.introduced_year, 12);
      assert.equal(q.qualification_code, '8BN0');
      assert(!q.primary_spec_points.some(id => official.get(id).introduced_year === 13), q.question_id);
    } else {
      assert.equal(q.introduced_year, needsYear13 ? 13 : 12, q.question_id);
    }
  }
});

test('legacy seed points still resolve but are not offered in the tree', () => {
  const index = createSpecIndex();
  index.add(spec);
  assert(index.has('EDX_BIOL_T2_2.4'));
  assert(index.get('EDX_BIOL_T2_2.4').legacy);
  assert(!index.subjectLeaves('EDX_ALEVEL_BIOL_9BN0').includes('EDX_BIOL_T2_2.4'));
  assert(!index.spec('EDX_ALEVEL_BIOL_9BN0').sections.some(s => s.legacy));
  assert.equal(index.subjectLeaves('EDX_ALEVEL_BIOL_9BN0').length, 137 + 18 + 28);
  assert(index.has('EDX_BIOL_OFF_T2_2.10') && index.has('EDX_BIOL_OFF_T2_2.1'));
});

test('identities and every original printed tariff are assigned exactly once', () => {
  assert.deepEqual(Object.keys(registry).sort(), units.map(q => q.question_id).sort());
  let tariffs = 0;
  for (const pack of packs) {
    const review = read('data/imports/biology/reviews/' + pack.papers[0].paper_id + '.json');
    for (const question of review.questions) {
      const selected = pack.questions.filter(q => String(q.question_number) === String(question.number));
      assert.equal(selected.length, question.units.length);
      const indices = selected.flatMap(q => q.provenance.original_tariff_indices);
      assert.deepEqual([...indices].sort((a, b) => a - b), Array.from({length: indices.length}, (_, i) => i));
      tariffs += indices.length;
      selected.forEach((q, i) => {
        assert.deepEqual(q.provenance.original_parts, question.units[i].parts);
        assert.deepEqual(registry[q.question_id], {
          parent_question_id: q.parent_question_id, source_sha256: q.provenance.question_source_sha256,
          original_tariff_indices: q.provenance.original_tariff_indices, marks: q.marks,
        });
      });
    }
  }
  assert.equal(tariffs, coverage.totals.original_tariffs);
});

test('Paper 3 article questions carry the article as unscored context or an honest note', () => {
  const article = units.filter(q => q.context?.article);
  assert(article.length > 0);
  for (const q of article) {
    assert.equal(q.context.article.scored, false);
    if (q.context.article.page_image_urls) assert(q.context.article.url.startsWith('https://qualifications.pearson.com/'));
    else assert.equal(q.context.article.availability, 'restricted');
  }
});

test('every referenced Biology crop is packaged losslessly with its recorded checksum', () => {
  let assetsChecked = 0;
  for (const pack of packs) {
    const pid = pack.papers[0].paper_id;
    const catalogue = read('data/biology-assets/' + pid + '.json');
    assert.equal(catalogue.paper_id, pid);
    const references = new Set([...JSON.stringify(pack).matchAll(/assets\/biology\/[A-Z0-9_]+\/([A-Za-z0-9_]+\.webp)/g)].map(m => m[1]));
    assert.deepEqual(Object.keys(catalogue.assets).sort(), [...references].sort());
    for (const asset of Object.values(catalogue.assets)) {
      const bytes = Buffer.from(asset.base64, 'base64');
      assert.equal(bytes.toString('ascii', 0, 4), 'RIFF');
      assert.equal(bytes.toString('ascii', 8, 12), 'WEBP');
      assert.equal(createHash('sha256').update(bytes).digest('hex'), asset.sha256);
      assetsChecked++;
    }
  }
  assert(assetsChecked > 2000);
});
