import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createSpecIndex } from '../js/engine/spec-index.js';
import { filterQuestions } from '../js/engine/filter-engine.js';
import { latestByQuestion } from '../js/engine/analytics.js';

// Codes are labels, not numbers. In particular 2.10 follows 2.9, and the
// author's B2-before-A1 order must survive every range and sort operation.
const specA = {
  subject_id: 'A',
  sections: [
    { id: 'A_S1', code: 'I', title: 'Mechanics', topics: [
      { id: 'A_T2', code: '2', title: 'Motion', points: [
        { id: 'A_29', code: '2.9', title: 'Momentum' },
        { id: 'A_210', code: '2.10', title: 'Impulse' },
        { id: 'A_211', code: '2.11', title: 'Collisions' },
      ] },
      { id: 'A_EMPTY', code: '3', title: 'Independent topic', points: [] },
    ] },
    { id: 'A_S2', title: 'Author-defined order', topics: [
      { id: 'A_ALPHA', code: 'A', title: 'Practical work', points: [
        { id: 'A_B2', code: 'B2', title: 'Investigate' },
        { id: 'A_A1', code: 'A1', title: 'Evaluate' },
      ] },
    ] },
    { id: 'A_EMPTY_SECTION', title: 'No topics', topics: [] },
  ],
};
const specB = {
  subject_id: 'B',
  sections: [{ id: 'B_S1', title: 'Another subject', topics: [
    { id: 'B_T2', code: '2', title: 'Different topic', points: [
      { id: 'B_210', code: '2.10', title: 'A reused code in a different course' },
    ] },
  ] }],
};
const specIndex = createSpecIndex();
specIndex.add(specA);
specIndex.add(specB);
const context = { specIndex };
const q = (id, primary, crossover = [], extra = {}) => ({
  question_id: id, subject_id: 'A', paper_id: 'P25', source_type: 'real_past_paper',
  marks: 4, difficulty: 'medium', primary_spec_points: primary, crossover_spec_points: crossover,
  content: { question_html: '<p>Explain this result.</p>' }, ...extra,
});
const matches = (pool, criteria = {}, ctx = context) => filterQuestions(pool, { learnedOnly: false, ...criteria }, ctx).matches.map((item) => item.question_id);
const pool = [
  q('nine', ['A_29']),
  q('ten', ['A_210']),
  q('both', ['A_29', 'A_210']),
  q('cross', ['A_29'], ['A_210', 'B_210']),
  q('topic', ['A_T2']),
  q('foreign', ['B_210'], [], { subject_id: 'B' }),
];

test('subjectNodes preserves authored traversal, code/title/type/parent and idempotent add', () => {
  const index = createSpecIndex();
  index.add(specA);
  index.add(specB);
  const nodes = index.subjectNodes('A');
  assert.deepEqual(nodes.map((node) => node.id), ['A_S1', 'A_T2', 'A_29', 'A_210', 'A_211', 'A_EMPTY', 'A_S2', 'A_ALPHA', 'A_B2', 'A_A1', 'A_EMPTY_SECTION']);
  assert.deepEqual(nodes.slice(0, 3).map(({ code, title, type, parent }) => ({ code, title, type, parent })), [
    { code: 'I', title: 'Mechanics', type: 'section', parent: null },
    { code: '2', title: 'Motion', type: 'topic', parent: 'A_S1' },
    { code: '2.9', title: 'Momentum', type: 'point', parent: 'A_T2' },
  ]);
  index.add({ ...specA, sections: [] });
  assert.deepEqual(index.subjectNodes('A'), nodes);
  assert.deepEqual(index.subjectNodes('missing'), []);
});

test('ranges include 2.9, 2.10, 2.11 and alphanumeric leaves in authored order', () => {
  assert.deepEqual([...specIndex.range('A', 'A_29', 'A_211')], ['A_29', 'A_210', 'A_211']);
  assert.deepEqual([...specIndex.range('A', 'A_210', 'A_210')], ['A_210']);
  assert.deepEqual([...specIndex.range('A', 'A_B2', 'A_A1')], ['A_B2', 'A_A1']);
  assert.deepEqual([...specIndex.range('A', 'A_T2', 'A_T2')], ['A_29', 'A_210', 'A_211']);
  assert.deepEqual([...specIndex.range('A', 'A_S1', 'A_ALPHA')], ['A_29', 'A_210', 'A_211', 'A_EMPTY', 'A_B2', 'A_A1']);
  assert.deepEqual([...specIndex.range('A', 'A_EMPTY', 'A_EMPTY')], ['A_EMPTY']);
});

