import { hasValidMark, latestByQuestion, masteryByNode, totals } from './analytics.js';

const londonDay = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit' });
export const studyDay = (instant) => londonDay.format(new Date(instant));

function shiftDay(day, offset) {
  const instant = new Date(day + 'T00:00:00Z');
  instant.setUTCDate(instant.getUTCDate() + offset);
  return instant.toISOString().slice(0, 10);
}

export function studyRange(days, now = new Date()) {
  const to = studyDay(now);
  return { from: days === 'month' ? to.slice(0, 8) + '01' : shiftDay(to, 1 - days), to };
}

export function activitySummary(rows) {
  const answered = rows.filter(row => row.in_activity_period && (row.waiting || hasValidMark(row)));
  const marks = rows.filter(row => row.in_mark_period && hasValidMark(row))
    .map(row => ({ ...row, timestamp: new Date(row.timestamp).toISOString() }));
  const latest = latestByQuestion(marks);
  const waiting = answered.filter(row => row.waiting).length;
  return {
    answered,
    distinct: new Set(answered.map(row => row.question_id)).size,
    marked: answered.length - waiting,
    waiting,
    latest,
    latestScore: totals(latest.values()),
    allScore: totals(marks),
  };
}

export function topicScores(bundles, latest, specIndex) {
  const topics = [];
  for (const bundle of bundles) {
    const scores = masteryByNode(latest, bundle.questionsById, specIndex);
    for (const topic of specIndex.subjectNodes(bundle.subject.subject_id)) {
      if (topic.type !== 'topic' || !scores.has(topic.id)) continue;
      const score = scores.get(topic.id);
      topics.push({ topic, ...score, dropped: score.max - score.awarded });
    }
  }
  return topics.sort((a, b) => b.dropped - a.dropped || a.percentage - b.percentage);
}
