import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, readdirSync} from 'node:fs';
import {createSpecIndex} from '../js/engine/spec-index.js';
import {validateBundle} from '../js/data/schema.js';
import {LEGACY_SPEC_IDS} from '../js/config/spec-id-migrations.js';

const read = path => JSON.parse(readFileSync(new URL('../' + path, import.meta.url), 'utf8'));
const coverage = read('data/imports/gcseenglit/coverage.json');
const files = readdirSync(new URL('../data/packs/gcseenglit/', import.meta.url)).filter(f => f.endsWith('.json'));
const packs = files.map(f => read('data/packs/gcseenglit/' + f));
const inventory = read('data/imports/gcseenglit/inventory/c720qs-inventory.json');
const spec = read('data/specs/EDUQAS_GCSE_ENGLIT_C720QS.json');
const topics = spec.sections.flatMap(s => s.topics);
const leaves = new Map(topics.flatMap(t => t.points.map(p => [p.id, {...p, topic: t.id}])));
const units = packs.flatMap(p => p.questions);
const byId = new Map(units.map(q => [q.question_id, q]));
const P = 'EDUQAS_GCSE_ENGLIT';
const ROUTE_LEAF = {SHAKES: [`${P}_SHAKES_A.2`], POST1914: [`${P}_POST1914_A.1`], C19: [`${P}_C19_B.1`]};

test('GCSE English Literature leaves are the route texts, the 2027 anthology and unseen poetry of Version 4', () => {
  assert.equal(spec.official_source.sha256, '4ffb7a979f4d16ac4bb8e5ad35c6be74742636ef19cf7ffa220f13db07cf543f');
  assert.equal(spec.official_source.version, 'Version 4');
  assert.equal(leaves.size, 20);
  assert.deepEqual([...leaves.keys()], spec.point_order);
  for (const [id, p] of leaves) assert(p.content.length && p.official_reference.source_pages.length, id);
  assert.equal(topics.find(t => t.id === `${P}_ANTH`).points.length, 15);
  assert.equal(leaves.get(`${P}_ANTH_P.15`).title, 'Origin Story (Eve L Ewing)');
  for (const target of Object.values(LEGACY_SPEC_IDS).flat()) if (String(target).startsWith(`${P}_`)) assert(leaves.has(target), target);
  for (const q of read('data/questions/EDUQAS_GCSE_ENGLIT_C720QS.json')) for (const id of q.primary_spec_points) assert(leaves.has(id), id);
});

test('every public C720QS booklet is built or accounted for', () => {
  const ids = inventory.papers.map(p => p.paper_id).sort();
  assert.equal(ids.length, 19);
  const noUnits = coverage.booklets_without_route_units.map(x => x.paper_id);
  assert.deepEqual(noUnits, ['EDUQAS_C720QS_2022_SUMMER_C2A']);
  assert.deepEqual(packs.map(p => p.papers[0].paper_id).sort(), ids.filter(id => !noUnits.includes(id)));
  assert.deepEqual(coverage.queued_public_booklets, []);
  assert.deepEqual(inventory.unavailable.map(p => p.paper_id), ['EDUQAS_C720QS_2021_AUTUMN_C1']);
  const {booklets, printed_questions, scored_units, removed_content_questions, out_of_route_questions} = coverage.totals;
  assert.deepEqual({booklets, printed_questions, scored_units, removed_content_questions, out_of_route_questions},
    {booklets: 19, printed_questions: 256, scored_units: 48, removed_content_questions: 16, out_of_route_questions: 192});
  assert.equal(new Set(units.map(q => q.question_id)).size, 48);
});

test('each booklet reconciles: published marks plus removed anthology marks make the cover total', () => {
  for (const pack of packs) {
    const [paper] = pack.papers;
    const published = pack.questions.reduce((s, q) => s + q.marks, 0);
    const removed = (paper.excluded_questions || []).filter(x => x.reason_type === 'removed_from_specification').reduce((s, x) => s + x.marks, 0);
    assert.equal(published + removed, paper.total_marks, paper.paper_id);
    assert.equal(paper.total_marks, {C1: 80, C2: 120}[paper.paper_code] ?? 40, paper.paper_id);
    for (const x of paper.excluded_questions || []) assert(['option_not_in_route', 'removed_from_specification'].includes(x.reason_type) && x.reason, paper.paper_id);
    if (removed) assert.match(paper.marks_note, /anthology examined until 2026/);
  }
});

