import { sanitizeHtml } from '../core/dom.js';
import { invalidateSourceImageBytes, sourceImageBytes } from '../data/source-images.js?v=20261122-pdf2';
import { displayedPartLabel } from './test-snapshot.js?v=20261122-pdf2';
import { decodePdfImage } from './test-pdf-render.js?v=20261122-pdf2';

const PARAGRAPH_TAGS = new Set(['P', 'DIV', 'LI', 'TR', 'CAPTION', 'FIGCAPTION', 'BLOCKQUOTE', 'H3', 'H4', 'H5']);
const SOURCE_LABELS = {real_past_paper: 'Official past paper', ai_past_paper: 'AI past paper', ai_spec_question: 'AI specification question', predicted_paper: 'AI predicted paper'};

/** Resolve immutable snapshot references into the renderer's selectable content blocks. */
export async function prepareTestPdf(snapshot, questions, {kind = 'question', signal, onProgress, compact = false} = {}) {
  if (snapshot?.version !== 1 || !Array.isArray(snapshot.groups)) throw new TypeError('Unsupported test snapshot.');
  if (!['question', 'scheme', 'combined'].includes(kind)) throw new TypeError('Unknown PDF export kind.');
  const missing = [], questionGroups = [], schemeGroups = [];
  const wantQuestions = kind !== 'scheme';
  const wantSchemes = kind !== 'question';
  const work = snapshot.groups.flatMap(group => (group.parts || []).map(part => ({group, part})));
  const precedingIds = new Set();
  const referenceById = new Map(work.map(({group, part}) => [part.id, displayedPartLabel(group.number, part.label)]));
  const seenBooklets = new Set();
  const imagePromises = new Map();
  const assetOptions = { signal, imagePromises };
  const seenSharedSchemes = new Map();
  let completed = 0;
  const progress = (reference) => {
    completed++;
    onProgress?.({ completed, total: work.length, current: reference });
  };
  for (const group of snapshot.groups) {
    checkAbort(signal);
    const parts = group.parts || [];
    const questionBlocks = [];
    const schemeBlocks = [];
    const seenContext = new Set();
    const seenParents = new Set();
    let sourceLabelAdded = false;

    for (const part of parts) {
      checkAbort(signal);
      const partIssueStart = missing.length;
      const localReference = referenceById.get(part.id);
      const partHeading = {
        type: 'text', text: localReference, role: 'subheading',
        caption: `${part.reference} · ${part.maxMarks} ${part.maxMarks === 1 ? 'mark' : 'marks'}`,
      };
      if (wantSchemes && parts.length > 1) schemeBlocks.push(partHeading);
      const item = questions.get(part.id);
      if (!item?.question) {
        missing.push({id: part.id, reference: part.reference, kind: 'question', reason: 'Question content is unavailable in the current bank.'});
        if (wantSchemes) {
          missing.push({id: part.id, reference: part.reference, kind: 'scheme', reason: 'The question record needed to match its mark scheme is unavailable.'});
          schemeBlocks.push({type: 'text', text: `Mark scheme unavailable for ${part.reference}; the matching question record is missing.`, role: 'notice'});
        }
        progress(part.reference);
        continue;
      }
      const {question, paper} = item;
      if (wantQuestions && item.promptRevised) {
        missing.push({id: part.id, reference: part.reference, kind: 'question', reason: 'The saved version of this question or its required context is unavailable.'});
      } else if (wantQuestions) {
        for (const dependencyId of question.depends_on_question_ids || []) {
          if (precedingIds.has(dependencyId)) continue;
          missing.push({id: part.id, reference: part.reference, kind: 'dependency', reason: `Required earlier answer ${dependencyId} is not included in this frozen test.`});
        }
        if (!sourceLabelAdded) {
          const sourceLabel = part.isOfficialSample || question.is_official_sample || paper?.is_official_sample ? 'Official sample assessment'
            : part.isSample || question.is_sample || paper?.is_sample ? 'Demo content · not from an official exam paper'
              : SOURCE_LABELS[part.sourceType] || 'Practice material';
          questionBlocks.push({type: 'text', text: `Source: ${sourceLabel}`, role: 'meta'});
          sourceLabelAdded = true;
        }
        const context = question.context || {};
        if (context.required_stimulus_unavailable) {
          missing.push({ kind: 'question', reference: part.reference, reason: context.required_stimulus_unavailable });
        }
        const parent = question.parent_question_id || `${question.paper_id}:${question.question_number}`;
        const showSharedStem = !seenParents.has(parent) && (context.shared_stem_html || context.stem_image_url);
        seenParents.add(parent);
        if (showSharedStem) await appendSharedStem(questionBlocks, context, part.reference, missing, assetOptions, seenContext);
        await appendContextAsset(questionBlocks, context.booklet_image_url, `Source booklet extract for ${part.reference}`, missing, assetOptions, seenContext);
        if (!showSharedStem || !question.provenance?.source_lead_in_in_stem) {
          await appendContextAsset(questionBlocks, context.lead_in_image_url, `Printed lead-in for ${part.reference}`, missing, assetOptions, seenContext);
        }
        if (!context.shared_stem_html?.includes(context.erratum_image_url)) {
          await appendContextAsset(questionBlocks, context.erratum_image_url, `Official erratum for ${part.reference}`, missing, assetOptions, seenContext);
        }
        for (const intro of context.intros || []) {
          await appendContextAsset(questionBlocks, intro?.image_url, `${intro?.label || 'Printed introduction'} for ${part.reference}`, missing, assetOptions, seenContext);
        }
        for (const figure of context.figures || []) {
          await appendContextAsset(questionBlocks, figure?.image_url, `${figure?.label || 'Required figure'} (${figure?.source?.replaceAll('_', ' ') || 'unscored context'})`, missing, assetOptions, seenContext);
          if (isOfficialUrl(figure?.official_url) && !seenBooklets.has(figure.official_url)) {
            seenBooklets.add(figure.official_url);
            questionBlocks.push({type: 'link', text: `Official source for ${figure.label}`, url: figure.official_url});
          }
        }
        await appendBooklets(questionBlocks, question, paper, part.reference, missing, assetOptions, seenBooklets);
        if (parts.length > 1) questionBlocks.push(partHeading);
        await appendHtml(questionBlocks, question.content?.question_html, `Question ${part.reference}`, missing, assetOptions, 'question');
        if (question.content?.question_image_url) await appendImage(questionBlocks, question.content.question_image_url, '', missing, assetOptions, 'question');
        if (!question.content?.question_html?.trim() && !question.content?.question_image_url) {
          missing.push({id: part.id, reference: part.reference, kind: 'question', reason: 'The question has no printable text or question crop.'});
        }
        if (!compact) questionBlocks.push({type: 'answer', marks: part.maxMarks});
      }
      if (wantSchemes) {
        await appendScheme(schemeBlocks, question, paper, part, localReference, missing, assetOptions, seenSharedSchemes, item.schemeRevised);
      }
      for (const entry of missing.slice(partIssueStart)) {
        entry.id ||= part.id;
        entry.reference ||= part.reference;
      }
      precedingIds.add(part.id);
      precedingIds.add(question.question_id);
      progress(part.reference);
    }
    const marks = parts.reduce((sum, part) => sum + part.maxMarks, 0);
    if (wantQuestions) questionGroups.push({localNumber: group.number, sourceReference: group.reference, marks, blocks: questionBlocks});
    if (wantSchemes) schemeGroups.push({localNumber: group.number, sourceReference: group.reference, marks, blocks: schemeBlocks});
  }
  const title = snapshot.title || 'Practice test';
  const choices = snapshot.choices || [];
  const instructions = [
    choices.length ? 'Answer all questions outside the choice groups and follow each choice rule below.' : 'Answer all questions.',
    ...formatChoices(choices, referenceById),
  ].join('\n');
  for (const entry of missing) {
    const paper = entry.id ? questions.get(entry.id)?.paper : null;
    const sourceUrl = entry.kind === 'scheme'
      ? paper?.full_mark_scheme_pdf_url
      : paper?.full_paper_pdf_url || paper?.official_source_url;
    if (sourceUrl) entry.officialSourceUrl ||= sourceUrl;
  }
  return {
    question: {title, totalMarks: snapshot.totalMarks, instructions, compact, groups: questionGroups},
    scheme: {title, totalMarks: snapshot.totalMarks, groups: schemeGroups},
    combined: {title, totalMarks: snapshot.totalMarks, instructions, compact, questionGroups, schemeGroups},
    missing,
    canExportQuestions: !missing.some(entry => ['question', 'dependency'].includes(entry.kind)),
    canExportScheme: true,
  };
}

