// Small browser-only PDF writer for custom test exports. Text remains selectable.
// It writes standard PDF 1.4, embeds source images as JPEG XObjects and draws the PPP logo
// as vector artwork. Layout: a cover block (brand, title, name/date/score boxes and
// instructions), then each question with a numbered badge, its source as small tags, the
// question material and ruled answer lines sized by its marks. Every page carries the logo
// in its footer; pages after the first repeat the test title in a running header.

import { PPP_PATH, PPP_VIEWBOX } from '../core/brand-mark.js';

const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const MARGIN = 50;
const TEXT_WIDTH = PAGE_WIDTH - MARGIN * 2;
const FIRST_TOP = PAGE_HEIGHT - 46;
const PAGE_TOP = PAGE_HEIGHT - 70; // below the running header
const CONTENT_BOTTOM = 66; // above the footer
const USABLE_HEIGHT = PAGE_TOP - CONTENT_BOTTOM;
const ANSWER_LINE_GAP = 23; // about 8 mm, like an exam paper's ruled lines
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

// The site's palette (css/base.css): warm ink on paper, with a soft wash for panels.
const INK = [0.165, 0.153, 0.137];
const MUTED = [0.42, 0.40, 0.37];
const SOFT = [0.58, 0.56, 0.52];
const WASH = [0.953, 0.933, 0.894];
const EDGE = [0.80, 0.78, 0.74];
const LINE = [0.74, 0.74, 0.74];
const LINK = [0.05, 0.28, 0.55];
const WHITE = [1, 1, 1];

/** Ruled answer lines for a question worth `marks` (2 for 1 mark, 4 for 2, 5 for 3, 7 for 4…). */
export function answerLineCount(marks) {
  const value = Number(marks);
  if (!Number.isFinite(value) || value <= 0) return 3;
  return Math.max(2, Math.min(45, Math.ceil(value * 1.6)));
}

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
  const doc = new PdfLayout(options, mode, [...questionGroups, ...schemeGroups]);
  await doc.addCover(questionGroups.length);
  await doc.addGroups(questionGroups, mode === 'scheme' ? 'scheme' : 'questions', controls);
  if (mode === 'combined' && schemeGroups.length) {
    checkAbort(controls.signal);
    doc.newPage('Mark scheme');
    doc.sectionHeading('Mark scheme');
    await doc.addGroups(schemeGroups, 'scheme', controls);
  }
  checkAbort(controls.signal);
  return doc.toBlob();
}

const rgb = (color, stroke = false) => `${color.map(num).join(' ')} ${stroke ? 'RG' : 'rg'}`;
const splitReference = (value) => String(value || '').split(' · ').map(piece => piece.trim()).filter(Boolean);

/** Reference pieces shared by every question (usually the board and specification code). */
function commonPrefix(groups) {
  const lists = groups.map(group => splitReference(group.sourceReference)).filter(list => list.length);
  if (!lists.length) return [];
  const prefix = [];
  for (let index = 0; index < lists[0].length - 1; index += 1) {
    const piece = lists[0][index];
    if (lists.every(list => list.length - 1 > index && list[index] === piece)) prefix.push(piece);
    else break;
  }
  return prefix;
}

class PdfLayout {
  constructor(options, mode, allGroups = []) {
    this.options = options;
    this.mode = mode;
    this.compact = Boolean(options.compact);
    this.pages = [];
    this.images = [];
    this.preparedImages = new WeakMap();
    this.prefix = commonPrefix(allGroups);
    this.newPage(mode === 'scheme' ? 'Mark scheme' : 'Question paper');
  }

  newPage(label = this.page?.label) {
    this.page = { commands: [], images: new Set(), links: [], label };
    this.pages.push(this.page);
    this.y = this.pages.length === 1 ? FIRST_TOP : PAGE_TOP;
  }

  // ── drawing primitives (PDF space: origin bottom left) ──

  draw(command) { this.page.commands.push(command); }

  textAt(value, x, baseline, { size = 10, bold = false, color = INK, font = bold ? BOLD_FONT : FONT } = {}) {
    if (!String(value)) return;
    this.draw(`${rgb(color)} BT 1 0 0 1 ${num(x)} ${num(baseline)} Tm ${pdfText(value, font, size)} ET`);
  }

