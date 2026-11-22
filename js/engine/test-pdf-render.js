// Small browser-only PDF writer for custom test exports. Text remains selectable.
// It writes standard PDF 1.4 and embeds source images as JPEG XObjects.

const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const MARGIN = 48;
const TEXT_WIDTH = PAGE_WIDTH - MARGIN * 2;
const FONT = 'F1';
const BOLD_FONT = 'F2';

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
    this.newPage();
  }

  newPage() {
    this.page = { commands: [], images: [] };
    this.pages.push(this.page);
    this.y = PAGE_HEIGHT - MARGIN;
  }

  async addCover() {
    const title = cleanText(this.options.title || 'Custom test');
    this.text(title, 19, true, 25);
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
      const firstContent = blocks.find((block) => block.type !== 'rule' && block.type !== 'answer');
      let preparedFirstImage = null;
      let firstContentSpace = 35;
      if (firstContent?.type === 'image') {
        preparedFirstImage = await prepareImage(firstContent.data);
        firstContentSpace = Math.min(PAGE_HEIGHT - MARGIN * 2 - 35, preparedFirstImage.height) + (firstContent.alt ? 11 : 0);
      }
      const headingLines = wrapText(heading || group.heading || (role === 'scheme' ? 'Mark scheme' : 'Question'), TEXT_WIDTH, 12);
      this.ensure(headingLines.length * 16 + 16 + firstContentSpace);
      for (const line of headingLines) this.text(line, 12, true, 16);
      if (group.marks != null) this.text(`${group.marks} ${Number(group.marks) === 1 ? 'mark' : 'marks'}`, 9, false, 12);
      const explicitAnswerAreas = blocks.some((block) => block.type === 'answer');
      for (const block of blocks) {
        if (block.type === 'rule') {
          this.rule(8);
        } else if (block.type === 'answer') {
          if (role === 'questions' && !this.compact) this.answerSpace(block.marks);
        } else if (block.type === 'image') {
          checkAbort(controls.signal);
          await this.image(block, block === firstContent ? preparedFirstImage : null);
          checkAbort(controls.signal);
        } else {
          const value = block.type === 'html' ? htmlToText(block.html) : cleanText(block.text || '');
          for (const line of wrapText(value, TEXT_WIDTH, 10)) {
            this.ensure(13);
            this.text(line, 10, false, 13);
          }
          if (block.caption) this.text(block.caption, 8, false, 11);
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

  async image(block, prepared = null) {
    const { bytes, width, height, originalWidth, originalHeight } = prepared || await prepareImage(block.data);
    if (block.alt) {
      this.ensure(13);
      this.text(block.alt, 8, false, 11);
    }
    if (this.y - height < MARGIN + 25 && this.y < PAGE_HEIGHT - MARGIN - 35) this.newPage();
    const scaledWidth = width;
    const scaledHeight = height;
    const imageId = this.images.length + 1;
    this.images.push({ bytes, width: originalWidth, height: originalHeight });
    this.page.images.push(imageId);
    this.page.commands.push(`q ${num(scaledWidth)} 0 0 ${num(scaledHeight)} ${MARGIN} ${num(this.y - scaledHeight)} cm /Im${imageId} Do Q`);
    this.y -= scaledHeight + 10;
  }

  text(value, size = 10, bold = false, gap = 13) {
    this.ensure(gap);
    const font = bold ? BOLD_FONT : FONT;
    this.page.commands.push(`BT /${font} ${size} Tf 1 0 0 1 ${MARGIN} ${num(this.y)} Tm ${pdfHex(value)} Tj ET`);
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
    if (this.y - space < MARGIN + 24) this.newPage();
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
        let split = Math.floor(width / (fontSize * 0.52));
        split = Math.max(1, Math.min(split, line.length - 1));
        output.push(line.slice(0, split));
        line = line.slice(split);
      }
    }
    if (line) output.push(line);
  }
  return output;
}

