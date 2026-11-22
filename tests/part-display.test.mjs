// Part display: a selected part shows its own crop, only the context it needs, and
// only its own mark-scheme rows (tools/parts/refine.py). A part that builds on an
// earlier part's answer is held back until that part's topics are learnt too.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {filterQuestions, missingSpecPoints, requiredSpecPoints} from '../js/engine/filter-engine.js';
import {createSpecIndex} from '../js/engine/spec-index.js';
import {validateBundle} from '../js/data/schema.js';

const read = path => JSON.parse(readFileSync(new URL('../' + path, import.meta.url), 'utf8'));
const index = read('data/packs/index.json').packs;
const SUBJECTS = ['biology', 'physics', 'maths', 'gcsemaths', 'gcsebio', 'gcsechem', 'gcsephys'];
const packsOf = slug => index.filter(p => p.file.startsWith(slug + '/')).map(p => read('data/packs/' + p.file));

for (const slug of SUBJECTS) {
  const units = packsOf(slug).flatMap(p => p.questions);
  const byParent = Map.groupBy(units, q => q.parent_question_id);

  test(`${slug}: parts show their own crop and only the context they need`, () => {
    const multi = units.filter(q => byParent.get(q.parent_question_id).length > 1);
    const refined = multi.filter(q => q.provenance.part_display === 'refined');
    assert(refined.length >= multi.length * 0.96, `${refined.length} of ${multi.length} multi-part units re-cropped`);
    for (const q of refined) {
      // the old layout's "everything printed before this part" image is gone
      assert.doesNotMatch(q.context?.shared_stem_html || '', /preceding context/i, q.question_id);
      assert.match(q.content.question_image_url, /_(U|P)\d+\.webp$/, q.question_id);
    }
    for (const q of multi) assert(['refined', 'scheme_only'].includes(q.provenance.part_display), q.question_id);
  });

  test(`${slug}: part schemes are only published when matched to the part`, () => {
    let parts = 0;
    for (const q of units) {
      if (q.scheme_scope !== 'part') continue;
      parts++;
      assert.match(q.content.mark_scheme_image_url, /_(U|P)\d+_scheme\.webp$/, q.question_id);
      assert(['verified', 'includes_sibling_rows', 'reference_matched'].includes(q.provenance.part_scheme_check), q.question_id);
      assert(q.context.full_scheme_image_url.endsWith('_scheme.webp'));
      assert(q.provenance.part_scheme_regions.length > 0);
    }
    const multi = units.filter(q => byParent.get(q.parent_question_id).length > 1).length;
    assert(parts > multi * 0.6, `${parts} of ${multi} multi-part units have part schemes`);
  });

  test(`${slug}: context images and dependencies stay inside the question`, () => {
    for (const q of units) {
      if (q.context?.stem_image_url) assert.match(q.context.stem_image_url, new RegExp(`^assets/${slug}/${q.paper_id}/`));
      for (const id of q.depends_on_question_ids || []) {
        const dependency = units.find(u => u.question_id === id);
        assert(dependency, `${q.question_id} depends on missing ${id}`);
        assert.equal(dependency.parent_question_id, q.parent_question_id);
        assert(dependency.question_id < q.question_id, 'dependencies point to earlier parts');
      }
    }
  });
}

test('a part is held back until the earlier part it builds on is learnt too', () => {
  const specIndex = createSpecIndex();
  specIndex.add({subject_id: 'S', sections: [{id: 'SEC', title: 'All', topics: [
    {id: 'T1', code: '1', title: 'One', points: [{id: 'P1', code: '1.1', title: 'A'}]},
    {id: 'T2', code: '2', title: 'Two', points: [{id: 'P2', code: '2.1', title: 'B'}]},
  ]}]});
  const a = {question_id: 'Q1_U01', parent_question_id: 'Q1', part_label: '(a)', primary_spec_points: ['P1'], crossover_spec_points: []};
  const b = {question_id: 'Q1_U02', parent_question_id: 'Q1', part_label: '(b)', primary_spec_points: ['P2'], crossover_spec_points: [],
    depends_on_question_ids: ['Q1_U01'], dependency_spec_points: ['P1']};
  assert.deepEqual([...requiredSpecPoints(b, specIndex)].sort(), ['P1', 'P2']);
  assert.deepEqual(missingSpecPoints(b, new Set(['P2']), specIndex), ['P1']);
  const result = filterQuestions([a, b], {learnedOnly: true}, {specIndex, learned: new Set(['P2']), latestAttempts: new Map(), papersById: new Map()});
  assert.deepEqual(result.matches.map(q => q.question_id), []);
  assert.deepEqual(result.locked.map(entry => entry.question.question_id), ['Q1_U01', 'Q1_U02']);
  const both = filterQuestions([a, b], {learnedOnly: true}, {specIndex, learned: new Set(['P1', 'P2']), latestAttempts: new Map(), papersById: new Map()});
  assert.deepEqual(both.matches.map(q => q.question_id), ['Q1_U01', 'Q1_U02']);
});

test('a dependent part may supply its context as an image', () => {
  const specIndex = createSpecIndex();
  specIndex.add({subject_id: 'S', sections: [{id: 'SEC', title: 'All', topics: [{id: 'T1', code: '1', title: 'One', points: [{id: 'P1', code: '1.1', title: 'A'}]}]}]});
  const base = {source_type: 'real_past_paper', subject_id: 'S', paper_id: 'PAPER', parent_question_id: 'Q1', marks: 1, difficulty: 'easy',
    primary_spec_points: ['P1'], crossover_spec_points: [], content: {question_image_url: 'assets/maths/PAPER/Q01_U01.webp', mark_scheme_image_url: 'assets/maths/PAPER/Q01_U01_scheme.webp'}};
  const questions = [{...base, question_id: 'Q1_U01', part_label: '(a)'},
    {...base, question_id: 'Q1_U02', part_label: '(b)', depends_on_question_ids: ['Q1_U01'], context: {stem_image_url: 'assets/maths/PAPER/Q01_U02_context.webp'}}];
  const issues = validateBundle({subject: {subject_id: 'S'}, papers: [{paper_id: 'PAPER'}], questions}, specIndex);
  assert.deepEqual(issues.filter(issue => issue.level === 'error' && issue.message.includes('dependencies')), []);
});
