import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, readdirSync} from 'node:fs';
import {createSpecIndex} from '../js/engine/spec-index.js';
import {validateBundle} from '../js/data/schema.js';

const read = path => JSON.parse(readFileSync(new URL('../' + path, import.meta.url), 'utf8'));
const coverage = read('data/imports/chem/coverage.json');
const files = readdirSync(new URL('../data/packs/chem/', import.meta.url)).filter(f => f.endsWith('.json'));
const packs = files.map(f => read('data/packs/chem/' + f));
const inventories = ['H432', 'H032'].map(n => read(`data/imports/chem/inventory/${n}-inventory.json`));
const spec = read('data/specs/OCR_ALEVEL_CHEM_H432.json');
const leaves = new Map(spec.sections.flatMap(s => s.topics.flatMap(t => t.points.map(p => [p.id, p]))));
const asShared = new Set(Object.values(spec.as_section_map).map(v => v.leaf));
const units = packs.flatMap(p => p.questions);
const total = {H432: {'01': 100, '02': 100, '03': 70}, H032: {'01': 70, '02': 70}};

test('every public OCR H432 and AS H032 booklet is built and accounted for', () => {
  const ids = inventories.flatMap(i => i.papers.map(p => p.paper_id)).sort();
  assert.deepEqual(packs.map(p => p.papers[0].paper_id).sort(), ids);
  assert.equal(ids.length, 52);
  assert.deepEqual(coverage.queued_public_booklets, []);
  assert.equal(units.length, 2017); // 2,018 printed tariffs minus the one question OCR withdrew
  assert.equal(new Set(units.map(q => q.question_id)).size, 2017);
  assert.equal(coverage.totals.scored_units, 2017);
  assert.equal(coverage.totals.printed_parts, 2018);
  assert.equal(coverage.totals.source_questions, 839);
  assert.equal(coverage.totals.marks_available, 4240);
});

test('each booklet reconciles to its cover total; the withdrawn June 2022 question is excluded and counted', () => {
  for (const pack of packs) {
    const [paper] = pack.papers;
    const excluded = (paper.excluded_questions || []).reduce((n, e) => n + e.marks, 0);
    const printed = pack.questions.reduce((n, q) => n + q.marks, 0) + excluded;
    assert.equal(printed, total[paper.qualification_code][paper.paper_code], paper.paper_id);
    assert.equal(paper.total_marks, printed - excluded);
    assert.deepEqual(paper.question_ids, pack.questions.map(q => q.question_id));
  }
  const june22 = packs.find(p => p.papers[0].paper_id === 'OCR_H432_2022_JUNE_01').papers[0];
  assert.equal(june22.total_marks, 99);
  assert.deepEqual(june22.excluded_questions.map(e => e.question_number), ['13']);
  assert.equal(coverage.excluded_copyright_removed.length, 1);
});

test('tags respect component and qualification scope', () => {
  const allowed = {'01': '1235', '02': '1246', '03': '123456'};
  for (const q of units) {
    const tags = [...q.primary_spec_points, ...q.crossover_spec_points];
    assert(q.primary_spec_points.length && tags.every(id => leaves.has(id)), q.question_id);
    if (q.is_as) {
      assert.equal(q.qualification_code, 'H032');
      assert(tags.every(id => asShared.has(id)), q.question_id);
      assert.equal(q.introduced_year, 12);
    } else {
      assert(q.primary_spec_points.every(id => allowed[q.component].includes(id.slice(9, 10))), q.question_id);
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
    assert.match(q.content.question_image_url, /^assets\/chem\/OCR_H[04]32_[A-Z0-9_]+\/Q\d{2}[_a-z]*\.webp$/);
    assert.match(q.content.mark_scheme_image_url, /_scheme\.webp$/);
    assert(['part', 'parent_part', 'full_question'].includes(q.scheme_scope));
    for (const intro of q.context.intros || []) assert(/^(Question|Part) /.test(intro.label) && intro.image_url.startsWith('assets/chem/'));
  }
  assert.deepEqual(units.filter(q => q.scheme_scope !== 'part').map(q => q.question_id), []);
  const specimen = units.find(q => q.question_id === 'OCR_H432_SAMPLE_03_Q01_j');
  assert.deepEqual(specimen.provenance.scheme_regions.map(region => region.page), [32, 32]);
  assert.equal(units.filter(q => q.is_official_sample).length, 198);
  assert(units.every(q => !q.is_official_sample || /SAMPLE/.test(q.paper_id)));
  const erratum = units.filter(q => q.provenance.board_erratum);
  assert.deepEqual(erratum.map(q => q.question_id), ['OCR_H032_2017_JUNE_01_Q23_c']);
});

test('parts that build on an earlier answer are held back behind it', () => {
  const byId = new Map(units.map(q => [q.question_id, q]));
  const gated = units.filter(q => q.depends_on_question_ids?.length);
  // Four more matched by mistake (graph or equation made in the same part) and were removed
  // by tools/parts/drop-false-dependencies.py; tools/chem/build.py now skips them.
  // tools/parts/link-dependencies.py adds links read from the printed wording (2026-11-20);
  // the build's own links also include the reviewed nickel experiment comparison.
  assert.equal(gated.filter(q => !q.provenance?.dependency_detected).length, 4);
  for (const q of gated) for (const id of q.depends_on_question_ids) {
    const earlier = byId.get(id);
    assert(earlier && earlier.paper_id === q.paper_id && earlier.question_number === q.question_number, q.question_id);
  }
  assert.deepEqual(byId.get('OCR_H432_2019_JUNE_01_Q20_b_v').depends_on_question_ids, ['OCR_H432_2019_JUNE_01_Q20_b_iii']);
  assert.deepEqual(byId.get('OCR_H032_2020_NOVEMBER_02_Q01_b_iii').depends_on_question_ids,
    ['OCR_H032_2020_NOVEMBER_02_Q01_b_i', 'OCR_H032_2020_NOVEMBER_02_Q01_b_ii']);
});

test('Chemistry packs validate and are live in the pack index', () => {
  const subject = read('data/subjects.json').find(s => s.subject_id === 'OCR_ALEVEL_CHEM_H432');
  const index = createSpecIndex(); index.add(spec);
  const issues = validateBundle({subject, papers: packs.flatMap(p => p.papers), questions: units, questionsById: new Map(units.map(q => [q.question_id, q]))}, index);
  assert.deepEqual(issues.filter(i => i.level === 'error'), []);
  const live = read('data/packs/index.json').packs.map(p => p.file).filter(f => f.startsWith('chem/'));
  assert.equal(live.length, 52);
  assert.equal(coverage.published, true);
  assert.equal(Object.keys(read('data/imports/chem/identities.json').units).length, 2017);
});