  roundedRect(x, y, width, height, radius, { fill = null, stroke = null, lineWidth = 0.8 } = {}) {
    const r = Math.max(0, Math.min(radius, width / 2, height / 2));
    const k = r * 0.5523;
    const right = x + width;
    const top = y + height;
    const path = [
      `${num(x + r)} ${num(y)} m`, `${num(right - r)} ${num(y)} l`,
      `${num(right - r + k)} ${num(y)} ${num(right)} ${num(y + r - k)} ${num(right)} ${num(y + r)} c`,
      `${num(right)} ${num(top - r)} l`,
      `${num(right)} ${num(top - r + k)} ${num(right - r + k)} ${num(top)} ${num(right - r)} ${num(top)} c`,
      `${num(x + r)} ${num(top)} l`,
      `${num(x + r - k)} ${num(top)} ${num(x)} ${num(top - r + k)} ${num(x)} ${num(top - r)} c`,
      `${num(x)} ${num(y + r)} l`,
      `${num(x)} ${num(y + r - k)} ${num(x + r - k)} ${num(y)} ${num(x + r)} ${num(y)} c h`,
    ].join(' ');
    const paint = fill && stroke ? 'B' : fill ? 'f' : 'S';
    this.draw(`q ${fill ? rgb(fill) : ''} ${stroke ? `${rgb(stroke, true)} ${num(lineWidth)} w` : ''} ${path} ${paint} Q`);
  }

  lineAt(x1, y1, x2, y2, { color = EDGE, width = 0.6, dash = null } = {}) {
    this.draw(`q ${rgb(color, true)} ${num(width)} w ${dash ? `[${dash.join(' ')}] 0 d` : ''} ${num(x1)} ${num(y1)} m ${num(x2)} ${num(y2)} l S Q`);
  }

  /** The PPP mark, `height` points tall, with its bottom left corner at (x, y). */
  logo(x, y, height, color = INK) {
    const [, , viewWidth, viewHeight] = PPP_VIEWBOX.split(/\s+/).map(Number);
    const scale = height / viewHeight;
    this.draw(`q ${rgb(color)} ${num(scale)} 0 0 ${num(-scale)} ${num(x)} ${num(y + height)} cm ${LOGO_OPS} f* Q`);
    return viewWidth * scale;
  }

  // ── flowing content (this.y is the top of the free space) ──

  ensure(space) {
    if (this.y - Math.min(space, USABLE_HEIGHT) < CONTENT_BOTTOM) this.newPage();
  }

  /** Flows wrapped lines; each line is `lead` points tall. */
  lines(rows, { size = 10, bold = false, color = INK, lead = size * 1.38, font, x = MARGIN, keep = 1 } = {}) {
    rows.forEach((row, index) => {
      this.ensure(index === 0 ? lead * Math.min(keep, rows.length) : lead);
      this.textAt(row, x, this.y - size * 0.86, { size, bold, color, font });
      this.y -= lead;
    });
  }

