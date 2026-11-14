// The single doorway between the UI and stored user data (PRD 8.1).
// Views call these functions and never touch localStorage or a database directly, so the
// backend can change by swapping the adapter below without rewriting any UI.

import { LIMITS } from '../config/app.config.js';
import { createBus } from '../core/bus.js';
import { localAdapter } from './adapters/local-adapter.js';

/** ← The one line that chooses the backend. Any object with the same methods will work. */
const adapter = localAdapter;

/** Emits 'auth' (user | null) and 'progress' (the progress document). */
export const events = createBus();

let user = null;
let progress = null;
let learnedCache = null;

/** PRD 8.4 user_progress document, plus sessions, custom tests and preferences. */
const emptyProgress = (userId) => ({
  user_id: userId,
  schema_version: 1,
  enrolled_subjects: [],
  learned_spec_points: [],
  question_attempts: [],
  paper_attempts: [],
  custom_tests: [],
  sessions: [],
  preferences: {},
});

function normalise(document, userId) {
  const base = emptyProgress(userId);
  const merged = { ...base, ...(document || {}), user_id: userId };
  for (const key of ['enrolled_subjects', 'learned_spec_points', 'question_attempts', 'paper_attempts', 'custom_tests', 'sessions']) {
    if (!Array.isArray(merged[key])) merged[key] = [];
  }
  if (!merged.preferences || typeof merged.preferences !== 'object') merged.preferences = {};
  return merged;
}

function requireProgress() {
  if (!progress) throw new Error('You need to be logged in to do that.');
  return progress;
}

async function persist({ silent = false } = {}) {
  // Guest selections and attempts live only in memory until an account is created.
  if (user) await adapter.saveProgress(user.user_id, progress);
  if (!silent) events.emit('progress', progress);
}

// ───────────────────────────────── accounts ─────────────────────────────────

/** Restores the logged-in user (if any). Call once at start-up. */
export async function init() {
  user = await adapter.currentUser();
  progress = user ? normalise(await adapter.loadProgress(user.user_id), user.user_id) : emptyProgress('guest');
  learnedCache = null;
  return user;
}

export const currentUser = () => user;
export const isSignedIn = () => Boolean(user);
export const backendInfo = () => ({ id: adapter.id, label: adapter.label, syncsAcrossDevices: adapter.syncsAcrossDevices });

/** `initialProgress` (optional) pre-fills the new account — used by the demo account. */
export async function signUp({ initialProgress = null, ...details }) {
  const guestProgress = !user ? progress : null;
  user = await adapter.signUp(details);
  progress = normalise(initialProgress || guestProgress, user.user_id);
  learnedCache = null;
  await adapter.saveProgress(user.user_id, progress);
  events.emit('auth', user);
  return user;
}

/** Deletes a leftover demo profile (for example from a tab closed without leaving the demo). */
export async function discardDemo(details) {
  try {
    const leftover = await adapter.signIn(details);
    if (leftover.is_demo) await adapter.deleteUser(leftover.user_id);
    else await adapter.signOut();
  } catch {
    // no demo profile in this browser yet
  }
}

export async function signIn(details) {
  user = await adapter.signIn(details);
  progress = normalise(await adapter.loadProgress(user.user_id), user.user_id);
  learnedCache = null;
  events.emit('auth', user);
  return user;
}

export async function signOut() {
  // The demo account is thrown away when you leave it, so the next visitor gets it back
  // exactly as it was built (owner request, 2026-11-13). enterDemoAccount() rebuilds it.
  if (user?.is_demo) await adapter.deleteUser(user.user_id);
  else await adapter.signOut();
  user = null;
  progress = emptyProgress('guest');
  learnedCache = null;
  events.emit('auth', null);
}

export async function updateProfile(patch) {
  user = await adapter.updateUser(user.user_id, patch);
  events.emit('auth', user);
  return user;
}

export const changePassword = (currentPassword, newPassword) => adapter.changePassword(user.user_id, currentPassword, newPassword);

export async function deleteAccount() {
  await adapter.deleteUser(user.user_id);
  user = null;
  progress = emptyProgress('guest');
  learnedCache = null;
  events.emit('auth', null);
}

// ───────────────────────────────── progress ─────────────────────────────────

/** The live user_progress document. Treat it as read-only; change it through the functions below. */
export const getProgress = () => requireProgress();

export async function setEnrolled(subjectId, enrolled) {
  const doc = requireProgress();
  const set = new Set(doc.enrolled_subjects);
  if (enrolled) set.add(subjectId);
  else set.delete(subjectId);
  doc.enrolled_subjects = [...set];
  await persist();
}

