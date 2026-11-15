// Read-only access to the unified Question & Paper Database (PRD sections 3 and 8).
//
// Content = the JSON files in /data  +  content packs listed in /data/packs/index.json
//         +  one optional pack kept in this browser (Content Studio).
// Packs use the same schemas and are merged by id, so a pack can add papers and questions
// of any source type (real, AI, predicted) or attach PDFs and questions to a catalogue paper.
// Swapping this module for one that calls a real database is the only change needed to move
// content server-side.

import { APP, CONTENT } from '../config/app.config.js';
import { naturalCompare } from '../core/utils.js';
import { createSpecIndex } from '../engine/spec-index.js';
import { createCurriculumMap } from '../engine/curriculum-map.js';
import { createTextbookIndex } from '../engine/textbook-index.js';

const DATA_ROOT = new URL('../../data/', import.meta.url);
const LOCAL_PACK_KEY = `${APP.storageNamespace}:content-pack`;

/** One shared index over every specification tree loaded so far. */
export const specIndex = createSpecIndex();

let subjectsPromise = null;
let packsPromise = null;
let curriculumPromise = null;
const textbookPromises = new Map(); // subject_id → Promise<{index, links}>
const packPromises = new Map(); // pack file → Promise<pack or null>
const specPromises = new Map();
const bundlePromises = new Map();

async function fetchJson(path) {
  const response = await fetch(new URL(path, DATA_ROOT));
  if (!response.ok) throw new Error(`Could not load data/${path} (HTTP ${response.status}).`);
  return response.json();
}

export function getSubjects() {
  subjectsPromise ??= fetchJson('subjects.json').catch((error) => {
    subjectsPromise = null;
    throw error;
  });
  return subjectsPromise;
}

export async function getSubject(subjectId) {
  return (await getSubjects()).find((subject) => subject.subject_id === subjectId) || null;
}

/** Verified alternate curriculum views, if any. Provisional entries stay hidden. */
export async function getCurriculum(subjectId) {
  const [index] = await Promise.all([
    (curriculumPromise ??= fetchJson('curriculum/index.json').catch((error) => { curriculumPromise = null; throw error; })),
    ensureSpec(subjectId),
  ]);
  if (!Array.isArray(index.mappings)) throw new TypeError('Curriculum index must contain a mappings array.');
  return createCurriculumMap({ subject_id: subjectId, mappings: index.mappings.filter((item) => item.subject_id === subjectId) }, specIndex);
}

/** The owner's book-scoped contents and question skill associations, declared
 * per subject in subjects.json (`textbooks: {contents, links}`). Subjects without
 * supplied contents have no textbook view. */
export async function getTextbooks(subjectId) {
  const source = (await getSubject(subjectId))?.textbooks;
  if (!source?.contents || !source?.links) return null;
  await ensureSpec(subjectId);
  if (!textbookPromises.has(subjectId)) {
    textbookPromises.set(subjectId, Promise.all([fetchJson(source.contents), fetchJson(source.links)]).then(([document, links]) => {
      if (document.version !== links.version) throw new TypeError('Textbook association version mismatch.');
      if (document.subject_id && document.subject_id !== subjectId) throw new TypeError('Textbook contents belong to another subject.');
      return {index: createTextbookIndex(document, specIndex), links: links.questions};
    }).catch(error => { textbookPromises.delete(subjectId); throw error; }));
  }
  return textbookPromises.get(subjectId);
}

/** Loads a subject's specification tree and adds it to the shared index. */
export function ensureSpec(subjectId) {
  if (!specPromises.has(subjectId)) {
    const promise = fetchJson(`specs/${subjectId}.json`).then((spec) => {
      specIndex.add(spec);
      return specIndex.spec(spec.subject_id) || spec; // legacy sections are lookup-only
    });
    promise.catch(() => specPromises.delete(subjectId));
    specPromises.set(subjectId, promise);
  }
  return specPromises.get(subjectId);
}

// ── content packs ──

const emptyPack = () => ({ pack_id: 'local', title: 'Added in this browser', papers: [], questions: [] });

export function readLocalPack() {
  try {
    const pack = JSON.parse(localStorage.getItem(LOCAL_PACK_KEY));
    return pack ? { ...emptyPack(), ...pack } : emptyPack();
  } catch {
    return emptyPack();
  }
}

export function writeLocalPack(pack) {
  localStorage.setItem(LOCAL_PACK_KEY, JSON.stringify({ ...emptyPack(), ...pack }));
  invalidateContent();
}

/** Enabled packs for one subject. An index entry may name its `subject_id`; an
 * entry without one is loaded for every subject (local and older packs). */