test('ranges reject reversed, unknown, empty, cross-subject and bare-code endpoints', () => {
  for (const [subjectId, fromId, toId] of [
    ['A', 'A_211', 'A_29'], ['A', 'A_A1', 'A_B2'], ['A', 'missing', 'A_211'],
    ['missing', 'A_29', 'A_211'], ['A', 'A_29', 'B_210'], ['A', 'B_210', 'A_211'],
    ['A', 'A_EMPTY_SECTION', 'A_211'], ['A', '2.9', '2.11'],
  ]) assert.deepEqual([...specIndex.range(subjectId, fromId, toId)], [], `${subjectId}: ${fromId} → ${toId}`);
  assert.deepEqual([...specIndex.range('B', 'B_210', 'B_210')], ['B_210']);
});

test('explicit board point_order overrides paper-grouped traversal without changing node identity', () => {
  const index = createSpecIndex();
  index.add({ ...specA, point_order: ['A_B2', 'A_A1', 'A_29', 'A_210', 'A_211', 'A_EMPTY'] });
  assert.deepEqual(index.subjectLeaves('A'), ['A_B2', 'A_A1', 'A_29', 'A_210', 'A_211', 'A_EMPTY']);
  assert.deepEqual([...index.range('A', 'A_ALPHA', 'A_T2')], ['A_B2', 'A_A1', 'A_29', 'A_210', 'A_211']);
  assert.deepEqual([...index.range('A', 'A_29', 'A_A1')], []);
  assert.deepEqual(index.subjectNodes('A').map((node) => node.id), specIndex.subjectNodes('A').map((node) => node.id));
  assert.deepEqual([...index.expand(['A_T2'])], ['A_29', 'A_210', 'A_211']);
  const bank = [q('motion', ['A_29']), q('evaluate', ['A_A1']), q('investigate', ['A_B2'])];
  assert.deepEqual(matches(bank, { sortBy: 'spec' }, { specIndex: index }), ['investigate', 'evaluate', 'motion']);
});

test('malformed explicit point_order is rejected atomically instead of accepting partial or foreign ranges', () => {
  for (const point_order of [null, ['A_29'], ['A_29', 'A_210', 'A_211', 'A_EMPTY', 'A_B2', 'A_B2'], ['A_29', 'A_210', 'A_211', 'A_EMPTY', 'A_B2', 'B_210']]) {
    const index = createSpecIndex();
    assert.throws(() => index.add({ ...specA, point_order }), /every leaf exactly once/);
    assert.equal(index.hasSubject('A'), false);
    assert.equal(index.has('A_29'), false);
    index.add(specA);
    assert.equal(index.hasSubject('A'), true);
  }
});

test('focus any/all uses expanded primary selections and optional crossover scope', () => {
  assert.deepEqual(matches(pool, { focus: ['A_29', 'A_210'] }), ['nine', 'ten', 'both', 'cross', 'topic']);
  assert.deepEqual(matches(pool, { focus: ['A_29', 'A_210'], focusMode: 'all' }), ['both', 'topic']);
  assert.deepEqual(matches(pool, { focus: ['A_29', 'A_210'], focusMode: 'all', focusScope: 'primary_and_crossover' }), ['both', 'cross', 'topic']);
  assert.deepEqual(matches(pool, { focus: ['B_210'] }), ['foreign']);
  assert.deepEqual(matches(pool, { focus: ['B_210'], focusScope: 'primary_and_crossover' }), ['cross', 'foreign']);
  assert.deepEqual(matches(pool, { focus: ['A_T2'], focusMode: 'all' }), ['topic']);
  assert.deepEqual(matches(pool, { focus: [] }), []);
  assert.deepEqual(matches(pool, { focus: [], focusMode: 'all' }), []);
});

