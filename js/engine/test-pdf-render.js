// Small browser-only PDF writer for custom test exports. Text remains selectable.
// It writes standard PDF 1.4 and embeds source images as JPEG XObjects.

const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const MARGIN = 48;
const TEXT_WIDTH = PAGE_WIDTH - MARGIN * 2;
const FONT = 'F1';
const BOLD_FONT = 'F2';
const SYMBOL_FONT = 'F3';
const CODE_FONT = 'F4';
const SYMBOLS = Object.freeze({
  'Α': 0x41, 'Β': 0x42, 'Γ': 0x47, 'Δ': 0x44, 'Θ': 0x51, 'Λ': 0x4c, 'Ω': 0x57,
  'Π': 0x50, 'Σ': 0x53, 'α': 0x61, 'β': 0x62, 'γ': 0x67, 'δ': 0x64, 'ε': 0x65,
  'θ': 0x71, 'λ': 0x6c, 'μ': 0x6d, 'π': 0x70, 'σ': 0x73, 'ω': 0x77,
  '−': 0x2d, '≤': 0xa3, '≥': 0xb3, '≠': 0xb9, '≈': 0xbb, '∞': 0xa5,
  '√': 0xd6, '∫': 0xf2, '∴': 0x5c, '∠': 0xd0, '∝': 0xb5, '′': 0xa2, '″': 0xb2,
  '∧': 0xd9, '∨': 0xda, '∩': 0xc7, '∪': 0xc8, '→': 0xae, '←': 0xac, '↔': 0xab,
});
const USABLE_HEIGHT = PAGE_HEIGHT - 2 * MARGIN - 24;

export async function createQuestionPdf(options, controls = {}) {
  return createPdfDocument(options, options.groups || [], 'questions', [], controls);
}

export async function createMarkSchemePdf(options, controls = {}) {
  return createPdfDocument(options, options.groups || [], 'scheme', [], controls);
}

export async function createCombinedPdf(options, controls = {}) {
  return createPdfDocument(options, options.questionGroups || [], 'combined', options.schemeGroups || [], controls);
}

async function createPdfDocument(options, questionGroups, mode, schemeGroups = [], controls = {}) {
  checkAbort(controls.signal);
  const doc = new PdfLayout(options, mode);
  await doc.addCover();
  await doc.addGroups(questionGroups, mode === 'scheme' ? 'scheme' : 'questions', controls);
  if (mode === 'combined' && schemeGroups.length) {
    checkAbort(controls.signal);
    doc.newPage();
    doc.sectionHeading('Mark scheme');
    await doc.addGroups(schemeGroups, 'scheme', controls);
  }
  checkAbort(controls.signal);
  return doc.toBlob();
}

class PdfLayout {
  constructor(options, mode) {
    this.options = options;
    this.mode = mode;
    this.compact = Boolean(options.compact);
    this.pages = [];
    this.images = [];
    this.preparedImages = new WeakMap();
    this.newPage();
  }

  newPage() {
    this.page = { commands: [], images: new Set(), links: [] };
    this.pages.push(this.page);
    this.y = PAGE_HEIGHT - MARGIN;
  }

  async addCover() {
    const title = cleanText(this.options.title || 'Custom test');
    for (const line of wrapText(title, TEXT_WIDTH, 19)) this.text(line, 19, true, 25);
    this.text(this.mode === 'scheme' ? 'Mark scheme' : 'Question paper', 11, true, 15);
    if (this.options.totalMarks != null) this.text(`Total marks: ${this.options.totalMarks}`, 10, false, 18);
    if (this.options.instructions) {
      for (const line of wrapText(cleanText(this.options.instructions), TEXT_WIDTH, 10)) this.text(line, 10, false, 13);
    }
    this.rule(12);
  }

  sectionHeading(label) {
    this.ensure(32);
    this.text(label, 15, true, 20);
    this.rule(9);
  }

