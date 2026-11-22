// The single doorway between the UI and stored user data (PRD 8.1).
// Views call these functions and never touch localStorage or a database directly, so the
// backend can change by swapping the adapter below without rewriting any UI.

import { APP, LIMITS } from '../config/app.config.js';
import { createBus } from '../core/bus.js';
import { uid } from '../core/utils.js';
import { latestByQuestion } from '../engine/analytics.js';
import { localAdapter } from './adapters/local-adapter.js?v=exported-tests-2';
import { deleteInkConflict, deleteInkResponse, listInkDraftsForPart, loadInkResponses, saveInkResponse, supabaseAdapter } from './adapters/supabase-adapter.js';
import * as ink from './ink.js';
import { SUPABASE_CONFIGURED } from '../config/supabase.config.js';
import { LEGACY_SPEC_IDS } from '../config/spec-id-migrations.js';
import { isExportedTest, isOfflineSession, isStoredTestExport, putExport, putOfflineAttempt, removeTestExport, retainOfflineProgress } from './offline-progress.js';

const guestExportsKey = `${APP.storageNamespace}:guest-pdf-tests`;

function guestProgress() {
  const doc = emptyProgress('guest');
  try {
    const saved = JSON.parse(sessionStorage.getItem(guestExportsKey) || 'null');
    if (saved) Object.assign(doc, saved);
  } catch {}
  return normalise(doc, 'guest');
}

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
  saved_answers: [], // goes saved to mark later: { attempt_id, question_id, subject_id, answer, timestamp, updated_at, session_id?, group_attempt_id? }
  custom_tests: [],
  sessions: [],
  preferences: {},
});

function normalise(document, userId) {
  const base = emptyProgress(userId);
  const merged = { ...base, ...(document || {}), user_id: userId };
  for (const key of ['enrolled_subjects', 'learned_spec_points', 'learned_textbook_sections', 'question_attempts', 'paper_attempts', 'saved_answers', 'custom_tests', 'sessions']) {
    if (!Array.isArray(merged[key])) merged[key] = [];
  }
  if (!merged.preferences || typeof merged.preferences !== 'object') merged.preferences = {};
  // Every go at a question has an id, so any one of them can be changed later.
  // Older records get a stable id from their question and date, so it is the same on every load.
  for (const entry of [...merged.question_attempts, ...merged.saved_answers]) entry.attempt_id ||= `att_${entry.question_id}_${entry.timestamp}`;
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
  // A confirmed session means nothing is waiting any more (for example the email link was
  // opened in another tab), so the sign-up form must not stay paused for this browser.
  if (user) setAwaitingConfirmation(null);
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
      progress = guestProgress();
    }
  } else {
    progress = guestProgress();
  }
  learnedCache = null;
  if (user) syncInk().catch(() => {});
  return user;
}

export const currentUser = () => user;
export const isSignedIn = () => Boolean(user);
const inkOwner = () => user?.user_id || 'guest';
const inkCloud = { deleteInkConflict, deleteInkResponse, loadInkResponses, saveInkResponse };
const inkAdapter = () => user && activeAdapter === supabaseAdapter ? inkCloud : null;
export const inkRepository = () => ink.createInkRepository(inkOwner());
export async function loadInkState(responseId, partId) {
  const owner = inkOwner();
  const adapter = inkAdapter();
  const repository = ink.createInkRepository(owner);
  if (adapter && globalThis.navigator?.onLine !== false) {
    try { return await ink.loadSyncedInk(owner, responseId, partId, adapter); }
    catch { /* local handwriting remains usable offline */ }
  }
  const records = (await repository.listByResponse(responseId)).filter(record => record.partId === partId);
  return { record: records.find(record => !record.conflict) || null, conflicts: records.filter(record => record.conflict) };
}
globalThis.addEventListener?.('online', () => syncInk().catch(() => {}));
export const loadInk = async (responseId, partId) => (await loadInkState(responseId, partId)).record;
export async function listInkForPart(partId) {
  if (!inkAdapter() || globalThis.navigator?.onLine === false) return [];
  return listInkDraftsForPart(inkOwner(), partId);
}
const syncingInk = new Map();
export async function syncInk() {
  const adapter = inkAdapter();
  if (!adapter || !globalThis.indexedDB) return false;
  const owner = inkOwner();
  const done = (syncingInk.get(owner) || Promise.resolve()).catch(() => {}).then(() =>
    inkOwner() === owner ? ink.syncInkOutbox(owner, adapter) : { failed: 0, conflicts: 0 });
  syncingInk.set(owner, done);
  try {
    const { failed, conflicts } = await done;
    if (failed) throw new Error('Some handwriting could not be synced. Try again when you’re online.');
    return inkOwner() === owner && !conflicts;
  } finally {
    if (syncingInk.get(owner) === done) syncingInk.delete(owner);
  }
}

