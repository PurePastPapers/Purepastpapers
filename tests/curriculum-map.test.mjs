import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSpecIndex } from '../js/engine/spec-index.js';
import { createCurriculumMap } from '../js/engine/curriculum-map.js';

// Isolated synthetic mapping: not a claim about a published syllabus or book.
const index = createSpecIndex();
index.add({ subject_id: 'S', sections: [{ id: 'sec', title: 'Section', topics: [{ id: 'topic', title: 'Topic', points: [
  { id: 'a', code: '2.9', title: 'A' }, { id: 'b', code: '2.10', title: 'B' }, { id: 'c', code: '2.11', title: 'C' },
] }] }] });
const meta = { status: 'verified', source_url: 'https://example.test/reference', reviewed_at: '2026-01-01', specification_version: 'fixture' };
const yearMapping = { ...meta, type: 'year', years: [
  { id: 'y12', title: 'Year 12', year: 12, coverage: [{ point_id: 'a', extent: 'full' }, { point_id: 'b', extent: 'partial', note: 'First half' }] },
  { id: 'y13', title: 'Year 13', year: 13, coverage: [{ point_id: 'b', extent: 'partial', note: 'Second half' }, { point_id: 'c', extent: 'full' }] },
] };
const bookMapping = { ...meta, id: 'book1', type: 'textbook', publisher: 'Fixture', book: 'Example', edition: '1', chapters: [
  { id: 'chapter1', title: 'Chapter one', coverage: [{ point_id: 'a', extent: 'full' }, { point_id: 'b', extent: 'partial', note: 'Only one aspect' }] },
  { id: 'chapter2', title: 'Chapter two', coverage: [{ point_id: 'a', extent: 'partial', note: 'Further applications' }, { point_id: 'c', extent: 'full' }] },
] };

test('verified year and textbook mappings expose partial and many-to-many coverage without changing learned state', () => {
  const learned = new Set(['a']);
  const map = createCurriculumMap({ subject_id: 'S', mappings: [yearMapping, bookMapping] }, index);
  const year13 = map.coverage([map.years[1]]);
  assert.deepEqual([...year13.full], ['c']);
  assert.deepEqual([...year13.partial], [['b', ['Second half']]]);
  assert.deepEqual([...learned], ['a']);
  const chapters = map.coverage(map.books[0].chapters);
  assert.deepEqual([...chapters.full], ['a', 'c']);
  assert.deepEqual([...chapters.partial.keys()], ['b']);
  assert.deepEqual([...index.range('S', 'a', 'c')], ['a', 'b', 'c']);
});

test('provisional data is not offered and invalid verified records fail closed', () => {
  const provisional = { type: 'textbook', status: 'provisional' };
  assert.equal(createCurriculumMap({ subject_id: 'S', mappings: [provisional] }, index).books.length, 0);
  assert.throws(() => createCurriculumMap({ subject_id: 'S', mappings: [{ ...bookMapping, source_url: '' }] }, index));
  assert.throws(() => createCurriculumMap({ subject_id: 'S', mappings: [{ ...yearMapping, years: [{ ...yearMapping.years[0], coverage: [{ point_id: 'b', extent: 'partial' }] }] }] }, index));
  assert.throws(() => createCurriculumMap({ subject_id: 'S', mappings: [{ ...yearMapping, years: [{ ...yearMapping.years[0], coverage: [{ point_id: 'other', extent: 'full' }] }] }] }, index));
});
