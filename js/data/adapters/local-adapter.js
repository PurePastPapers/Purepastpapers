// Storage adapter: accounts and progress kept in this browser (localStorage).
//
// This is the Phase 1 default because it needs no server and works on any static host.
// Accounts made here exist only in this browser on this device; they separate people's
// progress, but they are not a security boundary. To sync across devices, write another
// adapter with the SAME methods (Supabase, Firebase, your own API…) and select it in
// js/data/api.js — no UI code needs to change.
//
// Adapter interface (all async):
//   signUp({ email, password, displayName, isDemo? }) → user
//   signIn({ email, password }) → user          signOut()
//   currentUser() → user | null
//   updateUser(userId, { display_name?, email? }) → user
//   changePassword(userId, currentPassword, newPassword)
//   deleteUser(userId)
//   loadProgress(userId) → user_progress document | null     (PRD 8.4)
//   saveProgress(userId, document)
// user = { user_id, email, display_name, created_at, is_demo }

import { APP, LIMITS } from '../../config/app.config.js';
import { fromHex, sha256, toHex } from '../../core/sha256.js';
import { uid } from '../../core/utils.js';

const NS = APP.storageNamespace;
const USERS_KEY = `${NS}:users`;
const SESSION_KEY = `${NS}:session`;
const progressKey = (userId) => `${NS}:progress:${userId}`;

function read(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function write(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    throw new Error('This browser could not save your data. Storage may be full or blocked (for example in private browsing).');
  }
}

const normaliseEmail = (email) => String(email || '').trim().toLowerCase();
const publicUser = ({ salt, hash, algorithm, ...user }) => user;

const preferredAlgorithm = () => (globalThis.crypto?.subtle ? 'pbkdf2-sha256' : 'sha256-iterated');

function randomSalt() {
  const bytes = new Uint8Array(16);
  if (globalThis.crypto?.getRandomValues) crypto.getRandomValues(bytes);
  else for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  return toHex(bytes);
}

async function derive(password, salt, algorithm) {
  if (algorithm === 'pbkdf2-sha256') {
    if (!globalThis.crypto?.subtle) {
      throw new Error('This account was created on a secure page and cannot be opened over plain http. Open the site via https or localhost.');
    }
    const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
    const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: fromHex(salt), iterations: 150_000 }, key, 256);
    return toHex(new Uint8Array(bits));
  }
  // Fallback where Web Crypto is unavailable (non-secure origins).
  let digest = sha256(`${salt}:${password}`);
  for (let i = 0; i < 3000; i++) digest = sha256(digest);
  return toHex(digest);
}

function validate({ email, password }) {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Enter a valid email address.');
  if (String(password || '').length < LIMITS.minPasswordLength) {
    throw new Error(`Choose a password with at least ${LIMITS.minPasswordLength} characters.`);
  }
}

export const localAdapter = {
  id: 'local',
  label: 'This browser',
  syncsAcrossDevices: false,

  async signUp({ email, password, displayName, isDemo = false }) {
    const address = normaliseEmail(email);
    validate({ email: address, password });
    const users = read(USERS_KEY, {});
    if (Object.values(users).some((user) => user.email === address)) {
      throw new Error('An account with that email already exists in this browser. Log in instead.');
    }
    const salt = randomSalt();
    const algorithm = preferredAlgorithm();
    const user = {
      user_id: uid('usr'),
      email: address,
      display_name: String(displayName || '').trim() || address.split('@')[0],
      created_at: new Date().toISOString(),
      is_demo: Boolean(isDemo),
      salt,
      algorithm,
      hash: await derive(password, salt, algorithm),
    };
    users[user.user_id] = user;
    write(USERS_KEY, users);
    write(SESSION_KEY, { user_id: user.user_id });
    return publicUser(user);
  },

  async signIn({ email, password }) {
    const address = normaliseEmail(email);
    const user = Object.values(read(USERS_KEY, {})).find((candidate) => candidate.email === address);
    // Same message for an unknown email and a wrong password.
    const failure = new Error('That email and password do not match an account in this browser.');
    if (!user) throw failure;
    if ((await derive(String(password || ''), user.salt, user.algorithm)) !== user.hash) throw failure;
    write(SESSION_KEY, { user_id: user.user_id });
    return publicUser(user);
  },

  async signOut() {
    localStorage.removeItem(SESSION_KEY);
  },

  async currentUser() {
    const session = read(SESSION_KEY, null);
    const user = session && read(USERS_KEY, {})[session.user_id];
    return user ? publicUser(user) : null;
  },

  async updateUser(userId, patch) {
    const users = read(USERS_KEY, {});
    const user = users[userId];
    if (!user) throw new Error('Account not found.');
    if (patch.display_name != null) {
      const name = String(patch.display_name).trim();
      if (!name) throw new Error('Enter a display name.');
      user.display_name = name;
    }
    if (patch.email != null) {
      const address = normaliseEmail(patch.email);
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)) throw new Error('Enter a valid email address.');
      if (Object.values(users).some((other) => other.email === address && other.user_id !== userId)) {
        throw new Error('Another account in this browser already uses that email.');
      }
      user.email = address;
    }
    write(USERS_KEY, users);
    return publicUser(user);
  },

  async changePassword(userId, currentPassword, newPassword) {
    const users = read(USERS_KEY, {});
    const user = users[userId];
    if (!user) throw new Error('Account not found.');
    if ((await derive(String(currentPassword || ''), user.salt, user.algorithm)) !== user.hash) {
      throw new Error('Your current password is not correct.');
    }
    validate({ email: user.email, password: newPassword });
    user.salt = randomSalt();
    user.algorithm = preferredAlgorithm();
    user.hash = await derive(newPassword, user.salt, user.algorithm);
    write(USERS_KEY, users);
  },

  async deleteUser(userId) {
    const users = read(USERS_KEY, {});
    delete users[userId];
    write(USERS_KEY, users);
    localStorage.removeItem(progressKey(userId));
    if (read(SESSION_KEY, null)?.user_id === userId) localStorage.removeItem(SESSION_KEY);
  },

  async loadProgress(userId) {
    return read(progressKey(userId), null);
  },

  async saveProgress(userId, document) {
    write(progressKey(userId), document);
  },
};
