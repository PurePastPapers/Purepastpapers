import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, readdirSync} from 'node:fs';
import {createSpecIndex} from '../js/engine/spec-index.js';
import {validateBundle} from '../js/data/schema.js';

const read = path => JSON.parse(readFileSync(new URL('../' + path, import.meta.url), 'utf8'));
const coverage = read('data/imports/history/coverage.json');
const files = readdirSync(new URL('../data/packs/history/', import.meta.url)).filter(f => f.endsWith('.json'));
const packs = files.map(f => read('data/packs/history/' + f));
const inventory = read('data/imports/history/inventory/9hi0-route-h-inventory.json');
const spec = read('data/specs/EDX_ALEVEL_HIST_9HI0.json');
const MAX = {'1H': 60, '2H': 40, '33': 60};

test('every public Route H booklet (1H, 2H, 33) from 2017 to 2025 is built and live', () => {
  const ids = inventory.papers.map(p => p.paper_id).sort();
  assert.equal(ids.length, 27);
  assert.deepEqual(packs.map(p => p.papers[0].paper_id).sort(), ids);
  assert.deepEqual(coverage.queued_public_booklets, []);
  assert.equal(coverage.totals.scored_units, 117);
  assert.equal(coverage.totals.marks_available, 1440);
  const live = read('data/packs/index.json').packs.map(p => p.file).filter(f => f.startsWith('history/'));
  assert.equal(live.length, coverage.published ? 27 : 0);
});

test('each booklet reconciles to its option maximum with one question per choice group', () => {
  for (const pack of packs) {
    const [paper] = pack.papers;
    const units = new Map(pack.questions.map(q => [q.question_id, q]));
    let marks = [...units.values()].reduce((n, q) => n + q.marks, 0);
    for (const group of paper.choice_groups) marks -= group.reduce((n, id) => n + units.get(id).marks, 0) - Math.max(...group.map(id => units.get(id).marks));
    assert.equal(marks, MAX[paper.paper_code], paper.paper_id);
    assert.equal(paper.total_marks, MAX[paper.paper_code]);
  }
});

test('option 2H.1 is never imported; source and extract questions carry their booklet pixels', () => {
  for (const pack of packs) for (const q of pack.questions) {
    if (q.component === '2H') {
      assert.equal(q.option, '2H.2', q.question_id);
      assert(['2', '5', '6'].includes(q.question_number), q.question_id);
    }
    const needsBooklet = (q.component === '1H' && q.section === 'Section C') || (q.component !== '1H' && q.section === 'Section A');
    assert.equal(Boolean(q.context.booklet_image_url), needsBooklet, q.question_id);
    if (needsBooklet) assert.match(q.context.shared_stem_html, /data-math-image="assets\/history\//);
  }
});

test('units are model-reviewed and tagged to official bullets of their own option', () => {
  const index = createSpecIndex(); index.add(spec);
  const prefix = {'1H': 'EDX_HIST_1H_', '2H': 'EDX_HIST_2H2_', '33': 'EDX_HIST_33_'};
  for (const pack of packs) for (const q of pack.questions) {
    assert.equal(q.provenance.reviewer_type, 'model');
    assert(['easy', 'medium', 'hard'].includes(q.difficulty));
    assert(q.primary_spec_points.length && [...q.primary_spec_points, ...q.crossover_spec_points].every(id => index.get(id)?.type === 'point'), q.question_id);
    assert(q.primary_spec_points.every(id => id.startsWith(prefix[q.component])), q.question_id);
    assert(q.provenance.scheme_levels_regions.length && q.provenance.scheme_indicative_regions.length, q.question_id);
  }
});

test('History packs validate against the schema with no errors or warnings', () => {
  const subject = read('data/subjects.json').find(s => s.subject_id === 'EDX_ALEVEL_HIST_9HI0');
  const index = createSpecIndex(); index.add(spec);
  const questions = packs.flatMap(p => p.questions);
  const issues = validateBundle({subject, papers: packs.flatMap(p => p.papers), questions, questionsById: new Map(questions.map(q => [q.question_id, q]))}, index);
  assert.deepEqual(issues, []);
  assert.equal(Object.keys(read('data/imports/history/identities.json').units).length, 117);
});
