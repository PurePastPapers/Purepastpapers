import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {isCompletePaper} from '../js/engine/analytics.js';

const load = file => JSON.parse(readFileSync(new URL('../data/' + file, import.meta.url), 'utf8'));
const subject = 'OCR_L3_SPORT_CTEC';
const registry = load('subjects.json').find(entry => entry.subject_id === subject);
const entries = load('packs/index.json').packs.filter(entry => entry.subject_id === subject && entry.enabled !== false);
const packs = entries.map(entry => load('packs/' + entry.file));
const papers = packs.flatMap(pack => pack.papers);
const questions = packs.flatMap(pack => pack.questions);
const byId = new Map(questions.map(question => [question.question_id, question]));
const active = papers.filter(paper => !paper.resources_only);
const outcomes = new Set(load('specs/' + subject + '.json').sections.flatMap(section =>
  section.topics.flatMap(topic => topic.points.map(point => point.id))
));

test('Sport represents the 05827 route and indexes written exams only', () => {
  assert.equal(registry.spec_code, '05827');
  assert.equal(registry.grade_policy, 'raw_marks_only');
  assert.deepEqual(registry.qualification_structure.school_route.mandatory_external_units, ['01', '03']);
  assert.deepEqual(registry.qualification_structure.school_route.selected_nea_options, ['08', '17']);
  assert.equal(new Set(papers.map(paper => paper.paper_id)).size, papers.length);
  assert.equal(byId.size, questions.length);
  for (const paper of papers) {
    assert.equal(paper.qualification_code, '05827');
    assert.equal(paper.is_official_sample, paper.year === null);
    assert.notEqual(paper.is_sample, true);
    assert(['U01', 'U03'].includes(paper.paper_code));
    assert.equal(paper.total_marks, paper.paper_code === 'U01' ? 70 : 60);
    assert.equal(paper.duration_minutes, paper.paper_code === 'U01' ? 90 : 60);
    assert.match(paper.full_mark_scheme_pdf_url, /^https:\/\/www\.ocr\.org\.uk\/Images\//);
    if (paper.is_official_sample) assert.equal(paper.full_paper_pdf_url, null, 'the combined specimen PDF includes answers');
    assert(!paper.grade_boundaries?.length);
    if (paper.resources_only) assert.equal(paper.question_ids.length, 0);
  }
});

test('Sport packs reconcile their printed, available and excluded tariffs with exact schemes', () => {
  assert(active.length >= 2);
  for (const paper of active) {
    const items = paper.question_ids.map(id => byId.get(id));
    const marks = items.reduce((sum, question) => sum + question.marks, 0);
    assert.equal(marks, paper.available_marks);
    assert.equal(marks + (paper.excluded_questions || []).reduce((sum, q) => sum + q.marks, 0), paper.total_marks);
    assert.equal(isCompletePaper(paper), paper.available_marks === paper.total_marks);
    const catalogue = load('sport-assets/' + paper.paper_id + '.json');
    const check = (url, regions, source) => {
      assert.match(url, new RegExp('^assets/sport/' + paper.paper_id + '/'));
      const asset = catalogue.assets[url.split('/').at(-1)];
      const bytes = Buffer.from(asset.base64, 'base64');
      assert.equal(bytes.subarray(8, 12).toString(), 'WEBP');
      assert.equal(createHash('sha256').update(bytes).digest('hex'), asset.sha256);
      assert(regions.length);
      for (const {page, bbox: [x0, y0, x1, y1]} of regions) {
        assert(page >= source.pages[0] && page <= source.pages[1]);
        assert(0 <= x0 && x0 < x1 && x1 <= 1 && 0 <= y0 && y0 < y1 && y1 <= 1);
      }
    };
    for (const question of items) {
      assert.equal(question.component, paper.paper_code);
      assert.equal(question.paper_id, paper.paper_id);
      assert.equal(question.qualification_code, paper.qualification_code);
      assert.equal(question.scheme_question_number, question.question_number + (question.part_label || ''));
      assert(question.primary_spec_points.length);
      assert([...question.primary_spec_points, ...question.crossover_spec_points].every(point => outcomes.has(point)));
      assert.equal(question.include_in_custom_pool, true);
      assert.equal(question.provenance.question_source_sha256, paper.source_documents.question_paper.sha256);
      assert.equal(question.provenance.scheme_source_sha256, paper.source_documents.mark_scheme.sha256);
      check(question.content.question_image_url, question.provenance.source_regions, paper.source_documents.question_paper);
      check(question.content.mark_scheme_image_url, question.provenance.scheme_regions, paper.source_documents.mark_scheme);
      if (question.context.stem_image_url) check(question.context.stem_image_url, question.provenance.context_regions, paper.source_documents.question_paper);
    }
  }
});

test('June 2025 practice preserves the cardiovascular flowchart and the complete applied Unit 03 rubric', () => {
  const diagram = byId.get('OCR_05827_2025_JUNE_U01_Q15_a');
  assert.equal(diagram.marks, 4);
  assert.equal(diagram.provenance.source_regions[0].page, 6);
  assert(diagram.provenance.source_regions[0].bbox[3] > 0.46);
  const rubric = byId.get('OCR_05827_2025_JUNE_U03_Q02_c');
  assert.equal(rubric.marks, 8);
  assert.equal(rubric.extended_response, true);
  assert.deepEqual(rubric.provenance.scheme_regions.map(region => region.page), [15, 16, 17]);
  const last = byId.get('OCR_05827_2025_JUNE_U03_Q04_e_ii');
  assert.deepEqual(last.provenance.scheme_regions.map(region => region.page), [21]);
  assert.equal(last.marks, 2);
});

test('OCR split schemes and real prior-answer dependencies preserve their exact scopes', () => {
  const june23 = 'OCR_05827_2023_JUNE_U03';
  const cv = byId.get(june23 + '_Q02_c_i');
  const ms = byId.get(june23 + '_Q02_c_ii');
  assert.equal(cv.marks, 3);
  assert.equal(ms.marks, 3);
  assert(cv.provenance.scheme_regions[0].bbox[3] <= ms.provenance.scheme_regions[0].bbox[1]);
  assert(ms.provenance.scheme_regions[1].bbox[0] > 0.6, 'retain the separately scoped shared marking cap');
  assert.deepEqual(byId.get(june23 + '_Q02_d').provenance.scheme_regions.map(region => region.page), [15, 16, 17]);
  const june24 = 'OCR_05827_2024_JUNE_U03';
  assert.deepEqual(byId.get(june24 + '_Q01_d_ii').depends_on_question_ids, [june24 + '_Q01_d_i']);
  assert.deepEqual(byId.get('OCR_05827_SAMPLE_U01_Q18_b').depends_on_question_ids, ['OCR_05827_SAMPLE_U01_Q18_a']);
});
