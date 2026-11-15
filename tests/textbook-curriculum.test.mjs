import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {createSpecIndex} from '../js/engine/spec-index.js';
import {createTextbookIndex, matchesTextbookSelection, textbookMasteryByNode} from '../js/engine/textbook-index.js';
import {filterQuestions, missingSpecPoints} from '../js/engine/filter-engine.js';
import * as api from '../js/data/api.js';

const read = path => JSON.parse(readFileSync(new URL('../' + path, import.meta.url), 'utf8'));
const specIndex = createSpecIndex();
specIndex.add(read('data/specs/EDX_ALEVEL_MATH_9MA0.json'));
const books = createTextbookIndex(read('data/curriculum/maths-textbooks.json'), specIndex);
const links = read('data/imports/maths/textbook-question-links.json').questions;
const circle = 'EDX_MATH_PURE_COORD_3.2';
const unit = (id, section) => books.attach({question_id:id, primary_spec_points:[circle], crossover_spec_points:[], include_in_custom_pool:true},
  {requirements:{[circle]:{ids:[section],precision:'subsection'}}});
const equation = unit('equation', 'TB_MATH_P1_6.2');
const tangent = unit('tangent', 'TB_MATH_P1_6.4');

test('four owner-supplied books retain all 45 chapters and 251 scoped subsections', () => {
  assert.equal(books.books.size, 4);
  assert.equal(books.chapters.size, 45);
  assert.equal(books.points.size, 251);
  assert.equal(books.points.get('TB_MATH_P1_6.2').title, 'Equation of a circle');
  assert.equal(books.points.get('TB_MATH_A1_6.2').title, 'The binomial distribution');
  assert.equal(books.points.get('TB_MATH_P2_6.2').title, 'Graphs of sec x, cosec x and cot x');
  assert.equal(specIndex.get('EDX_MATH_PURE_EXP_6.2').title, 'Gradient of e^(kx)');
  assert.equal(specIndex.subjectLeaves('EDX_ALEVEL_MATH_9MA0').length, 90);
  for (const source of read('data/imports/maths/textbook-contents-sources.json')) {
    const bytes = readFileSync(new URL('../' + source.asset, import.meta.url));
    assert.equal(createHash('sha256').update(bytes).digest('hex'), source.sha256);
  }
});

test('textbook 6.2 selects circle equations independently from the broad official circle point', () => {
  const bank = [equation, tangent];
  const ids = criteria => filterQuestions(bank, {learnedOnly:false,...criteria}, {specIndex}).matches.map(q => q.question_id);
  assert.deepEqual(ids({textbookFocus:['TB_MATH_P1_6.2']}), ['equation']);
  assert.deepEqual(ids({focus:[circle]}), ['equation','tangent']);
  assert.deepEqual(missingSpecPoints(equation,new Set(['TB_MATH_P1_6.2']),specIndex), []);
  assert.deepEqual(missingSpecPoints(tangent,new Set(['TB_MATH_P1_6.2']),specIndex), [circle]);
});

test('official and textbook learned modes are independent and preserve legacy official coverage', () => {
  assert.deepEqual(missingSpecPoints(equation,new Set([circle]),specIndex), []);
  assert.deepEqual(missingSpecPoints(equation,new Set([circle]),specIndex,{namespace:'textbook'}), [circle]);
  assert.deepEqual(missingSpecPoints(equation,new Set(['TB_MATH_P1_6.2']),specIndex,{namespace:'official'}), [circle]);
});

test('strict textbook selections reject crossover requirements and ambiguous chapter scope does not pretend to be an exact subsection', () => {
  const mixed = {...equation, textbook_requirements:{...equation.textbook_requirements,
    extra:{ids:['TB_MATH_P1_5.3'],precision:'subsection'}}};
  assert(matchesTextbookSelection(mixed,['TB_MATH_P1_6.2'],'crossover'));
  assert(!matchesTextbookSelection(mixed,['TB_MATH_P1_6.2'],'strict'));
  const ambiguous = {...equation,textbook_primary_groups:[{ids:['TB_MATH_P1_6.2','TB_MATH_P1_6.4'],precision:'chapter'}]};
  assert(!matchesTextbookSelection(ambiguous,['TB_MATH_P1_6.2']));
  assert(matchesTextbookSelection(ambiguous,['TB_MATH_P1_6.2','TB_MATH_P1_6.4']));
});

test('all 1110 source units have valid conservative textbook associations without rewriting official IDs or marks', () => {
  let count = 0;
  for (const {file} of read('data/packs/index.json').packs.filter(p => p.file.startsWith('maths/'))) {
    for (const question of read('data/packs/' + file).questions) {
      const attached = books.attach(question, links[question.question_id]);
      assert.deepEqual(attached.primary_spec_points,question.primary_spec_points);
      assert.equal(attached.question_id,question.question_id);
      assert.equal(attached.marks,question.marks);
      assert(attached.textbook_references.length);
      assert.deepEqual(missingSpecPoints(attached,new Set(books.ids),specIndex,{namespace:'textbook'}), []);
      count++;
    }
  }
  assert.equal(count,1110);
});

test('textbook ticks persist separately through account reload and never mark a broad official point', async () => {
  const values = new Map();
  globalThis.localStorage = {getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,String(value)),removeItem:key=>values.delete(key)};
  await api.init();
  await api.signUp({email:'textbooks@example.test',password:'test-password',displayName:'Textbooks'});
  await api.setTextbookLearned(['TB_MATH_P1_6.2'],true);
  assert.deepEqual(api.getProgress().learned_spec_points,[]);
  await api.setLearned(['old-official-point'],true);
  assert(api.learnedSet().has('TB_MATH_P1_6.2'));
  await api.init();
  assert.deepEqual(api.getProgress().learned_textbook_sections,['TB_MATH_P1_6.2']);
  assert.deepEqual(api.getProgress().learned_spec_points,['old-official-point']);
  await api.setTextbookLearned(['TB_MATH_P1_6.2'],false);
  assert(!api.learnedSet().has('TB_MATH_P1_6.2'));
  assert(api.learnedSet().has('old-official-point'));
});

test('book and chapter mastery count one saved mark once even when a question touches several subsections', () => {
  const question = {...equation, textbook_primary_groups:[{ids:['TB_MATH_P1_6.2','TB_MATH_P1_6.4'],precision:'subsection'}]};
  const latest = new Map([['equation',{marks_awarded:0,max_marks:3}]]);
  const scores = textbookMasteryByNode(latest,new Map([['equation',question]]),books);
  assert.deepEqual(scores.get('TB_MATH_P1_6'),{marks:0,max:3,count:1,percentage:0});
  assert.deepEqual(scores.get('TB_BOOK_P1'),{marks:0,max:3,count:1,percentage:0});
  const uncertain = {...question,textbook_primary_groups:[{...question.textbook_primary_groups[0],precision:'chapter'}]};
  const coarse = textbookMasteryByNode(latest,new Map([['equation',uncertain]]),books);
  assert(coarse.has('TB_MATH_P1_6'));
  assert(!coarse.has('TB_MATH_P1_6.2'));
});
