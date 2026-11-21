// GCSE Combined Science 1SC0 stays one subject with one double-award target grade (9-9 to 1-1),
// and Practice can narrow it to Biology, Chemistry or Physics (owner request 2026-11-21).
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, readdirSync} from 'node:fs';
import {createSpecIndex} from '../js/engine/spec-index.js';
import {GRADE_SCHEMES} from '../js/config/app.config.js';
import {gradeFor, gradesIn, targetBand} from '../js/engine/analytics.js';
import {
  questionScience, questionsForScience, scienceLeaves, sciencesOf, specForScience, validScience,
} from '../js/engine/sciences.js';

const read = path => JSON.parse(readFileSync(new URL('../' + path, import.meta.url), 'utf8'));
const ID = 'EDX_GCSE_COMBSCI_1SC0';
const subject = read('data/subjects.json').find(s => s.subject_id === ID);
const spec = read(`data/specs/${ID}.json`);
const index = createSpecIndex();
index.add(spec);
const PACKS = {gcsebio: 'Biology', gcsechem: 'Chemistry', gcsephys: 'Physics'};
const packQuestions = Object.entries(PACKS).flatMap(([dir, science]) => readdirSync(new URL(`../data/packs/${dir}/`, import.meta.url))
  .filter(name => name.startsWith('EDX_1SC0_'))
  .flatMap(name => read(`data/packs/${dir}/${name}`).questions.map(question => ({question, science}))));

test('Combined Science is one subject with three sciences and the double grade scale', () => {
  assert.deepEqual(sciencesOf(subject), ['Biology', 'Chemistry', 'Physics']);
  assert.equal(subject.grade_scheme, 'gcse_combined');
  const grades = gradesIn('gcse_combined');
  assert.equal(grades.length, 18);
  assert.deepEqual(grades.slice(0, 4), ['9-9', '9-8', '8-8', '8-7']);
  assert.deepEqual(grades.slice(-3), ['2-1', '1-1', 'U']);
  const minima = GRADE_SCHEMES.gcse_combined.bands.map(([, min]) => min);
  assert.deepEqual(minima, [...minima].sort((a, b) => b - a));
  assert.equal(new Set(minima).size, minima.length);
  for (const other of read('data/subjects.json').filter(s => s.subject_id !== ID)) assert.equal(other.sciences, undefined);
});

test('papers are graded and rated on the double scale', () => {
  assert.equal(gradeFor(90, 'gcse_combined'), '9-9');
  assert.equal(gradeFor(62, 'gcse_combined'), '7-6');
  assert.equal(gradeFor(41, 'gcse_combined'), '5-4');
  assert.equal(gradeFor(3, 'gcse_combined'), 'U');
  assert.equal(targetBand('8-8', '7-6', 'gcse_combined'), 'exceeding');
  assert.equal(targetBand('7-6', '7-6', 'gcse_combined'), 'secure');
  assert.equal(targetBand('6-6', '7-6', 'gcse_combined'), 'developing');
  assert.equal(targetBand('6-5', '7-6', 'gcse_combined'), 'needs_work');
});

test('every 1SC0 question belongs to the science of its paper', () => {
  assert.ok(packQuestions.length > 2000);
  for (const {question, science} of packQuestions) assert.equal(questionScience(question, spec, index), science, question.question_id);
  // Questions without a science field fall back to the section of their spec points.
  for (const {question, science} of packQuestions.slice(0, 50)) {
    const {science: _drop, ...bare} = question;
    assert.equal(questionScience(bare, spec, index), science, question.question_id);
  }
});

test('one science narrows the spec, the leaves and the questions', () => {
  assert.equal(validScience(subject, 'Physics'), 'Physics');
  assert.equal(validScience(subject, ''), null);
  assert.equal(validScience(subject, 'Geology'), null);
  assert.equal(specForScience(spec, null), spec);
  const leaves = index.subjectLeaves(ID);
  let total = 0;
  for (const science of sciencesOf(subject)) {
    const narrowed = specForScience(spec, science);
    assert.deepEqual(narrowed.sections.map(s => s.title), [science]);
    const own = scienceLeaves(leaves, spec, science, index);
    assert.ok(own.length > 0);
    total += own.length;
    const questions = questionsForScience(packQuestions.map(p => p.question), science, spec, index);
    assert.ok(questions.length > 500);
    assert.ok(questions.every(q => q.science === science));
  }
  assert.equal(total, leaves.length);
});
