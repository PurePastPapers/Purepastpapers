import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, readdirSync} from 'node:fs';
import {createSpecIndex} from '../js/engine/spec-index.js';
import {validateBundle} from '../js/data/schema.js';
import {LEGACY_SPEC_IDS} from '../js/config/spec-id-migrations.js';

const read = path => JSON.parse(readFileSync(new URL('../' + path, import.meta.url), 'utf8'));
const coverage = read('data/imports/englit/coverage.json');
const files = readdirSync(new URL('../data/packs/englit/', import.meta.url)).filter(f => f.endsWith('.json'));
const packs = files.map(f => read('data/packs/englit/' + f));
const inventories = ['9et0', '8et0'].map(n => read(`data/imports/englit/inventory/${n}-inventory.json`));
const spec = read('data/specs/EDX_ALEVEL_ENGLIT_9ET0.json');
const topics = spec.sections.flatMap(s => s.topics);
const leaves = new Map(topics.flatMap(t => t.points.map(p => [p.id, {...p, topic: t.id}])));
const asShared = new Set(Object.values(spec.as_section_map));
const units = packs.flatMap(p => p.questions);
const byId = new Map(units.map(q => [q.question_id, q]));
const ROUTE_TOPIC = {A: 'EDX_ENGLIT_SHAKES', B: 'EDX_ENGLIT_DRAMA', P: 'EDX_ENGLIT_PROSE', PD: 'EDX_ENGLIT_MODERN', R: 'EDX_ENGLIT_POET'};

test('English Literature leaves are the route set texts and prescribed poems of Issue 11', () => {
  assert.equal(spec.official_source.sha256, '2f27dbd3c208726149c2ed237160a04bda1784f8eec28d3e70d6043ce856fd83');
  assert.equal(spec.official_source.version, 'Issue 11');
  assert.equal(leaves.size, 45);
  assert.deepEqual([...leaves.keys()], spec.point_order);
  for (const [id, p] of leaves) assert(p.content.length && p.official_reference.source_pages.length, id);
  assert.equal(topics.find(t => t.id === 'EDX_ENGLIT_MODERN').points.length, 21);
  assert.equal(topics.find(t => t.id === 'EDX_ENGLIT_POET').points.length, 19);
  assert.equal(asShared.size, 23);
  for (const target of Object.values(LEGACY_SPEC_IDS).flat()) if (String(target).startsWith('EDX_ENGLIT_')) assert(leaves.has(target), target);
});

test('every public 9ET0 and AS 8ET0 booklet is built and accounted for', () => {
  const ids = inventories.flatMap(i => i.papers.map(p => p.paper_id)).sort();
  assert.deepEqual(packs.map(p => p.papers[0].paper_id).sort(), ids);
  assert.equal(ids.length, 45);
  assert.deepEqual(coverage.queued_public_booklets, []);
  const {booklets, printed_questions, scored_units, removed_content_questions, out_of_route_questions} = coverage.totals;
  assert.deepEqual({booklets, printed_questions, scored_units, removed_content_questions, out_of_route_questions},
    {booklets: 45, printed_questions: 900, scored_units: 142, removed_content_questions: 2, out_of_route_questions: 756});
  assert.equal(new Set(units.map(q => q.question_id)).size, 142);
});

test('each booklet reconciles: one route question per section makes up the cover total', () => {
  for (const pack of packs) {
    const [paper] = pack.papers;
    const total = paper.choice_groups.reduce((s, g) => s + Math.max(...g.map(id => byId.get(id).marks)), 0)
      + pack.questions.filter(q => !paper.choice_groups.some(g => g.includes(q.question_id))).reduce((s, q) => s + q.marks, 0);
    assert.equal(total, paper.total_marks, paper.paper_id);
    assert.equal(paper.total_marks, {'9ET0 01': 60, '9ET0 02': 40, '9ET0 03': 60, '8ET0 01': 72, '8ET0 02': 44}[`${paper.qualification_code} ${paper.paper_code}`], paper.paper_id);
    for (const x of paper.excluded_questions || []) assert(['option_not_in_route', 'removed_from_specification'].includes(x.reason_type) && x.reason, paper.paper_id);
  }
});

