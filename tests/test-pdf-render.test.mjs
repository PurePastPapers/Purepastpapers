import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createRequire } from 'node:module';
import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { prepareTestPdf } from '../js/engine/test-pdf-content.js';
import { answerLineCount, createQuestionPdf, createMarkSchemePdf, createCombinedPdf } from '../js/engine/test-pdf-render.js';

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

test('choice instructions and full-paper scheme referrals preserve the frozen numbering', async () => {
  const parts = [
    { id: 'P1A', label: '(a)', reference: 'Paper Q1(a)', maxMarks: 2 },
    { id: 'P1B', label: '(b)', reference: 'Paper Q1(b)', maxMarks: 1 },
    { id: 'P2', reference: 'Paper Q2', maxMarks: 1 },
  ];
  const snapshot = { version: 1, title: 'Choice test', totalMarks: 3, groups: [
    { number: 1, reference: 'Paper Q1', parts: parts.slice(0, 2) },
    { number: 2, reference: 'Paper Q2', parts: parts.slice(2) },
  ], choices: [{ count: 1, options: [{ partIds: ['P1B'] }, { partIds: ['P2'] }] }] };
  const official = 'https://example.org/paper/ms.pdf#page=7';
  const questions = new Map(parts.map(part => [part.id, {
    question: { content: { question_html: `<p>Prompt ${part.id}</p>` }, scheme_scope: 'part' },
    paper: { full_mark_scheme_pdf_url: official },
  }]));
  const prepared = await prepareTestPdf(snapshot, questions, { kind: 'combined' });
  assert.match(prepared.question.instructions, /Answer all questions outside the choice groups/);
  assert.match(prepared.question.instructions, /option 1 \(Question 1 \(b\)\).*option 2 \(Question 2\)/);
  for (const groups of [prepared.question.groups, prepared.scheme.groups]) {
    assert.deepEqual(groups[0].blocks.filter(block => block.role === 'subheading').map(block => block.text), ['Question 1 (a)', 'Question 1 (b)']);
  }
  assert.equal(prepared.question.groups.flatMap(group => group.blocks).some(block => block.url === official), false);
  assert.equal(prepared.scheme.groups[0].blocks.filter(block => block.type === 'link').length, 2);
  assert.ok(prepared.missing.every(item => item.kind === 'scheme' && item.officialSourceUrl === official));
  const pdf = await createMarkSchemePdf(prepared.scheme);
  const source = await pdf.text();
  assert.match(source, /\/Subtype \/Link/);
  assert.ok(source.includes(Buffer.from(official).toString('hex')));
});

test('unavailable required article blocks the question paper while leaving scheme export available', async () => {
  const part = { id: 'restricted', reference: 'Paper Q8(a)', maxMarks: 4 };
  const snapshot = { version: 1, groups: [{ number: 1, reference: part.reference, parts: [part] }] };
  const questions = new Map([[part.id, {
    question: {
      content: { question_html: '<p>Explain the article.</p>', mark_scheme_html: '<p>Actual scheme.</p>' },
      context: { article: { availability: 'restricted' } },
    },
  }]]);
  const prepared = await prepareTestPdf(snapshot, questions, { kind: 'combined' });
  assert.equal(prepared.canExportQuestions, false);
  assert.equal(prepared.canExportScheme, true);
  assert.deepEqual(prepared.missing.map(item => [item.id, item.reference, item.kind]), [[part.id, part.reference, 'question']]);
  assert.match(prepared.missing[0].reason, /pre-release article/);
});

test('a linked export skips a later composite stem when the first part has no stem', async () => {
  const parts = [
    {id: 'A', label: '(a)', reference: 'Paper Q1(a)', maxMarks: 1},
    {id: 'B', label: '(b)', reference: 'Paper Q1(b)', maxMarks: 2},
  ];
  const snapshot = {version: 1, totalMarks: 3, groups: [{number: 1, reference: 'Paper Q1', parts}]};
  const questions = new Map([
    ['A', {question: {question_id: 'A', parent_question_id: 'Q1', content: {question_html: '<p>First scored prompt</p>'}}}],
    ['B', {question: {question_id: 'B', parent_question_id: 'Q1', depends_on_question_ids: ['A'],
      context: {shared_stem_html: '<p>First scored prompt repeated in legacy context</p>'}, content: {question_html: '<p>Second scored prompt</p>'}}}],
  ]);
  const prepared = await prepareTestPdf(snapshot, questions);
  assert.equal(prepared.canExportQuestions, true);
  const blocks = prepared.question.groups[0].blocks;
  assert.deepEqual(blocks.filter(block => block.type === 'html').map(block => block.html), ['<p>First scored prompt</p>', '<p>Second scored prompt</p>']);
  assert.deepEqual(blocks.filter(block => block.type === 'answer').map(block => block.marks), [1, 2]);
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
  // Answer lines are drawn in the light rule grey; they scale with marks (2 for 1 mark, 4 for 2).
  const answerLines = source.match(/0\.74 0\.74 0\.74 RG 0\.6 w\s+[\d.]+ [\d.]+ m [\d.]+ [\d.]+ l S/g) || [];
  assert.equal(answerLines.length, answerLineCount(1) + answerLineCount(2));
  assert.equal(answerLines.length, 6);
  assert.match(extractHexText(new TextEncoder().encode(source)), /\(1 mark\)[\s\S]*\(2 marks\)/);
});

