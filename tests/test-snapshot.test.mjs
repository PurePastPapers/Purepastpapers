import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createTestSnapshot, pinTestCrops, resolveTestSnapshot, scoreTestSnapshot, verifyTestCrops } from '../js/engine/test-snapshot.js';
import { linkGroups } from '../js/engine/linked-parts.js';

function fixture() {
  const subject = { subject_id: 'maths' };
  const paper = {
    paper_id: '9MA0-01-JUN23',
    board: 'Edexcel',
    spec_code: '9MA0',
    title: 'June 2023 Paper 1',
    level: 'A-Level',
    year: 2023,
    series: 'June',
    full_paper_pdf_url: 'https://example.test/9MA0-01.pdf',
    full_mark_scheme_pdf_url: 'https://example.test/9MA0-01-ms.pdf',
  };
  const makeQuestion = (id, number, label, marks, extra = {}) => ({
    question_id: id,
    subject_id: 'maths',
    paper_id: paper.paper_id,
    source_type: 'real_past_paper',
    qualification_code: '9MA0',
    level: 'A-Level',
    question_number: number,
    part_label: label,
    marks,
    difficulty: 'medium',
    content: { question_html: `<p>${id} prompt</p>`, question_image_url: `asset://${id}` },
    context: {},
    ...extra,
  });
  const questions = [
    makeQuestion('q3a', '3', '(a)', 1),
    makeQuestion('q3b', '3', '(b)', 2, { depends_on_question_ids: ['q3a'] }),
    makeQuestion('q4b', '4', '(b)', 2),
    makeQuestion('q5c', '5', '(c)', 3),
    makeQuestion('q6b', '6', '(b)', 2),
    makeQuestion('q6c', '6', '(c)', 2, { depends_on_question_ids: ['q6b'], context: { stem_text: 'Use your answer to (b).' } }),
    makeQuestion('choice-a', '7', '(a)', 2),
    makeQuestion('choice-b', '8', '(a)', 2),
    makeQuestion('ordinary', '9', '', 4),
  ];
  const questionsById = new Map(questions.map(question => [question.question_id, question]));
  const papersById = new Map([[paper.paper_id, paper]]);
  const groups = new Map([
    ['LINKED_q3a', ['q3a', 'q3b']],
    ['LINKED_q6b', ['q6b', 'q6c']],
  ]);
  for (const [id, ids] of groups) {
    ids.forEach((questionId, position) => {
      const question = questionsById.get(questionId);
      questionsById.set(questionId, {
        ...question,
        linked_group: { id, question_ids: ids, position, contiguous: true },
      });
    });
  }
  return { subject, questionsById, papersById };
}

const makeSnapshot = (bundle, ids, choices) => createTestSnapshot({ bundle, ids, title: 'Selected practice', choices });

test('freezes June 2023 Edexcel Q3(a)–(b) as one runner item in printed order', () => {
  const bundle = fixture();
  const snapshot = makeSnapshot(bundle, ['q3b'], []);
  assert.equal(snapshot.totalMarks, 3);
  assert.equal(snapshot.groups.length, 1);
  assert.equal(snapshot.groups[0].number, 1);
  assert.deepEqual(snapshot.groups[0].parts.map(part => [part.id, part.label, part.maxMarks]), [
    ['q3a', '(a)', 1],
    ['q3b', '(b)', 2],
  ]);
  assert.match(snapshot.groups[0].parts[0].reference, /Edexcel · 9MA0 · June 2023 Paper 1 · Q3\(a\)/);
  assert.equal(Object.isFrozen(snapshot), true);
  assert.equal(Object.isFrozen(snapshot.groups[0].parts[0]), true);
});

test('keeps standalone Q4(b) and Q5(c) selections free of unselected siblings', () => {
  const bundle = fixture();
  const snapshot = makeSnapshot(bundle, ['q4b', 'q5c'], []);
  assert.deepEqual(snapshot.groups.map(group => group.parts.map(part => part.id)), [['q4b'], ['q5c']]);
  assert.deepEqual(snapshot.groups.map(group => group.parts[0].reference.match(/Q\d+\([a-z]\)/)?.[0]), ['Q4(b)', 'Q5(c)']);
});