  async addGroups(groups, role, controls) {
    for (const [index, group] of groups.entries()) {
      checkAbort(controls.signal);
      controls.onProgress?.({ completed: index, total: groups.length });
      const heading = [group.localNumber ? `Question ${group.localNumber}` : '', group.sourceReference || ''].filter(Boolean).join(' · ');
      const blocks = group.blocks || [];
      const headingLines = wrapText(heading || group.heading || (role === 'scheme' ? 'Mark scheme' : 'Question'), TEXT_WIDTH, 12);
      const firstContent = blocks.findIndex(block => !['meta', 'subheading', 'notice'].includes(block.role) && !['rule', 'answer', 'link'].includes(block.type));
      const leading = firstContent < 0 ? [] : blocks.slice(0, firstContent + 1);
      let space = headingLines.length * 16 + (group.marks != null ? 12 : 0);
      for (const [index, block] of leading.entries()) space += await this.blockHeight(block, index === firstContent);
      this.ensure(space);
      for (const line of headingLines) this.text(line, 12, true, 16);
      if (group.marks != null) this.text(`${group.marks} ${Number(group.marks) === 1 ? 'mark' : 'marks'}`, 9, false, 12);
      const explicitAnswerAreas = blocks.some((block) => block.type === 'answer');
      for (const [index, block] of blocks.entries()) {
        checkAbort(controls.signal);
        if (block.role === 'subheading') {
          const nextContent = blocks[index + 1];
          this.ensure(await this.blockHeight(block) + (nextContent ? await this.blockHeight(nextContent, true) : 0));
        }
        if (block.type === 'rule') {
          this.rule(8);
        } else if (block.type === 'answer') {
          if (role === 'questions' && !this.compact) this.answerSpace(block.marks);
        } else if (block.type === 'image') {
          await this.image(block);
        } else if (block.type === 'link') {
          this.link(block);
        } else if (block.role === 'code') {
          for (const line of wrapCode(block.text)) this.text(line, 9, false, 12, CODE_FONT);
        } else {
          const bold = block.role === 'subheading';
          for (const line of this.blockLines(block)) this.text(line, 10, bold, 13);
          for (const line of wrapText(block.caption || '', TEXT_WIDTH, 8).filter(Boolean)) this.text(line, 8, false, 11);
        }
      }
      if (role === 'questions' && !this.compact && !explicitAnswerAreas) this.answerSpace(group.marks);
      this.y -= 12;
      controls.onProgress?.({ completed: index + 1, total: groups.length });
    }
  }

  answerSpace(marks) {
    const lines = Math.max(2, Math.min(12, Number(marks) ? Math.ceil(Number(marks) / 2) : 3));
    for (let index = 0; index < lines; index += 1) {
      this.ensure(16);
      this.rule(14, true);
    }
  }

  blockLines(block) {
    const text = block.type === 'html' ? htmlToText(block.html) : cleanText(block.text || '');
    return wrapText(text, TEXT_WIDTH, 10);
  }

  async blockHeight(block, firstLineOnly = false) {
    if (block.type === 'image') {
      const [first] = await this.preparedImage(block);
      return first.height + this.imageCaption(block).length * 11 + 10;
    }
    const lines = block.role === 'code' ? wrapCode(block.text) : this.blockLines(block);
    return (firstLineOnly ? Math.min(1, lines.length) : lines.length) * 13
      + wrapText(block.caption || '', TEXT_WIDTH, 8).filter(Boolean).length * 11;
  }

  imageCaption(block) {
    return block.alt ? wrapText(block.alt, TEXT_WIDTH, 8) : [];
  }

  preparedImage(block) {
    if (!this.preparedImages.has(block.data)) {
      this.preparedImages.set(block.data, prepareImage(block.data, block.mimeType));
    }
    return this.preparedImages.get(block.data);
  }

