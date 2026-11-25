import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync, readdirSync} from 'node:fs';
import {createSpecIndex} from '../js/engine/spec-index.js';
import {validateBundle} from '../js/data/schema.js';
import {LEGACY_SPEC_IDS} from '../js/config/spec-id-migrations.js';

const read = file => JSON.parse(readFileSync(new URL('../' + file, import.meta.url), 'utf8'));
const subjectId = 'OCR_L3_APPSCI_AAQ';
const sourceInventory = read('data/imports/appsci/source-inventory.json');
const coverage = read('data/imports/appsci/coverage.json');
const rights = read('data/imports/appsci/rights.json');
const packFiles = readdirSync(new URL('../data/packs/appsci/', import.meta.url)).filter(file => file.endsWith('.json')).sort();
const packs = packFiles.map(file => read('data/packs/appsci/' + file));
const papers = packs.flatMap(pack => pack.papers);
const units = packs.flatMap(pack => pack.questions);
const byPaper = new Map(packs.map(pack => [pack.papers[0].paper_id, pack]));
const spec = read('data/specs/OCR_L3_APPSCI_AAQ.json');
const leaves = new Set(spec.sections.flatMap(section => section.topics.flatMap(topic => topic.points.map(point => point.id))));

test('only the two released official samples are represented, with their published tariffs and partial scored coverage', () => {
  assert.deepEqual(packFiles, ['OCR_F180_SAMPLE.json', 'OCR_F181_SAMPLE.json']);
  assert.deepEqual(papers.map(paper => paper.paper_id).sort(), ['OCR_F180_SAMPLE', 'OCR_F181_SAMPLE']);
  assert.equal(new Set(units.map(question => question.question_id)).size, units.length);
  assert.deepEqual(sourceInventory.assessment_page_observation.public_scoreable_exam_sources, ['F180-SAM', 'F181-SAM']);
  assert.equal(coverage.totals.printed_marks, 120);
  assert.equal(coverage.totals.marks_available, 98);
  assert.equal(coverage.totals.blocked_marks, 22);
  assert.equal(coverage.totals.scored_parts, 49);
  assert.equal(coverage.totals.live_past_papers, 0);
  assert.equal(coverage.totals.paper_only, 0);
  assert.equal(coverage.status, rights.status === 'owner_confirmed' ? 'partial_source_coverage' : 'built_awaiting_rights_confirmation');
  assert.deepEqual(coverage.papers.map(paper => [paper.paper_id, paper.printed_marks, paper.available_marks, paper.scored_parts]).sort(), [
    ['OCR_F180_SAMPLE', 70, 65, 34],
    ['OCR_F181_SAMPLE', 50, 33, 15],
  ]);
  for (const [paperId, totalMarks] of [['OCR_F180_SAMPLE', 70], ['OCR_F181_SAMPLE', 50]]) {
    const paper = byPaper.get(paperId).papers[0];
    const questions = byPaper.get(paperId).questions;
    assert.equal(paper.total_marks, totalMarks, paperId);
    assert.equal(paper.available_marks, questions.reduce((sum, question) => sum + question.marks, 0), paperId);
    assert.equal(paper.available_marks + (paper.excluded_questions || []).reduce((sum, question) => sum + question.marks, 0), totalMarks, paperId);
    assert.deepEqual(paper.question_ids, questions.map(question => question.question_id));
    assert.equal(paper.is_official_sample, true);
    assert.equal(paper.is_sample, undefined);
    assert.equal(paper.year, null);
    assert.equal(paper.series, 'Sample');
    assert.equal(Boolean(paper.incomplete || paper.coverage_status === 'partial'), paper.available_marks < totalMarks);
    if (paper.available_marks < totalMarks) {
      assert.equal(paper.coverage_status, 'partial');
      assert.match(paper.practice_coverage_note, /available/i);
      assert((paper.excluded_questions || []).length > 0);
    }
  }
});

