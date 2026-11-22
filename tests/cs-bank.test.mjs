import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, readdirSync} from 'node:fs';
import {createSpecIndex} from '../js/engine/spec-index.js';
import {validateBundle} from '../js/data/schema.js';

const read = path => JSON.parse(readFileSync(new URL('../' + path, import.meta.url), 'utf8'));
const coverage = read('data/imports/cs/coverage.json');
const files = readdirSync(new URL('../data/packs/cs/', import.meta.url)).filter(f => f.endsWith('.json'));
const packs = files.map(f => read('data/packs/cs/' + f));
const inventories = ['H446', 'H046'].map(n => read(`data/imports/cs/inventory/${n}-inventory.json`));
const spec = read('data/specs/OCR_ALEVEL_CS_H446.json');
const leaves = new Map(spec.sections.flatMap(s => s.topics.flatMap(t => t.points.map(p => [p.id, p]))));
const asShared = new Set(Object.values(spec.as_section_map).map(v => v.leaf));
const units = packs.flatMap(p => p.questions);

test('every public OCR H446 and AS H046 booklet is built and accounted for', () => {
  const ids = inventories.flatMap(i => i.papers.map(p => p.paper_id)).sort();
  assert.deepEqual(packs.map(p => p.papers[0].paper_id).sort(), ids);
  assert.equal(ids.length, 22);
  assert.deepEqual(coverage.queued_public_booklets, []);
  assert.equal(units.length, 724);
  assert.equal(new Set(units.map(q => q.question_id)).size, 724);
  assert.equal(coverage.totals.scored_units, 724);
});

test('each booklet reconciles exactly to its cover total (140 A level, 70 AS)', () => {
  for (const pack of packs) {
    const [paper] = pack.papers;
    assert.equal(pack.questions.reduce((n, q) => n + q.marks, 0), paper.total_marks, paper.paper_id);
    assert.equal(paper.total_marks, paper.is_as ? 70 : 140);
    assert.deepEqual(paper.question_ids, pack.questions.map(q => q.question_id));
  }
});

test('tags respect component and qualification scope', () => {
  for (const q of units) {
    const tags = [...q.primary_spec_points, ...q.crossover_spec_points];
    assert(q.primary_spec_points.length && tags.every(id => leaves.has(id)), q.question_id);
    if (q.is_as) {
      assert.equal(q.qualification_code, 'H046');
      assert(tags.every(id => asShared.has(id)), q.question_id);
      assert.equal(q.introduced_year, 12);
    } else {
      assert(!tags.some(id => id.startsWith('OCR_CS_AS_')), q.question_id);
      if (q.component === '01') assert(q.primary_spec_points.every(id => id.startsWith('OCR_CS_1.')), q.question_id);
      assert.equal(q.introduced_year, q.primary_spec_points.every(id => asShared.has(id)) ? 12 : 13, q.question_id);
    }
  }
});

test('units are model-reviewed source pixels with unscored context and their own scheme rows', () => {
  for (const q of units) {
    assert.equal(q.source_type, 'real_past_paper');
    assert.equal(q.is_sample, false);
    assert.equal(q.provenance.reviewer_type, 'model');
    assert(['easy', 'medium', 'hard'].includes(q.difficulty), q.question_id);
    assert(q.provenance.difficulty_basis && q.preview_text, q.question_id);
    assert.match(q.content.question_image_url, /^assets\/cs\/OCR_H[04]46_[A-Z0-9_]+\/Q\d{2}[_a-z]*\.webp$/);
    assert.match(q.content.mark_scheme_image_url, /_scheme\.webp$/);
    assert(['part', 'parent_part'].includes(q.scheme_scope));
    for (const intro of q.context.intros || []) assert(/^(Question|Part) /.test(intro.label) && intro.image_url.startsWith('assets/cs/'));
  }
  // OCR prints one scheme row for these whole parts; nothing else falls back.
  assert.deepEqual(units.filter(q => q.scheme_scope === 'parent_part').map(q => q.question_id).sort(),
    ['OCR_H046_SAMPLE_02_Q04_c_i', 'OCR_H046_SAMPLE_02_Q04_c_ii', 'OCR_H446_2021_NOVEMBER_01_Q07_b_i']);
});

test('reviewed specimen slices stop before sibling prompts and paper-wide scheme grids', () => {
  const byId = new Map(units.map(q => [q.question_id, q]));
  const sourceRange = label => byId.get(`OCR_H446_SAMPLE_02_${label}`).provenance.source_regions;
  for (const [earlier, later] of [['Q07_b', 'Q07_c'], ['Q09_a', 'Q09_b'], ['Q09_b', 'Q09_c']]) {
    assert(sourceRange(earlier).at(-1).bbox[3] < sourceRange(later)[0].bbox[1]);
  }
  for (const [id, page] of [
    ['OCR_H046_SAMPLE_01_Q07_c', 34],
    ['OCR_H046_SAMPLE_02_Q06_c', 26],
    ['OCR_H446_SAMPLE_01_Q10_b', 52],
    ['OCR_H446_SAMPLE_02_Q10_e', 51],
  ]) {
    assert.equal(byId.get(id).provenance.scheme_regions.at(-1).page, page);
  }
});

test('CS dependencies use scored answers only when required by the source', () => {
  const byId = new Map(units.map(q => [q.question_id, q]));
  const search = byId.get('OCR_H446_2021_NOVEMBER_01_Q07_b_ii');
  assert.deepEqual(search.depends_on_question_ids, ['OCR_H446_2021_NOVEMBER_01_Q07_b_i']);
  const gates = byId.get('OCR_H446_SAMPLE_01_Q10_a_iii');
  assert.deepEqual(gates.depends_on_question_ids, ['OCR_H446_SAMPLE_01_Q10_a_i', 'OCR_H446_SAMPLE_01_Q10_a_ii']);
  for (const part of ['ii', 'iii', 'iv']) {
    const q = byId.get(`OCR_H446_2021_NOVEMBER_02_Q08_b_${part}`);
    assert(!q.depends_on_question_ids?.length);
    assert.equal(q.context.figures.length, 1);
    assert(q.provenance.display_context_regions.length);
  }
  assert(!byId.get('OCR_H446_SAMPLE_02_Q10_d_ii').depends_on_question_ids?.length);
  assert.equal(byId.get('OCR_H446_SAMPLE_02_Q10_d_iii').context.figures.length, 1);
  assert(units.every(q => !q.depends_on_question_ids?.length || !q.context.stem_image_url));
});

test('CS packs validate and stay out of the live index until OCR rights are confirmed', () => {
  const subject = read('data/subjects.json').find(s => s.subject_id === 'OCR_ALEVEL_CS_H446');
  assert.equal(subject.content_year_source, 'introduced_year');
  const index = createSpecIndex(); index.add(spec);
  const issues = validateBundle({subject, papers: packs.flatMap(p => p.papers), questions: units, questionsById: new Map(units.map(q => [q.question_id, q]))}, index);
  assert.deepEqual(issues.filter(i => i.level === 'error'), []);
  const live = read('data/packs/index.json').packs.map(p => p.file).filter(f => f.startsWith('cs/'));
  assert.equal(live.length, coverage.published ? 22 : 0);
  if (!coverage.published) assert.match(coverage.rights_basis, /NOT CONFIRMED/);
  assert.equal(Object.keys(read('data/imports/cs/identities.json').units).length, 724);
  const years = read('data/curriculum/index.json').mappings.find(m => m.subject_id === 'OCR_ALEVEL_CS_H446');
  assert.deepEqual(years.years.map(y => [y.year, y.coverage.length]), [[12, 76], [13, 37]]);
});
