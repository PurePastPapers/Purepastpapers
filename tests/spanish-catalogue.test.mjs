import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { assessmentResourceLinks } from '../js/ui/assessment-resources.js';

const read = path => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'));
const papers = read('../data/papers/AQA_ALEVEL_SPAN_7692.json');
const manifest = read('../data/imports/spanish/official-sources.json');
const byId = new Map(papers.map(paper => [paper.paper_id, paper]));
const byUrl = new Map(manifest.map(item => [item.url, item]));

test('Spanish catalogue keeps original routes and matches written papers to verified official resources', () => {
  const written = papers.filter(paper => !paper.is_sample && paper.paper_code !== 'P3');
  assert.equal(written.length, 18);
  assert.equal(written.filter(paper => paper.catalogue_verified).length, 14);
  for (const paper of written) {
    if (!paper.catalogue_verified) {
      assert.equal(paper.resources_only, true);
      assert.equal(paper.full_paper_pdf_url, null);
      continue;
    }
    const qualifier = paper.year ? `${paper.series === 'Autumn' ? 'November' : 'June'} ${paper.year}` : 'Sample set 1';
    for (const [url, prefix] of [[paper.full_paper_pdf_url, 'Question paper:'], [paper.full_mark_scheme_pdf_url, 'Mark scheme:']]) {
      const source = byUrl.get(url);
      assert.ok(source?.title.startsWith(prefix) && source.title.endsWith(qualifier));
      assert.ok(source.title.includes(`Paper ${paper.paper_code.slice(1)} `));
      assert.match(source.sha256, /^[a-f0-9]{64}$/);
    }
  }
  assert.equal(byId.get('AQA_7692_2020_AUTUMN_P2').official_paper_code, '7692/2R');
  assert.equal(byId.get('AQA_7692_SAMPLE_1_P2').year, null);
});

test('June 2024 listening materials are available for the timed attempt and the transcript is gated', () => {
  const paper = byId.get('AQA_7692_2024_JUNE_P1');
  assert.match(byUrl.get(paper.full_mark_scheme_pdf_url).name, /Final-MS-Jun24-v2\.0/);
  const resources = assessmentResourceLinks(paper).map(String).join('');
  assert.match(resources, /Listening audio/);
  assert.match(resources, /Listening tracks/);
  assert.match(resources, /Reading insert/);
  assert.doesNotMatch(resources, /transcript/i);
  const review = assessmentResourceLinks(paper, { review: true }).map(String).join('');
  assert.match(review, /Listening transcript/);
  assert.doesNotMatch(review, /Reading insert/);
});

test('Speaking stays one resource-only assessment per series and links the revised specimen Card I', () => {
  const speaking = papers.filter(paper => paper.paper_code === 'P3');
  assert.equal(speaking.length, 5);
  for (const paper of speaking) {
    assert.equal(paper.resources_only, true);
    assert.equal(paper.official_paper_code, '7692/3T/3V');
    assert.equal(paper.total_marks, 60);
    assert.deepEqual(paper.question_ids, []);
  }
  const specimen = byId.get('AQA_7692_SAMPLE_1_P3');
  assert.equal(specimen.assessment_resources.length, 12);
  const cardI = specimen.assessment_resources.find(item => item.kind === 'speaking_card_I');
  assert.equal(byUrl.get(cardI.url).name, 'AQA-76923-C-CARDI-2025.PDF');
  assert.equal(byId.get('AQA_7692_2025_JUNE_P3').assessment_resources, undefined);
});