function checkAbort(signal) {
  if (signal?.aborted) throw new DOMException('PDF export cancelled.', 'AbortError');
}
async function appendSharedStem(blocks, context, reference, missing, assets, seen) {
  if (!context) return;
  const sharedKey = context.shared_stem_html ? `html:${context.shared_stem_html}` : '';
  if (sharedKey && !seen.has(sharedKey)) {
    seen.add(sharedKey);
    await appendHtml(blocks, context.shared_stem_html, `Shared introduction for ${reference}`, missing, assets, 'question', seen);
  }
  await appendContextAsset(blocks, context.stem_image_url, `Required context for ${reference}`, missing, assets, seen);
}

async function appendContextAsset(blocks, url, label, missing, assets, seen) {
  if (!url || seen.has(url)) return;
  seen.add(url);
  await appendImage(blocks, url, label, missing, assets, 'question');
}

async function appendBooklets(blocks, question, paper, reference, missing, assets, seen) {
  const article = question.context?.article;
  if (article) {
    const pages = article.page_image_urls || [];
    const key = article.url || question.paper_id;
    if (!pages.length) {
      missing.push({ kind: 'question', reference,
        reason: 'The required pre-release article is unavailable in this bank.',
        ...(isOfficialUrl(article.url) ? { officialSourceUrl: article.url } : {}) });
    } else if (!seen.has(key)) {
      seen.add(key);
      for (const [index, url] of pages.entries()) {
        await appendImage(blocks, url, `Pre-release article page ${index + 1} of ${pages.length} (unscored context)`, missing, assets, 'question');
      }
    }
  }
  for (const [url, label] of [
    [paper?.insert_pdf_url, 'Official insert'],
    [paper?.resource_booklet_pdf_url, 'Official resource booklet'],
    [paper?.data_sheet_url, 'Official data sheet'],
  ]) {
    if (!isOfficialUrl(url) || seen.has(url)) continue;
    seen.add(url);
    blocks.push({ type: 'link', text: `${label} for ${paper.title || question.paper_id} (separate PDF)`, url });
  }
}