test('expands dependent Q6(c) with Q6(b) but keeps independent selected questions ordered', () => {
  const bundle = fixture();
  const snapshot = makeSnapshot(bundle, ['ordinary', 'q6c'], []);
  assert.deepEqual(snapshot.groups.map(group => group.parts.map(part => part.id)), [['ordinary'], ['q6b', 'q6c']]);
  assert.equal(snapshot.groups[1].number, 2);
  assert.equal(snapshot.groups[1].parts[0].maxMarks, 2);
  assert.equal(snapshot.groups[1].parts[1].maxMarks, 2);
});

test('freezes permitted alternatives and requires exactly the configured number in detailed marking', () => {
  const bundle = fixture();
  const choices = [{ count: 1, options: [['choice-a'], ['choice-b']] }];
  const snapshot = makeSnapshot(bundle, ['choice-a', 'choice-b', 'ordinary'], choices);
  assert.equal(snapshot.totalMarks, 6);
  const resolved = resolveTestSnapshot(snapshot, bundle);
  assert.throws(() => scoreTestSnapshot(snapshot, { mode: 'parts', marks: { 'choice-a': 0 }, chosenOptions: [], total: null }, resolved), /Select which options/);
  const score = scoreTestSnapshot(snapshot, {
    mode: 'parts', marks: { 'choice-a': 0, ordinary: 3 }, chosenOptions: [[0]], total: null,
  }, resolved);
  assert.equal(score.awarded, 3);
  assert.equal(score.maxMarks, 6);
  assert.equal(score.unmarked, 0);
  assert.equal(score.percentage, 50);
  assert.throws(() => scoreTestSnapshot(snapshot, {
    mode: 'parts', marks: { 'choice-a': 2, 'choice-b': 2 }, chosenOptions: [[0]], total: null,
  }, resolved), /Invalid mark/);
});

test('accepts zero, keeps unmarked parts unknown and validates an overall-only score against frozen marks', () => {
  const bundle = fixture();
  const snapshot = makeSnapshot(bundle, ['q3a', 'q3b'], []);
  const resolved = resolveTestSnapshot(snapshot, bundle);
  const partial = scoreTestSnapshot(snapshot, { mode: 'parts', marks: { q3a: 0 }, chosenOptions: [], total: null }, resolved);
  assert.equal(partial.awarded, 0);
  assert.equal(partial.maxMarks, 3);
  assert.equal(partial.percentage, null);
  assert.equal(partial.unmarked, 1);
  assert.deepEqual(partial.marks, { q3a: 0 });
  assert.equal(scoreTestSnapshot(snapshot, { mode: 'overall', total: 0 }, resolved).percentage, 0);
  assert.throws(() => scoreTestSnapshot(snapshot, { mode: 'overall', total: 4 }, resolved), /0 to 3/);
});

test('resolves exact unchanged questions, compatible legacy IDs and reports unavailable or revised content', () => {
  const original = fixture();
  const snapshot = makeSnapshot(original, ['q4b', 'q5c'], []);
  const revised = fixture();
  const changed = revised.questionsById.get('q4b');
  const oldQ5c = revised.questionsById.get('q5c');
  revised.questionsById.set('q4b', { ...changed, content: { question_html: '<p>Changed</p>' } });
  revised.questionsById.delete('q5c');
  const legacyId = { ...oldQ5c, question_id: 'q5c-v2', legacy_ids: ['q5c'] };
  revised.questionsById.set('q5c-v2', legacyId);
  const resolved = resolveTestSnapshot(snapshot, revised);
  assert.equal(resolved.has('q4b'), false);
  assert.equal(resolved.get('q5c')?.question.question_id, 'q5c-v2');
  assert.equal(snapshot.totalMarks, 5);
  const edited = makeSnapshot(revised, ['q4b'], []);
  assert.notEqual(edited.id, snapshot.id);
});