/** The student's learned spec points as a Set (the input to the filtering engine). */
export function learnedSet() {
  learnedCache ??= new Set(requireProgress().learned_spec_points);
  return learnedCache;
}

export async function setLearned(specPointIds, learned) {
  const doc = requireProgress();
  const set = new Set(doc.learned_spec_points);
  for (const id of specPointIds) {
    if (learned) set.add(id);
    else set.delete(id);
  }
  doc.learned_spec_points = [...set];
  learnedCache = set;
  await persist();
}

export async function setPreference(key, value) {
  requireProgress().preferences[key] = value;
  await persist({ silent: true });
}

// ───────────────────────────────── sessions ─────────────────────────────────

export const getSession = (sessionId) => requireProgress().sessions.find((session) => session.session_id === sessionId) || null;

/** Unfinished sessions worth resuming (single-question sessions only once something was entered). */
export function resumableSessions() {
  return requireProgress()
    .sessions.filter((session) => session.status !== 'completed')
    .filter((session) => session.kind !== 'single' || Object.keys(session.marks || {}).length > 0)
    .sort((a, b) => (a.started_at < b.started_at ? 1 : -1));
}

function upsertSession(session) {
  const doc = requireProgress();
  const index = doc.sessions.findIndex((candidate) => candidate.session_id === session.session_id);
  if (index >= 0) doc.sessions[index] = session;
  else doc.sessions.push(session);
  // Keep storage bounded: old completed sessions go, their attempts stay in the history.
  const completed = doc.sessions.filter((candidate) => candidate.status === 'completed');
  if (completed.length > LIMITS.keptCompletedSessions) {
    const drop = new Set(
      completed
        .sort((a, b) => (a.completed_at < b.completed_at ? -1 : 1))
        .slice(0, completed.length - LIMITS.keptCompletedSessions)
        .map((candidate) => candidate.session_id),
    );
    doc.sessions = doc.sessions.filter((candidate) => !drop.has(candidate.session_id));
  }
}

/** `silent` skips the change event — used for frequent saves such as typing or timer ticks. */
export async function saveSession(session, { silent = false } = {}) {
  upsertSession(session);
  await persist({ silent });
}

export async function deleteSession(sessionId) {
  const doc = requireProgress();
  doc.sessions = doc.sessions.filter((session) => session.session_id !== sessionId);
  await persist();
}

/** Stores a finished session and logs its results in one write (PRD 4.4). */
export async function commitSessionResult(session, questionAttempts = [], paperAttempt = null) {
  const doc = requireProgress();
  doc.question_attempts.push(...questionAttempts);
  if (paperAttempt) doc.paper_attempts.push(paperAttempt);
  upsertSession(session);
  await persist();
}

/** Logs a paper score entered by hand (a paper sat on paper). */
export async function addPaperAttempt(paperAttempt) {
  requireProgress().paper_attempts.push(paperAttempt);
  await persist();
}

export async function deletePaperAttempt(paperAttempt) {
  const doc = requireProgress();
  doc.paper_attempts = doc.paper_attempts.filter((candidate) => candidate !== paperAttempt);
  await persist();
}

// ───────────────────────────── custom tests (PRD 8.3: user_custom_test) ─────────────────────────────

export const getCustomTest = (paperId) => requireProgress().custom_tests.find((paper) => paper.paper_id === paperId) || null;

export async function saveCustomTest(paper) {
  const doc = requireProgress();
  doc.custom_tests = [...doc.custom_tests.filter((candidate) => candidate.paper_id !== paper.paper_id), paper].slice(-60);
  await persist({ silent: true });
}

// ───────────────────────────── bulk writes, export, import, reset ─────────────────────────────

/** Replaces several parts of the progress document at once (used by the demo account seeder). */
export async function mergeProgress(patch) {
  Object.assign(requireProgress(), patch);
  learnedCache = null;
  await persist();
}

export function exportData() {
  return { app: 'onspec', exported_at: new Date().toISOString(), user: { ...user }, progress: structuredClone(requireProgress()) };
}

export async function importData(data) {
  const incoming = data?.progress ?? data;
  if (!incoming || !Array.isArray(incoming.question_attempts) || !Array.isArray(incoming.learned_spec_points)) {
    throw new Error('That file is not a PPP progress export.');
  }
  progress = normalise(incoming, user.user_id);
  learnedCache = null;
  await persist();
}

export async function resetProgress() {
  progress = emptyProgress(user.user_id);
  learnedCache = null;
  await persist();
}
