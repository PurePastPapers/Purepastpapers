import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, readdirSync} from 'node:fs';
import {createSpecIndex} from '../js/engine/spec-index.js';
import {validateBundle} from '../js/data/schema.js';

const read = path => JSON.parse(readFileSync(new URL('../' + path, import.meta.url), 'utf8'));
const coverage = read('data/imports/gcsehistory/coverage.json');
const files = readdirSync(new URL('../data/packs/gcsehistory/', import.meta.url)).filter(f => f.endsWith('.json'));
const packs = files.map(f => read('data/packs/gcsehistory/' + f));
const inventory = read('data/imports/gcsehistory/inventory/1hi0-inventory.json');
const spec = read('data/specs/EDX_GCSE_HIST_1HI0.json');
const leaves = new Map(spec.sections.flatMap(s => s.topics.flatMap(t => t.points.map(p => [p.id, p]))));
const units = packs.flatMap(p => p.questions);
const MAX = {'10': 52, B1: 32, '31': 52};

test('every public 1HI0 booklet in scope (options 10, B1, 31) is built and accounted for; others are recorded as not public', () => {
  const ids = inventory.papers.map(p => p.paper_id).sort();
  assert.equal(ids.length, 14);
  assert.deepEqual(packs.map(p => p.papers[0].paper_id).sort(), ids);
  assert.deepEqual(coverage.queued_public_booklets, []);
  assert.equal(units.length, 84);
  assert.equal(new Set(units.map(q => q.question_id)).size, 84);
  assert.equal(coverage.totals.scored_units, 84);
  assert.equal(coverage.totals.excluded_units, 0);
  const byOption = comp => inventory.papers.filter(p => p.component === comp).length;
  assert.deepEqual([byOption('10'), byOption('B1'), byOption('31')], [5, 4, 5]);
  const missing = inventory.not_public.map(p => p.paper_id.slice('EDX_1HI0_'.length)).sort();
  assert(missing.includes('2022_JUNE_10') && missing.includes('2026_JUNE_31') && missing.includes('2018_JUNE_B1'));
  for (const p of inventory.not_public) assert(p.status === 'not_publicly_available' && !p.documents.question_paper.url);
  // Only the three chosen options exist; nothing from Paper 1 options 11-13, B2-B4, P1-P5 or Paper 3 options 30, 32, 33.
  assert(inventory.papers.every(p => ['10', 'B1', '31'].includes(p.component)));
  assert(units.every(q => ['10', 'B1', '31'].includes(q.component)));
  for (const p of inventory.papers) for (const d of Object.values(p.documents)) assert(/^[0-9a-f]{64}$/.test(d.sha256) && d.bytes > 10000 && d.last_modified, p.paper_id);
});

test('each booklet reconciles to its option maximum, counting one part per choice group', () => {
  for (const pack of packs) {
    const [paper] = pack.papers;
    const byId = new Map(pack.questions.map(q => [q.question_id, q]));
    let marks = pack.questions.reduce((n, q) => n + q.marks, 0);
    for (const group of paper.choice_groups) marks -= group.reduce((n, id) => n + byId.get(id).marks, 0) - Math.max(...group.map(id => byId.get(id).marks));
    assert.equal(marks, MAX[paper.paper_code], paper.paper_id);
    assert.equal(paper.total_marks, MAX[paper.paper_code]);
    assert.deepEqual(paper.question_ids, pack.questions.map(q => q.question_id));
    assert.equal(paper.level, 'GCSE');
    assert(paper.duration_minutes > 30 && paper.examiner_report_url && paper.full_mark_scheme_pdf_url, paper.paper_id);
    // Choice groups: 5/6 (booklet 10), 1(c)(i)/(ii) or 3/4 (B1), 2(a)/(b) (31, 2025 only).
    const groupLabels = paper.choice_groups.map(g => g.map(id => byId.get(id).scheme_question_number));
    if (paper.paper_code === '10') assert.deepEqual(groupLabels, [['5', '6']]);
    if (paper.paper_code === 'B1') assert.deepEqual(groupLabels, [paper.year === 2025 ? ['3', '4'] : ['1(c)(i)', '1(c)(ii)']]);
    if (paper.paper_code === '31') assert.deepEqual(groupLabels, paper.year === 2025 ? [['2(a)', '2(b)']] : []);
  }
  // Marks per option over the 14 booklets (one part per choice group): 5 x 52, 4 x 32, 5 x 52.
  assert.equal(packs.filter(p => p.papers[0].paper_code === '10').length * 52 + packs.filter(p => p.papers[0].paper_code === 'B1').length * 32 + packs.filter(p => p.papers[0].paper_code === '31').length * 52, 648);
  assert.equal(coverage.totals.published_marks_counting_one_per_choice_group, 648);
});

test('SPaG marks sit inside the 20-mark units (5/6 and 3(d)) and nowhere else', () => {
  for (const q of units) {
    const spag = q.provenance.spag_marks;
    const expected = (q.component === '10' && ['5', '6'].includes(q.question_number)) || (q.component === '31' && q.question_number === '3' && q.part_label === '(d)') ? 4 : 0;
    assert.equal(spag, expected, q.question_id);
    if (expected) assert.equal(q.marks, 20, q.question_id);
  }
});