export function resolveInkConflict(responseId, partId, conflict, options) {
  return ink.resolveInkConflict(inkOwner(), responseId, partId, conflict, options, inkAdapter());
}

function guestInkReferences(doc) {
  const refs = new Map();
  for (const attempt of [...doc.question_attempts, ...doc.saved_answers]) {
    if (attempt.has_ink) refs.set(attempt.attempt_id, attempt.question_id);
  }
  try {
    const prefix = `${APP.storageNamespace}:practice:guest:`;
    for (let i = 0; i < sessionStorage.length; i++) {
      const key = sessionStorage.key(i);
      if (!key?.startsWith(prefix)) continue;
      const drafts = JSON.parse(sessionStorage.getItem(key) || '{}').inkAttempts;
      for (const parts of Object.values(drafts || {})) {
        for (const [partId, responseId] of Object.entries(parts)) if (typeof responseId === 'string') refs.set(responseId, partId);
      }
    }
  } catch {}
  return [...refs].slice(0, 1000);
}

async function deleteAttemptInk(attempt) {
  if (!attempt?.has_ink) return;
  const owner = inkOwner();
  const adapter = inkAdapter();
  if (adapter?.deleteInkResponse) await adapter.deleteInkResponse(owner, attempt.attempt_id, attempt.question_id);
  await ink.createInkRepository(owner).remove(attempt.attempt_id, attempt.question_id);
}
export const backendInfo = () => ({ id: activeAdapter.id, label: activeAdapter.label, syncsAcrossDevices: activeAdapter.syncsAcrossDevices, cloudConfigured: SUPABASE_CONFIGURED });

/** `initialProgress` (optional) pre-fills the new account — used by the demo account. */
export async function signUp({ initialProgress = null, redirectTo = null, ...details }) {
  const chosenAdapter = details.isDemo ? localAdapter : backendAdapter;
  const guestProgress = !user ? progress : null;
  const guestInk = guestProgress ? guestInkReferences(guestProgress) : [];
  activeAdapter = chosenAdapter;
  if (chosenAdapter === supabaseAdapter) setLegacyMode(false);
  else if (SUPABASE_CONFIGURED && details.isDemo) setLegacyMode(true);
  if (chosenAdapter === supabaseAdapter && guestProgress) {
    await supabaseAdapter.stagePendingSignup(details.email, guestProgress, redirectTo, guestInk);
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
    await ink.adoptGuestInk(user.user_id, guestInk).catch(() => {});
    if (chosenAdapter === supabaseAdapter) await supabaseAdapter.clearPendingSignup(details.email);
  } catch (error) {
    user = null;
    activeAdapter = backendAdapter;
    throw error;
  }
  events.emit('auth', user);
  return user;
}

/** Sends the sign-up confirmation email again (cloud accounts only). */
export async function resendConfirmation(email) {
  if (!backendAdapter.resendConfirmation) throw new Error('Confirmation emails are not used for this account type.');
  return backendAdapter.resendConfirmation(email);
}

