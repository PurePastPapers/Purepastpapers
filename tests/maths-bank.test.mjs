import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';

const read = path => JSON.parse(readFileSync(new URL('../' + path, import.meta.url), 'utf8'));
const packs = read('data/packs/index.json').packs.filter(p => p.file.startsWith('maths/'))
  .map(p => read('data/packs/' + p.file));
const units = packs.flatMap(p => p.questions);
const registry = read('data/imports/maths/identities.json').units;

test('all public current-spec Maths sources are active, with samples separate from exam years', () => {
  assert.equal(packs.length, 60);
  assert.equal(units.length, 1110);
  assert.equal(new Set(units.map(q => q.parent_question_id)).size, 602);
  assert.equal(new Set(units.map(q => q.question_id)).size, units.length);
  assert.equal(units.reduce((sum, q) => sum + q.marks, 0), 4240);
  for (const pack of packs) {
    const paper = pack.papers[0];
    assert.equal(pack.questions.reduce((sum, q) => sum + q.marks, 0), paper.total_marks);
    assert.equal(paper.is_official_sample, paper.series === 'Sample');
    if (paper.is_official_sample) {
      assert.equal(paper.year, null);
      assert(paper.source_bundle_url.endsWith('.zip'));
      assert.equal(paper.full_paper_pdf_url, null);
    }
    assert(!pack.questions.some(q => q.year === 2026 || q.is_sample));
    assert(pack.questions.every(q => q.provenance.review_status === 'model_reviewed'));
  }
  assert.equal(units.filter(q => q.is_as).length, 377);
  assert(units.filter(q => q.is_as).every(q => q.introduced_year === 12));
});

test('published assessment identities and original tariff occurrences remain complete', () => {
  assert.deepEqual(Object.keys(registry).sort(), units.map(q => q.question_id).sort());
  let tariffs = 0;
  for (const pack of packs) {
    const review = read('data/imports/maths/reviews/' + pack.papers[0].paper_id + '.json');
    for (const question of review.questions) {
      const selected = pack.questions.filter(q => String(q.question_number) === String(question.number));
      assert.equal(selected.length, question.units.length);
      const indices = selected.flatMap(q => q.provenance.original_tariff_indices);
      assert.deepEqual([...indices].sort((a, b) => a - b), Array.from({length: indices.length}, (_, i) => i));
      tariffs += indices.length;
      selected.forEach((q, i) => {
        assert.deepEqual(q.provenance.original_parts, question.units[i].parts);
        assert.deepEqual(registry[q.question_id], {
          parent_question_id: q.parent_question_id,
          source_sha256: q.provenance.question_source_sha256,
          original_tariff_indices: q.provenance.original_tariff_indices,
          marks: q.marks,
        });
      });
    }
  }
  assert.equal(tariffs, 1544);
});

test('every referenced source crop is packaged losslessly with its recorded checksum', () => {
  let assetsChecked = 0;
  for (const pack of packs) {
    const pid = pack.papers[0].paper_id;
    const catalogue = read('data/maths-assets/' + pid + '.json');
    assert.equal(catalogue.paper_id, pid);
    const references = new Set([...JSON.stringify(pack).matchAll(/assets\/maths\/[A-Z0-9_]+\/([A-Za-z0-9_]+\.webp)/g)].map(m => m[1]));
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
