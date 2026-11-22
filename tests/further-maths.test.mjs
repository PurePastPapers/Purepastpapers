// Edexcel Further Mathematics: one subject record holding A-Level 9FM0 and AS 8FM0,
// the official option routes, module-scoped specification and route-aware scoping.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { LEGACY_SPEC_IDS } from '../js/config/spec-id-migrations.js';
import { createSpecIndex } from '../js/engine/spec-index.js';
import {
  bestOptionPair, isConfigured, isValidRoute, normaliseChoice, paperInScope, questionInScope, routeForModules, routesFor, scopeLeaves, scopeOf, scopeSpec,
} from '../js/engine/module-routes.js';
import { levelOf, paperCode } from '../js/engine/paper-identity.js';

const read = (path) => JSON.parse(readFileSync(new URL(`../${path}`, import.meta.url), 'utf8'));
const ID = 'EDX_ALEVEL_FMATH_9FM0';
const subjects = read('data/subjects.json');
const subject = subjects.find((entry) => entry.subject_id === ID);
const spec = read(`data/specs/${ID}.json`);
const papers = read(`data/papers/${ID}.json`);
const questions = read(`data/questions/${ID}.json`);
const importedPacks = read('data/packs/index.json').packs
  .filter((entry) => entry.enabled !== false && entry.file.startsWith('fmaths/'))
  .map((entry) => read(`data/packs/${entry.file}`));
const leaves = spec.sections.flatMap((section) => section.topics.flatMap((topic) => topic.points));
const sectionOf = (id) => spec.sections.find((section) => section.id === id);

const AS_ROUTES = {
  '2A': ['FP1', 'FP2'], '2B': ['FP1', 'FS1'], '2C': ['FP1', 'FM1'], '2D': ['FP1', 'D1'], '2E': ['FS1', 'FM1'],
  '2F': ['FS1', 'D1'], '2G': ['FS1', 'FS2'], '2H': ['FM1', 'D1'], '2J': ['FM1', 'FM2'], '2K': ['D1', 'D2'],
};
const A_ROUTES = {
  '3A+4A': ['FP1', 'FP2'], '3A+3B': ['FP1', 'FS1'], '3A+3C': ['FP1', 'FM1'], '3A+3D': ['FP1', 'D1'], '3B+3C': ['FS1', 'FM1'],
  '3B+3D': ['FS1', 'D1'], '3B+4B': ['FS1', 'FS2'], '3C+3D': ['FM1', 'D1'], '3C+4C': ['FM1', 'FM2'], '3D+4D': ['D1', 'D2'],
};

test('Further Mathematics is one subject record declaring A-Level 9FM0 and AS 8FM0', () => {
  assert.equal(subjects.filter((entry) => entry.subject_id === ID).length, 1);
  assert.equal(subjects.filter((entry) => /Further Math/i.test(entry.subject)).length, 1, 'no separate AS or module subjects');
  assert.deepEqual(subject.qualifications, [{ code: '9FM0', label: 'A-Level' }, { code: '8FM0', label: 'AS', is_as: true }]);
});

test('all ten AS routes 2A–2K (no 2I) map to the official module pairs', () => {
  const routes = routesFor(subject, '8FM0');
  assert.deepEqual(Object.fromEntries(routes.map((route) => [route.code, route.modules])), AS_ROUTES);
  assert(!routes.some((route) => route.code === '2I'));
  for (const [code, modules] of Object.entries(AS_ROUTES)) {
    assert.equal(routeForModules(subject, '8FM0', [...modules].reverse()).code, code);
    assert.equal(typeof code, 'string');
  }
});

