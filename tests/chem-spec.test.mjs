import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read = path => JSON.parse(readFileSync(new URL('../' + path, import.meta.url), 'utf8'));
const spec = read('data/specs/OCR_ALEVEL_CHEM_H432.json');
const leaves = spec.sections.flatMap(s => s.topics.flatMap(t => t.points));

test('Chemistry leaves are the 43 OCR numbered sections, in specification order, with string codes', () => {
  assert.equal(spec.official_source.version, 'Version 3.1');
  assert.equal(spec.official_source.as_qualification.code, 'H032');
  assert.match(spec.official_source.sha256, /^[0-9a-f]{64}$/);
  assert.equal(leaves.length, 43);
  assert.deepEqual(leaves.map(p => p.id), spec.point_order);
  assert.equal(new Set(leaves.map(p => p.id)).size, 43);
  for (const p of leaves) {
    assert.equal(typeof p.code, 'string');
    assert.equal(p.id, 'OCR_CHEM_' + p.code, 'earlier skill ids are kept');
    assert(p.content.length && p.content.every(c => c.length > 3), p.id);
  }
  // 2.2.1, 5.1.1 and 6.2.2 are distinct section codes, never decimals.
  for (const code of ['2.1.3', '2.2.1', '5.1.1', '6.2.2', '6.3.2']) assert(leaves.some(p => p.code === code), code);
});

test('AS H032 shares Modules 1 to 4 one to one; Modules 5 and 6 are A-level only', () => {
  const asMap = spec.as_section_map;
  assert.equal(Object.keys(asMap).length, 25);
  for (const [code, v] of Object.entries(asMap)) {
    assert(/^AS [1-4]\./.test(code));
    assert.equal(v.leaf, 'OCR_CHEM_' + code.slice(3));
  }
  assert.equal(spec.a_level_only_sections.length, 18);
  assert(spec.a_level_only_sections.every(c => /^[56]\./.test(c)));
});

test('content years: Year 12 is AS-shared Modules 1 to 4, Year 13 the A-level-only Modules 5 and 6', () => {
  const mapping = read('data/curriculum/index.json').mappings.find(m => m.subject_id === 'OCR_ALEVEL_CHEM_H432');
  assert.deepEqual(mapping.years.map(y => [y.year, y.coverage.length]), [[12, 25], [13, 18]]);
});
