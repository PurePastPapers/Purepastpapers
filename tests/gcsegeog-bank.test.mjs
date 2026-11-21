import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, readdirSync} from 'node:fs';
import {createSpecIndex} from '../js/engine/spec-index.js';
import {validateBundle} from '../js/data/schema.js';

const read = path => JSON.parse(readFileSync(new URL('../' + path, import.meta.url), 'utf8'));
const coverage = read('data/imports/gcsegeog/coverage.json');
const files = readdirSync(new URL('../data/packs/gcsegeog/', import.meta.url)).filter(f => f.endsWith('.json'));
const packs = files.map(f => read('data/packs/gcsegeog/' + f));
const inventory = read('data/imports/gcsegeog/inventory/8035-inventory.json');
const spec = read('data/specs/AQA_GCSE_GEOG_8035.json');
const leaves = new Map(spec.sections.flatMap(s => s.topics.flatMap(t => t.points.map(p => [p.id, p]))));
const units = packs.flatMap(p => p.questions);
const NOT_IMPORTED = 'AQA_8035_2022_JUNE_02';
const P = 'AQA_GCSE_GEOG_';

test('every public AQA 8035 booklet is built and accounted for, the adapted June 2022 Paper 2 recorded as not imported', () => {
  const ids = inventory.papers.map(p => p.paper_id).filter(id => id !== NOT_IMPORTED).sort();
  assert.equal(inventory.papers.length, 21);
  assert.deepEqual(packs.map(p => p.papers[0].paper_id).sort(), ids);
  assert.deepEqual(coverage.queued_public_booklets, []);
  assert.deepEqual(coverage.not_imported.map(x => x.paper_id), [NOT_IMPORTED]);
  const {booklets, printed_parts, scored_units, excluded_parts} = coverage.totals;
  assert.deepEqual({booklets, printed_parts, scored_units, excluded_parts}, {booklets: 20, printed_parts: 662, scored_units: 631, excluded_parts: 31});
  assert.equal(units.length, 631);
  assert.equal(new Set(units.map(q => q.question_id)).size, 631);
  assert.equal(Object.keys(read('data/imports/gcsegeog/identities.json').units).length, 631);
});

test('each booklet reconciles to its cover maximum, counting the right number of options per choice group', () => {
  const choose = {};
  for (const pack of packs) {
    const [paper] = pack.papers;
    const byId = new Map(pack.questions.map(q => [q.question_id, q]));
    const totals = {};
    for (const q of pack.questions) totals[q.question_number] = (totals[q.question_number] || 0) + q.marks;
    for (const x of paper.excluded_questions || []) { const n = String(parseInt(x.question_number)); totals[n] = (totals[n] || 0) + x.marks; }
    const groups = paper.choice_groups || [];
    const picks = paper.choice_choose || [];
    assert.equal(picks.length, groups.length, paper.paper_id);
    const grouped = new Set(groups.flat(2).map(id => byId.get(id)?.question_number));
    // An option that was excluded entirely has no units, so recount from the group's question numbers.
    let marks = Object.entries(totals).filter(([n]) => !grouped.has(n)).reduce((s, [, m]) => s + m, 0);
    groups.forEach((group, i) => {
      const sums = group.map(option => totals[byId.get(option[0]).question_number]).sort((a, b) => b - a);
      marks += sums.slice(0, picks[i]).reduce((s, m) => s + m, 0);
    });
    assert.equal(marks, paper.total_marks, paper.paper_id);
    choose[paper.paper_code] = picks.join(',');
    assert.equal(paper.level, 'GCSE');
    assert.equal(paper.total_marks, {AQA_8035_2021_NOVEMBER_03: 56, AQA_8035_2022_JUNE_03: 56}[paper.paper_id] || (paper.paper_code === '03' ? 76 : 88), paper.paper_id);
  }
  // Paper 1 Section C is "answer two of three"; Paper 2 Section C is Question 3 plus one of 4, 5, 6.
  assert.deepEqual(Object.entries(choose).sort(), [['01', '2'], ['02', '1'], ['03', '']]);
});