function estimateWidth(value, size) {
  return value.length * size * 0.52;
}

function pdfHex(value) {
  const bytes = [];
  for (const character of String(value)) {
    for (const mapped of Array.from(toWinAnsi(character))) bytes.push(mapped.codePointAt(0) <= 255 ? mapped.codePointAt(0) : 0x3f);
  }
  return `<${bytes.map((byte) => byte.toString(16).padStart(2, '0')).join('')}>`;
}

function toWinAnsi(character) {
  const punctuation = { '€': 0x80, '‚': 0x82, 'ƒ': 0x83, '„': 0x84, '…': 0x85, '†': 0x86, '‡': 0x87, 'ˆ': 0x88, '‰': 0x89, 'Š': 0x8a, '‹': 0x8b, 'Œ': 0x8c, 'Ž': 0x8e, '‘': 0x91, '’': 0x92, '“': 0x93, '”': 0x94, '•': 0x95, '–': 0x96, '—': 0x97, '˜': 0x98, '™': 0x99, 'š': 0x9a, '›': 0x9b, 'œ': 0x9c, 'ž': 0x9e, 'Ÿ': 0x9f };
  if (punctuation[character] != null) return String.fromCodePoint(punctuation[character]);
  const replacements = { '−': '-', '≤': '<=', '≥': '>=', '≠': '!=', '≈': '~=', '√': 'sqrt', 'π': 'pi', 'θ': 'theta', 'α': 'alpha', 'β': 'beta', 'γ': 'gamma', 'λ': 'lambda', 'μ': 'mu', 'σ': 'sigma', 'Δ': 'Delta', 'Σ': 'Sigma', '∞': 'infinity', '∴': 'therefore', '∠': 'angle', '∝': 'proportional to', '′': "'", '″': '"' };
  return replacements[character] || character;
}

async function jpegBytes(data) {
  if (data instanceof Uint8Array && data[0] === 0xff && data[1] === 0xd8) return data;
  const blob = data instanceof Blob ? data : new Blob([data], { type: 'image/webp' });
  const bitmap = await createImageBitmap(blob);
  const useOffscreenCanvas = typeof OffscreenCanvas === 'function';
  const canvas = useOffscreenCanvas
    ? new OffscreenCanvas(bitmap.width, bitmap.height)
    : document.createElement('canvas');
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  canvas.getContext('2d', { alpha: false }).drawImage(bitmap, 0, 0);
  bitmap.close();
  const jpeg = useOffscreenCanvas
    ? await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.92 })
    : await new Promise((resolve, reject) => canvas.toBlob((result) => result ? resolve(result) : reject(new Error('Could not encode source image')), 'image/jpeg', 0.92));
  return new Uint8Array(await jpeg.arrayBuffer());
}

async function prepareImage(data) {
  const bytes = await jpegBytes(data);
  const dimensions = await imageDimensions(bytes);
  const scale = Math.min(1, TEXT_WIDTH / dimensions.width, (PAGE_HEIGHT - MARGIN * 2 - 35) / dimensions.height);
  return { bytes, width: dimensions.width * scale, height: dimensions.height * scale, originalWidth: dimensions.width, originalHeight: dimensions.height };
}

async function imageDimensions(bytes) {
  const blob = new Blob([bytes], { type: 'image/jpeg' });
  const bitmap = await createImageBitmap(blob);
  const dimensions = { width: bitmap.width, height: bitmap.height };
  bitmap.close();
  return dimensions;
}

function serializePdf(pages, images) {
  const objects = [null, '<< /Type /Catalog /Pages 2 0 R >>', null,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>'];
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
    const resources = page.images.map((imageId) => `/Im${imageId} ${imageIds[imageId - 1]} 0 R`).join(' ');
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> /XObject << ${resources} >> >> /Contents ${streamId} 0 R >>`);
    objects.push(asciiStream(page.commands.join('\n')));
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
