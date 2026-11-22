import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

let chromium;
try { ({ chromium } = createRequire(import.meta.url)('playwright')); } catch {}

async function withInkBrowser(run) {
  const port = 6300 + Math.floor(Math.random() * 500);
  const base = `http://127.0.0.1:${port}`;
  const server = spawn(process.execPath, [
    fileURLToPath(new URL('../tools/serve.mjs', import.meta.url)), String(port),
  ], { stdio: 'ignore' });
  let browser;
  try {
    for (let attempt = 0; attempt < 50; attempt += 1) {
      try { if ((await fetch(base)).ok) break; } catch {}
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    browser = await chromium.launch(process.env.PPP_CHROMIUM_EXECUTABLE ? {
      executablePath: process.env.PPP_CHROMIUM_EXECUTABLE,
      args: ['--no-sandbox', '--no-zygote', '--disable-dev-shm-usage'],
    } : {});
    const context = await browser.newContext();
    await context.route(`${base}/fixture`, route => route.fulfill({
      contentType: 'text/html', body: '<title>Handwriting fixture</title><link rel="stylesheet" href="/css/ink-editor.css">',
    }));
    const first = await context.newPage();
    const second = await context.newPage();
    await Promise.all([first.goto(`${base}/fixture`), second.goto(`${base}/fixture`)]);
    await run(first, second);
  } finally {
    await browser?.close();
    server.kill();
  }
}

const browserOptions = { skip: !chromium && 'Playwright is not installed' };

test('resuming current handwriting updates it and a stale tab keeps a separate version', browserOptions, async () => {
  await withInkBrowser(async (first, second) => {
    const section = id => ({ id, width: 1000, height: 360, strokes: [] });
    const input = {
      schemaVersion: 1, ownerId: 'student-a', responseId: 'response', partId: 'part',
      revision: 1, status: 'draft', sections: [section('first')],
    };
    const write = (page, record) => page.evaluate(async value => {
      const { createInkRepository } = await import('/js/data/ink.js');
      return createInkRepository('student-a').save(value);
    }, record);
    const original = await write(first, input);
    const resumed = await second.evaluate(async () => {
      const { createInkRepository } = await import('/js/data/ink.js');
      return (await createInkRepository('student-a').listByResponse('response'))[0];
    });
    const edited = await write(second, { ...resumed, sections: [...resumed.sections, section('second')] });
    assert.equal(edited.conflict, undefined);
    assert.equal(edited.revision, original.revision + 1);
    const stale = await write(first, { ...original, sections: [section('other-tab')] });
    assert.equal(stale.conflict, true);

    const { current, all, otherOwner } = await first.evaluate(async () => {
      const { createInkRepository } = await import('/js/data/ink.js');
      const student = createInkRepository('student-a');
      return {
        current: await student.load('response', 'part'),
        all: await student.listByResponse('response'),
        otherOwner: await createInkRepository('student-b').load('response', 'part'),
      };
    });
    assert.deepEqual(current.sections.map(item => item.id), ['first', 'second']);
    assert.equal(all.filter(item => item.conflict).length, 1);
    assert.equal(otherOwner, null);
  });
});

test('cloud refresh preserves queued ink and keeps divergent versions available for selection', browserOptions, async () => {
  await withInkBrowser(async (page) => {
    const result = await page.evaluate(async () => {
      const { createInkRepository, loadSyncedInk, resolveInkConflict, syncInkOutbox } = await import('/js/data/ink.js');
      const owner = 'student-a';
      const repository = createInkRepository(owner);
      const section = id => ({ id, width: 1000, height: 360, strokes: [] });
      let remote = {
        schemaVersion: 1, ownerId: owner, responseId: 'response', partId: 'part',
        revision: 1, cloudRevision: 1, status: 'draft', sections: [section('remote')],
      };
      const adapter = {
        loadInkResponses: async () => [remote],
        saveInkResponse: async (userId, record, revision) => {
          if (userId !== owner || revision !== remote.revision) throw new Error('Unexpected cloud save');
          remote = { ...record, cloudRevision: record.revision };
          return { status: 'saved', revision: record.revision };
        },
      };
      const load = () => loadSyncedInk(owner, 'response', 'part', adapter);
      const first = await load();
      const edited = await repository.save({ ...first.record, sections: [section('local')] });
      const pending = await load();
      const queued = await repository.listOutbox();
      remote = { ...remote, revision: 2, cloudRevision: 2, sections: [section('other-device')] };
      const diverged = await load();
      const chosen = await resolveInkConflict(owner, 'response', 'part', diverged.conflicts[0], { useConflict: true }, adapter);
      const final = await load();
      const saved = await repository.save({ ...final.record, status: 'saved' });
      const interrupted = await syncInkOutbox(owner, {
        saveInkResponse: async (...args) => {
          await adapter.saveInkResponse(...args);
          throw new Error('Lost response after saving');
        },
      });
      const retried = await load();
      return { first, edited, pending, queued, diverged, chosen, final, saved, interrupted, retried, outbox: await repository.listOutbox() };
    });
    assert.equal(result.first.record.sections[0].id, 'remote');
    assert.equal(result.pending.record.revision, result.edited.revision);
    assert.equal(result.pending.record.sections[0].id, 'local');
    assert.equal(result.queued.length, 1);
    assert.equal(result.diverged.record.sections[0].id, 'other-device');
    assert.deepEqual(result.diverged.conflicts.map(record => record.sections[0].id), ['local']);
    assert.equal(result.chosen.record.sections[0].id, 'local');
    assert.equal(result.final.record.cloudRevision, 3);
    assert.equal(result.final.conflicts.length, 0);
    assert.equal(result.saved.status, 'saved');
    assert.equal(result.interrupted.failed, 1);
    assert.equal(result.retried.record.cloudRevision, 4);
    assert.equal(result.retried.record.status, 'saved');
    assert.equal(result.outbox.length, 0);
  });
});

test('only the active Pencil pointer can finish a stroke', browserOptions, async () => {
  await withInkBrowser(async (page) => {
    const result = await page.evaluate(async () => {
      const { createInkEditor } = await import('/js/ui/ink-editor.js');
      const host = document.createElement('div');
      host.style.width = '600px';
      document.body.append(host);
      const changes = [];
      const editor = createInkEditor(host, { onChange: record => changes.push(record) });
      const canvas = host.querySelector('canvas');
      const bounds = canvas.getBoundingClientRect();
      const captured = new Set();
      canvas.setPointerCapture = id => captured.add(id);
      canvas.hasPointerCapture = id => captured.has(id);
      canvas.releasePointerCapture = id => captured.delete(id);
      const pointer = (type, pointerType, pointerId, offset = 0) => canvas.dispatchEvent(new PointerEvent(type, {
        pointerId, pointerType, button: 0, buttons: type === 'pointerup' ? 0 : 1,
        clientX: bounds.left + 30 + offset, clientY: bounds.top + 20, pressure: 0.7,
      }));
      pointer('pointerdown', 'pen', 1);
      pointer('pointerdown', 'touch', 2);
      pointer('pointerup', 'touch', 2);
      pointer('pointermove', 'pen', 1, 30);
      const beforePenUp = changes.length;
      pointer('pointerup', 'pen', 1, 30);
      pointer('pointerdown', 'pen', 3, 40);
      pointer('lostpointercapture', 'pen', 3, 40);
      return { beforePenUp, changes, value: editor.getValue(), touchAction: canvas.style.touchAction, ratio: bounds.width / bounds.height };
    });
    assert.equal(result.beforePenUp, 0);
    assert.equal(result.changes.length, 1);
    assert.equal(result.value.sections[0].strokes.length, 1);
    assert.equal(result.value.sections[0].strokes[0].points.length, 2);
    assert.equal(result.touchAction, 'pan-y pinch-zoom');
    assert.ok(Math.abs(result.ratio - 1000 / 360) < 0.01);
  });
});
