import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { LEGACY_SPEC_IDS } from '../js/config/spec-id-migrations.js';
import { isCompletePaper } from '../js/engine/analytics.js';
import { filterQuestions } from '../js/engine/filter-engine.js';
import { linkGroups } from '../js/engine/linked-parts.js';
import { paperSessionQuestionIds } from '../js/engine/paper-choice.js';
import { testEntries, testPool } from '../js/engine/practice-modes.js';
import { createSpecIndex } from '../js/engine/spec-index.js';

const bytes = path => readFileSync(new URL(`../${path}`, import.meta.url));
const json = path => JSON.parse(bytes(path));
const subjectId = 'OCR_L3_IT_AAQ';
const subject = json('data/subjects.json').find(record => record.subject_id === subjectId);
const spec = json(`data/specs/${subjectId}.json`);
const specIndex = createSpecIndex();
specIndex.add(spec);
const ids = ['OCR_F200_SAMPLE', 'OCR_F201_SAMPLE'];
const packs = ids.map(id => json(`data/packs/itbank/${id}.json`));
const papers = packs.flatMap(pack => pack.papers);
const parts = packs.flatMap(pack => pack.questions);
const papersById = new Map(papers.map(paper => [paper.paper_id, paper]));
const questionsById = new Map(parts.map(part => [part.question_id, part]));
linkGroups(questionsById, papersById);

test('both canonical specimens are indexed once and attemptable at their cover marks and timings', () => {
  const index = json('data/packs/index.json').packs.filter(entry => entry.subject_id === subjectId);
  assert.deepEqual(index.map(entry => entry.file), ids.map(id => `itbank/${id}.json`));
  assert(index.every(entry => entry.enabled));
  assert.equal(subject.grade_policy, 'raw_marks_only');
  for (const [index, pack] of packs.entries()) {
    const [paper] = pack.papers;
    assert(isCompletePaper(paper));
    assert(paper.is_official_sample);
    assert.equal(paper.duration_minutes, [75, 90][index]);
    assert.equal(pack.questions.length, [26, 23][index]);
    assert.equal(pack.questions.reduce((sum, part) => sum + part.marks, 0), 60);
    assert.equal(paper.available_marks, 60);
    assert.equal(paper.total_marks, 60);
    assert.deepEqual(paperSessionQuestionIds(paper, paper.question_ids, questionsById), paper.question_ids);
    assert.equal(testPool(pack.questions, papersById).length, pack.questions.length);
  }
  assert.equal(new Set(parts.map(part => part.question_id)).size, 49);
});

test('Certificate practice includes the shared F200 once and excludes F201', () => {
  const context = {specIndex, papersById};
  const forRoute = code => filterQuestions(parts, {qualificationCodes: [code], learnedOnly: false}, context).matches;
  assert.equal(forRoute('H019').length, 26);
  assert(forRoute('H019').every(part => part.component === 'F200'));
  assert.equal(forRoute('H119').length, 49);
  assert.equal(testPool(forRoute('H019'), papersById).length, 26);
});

test('linked parts count their prerequisites once and reuse the same context', () => {
  const first = questionsById.get('OCR_F200_SAMPLE_Q15_a');
  const next = questionsById.get('OCR_F200_SAMPLE_Q15_b');
  assert.equal(first.context.stem_image_url, next.context.stem_image_url);
  const entries = testEntries([first, next], [first, next], questionsById);
  assert.equal(entries.length, 1);
  assert.equal(entries[0].marks, 2);
  assert.deepEqual(entries[0].part_ids, [first.question_id, next.question_id]);
  const match = questionsById.get('OCR_F201_SAMPLE_Q07_b_ii');
  assert.deepEqual(match.depends_on_question_ids, ['OCR_F201_SAMPLE_Q07_b_i']);
  assert.equal(match.marks, 4);
});

test('each tagged part and old learned alias resolves to a real OCR heading', () => {
  const leaves = new Set(spec.point_order);
  for (const part of parts) {
    assert(part.primary_spec_points.every(point => leaves.has(point)));
    assert(part.primary_spec_points.every(point => point.startsWith(`OCR_L3IT_${part.component}_`)));
  }
  assert.equal(leaves.size, 43);
  for (const [id, targets] of Object.entries(spec.legacy_ids)) {
    assert.deepEqual(LEGACY_SPEC_IDS[id], targets);
    assert(targets.length > 1 && targets.every(point => leaves.has(point)));
  }
});

test('question and scheme images are separate, source-bound, and correctly checksummed', () => {
  for (const {papers: [paper], questions} of packs) {
    const catalogue = json(`data/itbank-assets/${paper.paper_id}.json`);
    const referenced = new Set();
    for (const question of questions) {
      const {source_regions: own, scheme_regions: scheme, context_regions: context} = question.provenance;
      assert(own.every(region => region.page >= 2 && region.page <= 14));
      assert(context.every(region => region.page >= 2 && region.page <= 14));
      assert(scheme.every(region => region.page >= 20));
      assert.equal(question.scheme_scope, 'part');
      assert.equal(question.scheme_question_number, question.question_number + (question.part_label || ''));
      for (const region of [...own, ...scheme, ...context]) {
        const [left, top, right, bottom] = region.bbox;
        assert(0 <= left && left < right && right <= 1 && 0 <= top && top < bottom && bottom <= 1);
      }
      for (const url of [question.content.question_image_url, question.content.mark_scheme_image_url, question.context.stem_image_url].filter(Boolean)) {
        assert(url.startsWith(`assets/itbank/${paper.paper_id}/`));
        const name = url.split('/').at(-1);
        assert(catalogue.assets[name], name);
        referenced.add(name);
      }
    }
    assert.deepEqual(referenced, new Set(Object.keys(catalogue.assets)));
    for (const {base64, sha256} of Object.values(catalogue.assets)) {
      const binary = Buffer.from(base64, 'base64');
      assert.equal(binary.toString('ascii', 8, 12), 'WEBP');
      assert.equal(createHash('sha256').update(binary).digest('hex'), sha256);
    }
    for (const path of [paper.full_paper_pdf_url, paper.full_mark_scheme_pdf_url]) {
      assert.equal(bytes(path).toString('ascii', 0, 5), '%PDF-');
    }
  }
  const dataCleaning = parts.find(part => part.question_id === 'OCR_F201_SAMPLE_Q01_c');
  assert.deepEqual(dataCleaning.provenance.context_regions.map(region => region.page), [3]);
  const clusterAnalysis = parts.find(part => part.question_id === 'OCR_F201_SAMPLE_Q06_c');
  assert.deepEqual(clusterAnalysis.provenance.scheme_regions.map(region => region.page), [25, 26]);
});

test('NEA and annotated specimens are retained as reference links outside the scored bank', () => {
  assert.equal(subject.assessment_references.length, 7);
  assert.match(subject.assessment_references[0].label, /mandatory NEA/);
  for (const ref of subject.assessment_references) {
    assert.match(ref.url, /^https:\/\/www\.ocr\.org\.uk\/Images\//);
    assert(!papers.some(paper => Object.values(paper).includes(ref.url)));
    assert(!parts.some(part => part.provenance.question_source_url === ref.url || part.provenance.scheme_source_url === ref.url));
  }
});
