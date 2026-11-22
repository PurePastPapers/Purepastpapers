import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

let chromium;
try { ({ chromium } = createRequire(import.meta.url)('playwright')); } catch {}

test('resuming current handwriting updates it and a stale tab keeps a separate version', {
  skip: !chromium && 'Playwright is not installed',
}, async () => {
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
    browser = await chromium.launch();
    const context = await browser.newContext();
    await context.route(`${base}/fixture`, route => route.fulfill({
      contentType: 'text/html', body: '<title>Handwriting fixture</title>',
    }));
    const first = await context.newPage();
    const second = await context.newPage();
    await Promise.all([first.goto(`${base}/fixture`), second.goto(`${base}/fixture`)]);
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
  } finally {
    await browser?.close();
    server.kill();
  }
});