test('January 2026 pre-release material and unlisted live papers never enter the sample bank', () => {
  assert(sourceInventory.sources.some(source => source.id === 'F181-PRERELEASE-JAN2026'));
  assert(!papers.some(paper => paper.paper_id.includes('JAN2026') || paper.year === 2026 && !paper.is_official_sample));
  assert(!units.some(question => /JAN2026|pre-release insert/i.test(question.question_id)));
  assert(sourceInventory.missing_public_material.some(item => item.id === 'H151-LIVE-EXTERNAL-PAPERS'));
  const indexed = read('data/packs/index.json').packs.filter(entry => entry.file.startsWith('appsci/'));
  assert(indexed.length <= packs.length);
  assert(indexed.every(entry => entry.enabled === (rights.status === 'owner_confirmed')), 'pack activation follows recorded rights confirmation');
});

test('F181 blocks the nine-mark source-dependent Question 4 instead of borrowing a specimen or January insert scheme', () => {
  const paper = byPaper.get('OCR_F181_SAMPLE').papers[0];
  assert.equal(paper.full_mark_scheme_pdf_url, null);
  assert(!byPaper.get('OCR_F181_SAMPLE').questions.some(question => /^OCR_F181_SAMPLE_Q04/.test(question.question_id)));
  assert.deepEqual(paper.excluded_questions.filter(question => question.question_number === '4').map(question => question.marks), [9]);
  assert.match(paper.excluded_questions.find(question => question.question_number === '4').reason, /Source A|Source B/i);
  const insert = sourceInventory.sources.find(source => source.id === 'F181-PRERELEASE-JAN2026');
  assert.equal(insert.coverage_kind, 'series_insert_identity_only');
  assert.equal(insert.scoreable, false);
  assert.equal(insert.matching_live_question_paper.url, null);
  assert.equal(insert.matching_live_mark_scheme.url, null);
});

test('F180 preserves the printed choice question, ECF calculation, graticule calibration, and last-item boundary', () => {
  const questions = new Map(byPaper.get('OCR_F180_SAMPLE').questions.map(question => [question.question_id, question]));
  const choices = questions.get('OCR_F180_SAMPLE_Q01_a_i');
  assert.equal(choices.marks, 3);
  assert.equal(choices.provenance.original_parts[0], '1(a)(i)');
  assert.equal(choices.provenance.source_regions[0].page, 2);
  assert(choices.context.stem_image_url, 'the original choices stay inside the source crop');
  const ecf = questions.get('OCR_F180_SAMPLE_Q02_b_i_ii');
  assert.equal(ecf.marks, 2);
  assert.deepEqual(ecf.provenance.original_parts, ['2(b)(i)', '2(b)(ii)']);
  assert.deepEqual(ecf.provenance.scheme_regions.map(region => region.page), [24]);
  const graticule = questions.get('OCR_F180_SAMPLE_Q11_b_i');
  assert.equal(graticule.marks, 3);
  assert.equal(graticule.provenance.source_regions[0].page, 15);
  assert.deepEqual(graticule.provenance.scheme_regions.map(region => region.page), [33]);
  const last = questions.get('OCR_F180_SAMPLE_Q11_b_iii');
  assert.equal(last.marks, 1);
  assert.equal(last.provenance.source_regions[0].page, 16);
  assert(last.provenance.source_regions[0].bbox[3] < 0.70, 'the crop ends above the page footer/end matter');
  assert.equal(byPaper.get('OCR_F180_SAMPLE').papers[0].excluded_questions.reduce((sum, item) => sum + item.marks, 0), 5);
});

