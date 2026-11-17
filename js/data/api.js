// The single doorway between the UI and stored user data (PRD 8.1).
// Views call these functions and never touch localStorage or a database directly, so the
// backend can change by swapping the adapter below without rewriting any UI.

import { APP, LIMITS } from '../config/app.config.js';
import { createBus } from '../core/bus.js';
import { latestByQuestion } from '../engine/analytics.js';
import { localAdapter } from './adapters/local-adapter.js';
import { supabaseAdapter } from './adapters/supabase-adapter.js';
import { SUPABASE_CONFIGURED } from '../config/supabase.config.js';
import { LEGACY_SPEC_IDS } from '../config/spec-id-migrations.js';

/** The cloud adapter is the default when configured; browser-only accounts use an explicit legacy login. */
const backendAdapter = SUPABASE_CONFIGURED ? supabaseAdapter : localAdapter;
const legacyModeKey = `${APP.storageNamespace}:legacy-mode`;
let activeAdapter = backendAdapter;

function setLegacyMode(enabled) {
  try {
    if (enabled) localStorage.setItem(legacyModeKey, '1');
    else localStorage.removeItem(legacyModeKey);
  } catch {}
}

function isLegacyMode() {
  try { return localStorage.getItem(legacyModeKey) === '1'; } catch { return false; }
}

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
  learned_textbook_sections: [],
  question_attempts: [],
  paper_attempts: [],
  custom_tests: [],
  sessions: [],
  preferences: {},
});

function normalise(document, userId) {
  const base = emptyProgress(userId);
  const merged = { ...base, ...(document || {}), user_id: userId };
  for (const key of ['enrolled_subjects', 'learned_spec_points', 'learned_textbook_sections', 'question_attempts', 'paper_attempts', 'custom_tests', 'sessions']) {
    if (!Array.isArray(merged[key])) merged[key] = [];
  }
  if (!merged.preferences || typeof merged.preferences !== 'object') merged.preferences = {};
  merged.learned_spec_points = migrateLearnedIds(merged.learned_spec_points);
  return merged;
}

/** Expand retired runtime skill ids into the official statements that replaced them. */
export function migrateLearnedIds(ids) {
  return [...new Set(ids.flatMap((id) => LEGACY_SPEC_IDS[id] || [id]))];
}

function requireProgress() {
  if (!progress) throw new Error('You need to be logged in to do that.');
  return progress;
}

async function persist({ silent = false } = {}) {
  // Guest selections and attempts live only in memory until an account is created.
  if (user) await activeAdapter.saveProgress(user.user_id, progress);
  if (!silent) events.emit('progress', progress);
}

// ───────────────────────────────── accounts ─────────────────────────────────

/** Restores the logged-in user (if any). Call once at start-up. */
export async function init() {
  activeAdapter = backendAdapter;
  try {
    user = await activeAdapter.currentUser();
  } catch (error) {
    // Keep public browsing available if Auth or the network is temporarily unavailable.
    console.warn('Supabase session could not be restored:', error);
    user = null;
  }
  if (!user && SUPABASE_CONFIGURED && isLegacyMode()) {
    try {
      user = await localAdapter.currentUser();
      if (user) activeAdapter = localAdapter;
      else setLegacyMode(false);
    } catch (error) {
      console.warn('Legacy browser account could not be restored:', error);
      user = null;
      setLegacyMode(false);
    }
  }
  if (user) {
    try {
      let saved = await activeAdapter.loadProgress(user.user_id);
      if (!saved && activeAdapter === supabaseAdapter) {
        await supabaseAdapter.restorePendingSignup(user.email, user.user_id);
        saved = await activeAdapter.loadProgress(user.user_id);
      }
      progress = normalise(saved, user.user_id);
    } catch (error) {
      // Never replace a cloud snapshot with an empty guest document after a read failure.
      console.warn('Saved progress could not be restored; continuing with public browsing:', error);
      user = null;
      activeAdapter = backendAdapter;
      progress = emptyProgress('guest');
    }
  } else {
    progress = emptyProgress('guest');
  }
  learnedCache = null;
  return user;
}

