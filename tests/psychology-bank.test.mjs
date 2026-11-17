import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, readdirSync} from 'node:fs';
import {createSpecIndex} from '../js/engine/spec-index.js';
import {validateBundle} from '../js/data/schema.js';
import {LEGACY_SPEC_IDS} from '../js/config/spec-id-migrations.js';

const read = path => JSON.parse(readFileSync(new URL('../' + path, import.meta.url), 'utf8'));
const coverage = read('data/imports/psychology/coverage.json');
const files = readdirSync(new URL('../data/packs/psychology/', import.meta.url)).filter(f => f.endsWith('.json'));
const packs = files.map(f => read('data/packs/psychology/' + f));
const inventories = ['7182', '7181'].map(n => read(`data/imports/psychology/inventory/${n}-inventory.json`));
const spec = read('data/specs/AQA_ALEVEL_PSYCH_7182.json');
const topics = spec.sections.flatMap(s => s.topics);
const leaves = new Map(topics.flatMap(t => t.points.map(p => [p.id, {...p, topic: t.code}])));
const asShared = new Set(Object.values(spec.as_section_map));
const units = packs.flatMap(p => p.questions);
const byId = new Map(units.map(q => [q.question_id, q]));
const ROUTE = ['4.3.4', '4.3.5', '4.3.9'];

test('Psychology leaves are the Version 1.4 specification bullets in printed order', () => {
  assert.equal(spec.official_source.sha256, 'db561ba9c36a9109830bcb03bb16d138b85907f068620cce01eff70fdee6ad4d');
  assert.equal(spec.official_source.version, 'Version 1.4');
  assert.equal(leaves.size, 84);
  assert.deepEqual([...leaves.keys()], spec.point_order);
  for (const [id, p] of leaves) {
    const [, section, bullet] = /^AQA_PSYCH_([\d.]+)_b(\d+)$/.exec(id);
    assert.equal(p.code, `${section} (${bullet})`);
    assert(p.content.length && p.official_reference.source_pages.length, id);
  }
  assert.deepEqual(topics.filter(t => t.kind === 'option').map(t => t.code), ROUTE);
  assert.deepEqual(Object.keys(spec.options_not_in_scope), ['4.3.2', '4.3.3', '4.3.6', '4.3.7', '4.3.8', '4.3.10']);
  assert.equal(asShared.size, 48);
  for (const target of Object.values(LEGACY_SPEC_IDS).flat()) if (String(target).startsWith('AQA_PSYCH_')) assert(leaves.has(target), target);
});

test('every public AQA 7182 and AS 7181 booklet is built and accounted for', () => {
  const ids = inventories.flatMap(i => i.papers.map(p => p.paper_id)).sort();
  assert.deepEqual(packs.map(p => p.papers[0].paper_id).sort(), ids);
  assert.equal(ids.length, 35);
  assert.deepEqual(coverage.queued_public_booklets, []);
  const {booklets, printed_parts, scored_units, removed_content_parts, out_of_route_option_parts} = coverage.totals;
  assert.deepEqual({booklets, printed_parts, scored_units, removed_content_parts, out_of_route_option_parts},
    {booklets: 35, printed_parts: 894, scored_units: 653, removed_content_parts: 49, out_of_route_option_parts: 192});
  assert.equal(new Set(units.map(q => q.question_id)).size, 653);
  assert.deepEqual(coverage.leaves_without_primary_units, []);
});

test('each booklet reconciles: published and removed-content parts add up to the cover maximum', () => {
  for (const pack of packs) {
    const [paper] = pack.papers;
    const excluded = paper.excluded_questions || [];
    const labels = [...pack.questions.map(q => q.part_label || q.question_number), ...excluded.map(x => x.question_number)];
    assert.equal(new Set(labels).size, labels.length, paper.paper_id);
    const removed = excluded.filter(x => x.reason_type === 'removed_from_specification').reduce((s, x) => s + x.marks, 0);
    // In-route parts (Paper 3: Section A plus one route topic per option section) make up the cover maximum.
    assert.equal(pack.questions.reduce((s, q) => s + q.marks, 0) + removed, paper.total_marks, paper.paper_id);
    assert.equal(paper.total_marks, paper.is_as ? 72 : 96, paper.paper_id);
    for (const x of excluded) assert(['removed_from_specification', 'option_not_in_route'].includes(x.reason_type) && x.reason, paper.paper_id);
  }
});

