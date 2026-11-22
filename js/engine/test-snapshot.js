import { sha256, toHex } from '../core/sha256.js';
import { sourceImageChecksums } from '../data/source-images.js?v=20261122-pdf2';
import { expandLinkedIds, runnerItems } from './linked-parts.js';

const digest = (value) => toHex(sha256(JSON.stringify(value)));
const sorted = (value) => Array.isArray(value) ? value.map(sorted) : value && typeof value === 'object'
  ? Object.fromEntries(Object.keys(value).sort().map(key => [key, sorted(value[key])])) : value;

export const displayedPartLabel = (groupNumber, label) => `Question ${groupNumber}${label ? ` ${label}` : ''}`;

function identity(question, paper) {
  return [
    question.paper_id ?? null, question.source_type, question.qualification_code ?? paper?.spec_code ?? null,
    question.level ?? paper?.level ?? null, question.tier ?? paper?.tier ?? null,
    question.question_number, question.part_label ?? '', question.scheme_question_number ?? null,
    question.parent_question_id ?? null, question.year ?? paper?.year ?? null, question.series ?? paper?.series ?? null,
  ];
}

function contentFingerprint(question, paper) {
  return digest(sorted({
    identity: identity(question, paper).map((field, index) => index === 8 ? null : field),
    marks: question.marks,
    content: question.content,
    context: question.context,
    rubric: question.rubric,
    dependencies: question.depends_on_question_ids || [],
    schemeScope: question.scheme_scope,
    schemeVerification: question.scheme_verification,
    officialSample: paper?.is_official_sample,
    source: paper?.full_paper_pdf_url,
    scheme: paper?.full_mark_scheme_pdf_url,
    resources: [paper?.resources, paper?.insert_pdf_url, paper?.resource_booklet_pdf_url, paper?.data_sheet_url],
    provenance: question.provenance,
  }));
}

function partReference(question, paper) {
  const number = String(question.question_number ?? '');
  const label = String(question.part_label || '').trim();
  const normalise = (value) => value.replace(/[\s()]/g, '').toLowerCase();
  const suffix = label && !normalise(number).endsWith(normalise(label))
    ? label.replace(/^([^()]+)(.*)$/, '($1)$2') : '';
  const qualification = question.qualification_code ?? paper?.spec_code;
  return [paper?.board || question.board, qualification, paper?.title || paper?.paper_code, `Q${number}${suffix}`]
    .filter(Boolean).join(' · ');
}

function freeze(snapshot) {
  for (const group of snapshot.groups) {
    group.parts.forEach(Object.freeze);
    Object.freeze(group.parts);
    Object.freeze(group);
  }
  for (const choice of snapshot.choices) {
    for (const option of choice.options) {
      Object.freeze(option.partIds);
      Object.freeze(option);
    }
    Object.freeze(choice.options);
    Object.freeze(choice);
  }
  Object.freeze(snapshot.groups);
  Object.freeze(snapshot.choices);
  return Object.freeze(snapshot);
}

