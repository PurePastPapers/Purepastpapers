import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, readdirSync} from 'node:fs';
import {createSpecIndex} from '../js/engine/spec-index.js';
import {validateBundle} from '../js/data/schema.js';

const read = path => JSON.parse(readFileSync(new URL('../' + path, import.meta.url), 'utf8'));
const coverage = read('data/imports/geography/coverage.json');
const files = readdirSync(new URL('../data/packs/geography/', import.meta.url)).filter(f => f.endsWith('.json'));
const packs = files.map(f => read('data/packs/geography/' + f));
const inventories = ['7037', '7036'].map(n => read(`data/imports/geography/inventory/${n}-inventory.json`));
const spec = read('data/specs/AQA_ALEVEL_GEOG_7037.json');
const leaves = new Map(spec.sections.flatMap(s => s.topics.flatMap(t => t.points.map(p => [p.id, {...p, topic: t.code}]))));
const asShared = new Set(Object.values(spec.as_section_map));
const units = packs.flatMap(p => p.questions);

test('every public AQA 7037 and AS 7036 booklet is built and accounted for', () => {
  const ids = inventories.flatMap(i => i.papers.map(p => p.paper_id)).sort();
  assert.deepEqual(packs.map(p => p.papers[0].paper_id).sort(), ids);
  assert.equal(ids.length, 26);
  assert.deepEqual(coverage.queued_public_booklets, []);
  const {booklets, printed_parts, scored_units, excluded_parts} = coverage.totals;
  assert.deepEqual({booklets, printed_parts, scored_units, excluded_parts}, {booklets: 26, printed_parts: 635, scored_units: 605, excluded_parts: 30});
  assert.equal(units.length, 605);
  assert.equal(new Set(units.map(q => q.question_id)).size, 605);
});

test('each booklet reconciles to its cover maximum, counting one option per choice group', () => {
  for (const pack of packs) {
    const [paper] = pack.papers;
    const byId = new Map(pack.questions.map(q => [q.question_id, q]));
    const excluded = (paper.excluded_questions || []);
    // Recount the printed parts: published units plus excluded ones, per question.
    const totals = {};
    for (const q of pack.questions) totals[q.question_number] = (totals[q.question_number] || 0) + q.marks;
    for (const x of excluded) { const n = String(parseInt(x.question_number)); totals[n] = (totals[n] || 0) + x.marks; }
    const grouped = new Set(paper.choice_groups.flat(2).map(id => byId.get(id)?.question_number));
    let marks = Object.entries(totals).filter(([n]) => !grouped.has(n)).reduce((s, [, m]) => s + m, 0);
    for (const group of paper.choice_groups) {
      const numbers = group.map(option => byId.get(option[0]).question_number);
      marks += Math.max(...numbers.map(n => totals[n]));
    }
    assert.equal(marks, paper.total_marks, paper.paper_id);
    assert.equal(paper.total_marks, paper.is_as ? (paper.paper_id === 'AQA_7036_2022_JUNE_02' ? 65 : 80) : 120, paper.paper_id);
  }
});

test('optional routes never mix: primary tags stay in the unit route or the skills checklist', () => {
  for (const q of units) {
    for (const id of q.primary_spec_points) {
      const leaf = leaves.get(id);
      assert(leaf, `${q.question_id} ${id}`);
      if (q.route === 'AS3.4') assert(id === 'AQA_GEOG_AS_3.4' || leaf.topic === '3.4', `${q.question_id} ${id}`);
      else assert(leaf.topic === q.route || leaf.topic === '3.4', `${q.question_id} ${id} outside ${q.route}`);
    }
    if (q.is_as) {
      assert.equal(q.level, 'AS');
      assert.equal(q.qualification_code, '7036');
      assert([...q.primary_spec_points, ...q.crossover_spec_points].every(id => asShared.has(id)), q.question_id);
      assert.equal(q.introduced_year, 12);
    } else {
      assert(!q.primary_spec_points.includes('AQA_GEOG_AS_3.4'), q.question_id);
      const shared = q.primary_spec_points.every(id => asShared.has(id));
      assert.equal(q.introduced_year, shared ? 12 : 13, q.question_id);
    }
  }
});

test('copyright-removed parts are excluded, never published incomplete', () => {
  const excluded = coverage.excluded_copyright_removed;
  assert.equal(excluded.length, 30);
  const published = new Set(units.map(q => `${q.paper_id} ${q.part_label}`));
  for (const x of excluded) assert(!published.has(`${x.paper_id} ${x.question_number}`), x.paper_id + x.question_number);
});

test('units are model-reviewed, source-rendered and keep their context unscored', () => {
  for (const q of units) {
    assert.equal(q.source_type, 'real_past_paper');
    assert.equal(q.is_sample, false);
    assert.equal(q.provenance.reviewer_type, 'model');
    assert(['easy', 'medium', 'hard'].includes(q.difficulty), q.question_id);
    assert(q.provenance.difficulty_basis && q.preview_text, q.question_id);
    assert.match(q.question_id, /^AQA_703[67]_(\d{4}_(JUNE|NOVEMBER)|SAMPLE)_0[12]_Q\d{2}_P\d{2}$/);
    assert.match(q.content.question_image_url, /^assets\/geography\/AQA_703[67]_[A-Z0-9_]+\/Q\d{2}_P\d{2}\.webp$/);
    assert.match(q.content.mark_scheme_image_url, /_scheme\.webp$/);
    assert.equal(q.scheme_scope, 'part');
    for (const figure of q.context.figures || []) assert(['insert', 'question_paper'].includes(figure.source) && /^Figure|^Table/.test(figure.label));
  }
  // AS fieldwork parts carry their shared scenario; multiple-choice parts are all AS 1-mark.
  assert(units.filter(q => q.route === 'AS3.4' && q.question_number !== '2').every(q => q.context.stem_image_url));
  assert(units.filter(q => q.multiple_choice).every(q => q.is_as && q.marks === 1));
  assert.equal(units.filter(q => q.multiple_choice).length, 72);
});

test('Geography packs validate against the schema and are live', () => {
  const subject = read('data/subjects.json').find(s => s.subject_id === 'AQA_ALEVEL_GEOG_7037');
  assert.equal(subject.content_year_source, 'introduced_year');
  const index = createSpecIndex(); index.add(spec);
  const papers = packs.flatMap(p => p.papers);
  const issues = validateBundle({subject, papers, questions: units, questionsById: new Map(units.map(q => [q.question_id, q]))}, index);
  assert.deepEqual(issues.filter(i => i.level === 'error'), []);
  // Only booklets with an excluded part may fall short of their printed total.
  const short = new Set(papers.filter(p => p.excluded_questions?.length).map(p => p.paper_id));
  for (const issue of issues) assert(short.has(issue.id), issue.id + ': ' + issue.message);
  const live = read('data/packs/index.json').packs.map(p => p.file);
  assert.equal(live.filter(f => f.startsWith('geography/')).length, coverage.published ? 26 : 0);
  assert.equal(Object.keys(read('data/imports/geography/identities.json').units).length, 605);
  const years = read('data/curriculum/index.json').mappings.find(m => m.subject_id === 'AQA_ALEVEL_GEOG_7037');
  assert.deepEqual(years.years.map(y => [y.year, y.coverage.length]), [[12, 47], [13, 36]]);
});
