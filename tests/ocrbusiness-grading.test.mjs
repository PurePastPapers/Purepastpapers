import assert from 'node:assert/strict';
import { test } from 'node:test';
import { GRADE_SCHEMES } from '../js/config/app.config.js';
import { gradeFor, gradesIn } from '../js/engine/analytics.js';

test('OCR Cambridge Technical unit scheme has labels but no inferred percentage bands', () => {
  assert.deepEqual(GRADE_SCHEMES.ocr_ctec_unit.bands, []);
  assert.deepEqual(gradesIn('ocr_ctec_unit'), ['D', 'M', 'P', 'U']);
  assert.equal(gradeFor(100, 'ocr_ctec_unit'), null);
  assert.equal(gradeFor(0, 'ocr_ctec_unit'), null);
});

test('OCR Cambridge Technical unit grades use supplied paper boundaries only', () => {
  const boundaries = [
    { grade: 'D', min_percentage: 72 },
    { grade: 'M', min_percentage: 55 },
    { grade: 'P', min_percentage: 40 },
  ];

  assert.equal(gradeFor(100, 'ocr_ctec_unit', boundaries), 'D');
  assert.equal(gradeFor(60, 'ocr_ctec_unit', boundaries), 'M');
  assert.equal(gradeFor(20, 'ocr_ctec_unit', boundaries), 'U');
});

test('generic Level 3 grade scheme remains unchanged for other subjects', () => {
  assert.equal(gradeFor(90, 'level3'), 'D*');
  assert.equal(gradeFor(72, 'level3'), 'D');
});