  async addCover(questionCount) {
    const scheme = this.mode === 'scheme';
    const top = this.y;
    // Brand lockup and the document type.
    const markWidth = this.logo(MARGIN, top - 26, 26);
    this.textAt('Pure Past Papers', MARGIN + markWidth + 8, top - 12, { size: 12.5, bold: true });
    this.textAt('purepastpapers.com', MARGIN + markWidth + 8, top - 23.5, { size: 8, color: MUTED });
    const label = (scheme ? 'MARK SCHEME' : this.mode === 'combined' ? 'QUESTION PAPER AND MARK SCHEME' : 'QUESTION PAPER');
    const labelWidth = textWidth(label, 7.5, true) + 18;
    this.roundedRect(PAGE_WIDTH - MARGIN - labelWidth, top - 21, labelWidth, 17, 8.5, { fill: INK });
    this.textAt(label, PAGE_WIDTH - MARGIN - labelWidth + 9, top - 15.2, { size: 7.5, bold: true, color: WHITE });
    this.y = top - 38;
    this.lineAt(MARGIN, this.y, PAGE_WIDTH - MARGIN, this.y, { color: INK, width: 1.4 });
    this.y -= 22;

    const title = cleanText(this.options.title || 'Practice test');
    this.lines(wrapText(title, TEXT_WIDTH, 22, true), { size: 22, bold: true, lead: 27 });
    const subtitle = [this.prefix.join(' · '), plural(questionCount, 'question'), this.options.totalMarks != null ? plural(this.options.totalMarks, 'mark') : '']
      .filter(Boolean).join('  ·  ');
    this.y -= 2;
    this.lines(wrapText(subtitle, TEXT_WIDTH, 10.5), { size: 10.5, color: MUTED, lead: 15 });
    this.y -= 14;

    // Name, date and score boxes (the question paper), or the totals (the mark scheme).
    const boxHeight = 40;
    const boxes = scheme
      ? [{ label: 'Total marks', value: this.options.totalMarks != null ? String(this.options.totalMarks) : '–', share: 0.5 },
        { label: 'Questions', value: String(questionCount), share: 0.5 }]
      : [{ label: 'Name', share: 0.5 }, { label: 'Date', share: 0.22 },
        { label: 'Score', value: this.options.totalMarks != null ? `/ ${this.options.totalMarks}` : '', share: 0.28 }];
    const gap = 10;
    let x = MARGIN;
    const available = TEXT_WIDTH - gap * (boxes.length - 1);
    for (const box of boxes) {
      const width = available * box.share;
      this.roundedRect(x, this.y - boxHeight, width, boxHeight, 6, { stroke: EDGE, lineWidth: 0.8 });
      this.textAt(box.label.toUpperCase(), x + 10, this.y - 13, { size: 6.8, bold: true, color: MUTED });
      if (box.value) {
        const size = scheme ? 15 : 13;
        this.textAt(box.value, x + width - 12 - textWidth(box.value, size, true), this.y - 31, { size, bold: true });
      }
      x += width + gap;
    }
    this.y -= boxHeight + 16;

    if (!scheme) {
      const notes = cleanText(this.options.instructions || 'Answer all questions.').split('\n').filter(Boolean);
      notes.push('Write your answers in the spaces provided. Use extra paper if you need more room.');
      notes.push('The marks for each question are shown beside it. Use them as a guide to how much to write.');
      if (this.compact) notes.push('This is a compact copy with no answer lines. Answer on separate paper.');
      const rows = notes.flatMap(note => wrapText(note, TEXT_WIDTH - 40, 9.5).map((row, index) => ({ row, bullet: index === 0 })));
      const height = 30 + rows.length * 13.5 + 10;
      this.roundedRect(MARGIN, this.y - height, TEXT_WIDTH, height, 8, { fill: WASH });
      this.textAt('Instructions', MARGIN + 14, this.y - 19, { size: 10, bold: true });
      let rowTop = this.y - 30;
      for (const { row, bullet } of rows) {
        if (bullet) this.roundedRect(MARGIN + 16, rowTop - 7.6, 3.4, 3.4, 1.7, { fill: INK });
        this.textAt(row, MARGIN + 28, rowTop - 9.5, { size: 9.5 });
        rowTop -= 13.5;
      }
      this.y -= height + 24;
    } else this.y -= 8;
  }

  sectionHeading(label) {
    this.ensure(60);
    this.roundedRect(MARGIN, this.y - 34, TEXT_WIDTH, 34, 8, { fill: INK });
    this.textAt(label, MARGIN + 14, this.y - 22, { size: 14, bold: true, color: WHITE });
    this.y -= 34 + 22;
  }

  /** Tags for a question's source: the kind of material, then where it comes from. */
  groupTags(group, blocks) {
    const tags = [];
    for (const block of blocks) {
      if (block.role === 'meta') tags.push(cleanText(block.text || '').replace(/^Source:\s*/i, ''));
    }
    let pieces = splitReference(group.sourceReference);
    pieces = pieces.slice(Math.min(this.prefix.length, Math.max(0, pieces.length - 1)));
    const multiPart = blocks.filter(block => block.role === 'subheading').length > 1;
    if (multiPart && pieces.length > 1 && /^Q\S/.test(pieces.at(-1))) pieces = pieces.slice(0, -1);
    return [...tags, ...pieces].filter(Boolean);
  }

