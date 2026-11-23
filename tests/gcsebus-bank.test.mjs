import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { questionRef } from '../js/ui/question-view.js';

const read = (path) => JSON.parse(readFileSync(new URL('../data/' + path, import.meta.url), 'utf8'));
const subject = 'EDX_GCSE_BUS_1BS0';
const entries = read('packs/index.json').packs.filter((entry) => entry.subject_id === subject);
const packs = entries.map(({file}) => read('packs/' + file));
const demo = read('papers/' + subject + '.json');
const byPaper = new Map(packs.map((pack) => [pack.papers[0].paper_id, pack]));
const coverage = read('imports/gcsebus/coverage.json');

test('Business pack retains original paper IDs, exact tariffs, and distinct specimen identities', () => {
  assert.equal(packs.length, 16);
  assert.equal(byPaper.size, packs.length);
  assert(demo.find((paper) => paper.paper_id === 'EDX_1BS0_DEMO_P12').is_sample);
  assert(demo.filter((paper) => !paper.is_sample).every((paper) => byPaper.has(paper.paper_id)));

  for (const {papers: [paper], questions} of packs) {
    const report = coverage.find(({paper_id}) => paper_id === paper.paper_id);
    assert.equal(questions.length, report.scored_units);
    assert.equal(questions.reduce((sum, question) => sum + question.marks, 0), report.published_marks);
    assert.equal(report.published_marks + report.excluded.reduce((sum, question) => sum + question.marks, 0), 90);
    assert.deepEqual(paper.question_ids, questions.map((question) => question.question_id));
    assert.equal(new Set(paper.question_ids).size, questions.length);
    assert.equal(paper.duration_minutes, paper.year && paper.year < 2023 ? 90 : 105);
    assert.equal(Boolean(paper.is_official_sample), paper.year === null);
    assert.match(paper.official_paper_code, /^1BS0\/0[12]$/);
    assert.equal(paper.tier, null);
    assert.equal(paper.choice_groups, undefined);
    assert(!questions.some((question) => question.is_sample));
  }
});

test('Business question, case and exact scheme assets resolve with matching checksums', () => {
  for (const {papers: [paper], questions} of packs) {
    const catalogue = read('gcsebus-assets/' + paper.paper_id + '.json');
    const urls = questions.flatMap((question) => [
      question.content.question_image_url, question.content.mark_scheme_image_url,
      ...(question.context.figures || []).map((figure) => figure.image_url).filter(Boolean),
    ]);
    const names = new Set(urls.map((url) => {
      assert(url.startsWith('assets/gcsebus/' + paper.paper_id + '/'));
      return url.split('/').at(-1);
    }));
    assert.deepEqual([...names].sort(), Object.keys(catalogue.assets).sort());
    for (const {sha256, base64} of Object.values(catalogue.assets)) {
      const buffer = Buffer.from(base64, 'base64');
      assert.equal(buffer.toString('ascii', 8, 12), 'WEBP');
      assert.equal(createHash('sha256').update(buffer).digest('hex'), sha256);
    }
    for (const question of questions) {
      assert.equal(question.scheme_scope, 'part');
      assert.equal(question.scheme_question_number, question.question_number + question.part_label);
      if (question.selection_count) assert.equal(question.selection_count, question.marks);
      if (question.section !== 'Section A' && !question.scheme_question_number.startsWith('5(a)') && !question.scheme_question_number.startsWith('5(b)')) {
        assert(question.context.figures?.length, question.question_id);
      }
    }
  }
});

test('June 2024 Paper 1 keeps calculations separate and uses exact extended-response schemes', () => {
  const {questions} = byPaper.get('EDX_1BS0_2024_JUNE_P1');
  const part = (label) => questions.find((question) => question.scheme_question_number === label);
  const table = (q) => q.context.figures.find(({label}) => label === 'Table 2');
  assert.equal(questionRef(part('5(a)')), 'Q5(a)');
  assert.equal(part('5(a)').marks, 2);
  assert.equal(part('5(b)').marks, 2);
  assert(table(part('5(a)')).image_url);
  assert.equal(table(part('5(a)')).image_url, table(part('5(b)')).image_url);
  assert.equal(part('5(b)').depends_on_question_ids, undefined);
  assert.notDeepEqual(part('5(a)').provenance.scheme_regions, part('5(b)').provenance.scheme_regions);
  assert.equal(part('6(c)').marks, 9);
  assert.deepEqual(part('6(c)').provenance.scheme_regions.map(({page}) => page + 1), [13]);
  assert.equal(part('7(e)').marks, 12);
  assert(part('7(e)').context.figures.some((figure) => figure.label === 'Section C case study' && figure.image_url));
  assert.deepEqual(part('7(e)').provenance.scheme_regions.map(({page}) => page + 1), [16, 17]);
  assert.match(part('3(b)').content.mark_scheme_html, /unrelated percentage/);
});

test('the Paper 2 correction and specimen tariff follow the published question paper', () => {
  const live = byPaper.get('EDX_1BS0_2025_JUNE_P2').questions.find((q) => q.scheme_question_number === '1(b)');
  assert.equal(live.selection_count, 1);
  assert.match(live.preview_text, /latest date/i);
  assert(live.provenance.source_regions.some(({page}) => page === 0));
  const sample = byPaper.get('EDX_1BS0_SAM_P2').questions.find((q) => q.scheme_question_number === '5(a)');
  assert.equal(sample.marks, 1);
  assert.match(sample.content.mark_scheme_html, /maximum here/);
});