test('route tags, removed poems and content years', () => {
  for (const q of units) {
    for (const id of q.primary_spec_points) {
      assert(leaves.has(id), `${q.question_id} ${id}`);
      assert(leaves.get(id).topic === ROUTE_TOPIC[q.route] || (q.route === 'PD' && id === 'EDX_ENGLIT_MODERN_UNSEEN'), q.question_id);
    }
    if (q.route === 'A') assert.deepEqual(q.crossover_spec_points, ['EDX_ENGLIT_SHAKES_A.2']);
    if (q.route === 'PD' && !q.is_as) {
      assert(q.primary_spec_points.includes('EDX_ENGLIT_MODERN_UNSEEN'), q.question_id);
      assert(q.context.figures?.[0]?.label.startsWith('Source Booklet'), q.question_id);
    }
    if (q.route === 'R') {
      assert.equal(q.provenance.rubric_regions.length, 1, q.question_id);
      assert(q.provenance.rubric_regions[0].bbox[3] <= q.provenance.source_regions[0].bbox[1], q.question_id);
      assert.match(q.context.figures[0].image_url, /\/HEAD_R_instructions\.webp$/, q.question_id);
    }
    if (q.route === 'P') {
      assert.equal(q.provenance.rubric_regions.length, 1, q.question_id);
      const [rubric] = q.provenance.rubric_regions;
      const [task] = q.provenance.source_regions;
      assert(rubric.page < task.page || (rubric.page === task.page && rubric.bbox[3] <= task.bbox[1]), q.question_id);
      assert.match(q.context.figures[0].image_url, /\/HEAD_P_instructions\.webp$/, q.question_id);
    }
    if (q.is_as) {
      assert.equal(q.level, 'AS');
      assert(q.primary_spec_points.every(id => asShared.has(id)), q.question_id);
      assert.equal(q.introduced_year, 12);
    } else {
      assert.equal(q.introduced_year, q.primary_spec_points.every(id => asShared.has(id)) ? 12 : 13, q.question_id);
    }
  }
  assert.deepEqual(coverage.excluded_removed_from_specification.map(x => `${x.paper_id} ${x.question_number}`).sort(),
    ['EDX_8ET0_2017_JUNE_01 1', 'EDX_9ET0_2017_JUNE_03 12']);
});

test('units are model-reviewed and source-rendered with their own scheme', () => {
  for (const q of units) {
    assert.equal(q.source_type, 'real_past_paper');
    assert.equal(q.provenance.reviewer_type, 'model');
    assert(['medium', 'hard'].includes(q.difficulty), q.question_id);
    assert(q.provenance.difficulty_basis && q.preview_text, q.question_id);
    assert.match(q.question_id, /^EDX_[89]ET0_\d{4}_(JUNE|OCTOBER)_0[123]_Q\d{2}_U01$/);
    assert.match(q.content.question_image_url, /^assets\/englit\/EDX_[89]ET0_[A-Z0-9_]+\/Q\d{2}_U01\.webp$/);
    assert.match(q.content.mark_scheme_image_url, /_scheme\.webp$/);
    assert(q.provenance.scheme_grid_regions.length && q.provenance.scheme_indicative_regions.length, q.question_id);
    assert.equal(q.part_label, undefined);
  }
});

test('English Literature packs validate against the schema and are wired to the subject', () => {
  const subject = read('data/subjects.json').find(s => s.subject_id === 'EDX_ALEVEL_ENGLIT_9ET0');
  assert.equal(subject.content_year_source, 'introduced_year');
  assert.deepEqual(subject.qualifications.map(x => x.code), ['9ET0', '8ET0']);
  const index = createSpecIndex(); index.add(spec);
  const papers = packs.flatMap(p => p.papers);
  const issues = validateBundle({subject, papers, questions: units, questionsById: byId}, index);
  assert.deepEqual(issues, []);
  const live = read('data/packs/index.json').packs.map(p => p.file);
  assert.equal(live.filter(f => f.startsWith('englit/')).length, coverage.published ? 45 : 0);
  assert.equal(Object.keys(read('data/imports/englit/identities.json').units).length, 142);
  const years = read('data/curriculum/index.json').mappings.find(m => m.subject_id === 'EDX_ALEVEL_ENGLIT_9ET0');
  assert.deepEqual(years.years.map(y => [y.year, y.coverage.length]), [[12, 23], [13, 22]]);
});