test('tags are valid 8035 key ideas and route-scoped: each section or question uses only its own leaves or the skills', () => {
  const prefix = {HAZ: ['HAZ_1.'], LIVING: ['LIVING_2.'], 'UKLAND_3.2': ['UKLAND_3.2.', 'UKLAND_3.1.'], 'UKLAND_3.3': ['UKLAND_3.3.', 'UKLAND_3.1.'],
    'UKLAND_3.4': ['UKLAND_3.4.', 'UKLAND_3.1.'], URBAN: ['URBAN_4.'], ECON: ['ECON_5.'], 'RES_6.1': ['RES_6.1.'], 'RES_6.2': ['RES_6.2.'],
    'RES_6.3': ['RES_6.3.'], 'RES_6.4': ['RES_6.4.'], 'APP_7.1': ['APP_7.1.'], 'APP_7.2': ['APP_7.2.']};
  for (const q of units) {
    assert.equal(q.level, 'GCSE');
    assert.equal(q.is_as, false);
    assert.equal(q.tier, undefined);
    assert.equal(q.introduced_year, undefined);
    assert(q.primary_spec_points.length === 1 || q.primary_spec_points.length === 2, q.question_id);
    for (const id of [...q.primary_spec_points, ...q.crossover_spec_points]) assert(leaves.has(id), `${q.question_id} ${id}`);
    for (const id of q.primary_spec_points) {
      assert(id.startsWith(P + 'APP_7.3.') || prefix[q.route].some(x => id.startsWith(P + x)), `${q.question_id} ${id} outside ${q.route}`);
    }
    const expected = {'01': {'Section A': 'HAZ', 'Section B': 'LIVING', 'Section C': {3: 'UKLAND_3.2', 4: 'UKLAND_3.3', 5: 'UKLAND_3.4'}},
      '02': {'Section A': 'URBAN', 'Section B': 'ECON', 'Section C': {3: 'RES_6.1', 4: 'RES_6.2', 5: 'RES_6.3', 6: 'RES_6.4'}},
      '03': {'Section A': 'APP_7.1', 'Section B': 'APP_7.2'}}[q.component][q.section];
    assert.equal(q.route, typeof expected === 'string' ? expected : expected[Number(q.question_number)], q.question_id);
  }
  // Every Paper 3 Section A unit is issue evaluation with its resources booklet figure(s) attached.
  for (const q of units.filter(q => q.component === '03' && q.section === 'Section A')) {
    assert(q.primary_spec_points.includes(P + 'APP_7.1.k1'), q.question_id);
    assert(q.context.figures?.some(f => f.source === 'resource_booklet'), q.question_id);
  }
});

test('copyright-removed parts are excluded and recorded, never published incomplete', () => {
  const excluded = coverage.excluded_copyright_removed;
  assert.equal(excluded.length, 31);
  const published = new Set(units.map(q => `${q.paper_id} ${q.part_label || q.question_number}`));
  for (const x of excluded) {
    assert(!published.has(`${x.paper_id} ${x.question_number}`), x.paper_id + x.question_number);
    assert.match(x.reason, /third-party copyright/);
  }
  for (const pack of packs) assert.equal((pack.papers[0].excluded_questions || []).length, excluded.filter(x => x.paper_id === pack.papers[0].paper_id).length);
});

test('units are model-reviewed source pixels; SPaG marks are folded into the part and recorded', () => {
  for (const q of units) {
    assert.equal(q.source_type, 'real_past_paper');
    assert.equal(q.provenance.reviewer_type, 'model');
    assert(['easy', 'medium', 'hard'].includes(q.difficulty), q.question_id);
    assert(q.provenance.difficulty_basis && q.preview_text, q.question_id);
    assert.match(q.question_id, /^AQA_8035_(\d{4}_(JUNE|NOVEMBER)|SAMPLE)_0[123]_Q\d{2}_P\d{2}$/);
    assert.match(q.content.question_image_url, /^assets\/gcsegeog\/AQA_8035_[A-Z0-9_]+\/Q\d{2}_P\d{2}\.webp$/);
    assert.match(q.content.mark_scheme_image_url, /_scheme\.webp$/);
    assert.equal(q.scheme_scope, 'part');
    for (const figure of q.context.figures || []) assert(['insert', 'resource_booklet', 'question_paper'].includes(figure.source) && /^(Figure|Table|Key)/.test(figure.label));
    if (q.spag_marks) assert([1, 2, 3].includes(q.spag_marks) && q.marks > q.spag_marks && q.provenance.spag_marks_included === q.spag_marks, q.question_id);
  }
  assert.equal(units.filter(q => q.spag_marks).reduce((s, q) => s + q.spag_marks, 0), coverage.totals.spag_marks_included);
  assert(units.filter(q => q.spag_marks).length >= 15);
  // A multiple-choice part followed by an unlabelled follow-up question is one unit (2025 Paper 2, 4.3, 5.3, 6.3: 1 + 1 marks).
  assert.deepEqual(units.filter(q => q.multiple_choice && q.marks !== 1).map(q => q.question_id),
    ['AQA_8035_2025_JUNE_02_Q04_P03', 'AQA_8035_2025_JUNE_02_Q05_P03', 'AQA_8035_2025_JUNE_02_Q06_P03']);
  assert(units.some(q => q.context.figures?.some(f => /^Key for/.test(f.label) && f.source === 'insert')));
});

test('GCSE Geography packs validate against the schema and are live', () => {
  const subject = read('data/subjects.json').find(s => s.subject_id === 'AQA_GCSE_GEOG_8035');
  const index = createSpecIndex(); index.add(spec);
  const papers = packs.flatMap(p => p.papers);
  const issues = validateBundle({subject, papers, questions: units, questionsById: new Map(units.map(q => [q.question_id, q]))}, index);
  assert.deepEqual(issues.filter(i => i.level === 'error'), []);
  // Only booklets with an excluded part may fall short of their printed total.
  const short = new Set(papers.filter(p => p.excluded_questions?.length).map(p => p.paper_id));
  for (const issue of issues) assert(short.has(issue.id), issue.id + ': ' + issue.message);
  const live = read('data/packs/index.json').packs.map(p => p.file);
  assert.equal(live.filter(f => f.startsWith('gcsegeog/')).length, coverage.published ? 20 : 0);
  assert.match(coverage.rights_basis, /ASSUMPTION/);
});