export const currentUser = () => user;
export const isSignedIn = () => Boolean(user);
export const backendInfo = () => ({ id: activeAdapter.id, label: activeAdapter.label, syncsAcrossDevices: activeAdapter.syncsAcrossDevices, cloudConfigured: SUPABASE_CONFIGURED });

/** `initialProgress` (optional) pre-fills the new account — used by the demo account. */
export async function signUp({ initialProgress = null, redirectTo = null, ...details }) {
  const chosenAdapter = details.isDemo ? localAdapter : backendAdapter;
  const guestProgress = !user ? progress : null;
  activeAdapter = chosenAdapter;
  if (chosenAdapter === supabaseAdapter) setLegacyMode(false);
  else if (SUPABASE_CONFIGURED && details.isDemo) setLegacyMode(true);
  if (chosenAdapter === supabaseAdapter && guestProgress) {
    await supabaseAdapter.stagePendingSignup(details.email, guestProgress, redirectTo);
  }
  let created;
  try {
    created = await chosenAdapter.signUp({ ...details, redirectTo });
  } catch (error) {
    activeAdapter = backendAdapter;
    throw error;
  }
  if (created?.pendingConfirmation) {
    user = null;
    progress = guestProgress || emptyProgress('guest');
    learnedCache = null;
    return null;
  }
  user = created;
  // Carry a guest's browser search and unsaved question draft into the new account.
  if (guestProgress && typeof sessionStorage !== 'undefined') {
    const prefix = `${APP.storageNamespace}:practice:guest:`;
    try {
      const drafts = [];
      for (let i = 0; i < sessionStorage.length; i++) {
        const key = sessionStorage.key(i);
        if (key?.startsWith(prefix)) drafts.push([key, sessionStorage.getItem(key)]);
      }
      for (const [key, value] of drafts) {
        const accountKey = `${APP.storageNamespace}:practice:${user.user_id}:${key.slice(prefix.length)}`;
        localStorage.setItem(accountKey, value);
        sessionStorage.removeItem(key);
      }
    } catch { /* storage may be unavailable; progress remains intact */ }
  }
  progress = normalise(initialProgress || guestProgress, user.user_id);
  learnedCache = null;
  try {
    await activeAdapter.saveProgress(user.user_id, progress);
    if (chosenAdapter === supabaseAdapter) await supabaseAdapter.clearPendingSignup(details.email);
  } catch (error) {
    user = null;
    activeAdapter = backendAdapter;
    throw error;
  }
  events.emit('auth', user);
  return user;
}

/** Deletes a leftover demo profile (for example from a tab closed without leaving the demo). */
export async function discardDemo(details) {
  try {
    const leftover = await localAdapter.signIn(details);
    if (leftover.is_demo) await localAdapter.deleteUser(leftover.user_id);
    else await localAdapter.signOut();
  } catch {
    // no demo profile in this browser yet
  }
}

export async function signIn(details) {
  activeAdapter = backendAdapter;
  try {
    user = await activeAdapter.signIn(details);
    setLegacyMode(false);
    let saved = await activeAdapter.loadProgress(user.user_id);
    if (!saved && activeAdapter === supabaseAdapter) {
      await supabaseAdapter.restorePendingSignup(user.email, user.user_id);
      saved = await activeAdapter.loadProgress(user.user_id);
    }
    progress = normalise(saved, user.user_id);
    learnedCache = null;
    events.emit('auth', user);
    return user;
  } catch (error) {
    // Do not expose a partially restored account or allow writes from an empty snapshot.
    user = null;
    activeAdapter = backendAdapter;
    progress = emptyProgress('guest');
    learnedCache = null;
    throw error;
  }
}