test('all ten legal A-Level option pairs exist and unmatched pairs are rejected', () => {
  const routes = routesFor(subject, '9FM0');
  assert.deepEqual(Object.fromEntries(routes.map((route) => [route.code, route.modules])), A_ROUTES);
  // Any two Option 1 papers, or an Option 1 paper with its matching Option 2 paper.
  for (const modules of Object.values(A_ROUTES)) assert(isValidRoute(subject, '9FM0', modules));
  for (const bad of [['FP1', 'FS2'], ['FS1', 'FM2'], ['FP2', 'FS2'], ['D1', 'FM2'], ['FP2', 'D2'], ['FP1'], ['FP1', 'FS1', 'FM1'], ['CP', 'FP1']]) {
    assert(!isValidRoute(subject, '9FM0', bad), bad.join('+'));
  }
  // A stored invalid route is dropped rather than trusted.
  assert.deepEqual(normaliseChoice(subject, { levels: ['9FM0'], routes: { '9FM0': '3A+4B' } }).routes, {});
});

test('the specification is module-scoped: Core Pure is distinct from Further Pure, AS options are their own identities', () => {
  assert.equal(spec.official_source.a_level.issue, 'Issue 4');
  assert.equal(spec.official_source.as.issue, 'Issue 5');
  const ids = leaves.map((point) => point.id);
  assert.equal(new Set(ids).size, ids.length);
  assert(leaves.every((point) => typeof point.code === 'string' && point.id.endsWith(`_${point.code}`)));
  const cp = sectionOf('EDX_FMATH_SEC_CP');
  const fp1 = sectionOf('EDX_FMATH_SEC_FP1');
  const asFp1 = sectionOf('EDX_FMATH_SEC_AS_FP1');
  assert.equal(cp.module_id, 'CP');
  assert.equal(fp1.module_id, 'FP1');
  assert.notEqual(cp.id, fp1.id);
  assert(!cp.topics.some((topic) => topic.points.some((point) => fp1.topics.some((t) => t.points.some((p) => p.id === point.id)))));
  // AS Further Pure 1 is numbered differently from the A-Level paper: topic 2 differs.
  assert.equal(asFp1.topics[1].title, 'Coordinate systems');
  assert.equal(fp1.topics[1].title, 'Further calculus');
  assert(asFp1.topics.every((topic) => topic.points.every((point) => point.id.startsWith('EDX_FMATH_AS_FP1_'))));
  // 2.10 and 2.1 are different codes, never decimals.
  assert(cp.topics[1].points.some((point) => point.code === '2.10'));
  // AS Core Pure is the official subset of shared points; A-Level only points are not AS.
  const asCore = cp.topics.flatMap((topic) => topic.points).filter((point) => point.qualifications.includes('8FM0')).map((point) => point.code);
  assert.deepEqual(asCore, ['1.1', '2.1', '2.2', '2.3', '2.4', '2.5', '2.6', '2.7', '3.1', '3.2', '3.3', '3.4', '3.5', '3.6', '3.7', '3.8', '4.1', '4.2', '4.3', '5.1', '6.1', '6.2', '6.3', '6.4', '6.5']);
  const index = createSpecIndex();
  index.add(spec);
  assert.equal(index.subjectLeaves(ID).length, leaves.length);
});

test('every earlier seeded id migrates to live official points, and demo tags resolve', () => {
  const live = new Set(leaves.map((point) => point.id));
  const ours = Object.entries(LEGACY_SPEC_IDS).filter(([id]) => id.startsWith('EDX_FMATH_'));
  assert.equal(ours.length, Object.keys(spec.legacy_ids).length);
  for (const [old, next] of ours) {
    assert(!live.has(old), old);
    assert(next.length && next.every((id) => live.has(id)), old);
  }
  assert.deepEqual(LEGACY_SPEC_IDS['EDX_FMATH_CP_COMPLEX_2.3'], ['EDX_FMATH_CP_2.4', 'EDX_FMATH_CP_2.5', 'EDX_FMATH_CP_2.6']);
  for (const question of questions) {
    // A-Level Maths prerequisites (EDX_MATH_…) stay crossover tags owned by that subject.
    for (const id of [...question.primary_spec_points, ...question.crossover_spec_points].filter((id) => id.startsWith('EDX_FMATH_'))) {
      assert(live.has(id), `${question.question_id} ${id}`);
    }
    assert(question.primary_spec_points.every((id) => id.startsWith('EDX_FMATH_')), question.question_id);
  }
});

