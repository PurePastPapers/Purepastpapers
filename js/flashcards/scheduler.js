import {
  createEmptyCard,
  FSRSVersion,
  fsrs,
  generatorParameters,
  Rating,
  State,
} from './vendor/ts-fsrs-5.2.3.mjs';

export const SCHEDULER_RELEASE = 'ts-fsrs@5.2.3';
export const FSRS_VERSION = FSRSVersion;
export const SCHEDULER_VERSION = `${SCHEDULER_RELEASE}/${FSRS_VERSION}`;
export const DEFAULT_RETENTION = 0.9;
export const MIN_RETENTION = 0.8;
export const MAX_RETENTION = 0.92;

const grades = new Map([
  [1, Rating.Again],
  [2, Rating.Hard],
  [3, Rating.Good],
  [4, Rating.Easy],
  ['Again', Rating.Again],
  ['Hard', Rating.Hard],
  ['Good', Rating.Good],
  ['Easy', Rating.Easy],
]);

const gradeNames = new Map([
  [Rating.Again, 'Again'],
  [Rating.Hard, 'Hard'],
  [Rating.Good, 'Good'],
  [Rating.Easy, 'Easy'],
]);

function dateFrom(value, label) {
  const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  if (!Number.isFinite(date.getTime())) throw new TypeError(`${label} must be a valid date or UTC timestamp`);
  return date;
}

function validateRetention(value) {
  if (!Number.isFinite(value) || value < MIN_RETENTION || value > MAX_RETENTION) {
    throw new RangeError(`Target retention must be between ${MIN_RETENTION} and ${MAX_RETENTION}`);
  }
}

function serialiseCard(card) {
  return {
    due: dateFrom(card.due, 'Card due').toISOString(),
    stability: card.stability,
    difficulty: card.difficulty,
    elapsed_days: card.elapsed_days ?? 0,
    scheduled_days: card.scheduled_days,
    learning_steps: card.learning_steps,
    reps: card.reps,
    lapses: card.lapses,
    state: State[card.state],
    last_review: card.last_review ? dateFrom(card.last_review, 'Last review').toISOString() : null,
  };
}

function asFsrsCard(card) {
  if (!card || typeof card !== 'object') throw new TypeError('A card scheduling state is required');
  const state = typeof card.state === 'string' ? State[card.state] : card.state;
  if (![State.New, State.Learning, State.Review, State.Relearning].includes(state)) {
    throw new TypeError('Card state must be New, Learning, Review or Relearning');
  }
  const due = dateFrom(card.due, 'Card due');
  const lastReview = card.last_review == null ? undefined : dateFrom(card.last_review, 'Last review');
  return {
    ...createEmptyCard(due),
    ...card,
    due,
    last_review: lastReview,
    state,
  };
}

function scheduler(retention) {
  validateRetention(retention);
  return fsrs(generatorParameters({ request_retention: retention, enable_fuzz: false }));
}

export function createCard(now = Date.now()) {
  return serialiseCard(createEmptyCard(dateFrom(now, 'Current time')));
}

/**
 * Apply one FSRS review. Grades accept the database-friendly numeric values
 * 1–4 or their matching names. The returned objects contain only JSON values.
 */
export function rateCard(card, grade, now = Date.now(), retention = DEFAULT_RETENTION) {
  const rating = grades.get(grade);
  if (rating == null) throw new RangeError('Grade must be Again, Hard, Good or Easy (1–4)');
  const reviewedAt = dateFrom(now, 'Review time');
  const result = scheduler(retention).next(asFsrsCard(card), reviewedAt, rating);
  return {
    card: serialiseCard(result.card),
    log: {
      rating: gradeNames.get(rating),
      rating_value: rating,
      state: State[result.log.state],
      due: dateFrom(result.log.due, 'Previous due').toISOString(),
      stability: result.log.stability,
      difficulty: result.log.difficulty,
      elapsed_days: result.log.elapsed_days,
      last_elapsed_days: result.log.last_elapsed_days,
      scheduled_days: result.log.scheduled_days,
      learning_steps: result.log.learning_steps,
      review: dateFrom(result.log.review, 'Review time').toISOString(),
      scheduler_version: SCHEDULER_VERSION,
      target_retention: retention,
    },
  };
}

/** Preview each grade using the same scheduler configuration as rateCard. */
export function previewRatings(card, now = Date.now(), retention = DEFAULT_RETENTION) {
  const at = dateFrom(now, 'Preview time');
  const preview = scheduler(retention).repeat(asFsrsCard(card), at);
  return Object.fromEntries([...gradeNames].map(([rating, name]) => {
    const result = preview[rating];
    const due = dateFrom(result.card.due, 'Preview due');
    return [name, {
      due: due.toISOString(),
      state: State[result.card.state],
      interval_ms: Math.max(0, due.getTime() - at.getTime()),
    }];
  }));
}

/** True when FSRS says the card is due at the supplied UTC instant. */
export function isDue(card, now = Date.now()) {
  const at = dateFrom(now, 'Current time');
  const due = dateFrom(card?.due, 'Card due');
  return due.getTime() <= at.getTime();
}
