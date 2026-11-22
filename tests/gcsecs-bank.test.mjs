import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, readdirSync} from 'node:fs';
import {createSpecIndex} from '../js/engine/spec-index.js';
import {validateBundle} from '../js/data/schema.js';

const read = path => JSON.parse(readFileSync(new URL('../' + path, import.meta.url), 'utf8'));
const coverage = read('data/imports/gcsecs/coverage.json');
const files = readdirSync(new URL('../data/packs/gcsecs/', import.meta.url)).filter(f => f.endsWith('.json'));
const packs = files.map(f => read('data/packs/gcsecs/' + f));
const inventory = read('data/imports/gcsecs/inventory/J277-inventory.json');
const spec = read('data/specs/OCR_GCSE_CS_J277.json');
const leaves = new Map(spec.sections.flatMap(s => s.topics.flatMap(t => t.points.map(p => [p.id, p]))));
const units = packs.flatMap(p => p.questions);

test('GCSE Computer Science J277 specification is OCR Version 3.1 sub-topics in printed order', () => {
  assert.equal(spec.official_source.sha256, '39aa7d6d41266f90e3b4e0b848a9eee72febc26be1d4a780d2881769e34a906d');
  assert.equal(leaves.size, 26);
  assert.deepEqual([...leaves.keys()], spec.point_order);
  assert.deepEqual(spec.sections.flatMap(s => s.topics).map(t => t.code), ['1.1', '1.2', '1.3', '1.4', '1.5', '1.6', '2.1', '2.2', '2.3', '2.4', '2.5']);
  for (const p of leaves.values()) assert(p.content.length && p.content[0].length > 3 && !/Sub topic|Version 3/.test(p.content.join(' ')), p.id);
  // Ids are unchanged from the earlier unverified tree, so saved ticks keep their meaning.
  assert(leaves.has('OCR_GCSE_CS_1.2.4') && leaves.has('OCR_GCSE_CS_2.2.3'));
});

test('every public OCR J277 booklet (June 2022 to 2025 and both official samples) is built and accounted for', () => {
  const ids = inventory.papers.map(p => p.paper_id).sort();
  assert.equal(ids.length, 10);
  assert.deepEqual(packs.map(p => p.papers[0].paper_id).sort(), ids);
  assert.deepEqual(coverage.queued_public_booklets, []);
  assert.equal(units.length, 282);
  assert.equal(new Set(units.map(q => q.question_id)).size, 282);
  assert.equal(coverage.totals.scored_units, 282);
});

test('each booklet reconciles exactly to its 80-mark cover total', () => {
  for (const pack of packs) {
    const [paper] = pack.papers;
    assert.equal(pack.questions.reduce((n, q) => n + q.marks, 0), 80, paper.paper_id);
    assert.equal(paper.total_marks, 80);
    assert.equal(paper.duration_minutes, 90);
    assert.deepEqual(paper.question_ids, pack.questions.map(q => q.question_id));
    assert.equal(paper.level, 'GCSE');
  }
});

test('tags are valid J277 sub-topics and respect the component', () => {
  for (const q of units) {
    const tags = [...q.primary_spec_points, ...q.crossover_spec_points];
    assert(q.primary_spec_points.length && tags.every(id => leaves.has(id)), q.question_id);
    assert.equal(q.level, 'GCSE');
    assert.equal(q.is_as, false);
    if (q.component === '01') assert(q.primary_spec_points.every(id => id.startsWith('OCR_GCSE_CS_1.')), q.question_id);
  }
  assert.deepEqual(coverage.leaves_without_primary_units, []);
});

test('units are model-reviewed source pixels with unscored context and their own scheme rows', () => {
  for (const q of units) {
    assert.equal(q.source_type, 'real_past_paper');
    assert.equal(q.provenance.reviewer_type, 'model');
    assert(['easy', 'medium', 'hard'].includes(q.difficulty), q.question_id);
    assert(q.provenance.difficulty_basis && q.preview_text, q.question_id);
    assert.match(q.content.question_image_url, /^assets\/gcsecs\/OCR_J277_[A-Z0-9_]+\/Q\d{2}[_a-z]*\.webp$/);
    assert.match(q.content.mark_scheme_image_url, /_scheme\.webp$/);
    assert(['part', 'parent_part'].includes(q.scheme_scope));
    for (const intro of q.context.intros || []) assert(/^(Question|Part) /.test(intro.label) && intro.image_url.startsWith('assets/gcsecs/'));
  }
});

test('adjacent 2025 Paper 1 parts stop between the earlier tariff and the next printed prompt', () => {
  const paper = packs.find(p => p.papers[0].paper_id === 'OCR_J277_2025_JUNE_01');
  for (const [earlier, later, page] of [['5(c)', '5(d)', 14], ['6(b)', '6(c)', 15]]) {
    const tail = paper.questions.find(q => q.scheme_question_number === earlier).provenance.source_regions.at(-1);
    const head = paper.questions.find(q => q.scheme_question_number === later).provenance.source_regions[0];
    assert.equal(tail.page, page);
    assert.equal(head.page, page);
    assert(tail.bbox[3] <= head.bbox[1], `${earlier} and ${later} overlap`);
  }
});

test('J277 packs validate and stay out of the live index until OCR rights for GCSE are confirmed', () => {
  const subject = read('data/subjects.json').find(s => s.subject_id === 'OCR_GCSE_CS_J277');
  const index = createSpecIndex(); index.add(spec);
  const issues = validateBundle({subject, papers: packs.flatMap(p => p.papers), questions: units, questionsById: new Map(units.map(q => [q.question_id, q]))}, index);
  assert.deepEqual(issues.filter(i => i.level === 'error'), []);
  const live = read('data/packs/index.json').packs.map(p => p.file).filter(f => f.startsWith('gcsecs/'));
  assert.equal(live.length, coverage.published ? 10 : 0);
  if (!coverage.published) assert.match(coverage.rights_basis, /NOT CONFIRMED/);
  assert.equal(Object.keys(read('data/imports/gcsecs/identities.json').units).length, 282);
});
