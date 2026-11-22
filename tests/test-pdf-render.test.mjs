import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createRequire } from 'node:module';
import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createQuestionPdf, createMarkSchemePdf, createCombinedPdf } from '../js/engine/test-pdf-render.js';

let chromium = null;
try { ({ chromium } = createRequire(import.meta.url)('playwright')); } catch { /* browser dependency is optional in CI */ }

const group = (number, text, marks = 2) => ({
  localNumber: number,
  sourceReference: `Source ${number}`,
  marks,
  blocks: [{ type: 'text', text }],
});

test('PDF exports parse as versioned documents with separate and combined sections', async () => {
  const question = await createQuestionPdf({ title: 'Practice test', totalMarks: 2, compact: true, groups: [group('1', 'Question only content')] });
  const scheme = await createMarkSchemePdf({ title: 'Practice test mark scheme', totalMarks: 2, groups: [group('1', 'Scheme only content')] });
  const combined = await createCombinedPdf({
    title: 'Practice test', totalMarks: 2, compact: true,
    questionGroups: [group('1', 'Question only content')],
    schemeGroups: [group('1', 'Scheme only content')],
  });

  const questionBytes = new Uint8Array(await question.arrayBuffer());
  const schemeBytes = new Uint8Array(await scheme.arrayBuffer());
  const combinedBytes = new Uint8Array(await combined.arrayBuffer());
  for (const bytes of [questionBytes, schemeBytes, combinedBytes]) {
    const source = new TextDecoder().decode(bytes);
    assert.equal(source.startsWith('%PDF-1.4'), true);
    assert.match(source, /startxref\n\d+\n%%EOF$/);
    assert.match(source, /\/MediaBox \[0 0 595\.28 841\.89\]/);
  }
  assert.match(extractHexText(questionBytes), /Question only content/);
  assert.doesNotMatch(extractHexText(questionBytes), /Scheme only content/);
  assert.match(extractHexText(schemeBytes), /Scheme only content/);
  assert.doesNotMatch(extractHexText(schemeBytes), /Question only content/);
  const combinedSource = extractHexText(combinedBytes);
  assert.ok(combinedSource.indexOf('Question only content') < combinedSource.indexOf('Scheme only content'));
});

test('80 question selection paginates and preserves a long text block', async () => {
  const groups = Array.from({ length: 80 }, (_, index) => group(String(index + 1), `Question ${index + 1}. ${'Long readable response text '.repeat(35)}`));
  const pdf = await createQuestionPdf({ title: 'Maximum selection', totalMarks: 160, compact: false, groups });
  const source = new TextDecoder().decode(await pdf.arrayBuffer());
  assert.match(source, /\/Count ([2-9]|[1-9]\d+)\s*>>/);
  assert.match(extractHexText(source), /Question 80\./);
  assert.match(source, /\/F1 \d+ Tf/);
});

test('HTML fallback preserves superscript content when DOM APIs are absent', async () => {
  const pdf = await createQuestionPdf({
    title: 'Maths', compact: true,
    groups: [{ localNumber: '1', blocks: [{ type: 'html', html: '<p>Evaluate x<sup>2</sup> + 1.</p>' }] }],
  });
  assert.match(extractHexText(new Uint8Array(await pdf.arrayBuffer())), /\^\(2\)/);
});

test('explicit answer blocks keep separate spaces for linked scored parts', async () => {
  const pdf = await createQuestionPdf({ title: 'Linked question', compact: false, groups: [{
    localNumber: '4(a)–(b)',
    blocks: [
      { type: 'text', text: 'Part (a)' },
      { type: 'answer', marks: 1 },
      { type: 'text', text: 'Part (b)' },
      { type: 'answer', marks: 2 },
    ],
  }] });
  const source = new TextDecoder().decode(await pdf.arrayBuffer());
  const rules = source.match(/\d+(?:\.\d+)? \d+(?:\.\d+)? m [\d.]+ [\d.]+ l S/g) || [];
  assert.equal(rules.length, 5); // one cover separator and two answer lines per part
});

test('export cancellation rejects with AbortError', async () => {
  const controller = new AbortController();
  await assert.rejects(createQuestionPdf({
    title: 'Cancellable',
    groups: Array.from({ length: 10 }, (_, index) => group(String(index + 1), 'One item')),
  }, {
    signal: controller.signal,
    onProgress({ completed }) { if (completed === 2) controller.abort(); },
  }), { name: 'AbortError' });
});

