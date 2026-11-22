import test from 'node:test';
import assert from 'node:assert/strict';
import { getBundle } from '../js/data/content-repository.js';

test('a failed pack index or enabled pack can be retried without caching an incomplete bank', async (t) => {
  const subject = { subject_id: 'S' };
  const fixtures = new Map([
    ['/data/subjects.json', [subject]],
    ['/data/specs/S.json', { ...subject, sections: [] }],
    ['/data/papers/S.json', []],
    ['/data/questions/S.json', []],
    ['/data/packs/index.json', { packs: [{ file: 'official.json', subject_id: 'S' }] }],
    ['/data/packs/official.json', { questions: [{ ...subject, question_id: 'Q1' }] }],
  ]);
  const failures = new Set(['/data/packs/index.json', '/data/packs/official.json']);
  t.mock.method(globalThis, 'fetch', async (url) => {
    const pathname = url.pathname.slice(url.pathname.lastIndexOf('/data/'));
    if (failures.delete(pathname)) return new Response('', { status: 503 });
    assert.ok(fixtures.has(pathname), pathname);
    return Response.json(fixtures.get(pathname));
  });

  await assert.rejects(getBundle('S'), /packs\/index\.json.*503/);
  await assert.rejects(getBundle('S'), /packs\/official\.json.*503/);
  assert.deepEqual((await getBundle('S')).questions.map(question => question.question_id), ['Q1']);
});