  tagRowsHeight(tags) {
    return this.layoutTags(tags).length * 19;
  }

  layoutTags(tags) {
    const rows = [[]];
    let x = 0;
    for (const tag of tags) {
      const label = tag.length > 70 ? `${tag.slice(0, 68)}…` : tag;
      const width = textWidth(label, 7.6) + 14;
      if (x && x + width > TEXT_WIDTH) { rows.push([]); x = 0; }
      rows.at(-1).push({ label, width, x });
      x += width + 5;
    }
    return rows.filter(row => row.length);
  }

  drawTags(tags, firstTag) {
    for (const row of this.layoutTags(tags)) {
      for (const tag of row) {
        const primary = tag.label === firstTag;
        this.roundedRect(MARGIN + tag.x, this.y - 15, tag.width, 15, 7.5, primary ? { stroke: INK, lineWidth: 0.7 } : { fill: WASH });
        this.textAt(tag.label, MARGIN + tag.x + 7, this.y - 10.4, { size: 7.6, bold: primary, color: primary ? INK : MUTED });
      }
      this.y -= 19;
    }
  }

  async addGroups(groups, role, controls) {
    for (const [index, group] of groups.entries()) {
      checkAbort(controls.signal);
      controls.onProgress?.({ completed: index, total: groups.length });
      const blocks = group.blocks || [];
      const tags = this.groupTags(group, blocks);
      const firstContent = blocks.findIndex(block => !['meta', 'subheading', 'notice'].includes(block.role) && !['rule', 'answer', 'link'].includes(block.type));
      const leading = firstContent < 0 ? [] : blocks.slice(0, firstContent + 1).filter(block => block.role !== 'meta');
      let space = 34 + this.tagRowsHeight(tags) + 8;
      for (const [position, block] of leading.entries()) space += await this.blockHeight(block, position === leading.length - 1);
      this.ensure(space);

      // Number badge, title and marks.
      const top = this.y;
      const number = String(group.localNumber ?? index + 1);
      const badge = Math.max(22, textWidth(number, 11, true) + 12);
      this.roundedRect(MARGIN, top - 22, badge, 22, 5, { fill: INK });
      this.textAt(number, MARGIN + (badge - textWidth(number, 11, true)) / 2, top - 15.2, { size: 11, bold: true, color: WHITE });
      const heading = group.localNumber != null ? `Question ${group.localNumber}` : group.heading || (role === 'scheme' ? 'Mark scheme' : 'Question');
      this.textAt(role === 'scheme' ? `${heading} · mark scheme` : heading, MARGIN + badge + 9, top - 15.6, { size: 12.5, bold: true });
      if (group.marks != null) {
        const marks = plural(group.marks, 'mark');
        const width = textWidth(marks, 8.5, true) + 16;
        this.roundedRect(PAGE_WIDTH - MARGIN - width, top - 19, width, 16, 8, { stroke: INK, lineWidth: 0.8 });
        this.textAt(marks, PAGE_WIDTH - MARGIN - width + 8, top - 13.8, { size: 8.5, bold: true });
      }
      this.y = top - 30;
      this.drawTags(tags, tags[0]);
      this.y -= 6;

      const explicitAnswerAreas = blocks.some((block) => block.type === 'answer');
      const answerBlocks = blocks.filter(block => block.type === 'answer').length;
      for (const [position, block] of blocks.entries()) {
        checkAbort(controls.signal);
        if (block.role === 'meta') continue;
        if (block.role === 'subheading') {
          const nextContent = blocks[position + 1];
          this.ensure(await this.blockHeight(block) + (nextContent ? await this.blockHeight(nextContent, true) : 0));
          this.partHeading(block);
        } else if (block.type === 'rule') {
          this.y -= 4;
          this.lineAt(MARGIN, this.y, PAGE_WIDTH - MARGIN, this.y);
          this.y -= 8;
        } else if (block.type === 'answer') {
          if (role === 'questions' && !this.compact) this.answerLines(block.marks, answerBlocks > 1);
        } else if (block.type === 'image') {
          await this.image(block);
        } else if (block.type === 'link') {
          this.link(block);
        } else if (block.role === 'code') {
          this.lines(wrapCode(block.text), { size: 9, lead: 12, font: CODE_FONT });
          this.y -= 4;
        } else if (block.role === 'notice') {
          this.notice(this.blockLines(block, 8.8));
        } else {
          this.lines(this.blockLines(block), { size: 10, lead: 13.8 });
          const captions = wrapText(block.caption || '', TEXT_WIDTH, 8).filter(Boolean);
          if (captions.length) this.lines(captions, { size: 8, color: MUTED, lead: 11 });
          this.y -= 4;
        }
      }
      if (role === 'questions' && !this.compact && !explicitAnswerAreas) this.answerLines(group.marks, false);
      if (role === 'questions' && answerBlocks > 1 && group.marks != null) {
        this.ensure(16);
        const total = `Total for Question ${number}: ${plural(group.marks, 'mark')}`;
        this.textAt(total, PAGE_WIDTH - MARGIN - textWidth(total, 9, true), this.y - 9, { size: 9, bold: true });
        this.y -= 16;
      }
      // A light divider between questions, unless the page is about to end.
      this.y -= 10;
      if (index < groups.length - 1 && this.y - 40 > CONTENT_BOTTOM) {
        this.lineAt(MARGIN, this.y, PAGE_WIDTH - MARGIN, this.y, { color: EDGE, width: 0.5, dash: [2, 3] });
      }
      this.y -= 22;
      controls.onProgress?.({ completed: index + 1, total: groups.length });
    }
  }