test('spec ranges are ANDed independently with focus using the selected scope and mode', () => {
  const range = { subjectId: 'A', fromId: 'A_210', toId: 'A_211' };
  assert.deepEqual(matches(pool, { specRange: range }), ['ten', 'both', 'topic']);
  assert.deepEqual(matches(pool, { specRange: range, focus: ['A_29'] }), ['both', 'topic']);
  assert.deepEqual(matches(pool, { specRange: range, focus: ['A_29'], focusScope: 'primary_and_crossover' }), ['both', 'cross', 'topic']);
  assert.deepEqual(matches(pool, { specRange: range, focus: ['A_29'], focusMode: 'all' }), ['topic']);
  assert.deepEqual(matches(pool, { specRange: { ...range, fromId: 'missing' }, focusMode: 'all' }), []);
});

test('strict selection fits all required points without requiring every selected point', () => {
  const bank = [q('one', ['A_29']), q('two', ['A_210']), q('outside', ['A_29'], ['A_211']), q('other', ['A_211'])];
  const range = { subjectId: 'A', fromId: 'A_29', toId: 'A_210' };
  assert.deepEqual(matches(bank, { specRange: range, selectionMode: 'strict' }), ['one', 'two']);
  assert.deepEqual(matches(bank, { specRange: range, selectionMode: 'crossover' }), ['one', 'two', 'outside']);
  assert.deepEqual(matches(bank, { focus: ['A_29', 'A_210'], selectionMode: 'strict' }), ['one', 'two']);
  assert.deepEqual(matches(bank, { focus: [], selectionMode: 'strict' }), []);
  assert.deepEqual(matches(bank, { focus: ['A_29'], specRange: range, selectionMode: 'strict' }), ['one']);
  assert.deepEqual(filterQuestions(bank, { specRange: range, selectionMode: 'crossover' }, { specIndex, learned: new Set(['A_29', 'A_210']) }).matches.map(q => q.question_id), ['one', 'two']);
});

test('curriculum view is an independent assessed-point filter and never changes learned coverage', () => {
  const learned = new Set(['A_29']);
  const before = [...learned];
  const bank = [q('nine', ['A_29']), q('ten', ['A_210']), q('cross-only', ['A_211'], ['A_210'])];
  const ctx = { specIndex, learned };
  assert.deepEqual(matches(bank, { curriculumPoints: ['A_210'] }, ctx), ['ten']);
  assert.deepEqual(matches(bank, { curriculumPoints: [] }, ctx), []);
  assert.deepEqual(matches(bank, { curriculumPoints: ['A_210'], focus: ['A_29'], selectionMode: 'crossover' }, ctx), []);
  assert.deepEqual(filterQuestions(bank, { curriculumPoints: ['A_210'] }, ctx).matches, []);
  assert.deepEqual([...learned], before);
});

test('mark status uses latest valid explicit mark, including zero', () => {
  const attempts = latestByQuestion([
    { question_id: 'nine', marks_awarded: 0, max_marks: 4, timestamp: '2026-01-01' },
    { question_id: 'nine', marks_awarded: null, max_marks: 4, timestamp: '2026-01-02' },
    { question_id: 'ten', marks_awarded: 3, max_marks: 4, timestamp: '2026-01-01' },
    { question_id: 'both', marks_awarded: 4, max_marks: 4, timestamp: '2026-01-01' },
  ]);
  const ctx = { specIndex, latestAttempts: attempts };
  assert.deepEqual(matches(pool, { markStatus: 'unmarked' }, ctx), ['cross', 'topic', 'foreign']);
  assert.deepEqual(matches(pool, { markStatus: 'marked' }, ctx), ['nine', 'ten', 'both']);
  assert.deepEqual(matches(pool, { markStatus: 'lost' }, ctx), ['nine', 'ten']);
  assert.deepEqual(matches(pool, { markStatus: 'full' }, ctx), ['both']);
});