export function createTestSnapshot({ bundle, ids, title, choices = [] }) {
  const { subject, questionsById, papersById } = bundle;
  const ordered = expandLinkedIds(ids, questionsById);
  const questions = ordered.map(id => questionsById.get(id));
  if (!questions.length || questions.some(q => !q || !Number.isInteger(q.marks) || q.marks < 1)) {
    throw new Error('Some selected questions are unavailable. Review the test selection and try again.');
  }
  const groups = runnerItems(questions).map((item, index) => {
    const spansNumbers = new Set(item.questions.map(q => q.question_number)).size > 1;
    const parts = item.questions.map(question => {
      const paper = papersById.get(question.paper_id);
      return {
        id: question.question_id,
        label: item.group ? spansNumbers ? `Q${question.question_number}${question.part_label || ''}`
          : question.part_label || `Q${question.question_number}` : '',
        reference: partReference(question, paper),
        maxMarks: question.marks,
        fingerprint: contentFingerprint(question, paper),
        sourceType: question.source_type,
        isSample: Boolean(question.is_sample || paper?.is_sample),
        isOfficialSample: Boolean(paper?.is_official_sample || (paper?.paper_type === 'real_past_paper' && !paper.year && !paper.is_demo)),
        difficulty: question.difficulty,
        paperId: question.paper_id ?? null,
      };
    });
    return { number: index + 1, reference: parts[0].reference, parts };
  });
  const byId = new Map(groups.flatMap(group => group.parts.map(part => [part.id, part])));
  const optional = new Set();
  const choiceRules = choices.map(({ count, options }) => {
    if (!Number.isInteger(count) || count < 1 || count >= options.length) throw new Error('Invalid test choice.');
    const rules = options.map(ids => {
      const partIds = [...ids];
      if (!partIds.length) throw new Error('An empty option cannot be exported.');
      let maxMarks = 0;
      for (const id of partIds) {
        if (!byId.has(id) || optional.has(id)) throw new Error('A test choice has missing or overlapping parts.');
        optional.add(id);
        maxMarks += byId.get(id).maxMarks;
      }
      return { partIds, maxMarks };
    });
    if (new Set(rules.map(option => option.maxMarks)).size !== 1) {
      throw new Error('Each alternative must carry the same marks to use a shared total.');
    }
    return { count, options: rules };
  });
  const totalMarks = [...byId.values()].reduce((n, part) => n + (optional.has(part.id) ? 0 : part.maxMarks), 0)
    + choiceRules.reduce((n, choice) => n + choice.count * choice.options[0].maxMarks, 0);
  const snapshot = { version: 1, subjectId: subject.subject_id, title, groups, choices: choiceRules, totalMarks };
  return freeze({ ...snapshot, id: `pdf_${digest(snapshot).slice(0, 32)}` });
}

export function resolveTestSnapshot(snapshot, bundle) {
  const { questionsById, papersById } = bundle;
  const resolved = new Map();
  const taken = new Set();
  const legacy = new Map();
  for (const q of questionsById.values()) for (const id of q.legacy_ids || []) {
    if (!legacy.has(id)) legacy.set(id, []);
    legacy.get(id).push(q);
  }
  for (const part of snapshot.groups.flatMap(group => group.parts)) {
    const original = questionsById.get(part.id);
    const matches = (question) => question && !taken.has(question.question_id)
      && question.paper_id === part.paperId && question.marks === part.maxMarks
      && contentFingerprint(question, papersById.get(question.paper_id)) === part.fingerprint;
    const question = matches(original) ? original : legacy.get(part.id)?.find(matches);
    if (question) {
      taken.add(question.question_id);
      resolved.set(part.id, { question, paper: papersById.get(question.paper_id) });
    }
  }
  return resolved;
}

function cropReferences(question) {
  const content = question?.content || {};
  const context = question?.context || {};
  const { question_html, question_image_url, mark_scheme_html, mark_scheme_image_url } = content;
  const { shared_stem_html, stem_image_url, lead_in_image_url, booklet_image_url, erratum_image_url,
    intros, figures, article, full_scheme_image_url } = context;
  const paths = (fields) => [...new Set(JSON.stringify(fields).match(/assets\/[a-z]+\/[A-Z0-9_]+\/[A-Za-z0-9_]+\.webp/g) || [])].sort();
  return {
    prompt: paths([question_html, question_image_url, shared_stem_html, stem_image_url, lead_in_image_url,
      booklet_image_url, erratum_image_url, intros, figures, article?.page_image_urls]),
    scheme: paths([mark_scheme_html, mark_scheme_image_url || (!mark_scheme_html?.trim() ? full_scheme_image_url : null)]),
  };
}

async function fingerprintCrops(questions, checksums, signal) {
  const references = new Map([...questions].map(([id, item]) => [id, cropReferences(item.question)]));
  const paths = [...new Set([...references.values()].flatMap(ref => [...ref.prompt, ...ref.scheme]))];
  const hashes = await checksums(paths, { signal });
  const fingerprint = (refs) => refs.length ? digest(refs.map(path => [path, hashes.get(path) ?? null])) : null;
  return new Map([...references].map(([id, refs]) => [id, {
    prompt: fingerprint(refs.prompt), scheme: fingerprint(refs.scheme),
  }]));
}