  partHeading(block) {
    const label = cleanText(block.text || '');
    const marks = /(\d+)\s+marks?\s*$/.exec(block.caption || '');
    this.y -= 4;
    this.ensure(18);
    this.textAt(label, MARGIN, this.y - 10, { size: 10.5, bold: true });
    if (marks) this.textAt(plural(Number(marks[1]), 'mark'), MARGIN + textWidth(label, 10.5, true) + 8, this.y - 10, { size: 8.5, color: MUTED });
    this.y -= 18;
  }

  notice(rows) {
    const height = rows.length * 12 + 10;
    this.ensure(height);
    this.roundedRect(MARGIN, this.y - height, TEXT_WIDTH, height, 5, { fill: WASH });
    this.lineAt(MARGIN + 0.5, this.y - height + 4, MARGIN + 0.5, this.y - 4, { color: SOFT, width: 2 });
    let rowTop = this.y - 5;
    for (const row of rows) {
      this.textAt(row, MARGIN + 10, rowTop - 8.6, { size: 8.8, color: MUTED });
      rowTop -= 12;
    }
    this.y -= height + 8;
  }

  /** Ruled lines for the answer, sized by marks, ending with the marks in brackets. */
  answerLines(marks, perPart) {
    const count = answerLineCount(marks);
    this.y -= 6;
    // Keep a short answer's lines together; long answers may run on to the next page.
    this.ensure(ANSWER_LINE_GAP * Math.min(8, count) + 16);
    for (let index = 0; index < count; index += 1) {
      this.ensure(ANSWER_LINE_GAP + (index === count - 1 ? 16 : 0));
      this.y -= ANSWER_LINE_GAP;
      this.lineAt(MARGIN, this.y, PAGE_WIDTH - MARGIN, this.y, { color: LINE, width: 0.6 });
    }
    if (Number(marks) > 0) {
      const label = `(${plural(Number(marks), 'mark')})`;
      this.textAt(label, PAGE_WIDTH - MARGIN - textWidth(label, 8.5, true), this.y - 12, { size: 8.5, bold: true, color: perPart ? MUTED : INK });
      this.y -= 16;
    } else this.y -= 6;
  }

  blockLines(block, size = 10) {
    const text = block.type === 'html' ? htmlToText(block.html) : cleanText(block.text || '');
    return wrapText(text, block.role === 'notice' ? TEXT_WIDTH - 20 : TEXT_WIDTH, size);
  }

  async blockHeight(block, firstLineOnly = false) {
    if (block.type === 'image') {
      const [first] = await this.preparedImage(block);
      return first.height + this.imageCaption(block).length * 10.5 + 12;
    }
    if (block.role === 'subheading') return 22;
    if (block.role === 'notice') return this.blockLines(block, 8.8).length * 12 + 18;
    const lines = block.role === 'code' ? wrapCode(block.text) : this.blockLines(block);
    return (firstLineOnly ? Math.min(1, lines.length) : lines.length) * 13.8
      + wrapText(block.caption || '', TEXT_WIDTH, 8).filter(Boolean).length * 11;
  }

