// Site-wide AS / A-Level label audit. Every paper keeps its own level and code; subjects
// holding more than one qualification label every paper card, from per-paper metadata.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { isMultiLevel, levelLabel, levelOf, paperCode, qualificationCode } from '../js/engine/paper-identity.js';

const read = (path) => JSON.parse(readFileSync(new URL(`../${path}`, import.meta.url), 'utf8'));
const subjects = read('data/subjects.json');
const index = read('data/packs/index.json').packs.filter((entry) => entry.enabled !== false);
const packs = index.map((entry) => read(`data/packs/${entry.file}`));

/** Papers as the app merges them: base catalogue, then pack records over the top. */
function papersOf(subject) {
  const path = `data/papers/${subject.subject_id}.json`;
  const byId = new Map((existsSync(new URL(`../${path}`, import.meta.url)) ? read(path) : []).map((paper) => [paper.paper_id, paper]));
  for (const pack of packs) for (const paper of pack.papers || []) {
    if (paper.subject_id === subject.subject_id) byId.set(paper.paper_id, { ...byId.get(paper.paper_id), ...paper });
  }
  return [...byId.values()].filter((paper) => !paper.is_sample);
}

// The banks that genuinely hold both AS and A-Level papers today (verified from pack metadata).
const DUAL_BANKS = {
  EDX_ALEVEL_MATH_9MA0: ['9MA0', '8MA0'],
  EDX_ALEVEL_BIOL_9BN0: ['9BN0', '8BN0'],
  OCR_ALEVEL_CHEM_H432: ['H432', 'H032'],
  EDX_ALEVEL_PHYS_9PH0: ['9PH0', '8PH0'],
  OCR_ALEVEL_CS_H446: ['H446', 'H046'],
  AQA_ALEVEL_GEOG_7037: ['7037', '7036'],
  EDX_ALEVEL_ENGLIT_9ET0: ['9ET0', '8ET0'],
  AQA_ALEVEL_PSYCH_7182: ['7182', '7181'],
  AQA_ALEVEL_SOC_7192: ['7192', '7191'],
  EDX_ALEVEL_FMATH_9FM0: ['9FM0', '8FM0'],
};

test('the dual-level banks found in the data are exactly the audited list', () => {
  const found = subjects.filter((subject) => new Set(papersOf(subject).map((paper) => levelOf(paper, subject))).size > 1).map((subject) => subject.subject_id);
  assert.deepEqual(found.sort(), Object.keys(DUAL_BANKS).sort(), 'a new dual-level subject needs adding to this audit');
});

for (const subject of subjects) {
  const papers = papersOf(subject);
  if (!papers.length) continue;
  const declared = new Map((subject.qualifications || []).map((entry) => [entry.code, entry]));

  test(`${subject.subject_id}: every paper's level and code come from its own metadata`, () => {
    for (const paper of papers) {
      const level = levelOf(paper, subject);
      const code = qualificationCode(paper, subject);
      assert(level, `${paper.paper_id} has no level`);
      assert(paper.spec_code || paper.qualification_code, `${paper.paper_id} has no per-paper code`);
      if (declared.size) {
        const entry = declared.get(code);
        assert(entry, `${paper.paper_id}: ${code} is not a declared qualification`);
        assert.equal(level, entry.is_as ? 'AS' : entry.label, paper.paper_id);
      }
      if (paper.is_as === true) assert.equal(level, 'AS', paper.paper_id);
      if (level === 'AS' && code !== subject.spec_code) {
        assert(!paperCode(paper, subject).includes(subject.spec_code), `${paper.paper_id} shows the A-Level code`);
      }
      // The label does not depend on the title, which the cards shorten.
      assert.equal(levelOf({ ...paper, title: 'Untitled' }, subject), level);
    }
  });

  if (DUAL_BANKS[subject.subject_id]) {
    test(`${subject.subject_id}: AS and A-Level cards are both labelled with their own codes`, () => {
      const [aCode, asCode] = DUAL_BANKS[subject.subject_id];
      assert(isMultiLevel(subject, papers));
      const as = papers.filter((paper) => levelOf(paper, subject) === 'AS');
      const a = papers.filter((paper) => levelOf(paper, subject) === 'A-Level');
      assert(as.length && a.length, 'needs at least one AS and one A-Level paper');
      for (const paper of as) {
        assert.equal(levelLabel(paper, subject, papers), 'AS');
        assert(paperCode(paper, subject).startsWith(asCode), `${paper.paper_id}: ${paperCode(paper, subject)}`);
      }
      for (const paper of a) {
        assert.equal(levelLabel(paper, subject, papers), 'A-Level');
        assert(paperCode(paper, subject).startsWith(aCode), `${paper.paper_id}: ${paperCode(paper, subject)}`);
      }
    });
  } else if (!(subject.qualifications || []).length || subject.qualifications.length === 1) {
    test(`${subject.subject_id}: a single-qualification subject gets no level label`, () => {
      assert(!isMultiLevel(subject, papers));
      for (const paper of papers) assert.equal(levelLabel(paper, subject, papers), '');
      assert(!papers.some((paper) => levelOf(paper, subject) === 'AS'));
    });
  }
}

test('Further Mathematics labels its A-Level papers A-Level and its AS 8FM0 papers AS', () => {
  const subject = subjects.find((entry) => entry.subject_id === 'EDX_ALEVEL_FMATH_9FM0');
  const papers = papersOf(subject);
  assert(isMultiLevel(subject, papers), 'two qualifications are declared');
  for (const paper of papers) assert.equal(levelLabel(paper, subject, papers), paper.qualification_code === '8FM0' ? 'AS' : 'A-Level', paper.paper_id);
  assert(papers.some((paper) => paper.qualification_code === '8FM0'), 'verified AS component rows are present');
  const asPaper = { paper_id: 'fixture', level: 'AS', spec_code: '8FM0', qualification_code: '8FM0', paper_code: '01', title: 'June 2024 · AS Paper 1: Core Pure Mathematics' };
  assert.equal(levelLabel(asPaper, subject, papers), 'AS');
  assert.equal(paperCode(asPaper, subject), '8FM0 · 01');
});