/** Pin the exact crop revisions, even if a later import keeps their URLs unchanged. */
export async function pinTestCrops(snapshot, questions, { checksums = sourceImageChecksums, signal } = {}) {
  if (snapshot.cropVersion) return snapshot;
  const crops = await fingerprintCrops(questions, checksums, signal);
  const groups = snapshot.groups.map(group => ({ ...group, parts: group.parts.map(part => ({
    ...part, promptCrops: crops.get(part.id)?.prompt ?? null, schemeCrops: crops.get(part.id)?.scheme ?? null,
  })) }));
  const { id, ...data } = snapshot;
  const pinned = { ...data, groups, cropVersion: 1 };
  return freeze({ ...pinned, id: `pdf_${digest(pinned).slice(0, 32)}` });
}

/** Keep question and scheme availability independent when a saved crop was replaced. */
export async function verifyTestCrops(snapshot, questions, { checksums = sourceImageChecksums, signal } = {}) {
  if (snapshot.cropVersion !== 1) return questions;
  const crops = await fingerprintCrops(questions, checksums, signal);
  const verified = new Map();
  for (const part of snapshot.groups.flatMap(group => group.parts)) {
    const current = questions.get(part.id);
    if (!current) continue;
    const { prompt, scheme } = crops.get(part.id);
    verified.set(part.id, {
      ...current, promptRevised: part.promptCrops !== prompt, schemeRevised: part.schemeCrops !== scheme,
    });
  }
  return verified;
}

export function scoreTestSnapshot(snapshot, { mode, marks = {}, chosenOptions = [], total }, resolved, { preserve = {} } = {}) {
  if (mode === 'overall') {
    if (!Number.isInteger(total) || total < 0 || total > snapshot.totalMarks) throw new Error(`Enter a whole number from 0 to ${snapshot.totalMarks}.`);
    return { mode, awarded: total, maxMarks: snapshot.totalMarks, percentage: Math.round(total * 1000 / snapshot.totalMarks) / 10 };
  }
  if (mode !== 'parts') throw new Error('Choose how to mark this test.');
  const excluded = new Set();
  if (chosenOptions.length !== snapshot.choices.length) throw new Error('Select which options you answered.');
  snapshot.choices.forEach(({ count, options }, index) => {
    const selected = new Set(chosenOptions[index]);
    if (selected.size !== count || [...selected].some(i => !Number.isInteger(i) || !options[i])) {
      throw new Error(`Choose ${count} options for choice group ${index + 1}.`);
    }
    options.forEach((option, i) => { if (!selected.has(i)) option.partIds.forEach(id => excluded.add(id)); });
  });
  const eligible = new Map(snapshot.groups.flatMap(group => group.parts).filter(part => !excluded.has(part.id)).map(part => [part.id, part]));
  const retained = Object.entries(preserve).filter(([id]) => eligible.has(id) && !resolved.has(id));
  const entered = Object.entries(marks).filter(([, value]) => value !== '' && value != null);
  if (!entered.length && !retained.length) throw new Error('Enter at least one mark.');
  for (const [id, value] of entered) {
    const part = eligible.get(id);
    if (!part || !resolved.has(id) || !Number.isInteger(value) || value < 0 || value > part.maxMarks) {
      throw new Error(`Invalid mark for ${part?.reference || 'an unselected question'}.`);
    }
  }
  entered.push(...retained);
  const awarded = entered.reduce((sum, [, value]) => sum + value, 0);
  const complete = entered.length === eligible.size;
  return {
    mode, marks: Object.fromEntries(entered), chosenOptions, awarded, maxMarks: snapshot.totalMarks,
    percentage: complete ? Math.round(awarded * 1000 / snapshot.totalMarks) / 10 : null,
    unmarked: eligible.size - entered.length,
  };
}
