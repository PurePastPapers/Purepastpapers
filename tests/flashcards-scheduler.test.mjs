import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createCard,
  isDue,
  MAX_RETENTION,
  MIN_RETENTION,
  previewRatings,
  rateCard,
  SCHEDULER_VERSION,
} from '../js/flashcards/scheduler.js';

const start = Date.parse('2026-01-01T00:00:00.000Z');
const iso = (milliseconds) => new Date(milliseconds).toISOString();

test('fresh card previews are deterministic and include all four ratings', () => {
  const card = createCard(start);
  const first = previewRatings(card, start);
  const second = previewRatings(card, start);

  assert.deepEqual(first, second);
  assert.deepEqual(Object.keys(first), ['Again', 'Hard', 'Good', 'Easy']);
  assert.equal(first.Again.state, 'Learning');
  assert.equal(first.Again.interval_ms, 60_000);
  assert.equal(first.Hard.interval_ms, 6 * 60_000);
  assert.equal(first.Good.interval_ms, 10 * 60_000);
  assert.equal(first.Easy.state, 'Review');
});

test('review events move cards through learning, review and relearning', () => {
  const learning = rateCard(createCard(start), 3, start);
  assert.equal(learning.card.state, 'Learning');
  assert.equal(learning.card.due, iso(start + 10 * 60_000));
  assert.equal(learning.log.state, 'New');
  assert.equal(learning.log.scheduler_version, SCHEDULER_VERSION);

  const review = rateCard(learning.card, 'Good', start + 10 * 60_000);
  assert.equal(review.card.state, 'Review');
  assert.equal(review.card.due, iso(start + 10 * 60_000 + review.card.scheduled_days * 86_400_000));
  assert.equal(review.card.last_review, iso(start + 10 * 60_000));

  const relearning = rateCard(review.card, 1, Date.parse(review.card.due));
  assert.equal(relearning.card.state, 'Relearning');
  assert.equal(relearning.card.lapses, 1);
  assert.equal(relearning.log.state, 'Review');
});

test('all grades are accepted and retention limits apply to previews and reviews', () => {
  const card = createCard(start);
  for (const grade of [1, 2, 3, 4, 'Again', 'Hard', 'Good', 'Easy']) {
    assert.doesNotThrow(() => rateCard(card, grade, start, MIN_RETENTION));
  }
  assert.doesNotThrow(() => previewRatings(card, start, MAX_RETENTION));
  assert.throws(() => rateCard(card, 3, start, 0.79), RangeError);
  assert.throws(() => previewRatings(card, start, 0.93), RangeError);
  assert.throws(() => rateCard(card, 0, start), RangeError);
});

test('due checks use UTC instants and include the exact due boundary', () => {
  const card = createCard(start);
  card.due = iso(start + 60_000);
  assert.equal(isDue(card, start + 59_999), false);
  assert.equal(isDue(card, start + 60_000), true);
  assert.equal(isDue(card, '2026-01-01T00:01:00+00:00'), true);
  assert.throws(() => isDue(card, 'not a date'), TypeError);
});

test('changing retention affects future previews while existing due times stay intact', () => {
  const first = rateCard(createCard(start), 4, start, 0.8).card;
  const savedDue = first.due;
  const lower = previewRatings(first, Date.parse(savedDue), 0.8).Good;
  const higher = previewRatings(first, Date.parse(savedDue), 0.92).Good;
  assert.equal(first.due, savedDue);
  assert.notEqual(lower.due, higher.due);
});