async function appendHtml(blocks, source, alt, missing, assets, role, seen) {
  if (!source?.trim()) return;
  if (typeof document === 'undefined') { blocks.push({ type: 'html', html: source, role }); return; }
  const template = document.createElement('template');
  template.innerHTML = sanitizeHtml(source).toString();
  const pieces = [];
  for (const fraction of [...template.content.querySelectorAll('.frac')].reverse()) {
    const numerator = fraction.querySelector(':scope > .frac__n');
    const denominator = fraction.querySelector(':scope > .frac__d');
    if (numerator && denominator) fraction.textContent = `(${numerator.textContent.trim()})/(${denominator.textContent.trim()})`;
  }
  const visit = node => {
    if (node.nodeType === Node.TEXT_NODE) { pieces.push(node.nodeValue.replace(/\s+/g, ' ')); return; }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    if (node.tagName === 'IMG') {
      pieces.push({ image: node.getAttribute('data-math-image') || node.getAttribute('src'), alt: node.getAttribute('alt') || alt });
      return;
    }
    if (node.tagName === 'PRE') {
      pieces.push({ code: node.textContent });
      return;
    }
    if (node.tagName === 'SUP') pieces.push('^(');
    if (node.tagName === 'SUB') pieces.push('_(');
    if (node.tagName === 'LI') {
      const list = node.parentElement;
      pieces.push(list.tagName === 'OL' ? `${Array.prototype.indexOf.call(list.children, node) + 1}. ` : '• ');
    }
    node.childNodes.forEach(visit);
    if (node.tagName === 'SUP' || node.tagName === 'SUB') pieces.push(')');
    if (node.tagName === 'BR' || PARAGRAPH_TAGS.has(node.tagName)) pieces.push('\n');
    if ((node.tagName === 'TD' || node.tagName === 'TH') && node.nextElementSibling) pieces.push(' | ');
  };
  template.content.childNodes.forEach(visit);
  let text = '';
  for (const piece of pieces) {
    checkAbort(assets.signal);
    if (typeof piece === 'string') { text += piece; continue; }
    if (text.trim()) blocks.push({ type: 'text', text, role });
    text = '';
    if ('code' in piece) blocks.push({ type: 'text', text: piece.code, role: 'code' });
    else if (!piece.image) missing.push({ kind: role, reference: alt, reason: `Required figure in ${alt} has no usable source reference.` });
    else if (seen) await appendContextAsset(blocks, piece.image, piece.alt, missing, assets, seen);
    else await appendImage(blocks, piece.image, piece.alt, missing, assets, role);
  }
  if (text.trim()) blocks.push({ type: 'text', text, role });
}