export async function signInLegacy(details) {
  activeAdapter = localAdapter;
  user = await localAdapter.signIn(details);
  setLegacyMode(SUPABASE_CONFIGURED);
  progress = normalise(await localAdapter.loadProgress(user.user_id), user.user_id);
  learnedCache = null;
  events.emit('auth', user);
  return user;
}

export const requestPasswordReset = (email) => backendAdapter.requestPasswordReset(email);
export const setNewPassword = (password) => backendAdapter.setNewPassword(password);
export const isPasswordRecoverySession = () => activeAdapter === supabaseAdapter && supabaseAdapter.hasPasswordRecoverySession(user?.user_id);

export async function signOut() {
  // The demo account is thrown away when you leave it, so the next visitor gets it back
  // exactly as it was built (owner request, 2026-11-13). enterDemoAccount() rebuilds it.
  if (user?.is_demo) await activeAdapter.deleteUser(user.user_id);
  else await activeAdapter.signOut();
  user = null;
  setLegacyMode(false);
  activeAdapter = backendAdapter;
  progress = emptyProgress('guest');
  learnedCache = null;
  events.emit('auth', null);
}

export async function updateProfile(patch) {
  user = await activeAdapter.updateUser(user.user_id, patch);
  events.emit('auth', user);
  return user;
}

export const changePassword = (currentPassword, newPassword) => activeAdapter.changePassword(user.user_id, currentPassword, newPassword);

export async function deleteAccount() {
  await activeAdapter.deleteUser(user.user_id, user.email);
  user = null;
  setLegacyMode(false);
  activeAdapter = backendAdapter;
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
  learnedCache ??= new Set([...requireProgress().learned_spec_points, ...requireProgress().learned_textbook_sections]);
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
  learnedCache = new Set([...set, ...doc.learned_textbook_sections]);
  await persist();
}

/** Book subsections never imply that an entire broad official skill is learned. */
export async function setTextbookLearned(sectionIds, learned) {
  const doc = requireProgress();
  const selected = new Set(doc.learned_textbook_sections);
  for (const id of sectionIds) {
    if (typeof id !== 'string' || !/^TB_[A-Z0-9_]+_\d+\.\d+$/.test(id)) throw new TypeError('Invalid textbook subsection.');
    if (learned) selected.add(id); else selected.delete(id);
  }
  doc.learned_textbook_sections = [...selected];
  learnedCache = new Set([...doc.learned_spec_points, ...selected]);
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

/** Save an intentional inline mark. Editing preserves the attempt's original date and count. */
export async function saveQuestionMark(question, marks, { reattempt = false } = {}) {
  if (!Number.isInteger(marks) || marks < 0 || marks > question.marks) throw new Error('Enter a whole number within the available marks.');
  const doc = requireProgress();
  const previous = latestByQuestion(doc.question_attempts).get(question.question_id);
  if (previous && !reattempt) {
    if (previous.marks_awarded === marks) return previous;
    previous.mark_edits = [...(previous.mark_edits || []), { marks_awarded: previous.marks_awarded, max_marks: previous.max_marks }];
    previous.marks_awarded = marks;
    previous.max_marks = question.marks;
    await persist();
    return previous;
  }
  const attempt = { question_id: question.question_id, subject_id: question.subject_id, source_type: question.source_type,
    difficulty: question.difficulty, marks_awarded: marks, max_marks: question.marks, timestamp: new Date().toISOString(), marked_by: 'self', inline: true };
  doc.question_attempts.push(attempt);
  await persist();
  return attempt;
}

/** Undo the most recent score edit, or remove a newly saved inline attempt. */
export async function undoQuestionMark(questionId) {
  const doc = requireProgress();
  const index = doc.question_attempts.indexOf(latestByQuestion(doc.question_attempts).get(questionId));
  if (index < 0) return;
  const attempt = doc.question_attempts[index];
  const previous = attempt.mark_edits?.pop();
  if (previous) Object.assign(attempt, previous);
  else if (attempt.inline) doc.question_attempts.splice(index, 1);
  else return;
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