test('existing unit-wide learned ticks retain their meaning and all six practicals resolve', () => {
  for (const [unit, count] of [['F180', 53], ['F181', 24]]) {
    const alias = `OCR_L3SCI_${unit}.1`;
    const ids = spec.legacy_ids[alias];
    assert.equal(ids.length, count);
    assert.equal(new Set(ids).size, count);
    assert.deepEqual(LEGACY_SPEC_IDS[alias], ids);
    assert(ids.every(id => leaves.has(id)));
    assert(ids.every(id => id.includes('_F181_') === (unit === 'F181')));
  }
  assert.deepEqual(spec.practical_crosswalk.map(item => item.practical), ['1', '2', '3', '4', '5', '6']);
  assert(spec.practical_crosswalk.every(item => spec.legacy_ids['OCR_L3SCI_F180.1'].includes(item.point_id)));
});

test('January raw and UMS boundaries stay separate and never grade the specimens', () => {
  const boundaries = read('data/imports/appsci/series-boundaries.json');
  const source = sourceInventory.sources.find(item => item.id === boundaries.source_id);
  assert.equal(boundaries.series, 'January 2026');
  assert.equal(boundaries.source_sha256, source.sha256);
  assert.deepEqual(boundaries.units.F180.raw_boundaries, {D: 56, M: 41, P: 27, U: 0});
  assert.deepEqual(boundaries.units.F180.ums_boundaries, {D: 56, M: 42, P: 28, U: 0});
  assert(papers.every(paper => !paper.grade_boundaries?.length));
});

test('sample question tags, part identities, and official assessment metadata are coherent', () => {
  assert.equal(papers.length, 2);
  assert.equal(units.length, packs.reduce((sum, pack) => sum + pack.questions.length, 0));
  for (const question of units) {
    assert.equal(question.source_type, 'real_past_paper');
    assert.equal(question.is_sample, false);
    assert.equal(question.is_official_sample, true);
    assert.equal(question.year, null);
    assert.equal(question.series, 'Sample');
    assert.equal(question.qualification_code, 'H151');
    assert(question.primary_spec_points?.length, question.question_id);
    for (const id of [...question.primary_spec_points, ...(question.crossover_spec_points || [])]) assert(leaves.has(id), `${question.question_id}: ${id}`);
    assert(['easy', 'medium', 'hard'].includes(question.difficulty), question.question_id);
    assert.equal(question.provenance.review_status, 'model_reviewed');
    assert(question.content.question_image_url?.startsWith('assets/appsci/'), question.question_id);
    assert(question.content.mark_scheme_image_url?.startsWith('assets/appsci/'), question.question_id);
    assert.equal(question.scheme_scope, 'part');
    assert(question.scheme_question_number);
  }
});

test('all referenced question and scheme crops resolve to lossless checksummed assets', () => {
  for (const pack of packs) {
    const paperId = pack.papers[0].paper_id;
    const catalogue = read(`data/appsci-assets/${paperId}.json`);
    assert.equal(catalogue.paper_id, paperId);
    const references = [...JSON.stringify(pack).matchAll(/assets\/appsci\/[^/]+\/([A-Za-z0-9_.-]+\.webp)/g)].map(match => match[1]);
    assert.deepEqual(Object.keys(catalogue.assets).sort(), [...new Set(references)].sort());
    for (const asset of Object.values(catalogue.assets)) {
      const bytes = Buffer.from(asset.base64, 'base64');
      assert.equal(bytes.toString('ascii', 8, 12), 'WEBP');
      assert.equal(createHash('sha256').update(bytes).digest('hex'), asset.sha256);
    }
  }
});

test('the Applied Science sample bundle passes the shared schema and follows the recorded publication decision', () => {
  const subject = read('data/subjects.json').find(item => item.subject_id === subjectId);
  assert(subject);
  const index = createSpecIndex();
  index.add(spec);
  const bundle = {
    subject,
    papers,
    questions: units,
    questionsById: new Map(units.map(question => [question.question_id, question])),
  };
  const errors = validateBundle(bundle, index).filter(issue => issue.level === 'error');
  assert.deepEqual(errors, []);
  assert(!read('data/packs/index.json').packs.some(entry => entry.file.startsWith('appsci/') && entry.enabled !== (rights.status === 'owner_confirmed')));
});