test('date order uses paper metadata and stable shuffle covers the entire filtered set', () => {
  const papersById = new Map([
    ['P24', { year: 2024, series: 'June', question_ids: ['old1', 'old2'] }],
    ['P25', { year: 2025, series: 'June', question_ids: ['new1', 'new2'] }],
    ['D', { year: null, series: 'Demo' }],
  ]);
  const bank = [q('old2', ['A_29'], [], { paper_id: 'P24' }), q('new2', ['A_29']), q('demo', ['A_29'], [], { paper_id: 'D' }), q('old1', ['A_29'], [], { paper_id: 'P24' }), q('new1', ['A_29'])];
  const ctx = { specIndex, papersById };
  assert.deepEqual(matches(bank, { sortBy: 'newest' }, ctx), ['new1', 'new2', 'old1', 'old2', 'demo']);
  assert.deepEqual(matches(bank, { sortBy: 'oldest' }, ctx), ['old1', 'old2', 'new1', 'new2', 'demo']);
  const first = matches(bank, { sortBy: 'shuffle', shuffleSeed: 123 }, ctx);
  assert.deepEqual(first, matches(bank, { sortBy: 'shuffle', shuffleSeed: 123 }, ctx));
  assert.notDeepEqual(first, matches(bank, { sortBy: 'shuffle', shuffleSeed: 321 }, ctx));
  assert.deepEqual([...first].sort(), bank.map(q => q.question_id).sort());
});

test('learned-only remains an AND gate over all primary and crossover requirements', () => {
  const criteria = { focus: ['A_29'], focusScope: 'primary_and_crossover' };
  const insufficient = filterQuestions([pool[3]], criteria, { specIndex, learned: new Set(['A_29', 'A_210']) });
  assert.deepEqual(insufficient.matches, []);
  assert.deepEqual(insufficient.locked.map((entry) => entry.missing), [['B_210']]);
  const sufficient = filterQuestions([pool[3]], criteria, { specIndex, learned: new Set(['A_29', 'A_210', 'B_210']) });
  assert.deepEqual(sufficient.matches.map((item) => item.question_id), ['cross']);
  const topicLocked = filterQuestions([pool[4]], {}, { specIndex, learned: new Set(['A_29', 'A_210']) });
  assert.deepEqual(topicLocked.locked[0].missing, ['A_211']);
});

test('paper metadata filters combine with each other and tier overrides', () => {
  const papersById = new Map([
    ['P25', { year: 2025, series: 'June', tier: 'Higher' }],
    ['P24', { year: 2024, series: 'November', tier: 'Foundation' }],
    ['DEMO', { year: null, series: 'Demo', tier: null }],
  ]);
  const bank = [
    q('higher', ['A_29']),
    q('override', ['A_29'], [], { tier: 'Foundation' }),
    q('old', ['A_29'], [], { paper_id: 'P24' }),
    q('unknown', ['A_29'], [], { paper_id: 'MISSING', year: 2025, series: 'June' }),
    q('null-tier', ['A_29'], [], { tier: null }),
    q('demo', ['A_29'], [], { paper_id: 'DEMO' }),
  ];
  const ctx = { specIndex, papersById };
  assert.deepEqual(matches(bank, { years: [2025], series: ['June'], tiers: ['Foundation'] }, ctx), ['override']);
  assert.deepEqual(matches(bank, { years: new Set([2024, 2025]), series: ['November', 'June'], tiers: ['Higher', 'Foundation'] }, ctx), ['higher', 'override', 'old']);
  assert.deepEqual(matches(bank, { paperIds: ['P24'], years: [2025] }, ctx), []);
  assert.deepEqual(matches(bank, { years: [2025] }), []);
  assert.deepEqual(matches(bank, { series: ['June'] }, ctx), ['higher', 'override', 'null-tier']);
  assert.deepEqual(matches(bank, { tiers: ['Higher'] }, ctx), ['higher']);
  assert.deepEqual(matches(bank, { series: ['Demo'] }, ctx), ['demo']);
  assert.deepEqual(matches(bank, { years: [], series: [], tiers: [] }, ctx), bank.map((item) => item.question_id));
});

test('sample visibility is independent from official/AI source type', () => {
  const bank = [
    q('real-demo', ['A_29'], [], { is_sample: true }),
    q('real-import', ['A_29']),
    q('ai-demo', ['A_29'], [], { source_type: 'ai_spec_question', is_sample: true }),
    q('ai-import', ['A_29'], [], { source_type: 'ai_spec_question', is_sample: false }),
  ];
  assert.deepEqual(matches(bank), ['real-demo', 'real-import', 'ai-demo', 'ai-import']);
  assert.deepEqual(matches(bank, { sampleMode: 'hide' }), ['real-import', 'ai-import']);
  assert.deepEqual(matches(bank, { sampleMode: 'only', sourceTypes: ['real_past_paper'] }), ['real-demo']);
  assert.deepEqual(matches(bank, { sampleMode: 'hide', sourceTypes: ['real_past_paper'] }), ['real-import']);
});