/** Confirms a new cloud account with the code from its confirmation email. */
export async function verifySignupCode(email, code) {
  if (!backendAdapter.verifySignupCode) throw new Error('Confirmation codes are not used for this account type.');
  return backendAdapter.verifySignupCode(email, code);
}

// The email this browser is waiting to see confirmed, so the sign-up form can pause instead of
// sending another email (a new email cancels the code and link in the previous one).
const awaitingKey = `${APP.storageNamespace}:awaiting-confirmation`;
// Codes and links last an hour, so after that the form stops waiting.
const AWAIT_FOR = 60 * 60 * 1000;

/** { email, name, sentAt } while a sign-up confirmation is pending in this browser, else null. */
export function awaitingConfirmation() {
  try {
    const record = JSON.parse(localStorage.getItem(awaitingKey) || 'null');
    if (record?.email && Date.now() - record.sentAt < AWAIT_FOR) return record;
  } catch { /* storage blocked or bad JSON */ }
  return null;
}

export function setAwaitingConfirmation(record) {
  try {
    if (record) localStorage.setItem(awaitingKey, JSON.stringify({ ...record, sentAt: record.sentAt || Date.now() }));
    else localStorage.removeItem(awaitingKey);
  } catch { /* the form still works, it just can't pause after a reload */ }
}

/** Watches for the confirmation link being opened in this browser. Returns a stop function. */
export function watchConfirmation(email, onConfirmed) {
  return backendAdapter.watchConfirmation?.(email, onConfirmed) || (() => {});
}