test('route tags, tariffs and unseen context', () => {
  const count = {};
  for (const q of units) {
    count[q.route] = (count[q.route] || 0) + 1;
    for (const id of [...q.primary_spec_points, ...q.crossover_spec_points]) assert(leaves.has(id), `${q.question_id} ${id}`);
    if (ROUTE_LEAF[q.route]) assert.deepEqual(q.primary_spec_points, ROUTE_LEAF[q.route], q.question_id);
    if (q.route === 'SHAKES') assert.equal(q.marks, q.question_number === '2.1' ? 15 : 25, q.question_id);
    if (q.route === 'POST1914' || q.route === 'C19') assert.equal(q.marks, 40, q.question_id);
    if (q.route === 'UNSEEN') {
      const first = q.question_number === '3.1';
      assert.deepEqual(q.primary_spec_points, [first ? `${P}_UNSEEN_C.1` : `${P}_UNSEEN_C.2`]);
      assert.equal(q.marks, first ? 15 : 25);
      assert.equal(Boolean(q.context.figures?.length), !first, q.question_id);
      if (!first) {
        const [rubric, poem] = q.provenance.context_regions;
        assert.equal(q.context.figures[0].label, 'Section rubric and first unseen poem');
        assert(rubric.page < poem.page || (rubric.page === poem.page && rubric.bbox[3] < poem.bbox[1]), q.question_id);
      }
    }
    assert.equal(q.level, 'GCSE');
    assert.equal(q.tier, null);
  }
  assert.deepEqual(count, {SHAKES: 16, POST1914: 8, C19: 8, UNSEEN: 16});
  assert.equal(coverage.excluded_removed_from_specification.length, 16);
});

test('units are model-reviewed and source-rendered with their own scheme', () => {
  for (const q of units) {
    assert.equal(q.source_type, 'real_past_paper');
    assert.equal(q.provenance.reviewer_type, 'model');
    assert(['medium', 'hard'].includes(q.difficulty), q.question_id);
    assert(q.provenance.difficulty_basis && q.preview_text, q.question_id);
    assert.match(q.question_id, /^EDUQAS_C720QS_\d{4}_(SUMMER|AUTUMN)_C[12][ABC]?_Q\d{2}_U01$/);
    assert.match(q.content.question_image_url, /^assets\/gcseenglit\/EDUQAS_C720QS_[A-Z0-9_]+\/Q\d{2}_U01\.webp$/);
    assert.match(q.content.mark_scheme_image_url, /_scheme\.webp$/);
    assert(q.provenance.scheme_grid_regions.length && q.provenance.scheme_indicative_regions.length, q.question_id);
  }
});

test('packs validate against the schema, are live and their catalogues hold every crop', () => {
  const subject = read('data/subjects.json').find(s => s.subject_id === 'EDUQAS_GCSE_ENGLIT_C720QS');
  const index = createSpecIndex(); index.add(spec);
  const papers = packs.flatMap(p => p.papers);
  const issues = validateBundle({subject, papers, questions: units, questionsById: byId}, index);
  assert.deepEqual(issues.filter(i => i.level === 'error'), []);
  // Only the Component 1 papers warn: their anthology half is removed content.
  for (const i of issues) assert.match(i.id, /_C1$/, i.message);
  const live = read('data/packs/index.json').packs.map(p => p.file);
  assert.equal(live.filter(f => f.startsWith('gcseenglit/')).length, coverage.published ? 18 : 0);
  assert.equal(Object.keys(read('data/imports/gcseenglit/identities.json').units).length, 48);
  if (coverage.published) for (const pack of packs) {
    const pid = pack.papers[0].paper_id;
    const catalogue = read('data/gcseenglit-assets/' + pid + '.json');
    const refs = new Set([...JSON.stringify(pack).matchAll(/assets\/gcseenglit\/[A-Z0-9_]+\/([A-Za-z0-9_]+\.webp)/g)].map(m => m[1]));
    assert.deepEqual(Object.keys(catalogue.assets).sort(), [...refs].sort(), pid);
  }
});