  imageCaption(block) {
    return block.alt ? wrapText(block.alt, TEXT_WIDTH, 7.6) : [];
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
        ? wrapText(`${block.alt || 'Question'} (continued)`, TEXT_WIDTH, 7.6)
        : this.imageCaption(block);
      this.ensure(image.height + captions.length * 10.5 + 12);
      if (captions.length) {
        this.lines(captions, { size: 7.6, color: SOFT, lead: 10.5 });
        this.y -= 2;
      }
      if (!image.id) {
        image.id = this.images.length + 1;
        this.images.push({ bytes: image.bytes, width: image.originalWidth, height: image.originalHeight });
      }
      this.page.images.add(image.id);
      this.draw(`q ${num(image.width)} 0 0 ${num(image.height)} ${MARGIN} ${num(this.y - image.height)} cm /Im${image.id} Do Q`);
      this.y -= image.height + 10;
    }
  }

  link({ text, url }) {
    let parsed;
    try { parsed = new URL(url); } catch { return; }
    if (parsed.protocol !== 'https:' || parsed.username || parsed.password) return;
    for (const line of wrapText(cleanText(text), TEXT_WIDTH - 12, 9)) {
      this.ensure(14);
      const baseline = this.y - 9.5;
      const width = Math.min(TEXT_WIDTH, textWidth(line, 9));
      this.page.links.push({ rect: [MARGIN, num(baseline - 3), num(MARGIN + width + 12), num(baseline + 9)], url: parsed.href });
      this.textAt('›', MARGIN, baseline, { size: 9, bold: true, color: LINK });
      this.textAt(line, MARGIN + 10, baseline, { size: 9, color: LINK });
      this.lineAt(MARGIN + 10, baseline - 1.6, MARGIN + 10 + width, baseline - 1.6, { color: LINK, width: 0.4 });
      this.y -= 14;
    }
    this.y -= 2;
  }

  toBlob() {
    const title = cleanText(this.options.title || 'Practice test');
    this.pages.forEach((page, index) => {
      this.page = page;
      const pageNumber = index + 1;
      // Footer: the logo and name on the left, the page number on the right.
      this.lineAt(MARGIN, 48, PAGE_WIDTH - MARGIN, 48, { color: EDGE, width: 0.6 });
      const markWidth = this.logo(MARGIN, 26, 13);
      this.textAt('Pure Past Papers', MARGIN + markWidth + 6, 29.5, { size: 8, bold: true });
      this.textAt('purepastpapers.com', MARGIN + markWidth + 6 + textWidth('Pure Past Papers', 8, true) + 8, 29.5, { size: 7.5, color: MUTED });
      const pageLabel = `Page ${pageNumber} of ${this.pages.length}`;
      this.textAt(pageLabel, PAGE_WIDTH - MARGIN - textWidth(pageLabel, 8), 29.5, { size: 8, color: MUTED });
      if (index > 0) {
        const right = page.label || '';
        const room = TEXT_WIDTH - textWidth(right, 8) - 24;
        let running = title;
        while (running.length > 4 && textWidth(running, 8, true) > room) running = `${running.slice(0, -2).trimEnd()}…`;
        this.textAt(running, MARGIN, PAGE_HEIGHT - 42, { size: 8, bold: true, color: MUTED });
        this.textAt(right, PAGE_WIDTH - MARGIN - textWidth(right, 8), PAGE_HEIGHT - 42, { size: 8, color: MUTED });
        this.lineAt(MARGIN, PAGE_HEIGHT - 50, PAGE_WIDTH - MARGIN, PAGE_HEIGHT - 50, { color: EDGE, width: 0.6 });
      }
    });
    return serializePdf(this.pages, this.images);
  }
}