test('browser converts source images and renders sanitized HTML in page and module worker', { skip: !chromium || process.env.PPP_BROWSER_TEST !== '1' }, async (t) => {
  const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const server = http.createServer(async (request, response) => {
    const pathname = new URL(request.url, 'http://localhost').pathname;
    if (pathname === '/') {
      response.writeHead(200, { 'Content-Type': 'text/html' });
      response.end('<!doctype html><meta charset="utf-8"><title>PDF render test</title>');
      return;
    }
    const file = path.resolve(repo, `.${pathname}`);
    if (!file.startsWith(`${repo}${path.sep}`)) {
      response.writeHead(403).end();
      return;
    }
    try {
      response.writeHead(200, { 'Content-Type': file.endsWith('.js') ? 'text/javascript' : 'application/octet-stream' });
      response.end(await readFile(file));
    } catch {
      response.writeHead(404).end();
    }
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  let browser = null;
  t.after(async () => {
    await browser?.close();
    server.closeAllConnections?.();
    await new Promise((resolve) => server.close(resolve));
  });
  const executablePath = existsSync('/tmp/chromium') ? '/tmp/chromium' : existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined;
  browser = await chromium.launch({ headless: true, executablePath, args: ['--no-sandbox', '--single-process', '--no-zygote'] });
  const page = await browser.newPage();
  await page.goto(`http://127.0.0.1:${server.address().port}/`);
  const result = await page.evaluate(async () => {
    const { createQuestionPdf } = await import('/js/engine/test-pdf-render.js');
    const canvas = document.createElement('canvas');
    canvas.width = 32;
    canvas.height = 20;
    const context = canvas.getContext('2d');
    context.fillStyle = '#236a9e';
    context.fillRect(0, 0, canvas.width, canvas.height);
    const image = new Uint8Array(await (await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'))).arrayBuffer());
    const pdf = await createQuestionPdf({ title: 'Browser image test', compact: true, groups: [{
      localNumber: '1', marks: 2, sourceReference: 'Fixture',
      blocks: [
        { type: 'html', html: '<p>Evaluate x<sup>2</sup> and <span class="frac"><span class="frac__n">1</span><span class="frac__d">2</span></span>.</p>' },
        { type: 'image', data: image, mimeType: 'image/png', alt: 'Blue fixture' },
      ],
    }] });
    const main = new Uint8Array(await pdf.arrayBuffer());
    const worker = new Worker('/tests/test-pdf-worker.js', { type: 'module' });
    const workerBytes = await new Promise((resolve, reject) => {
      worker.onmessage = (event) => event.data?.error ? reject(new Error(event.data.error)) : resolve(new Uint8Array(event.data));
      worker.onerror = (event) => reject(new Error(event.message));
      worker.postMessage({ image });
    });
    worker.terminate();
    const source = (bytes) => new TextDecoder().decode(bytes);
    const text = (bytes) => [...source(bytes).matchAll(/<([\da-f]+)> Tj/g)].map((match) => String.fromCharCode(...(match[1].match(/.{2}/g) || []).map((byte) => Number.parseInt(byte, 16)))).join('\n');
    return {
      main: source(main), mainText: text(main),
      worker: source(workerBytes), workerText: text(workerBytes),
      mainBase64: btoa(Array.from(main, (byte) => String.fromCharCode(byte)).join('')),
      workerBase64: btoa(Array.from(workerBytes, (byte) => String.fromCharCode(byte)).join('')),
    };
  });
  await writeFile('/tmp/ppp-browser-main-image.pdf', Buffer.from(result.mainBase64, 'base64'));
  await writeFile('/tmp/ppp-browser-worker-image.pdf', Buffer.from(result.workerBase64, 'base64'));
  for (const pdf of [result.main, result.worker]) {
    assert.ok(pdf.startsWith('%PDF-1.4'));
    assert.match(pdf, /\/Subtype \/Image/);
    assert.match(pdf, /\/DCTDecode/);
  }
  assert.match(result.mainText, /x\^\(2\)/);
  assert.match(result.mainText, /\(1\)\/\(2\)/);
  assert.match(result.workerText, /a\^\(3\)/);
});

function extractHexText(input) {
  const source = typeof input === 'string' ? input : new TextDecoder().decode(input);
  return [...source.matchAll(/<([\da-f]+)> Tj/g)].map((match) => {
    const hex = match[1].match(/.{2}/g) || [];
    return String.fromCharCode(...hex.map((byte) => Number.parseInt(byte, 16)));
  }).join('\n');
}
