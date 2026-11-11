// Engine tests — run with `npm test` (node --test). These cover the rules the PRD
// treats as non-negotiable: the learned-topics gate, crossover handling, difficulty
// filtering, the timed-test builder and the Data Hub maths.

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

import { sha256, toHex } from '../js/core/sha256.js';
import {
  currentStreak, gradeFor, latestByQuestion, masteryByNode, paperSummaries, ragFor, totals, weeklyActivity,
} from '../js/engine/analytics.js';
import {
  countByNode, filterQuestions, foreignSpecPoints, missingSpecPoints, questionStatus, unlockSuggestions,
} from '../js/engine/filter-engine.js';
import { createSpecIndex } from '../js/engine/spec-index.js';
import { buildTest, minutesOf } from '../js/engine/test-builder.js';
import { toHtml } from '../tools/seed/markup.mjs';

const json = async (path) => JSON.parse(await readFile(new URL(`../data/${path}`, import.meta.url), 'utf8'));

// ── a tiny hand-made world: Physics leans on Maths ──
const maths = {
  subject_id: 'MATHS',
  sections: [{ id: 'M_SEC', title: 'Pure', topics: [
    { id: 'M_TRIG', code: '5', title: 'Trigonometry', points: [
      { id: 'M_TRIG_1', code: '5.1', title: 'Sine rule' },
      { id: 'M_TRIG_2', code: '5.2', title: 'Identities' },
    ] },
    { id: 'M_LOGS', code: '6', title: 'Logs', points: [{ id: 'M_LOGS_1', code: '6.1', title: 'Laws of logs' }] },
  ] }],
};
const physics = {
  subject_id: 'PHYS',
  sections: [{ id: 'P_SEC', title: 'Paper 1', topics: [
    { id: 'P_M2', code: '2', title: 'Mechanics', points: [
      { id: 'P_M2_2.1', code: '2.1', title: 'Equations of motion' },
      { id: 'P_M2_2.2', code: '2.2', title: 'Vectors and projectiles' },
    ] },
    { id: 'P_M3', code: '3', title: 'Circuits', points: [{ id: 'P_M3_3.1', code: '3.1', title: 'Current' }] },
  ] }],
};
const specIndex = createSpecIndex();
specIndex.add(maths);
specIndex.add(physics);

const q = (id, primary, crossover = [], extra = {}) => ({
  question_id: id, source_type: 'real_past_paper', include_in_custom_pool: true, marks: 5, estimated_minutes: 6,
  difficulty: 'medium', primary_spec_points: primary, crossover_spec_points: crossover, content: { question_html: `<p>${id}</p>` }, ...extra,
});
const pool = [
  q('Q1', ['P_M2_2.1'], [], { difficulty: 'easy', marks: 3 }),
  q('Q2', ['P_M2_2.2'], ['P_M2_2.1', 'M_TRIG'], { difficulty: 'hard', marks: 6 }), // the PRD's example shape
  q('Q3', ['P_M3_3.1'], [], { marks: 4 }),
  q('Q4', ['P_M3_3.1'], ['M_LOGS_1'], { difficulty: 'hard', marks: 9 }),
  q('Q5', ['P_M2'], [], { marks: 12 }), // topic-level primary tag
  q('Q6', ['P_M3_3.1'], [], { source_type: 'ai_spec_question' }),
  q('Q7', ['P_M3_3.1'], [], { include_in_custom_pool: false }),
];
const ctx = (learned, latestAttempts = new Map()) => ({ specIndex, learned: new Set(learned), latestAttempts });
const ids = (result) => result.matches.map((question) => question.question_id);

test('spec index expands topic ids to their spec points', () => {
  assert.deepEqual([...specIndex.expand(['M_TRIG'])], ['M_TRIG_1', 'M_TRIG_2']);
  assert.deepEqual([...specIndex.expand(['M_TRIG_1', 'M_TRIG'])], ['M_TRIG_1', 'M_TRIG_2']);
  assert.deepEqual([...specIndex.expand(['UNKNOWN'])], ['UNKNOWN']);
  assert.equal(specIndex.topicOf('P_M2_2.2').id, 'P_M2');
  assert.deepEqual(specIndex.lineage('P_M2_2.2').map((node) => node.id), ['P_M2_2.2', 'P_M2', 'P_SEC']);
  assert.equal(specIndex.subjectOf('M_LOGS_1'), 'MATHS');
});

