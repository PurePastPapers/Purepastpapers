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

const DATA_ROOT = new URL('../../data/', import.meta.url);
const LOCAL_PACK_KEY = `${APP.storageNamespace}:content-pack`;

/** One shared index over every specification tree loaded so far. */
export const specIndex = createSpecIndex();

let subjectsPromise = null;
let packsPromise = null;
let curriculumPromise = null;
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

/** Loads a subject's specification tree and adds it to the shared index. */
export function ensureSpec(subjectId) {
  if (!specPromises.has(subjectId)) {
    const promise = fetchJson(`specs/${subjectId}.json`).then((spec) => {
      specIndex.add(spec);
      return spec;
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

async function getPacks() {
  packsPromise ??= (async () => {
    const index = await fetchJson('packs/index.json').catch(() => ({ packs: [] }));
    const packs = [];
    for (const entry of index.packs || []) {
      if (entry.enabled === false) continue;
      try {
        packs.push({ ...(await fetchJson(`packs/${entry.file}`)), file: entry.file });
      } catch (error) {
        console.warn(`Content pack "${entry.file}" could not be loaded.`, error);
      }
    }
    return packs;
  })();
  return [...(await packsPromise), readLocalPack()];
}

/** Call after content changes so the next read rebuilds from source. */
export function invalidateContent() {
  bundlePromises.clear();
  packsPromise = null;
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
    getPacks(),
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
  if (!CONTENT.showSampleContent) {
    for (const [id, paper] of papersById) if (paper.is_sample) papersById.delete(id);
    for (const [id, question] of questionsById) if (question.is_sample) questionsById.delete(id);
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
  const questions = [...questionsById.values()];
  const foreignSubjects = new Set();
  for (const question of questions) {
    for (const id of [...(question.primary_spec_points || []), ...(question.crossover_spec_points || [])]) {
      if (specIndex.has(id)) continue;
      const owner = ownerOf(id, subjects);
      if (owner && owner !== subjectId) foreignSubjects.add(owner);
    }
  }
  await Promise.all([...foreignSubjects].map((id) => ensureSpec(id).catch(() => null)));

  return { subject, spec, papers: [...papersById.values()], papersById, questions, questionsById };
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
