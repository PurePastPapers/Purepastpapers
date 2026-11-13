// The demo account: a pre-filled local profile so the Data Hub, topic mastery and
// filtering can be seen working straight away. Its activity is generated here from the
// shipped question bank (deterministically), and it is labelled "Demo account" in the UI.

import { clamp, mulberry32, round1 } from '../core/utils.js';
import { gradeFor } from '../engine/analytics.js';
import { filterQuestions } from '../engine/filter-engine.js';
import * as api from './api.js';
import { getBundles, specIndex } from './content-repository.js';

/** Local-only credentials for the demo profile (not a real account anywhere). */
const DEMO_LOGIN = { email: 'demo@onspec.local', password: 'onspec-demo-profile', displayName: 'Demo student' };

/** What the demo student studies, has covered so far, and finds easy or hard. */
const PLAN = {
  EDX_ALEVEL_MATH_9MA0: {
    learned: ['PURE_PROOF', 'PURE_ALG', 'PURE_COORD', 'PURE_SEQ', 'PURE_TRIG', 'PURE_EXP', 'PURE_DIFF', 'PURE_INT', 'STATS_SAMP', 'STATS_DATA', 'STATS_PROB', 'STATS_DIST', 'MECH_UNITS', 'MECH_KIN', 'MECH_FORCES'],
    weak: ['PURE_TRIG', 'STATS_DIST'],
    strong: ['PURE_DIFF', 'PURE_ALG'],
  },
  EDX_ALEVEL_FMATH_9FM0: { learned: ['CP_PROOF', 'CP_COMPLEX', 'CP_MATRICES', 'CP_ALG'], weak: ['CP_COMPLEX'], strong: ['CP_MATRICES'] },
  EDX_ALEVEL_PHYS_9PH0: { learned: ['M1', 'M2', 'M3', 'M4', 'M5', 'M9'], weak: ['M3'], strong: ['M2'] },
  AQA_ALEVEL_GEOG_7037: { learned: ['WC', 'COAST', 'HAZ', 'GS', 'CP', 'SK'], weak: ['HAZ'], strong: ['WC'] },
};

/** [subject, paper, percentage, days ago] — scores logged against real catalogue papers. */
const PAPERS_SAT = [
  ['EDX_ALEVEL_MATH_9MA0', 'EDX_9MA0_2019_JUNE_P1', 54, 39],
  ['EDX_ALEVEL_MATH_9MA0', 'EDX_9MA0_2022_JUNE_P1', 61, 28],
  ['EDX_ALEVEL_MATH_9MA0', 'EDX_9MA0_2022_JUNE_P2', 58, 22],
  ['EDX_ALEVEL_MATH_9MA0', 'EDX_9MA0_2023_JUNE_P1', 69, 12],
  ['EDX_ALEVEL_MATH_9MA0', 'EDX_9MA0_2023_JUNE_P3', 73, 4],
  ['EDX_ALEVEL_PHYS_9PH0', 'EDX_9PH0_2022_JUNE_P1', 52, 31],
  ['EDX_ALEVEL_PHYS_9PH0', 'EDX_9PH0_2023_JUNE_P1', 64, 9],
  ['AQA_ALEVEL_GEOG_7037', 'AQA_7037_2023_JUNE_P1', 58, 16],
];

const DAY = 86_400_000;
const DIFFICULTY_EFFECT = { easy: 0.12, medium: 0, hard: -0.14, extra_hard: -0.3 };