test('Paper 3 publishes only the route options; tags respect routes and AS content', () => {
  for (const q of units) {
    for (const id of q.primary_spec_points) {
      const leaf = leaves.get(id);
      assert(leaf, `${q.question_id} ${id}`);
      if (q.route) assert(leaf.topic === q.route || leaf.topic.startsWith('4.2.3'), `${q.question_id} ${id} outside ${q.route}`);
      if (q.component === '03' && !q.is_as && q.section === 'A') assert(leaf.topic === '4.3.1' || leaf.topic.startsWith('4.2.3'), q.question_id);
    }
    if (q.component === '03' && !q.is_as && q.section !== 'A') assert(ROUTE.includes(q.route), q.question_id);
    if (q.is_as) {
      assert.equal(q.level, 'AS');
      assert.equal(q.qualification_code, '7181');
      assert(q.primary_spec_points.every(id => asShared.has(id)), q.question_id);
      assert.equal(q.introduced_year, 12);
    } else {
      assert.equal(q.introduced_year, q.primary_spec_points.every(id => asShared.has(id)) ? 12 : 13, q.question_id);
    }
  }
  for (const x of coverage.excluded_options_not_in_route) assert(!/Cognition and development|Schizophrenia|Forensic/i.test(x.reason), x.reason);
});

test('removed-content parts are listed with a reason and never published', () => {
  const removed = coverage.excluded_removed_from_specification;
  assert.equal(removed.length, 49);
  const published = new Set(units.map(q => `${q.paper_id} ${q.part_label || q.question_number}`));
  for (const x of removed) {
    assert(!published.has(`${x.paper_id} ${x.question_number}`), x.paper_id + x.question_number);
    assert.match(x.reason, /not in the v1\.4 specification|removed in v1\.4/);
  }
});

test('units are model-reviewed, source-rendered and keep their context unscored', () => {
  for (const q of units) {
    assert.equal(q.source_type, 'real_past_paper');
    assert.equal(q.provenance.reviewer_type, 'model');
    assert(['easy', 'medium', 'hard'].includes(q.difficulty), q.question_id);
    assert(q.provenance.difficulty_basis && q.preview_text, q.question_id);
    assert.match(q.question_id, /^AQA_718[12]_(\d{4}_(JUNE|NOVEMBER)|SAMPLE2?)_0[123]_Q\d{2}_P\d{2}$/);
    assert.match(q.content.question_image_url, /^assets\/psychology\/AQA_718[12]_[A-Z0-9_]+\/Q\d{2}_P\d{2}\.webp$/);
    assert.match(q.content.mark_scheme_image_url, /_scheme\.webp$/);
    assert.equal(q.scheme_scope, 'part');
    for (const figure of q.context.figures || []) assert(figure.source === 'question_paper' && /^(Shared information|Question \d)/.test(figure.label), q.question_id);
    for (const dep of q.depends_on_question_ids || []) {
      assert(byId.has(dep) && byId.get(dep).paper_id === q.paper_id, q.question_id);
      assert(q.context.shared_stem_html && q.context.figures.some(f => f.label.includes('your answer')), q.question_id);
    }
  }
  assert(units.filter(q => q.depends_on_question_ids).length >= 5);
});

test('Psychology packs validate against the schema and are wired to the subject', () => {
  const subject = read('data/subjects.json').find(s => s.subject_id === 'AQA_ALEVEL_PSYCH_7182');
  assert.equal(subject.content_year_source, 'introduced_year');
  assert.deepEqual(subject.qualifications.map(x => x.code), ['7182', '7181']);
  const index = createSpecIndex(); index.add(spec);
  const papers = packs.flatMap(p => p.papers);
  const issues = validateBundle({subject, papers, questions: units, questionsById: byId}, index);
  assert.deepEqual(issues.filter(i => i.level === 'error'), []);
  const short = new Set(papers.filter(p => p.excluded_questions?.length).map(p => p.paper_id));
  for (const issue of issues) assert(short.has(issue.id), issue.id + ': ' + issue.message);
  const live = read('data/packs/index.json').packs.map(p => p.file);
  assert.equal(live.filter(f => f.startsWith('psychology/')).length, coverage.published ? 35 : 0);
  assert.equal(Object.keys(read('data/imports/psychology/identities.json').units).length, 653);
  const years = read('data/curriculum/index.json').mappings.find(m => m.subject_id === 'AQA_ALEVEL_PSYCH_7182');
  assert.deepEqual(years.years.map(y => [y.year, y.coverage.length]), [[12, 48], [13, 36]]);
});