  async image(block) {
    const images = await this.preparedImage(block);
    for (const [index, image] of images.entries()) {
      if (index) this.newPage();
      const captions = index
        ? wrapText(`${block.alt || 'Question'} (continued)`, TEXT_WIDTH, 8)
        : this.imageCaption(block);
      this.ensure(image.height + captions.length * 11 + 10);
      for (const line of captions) this.text(line, 8, false, 11);
      if (!image.id) {
        image.id = this.images.length + 1;
        this.images.push({ bytes: image.bytes, width: image.originalWidth, height: image.originalHeight });
      }
      this.page.images.add(image.id);
      this.page.commands.push(`q ${num(image.width)} 0 0 ${num(image.height)} ${MARGIN} ${num(this.y - image.height)} cm /Im${image.id} Do Q`);
      this.y -= image.height + 10;
    }
  }

  link({ text, url }) {
    let parsed;
    try { parsed = new URL(url); } catch { return; }
    if (parsed.protocol !== 'https:' || parsed.username || parsed.password) return;
    for (const line of wrapText(cleanText(text), TEXT_WIDTH, 9)) {
      this.ensure(12);
      const x2 = MARGIN + Math.min(TEXT_WIDTH, estimateWidth(line, 9) + 8);
      this.page.links.push({ rect: [MARGIN, num(this.y - 2), num(x2), num(this.y + 9)], url: parsed.href });
      this.page.commands.push('0.05 0.28 0.55 rg');
      this.text(line, 9, false, 12);
      this.page.commands.push('0 g');
    }
  }

  text(value, size = 10, bold = false, gap = 13, font = bold ? BOLD_FONT : FONT) {
    this.ensure(gap);
    this.page.commands.push(`BT 1 0 0 1 ${MARGIN} ${num(this.y)} Tm ${pdfText(value, font, size)} ET`);
    this.y -= gap;
  }

  rule(gap = 8, answerLine = false) {
    this.ensure(gap + 3);
    const y = this.y - 3;
    this.page.commands.push(`0.72 G 0.5 w ${MARGIN} ${num(y)} m ${num(PAGE_WIDTH - MARGIN)} ${num(y)} l S 0 G`);
    this.y -= gap;
    if (answerLine) this.y -= 1;
  }

  ensure(space) {
    if (this.y - Math.min(space, USABLE_HEIGHT) < MARGIN + 24) this.newPage();
  }

  toBlob() {
    this.pages.forEach((page, index) => {
      const pageNumber = index + 1;
      page.commands.push(`BT /F1 8 Tf 1 0 0 1 ${num(PAGE_WIDTH - MARGIN - 48)} 24 Tm ${pdfHex(`Page ${pageNumber} of ${this.pages.length}`)} Tj ET`);
    });
    return serializePdf(this.pages, this.images);
  }
}

function htmlToText(markup) {
  if (typeof document === 'undefined') return htmlToTextWithoutDom(markup);
  const template = document.createElement('template');
  template.innerHTML = String(markup || '');
  for (const fraction of [...template.content.querySelectorAll('.frac')].reverse()) {
    const numerator = fraction.querySelector(':scope > .frac__n');
    const denominator = fraction.querySelector(':scope > .frac__d');
    if (numerator && denominator) fraction.textContent = `(${numerator.textContent.trim()})/(${denominator.textContent.trim()})`;
  }
  for (const node of template.content.querySelectorAll('sup')) node.textContent = `^(${node.textContent.trim()})`;
  for (const node of template.content.querySelectorAll('sub')) node.textContent = `_(${node.textContent.trim()})`;
  template.content.querySelectorAll('br,p,div,li,tr').forEach((node) => node.append('\n'));
  return cleanText(template.content.textContent);
}