// The logo path in PDF operators, in its own (y-down) coordinates.
const LOGO_OPS = (() => {
  const tokens = PPP_PATH.match(/[MCLZ]|-?\d*\.?\d+/g) || [];
  const out = [];
  let command = '';
  let values = [];
  const flush = () => {
    if (!values.length) return;
    if (command === 'M') out.push(`${values.join(' ')} m`);
    else if (command === 'L') out.push(`${values.join(' ')} l`);
    else if (command === 'C') out.push(`${values.join(' ')} c`);
    values = [];
  };
  for (const token of tokens) {
    if (/[MCLZ]/.test(token)) {
      flush();
      command = token;
      if (token === 'Z') out.push('h');
    } else {
      values.push(token);
      const need = command === 'C' ? 6 : 2;
      if (values.length === need) flush();
    }
  }
  return out.join(' ');
})();

function plural(count, word) {
  return `${count} ${Number(count) === 1 ? word : `${word}s`}`;
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

function wrapText(value, width, fontSize, bold = false) {
  const output = [];
  for (const paragraph of String(value).split('\n')) {
    if (!paragraph.trim()) { output.push(''); continue; }
    let line = '';
    for (const word of paragraph.split(/\s+/)) {
      const candidate = line ? `${line} ${word}` : word;
      if (line && estimateWidth(candidate, fontSize, bold) > width) {
        output.push(line);
        line = word;
      } else line = candidate;
      while (estimateWidth(line, fontSize, bold) > width && line.length > 1) {
        let split = 1;
        while (split < line.length - 1 && estimateWidth(line.slice(0, split + 1), fontSize, bold) <= width) split++;
        output.push(line.slice(0, split));
        line = line.slice(split);
      }
    }
    if (line) output.push(line);
  }
  return output;
}

// Helvetica and Helvetica-Bold advance widths (per 1000 units) for printable ASCII.
const HELVETICA = [278,278,355,556,556,889,667,191,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,278,278,584,584,584,556,1015,667,667,722,722,667,611,778,722,278,500,667,556,833,722,778,667,778,722,667,611,722,667,944,667,667,611,278,278,278,469,556,333,556,556,500,556,556,278,556,556,222,222,500,222,833,556,556,556,556,333,500,278,556,500,722,500,500,500,334,260,334,584];
const HELVETICA_BOLD = [278,333,474,556,556,889,722,238,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,333,333,584,584,584,611,975,722,722,722,722,667,611,778,722,278,556,722,611,833,722,778,667,778,722,667,611,722,667,944,667,667,611,333,278,333,584,556,333,556,611,556,611,556,333,611,611,278,278,556,278,889,611,611,611,611,389,556,333,611,556,778,556,556,500,389,280,389,584];

function textWidth(value, size, bold = false) {
  const table = bold ? HELVETICA_BOLD : HELVETICA;
  let units = 0;
  for (const char of String(value)) {
    const code = char.codePointAt(0);
    units += code >= 32 && code <= 126 ? table[code - 32] : 600;
  }
  return units * size / 1000;
}

function estimateWidth(value, size, bold = false) {
  return textWidth(value, size, bold);
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

/**
 * Whitens the page-border bars that full-page crops carry at their edges (the printed
 * paper's margin box), so questions sit cleanly on the PDF page. Only long, thin dark runs
 * hugging the outer edges are removed; anything inside the crop is left alone.
 */
function cleanCropEdges(canvas) {
  const { width, height } = canvas;
  if (width < 120 || height < 60) return;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  const pixels = context.getImageData(0, 0, width, height).data;
  const dark = (x, y) => {
    const index = (y * width + x) * 4;
    return pixels[index] + pixels[index + 1] + pixels[index + 2] < 600;
  };
  const band = Math.max(4, Math.floor(width * 0.06));
  const columns = [];
  for (const [from, to] of [[0, band], [width - band, width]]) {
    for (let x = from; x < to; x += 1) {
      let run = 0;
      for (let y = 0; y < height; y += 1) if (dark(x, y)) run += 1;
      if (run > height * 0.55) columns.push(x);
    }
  }
  const edgeRows = Math.max(3, Math.floor(height * 0.035));
  const rows = [];
  for (const [from, to] of [[0, edgeRows], [height - edgeRows, height]]) {
    for (let y = from; y < to; y += 1) {
      let run = 0;
      for (let x = 0; x < width; x += 1) if (dark(x, y)) run += 1;
      if (run > width * 0.7) rows.push(y);
    }
  }
  context.fillStyle = '#fff';
  // The very edge of a crop never holds question content, only scan fringes.
  const fringe = Math.max(3, Math.floor(width * 0.012));
  context.fillRect(0, 0, fringe, height);
  context.fillRect(width - fringe, 0, fringe, height);
  for (const x of columns) context.fillRect(Math.max(0, x - 2), 0, 5, height);
  for (const y of rows) context.fillRect(0, Math.max(0, y - 2), width, 5);
}

/**
 * Shortens long empty bands inside a crop: the printed paper's blank working space. The PDF
 * gives every question ruled answer lines instead, so that space only pushes lines apart.
 * Returns the canvas to use (the original when nothing is long enough to shorten).
 */
function collapseBlankBands(canvas) {
  const { width, height } = canvas;
  if (width < 120 || height < 120) return canvas;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  const pixels = context.getImageData(0, 0, width, height).data;
  const limit = Math.max(1, Math.floor(width * 0.002));
  const blank = new Uint8Array(height);
  for (let y = 0; y < height; y += 1) {
    let ink = 0;
    for (let x = 0; x < width && ink <= limit; x += 1) {
      const index = (y * width + x) * 4;
      if (pixels[index] + pixels[index + 1] + pixels[index + 2] < 600) ink += 1;
    }
    blank[y] = ink <= limit ? 1 : 0;
  }
  const longest = Math.round(width * 0.08);
  const keep = Math.round(width * 0.04);
  const segments = [];
  let start = 0;
  let removed = 0;
  for (let y = 0; y <= height; y += 1) {
    if (y < height && blank[y]) continue;
    let runStart = y - 1;
    while (runStart >= start && blank[runStart]) runStart -= 1;
    runStart += 1;
    const run = y - runStart;
    if (run > longest) {
      const cut = run - keep;
      segments.push({ top: start, rows: runStart + Math.floor(keep / 2) - start });
      start = runStart + Math.floor(keep / 2) + cut;
      removed += cut;
    }
  }
  if (!removed) return canvas;
  if (start < height) segments.push({ top: start, rows: height - start });
  const output = bitmapCanvas(width, height - removed);
  const out = output.getContext('2d', { willReadFrequently: true });
  out.fillStyle = '#fff';
  out.fillRect(0, 0, width, height - removed);
  let y = 0;
  for (const { top, rows } of segments) {
    if (rows <= 0) continue;
    out.drawImage(canvas, 0, top, width, rows, 0, y, width, rows);
    y += rows;
  }
  return output;
}

async function prepareImage(data, mimeType) {
  const blob = data instanceof Blob ? data : new Blob([data], { type: mimeType || 'image/webp' });
  const bitmap = await decodePdfImage(blob);
  const maxHeight = USABLE_HEIGHT - 90;
  try {
    const source = bitmapCanvas(bitmap.width, bitmap.height);
    const sourceContext = source.getContext('2d', { willReadFrequently: true });
    sourceContext.fillStyle = '#fff';
    sourceContext.fillRect(0, 0, bitmap.width, bitmap.height);
    sourceContext.drawImage(bitmap, 0, 0);
    cleanCropEdges(source);
    const cleaned = collapseBlankBands(source);
    const fullHeight = cleaned.height;
    // Full-width crops fill the text column; small figures keep roughly their printed size.
    let scale = Math.min(TEXT_WIDTH / bitmap.width, 0.62);
    const cuts = fullHeight * scale > maxHeight / 0.82
      ? splitCrop(cleaned, Math.floor(maxHeight / scale))
      : [{ top: 0, rows: fullHeight }];
    if (cuts.length === 1) scale = Math.min(scale, maxHeight / fullHeight);

    const prepared = [];
    for (const { top, rows } of cuts) {
      const canvas = bitmapCanvas(bitmap.width, rows);
      const context = canvas.getContext('2d', { alpha: false });
      context.fillStyle = '#fff';
      context.fillRect(0, 0, bitmap.width, rows);
      context.drawImage(cleaned, 0, top, bitmap.width, rows, 0, 0, bitmap.width, rows);
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