async function getPacks(subjectId) {
  packsPromise ??= fetchJson('packs/index.json').catch(() => ({ packs: [] }));
  const index = await packsPromise;
  const wanted = (index.packs || []).filter((entry) => entry.enabled !== false && (!entry.subject_id || entry.subject_id === subjectId));
  const packs = await Promise.all(wanted.map((entry) => {
    if (!packPromises.has(entry.file)) {
      packPromises.set(entry.file, fetchJson(`packs/${entry.file}`).then((pack) => ({ ...pack, file: entry.file })).catch((error) => {
        console.warn(`Content pack "${entry.file}" could not be loaded.`, error);
        packPromises.delete(entry.file);
        return null;
      }));
    }
    return packPromises.get(entry.file);
  }));
  return [...packs.filter(Boolean), readLocalPack()];
}

/** Call after content changes so the next read rebuilds from source. */
export function invalidateContent() {
  bundlePromises.clear();
  packsPromise = null;
  packPromises.clear();
}

// ── subject bundles ──

function ownerOf(specPointId, subjects) {
  let owner = null;
  for (const subject of subjects) {
    if (specPointId.startsWith(`${subject.sp_prefix}_`) && (!owner || subject.sp_prefix.length > owner.sp_prefix.length)) {
      owner = subject;
    }
  }
  return owner?.subject_id || null;
}

async function loadBundle(subjectId) {
  const subjects = await getSubjects();
  const subject = subjects.find((candidate) => candidate.subject_id === subjectId);
  if (!subject) throw new Error(`Unknown subject "${subjectId}".`);

  const [spec, basePapers, baseQuestions, packs] = await Promise.all([
    ensureSpec(subjectId),
    fetchJson(`papers/${subjectId}.json`),
    fetchJson(`questions/${subjectId}.json`),
    getPacks(subjectId),
  ]);

  const papersById = new Map(basePapers.map((paper) => [paper.paper_id, { ...paper }]));
  const questionsById = new Map(baseQuestions.map((question) => [question.question_id, question]));
  for (const pack of packs) {
    for (const paper of pack.papers || []) {
      if (paper.subject_id === subjectId) papersById.set(paper.paper_id, { ...papersById.get(paper.paper_id), ...paper });
    }
    for (const question of pack.questions || []) {
      if (question.subject_id === subjectId) questionsById.set(question.question_id, question);
    }
  }
  const textbooks = await getTextbooks(subjectId);
  if (textbooks) for (const [id, question] of questionsById) {
    questionsById.set(id, textbooks.index.attach(question, textbooks.links[id]));
  }

  // Keep papers and questions consistent: a question that names a paper belongs to it.
  for (const question of questionsById.values()) {
    const paper = papersById.get(question.paper_id);
    if (paper && !(paper.question_ids || []).includes(question.question_id)) {
      paper.question_ids = [...(paper.question_ids || []), question.question_id];
    }
  }
  for (const paper of papersById.values()) {
    paper.question_ids = (paper.question_ids || [])
      .filter((id) => questionsById.has(id))
      .sort((a, b) => naturalCompare(questionsById.get(a).question_number, questionsById.get(b).question_number));
  }

  // Crossover tags may point into other subjects: load those trees too, so the
  // learned-topics gate can expand them and the UI can name them.
  // Hide demos from discovery, retaining lookups for saved historical sessions.
  const questions = [...questionsById.values()].filter(question => CONTENT.showSampleContent || !question.is_sample);
  const foreignSubjects = new Set();
  for (const question of questions) {
    for (const id of [...(question.primary_spec_points || []), ...(question.crossover_spec_points || [])]) {
      if (specIndex.has(id)) continue;
      const owner = ownerOf(id, subjects);
      if (owner && owner !== subjectId) foreignSubjects.add(owner);
    }
  }
  await Promise.all([...foreignSubjects].map((id) => ensureSpec(id).catch(() => null)));

  const hasReviewedSource = questions.some(question => question.provenance?.review_status === 'model_reviewed');
  // Authenticated source booklets supersede generated catalogue placeholders.
  // Keep the original lookup records so saved sessions and marks still resolve.
  const generatedIds = new Set(basePapers.map(paper => paper.paper_id));
  const papers = [...papersById.values()].filter(paper => (CONTENT.showSampleContent || !paper.is_sample) && (!hasReviewedSource ||
    !generatedIds.has(paper.paper_id) || paper.question_ids.some(id =>
      questionsById.get(id)?.provenance?.review_status === 'model_reviewed')));
  return { subject, spec, papers, papersById, questions, questionsById, textbooks: textbooks?.index || null };
}

/**
 * Everything the UI needs for one subject.
 * @returns {Promise<{subject, spec, papers, papersById: Map, questions, questionsById: Map}>}
 */
export function getBundle(subjectId) {
  if (!bundlePromises.has(subjectId)) {
    const promise = loadBundle(subjectId);
    promise.catch(() => bundlePromises.delete(subjectId));
    bundlePromises.set(subjectId, promise);
  }
  return bundlePromises.get(subjectId);
}

/** Bundles for several subjects; subjects that fail to load are skipped. */
export async function getBundles(subjectIds) {
  const entries = await Promise.all(
    [...new Set(subjectIds)].map(async (id) => {
      try {
        return [id, await getBundle(id)];
      } catch (error) {
        console.warn(error);
        return null;
      }
    }),
  );
  return new Map(entries.filter(Boolean));
}