test('Core Pure is always present for the chosen level, and only its assessed points', () => {
  const asOnly = scopeOf(subject, { levels: ['8FM0'], routes: { '8FM0': '2K' } });
  const asSections = scopeSpec(spec, asOnly).sections.map((section) => section.id);
  assert.deepEqual(asSections, ['EDX_FMATH_SEC_CP', 'EDX_FMATH_SEC_AS_D1', 'EDX_FMATH_SEC_AS_D2']);
  const asLeaves = scopeLeaves(spec, asOnly);
  assert(asLeaves.includes('EDX_FMATH_CP_2.7'));
  assert(!asLeaves.includes('EDX_FMATH_CP_2.8'), 'A-Level-only Core Pure is not in AS');
  const aOnly = scopeOf(subject, { levels: ['9FM0'], routes: { '9FM0': '3A+4A' } });
  const aSections = scopeSpec(spec, aOnly).sections.map((section) => section.id);
  assert.deepEqual(aSections, ['EDX_FMATH_SEC_CP', 'EDX_FMATH_SEC_FP1', 'EDX_FMATH_SEC_FP2']);
  assert(scopeLeaves(spec, aOnly).includes('EDX_FMATH_CP_9.9'));
});

test('switching route changes the visible tree without touching learned ticks', () => {
  const learned = new Set(['EDX_FMATH_CP_1.1', 'EDX_FMATH_FS1_6.1', 'EDX_FMATH_FM1_4.1']);
  const before = new Set(learned);
  const statsRoute = new Set(scopeLeaves(spec, scopeOf(subject, { levels: ['9FM0'], routes: { '9FM0': '3B+4B' } })));
  const mechRoute = new Set(scopeLeaves(spec, scopeOf(subject, { levels: ['9FM0'], routes: { '9FM0': '3C+4C' } })));
  assert(statsRoute.has('EDX_FMATH_FS1_6.1') && !statsRoute.has('EDX_FMATH_FM1_4.1'));
  assert(mechRoute.has('EDX_FMATH_FM1_4.1') && !mechRoute.has('EDX_FMATH_FS1_6.1'));
  // The visible "learned" count follows the route; the stored set is unchanged.
  assert.equal([...learned].filter((id) => statsRoute.has(id)).length, 2);
  assert.equal([...learned].filter((id) => mechRoute.has(id)).length, 2);
  assert.deepEqual(learned, before);
  // Reselecting statistics shows the statistics tick again.
  assert(statsRoute.has('EDX_FMATH_FS1_6.1'));
});

test('AS, A-Level or both are configured inside the one subject, with independent routes', () => {
  const both = normaliseChoice(subject, { levels: ['9FM0', '8FM0'], routes: { '9FM0': '3A+3B', '8FM0': '2J' }, extra: { '9FM0': ['FS2', 'FS1'] } });
  assert.deepEqual(both.routes, { '9FM0': '3A+3B', '8FM0': '2J' });
  assert.deepEqual(both.extra, { '9FM0': ['FS2'] }, 'an extra already in the route is dropped');
  assert(isConfigured(subject, both));
  const scope = scopeOf(subject, both);
  assert.deepEqual([...scope.modules.get('9FM0')].sort(), ['CP', 'FP1', 'FS1', 'FS2']);
  assert.deepEqual([...scope.routeModules.get('9FM0')].sort(), ['CP', 'FP1', 'FS1'], 'extras stay outside the grade route');
  assert.deepEqual([...scope.modules.get('8FM0')].sort(), ['CP', 'FM1', 'FM2']);
  assert(!isConfigured(subject, { levels: ['9FM0', '8FM0'], routes: { '9FM0': '3A+3B' } }));
});

