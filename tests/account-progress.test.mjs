import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as api from '../js/data/api.js';

test('failed backup import or reset keeps existing progress available before retry', async () => {
  const storage = new Map();
  let blockWrites = false;
  globalThis.localStorage = {
    getItem: (key) => storage.get(key) ?? null,
    setItem: (key, value) => {
      if (blockWrites) throw new Error('Storage unavailable');
      storage.set(key, String(value));
    },
    removeItem: (key) => storage.delete(key),
  };
  await api.init();
  const account = await api.signUp({ email: 'backup-test@example.test', password: 'test-password' });
  await api.setLearned(['original-point'], true);
  await api.addPaperAttempt({ paper_id: 'original-paper', marks_awarded: 17 });
  const original = api.exportData().progress;
  const replacement = {
    user_id: 'backup-owner',
    question_attempts: [],
    learned_spec_points: ['backup-point'],
    paper_attempts: [{ paper_id: 'backup-paper', marks_awarded: 23 }],
  };

  blockWrites = true;
  await assert.rejects(api.importData({ progress: replacement }), /could not save your data/i);
  assert.deepEqual(api.exportData().progress, original);
  assert.deepEqual([...api.learnedSet()], ['original-point']);
  await assert.rejects(api.resetProgress(), /could not save your data/i);
  assert.deepEqual(api.exportData().progress, original);
  assert.deepEqual([...api.learnedSet()], ['original-point']);

  blockWrites = false;
  await api.importData({ progress: replacement });
  await api.init();
  assert.equal(api.getProgress().user_id, account.user_id);
  assert.deepEqual(api.getProgress().paper_attempts, replacement.paper_attempts);
  assert.deepEqual([...api.learnedSet()], ['backup-point']);

  await api.resetProgress();
  await api.init();
  assert.deepEqual(api.getProgress().paper_attempts, []);
  assert.deepEqual([...api.learnedSet()], []);
});