/** Loads the newly confirmed account and its progress, then tells the app it is signed in. */
export async function finishConfirmedSignup() {
  setAwaitingConfirmation(null);
  await init();
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
  const previousUser = user;
  const previousAdapter = activeAdapter;
  const previousProgress = progress || emptyProgress('guest');
  const previousLearnedCache = learnedCache;
  activeAdapter = backendAdapter;
  try {
    user = await activeAdapter.signIn(details);
    setAwaitingConfirmation(null);
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
    // Restore the prior guest/account state on a failed login or progress read.
    user = previousUser;
    activeAdapter = previousAdapter;
    progress = previousProgress;
    learnedCache = previousLearnedCache;
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

/**
 * Whether the signed-in account may open the Content Studio. Owners are listed in the
 * Supabase table public.site_owners; browser-only and demo accounts are never owners.
 * The answer is cached per account for this visit.
 */
let ownerCheck = null;
export function isSiteOwner() {
  if (!user || user.is_demo || activeAdapter !== supabaseAdapter) return Promise.resolve(false);
  if (ownerCheck?.userId !== user.user_id) {
    const userId = user.user_id;
    const promise = supabaseAdapter.isSiteOwner().catch((error) => {
      console.warn(error);
      if (ownerCheck?.promise === promise) ownerCheck = null; // try again next time
      return false;
    });
    ownerCheck = { userId, promise };
  }
  return ownerCheck.promise;
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
  progress = guestProgress();
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
  const owner = user.user_id;
  await activeAdapter.deleteUser(owner, user.email);
  if (globalThis.indexedDB) await ink.deleteInkOwnerData(owner).catch(() => {});
  user = null;
  setLegacyMode(false);
  activeAdapter = backendAdapter;
  progress = guestProgress();
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
    .sessions.filter((session) => session.status !== 'completed' && !isOfflineSession(session))
    .filter((session) => session.kind !== 'single' || Object.keys(session.marks || {}).length > 0)
    .sort((a, b) => (a.started_at < b.started_at ? 1 : -1));
}

function upsertSession(session) {
  const doc = requireProgress();
  const index = doc.sessions.findIndex((candidate) => candidate.session_id === session.session_id);
  if (index >= 0) doc.sessions[index] = session;
  else doc.sessions.push(session);
  // Keep storage bounded: old completed sessions go, their attempts stay in the history.
  const completed = doc.sessions.filter((candidate) => candidate.status === 'completed' && !isOfflineSession(candidate));
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
export async function commitSessionResult(session, questionAttempts = [], paperAttempt = null, unmarkedAnswers = []) {
  const doc = requireProgress();
  for (const attempt of questionAttempts) {
    attempt.attempt_id ||= `${session.session_id}:${attempt.question_id}`;
    absorbWaiting(doc, attempt);
  }
  for (const attempt of questionAttempts) {
    if (!doc.question_attempts.some(candidate => candidate.attempt_id === attempt.attempt_id)) doc.question_attempts.push(attempt);
  }
  for (const entry of unmarkedAnswers) keepWaiting(doc, {
    ...entry, attempt_id: entry.attempt_id || `${session.session_id}:${entry.question_id}`,
  });
  if (paperAttempt && !doc.paper_attempts.some(candidate => candidate.session_id === session.session_id)) doc.paper_attempts.push(paperAttempt);
  upsertSession(session);
  await persist();
}

// ───────────────────────────── attempts at a question ─────────────────────────────
// Every go at a question is kept, with its answer. A marked go lives in question_attempts;
// a go saved to mark later lives in saved_answers until it is marked, keeping its attempt_id.
// A student can have any number of each, and can change any answer or mark afterwards.

const hasText = (answer) => typeof answer === 'string' && answer.trim() !== '';
const validMark = (marks, max) => Number.isInteger(marks) && marks >= 0 && marks <= max;
const waitingIndex = (doc, attemptId) => (attemptId ? doc.saved_answers.findIndex((entry) => entry.attempt_id === attemptId) : -1);
const markedAttempt = (doc, attemptId) => (attemptId ? doc.question_attempts.find((entry) => entry.attempt_id === attemptId) : null);

/** Adds a go saved to mark later, or updates one when its attempt_id is already waiting. */
function keepWaiting(doc, { attempt_id = null, question_id, subject_id, answer = '', session_id = null, group_attempt_id = null, has_ink = undefined }, now = new Date().toISOString()) {
  const index = waitingIndex(doc, attempt_id);
  if (index >= 0) {
    Object.assign(doc.saved_answers[index], { answer, updated_at: now }, session_id ? { session_id } : {},
      has_ink === undefined ? {} : { has_ink });
    return doc.saved_answers[index];
  }
  const entry = { attempt_id: attempt_id || uid('att'), question_id, subject_id, answer, timestamp: now, updated_at: now };
  if (session_id) entry.session_id = session_id;
  if (group_attempt_id) entry.group_attempt_id = group_attempt_id;
  if (has_ink) entry.has_ink = true;
  doc.saved_answers.push(entry);
  return entry;
}

/** A waiting go that gets its mark leaves the waiting list; its answer and date move onto the attempt. */
function absorbWaiting(doc, attempt) {
  const index = waitingIndex(doc, attempt.attempt_id);
  if (index < 0) return;
  const [entry] = doc.saved_answers.splice(index, 1);
  if (hasText(entry.answer) && !hasText(attempt.answer)) attempt.answer = entry.answer;
  attempt.answered_at = entry.timestamp;
  if (entry.has_ink && attempt.has_ink === undefined) attempt.has_ink = true;
  if (entry.group_attempt_id && !attempt.group_attempt_id) attempt.group_attempt_id = entry.group_attempt_id;
  if (attempt.inline) attempt.saved_answer = entry;
}

/** Every go at a question, newest first: { ...entry, waiting } (waiting = saved, not marked yet). */
export function attemptsFor(questionId) {
  const doc = progress;
  if (!doc) return [];
  const when = (entry) => entry.answered_at || entry.timestamp;
  return [
    ...doc.question_attempts.filter((entry) => entry.question_id === questionId && hasValidMarkLike(entry)).map((entry) => ({ ...entry, waiting: false })),
    ...doc.saved_answers.filter((entry) => entry.question_id === questionId).map((entry) => ({ ...entry, waiting: true })),
  ].sort((a, b) => (when(a) < when(b) ? 1 : -1));
}
const hasValidMarkLike = (entry) => Number.isFinite(entry.marks_awarded) && Number.isFinite(entry.max_marks);

/** question_id → that question's newest go saved to mark later (shown as "Answered, not marked"). */
export function savedAnswers() {
  const map = new Map();
  for (const entry of progress?.saved_answers || []) {
    const current = map.get(entry.question_id);
    if (!current || entry.updated_at >= current.updated_at) map.set(entry.question_id, entry);
  }
  return map;
}

/** The answer text of the newest go at a question (waiting or marked). */
export function answerFor(questionId) {
  return attemptsFor(questionId).find((entry) => hasText(entry.answer))?.answer || '';
}

/**
 * Save an answer without a mark. With an attemptId it changes that go's answer (a marked
 * go keeps its mark); without one it starts a new go that waits to be marked.
 */
export async function saveAnswerUnmarked(question, answer = '', { attemptId = null, groupAttemptId = null, hasInk = undefined } = {}) {
  const doc = requireProgress();
  const text = String(answer || '');
  const marked = markedAttempt(doc, attemptId);
  if (marked) {
    if (marked.question_id !== question.question_id) throw new Error('This answer belongs to another question.');
    marked.answer = text;
    if (hasInk !== undefined) marked.has_ink = hasInk;
    marked.answer_edited_at = new Date().toISOString();
    await persist();
    return { ...marked, waiting: false };
  }
  if (hasInk === false && !hasText(text)) {
    const index = waitingIndex(doc, attemptId);
    if (index >= 0 && doc.saved_answers[index].question_id === question.question_id) {
      doc.saved_answers.splice(index, 1);
      await persist();
    }
    return null;
  }
  const entry = keepWaiting(doc, { attempt_id: attemptId, question_id: question.question_id, subject_id: question.subject_id, answer: text, group_attempt_id: groupAttemptId, has_ink: hasInk });
  await persist();
  return { ...entry, waiting: true };
}

/**
 * Save a mark. attemptId picks the go: a marked one has its mark changed (edits can be undone),
 * a waiting one is marked. With no attemptId, `reattempt` starts a new go; otherwise the latest
 * marked go is changed (kept for older callers).
 */
export async function saveQuestionMark(question, marks, { reattempt = false, answer = null, attemptId = null, groupAttemptId = null, hasInk = undefined } = {}) {
  if (!validMark(marks, question.marks)) throw new Error('Enter a whole number within the available marks.');
  const doc = requireProgress();
  const target = markedAttempt(doc, attemptId) || (!attemptId && !reattempt ? latestByQuestion(doc.question_attempts).get(question.question_id) : null);
  if (target) {
    if (target.question_id !== question.question_id) throw new Error('This answer belongs to another question.');
    if (hasInk !== undefined) target.has_ink = hasInk;
    if (hasText(answer)) target.answer = answer;
    if (target.marks_awarded !== marks) {
      target.mark_edits = [...(target.mark_edits || []), { marks_awarded: target.marks_awarded, max_marks: target.max_marks }];
      target.marks_awarded = marks;
      target.max_marks = question.marks;
      target.edited_at = new Date().toISOString();
    }
    await persist();
    return target;
  }
  const attempt = { attempt_id: attemptId || uid('att'), question_id: question.question_id, subject_id: question.subject_id, source_type: question.source_type,
    difficulty: question.difficulty, marks_awarded: marks, max_marks: question.marks, timestamp: new Date().toISOString(), marked_by: 'self', inline: true };
  if (hasText(answer)) attempt.answer = answer;
  if (groupAttemptId) attempt.group_attempt_id = groupAttemptId;
  if (hasInk !== undefined) attempt.has_ink = hasInk;
  absorbWaiting(doc, attempt);
  doc.question_attempts.push(attempt);
  await persist();
  return attempt;
}

/** Change the mark on any marked go (by attempt_id), or on the latest go at a question. */
export async function changeQuestionMark(attemptOrQuestionId, marks) {
  const doc = requireProgress();
  const attempt = markedAttempt(doc, attemptOrQuestionId) || latestByQuestion(doc.question_attempts).get(attemptOrQuestionId);
  if (!attempt) throw new Error('There is no mark to change yet.');
  if (attempt.session_id?.startsWith('paper_')) throw new Error('Change these marks from the exported test review.');
  if (!validMark(marks, attempt.max_marks)) throw new Error('Enter a whole number within the available marks.');
  if (attempt.marks_awarded === marks) return attempt;
  attempt.mark_edits = [...(attempt.mark_edits || []), { marks_awarded: attempt.marks_awarded, max_marks: attempt.max_marks }];
  attempt.marks_awarded = marks;
  attempt.edited_at = new Date().toISOString();
  await persist();
  return attempt;
}

/** Undo the most recent mark change on a go (by attempt_id, else the latest go at the question). */
export async function undoQuestionMark(questionId, { attemptId = null } = {}) {
  const doc = requireProgress();
  const attempt = markedAttempt(doc, attemptId) || latestByQuestion(doc.question_attempts).get(questionId);
  const index = doc.question_attempts.indexOf(attempt);
  if (index < 0) return;
  const previous = attempt.mark_edits?.pop();
  if (previous) Object.assign(attempt, previous);
  else if (attempt.inline) {
    doc.question_attempts.splice(index, 1);
    // Marking a go saved for later is undone by putting it back, still unmarked.
    if (attempt.saved_answer) doc.saved_answers.push(attempt.saved_answer);
  } else return;
  await persist();
}

/** Delete one go at a question, marked or waiting: its answer and mark are gone for good. */
export async function removeAttempt(attemptId) {
  const doc = requireProgress();
  const attempt = markedAttempt(doc, attemptId) || doc.saved_answers[waitingIndex(doc, attemptId)];
  if (attempt?.session_id?.startsWith('paper_')) throw new Error('Change these marks from the exported test review.');
  await deleteAttemptInk(attempt);
  const before = doc.question_attempts.length + doc.saved_answers.length;
  doc.question_attempts = doc.question_attempts.filter((entry) => entry.attempt_id !== attemptId);
  doc.saved_answers = doc.saved_answers.filter((entry) => entry.attempt_id !== attemptId);
  if (doc.question_attempts.length + doc.saved_answers.length === before) return false;
  await persist();
  return true;
}

/** Remove a go saved to mark later. */
export async function removeSavedAnswer(attemptId) {
  const doc = requireProgress();
  const index = waitingIndex(doc, attemptId);
  if (index < 0) return;
  await deleteAttemptInk(doc.saved_answers[index]);
  doc.saved_answers.splice(index, 1);
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

export const getCustomTest = (paperId) => requireProgress().custom_tests.find((paper) => paper.paper_id === paperId && !paper.export_deleted) || null;

export async function saveCustomTest(paper) {
  const doc = requireProgress();
  const exports = doc.custom_tests.filter(isStoredTestExport);
  const ordinary = doc.custom_tests.filter(candidate => !isStoredTestExport(candidate) && candidate.paper_id !== paper.paper_id);
  doc.custom_tests = [...exports, ...[...ordinary, paper].slice(-60)];
  await persist({ silent: true });
}

export const exportedTests = () => requireProgress().custom_tests.filter(isExportedTest);
export const offlineAttempts = (paperId) => requireProgress().sessions.filter(session => isOfflineSession(session) && session.paper_id === paperId);

let offlineWrites = Promise.resolve();
function writeOffline(update) {
  const accountId = user?.user_id ?? null;
  const adapter = activeAdapter;
  const promise = offlineWrites.catch(() => {}).then(async () => {
    if ((user?.user_id ?? null) !== accountId) throw new Error('Your account changed. Open the test again.');
    let value;
    if (accountId && adapter.updateProgress) {
      const fresh = await adapter.updateProgress(accountId, remote => {
        const doc = normalise(remote || requireProgress(), accountId);
        value = update(doc);
        return doc;
      });
      if (user?.user_id !== accountId) throw new Error('Your account changed. Open the test again.');
      // A practice or syllabus edit may have changed the in-memory document while
      // this request was queued. Merge just the exported tests and their attempts.
      Object.assign(requireProgress(), retainOfflineProgress(requireProgress(), fresh));
    } else {
      const doc = structuredClone(requireProgress());
      value = update(doc);
      if (accountId) await adapter.saveProgress(accountId, doc);
      else {
        try {
          sessionStorage.setItem(guestExportsKey, JSON.stringify({
            custom_tests: doc.custom_tests.filter(isStoredTestExport),
            sessions: doc.sessions.filter(isOfflineSession),
            question_attempts: doc.question_attempts.filter(attempt => attempt.session_id?.startsWith('paper_')),
            paper_attempts: doc.paper_attempts.filter(attempt => attempt.session_kind === 'offline_test'),
          }));
        } catch {
          throw new Error('This browser could not save the exported test. Free up browser storage and try again.');
        }
      }
      if ((user?.user_id ?? null) !== accountId) throw new Error('Your account changed. Open the test again.');
      Object.assign(requireProgress(), doc);
    }
    return value;
  });
  offlineWrites = promise;
  return promise;
}

export const saveExportedTest = snapshot => writeOffline(doc => putExport(doc, snapshot));
export const deleteExportedTest = (paperId, createdAt) => writeOffline(doc => removeTestExport(doc, paperId, createdAt));
export const saveOfflineAttempt = (paperId, options = {}) => writeOffline(doc => {
  const paper = doc.custom_tests.find(test => test.paper_id === paperId && isExportedTest(test));
  if (!paper) throw new Error('This exported test is unavailable in your account.');
  return putOfflineAttempt(doc, paper, options);
});

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

export async function exportDataWithInk() {
  const owner = inkOwner();
  const data = exportData();
  if (globalThis.indexedDB) data.ink = await ink.exportInkOwnerData(owner);
  if (inkAdapter()?.loadInkResponses) {
    const remote = await inkAdapter().loadInkResponses(owner);
    if (remote.length && !data.ink) data.ink = { schemaVersion: 1, ownerId: owner, records: [] };
    const seen = new Set(data.ink?.records.map(record => JSON.stringify([record.responseId, record.partId, record.sections])));
    for (const record of remote) {
      const key = JSON.stringify([record.responseId, record.partId, record.sections]);
      if (!seen.has(key)) { data.ink.records.push(record); seen.add(key); }
    }
  }
  if (inkOwner() !== owner) throw new Error('Your account changed. Open the account page again.');
  return data;
}

async function replaceProgress(replacement) {
  const account = user;
  await activeAdapter.saveProgress(account.user_id, replacement, { replace: true });
  if (user?.user_id !== account.user_id) return;
  progress = replacement;
  learnedCache = null;
  events.emit('progress', progress);
}

export async function importData(data) {
  const incoming = data?.progress ?? data;
  if (!incoming || !Array.isArray(incoming.question_attempts) || !Array.isArray(incoming.learned_spec_points)) {
    throw new Error('That file is not a PPP progress export.');
  }
  const owner = user.user_id;
  if (data?.ink) await ink.importInkOwnerData(owner, data.ink);
  if (inkOwner() !== owner) throw new Error('Your account changed. Open the account page again.');
  await replaceProgress(normalise(incoming, owner));
  if (data?.ink) syncInk().catch(() => {});
}

export async function resetProgress() {
  await replaceProgress(emptyProgress(user.user_id));
}