test('without a saved route only Core Pure is shown; All options is an explicit choice', () => {
  const none = scopeOf(subject, null);
  assert.equal(none.configured, false);
  assert.deepEqual([...none.sections], ['EDX_FMATH_SEC_CP']);
  const all = scopeOf(subject, { levels: ['9FM0'], showAll: true });
  assert.equal(all.sections.size, 9, 'Core Pure plus the eight A-Level option papers');
  const p3b = papers.find((paper) => paper.paper_id === 'EDX_9FM0_2024_JUNE_P3B');
  const p3c = papers.find((paper) => paper.paper_id === 'EDX_9FM0_2024_JUNE_P3C');
  const p1 = papers.find((paper) => paper.paper_id === 'EDX_9FM0_2024_JUNE_P1');
  const route = scopeOf(subject, { levels: ['9FM0'], routes: { '9FM0': '3B+3D' } });
  assert(paperInScope(p1, route) && paperInScope(p3b, route));
  assert(!paperInScope(p3c, route), 'unselected modules are hidden by default');
  assert(paperInScope(p3c, all));
  assert(!paperInScope(p3b, none));
  // AS-only students do not see A-Level papers.
  assert(!paperInScope(p1, scopeOf(subject, { levels: ['8FM0'], routes: { '8FM0': '2F' } })));
});

test('questions follow their module and qualification', () => {
  const route = scopeOf(subject, { levels: ['9FM0'], routes: { '9FM0': '3B+3D' } });
  const fs1 = { question_id: 'q1', qualification_code: '9FM0', module_id: 'FS1' };
  const fm1 = { question_id: 'q2', qualification_code: '9FM0', module_id: 'FM1' };
  const asFs1 = { question_id: 'q3', qualification_code: '8FM0', module_id: 'FS1', is_as: true };
  assert(questionInScope(fs1, null, route));
  assert(!questionInScope(fm1, null, route));
  assert(!questionInScope(asFs1, null, route), 'an AS question is not in an A-Level-only scope');
  // A question without a module takes its paper's single module.
  const paper = papers.find((entry) => entry.paper_id === 'EDX_9FM0_2024_JUNE_P3D');
  assert(questionInScope({ question_id: 'q4' }, paper, route));
  for (const question of questions.filter((entry) => entry.paper_id === 'EDX_9FM0_DEMO_CP')) assert.equal(question.module_id, 'CP');
});

test('papers carry their own qualification, module and official code', () => {
  for (const paper of papers) {
    assert.equal(paper.module_ids.length, 1, paper.paper_id);
    assert.equal(paper.paper_id.startsWith('EDX_8FM0_') ? '8FM0' : '9FM0', paper.qualification_code, paper.paper_id);
    assert.equal(paper.is_as, paper.qualification_code === '8FM0');
    assert.equal(levelOf(paper, subject), paper.is_as ? 'AS' : 'A-Level');
  }
  const p4c = papers.find((paper) => paper.paper_id === 'EDX_9FM0_2023_JUNE_P4C');
  assert.equal(p4c.official_paper_code, '9FM0/4C');
  assert.deepEqual(p4c.module_ids, ['FM2']);
  assert.equal(paperCode(p4c, subject), '9FM0/4C');
  // An AS Further Maths paper record reads as AS 8FM0, never the subject's 9FM0.
  const asPaper = { paper_id: 'X', level: 'AS', spec_code: '8FM0', qualification_code: '8FM0', paper_code: '01' };
  assert.equal(levelOf(asPaper, subject), 'AS');
  assert.equal(paperCode(asPaper, subject), '8FM0 · 01');
});

