import { sourceImageBytes } from '../data/source-images.js';

const SAFE_TAGS = new Set(['P', 'DIV', 'SPAN', 'STRONG', 'B', 'EM', 'I', 'U', 'SUB', 'SUP', 'BR', 'UL', 'OL', 'LI', 'TABLE', 'THEAD', 'TBODY', 'TR', 'TH', 'TD']);
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
  const referenceById = new Map(work.map(({group, part}) => [part.id, part.label ? `${group.number}${part.label}` : String(group.number)]));
  const seenSharedSchemes = new Map();
  let completed = 0;
  for (const group of snapshot.groups) {
    checkAbort(signal);
    const parts = group.parts || [];
    const scoredIds = new Set();
    const questionBlocks = [];
    const schemeBlocks = [];
    const seenContext = new Set();
    let sourceLabelAdded = false;
    let questionUnavailable = false;

    for (const part of parts) {
      checkAbort(signal);
      const partIssueStart = missing.length;
      const item = questions.get(part.id);
      if (!item?.question) {
        missing.push({id: part.id, reference: part.reference, kind: 'question', reason: 'Question content is unavailable in the current bank.'});
        questionUnavailable = true;
        if (wantSchemes) {
          missing.push({id: part.id, reference: part.reference, kind: 'scheme', reason: 'The question record needed to match its mark scheme is unavailable.'});
          schemeBlocks.push({type: 'text', text: `Mark scheme unavailable for ${part.reference}; the matching question record is missing.`, role: 'notice'});
        }
        continue;
      }
      const {question, paper} = item;
      if (wantQuestions) {
        for (const dependencyId of question.depends_on_question_ids || []) {
          if (scoredIds.has(dependencyId) || precedingIds.has(dependencyId)) continue;
          missing.push({id: part.id, reference: part.reference, kind: 'dependency', reason: `Required earlier answer ${dependencyId} is not included in this frozen test.`});
          questionUnavailable = true;
        }
        if (!sourceLabelAdded) {
          const sourceLabel = part.isOfficialSample || question.is_official_sample || paper?.is_official_sample ? 'Official sample assessment'
            : part.isSample || question.is_sample || paper?.is_sample ? 'Demo content · not from an official exam paper'
              : SOURCE_LABELS[part.sourceType] || 'Practice material';
          questionBlocks.push({type: 'text', text: `Source: ${sourceLabel}`, role: 'meta'});
          sourceLabelAdded = true;
        }
        await appendContext(questionBlocks, question.context, part.reference, missing, signal, seenContext);
        if (question.context?.lead_in_image_url) {
          await appendImage(questionBlocks, question.context.lead_in_image_url, `Printed lead-in for ${part.reference}`, missing, signal, 'question');
        }
        if (question.context?.erratum_image_url && !question.context.shared_stem_html?.includes(question.context.erratum_image_url)) {
          await appendContextAsset(questionBlocks, question.context.erratum_image_url, `Official erratum for ${part.reference}`, missing, signal, seenContext);
        }
        for (const intro of question.context?.intros || []) {
          await appendContextAsset(questionBlocks, intro?.image_url, `${intro?.label || 'Printed introduction'} for ${part.reference}`, missing, signal, seenContext);
        }
        for (const figure of question.context?.figures || []) {
          await appendContextAsset(questionBlocks, figure?.image_url, `${figure?.label || 'Required figure'} (${figure?.source || 'unscored context'})`, missing, signal, seenContext);
        }
        const article = question.context?.article;
        if (article) {
          for (const [index, url] of (article.page_image_urls || []).entries()) {
            await appendContextAsset(questionBlocks, url, `Pre-release article page ${index + 1}`, missing, signal, seenContext);
          }
          if (!article.page_image_urls?.length && article.url && /^https:/i.test(article.url)) {
            questionBlocks.push({type: 'text', text: `Official pre-release article: ${article.url}`, role: 'source'});
          }
        }
        const label = part.label || question.part_label;
        if (label || new Set(parts.map(candidate => candidate.reference)).size > 1) {
          questionBlocks.push({type: 'text', text: `${part.reference} · ${part.maxMarks} ${part.maxMarks === 1 ? 'mark' : 'marks'}`, role: 'subheading'});
        }
        await appendHtml(questionBlocks, question.content?.question_html, `Question ${part.reference}`, missing, signal, 'question');
        if (question.content?.question_image_url) await appendImage(questionBlocks, question.content.question_image_url, `Question ${part.reference}`, missing, signal, 'question');
        if (!question.content?.question_html?.trim() && !question.content?.question_image_url) {
          missing.push({id: part.id, reference: part.reference, kind: 'question', reason: 'The question has no printable text or question crop.'});
          questionUnavailable = true;
        }
        if (!compact) questionBlocks.push({type: 'answer', marks: part.maxMarks});
      }
      if (wantSchemes) {
        await appendScheme(schemeBlocks, question, paper, part, group.number, missing, signal, seenSharedSchemes);
      }
      for (const entry of missing.slice(partIssueStart)) {
        entry.id ||= part.id;
        entry.reference ||= part.reference;
      }
      scoredIds.add(part.id);
      precedingIds.add(part.id);
      completed++;
      onProgress?.({completed, total: work.length, current: part.reference});
    }
    const marks = parts.reduce((sum, part) => sum + part.maxMarks, 0);
    if (wantQuestions && !questionUnavailable) questionGroups.push({localNumber: group.number, sourceReference: group.reference, marks, blocks: questionBlocks});
    if (wantSchemes) schemeGroups.push({localNumber: group.number, sourceReference: group.reference, marks, blocks: schemeBlocks});
  }
  const title = snapshot.title || 'Practice test';
  const instructions = [`Answer all selected questions. Total marks: ${snapshot.totalMarks}.`, ...formatChoices(snapshot.choices || [], referenceById)].join('\n');
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
async function appendContext(blocks, context, reference, missing, signal, seen) {
  if (!context) return;
  const sharedKey = context.shared_stem_html ? `html:${context.shared_stem_html}` : '';
  if (sharedKey && !seen.has(sharedKey)) {
    seen.add(sharedKey);
    await appendHtml(blocks, context.shared_stem_html, `Shared introduction for ${reference}`, missing, signal, 'question');
  }
  for (const [url, label] of [[context.stem_image_url, `Required context for ${reference}`], [context.booklet_image_url, `Source booklet for ${reference}`]]) {
    const key = url ? `image:${url}` : '';
    if (!url || seen.has(key) || context.shared_stem_html?.includes(url)) continue;
    seen.add(key);
    await appendImage(blocks, url, label, missing, signal, 'question');
  }
}

