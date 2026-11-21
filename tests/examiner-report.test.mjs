// Examiner reports: matching report sections to questions and parts
// (js/engine/examiner-report.js), and the shape of any extracted report files
// (tools/reports/extract.py, docs/EXAMINER-REPORTS.md).
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { groupSections, normPart, pageLink, sectionsFor, unitParts } from '../js/engine/examiner-report.js';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const section = (id, ...targets) => ({ id, heading: id, targets: targets.map(([q, part = '']) => ({ q, part })), pages: [3], paras: [{ k: 'p', t: id }], figures: [] });
const unit = (question_number, part_label, original_parts) => ({ question_id: `Q${question_number}${part_label || ''}`, question_number, part_label, provenance: original_parts ? { original_parts } : {} });

test('part labels normalise like the extractor', () => {
  assert.equal(normPart('(a) (ii)'), '(a)(ii)');
  assert.equal(normPart('aii'), '(a)(ii)');
  assert.equal(normPart('a(ii)'), '(a)(ii)');
  assert.equal(normPart('(ii)'), '(ii)');
  assert.equal(normPart('ii'), '(ii)');
  assert.equal(normPart(''), '');
  assert.deepEqual(unitParts(unit('4', '(b)(i)–(ii)')), ['(b)(i)', '(b)(ii)']);
  assert.deepEqual(unitParts(unit('4', '(a)–(b)', ['(a)', '(b)'])), ['(a)', '(b)']);
  assert.deepEqual(unitParts(unit('4', null, [''])), []);
  assert.deepEqual(unitParts(unit('4', '(d)(iii) + (d)(iii)')), ['(d)(iii)']);
});

const report = {
  sections: [
    section('Q1', ['1']),
    section('Q2a', ['2', '(a)']),
    section('Q2bi', ['2', '(b)(i)']),
    section('Q2bii', ['2', '(b)(ii)']),
    section('Q3', ['3']),
    section('Q3b', ['3', '(b)']),
    section('Q4and5', ['4'], ['5']),
    section('Q6c', ['6', '(c)']),
    section('Q10', ['10']),
  ],
};
const ids = (result) => result.matches.map((match) => `${match.section.id}:${match.relation}`);

test('a part gets its own comments, sub-parts included', () => {
  assert.deepEqual(ids(sectionsFor(unit('2', '(a)'), report)), ['Q2a:own']);
  assert.deepEqual(ids(sectionsFor(unit('2', '(b)'), report)), ['Q2bi:own', 'Q2bii:own']);
  assert.equal(sectionsFor(unit('2', '(b)'), report).scope, 'part');
});

test('whole-question comments come first and the scope says what was found', () => {
  assert.deepEqual(ids(sectionsFor(unit('3', '(b)'), report)), ['Q3:whole', 'Q3b:own']);
  const a = sectionsFor(unit('3', '(a)'), report);
  assert.deepEqual(ids(a), ['Q3:whole']);
  assert.equal(a.scope, 'full_question');
});

test('a sub-part falls back to its parent part', () => {
  const result = sectionsFor(unit('6', '(c)(ii)'), report);
  assert.deepEqual(ids(result), ['Q6c:parent']);
  assert.equal(result.scope, 'parent_part');
});

test('a whole question owns all its comments; shared headings reach both questions', () => {
  assert.deepEqual(ids(sectionsFor(unit('2', null, ['']), report)), ['Q2a:own', 'Q2bi:own', 'Q2bii:own']);
  assert.deepEqual(ids(sectionsFor(unit('5', null), report)), ['Q4and5:whole']);
  assert.deepEqual(ids(sectionsFor(unit('01', null), report)), ['Q1:whole']); // "01" is question 1
  assert.deepEqual(ids(sectionsFor(unit('1', null), report)), ['Q1:whole']); // not Q10
});

test('no comment and no report are told apart', () => {
  assert.equal(sectionsFor(unit('7', '(a)'), report).scope, 'none');
  assert.equal(sectionsFor(unit('7', '(a)'), null).scope, 'none');
});

test('linked parts show whole-question comments once and say where a shared one is', () => {
  const parts = [unit('3', '(a)'), unit('3', '(b)')];
  const { whole, perPart } = groupSections(parts, report);
  assert.deepEqual(whole.map((s) => s.id), ['Q3']);
  assert.deepEqual(perPart.get(parts[1].question_id).matches.map((m) => m.section.id), ['Q3b']);
  const shared = { sections: [section('Q8b', ['8', '(b)'])] };
  const subs = [unit('8', '(b)(i)'), unit('8', '(b)(ii)')];
  const grouped = groupSections(subs, shared);
  assert.equal(grouped.perPart.get(subs[0].question_id).matches[0].firstShownWith, null);
  assert.equal(grouped.perPart.get(subs[1].question_id).matches[0].firstShownWith, subs[0].question_id);
});

test('page links only go to https PDFs', () => {
  assert.equal(pageLink('https://x.test/r.pdf', 7), 'https://x.test/r.pdf#page=7');
  assert.equal(pageLink('javascript:alert(1)', 2), null);
});

// Every A-level Maths, Physics and Biology unit has a part list the matcher can read, so a
// report that comments on it reaches it.
test('every Maths, Physics and Biology unit has readable parts', () => {
  for (const slug of ['maths', 'physics', 'biology']) {
    for (const file of readdirSync(path.join(root, 'data/packs', slug))) {
      const pack = JSON.parse(readFileSync(path.join(root, 'data/packs', slug, file), 'utf8'));
      for (const question of pack.questions) {
        const parts = unitParts(question);
        for (const part of parts) assert.match(part, /^(\([a-z]+\))+$/, `${question.question_id}: ${part}`);
        if (question.part_label) assert.ok(parts.length, `${question.question_id} has a label but no parts`);
        // A report that comments on each of the unit's parts reaches it as its own.
        const own = { sections: parts.map((part, index) => section(`s${index}`, [question.question_number, part])) };
        if (parts.length) assert.equal(sectionsFor(question, own).scope, 'part', question.question_id);
      }
    }
  }
});

test('extracted report files are well formed and indexed', () => {
  const dir = path.join(root, 'data/reports');
  if (!existsSync(dir)) return;
  const index = JSON.parse(readFileSync(path.join(dir, 'index.json'), 'utf8'));
  assert.equal(index.format, 'examiner-report-index-v1');
  const files = readdirSync(dir, { withFileTypes: true }).filter((entry) => entry.isDirectory())
    .flatMap((entry) => readdirSync(path.join(dir, entry.name)).filter((name) => name.endsWith('.json')).map((name) => `${entry.name}/${name}`));
  assert.equal(Object.keys(index.papers).length, files.length, 'index.json lists every report file');
  for (const file of files) {
    const data = JSON.parse(readFileSync(path.join(dir, file), 'utf8'));
    assert.equal(data.format, 'examiner-report-text-v1', file);
    assert.equal(index.papers[data.paper_id]?.file, file);
    assert.match(data.source_url, /^https:\/\//);
    assert.match(data.source_sha256, /^[0-9a-f]{64}$/);
    assert.ok(Array.isArray(data.sections));
    for (const entry of data.sections) {
      assert.ok(entry.targets.length && entry.targets.every((target) => /^\d+$/.test(target.q)), `${file} ${entry.heading}`);
      assert.ok(entry.paras.every((para) => ['p', 'li', 'h', 'ex', 'tip'].includes(para.k) && typeof para.t === 'string'));
    }
  }
});
