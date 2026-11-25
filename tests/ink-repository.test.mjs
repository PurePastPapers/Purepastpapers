import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

let chromium;
try { ({ chromium } = createRequire(import.meta.url)('playwright')); } catch {}

async function withInkBrowser(run, contextOptions = {}) {
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
    const context = await browser.newContext(contextOptions);
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
      const canvas = host.querySelector('.ink-editor__canvas');
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
      const value = editor.getValue();
      const add = host.querySelector('.ink-editor__add-space');
      const belowCanvas = add.getBoundingClientRect().top >= bounds.bottom;
      add.click();
      const expanded = host.querySelector('.ink-editor__canvas').getBoundingClientRect();
      const legacyValue = createInkEditor(document.createElement('div'), {
        value: { ...value, sections: [{ ...value.sections[0], height: 360 }] },
      }).getValue();
      return {
        beforePenUp, changes, value, belowCanvas, touchAction: getComputedStyle(host.querySelector('.ink-editor__canvas')).touchAction,
        ratio: bounds.width / bounds.height, expandedHeightFactor: expanded.height / bounds.height,
        expandedValue: editor.getValue(), canvasCount: host.querySelectorAll('canvas').length, legacyValue,
      };
    });
    assert.equal(result.beforePenUp, 0);
    assert.equal(result.changes.length, 2);
    assert.equal(result.value.sections[0].strokes.length, 1);
    assert.equal(result.value.sections[0].strokes[0].points.length, 2);
    assert.equal(result.touchAction, 'none');
    assert.ok(Math.abs(result.ratio - 1000 / 900) < 0.01);
    assert.equal(result.belowCanvas, true);
    assert.equal(result.canvasCount, 1);
    assert.ok(Math.abs(result.expandedHeightFactor - 1.4) < 0.01);
    assert.deepEqual(result.expandedValue.sections[0], { ...result.value.sections[0], height: 1260 });
    assert.deepEqual(result.legacyValue.sections[0], result.value.sections[0]);
  });
});

test('the Pencil keeps a vertical first stroke when the answer switches from text to ink', browserOptions, async () => {
  await withInkBrowser(async (page) => {
    const result = await page.evaluate(async () => {
      const { createInkEditor, transferPencilStroke } = await import('/js/ui/ink-editor.js');
      const host = document.createElement('div');
      host.style.width = '500px';
      const input = document.createElement('textarea');
      const surface = document.createElement('div');
      host.append(input, surface);
      document.body.append(host);
      let transfer;
      input.addEventListener('pointerdown', event => { transfer = transferPencilStroke(event, host); });
      const send = (target, type, y, pointerId = 7) => target.dispatchEvent(new PointerEvent(type, {
        bubbles: true, cancelable: true, pointerType: 'pen', pointerId, button: 0, clientX: 50, clientY: y,
      }));
      const typingCancelled = !send(input, 'pointerdown', 40);
      input.hidden = true;
      send(host, 'pointermove', 70);
      const saved = [];
      const editor = createInkEditor(surface, { controlsBelow: true, onChange: record => saved.push(record) });
      transfer.attach(editor);
      send(host, 'pointerup', 70, 8);
      send(host, 'pointermove', 100);
      send(host, 'pointerup', 100);
      const canvas = surface.querySelector('.ink-editor__canvas');
      const [stroke] = saved[0].sections[0].strokes;
      return { typingCancelled, saves: saved.length, points: stroke.points, touchAction: getComputedStyle(canvas).touchAction };
    });
    assert.equal(result.typingCancelled, true);
    assert.equal(result.touchAction, 'none');
    assert.equal(result.saves, 1);
    assert.equal(result.points.length, 3);
    assert.ok(result.points[0].y < result.points[1].y && result.points[1].y < result.points[2].y);
  });
});

