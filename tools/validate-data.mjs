// Checks every file in /data (and every content pack) against the PRD schemas.
//   node tools/validate-data.mjs        (or: npm run validate)
// Exits with code 1 if any errors are found, so it can gate a deploy.

import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import { validateBundle } from '../js/data/schema.js';
import { createSpecIndex } from '../js/engine/spec-index.js';

const DATA = new URL('../data/', import.meta.url);
const load = async (path, fallback) => {
  try {
    return JSON.parse(await readFile(new URL(path, DATA), 'utf8'));
  } catch (error) {
    if (fallback !== undefined && error.code === 'ENOENT') return fallback;
    throw new Error(`${fileURLToPath(new URL(path, DATA))}: ${error.message}`);
  }
};

const subjects = await load('subjects.json');
const specIndex = createSpecIndex();
for (const subject of subjects) specIndex.add(await load(`specs/${subject.subject_id}.json`));

const packs = [];
for (const entry of (await load('packs/index.json', { packs: [] })).packs || []) {
  if (entry.enabled !== false) packs.push(await load(`packs/${entry.file}`));
}

let errors = 0;
let warnings = 0;
let questionTotal = 0;
let paperTotal = 0;
for (const subject of subjects) {
  const id = subject.subject_id;
  const papersById = new Map((await load(`papers/${id}.json`)).map((paper) => [paper.paper_id, { ...paper }]));
  const questionsById = new Map((await load(`questions/${id}.json`)).map((question) => [question.question_id, question]));
  for (const pack of packs) {
    for (const paper of pack.papers || []) if (paper.subject_id === id) papersById.set(paper.paper_id, { ...papersById.get(paper.paper_id), ...paper });
    for (const question of pack.questions || []) if (question.subject_id === id) questionsById.set(question.question_id, question);
  }
  const bundle = { subject, papers: [...papersById.values()], questions: [...questionsById.values()], questionsById };
  questionTotal += bundle.questions.length;
  paperTotal += bundle.papers.length;
  const issues = validateBundle(bundle, specIndex);
  if (!issues.length) continue;
  console.log(`\n${subject.level} ${subject.subject} (${id})`);
  for (const { level, id: recordId, message } of issues) {
    console.log(`  ${level === 'error' ? 'ERROR  ' : 'warning'}  ${recordId}: ${message}`);
    if (level === 'error') errors += 1;
    else warnings += 1;
  }
}

console.log(`\nChecked ${subjects.length} subjects, ${paperTotal} papers and ${questionTotal} questions: ${errors} error(s), ${warnings} warning(s).`);
process.exit(errors ? 1 : 0);