test("Pearson's best-combination rule picks the permitted pair with the highest total", () => {
  // Sat FP1, FS1 and FS2: FP1+FS2 is not a legal pair, so it must not be chosen.
  const marks = { FP1: 70, FS1: 40, FS2: 72 };
  assert.deepEqual(bestOptionPair(subject, '9FM0', marks), { route: '3B+4B', modules: ['FS1', 'FS2'], total: 112 });
  assert.deepEqual(bestOptionPair(subject, '9FM0', { FP1: 70, FS1: 40 }), { route: '3A+3B', modules: ['FP1', 'FS1'], total: 110 });
  assert.equal(bestOptionPair(subject, '9FM0', { FP1: 70, FS2: 72 }), null);
});

test('existing identifiers, marks and saved learning survive the rebuild', async () => {
  const existingSeries = ['2019_JUNE', '2020_AUTUMN', '2021_AUTUMN', '2022_JUNE', '2023_JUNE', '2024_JUNE', '2025_JUNE'];
  const existingCodes = ['P1', 'P2', 'P3A', 'P3B', 'P3C', 'P3D', 'P4A', 'P4B', 'P4C', 'P4D'];
  const paperIds = new Set(papers.map((paper) => paper.paper_id));
  assert.equal(paperIds.size, papers.length);
  assert(paperIds.has('EDX_9FM0_DEMO_CP'));
  for (const series of existingSeries) for (const code of existingCodes) {
    assert(paperIds.has(`EDX_9FM0_${series}_${code}`), `${series} ${code}`);
  }
  const demoQuestions = questions.filter((question) => question.paper_id === 'EDX_9FM0_DEMO_CP');
  assert(demoQuestions.every((question) => question.is_sample));
  assert.deepEqual(demoQuestions.map((question) => [question.question_id, question.marks]), [
    ['EDX_9FM0_DEMO_CP_Q01', 5], ['EDX_9FM0_DEMO_CP_Q02', 5], ['EDX_9FM0_DEMO_CP_Q03', 7], ['EDX_9FM0_DEMO_CP_Q04', 6],
    ['EDX_9FM0_DEMO_CP_Q05', 8], ['EDX_9FM0_DEMO_CP_Q06', 9], ['EDX_9FM0_DEMO_CP_Q07', 6], ['EDX_9FM0_DEMO_CP_Q08', 9],
    ['EDX_9FM0_DEMO_CP_Q09', 8], ['EDX_9FM0_DEMO_CP_Q10', 9], ['EDX_9FM0_DEMO_CP_Q11', 8],
  ]);
  // A saved tick on an old seeded id expands (as api.migrateLearnedIds does) and is not lost.
  const saved = ['EDX_FMATH_CP_MATRICES_3.3', 'EDX_FMATH_D1_LP', 'EDX_MATH_PURE_TRIG_5.6'];
  const migrated = [...new Set(saved.flatMap((id) => LEGACY_SPEC_IDS[id] || [id]))];
  assert.deepEqual(migrated, ['EDX_FMATH_CP_3.5', 'EDX_FMATH_CP_3.6', 'EDX_FMATH_D1_5.1', 'EDX_FMATH_D1_5.2', 'EDX_FMATH_D1_5.3', 'EDX_FMATH_D1_5.4', 'EDX_MATH_PURE_TRIG_5.6']);
  // The demo account's topic-level ids (CP_PROOF, CP_COMPLEX, …) are still live topics.
  const topicIds = new Set(spec.sections.flatMap((section) => section.topics.map((topic) => topic.id)));
  for (const suffix of ['CP_PROOF', 'CP_COMPLEX', 'CP_MATRICES', 'CP_ALG']) assert(topicIds.has(`EDX_FMATH_${suffix}`));
});