function isOfficialUrl(value) {
  if (!value) return false;
  try { return new URL(value).protocol === 'https:'; } catch { return false; }
}

async function appendImage(blocks, url, alt, missing, { signal, imagePromises }, kind) {
  checkAbort(signal);
  if (!String(url).startsWith('assets/')) {
    missing.push({kind, reference: alt || undefined, reason: `Required image is not in the local asset catalogue: ${url}`});
    return;
  }
  try {
    if (!imagePromises.has(url)) {
      imagePromises.set(url, sourceImageBytes(url).then(async image => {
        const [r, i, f, f2] = image.data;
        if (r !== 82 || i !== 73 || f !== 70 || f2 !== 70 || String.fromCharCode(...image.data.slice(8, 12)) !== 'WEBP') {
          throw new Error('The source crop is corrupt.');
        }
        if (typeof Image === 'function' || typeof createImageBitmap === 'function') {
          try {
            const bitmap = await decodePdfImage(new Blob([image.data], {type: image.mimeType}));
            bitmap.close?.();
          } catch {
            throw new Error('The source crop is corrupt or cannot be opened by this browser.');
          }
        }
        return image;
      }));
    }
    const image = await imagePromises.get(url);
    checkAbort(signal);
    blocks.push({type: 'image', ...image, alt});
  } catch (error) {
    checkAbort(signal);
    invalidateSourceImageBytes(url);
    missing.push({kind, reference: alt || undefined, reason: error?.message || 'Required image could not be loaded.'});
  }
}