test('learned gate: every primary AND crossover spec point must be learned', () => {
  // Knows the primary point but not the crossover knowledge → not offered.
  let result = filterQuestions(pool, {}, ctx(['P_M2_2.2']));
  assert.ok(!ids(result).includes('Q2'));
  assert.deepEqual(result.locked.find((entry) => entry.question.question_id === 'Q2').missing.sort(), ['M_TRIG_1', 'M_TRIG_2', 'P_M2_2.1']);

  // A topic-level crossover needs the WHOLE topic.
  result = filterQuestions(pool, {}, ctx(['P_M2_2.2', 'P_M2_2.1', 'M_TRIG_1']));
  assert.ok(!ids(result).includes('Q2'));
  result = filterQuestions(pool, {}, ctx(['P_M2_2.2', 'P_M2_2.1', 'M_TRIG_1', 'M_TRIG_2']));
  assert.ok(ids(result).includes('Q2'));
});

test('learned gate never leaks a question needing an unlearned topic', () => {
  const learned = ['P_M2_2.1', 'P_M3_3.1'];
  const result = filterQuestions(pool, { sourceTypes: ['real_past_paper'] }, ctx(learned));
  assert.deepEqual(ids(result), ['Q1', 'Q3']);
  for (const question of result.matches) assert.deepEqual(missingSpecPoints(question, new Set(learned), specIndex), []);
});

test('learnedOnly: false shows everything in the pool', () => {
  const result = filterQuestions(pool, { learnedOnly: false, sourceTypes: ['real_past_paper'] }, ctx([]));
  assert.deepEqual(ids(result), ['Q1', 'Q2', 'Q3', 'Q4', 'Q5']);
  assert.equal(result.locked.length, 0);
});

test('source, pool, difficulty, marks, focus and status filters', () => {
  const everything = ['P_M2_2.1', 'P_M2_2.2', 'P_M3_3.1', 'M_TRIG_1', 'M_TRIG_2', 'M_LOGS_1'];
  assert.deepEqual(ids(filterQuestions(pool, { sourceTypes: ['ai_spec_question'] }, ctx(everything))), ['Q6']);
  assert.ok(!ids(filterQuestions(pool, {}, ctx(everything))).includes('Q7'));
  assert.ok(ids(filterQuestions(pool, { poolOnly: false }, ctx(everything))).includes('Q7'));
  assert.deepEqual(ids(filterQuestions(pool, { difficulties: ['hard'] }, ctx(everything))), ['Q2', 'Q4']);
  assert.deepEqual(ids(filterQuestions(pool, { markBands: [{ min: 1, max: 3 }, { min: 10, max: Infinity }] }, ctx(everything))), ['Q1', 'Q5']);
  // Focus matches on PRIMARY spec points only; a topic id focuses the whole topic.
  assert.deepEqual(ids(filterQuestions(pool, { focus: ['P_M2'], sourceTypes: ['real_past_paper'] }, ctx(everything))), ['Q1', 'Q2', 'Q5']);
  assert.deepEqual(ids(filterQuestions(pool, { focus: ['M_TRIG'] }, ctx(everything))), []);

  const attempts = new Map([
    ['Q1', { question_id: 'Q1', marks_awarded: 3, max_marks: 3 }],
    ['Q3', { question_id: 'Q3', marks_awarded: 1, max_marks: 4 }],
  ]);
  assert.equal(questionStatus(pool[0], attempts), 'green');
  assert.equal(questionStatus(pool[2], attempts), 'red');
  assert.equal(questionStatus(pool[1], attempts), 'unseen');
  assert.deepEqual(ids(filterQuestions(pool, { statuses: ['red', 'amber'] }, ctx(everything, attempts))), ['Q3']);
  assert.deepEqual(ids(filterQuestions(pool, { statuses: ['unseen'], sourceTypes: ['real_past_paper'] }, ctx(everything, attempts))), ['Q2', 'Q4', 'Q5']);
});

test('unlock suggestions rank the spec points holding back the most questions', () => {
  const { locked } = filterQuestions(pool, { sourceTypes: ['real_past_paper'] }, ctx(['P_M2_2.1', 'P_M3_3.1']));
  const suggestions = unlockSuggestions(locked);
  // P_M2_2.2 alone unlocks Q5 and is also needed by Q2; M_LOGS_1 alone unlocks Q4.
  assert.deepEqual(suggestions[0], { id: 'P_M2_2.2', unlocks: 1, needed_by: 2 });
  assert.deepEqual(suggestions[1], { id: 'M_LOGS_1', unlocks: 1, needed_by: 1 });
  assert.ok(suggestions.every((entry) => !['P_M2_2.1', 'P_M3_3.1'].includes(entry.id)), 'learned points are never suggested');
});

test('countByNode and foreignSpecPoints', () => {
  const counts = countByNode(pool.slice(0, 5), specIndex);
  assert.equal(counts.get('P_M3_3.1'), 2);
  assert.equal(counts.get('P_M2'), 3);
  const foreign = foreignSpecPoints(pool, 'PHYS', specIndex);
  assert.deepEqual([...foreign.keys()].sort(), ['M_LOGS_1', 'M_TRIG_1', 'M_TRIG_2']);
});

