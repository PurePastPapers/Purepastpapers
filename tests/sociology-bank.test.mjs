import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, readdirSync} from 'node:fs';
import {createSpecIndex} from '../js/engine/spec-index.js';
import {validateBundle} from '../js/data/schema.js';
import {LEGACY_SPEC_IDS} from '../js/config/spec-id-migrations.js';

const read = path => JSON.parse(readFileSync(new URL('../' + path, import.meta.url), 'utf8'));
const coverage = read('data/imports/sociology/coverage.json');
const files = readdirSync(new URL('../data/packs/sociology/', import.meta.url)).filter(f => f.endsWith('.json'));
const packs = files.map(f => read('data/packs/sociology/' + f));
const inventories = ['7192', '7191'].map(n => read(`data/imports/sociology/inventory/${n}-inventory.json`));
const spec = read('data/specs/AQA_ALEVEL_SOC_7192.json');
const topics = spec.sections.flatMap(s => s.topics);
const leaves = new Map(topics.flatMap(t => t.points.map(p => [p.id, {...p, topic: t.code}])));
const asShared = new Set(Object.values(spec.as_section_map));
const units = packs.flatMap(p => p.questions);
const byId = new Map(units.map(q => [q.question_id, q]));

test('Sociology leaves are the Version 1.2 specification bullets in printed order', () => {
  assert.equal(spec.official_source.sha256, '914de53681e7f64301b44b72e952ddd12f50c25b23e96ac40035c87deff5c62a');
  assert.equal(spec.official_source.version, 'Version 1.2');
  assert.equal(leaves.size, 30);
  assert.deepEqual([...leaves.keys()], spec.point_order);
  for (const [id, p] of leaves) {
    const [, section, bullet] = /^AQA_SOC_([\d.]+)_b(\d+)$/.exec(id);
    assert.equal(p.code, `${section} (${bullet})`);
    assert(p.content.length && p.official_reference.source_pages.length, id);
  }
  // Theory and Methods is printed twice (4.1.3, 4.3.2); it is one set of leaves.
  assert(!spec.point_order.some(id => id.startsWith('AQA_SOC_4.3.2')));
  assert.deepEqual(topics.filter(t => t.kind === 'option').map(t => t.code), ['4.2.2', '4.2.5']);
  assert.equal(asShared.size, 15);
  for (const target of Object.values(LEGACY_SPEC_IDS).flat()) if (String(target).startsWith('AQA_SOC_')) assert(leaves.has(target), target);
});

test('every public AQA 7192 and AS 7191 booklet is built and accounted for', () => {
  const ids = inventories.flatMap(i => i.papers.map(p => p.paper_id)).sort();
  assert.deepEqual(packs.map(p => p.papers[0].paper_id).sort(), ids);
  assert.equal(ids.length, 31);
  assert.deepEqual(coverage.queued_public_booklets, []);
  const {booklets, printed_parts, scored_units, out_of_route_option_parts} = coverage.totals;
  assert.deepEqual({booklets, printed_parts, scored_units, out_of_route_option_parts},
    {booklets: 31, printed_parts: 392, scored_units: 191, out_of_route_option_parts: 201});
  assert.equal(new Set(units.map(q => q.question_id)).size, 191);
  assert.deepEqual(coverage.leaves_without_primary_units, ['AQA_SOC_4.1.3_b10']);
});

test('each booklet reconciles: published route questions make up the cover maximum', () => {
  for (const pack of packs) {
    const [paper] = pack.papers;
    const excluded = paper.excluded_questions || [];
    assert(excluded.every(x => x.reason_type === 'option_not_in_route' && x.reason), paper.paper_id);
    assert.equal(pack.questions.reduce((s, q) => s + q.marks, 0), paper.total_marks, paper.paper_id);
    assert.equal(paper.total_marks, paper.is_as ? 60 : 80, paper.paper_id);
  }
});

test('Paper 2 publishes only the route options; tags respect routes and AS content', () => {
  for (const q of units) {
    for (const id of q.primary_spec_points) {
      const leaf = leaves.get(id);
      assert(leaf, `${q.question_id} ${id}`);
      if (q.route) assert.equal(leaf.topic, q.route, q.question_id);
    }
    if (q.component === '02') assert(q.route === '4.2.2' || (q.route === '4.2.5' && !q.is_as) || (q.is_as && q.section === 'A'), q.question_id);
    if (q.is_as) {
      assert.equal(q.level, 'AS');
      assert(q.primary_spec_points.every(id => asShared.has(id)), q.question_id);
      assert.equal(q.introduced_year, 12);
    } else {
      assert.equal(q.introduced_year, q.primary_spec_points.every(id => asShared.has(id)) ? 12 : 13, q.question_id);
    }
  }
});

test('units are model-reviewed and source-rendered with their own item and scheme', () => {
  for (const q of units) {
    assert.equal(q.source_type, 'real_past_paper');
    assert.equal(q.provenance.reviewer_type, 'model');
    assert(['easy', 'medium', 'hard'].includes(q.difficulty), q.question_id);
    assert(q.provenance.difficulty_basis && q.preview_text, q.question_id);
    assert.match(q.question_id, /^AQA_719[12]_(\d{4}_(JUNE|NOVEMBER)|SAMPLE)_0[123]_Q\d{2}_P00$/);
    assert.match(q.content.question_image_url, /^assets\/sociology\/AQA_719[12]_[A-Z0-9_]+\/Q\d{2}_P00\.webp$/);
    assert.match(q.content.mark_scheme_image_url, /_scheme\.webp$/);
    assert.equal(q.part_label, undefined);
  }
});

test('Sociology packs validate against the schema and are wired to the subject', () => {
  const subject = read('data/subjects.json').find(s => s.subject_id === 'AQA_ALEVEL_SOC_7192');
  assert.equal(subject.content_year_source, 'introduced_year');
  assert.deepEqual(subject.qualifications.map(x => x.code), ['7192', '7191']);
  const index = createSpecIndex(); index.add(spec);
  const papers = packs.flatMap(p => p.papers);
  const issues = validateBundle({subject, papers, questions: units, questionsById: byId}, index);
  assert.deepEqual(issues.filter(i => i.level === 'error'), []);
  assert.deepEqual(issues, []);
  const live = read('data/packs/index.json').packs.map(p => p.file);
  assert.equal(live.filter(f => f.startsWith('sociology/')).length, coverage.published ? 31 : 0);
  assert.equal(Object.keys(read('data/imports/sociology/identities.json').units).length, 191);
  const years = read('data/curriculum/index.json').mappings.find(m => m.subject_id === 'AQA_ALEVEL_SOC_7192');
  assert.deepEqual(years.years.map(y => [y.year, y.coverage.length]), [[12, 15], [13, 15]]);
});