test('tags are valid leaves of the unit\'s own option; one primary leaf each; model reviewed', () => {
  for (const q of units) {
    const tags = [...q.primary_spec_points, ...q.crossover_spec_points];
    assert.equal(q.primary_spec_points.length, 1, q.question_id);
    assert(tags.every(id => leaves.has(id)), q.question_id);
    const prefix = {'10': 'EDX_GCSE_HIST_CRIME_10.', B1: 'EDX_GCSE_HIST_NORMAN_B1.', '31': 'EDX_GCSE_HIST_GERMANY_31.'}[q.component];
    assert(tags.every(id => id.startsWith(prefix)), q.question_id);
    assert.equal(q.level, 'GCSE');
    assert.equal(q.is_as, false);
    assert.equal(q.source_type, 'real_past_paper');
    assert.equal(q.provenance.reviewer_type, 'model');
    assert(['easy', 'medium', 'hard'].includes(q.difficulty), q.question_id);
    assert(q.provenance.difficulty_basis && q.preview_text, q.question_id);
  }
  // 10: Whitechapel source questions 2(a) and 2(b) tag the source-skills strand (10.5.2.*) with the topic as prerequisite.
  for (const q of units.filter(q => q.component === '10' && q.question_number === '2')) {
    assert(/10\.5\.2\.[34]$/.test(q.primary_spec_points[0]), q.question_id);
    assert(q.crossover_spec_points.length === 1 && /10\.5\.1\./.test(q.crossover_spec_points[0]), q.question_id);
  }
  assert.equal(coverage.leaves_without_primary_units.length, 47);
  const tagged = new Set(units.map(q => q.primary_spec_points[0]));
  assert.equal(tagged.size, 95 - 47);
});

test('units are source pixels; sources and interpretations are attached as unscored context; schemes are the part\'s own table', () => {
  const sourceUnits = units.filter(q => /^(2|3)/.test(q.question_number) && ((q.component === '10' && q.question_number === '2') || (q.component === '31' && q.question_number === '3')));
  assert.equal(sourceUnits.length, 5 * 2 + 5 * 4);
  for (const q of units) {
    assert.match(q.content.question_image_url, /^assets\/gcsehistory\/EDX_1HI0_\d{4}_JUNE_(10|B1|31)\/Q\d{2}(_[a-z]+)*\.webp$/);
    assert.match(q.content.mark_scheme_image_url, /_scheme\.webp$/);
    assert.equal(q.scheme_scope, 'part');
    assert.equal(q.marks > 0, true);
    for (const f of q.context.figures || []) assert(/^(Source|Interpretation) [A-Z0-9]$/.test(f.label) && f.source === 'insert' && f.image_url.startsWith('assets/gcsehistory/'), q.question_id);
  }
  const need = {'10': {'2(a)': ['Source A', 'Source B']}, '31': {'3(a)': ['Source B', 'Source C'], '3(b)': ['Interpretation 1', 'Interpretation 2'], '3(d)': ['Interpretation 2']}};
  for (const [comp, labels] of Object.entries(need)) for (const [label, want] of Object.entries(labels)) {
    for (const q of units.filter(q => q.component === comp && q.scheme_question_number === label)) assert.deepEqual((q.context.figures || []).map(f => f.label), want, q.question_id);
  }
  // Booklet B1 has no sources.
  assert(units.filter(q => q.component === 'B1').every(q => !q.context.figures));
  // The Whitechapel source question and its Sources Booklet items appear in every option-10 booklet.
  for (const pack of packs.filter(p => p.papers[0].paper_code === '10')) {
    const q = pack.questions.find(q => q.scheme_question_number === '2(a)');
    assert.equal(q.context.figures.length, 2, pack.papers[0].paper_id);
  }
});

test('GCSE History packs validate and are listed live in the pack index', () => {
  const subject = read('data/subjects.json').find(s => s.subject_id === 'EDX_GCSE_HIST_1HI0');
  const index = createSpecIndex(); index.add(spec);
  const issues = validateBundle({subject, papers: packs.flatMap(p => p.papers), questions: units, questionsById: new Map(units.map(q => [q.question_id, q]))}, index);
  assert.deepEqual(issues.filter(i => i.level === 'error'), []);
  const live = read('data/packs/index.json').packs.map(p => p.file).filter(f => f.startsWith('gcsehistory/'));
  assert.equal(live.length, 14);
  assert.equal(coverage.published, true);
  assert.match(coverage.rights_basis, /Assumed/);
  assert.equal(Object.keys(read('data/imports/gcsehistory/identities.json').units).length, 84);
  // Specification tags in the retained demo paper point at real leaves.
  for (const q of read('data/questions/EDX_GCSE_HIST_1HI0.json')) for (const id of [...q.primary_spec_points, ...q.crossover_spec_points]) assert(leaves.has(id), id);
});
