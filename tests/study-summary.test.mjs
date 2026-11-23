import assert from 'node:assert/strict';
import test from 'node:test';
import { createSpecIndex } from '../js/engine/spec-index.js';
import { activitySummary, studyRange, topicScores } from '../js/engine/study-summary.js';

test('retakes, saved work and late marks use the same question identities and latest-mark rules as the Data Hub', () => {
  const timestamp = '2026-04-13T18:00:00Z';
  const rows = [
    { question_id: '1a', timestamp, in_activity_period: true, in_mark_period: true, marks_awarded: 1, max_marks: 4 },
    { question_id: '1a', timestamp, in_activity_period: true, in_mark_period: true, marks_awarded: 3, max_marks: 4 },
    { question_id: '1b', timestamp, in_activity_period: true, in_mark_period: false, waiting: true },
    { question_id: '2', timestamp, in_activity_period: false, in_mark_period: true, marks_awarded: 0, max_marks: 2 },
  ];
  const activity = activitySummary(rows);
  assert.equal(activity.distinct, 2);
  assert.equal(activity.answered.length, 3);
  assert.equal(activity.marked, 2);
  assert.equal(activity.waiting, 1);
  assert.deepEqual(activity.latestScore, { count: 2, awarded: 3, max: 6, percentage: 50 });
  assert.deepEqual(activity.allScore, { count: 3, awarded: 4, max: 10, percentage: 40 });
});

test('cross-topic marks give each primary topic one contribution per question', () => {
  const index = createSpecIndex();
  index.add({ subject_id: 'example', sections: [{ id: 's', topics: [
    { id: 'a', points: [{ id: 'p1' }, { id: 'p2' }] },
    { id: 'b', points: [{ id: 'p3' }] },
    { id: 'c', points: [{ id: 'p4' }] },
  ] }] });
  const latest = activitySummary([{
    question_id: 'q', timestamp: '2026-04-13T18:00:00Z', in_mark_period: true, marks_awarded: 1, max_marks: 4,
  }]).latest;
  const scores = topicScores([{
    subject: { subject_id: 'example' },
    questionsById: new Map([['q', { primary_spec_points: ['p1', 'p2', 'p3'], crossover_spec_points: ['p4'] }]]),
  }], latest, index);
  assert.deepEqual(scores.map(score => [score.topic.id, score.count, score.dropped]), [['a', 1, 3], ['b', 1, 3]]);
});

test('date shortcuts use London calendar days across daylight saving', () => {
  const midnightInLondon = new Date('2026-06-30T23:00:00Z');
  assert.deepEqual(studyRange(7, midnightInLondon), { from: '2026-06-25', to: '2026-07-01' });
  assert.deepEqual(studyRange('month', midnightInLondon), { from: '2026-07-01', to: '2026-07-01' });
});