async function buildDemoProgress() {
  const subjectIds = Object.keys(PLAN);
  const bundles = await getBundles(subjectIds);
  const random = mulberry32(20261110);
  const now = Date.now();

  const learned = new Set();
  for (const [subjectId, plan] of Object.entries(PLAN)) {
    const prefix = bundles.get(subjectId)?.subject.sp_prefix;
    if (!prefix) continue;
    for (const key of plan.learned) for (const id of specIndex.leavesOf(`${prefix}_${key}`)) learned.add(id);
  }

  const questionAttempts = [];
  for (const [subjectId, plan] of Object.entries(PLAN)) {
    const bundle = bundles.get(subjectId);
    if (!bundle) continue;
    const { matches } = filterQuestions(bundle.questions, {}, { specIndex, learned, latestAttempts: new Map() });
    for (const question of matches) {
      if (random() < 0.22) continue; // leave some questions untouched
      const topicKey = (specIndex.topicOf(question.primary_spec_points[0])?.id || '').slice(bundle.subject.sp_prefix.length + 1);
      const skill = (plan.weak.includes(topicKey) ? 0.36 : plan.strong.includes(topicKey) ? 0.9 : 0.68) + DIFFICULTY_EFFECT[question.difficulty];
      const tries = random() < 0.25 ? 2 : 1;
      const base = Math.floor(random() * 36);
      for (let attempt = 0; attempt < tries; attempt++) {
        const daysAgo = base + (tries - 1 - attempt) * 4; // the first try is older and usually weaker
        const share = clamp(skill + (random() - 0.5) * 0.4 + attempt * 0.14, 0, 1);
        questionAttempts.push({
          question_id: question.question_id,
          source_type: question.source_type,
          difficulty: question.difficulty,
          marks_awarded: Math.round(question.marks * share),
          max_marks: question.marks,
          timestamp: new Date(now - daysAgo * DAY - Math.floor(random() * 5 * 3_600_000)).toISOString(),
          subject_id: subjectId,
          marked_by: 'self',
        });
      }
    }
  }
  questionAttempts.sort((a, b) => (a.timestamp < b.timestamp ? -1 : 1));

  const paperAttempts = [];
  for (const [subjectId, paperId, percentage, daysAgo] of PAPERS_SAT) {
    const bundle = bundles.get(subjectId);
    const paper = bundle?.papersById.get(paperId);
    if (!paper) continue;
    const awarded = Math.round((paper.total_marks * percentage) / 100);
    const actual = round1((awarded / paper.total_marks) * 100);
    paperAttempts.push({
      paper_id: paperId,
      paper_type: paper.paper_type,
      marks_awarded: awarded,
      max_marks: paper.total_marks,
      percentage: actual,
      timestamp: new Date(now - daysAgo * DAY).toISOString(),
      subject_id: subjectId,
      title: paper.title,
      session_kind: 'logged',
      grade: gradeFor(actual, bundle.subject.grade_scheme),
    });
  }
  for (const [subjectId, title, awarded, max, daysAgo] of [
    ['EDX_ALEVEL_MATH_9MA0', 'Custom 50-minute test', 31, 46, 7],
    ['EDX_ALEVEL_PHYS_9PH0', 'Custom 30-minute test', 18, 27, 2],
  ]) {
    const bundle = bundles.get(subjectId);
    if (!bundle) continue;
    const percentage = round1((awarded / max) * 100);
    paperAttempts.push({
      paper_id: `DEMO_CUSTOM_${daysAgo}`,
      paper_type: 'user_custom_test',
      marks_awarded: awarded,
      max_marks: max,
      percentage,
      timestamp: new Date(now - daysAgo * DAY).toISOString(),
      subject_id: subjectId,
      title,
      session_kind: 'custom_test',
      grade: gradeFor(percentage, bundle.subject.grade_scheme),
    });
  }
  paperAttempts.sort((a, b) => (a.timestamp < b.timestamp ? -1 : 1));

  return {
    enrolled_subjects: subjectIds.filter((id) => bundles.has(id)),
    learned_spec_points: [...learned],
    question_attempts: questionAttempts,
    paper_attempts: paperAttempts,
    // Sample target grades so the My subjects page shows how papers are judged against them.
    preferences: { targetGrades: { EDX_ALEVEL_MATH_9MA0: 'A', EDX_ALEVEL_FMATH_9FM0: 'B', EDX_ALEVEL_PHYS_9PH0: 'A*', AQA_ALEVEL_GEOG_7037: 'B' } },
  };
}

/** Logs in to the demo profile, creating and filling it the first time. */
export async function enterDemoAccount() {
  try {
    await api.signIn(DEMO_LOGIN);
  } catch {
    const initialProgress = await buildDemoProgress();
    await api.signUp({ ...DEMO_LOGIN, isDemo: true, initialProgress });
  }
}