test('test builder fills the requested time, stays in the pool and is reproducible', () => {
  const bank = [];
  const levels = ['easy', 'medium', 'hard'];
  for (let i = 0; i < 45; i++) {
    bank.push(q(`B${String(i).padStart(2, '0')}`, [`T${i % 9}`], [], { difficulty: levels[i % 3], marks: 3 + (i % 6), estimated_minutes: 3 + (i % 7) }));
  }
  const test50 = buildTest(bank, { minutes: 50, difficulty: 'mixed', seed: 42 });
  assert.ok(Math.abs(test50.total_minutes - 50) <= 3, `got ${test50.total_minutes} minutes`);
  assert.equal(test50.short, false);
  assert.equal(new Set(test50.question_ids).size, test50.question_ids.length);
  assert.ok(test50.questions.every((question) => bank.includes(question)));
  assert.ok(test50.mix.easy && test50.mix.medium && test50.mix.hard, 'a mixed test contains every level');
  const order = test50.questions.map((question) => levels.indexOf(question.difficulty));
  assert.deepEqual(order, [...order].sort((a, b) => a - b), 'questions ramp from easy to hard');
  assert.deepEqual(buildTest(bank, { minutes: 50, difficulty: 'mixed', seed: 42 }).question_ids, test50.question_ids);
  assert.notDeepEqual(buildTest(bank, { minutes: 50, difficulty: 'mixed', seed: 43 }).question_ids, test50.question_ids);

  const hardOnly = buildTest(bank, { minutes: 30, difficulty: 'hard', seed: 7 });
  assert.ok(hardOnly.questions.every((question) => question.difficulty === 'hard'));
  assert.ok(Math.abs(hardOnly.total_minutes - 30) <= 2);
  assert.equal(buildTest(bank, { minutes: 30, difficulty: 'extra_hard', seed: 7 }).questions.length, 0);
});

test('test builder reports a shortfall and prefers unseen questions', () => {
  const small = [q('S1', ['T1'], [], { estimated_minutes: 8 }), q('S2', ['T2'], [], { estimated_minutes: 7 })];
  const result = buildTest(small, { minutes: 50, difficulty: 'medium', seed: 1 });
  assert.equal(result.total_minutes, 15);
  assert.equal(result.short, true);
  assert.equal(result.available_minutes, 15);

  const bank = Array.from({ length: 20 }, (_, i) => q(`U${i}`, [`T${i}`], [], { estimated_minutes: 5 }));
  const done = new Map(bank.slice(0, 10).map((question) => [question.question_id, { question_id: question.question_id, marks_awarded: 5, max_marks: 5 }]));
  const fresh = buildTest(bank, { minutes: 30, difficulty: 'medium', seed: 3, latestAttempts: done });
  assert.ok(fresh.questions.every((question) => !done.has(question.question_id)), 'mastered questions are left out while unseen ones remain');
  assert.equal(minutesOf({ marks: 10 }), 12);
});

test('analytics: latest attempt, totals, RAG, mastery, grades and streak', () => {
  const attempts = [
    { question_id: 'Q1', difficulty: 'easy', marks_awarded: 1, max_marks: 3, timestamp: '2026-11-01T10:00:00.000Z' },
    { question_id: 'Q1', difficulty: 'easy', marks_awarded: 3, max_marks: 3, timestamp: '2026-11-03T10:00:00.000Z' },
    { question_id: 'Q2', difficulty: 'hard', marks_awarded: 3, max_marks: 6, timestamp: '2026-11-03T11:00:00.000Z' },
    { question_id: 'Q3', difficulty: 'medium', marks_awarded: 1, max_marks: 4, timestamp: '2026-11-04T09:00:00.000Z' },
  ];
  const latest = latestByQuestion(attempts);
  assert.equal(latest.get('Q1').marks_awarded, 3);
  assert.deepEqual(totals([...latest.values()]), { count: 3, awarded: 7, max: 13, percentage: (7 / 13) * 100 });
  assert.equal(ragFor(70), 'green');
  assert.equal(ragFor(69.9), 'amber');
  assert.equal(ragFor(39.9), 'red');
  assert.equal(ragFor(null), 'none');

  const byId = new Map(pool.map((question) => [question.question_id, question]));
  const mastery = masteryByNode(latest, byId, specIndex);
  assert.equal(mastery.get('P_M2_2.1').percentage, 100);
  assert.equal(mastery.get('P_M2').count, 2); // Q1 + Q2 roll up to the topic
  assert.equal(mastery.get('P_M2').awarded, 6);
  assert.equal(mastery.get('P_M3_3.1').rag, 'red');
  assert.equal(mastery.get('P_SEC').count, 3);
  assert.equal(mastery.has('M_TRIG'), false, 'crossover points are not credited with mastery');

  assert.equal(gradeFor(81, 'alevel'), 'A*');
  assert.equal(gradeFor(70, 'alevel'), 'A');
  assert.equal(gradeFor(12, 'alevel'), 'U');
  assert.equal(gradeFor(66, 'gcse'), '7');
  assert.equal(gradeFor(66, 'alevel', [{ grade: 'A', min_percentage: 62 }, { grade: 'B', min_percentage: 50 }]), 'A');

  const now = new Date('2026-11-04T18:00:00');
  assert.equal(currentStreak(attempts.map((a) => ({ ...a, timestamp: a.timestamp.replace('Z', '') })), now), 2);
  const weeks = weeklyActivity(attempts, 4, now);
  assert.equal(weeks.length, 4);
  assert.equal(weeks.reduce((n, week) => n + week.questions, 0), 4);

  const papers = paperSummaries([
    { paper_id: 'P', percentage: 55, timestamp: '2026-10-01T10:00:00.000Z' },
    { paper_id: 'P', percentage: 72, timestamp: '2026-10-20T10:00:00.000Z' },
    { paper_id: 'P', percentage: 64, timestamp: '2026-11-02T10:00:00.000Z' },
  ]);
  assert.equal(papers.get('P').attempts, 3);
  assert.equal(papers.get('P').best.percentage, 72);
  assert.equal(papers.get('P').latest.percentage, 64);
});

