import {test} from 'node:test';
import assert from 'node:assert/strict';
import {bandFor, BUTTON_LIMIT, BANDS} from '../js/ui/mark-picker.js';

test('score colour: green 70% and over, yellow 50 to 69%, red under 50%', () => {
  assert.deepEqual(BANDS, {green: 70, amber: 50});
  assert.equal(bandFor(7, 10), 'green');
  assert.equal(bandFor(10, 10), 'green');
  assert.equal(bandFor(6, 10), 'amber');
  assert.equal(bandFor(5, 10), 'amber');
  assert.equal(bandFor(4, 10), 'red');
  assert.equal(bandFor(0, 10), 'red');
  assert.equal(bandFor(13, 15), 'green');   // 86.7%
  assert.equal(bandFor(10, 15), 'amber');   // 66.7%
  assert.equal(bandFor(7, 15), 'red');      // 46.7%
  assert.equal(bandFor(8, 15), 'amber');    // 53.3%
});

test('one-mark questions keep two buttons; everything larger is a slider', () => {
  assert.equal(BUTTON_LIMIT, 1);
  assert.equal(bandFor(1, 1), 'green');
  assert.equal(bandFor(0, 1), 'red');
  assert.equal(bandFor(Number.NaN, 5), 'none');
  assert.equal(bandFor(1, 0), 'none');
});
