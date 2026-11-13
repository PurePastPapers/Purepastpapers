import assert from 'node:assert/strict';
import { test } from 'node:test';
import { gradesIn, targetBand } from '../js/engine/analytics.js';

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