test('source inventories are verified Pearson files with checksums, and only verified AS rows exist', () => {
  const inv9 = read('data/imports/fmaths/inventory/9fm0-inventory.json');
  const inv8 = read('data/imports/fmaths/inventory/8fm0-inventory.json');
  const pearson = /^https:\/\/qualifications\.pearson\.com\/content\/dam\/pdf\//;
  for (const inv of [inv9, inv8]) {
    for (const row of inv.papers) {
      for (const [kind, doc] of Object.entries(row.documents)) {
        if (doc.availability !== 'verified_public') continue;
        assert.match(doc.url, pearson, `${row.paper_id} ${kind}`);
        assert.match(doc.sha256, /^[0-9a-f]{64}$/);
        assert(doc.bytes > 10_000);
      }
      assert.equal(row.documents.question_paper.availability, 'verified_public', row.paper_id);
      assert.equal(row.documents.mark_scheme.availability, 'verified_public', row.paper_id);
    }
    assert.match(inv.official_samples.url, pearson);
  }
  // Seven A-Level sittings x ten papers; seven AS sittings x (Paper 1 + components 21-28).
  assert.equal(inv9.papers.length, 70);
  assert.equal(inv8.papers.length, 63);
  const sittings = (inv) => [...new Set(inv.papers.map((row) => row.pearson_series))];
  assert.deepEqual(sittings(inv9), ['June 2019', 'October 2020', 'November 2021', 'June 2022', 'June 2023', 'June 2024', 'June 2025']);
  assert.deepEqual(sittings(inv8), ['June 2018', 'June 2019', 'October 2020', 'June 2022', 'June 2023', 'June 2024', 'June 2025']);
  // The only gap Pearson leaves: no examiner report for June 2019 8FM0/01.
  const gaps = inv8.papers.flatMap((row) => Object.entries(row.documents).filter(([, d]) => d.availability !== 'verified_public').map(([k]) => `${row.paper_id}:${k}`));
  assert.deepEqual(gaps, ['EDX_8FM0_2019_JUNE_01:examiner_report']);
  // Every AS catalogue row is a verified component; nothing invented.
  const asRows = papers.filter((paper) => paper.qualification_code === '8FM0' && paper.year);
  assert.deepEqual(asRows.map((p) => p.paper_id).sort(), inv8.papers.map((row) => row.paper_id).sort());
  for (const row of [...inv9.papers, ...inv8.papers]) {
    const paper = papers.find((entry) => entry.paper_id === row.paper_id);
    assert.equal(paper.catalogue_verified, true, row.paper_id);
    assert.equal(paper.full_paper_pdf_url, row.documents.question_paper.url, row.paper_id);
    assert.equal(paper.full_mark_scheme_pdf_url, row.documents.mark_scheme.url, row.paper_id);
  }
});

test('AS Paper 2 components 21-28 are single verified modules worth 40 marks', () => {
  const MODULE = { 21: 'FP1', 22: 'FP2', 23: 'FS1', 24: 'FS2', 25: 'FM1', 26: 'FM2', 27: 'D1', 28: 'D2' };
  for (const paper of papers.filter((p) => p.qualification_code === '8FM0')) {
    if (paper.paper_code === '01') {
      assert.deepEqual(paper.module_ids, ['CP']);
      assert.equal(paper.total_marks, 80);
      assert.equal(paper.duration_minutes, 100);
      assert.equal(paper.component_of, undefined);
      continue;
    }
    assert.deepEqual(paper.module_ids, [MODULE[paper.paper_code]], paper.paper_id);
    assert.equal(paper.total_marks, 40);
    assert.equal(paper.component_of, 'Paper 2');
    assert.equal(paper.duration_minutes, 50);
    assert.match(paper.duration_note, /official AS Paper 2 lasts 1 h 40 min for both components/);
  }
  for (const module of subject.module_routes.modules.filter((m) => m.id !== 'CP')) {
    assert.deepEqual(module.papers['8FM0'], [Object.keys(MODULE).find((code) => MODULE[code] === module.id)]);
  }
  // An AS route scope shows AS Paper 1 and only its own two components.
  const route2F = scopeOf(subject, { levels: ['8FM0'], routes: { '8FM0': '2F' } });
  const visible = papers.filter((p) => p.qualification_code === '8FM0' && p.year === 2024 && paperInScope(p, route2F)).map((p) => p.paper_code).sort();
  assert.deepEqual(visible, ['01', '23', '27']);
});