test('spec sort uses authored primary order with stable ties and unknown fallback', () => {
  const bank = [
    q('eleven', ['A_211'], ['A_29']), q('unknown-one', ['UNKNOWN']),
    q('ten', ['A_210']), q('nine', ['A_29']), q('nine-tie', ['A_29']),
    q('alpha-A1', ['A_A1']), q('alpha-B2', ['A_B2']), q('unknown-two', []),
  ];
  assert.deepEqual(matches(bank, { sortBy: 'spec' }), ['nine', 'nine-tie', 'ten', 'eleven', 'alpha-B2', 'alpha-A1', 'unknown-one', 'unknown-two']);
  assert.deepEqual(matches(bank, { sortBy: 'paper_order' }), bank.map((item) => item.question_id));
  assert.deepEqual(bank.map((item) => item.question_id), ['eleven', 'unknown-one', 'ten', 'nine', 'nine-tie', 'alpha-A1', 'alpha-B2', 'unknown-two']);
});

test('difficulty and marks sorting preserve ties and put missing metadata last', () => {
  const bank = [
    q('hard', ['A_29'], [], { difficulty: 'hard', marks: 8 }),
    q('medium', ['A_29'], [], { marks: 4 }),
    q('easy', ['A_29'], [], { difficulty: 'easy', marks: 2 }),
    q('stretch', ['A_29'], [], { difficulty: 'extra_hard', marks: 12 }),
    q('medium-tie', ['A_29'], [], { marks: 4 }),
    q('unknown', ['A_29'], [], { difficulty: undefined, marks: undefined }),
  ];
  assert.deepEqual(matches(bank, { sortBy: 'difficulty' }), ['easy', 'medium', 'medium-tie', 'hard', 'stretch', 'unknown']);
  assert.deepEqual(matches(bank, { sortBy: 'marks_asc' }), ['easy', 'medium', 'medium-tie', 'hard', 'stretch', 'unknown']);
  assert.deepEqual(matches(bank, { sortBy: 'marks_desc' }), ['stretch', 'hard', 'medium', 'medium-tie', 'easy', 'unknown']);
});

test('search discovers primary/crossover codes and titles, HTML text and part labels', () => {
  const bank = [q('searchable', ['A_29'], ['B_210'], { part_label: '(b)(ii)', content: { question_html: '<p>Describe <strong>acceleration</strong>.</p>' } })];
  for (const search of ['2.9', 'Momentum', 'reused code', '(b)(ii)', 'acceleration']) assert.deepEqual(matches(bank, { search }), ['searchable']);
  assert.deepEqual(matches(bank, { search: 'absent word' }), []);
});

test('combined spec, difficulty, marks, year and progress filters intersect and sorting preserves the set', () => {
  const bank = [
    q('easy-match', ['A_29'], [], { difficulty: 'easy', marks: 2 }),
    q('medium-match', ['A_210'], [], { marks: 5 }),
    q('hard-excluded', ['A_29'], [], { difficulty: 'hard' }),
    q('year-excluded', ['A_29'], [], { paper_id: 'P24' }),
    q('marks-excluded', ['A_29'], [], { marks: 8 }),
    q('saved-excluded', ['A_29']),
    q('prerequisite-excluded', ['A_29'], ['A_211']),
  ];
  const ctx = { specIndex, papersById: new Map([['P25', { year: 2025 }], ['P24', { year: 2024 }]]),
    latestAttempts: new Map([['saved-excluded', { marks_awarded: 0, max_marks: 4 }]]) };
  const criteria = { focus: ['A_29', 'A_210'], selectionMode: 'strict', difficulties: ['easy', 'medium'],
    markBands: [{ min: 2, max: 5 }], years: [2025], markStatus: 'unmarked' };
  for (const sortBy of ['newest', 'oldest', 'marks_desc', 'difficulty', 'shuffle']) {
    assert.deepEqual(matches(bank, { ...criteria, sortBy, shuffleSeed: 42 }, ctx).sort(), ['easy-match', 'medium-match']);
  }
});