function htmlToTextWithoutDom(markup) {
  return String(markup || '')
    .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, '')
    .replace(/<br\s*\/?\s*>|<\/(?:p|div|li|tr|h[1-6])\s*>/gi, '\n')
    .replace(/<sup\b[^>]*>([\s\S]*?)<\/sup\s*>/gi, '^($1)')
    .replace(/<sub\b[^>]*>([\s\S]*?)<\/sub\s*>/gi, '_($1)')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&').replace(/&lt;/gi, '<').replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"').replace(/&#39;|&apos;/gi, "'");
}

function cleanText(value) {
  return String(value || '').replace(/\u00a0/g, ' ').replace(/[\t ]+/g, ' ').replace(/ *\n */g, '\n').trim();
}

function wrapText(value, width, fontSize) {
  const output = [];
  for (const paragraph of String(value).split('\n')) {
    if (!paragraph.trim()) { output.push(''); continue; }
    let line = '';
    for (const word of paragraph.split(/\s+/)) {
      const candidate = line ? `${line} ${word}` : word;
      if (line && estimateWidth(candidate, fontSize) > width) {
        output.push(line);
        line = word;
      } else line = candidate;
      while (estimateWidth(line, fontSize) > width && line.length > 1) {
        let split = 1;
        while (split < line.length - 1 && estimateWidth(line.slice(0, split + 1), fontSize) <= width) split++;
        output.push(line.slice(0, split));
        line = line.slice(split);
      }
    }
    if (line) output.push(line);
  }
  return output;
}

function estimateWidth(value, size) {
  let units = 0;
  for (const char of value) {
    if ('MWmw@%&'.includes(char)) units += 0.95;
    else if ('ijlI!.,:;| '.includes(char)) units += 0.30;
    else if (/[A-Z]/.test(char)) units += 0.80;
    else units += 0.60;
  }
  return units * size;
}

function wrapCode(value) {
  const width = Math.floor(TEXT_WIDTH / (9 * 0.60));
  return value.replace(/\t/g, '    ').replace(/^\n|\n$/g, '').split('\n').flatMap(line => {
    const rows = [];
    for (let index = 0; index < line.length; index += width) rows.push(line.slice(index, index + width));
    return rows.length ? rows : [''];
  });
}

function pdfText(value, font, size) {
  let current = font;
  let run = '';
  const parts = [];
  const flush = () => {
    if (!run) return;
    const hex = current === SYMBOL_FONT ? bytesHex([...run].map(char => SYMBOLS[char])) : pdfHex(run);
    parts.push(`/${current} ${size} Tf ${hex} Tj`);
    run = '';
  };
  for (const character of String(value)) {
    const next = Object.hasOwn(SYMBOLS, character) ? SYMBOL_FONT : font;
    if (current !== next) {
      flush();
      current = next;
    }
    run += character;
  }
  flush();
  return parts.join(' ');
}

function bytesHex(bytes) {
  return `<${bytes.map(byte => byte.toString(16).padStart(2, '0')).join('')}>`;
}

function pdfHex(value) {
  const bytes = [];
  for (const character of String(value)) {
    for (const mapped of Array.from(toWinAnsi(character))) bytes.push(mapped.codePointAt(0) <= 255 ? mapped.codePointAt(0) : 0x3f);
  }
  return bytesHex(bytes);
}

function toWinAnsi(character) {
  const punctuation = { '€': 0x80, '‚': 0x82, 'ƒ': 0x83, '„': 0x84, '…': 0x85, '†': 0x86, '‡': 0x87, 'ˆ': 0x88, '‰': 0x89, 'Š': 0x8a, '‹': 0x8b, 'Œ': 0x8c, 'Ž': 0x8e, '‘': 0x91, '’': 0x92, '“': 0x93, '”': 0x94, '•': 0x95, '–': 0x96, '—': 0x97, '˜': 0x98, '™': 0x99, 'š': 0x9a, '›': 0x9b, 'œ': 0x9c, 'ž': 0x9e, 'Ÿ': 0x9f };
  if (punctuation[character] != null) return String.fromCodePoint(punctuation[character]);
  if (character === '⇌') return ' <=> ';
  return character;
}