test('each Pencil contact blocks native panning on the canvas and leaves surrounding touch gestures alone', browserOptions, async () => {
  await withInkBrowser(async (page) => {
    const result = await page.evaluate(async () => {
      const { createInkEditor } = await import('/js/ui/ink-editor.js');
      const host = document.createElement('div');
      document.body.append(host);
      const editor = createInkEditor(host);
      const canvas = host.querySelector('.ink-editor__canvas');
      const bounds = canvas.getBoundingClientRect();
      const blocked = (target, type) => !target.dispatchEvent(new Event(type, { bubbles: true, cancelable: true }));
      const gestures = [];
      for (const [index, direction] of [1, -1, 1, -1].entries()) {
        const startY = bounds.top + 100;
        const pen = (type, y) => canvas.dispatchEvent(new PointerEvent(type, {
          bubbles: true, cancelable: true, pointerType: 'pen', pointerId: index + 1, button: 0,
          clientX: bounds.left + 35 + index * 15, clientY: y,
        }));
        pen('pointerdown', startY);
        gestures.push(blocked(canvas, 'touchstart'), blocked(canvas, 'touchmove'));
        pen('pointermove', startY + 50 * direction);
        pen('pointerup', startY + 50 * direction);
      }
      const strokeDirections = editor.getValue().sections[0].strokes.map(({ points }) => Math.sign(points.at(-1).y - points[0].y));
      return { gestures, strokeDirections, outside: blocked(host, 'touchmove'), touchAction: canvas.style.touchAction };
    });
    assert.deepEqual(result.gestures, Array(8).fill(true));
    assert.deepEqual(result.strokeDirections, [1, -1, 1, -1]);
    assert.equal(result.outside, false);
    assert.equal(result.touchAction, 'none');
  });
});


test('an interrupted Pencil stroke survives reopening and tall answers retain high-density ink', browserOptions, async () => {
  await withInkBrowser(async (first, second) => {
    const saved = await first.evaluate(async () => {
      const { createInkEditor } = await import('/js/ui/ink-editor.js');
      const { createInkRepository } = await import('/js/data/ink.js');
      const host = document.body.appendChild(document.createElement('div'));
      host.style.width = '800px';
      let value;
      const editor = createInkEditor(host, { onChange: changed => { value = changed; } });
      const thickness = host.querySelector('[aria-label="Pen thickness"]');
      thickness.value = '7';
      thickness.dispatchEvent(new Event('input'));
      for (let index = 0; index < 4; index += 1) host.querySelector('.ink-editor__add-space').click();
      const surface = host.querySelector('.ink-editor__canvas');
      const bounds = surface.getBoundingClientRect();
      const send = (type, x, y) => surface.dispatchEvent(new PointerEvent(type, {
        pointerId: 1, pointerType: 'pen', button: 0,
        clientX: bounds.left + x, clientY: bounds.top + y, pressure: 0.52,
      }));
      send('pointerdown', 45, 25);
      send('pointermove', 65, 50);
      send('pointermove', 80, 60);
      send('pointercancel', 80, 60);
      const repository = createInkRepository('pencil-qa');
      await repository.save({ ...value, responseId: 'r', partId: 'q', status: 'saved' });
      const tiles = [...surface.querySelectorAll('canvas')];
      editor.destroy();
      return { tiles: tiles.length, pixelWidth: tiles[0].width, cssWidth: bounds.width };
    });
    assert.ok(saved.tiles > 1);
    assert.equal(saved.pixelWidth, saved.cssWidth * 3);
    const reopened = await second.evaluate(async () => {
      const { createInkEditor } = await import('/js/ui/ink-editor.js');
      const { createInkRepository } = await import('/js/data/ink.js');
      const host = document.body.appendChild(document.createElement('div'));
      const record = await createInkRepository('pencil-qa').load('r', 'q');
      const editor = createInkEditor(host, { value: record });
      const newQuestion = document.body.appendChild(document.createElement('div'));
      createInkEditor(newQuestion);
      return {
        thickness: newQuestion.querySelector('[aria-label="Pen thickness"]').value,
        stroke: editor.getValue().sections[0].strokes[0],
      };
    });
    assert.equal(reopened.thickness, '7');
    assert.equal(reopened.stroke.width, 7);
    assert.equal(reopened.stroke.points.length, 3);
  }, { deviceScaleFactor: 3, hasTouch: true, viewport: { width: 1024, height: 768 } });
});