async function appendContextAsset(blocks, url, label, missing, signal, seen) {
  if (!url || seen.has(`resource:${url}`)) return;
  seen.add(`resource:${url}`);
  await appendImage(blocks, url, label, missing, signal, 'question');
}

async function appendHtml(blocks, source, alt, missing, signal, role) {
  if (!source?.trim()) return;
  if (typeof DOMParser === 'undefined') { blocks.push({type: 'html', html: source, role}); return; }
  const doc = new DOMParser().parseFromString(source, 'text/html');
  const pieces = [];
  const visit = node => {
    if (node.nodeType === Node.TEXT_NODE) { pieces.push(escapeText(node.nodeValue || '')); return; }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    if (['SCRIPT', 'STYLE', 'IFRAME', 'OBJECT'].includes(node.tagName)) return;
    if (node.tagName === 'IMG') {
      pieces.push({image: node.getAttribute('data-math-image') || node.getAttribute('src'), alt: node.getAttribute('alt') || alt});
      return;
    }
    if (!SAFE_TAGS.has(node.tagName)) { node.childNodes.forEach(visit); return; }
    const tag = node.tagName.toLowerCase();
    pieces.push(`<${tag}>`); node.childNodes.forEach(visit); pieces.push(`</${tag}>`);
  };
  doc.body.childNodes.forEach(visit);
  let html = '';
  for (const piece of pieces) {
    checkAbort(signal);
    if (typeof piece === 'string') { html += piece; continue; }
    if (html.trim()) blocks.push({type: 'html', html, role});
    html = '';
    if (!piece.image) missing.push({kind: role, reference: alt, reason: `Required figure in ${alt} has no usable source reference.`});
    else await appendImage(blocks, piece.image, piece.alt, missing, signal, role);
  }
  if (html.trim()) blocks.push({type: 'html', html, role});
}
function escapeText(value) { return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;'); }

async function appendImage(blocks, url, alt, missing, signal, kind) {
  checkAbort(signal);
  if (!String(url).startsWith('assets/')) {
    missing.push({kind, reference: alt, reason: `Required image is not in the local asset catalogue: ${url}`});
    return;
  }
  try {
    const image = await sourceImageBytes(url);
    blocks.push({type: 'image', data: image.data, mimeType: image.mimeType, alt});
  } catch (error) {
    missing.push({kind, reference: alt, reason: error?.message || 'Required image could not be loaded.'});
  }
}

async function appendScheme(blocks, question, paper, part, groupNumber, missing, signal, seenSharedSchemes) {
  const content = question.content || {};
  const markup = content.mark_scheme_html || '';
  const fallbackImage = !markup.trim() && !content.mark_scheme_image_url && question.scheme_scope === 'part'
    ? question.context?.full_scheme_image_url
    : null;
  const image = content.mark_scheme_image_url || fallbackImage;
  const officialSchemeUrl = question.provenance?.scheme_source_url || paper?.full_mark_scheme_pdf_url;
  if (!markup.trim() && !image) {
    missing.push({id: part.id, reference: part.reference, kind: 'scheme', reason: officialSchemeUrl ? 'No scheme extract is available in this bank. The official full-paper scheme is linked below.' : 'No mark scheme is available for this question.', ...(officialSchemeUrl ? {officialSourceUrl: officialSchemeUrl} : {})});
    if (officialSchemeUrl) {
      blocks.push({type: 'text', text: 'Full-paper mark scheme · may include other questions.', role: 'notice'});
      blocks.push({type: 'text', text: `Official source: ${officialSchemeUrl}`, role: 'source'});
    } else blocks.push({type: 'text', text: `Mark scheme unavailable for ${part.reference}.`, role: 'notice'});
    return false;
  }
  const scope = fallbackImage ? 'full_question' : question.scheme_scope || 'full_question';
  const questionScope = question.scheme_question_number || question.parent_question_id || question.question_number || part.reference;
  const schemeKey = scope === 'part' ? '' : `${paper?.paper_id || ''}:${scope}:${questionScope}:${image || markup}`;
  if (schemeKey && seenSharedSchemes.has(schemeKey)) {
    blocks.push({type: 'text', text: `Same ${scope === 'parent_part' ? 'whole-part' : 'full-question'} scheme as Question ${seenSharedSchemes.get(schemeKey)} above; it also covers ${part.reference}.`, role: 'notice'});
    return true;
  }
  if (fallbackImage) {
    blocks.push({type: 'text', text: `Full-question scheme fallback · includes other parts of ${part.reference}.`, role: 'notice'});
    if (officialSchemeUrl) blocks.push({type: 'text', text: `Official source: ${officialSchemeUrl}`, role: 'source'});
  } else if (scope === 'full_question') {
    blocks.push({type: 'text', text: `Full-question scheme · includes other parts of ${part.reference}.`, role: 'notice'});
    if (officialSchemeUrl) blocks.push({type: 'text', text: `Official source: ${officialSchemeUrl}`, role: 'source'});
  } else if (scope === 'parent_part') {
    blocks.push({type: 'text', text: `Scheme scope: full part ${question.scheme_part || ''}.`, role: 'notice'});
  } else {
    blocks.push({type: 'text', text: `${part.reference} · ${part.maxMarks} marks`, role: 'subheading'});
  }
  const issueCount = missing.length;
  if (markup) await appendHtml(blocks, markup, `Mark scheme for ${part.reference}`, missing, signal, 'scheme');
  if (image) await appendImage(blocks, image, `Mark scheme for ${part.reference}`, missing, signal, 'scheme');
  const schemeIssue = missing.slice(issueCount).find(entry => entry.kind === 'scheme');
  const available = !schemeIssue;
  if (schemeIssue) {
    schemeIssue.officialSourceUrl ||= paper?.full_mark_scheme_pdf_url;
    blocks.push({type: 'text', text: `Mark scheme asset unavailable for ${part.reference}.${schemeIssue.officialSourceUrl ? ` Official source: ${schemeIssue.officialSourceUrl}` : ''}`, role: 'notice'});
  }
  if (available && schemeKey) seenSharedSchemes.set(schemeKey, groupNumber);
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