test('detects a revised scheme or prompt crop at the same path without changing the frozen test', async () => {
  const bundle = fixture();
  const prompt = 'assets/maths/PAPER/Q4B.webp';
  const scheme = 'assets/maths/PAPER/MS4B.webp';
  const context = 'assets/maths/PAPER/INTRO4.webp';
  const question = bundle.questionsById.get('q4b');
  question.content = { question_image_url: prompt, mark_scheme_image_url: scheme };
  question.context = { figures: [{ image_url: context }] };
  const initial = makeSnapshot(bundle, ['q4b'], []);
  const resolved = resolveTestSnapshot(initial, bundle);
  const versions = new Map([[prompt, 'prompt-original'], [scheme, 'scheme-original'], [context, 'intro-original']]);
  const checksums = async (paths) => new Map(paths.map(path => [path, versions.get(path)]));
  const pinned = await pinTestCrops(initial, resolved, { checksums });
  assert.notEqual(pinned.id, initial.id);
  assert.equal(pinned.totalMarks, 2);
  assert.equal(pinned.id, (await pinTestCrops(initial, resolved, { checksums })).id);
  versions.set(scheme, 'scheme-revised');
  const current = (await verifyTestCrops(pinned, resolved, { checksums })).get('q4b');
  assert.equal(current.promptRevised, false);
  assert.equal(current.schemeRevised, true);
  versions.set(context, 'intro-revised');
  assert.equal((await verifyTestCrops(pinned, resolved, { checksums })).get('q4b').promptRevised, true);
  assert.equal(await verifyTestCrops(initial, resolved, { checksums }), resolved);
});

test('real Edexcel 9MA0/01 June 2023 Q3(a)–(b) and standalone Q4(b) retain exact scoring parts', () => {
  const pack = JSON.parse(readFileSync(new URL('../data/packs/maths/EDX_9MA0_2023_JUNE_01.json', import.meta.url)));
  const questionsById = new Map(pack.questions.map(question => [question.question_id, question]));
  const papersById = new Map(pack.papers.map(paper => [paper.paper_id, paper]));
  linkGroups(questionsById, papersById);
  const bundle = { subject: { subject_id: pack.papers[0].subject_id }, questionsById, papersById };
  const q3b = 'EDX_9MA0_2023_JUNE_01_Q03_U02';
  const linked = makeSnapshot(bundle, [q3b], []);
  assert.deepEqual(linked.groups.map(group => group.parts.map(part => part.id)), [[
    'EDX_9MA0_2023_JUNE_01_Q03_U01', q3b,
  ]]);
  assert.deepEqual(linked.groups[0].parts.map(part => part.maxMarks), [1, 2]);
  assert.match(linked.groups[0].reference, /9MA0 · June 2023 · A-Level Pure Mathematics 01 · Q3/);

  const q4b = 'EDX_9MA0_2023_JUNE_01_Q04_U02';
  const standalone = makeSnapshot(bundle, [q4b], []);
  assert.deepEqual(standalone.groups.map(group => group.parts.map(part => part.id)), [[q4b]]);
  assert.equal(standalone.totalMarks, 2);
});

test('real AQA Politics choice groups preserve their two allowed alternatives and single-answer rule', () => {
  const pack = JSON.parse(readFileSync(new URL('../data/packs/politics/AQA_7152_2020_NOVEMBER_01.json', import.meta.url)));
  const paper = pack.papers[0];
  const options = paper.choice_groups[0].map(option => Array.isArray(option) ? option : [option]);
  const ids = options.flat();
  const questionsById = new Map(pack.questions.map(question => [question.question_id, question]));
  const papersById = new Map([[paper.paper_id, paper]]);
  linkGroups(questionsById, papersById);
  const bundle = { subject: { subject_id: paper.subject_id }, questionsById, papersById };
  const snapshot = makeSnapshot(bundle, ids, [{ count: 1, options }]);
  assert.equal(snapshot.choices[0].count, 1);
  assert.deepEqual(snapshot.choices[0].options.map(option => option.partIds), options);
  assert.equal(snapshot.choices[0].options[0].maxMarks, 25);
  assert.equal(snapshot.choices[0].options[1].maxMarks, 25);
  assert.equal(snapshot.totalMarks, 25);
});