test('imported questions carry the paper qualification, module and corresponding spec points', () => {
  const baseById = new Map(papers.map((paper) => [paper.paper_id, paper]));
  const specPoints = new Map();
  for (const section of spec.sections) for (const topic of section.topics) for (const point of topic.points) {
    specPoints.set(point.id, { module: section.module_id, qualifications: point.qualifications });
  }
  for (const pack of importedPacks) {
    const byId = new Map(pack.papers.map((paper) => [paper.paper_id, { ...baseById.get(paper.paper_id), ...paper }]));
    for (const question of pack.questions) {
      const paper = byId.get(question.paper_id);
      assert(paper, question.question_id);
      assert.equal(question.qualification_code, paper.qualification_code, question.question_id);
      assert.deepEqual([question.module_id], paper.module_ids, question.question_id);
      assert.equal(question.source_type, 'real_past_paper', question.question_id);
      assert.notEqual(question.is_sample, true, question.question_id);
      assert(question.primary_spec_points.length, question.question_id);
      for (const id of question.primary_spec_points) {
        const point = specPoints.get(id);
        assert.equal(point?.module, question.module_id, `${question.question_id}: ${id}`);
        assert(point.qualifications.includes(question.qualification_code), `${question.question_id}: ${id}`);
      }
    }
  }
});

test('activated papers retain one scored record per printed tariff and resolvable source crops', () => {
  const assetsPattern = /assets\/fmaths\/([A-Z0-9_]+)\/([A-Za-z0-9_]+\.webp)/g;
  for (const pack of importedPacks) {
    const [paper] = pack.papers;
    const parts = new Map();
    const order = new Map();
    for (const question of pack.questions) {
      const { question_id: id, parent_question_id: parent, provenance } = question;
      const [tariff] = provenance.original_tariffs;
      assert.equal(provenance.original_tariffs.length, 1, id);
      assert.equal(tariff.marks, question.marks, id);
      assert.equal(tariff.label, question.part_label ?? '', id);
      assert.equal(provenance.original_tariff_indices[0], parts.get(parent) || 0, id);
      assert.equal(provenance.review_status, 'model_reviewed', id);
      parts.set(parent, (parts.get(parent) || 0) + 1);
      for (const dependency of question.depends_on_question_ids || []) {
        assert.equal(order.get(dependency), parent, `${id}: missing earlier scored part ${dependency}`);
      }
      order.set(id, parent);
    }
    assert.deepEqual(paper.question_ids, [...order.keys()], paper.paper_id);
    assert.deepEqual(pack.source_counts, { top_level_questions: parts.size, scored_parts: order.size }, paper.paper_id);
    assert.equal(pack.questions.reduce((n, q) => n + q.marks, 0), paper.total_marks, paper.paper_id);
    const names = new Set();
    for (const [, owner, name] of JSON.stringify(pack).matchAll(assetsPattern)) {
      assert.equal(owner, paper.paper_id);
      names.add(name);
    }
    const { assets } = read(`data/fmaths-assets/${paper.paper_id}.json`);
    assert.deepEqual(new Set(Object.keys(assets)), names, paper.paper_id);
    for (const [name, asset] of Object.entries(assets)) {
      const bytes = Buffer.from(asset.base64, 'base64');
      assert.equal(bytes.toString('ascii', 0, 4), 'RIFF', name);
      assert.equal(bytes.toString('ascii', 8, 12), 'WEBP', name);
      assert.equal(createHash('sha256').update(bytes).digest('hex'), asset.sha256, name);
    }
  }
});