test('sha256 fallback matches the platform implementation', () => {
  for (const input of ['', 'abc', 'OnSpec', 'x'.repeat(55), 'x'.repeat(56), 'x'.repeat(200), 'pässwörd ✓']) {
    assert.equal(toHex(sha256(input)), createHash('sha256').update(input).digest('hex'));
  }
});

test('seed markup produces the expected HTML', () => {
  assert.equal(toHtml('x^2 + e^{−x} and H_{2}O'), '<p>x<sup>2</sup> + e<sup>−x</sup> and H<sub>2</sub>O</p>');
  assert.match(toHtml('(a) Find {{dy|dx}}. [3]'), /q-part__label">\(a\).*frac__n">dy<.*q-marks">\(3\)/);
  assert.match(toHtml('Answer is 4 :: M1 A1'), /ms-codes">M1 A1</);
  assert.equal(toHtml('a < b & c'), '<p>a &lt; b &amp; c</p>');
  assert.match(toHtml('| A | B |\n| 1 | 2 |'), /<th>A<\/th>.*<td>2<\/td>/);
  assert.match(toHtml('> line one\n> line two'), /<blockquote>line one<br>line two<\/blockquote>/);
});

test('shipped data: every question is well formed and only references known spec points', async () => {
  const subjects = await json('subjects.json');
  assert.equal(subjects.length, 38);
  const index = createSpecIndex();
  for (const subject of subjects) index.add(await json(`specs/${subject.subject_id}.json`));

  let questionCount = 0;
  const seen = new Set();
  for (const subject of subjects) {
    const papers = await json(`papers/${subject.subject_id}.json`);
    const questions = await json(`questions/${subject.subject_id}.json`);
    const paperIds = new Set(papers.map((paper) => paper.paper_id));
    assert.equal(paperIds.size, papers.length, `${subject.subject_id}: duplicate paper ids`);
    const byId = new Map(questions.map((question) => [question.question_id, question]));
    for (const question of questions) {
      questionCount += 1;
      assert.ok(!seen.has(question.question_id), `duplicate ${question.question_id}`);
      seen.add(question.question_id);
      assert.ok(paperIds.has(question.paper_id), `${question.question_id}: unknown paper`);
      assert.ok(['easy', 'medium', 'hard', 'extra_hard'].includes(question.difficulty));
      assert.ok(question.marks > 0 && question.estimated_minutes > 0);
      assert.ok(question.primary_spec_points.length > 0);
      assert.ok(question.content.question_html && question.content.mark_scheme_html);
      for (const id of [...question.primary_spec_points, ...question.crossover_spec_points]) {
        assert.ok(index.has(id), `${question.question_id}: unknown spec point ${id}`);
      }
      for (const id of question.primary_spec_points) assert.equal(index.subjectOf(id), subject.subject_id, `${question.question_id}: primary point from another subject`);
    }
    for (const paper of papers) {
      for (const id of paper.question_ids) assert.ok(byId.has(id), `${paper.paper_id}: unknown question ${id}`);
      if (paper.question_ids.length) {
        assert.equal(paper.total_marks, paper.question_ids.reduce((n, id) => n + byId.get(id).marks, 0), `${paper.paper_id}: total marks`);
      }
    }
  }
  assert.ok(questionCount >= 200);
});