test('answer lines grow with the marks available', () => {
  assert.deepEqual([1, 2, 3, 4, 5, 6, 12].map(answerLineCount), [2, 4, 5, 7, 8, 10, 20]);
  assert.equal(answerLineCount(40), 45);
});

test('every page carries the logo and page number in its footer', async () => {
  const pdf = await createQuestionPdf({ title: 'Footer test', groups: Array.from({ length: 12 }, (_, index) => group(String(index + 1), 'Item', 6)) });
  const source = new TextDecoder().decode(await pdf.arrayBuffer());
  const pages = Number(/\/Count (\d+)/.exec(source)[1]);
  assert.ok(pages > 1);
  assert.equal((source.match(/ f\* Q/g) || []).length, pages + 1); // footer mark on each page, plus the cover lockup
  const text = extractHexText(new TextEncoder().encode(source));
  assert.match(text, new RegExp(`Page ${pages} of ${pages}`));
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
    canvas.width = 100;
    canvas.height = 420;
    context.fillStyle = '#fff';
    context.fillRect(0, 0, 100, 420);
    context.fillStyle = '#111';
    for (let row = 20; row < 420; row += 12) context.fillRect(8, row, 80, 3);
    const tallImage = new Uint8Array(await (await new Promise(resolve => canvas.toBlob(resolve, 'image/png'))).arrayBuffer());
    const tall = await createQuestionPdf({ title: 'Long crop', compact: true, groups: [{
      localNumber: '1', blocks: [{ type: 'image', data: tallImage, mimeType: 'image/png', alt: 'Long source crop' }],
    }] });
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
      tall: await tall.text(), tallText: text(new Uint8Array(await tall.arrayBuffer())),
      mainBase64: btoa(Array.from(main, (byte) => String.fromCharCode(byte)).join('')),
      workerBase64: btoa(Array.from(workerBytes, (byte) => String.fromCharCode(byte)).join('')),
    };
  });
  const realCases = await page.evaluate(async () => {
    const { prepareTestPdf } = await import('/js/engine/test-pdf-content.js');
    const { createCombinedPdf } = await import('/js/engine/test-pdf-render.js');
    const { createTestSnapshot, resolveTestSnapshot } = await import('/js/engine/test-snapshot.js');
    const { linkGroups } = await import('/js/engine/linked-parts.js');
    const sourceOf = bytes => new TextDecoder().decode(bytes);
    const pdfText = bytes => [...sourceOf(bytes).matchAll(/<([\da-f]+)> Tj/g)]
      .map(match => String.fromCharCode(...match[1].match(/.{2}/g).map(byte => Number.parseInt(byte, 16)))).join(' ');
    const fixtures = [
      ['maths', 'EDX_9MA0_2023_JUNE_01', 'Q03_U02'],
      ['maths', 'EDX_8MA0_2019_JUNE_21', 'Q04_U02'],
      ['maths', 'EDX_9MA0_2018_JUNE_02', 'Q05_U03'],
      ['gcsemaths', 'EDX_1MA1_2022_JUNE_1H', 'Q06_U03'],
      ['gcsephys', 'EDX_1SC0_2022_JUNE_2PF', 'Q02_U02'],
    ];
    const result = [];
    for (const [slug, paperId, suffix] of fixtures) {
      const { questions, papers } = await (await fetch(`/data/packs/${slug}/${paperId}.json`)).json();
      const questionsById = new Map(questions.map(question => [question.question_id, question]));
      const papersById = new Map(papers.map(paper => [paper.paper_id, paper]));
      const bundle = { subject: { subject_id: questions[0].subject_id }, questionsById, papersById };
      linkGroups(questionsById, papersById);
      const id = `${paperId}_${suffix}`;
      const snapshot = createTestSnapshot({ bundle, ids: suffix === 'Q06_U03' ? [id, `${paperId}_Q06_U02`] : [id] });
      const prepared = await prepareTestPdf(snapshot, resolveTestSnapshot(snapshot, bundle), { kind: 'combined' });
      const pdf = await createCombinedPdf(prepared.combined);
      const bytes = new Uint8Array(await pdf.arrayBuffer());
      result.push({
        parts: snapshot.groups[0].parts.map(part => part.id.replace(`${paperId}_`, '')),
        marks: snapshot.totalMarks,
        missing: prepared.missing,
        contextBlocks: prepared.question.groups[0].blocks.filter(block => block.alt?.startsWith('Required context')).length,
        answerSpaces: prepared.question.groups[0].blocks.filter(block => block.type === 'answer').map(block => block.marks),
        questionLabels: prepared.question.groups[0].blocks.filter(block => block.role === 'subheading').map(block => block.text),
        schemeLabels: prepared.scheme.groups[0].blocks.filter(block => block.role === 'subheading').map(block => block.text),
        text: pdfText(bytes),
        pdf: suffix === 'Q03_U02' ? btoa(Array.from(bytes, byte => String.fromCharCode(byte)).join('')) : null,
      });
    }
    return result;
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
  assert.ok((result.tall.match(/\/Subtype \/Image/g) || []).length > 2);
  assert.match(result.tall, /q 499\.28 0 0/);
  assert.match(result.tallText, /Long source crop \(continued\)/);
  assert.deepEqual(realCases.map(item => item.parts), [['Q03_U01', 'Q03_U02'], ['Q04_U02'], ['Q05_U03'], ['Q06_U02', 'Q06_U03'], ['Q02_U01', 'Q02_U02']]);
  assert.equal(realCases[0].marks, 3);
  assert.equal(realCases[0].contextBlocks, 1);
  assert.equal(realCases[4].marks, 3);
  assert.equal(realCases[4].contextBlocks, 1);
  for (const item of realCases) {
    assert.deepEqual(item.missing, []);
    assert.equal(item.answerSpaces.length, item.parts.length);
    assert.equal(item.answerSpaces.reduce((sum, marks) => sum + marks, 0), item.marks);
    assert.deepEqual(item.questionLabels, item.schemeLabels);
    assert.ok(item.text.indexOf('Question paper') < item.text.indexOf('Mark scheme'));
  }
  await writeFile('/tmp/ppp-verified-linked-export.pdf', Buffer.from(realCases[0].pdf, 'base64'));

  const repairedCrop = await page.evaluate(() => document.createElement('canvas').toDataURL('image/webp').split(',')[1]);
  let loads = 0;
  await page.route('**/data/maths-assets/RETRY.json', route => route.fulfill({
    json: { assets: { 'Q.webp': { base64: loads++ === 0 ? 'Y29ycnVwdA==' : repairedCrop } } },
  }));
  const retry = await page.evaluate(async () => {
    const { prepareTestPdf } = await import('/js/engine/test-pdf-content.js');
    const part = { id: 'retry', reference: 'Q1', maxMarks: 1 };
    const snapshot = { version: 1, totalMarks: 1, groups: [{ number: 1, parts: [part] }] };
    const questions = new Map([[part.id, { question: { content: { question_image_url: 'assets/maths/RETRY/Q.webp' } } }]]);
    const first = await prepareTestPdf(snapshot, questions);
    const second = await prepareTestPdf(snapshot, questions);
    return { originalBlocked: !first.canExportQuestions, retryReady: second.canExportQuestions };
  });
  assert.deepEqual(retry, { originalBlocked: true, retryReady: true });
  assert.equal(loads, 2);

  const openTab = await browser.newPage();
  for (const path of ['js/engine/test-snapshot.js', 'js/data/source-images.js']) {
    await openTab.route(url => url.pathname === `/${path}` && !url.search, route => route.fulfill({
      contentType: 'text/javascript',
      body: path.endsWith('/source-images.js') ? 'export function sourceImage() {}' : 'export const oldVersion = true;',
    }));
  }
  await openTab.goto(`http://127.0.0.1:${server.address().port}/`);
  assert.equal(await openTab.evaluate(async () => {
    await import('/js/engine/test-snapshot.js');
    await import('/js/data/source-images.js');
    return typeof (await import('/js/ui/test-pdf.js')).offerTestPdf;
  }), 'function');
  await openTab.close();
});

function extractHexText(input) {
  const source = typeof input === 'string' ? input : new TextDecoder().decode(input);
  return [...source.matchAll(/<([\da-f]+)> Tj/g)].map((match) => {
    const hex = match[1].match(/.{2}/g) || [];
    return String.fromCharCode(...hex.map((byte) => Number.parseInt(byte, 16)));
  }).join('\n');
}
