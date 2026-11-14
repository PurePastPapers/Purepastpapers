import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as api from '../js/data/api.js';

test('guest progress transfers on signup, while login preserves an existing account', async () => {
  const values = new Map();
  globalThis.localStorage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
  };

  await api.init();
  await api.signUp({ email: 'existing@example.test', password: 'test-password', displayName: 'Existing' });
  await api.setEnrolled('existing-subject', true);
  await api.setLearned(['existing-point'], true);
  await api.signOut();

  await api.setEnrolled('guest-subject', true);
  await api.setLearned(['guest-point'], true);
  await api.addPaperAttempt({ paper_id: 'guest-paper', marks_awarded: 3 });
  await api.signIn({ email: 'existing@example.test', password: 'test-password' });
  assert.deepEqual(api.getProgress().enrolled_subjects, ['existing-subject']);
  assert.deepEqual(api.getProgress().learned_spec_points, ['existing-point']);
  assert.deepEqual(api.getProgress().paper_attempts, []);

  await api.signOut();
  await api.setEnrolled('guest-subject', true);
  await api.setLearned(['guest-point'], true);
  await api.addPaperAttempt({ paper_id: 'guest-paper', marks_awarded: 3 });
  const created = await api.signUp({ email: 'new@example.test', password: 'test-password', displayName: 'New' });
  assert.equal(api.getProgress().user_id, created.user_id);
  assert.deepEqual(api.getProgress().enrolled_subjects, ['guest-subject']);
  assert.deepEqual(api.getProgress().learned_spec_points, ['guest-point']);
  assert.equal(api.getProgress().paper_attempts[0].paper_id, 'guest-paper');

  await api.signOut();
  await api.signIn({ email: 'new@example.test', password: 'test-password' });
  assert.deepEqual(api.getProgress().enrolled_subjects, ['guest-subject']);
  assert.equal(api.getProgress().paper_attempts[0].paper_id, 'guest-paper');
  await api.signOut();
  await api.signIn({ email: 'existing@example.test', password: 'test-password' });
  assert.deepEqual(api.getProgress().enrolled_subjects, ['existing-subject']);
  assert.deepEqual(api.getProgress().paper_attempts, []);
});