export async function decodePdfImage(blob) {
  if (typeof createImageBitmap === 'function') {
    try { return await createImageBitmap(blob); }
    catch (error) { if (typeof Image !== 'function') throw error; }
  }
  if (typeof Image !== 'function') throw new Error('This browser cannot decode the source crop.');
  const url = URL.createObjectURL(blob);
  try {
    return await new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error('The source crop is corrupt.'));
      image.src = url;
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}

function bitmapCanvas(width, height) {
  if (typeof OffscreenCanvas === 'function') return new OffscreenCanvas(width, height);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

async function canvasJpeg(canvas) {
  const parameters = { type: 'image/jpeg', quality: 0.92 };
  const jpeg = typeof canvas.convertToBlob === 'function'
    ? await canvas.convertToBlob(parameters)
    : await new Promise((resolve, reject) => canvas.toBlob(
      blob => blob ? resolve(blob) : reject(new Error('Could not encode source image')),
      parameters.type, parameters.quality,
    ));
  return new Uint8Array(await jpeg.arrayBuffer());
}

function splitCrop(bitmap, maxRows) {
  const sampleWidth = Math.min(180, bitmap.width);
  const sampleHeight = Math.ceil(bitmap.height * sampleWidth / bitmap.width);
  const sample = bitmapCanvas(sampleWidth, sampleHeight);
  const context = sample.getContext('2d', { willReadFrequently: true });
  context.fillStyle = '#fff';
  context.fillRect(0, 0, sampleWidth, sampleHeight);
  context.drawImage(bitmap, 0, 0, sampleWidth, sampleHeight);
  const pixels = context.getImageData(0, 0, sampleWidth, sampleHeight).data;
  const scale = sampleHeight / bitmap.height;
  const margin = Math.floor(sampleWidth * 0.06);
  const inkAt = y => {
    let ink = 0;
    for (let x = margin; x < sampleWidth - margin; x++) {
      const index = (y * sampleWidth + x) * 4;
      if (pixels[index] + pixels[index + 1] + pixels[index + 2] < 660) ink++;
    }
    return ink;
  };

  const slices = [];
  let top = 0;
  while (top + maxRows < bitmap.height) {
    const target = Math.floor((top + maxRows) * scale);
    const earliest = Math.floor(target - maxRows * scale * 0.25);
    let best = target;
    let bestInk = Infinity;
    for (let row = target; row >= earliest; row--) {
      const localInk = inkAt(row - 1) + inkAt(row) + inkAt(row + 1);
      if (localInk < bestInk) { best = row; bestInk = localInk; }
      if (bestInk < sampleWidth * 0.04) break;
    }
    const boundary = Math.max(top + 1, Math.floor(best / scale));
    slices.push({ top, rows: boundary - top });
    // Retain a few overlapping rows if the source has no clean horizontal gap.
    const overlap = bestInk >= sampleWidth * 0.04 ? Math.min(boundary - top - 1, Math.floor(maxRows * 0.03)) : 0;
    top = boundary - overlap;
  }
  slices.push({ top, rows: bitmap.height - top });
  return slices;
}

async function prepareImage(data, mimeType) {
  const blob = data instanceof Blob ? data : new Blob([data], { type: mimeType || 'image/webp' });
  const bitmap = await decodePdfImage(blob);
  const maxHeight = USABLE_HEIGHT - 100;
  try {
    let scale = TEXT_WIDTH / bitmap.width;
    const cuts = bitmap.height * scale > maxHeight / 0.82
      ? splitCrop(bitmap, Math.floor(maxHeight / scale))
      : [{ top: 0, rows: bitmap.height }];
    if (cuts.length === 1) scale = Math.min(scale, maxHeight / bitmap.height);

    const prepared = [];
    for (const { top, rows } of cuts) {
      const canvas = bitmapCanvas(bitmap.width, rows);
      const context = canvas.getContext('2d', { alpha: false });
      context.fillStyle = '#fff';
      context.fillRect(0, 0, bitmap.width, rows);
      context.drawImage(bitmap, 0, top, bitmap.width, rows, 0, 0, bitmap.width, rows);
      const bytes = await canvasJpeg(canvas);
      prepared.push({ bytes, width: bitmap.width * scale, height: rows * scale, originalWidth: bitmap.width, originalHeight: rows });
    }
    return prepared;
  } finally {
    bitmap.close?.();
  }
}

function serializePdf(pages, images) {
  const objects = [null, '<< /Type /Catalog /Pages 2 0 R >>', null,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Symbol >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Courier /Encoding /WinAnsiEncoding >>'];
  const imageIds = images.map((image) => {
    const id = objects.length;
    objects.push(binaryStream(`/Type /XObject /Subtype /Image /Width ${image.width} /Height ${image.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode`, image.bytes));
    return id;
  });
  const pageIds = [];
  for (const page of pages) {
    const pageId = objects.length;
    const streamId = pageId + 1;
    pageIds.push(pageId);
    const resources = [...page.images].map((imageId) => `/Im${imageId} ${imageIds[imageId - 1]} 0 R`).join(' ');
    const annotations = page.links.map((_, index) => `${streamId + 1 + index} 0 R`).join(' ');
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] /Resources << /Font << /F1 3 0 R /F2 4 0 R /F3 5 0 R /F4 6 0 R >> /XObject << ${resources} >> >> /Contents ${streamId} 0 R${annotations ? ` /Annots [${annotations}]` : ''} >>`);
    objects.push(asciiStream(page.commands.join('\n')));
    for (const { rect, url } of page.links) {
      objects.push(`<< /Type /Annot /Subtype /Link /Rect [${rect.join(' ')}] /Border [0 0 0] /A << /S /URI /URI ${pdfHex(url)} >> >>`);
    }
  }
  objects[2] = `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pageIds.length} >>`;
  return encodePdf(objects);
}

function binaryStream(dictionary, bytes) {
  return { binary: bytes, dictionary };
}

function asciiStream(value) {
  return { binary: new TextEncoder().encode(value), dictionary: '' };
}

function encodePdf(objects) {
  const chunks = [new TextEncoder().encode('%PDF-1.4\n%âãÏÓ\n')];
  const offsets = [0];
  let offset = chunks[0].length;
  for (let id = 1; id < objects.length; id += 1) {
    offsets[id] = offset;
    const object = objects[id];
    const start = new TextEncoder().encode(`${id} 0 obj\n`);
    const body = typeof object === 'string' ? new TextEncoder().encode(object) : object.binary;
    const prefix = typeof object === 'string' ? new Uint8Array() : new TextEncoder().encode(`<< ${object.dictionary} /Length ${body.length} >>\nstream\n`);
    const suffix = typeof object === 'string' ? new Uint8Array() : new TextEncoder().encode('\nendstream');
    const end = new TextEncoder().encode('\nendobj\n');
    chunks.push(start, prefix, body, suffix, end);
    offset += start.length + prefix.length + body.length + suffix.length + end.length;
  }
  const xrefOffset = offset;
  let xref = `xref\n0 ${objects.length}\n0000000000 65535 f \n`;
  for (let id = 1; id < objects.length; id += 1) xref += `${String(offsets[id]).padStart(10, '0')} 00000 n \n`;
  xref += `trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  chunks.push(new TextEncoder().encode(xref));
  return new Blob(chunks, { type: 'application/pdf' });
}

function num(value) { return Number(value.toFixed(2)); }

function checkAbort(signal) {
  if (!signal?.aborted) return;
  if (typeof DOMException === 'function') throw new DOMException('PDF export cancelled', 'AbortError');
  const error = new Error('PDF export cancelled');
  error.name = 'AbortError';
  throw error;
}