async function appendScheme(blocks, question, paper, part, localReference, missing, assets, seenSharedSchemes, schemeRevised) {
  const content = question.content || {};
  const markup = content.mark_scheme_html || '';
  const fallbackImage = !markup.trim() && !content.mark_scheme_image_url && question.scheme_scope === 'part'
    ? question.context?.full_scheme_image_url
    : null;
  const image = content.mark_scheme_image_url || fallbackImage;
  const sources = [question.provenance?.scheme_source_url, paper?.full_mark_scheme_pdf_url];
  const officialSchemeUrl = sources.find(isOfficialUrl);
  if (schemeRevised) {
    const reason = 'The mark scheme has changed since this test was exported.';
    missing.push({ id: part.id, reference: part.reference, kind: 'scheme', reason,
      ...(officialSchemeUrl ? { officialSourceUrl: officialSchemeUrl } : {}) });
    blocks.push({ type: 'text', text: reason, role: 'notice' });
    if (officialSchemeUrl) blocks.push({ type: 'link', text: 'Open the original full-paper mark scheme', url: officialSchemeUrl });
    return false;
  }
  if (!markup.trim() && !image) {
    missing.push({id: part.id, reference: part.reference, kind: 'scheme', reason: officialSchemeUrl ? 'No scheme extract is available in this bank. The official full-paper scheme is linked below.' : 'No mark scheme is available for this question.', ...(officialSchemeUrl ? {officialSourceUrl: officialSchemeUrl} : {})});
    if (officialSchemeUrl) {
      blocks.push({type: 'text', text: 'Full-paper mark scheme · may include other questions.', role: 'notice'});
      blocks.push({type: 'link', text: 'Open the official mark scheme', url: officialSchemeUrl});
    } else blocks.push({type: 'text', text: `Mark scheme unavailable for ${part.reference}.`, role: 'notice'});
    return false;
  }
  const scope = fallbackImage ? 'full_question' : question.scheme_scope || 'full_question';
  const questionScope = question.scheme_question_number || question.parent_question_id || question.question_number || part.reference;
  const schemeKey = ['part', 'whole_question'].includes(scope) ? '' : `${paper?.paper_id || ''}:${scope}:${questionScope}:${image || markup}`;
  if (schemeKey && seenSharedSchemes.has(schemeKey)) {
    blocks.push({type: 'text', text: `Same ${scope === 'parent_part' ? 'whole-part' : 'full-question'} scheme as ${seenSharedSchemes.get(schemeKey)} above; it also covers ${part.reference}.`, role: 'notice'});
    return true;
  }
  if (fallbackImage) {
    blocks.push({type: 'text', text: `Full-question scheme fallback · includes other parts of ${part.reference}.`, role: 'notice'});
    if (officialSchemeUrl) blocks.push({type: 'link', text: 'Open the official mark scheme', url: officialSchemeUrl});
  } else if (scope === 'full_question') {
    blocks.push({type: 'text', text: question.part_label ? `Full-question scheme · includes other parts of ${part.reference}.` : 'Full-question scheme', role: 'notice'});
    if (officialSchemeUrl) blocks.push({type: 'link', text: 'Open the official mark scheme', url: officialSchemeUrl});
  } else if (scope === 'parent_part') {
    blocks.push({type: 'text', text: `Scheme scope: full part ${question.scheme_part || ''}.`, role: 'notice'});
  }
  const issueCount = missing.length;
  if (markup) await appendHtml(blocks, markup, `Mark scheme for ${part.reference}`, missing, assets, 'scheme');
  if (image) await appendImage(blocks, image, `Mark scheme for ${part.reference}`, missing, assets, 'scheme');
  const schemeIssue = missing.slice(issueCount).find(entry => entry.kind === 'scheme');
  const available = !schemeIssue;
  if (schemeIssue) {
    schemeIssue.officialSourceUrl ||= officialSchemeUrl;
    blocks.push({type: 'text', text: `Mark scheme asset unavailable for ${part.reference}.`, role: 'notice'});
    if (isOfficialUrl(officialSchemeUrl)) blocks.push({type: 'link', text: 'Open the official mark scheme', url: officialSchemeUrl});
  }
  if (available && schemeKey) seenSharedSchemes.set(schemeKey, localReference);
  return available;
}

function formatChoices(choices, referenceById) {
  return choices.map(choice => {
    const options = (choice.options || []).map((option, index) => {
      const refs = (option.partIds || []).map(id => referenceById.get(id) || id);
      return `option ${index + 1} (${refs.join(', ') || `${option.maxMarks} marks`})`;
    });
    return `Choice rule: answer ${choice.count} of ${options.join(', ')}.`;
  });
}
