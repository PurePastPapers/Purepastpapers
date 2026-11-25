import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { gradeFor, gradesIn, isCompletePaper, targetBand } from '../js/engine/analytics.js';

test('grades are listed best first with the fail grade last', () => {
  assert.deepEqual(gradesIn('alevel'), ['A*', 'A', 'B', 'C', 'D', 'E', 'U']);
  assert.deepEqual(gradesIn('nope'), []);
});

test('a paper grade is judged against the target grade', () => {
  assert.equal(targetBand('A*', 'A', 'alevel'), 'exceeding');
  assert.equal(targetBand('A', 'A', 'alevel'), 'secure');
  assert.equal(targetBand('B', 'A', 'alevel'), 'developing');
  assert.equal(targetBand('C', 'A', 'alevel'), 'needs_work');
  assert.equal(targetBand('U', 'E', 'alevel'), 'developing');
  assert.equal(targetBand('7', '5', 'gcse'), 'exceeding');
  assert.equal(targetBand('M', 'D*', 'level3'), 'needs_work');
});

test('missing or unknown grades give no band', () => {
  assert.equal(targetBand(null, 'A', 'alevel'), null);
  assert.equal(targetBand('A', null, 'alevel'), null);
  assert.equal(targetBand('9', 'A', 'alevel'), null);
});

test('raw mark policies do not use generic grade scales, but may use a paper’s own boundaries', () => {
  assert.equal(gradeFor(70, 'level3'), 'D');
  assert.equal(gradeFor(70, 'level3', null, 'raw_marks_only'), null);
  assert.equal(gradeFor(70, 'level3', [{ grade: 'M', min_percentage: 65 }], 'raw_marks_only'), 'M');
});

test('OCR H151 is explicitly configured for raw marks only', () => {
  const subjects = JSON.parse(readFileSync(new URL('../data/subjects.json', import.meta.url), 'utf8'));
  const h151 = subjects.find((subject) => subject.subject_id === 'OCR_L3_APPSCI_AAQ');
  assert.equal(h151.grade_policy, 'raw_marks_only');
  assert.equal(gradeFor(70, h151.grade_scheme, null, h151.grade_policy), null);
});

test('partial papers are not treated as complete sittings', () => {
  assert.equal(isCompletePaper({ total_marks: 70, available_marks: 65 }), false);
  assert.equal(isCompletePaper({ total_marks: 50, available_marks: 33 }), false);
  assert.equal(isCompletePaper({ total_marks: 70, available_marks: 50 }), false);
  assert.equal(isCompletePaper({ total_marks: 70, available_marks: 70 }), true);
  assert.equal(isCompletePaper({ total_marks: 70, coverage_status: 'partial' }), false);
});
