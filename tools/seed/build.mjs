// Builds the JSON "database" in /data from the compact seed files in this folder.
//
//   node tools/seed/build.mjs           regenerate (hand-edited files are left alone)
//   node tools/seed/build.mjs --force   regenerate everything, overwriting hand edits
//
// Output (schemas: PRD section 8):
//   data/subjects.json                 subject catalogue
//   data/specs/<subject_id>.json       specification tree (sections → topics → spec points)
//   data/papers/<subject_id>.json      papers: official catalogue + demo papers
//   data/questions/<subject_id>.json   questions: demo bank (real extracts are added via packs)
//   data/packs/index.json              list of extra content packs (never overwritten)
//
// Real content should normally be added as a content pack (see README) so it never
// collides with this generator.

import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { CATEGORY_RULES, LAST_NOVEMBER, LAST_SUMMER, subjects } from './subjects.mjs';
import alevelStem from './specs/alevel-stem.mjs';
import alevelHumanities from './specs/alevel-humanities.mjs';
import gcseStem from './specs/gcse-stem.mjs';
import gcseHumanities from './specs/gcse-humanities.mjs';
import questionSets from './questions/index.mjs';
import { toHtml } from './markup.mjs';

const DATA = join(fileURLToPath(new URL('../..', import.meta.url)), 'data');
const FORCE = process.argv.includes('--force');
const SPEC_SOURCES = { ...alevelStem, ...alevelHumanities, ...gcseStem, ...gcseHumanities };
const DIFFICULTY = { e: 'easy', m: 'medium', h: 'hard', x: 'extra_hard' };
const GRADE_SCHEME = { 'A-Level': 'alevel', 'Level 3': 'level3', GCSE: 'gcse' };
const SAMPLE_NOTE = 'Demo content written for this build so every feature can be tried. It is not from an official exam paper.';

const errors = [];
const fail = (message) => errors.push(message);

// ───────────────────────────── formatting & safe writes ─────────────────────────────

/** Pretty-prints JSON down to `inlineAt` levels; arrays of primitives always stay on one line. */
function format(value, inlineAt = 99, level = 0) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  const primitiveArray = Array.isArray(value) && value.every((v) => v === null || typeof v !== 'object');
  if (level >= inlineAt || primitiveArray) return JSON.stringify(value);
  const pad = '  '.repeat(level + 1);
  const end = '  '.repeat(level);
  if (Array.isArray(value)) {
    return value.length ? `[\n${value.map((v) => pad + format(v, inlineAt, level + 1)).join(',\n')}\n${end}]` : '[]';
  }
  const keys = Object.keys(value);
  if (!keys.length) return '{}';
  return `{\n${keys.map((k) => `${pad}${JSON.stringify(k)}: ${format(value[k], inlineAt, level + 1)}`).join(',\n')}\n${end}}`;
}

const hash = (text) => createHash('sha1').update(text.replace(/\r\n/g, '\n')).digest('hex');
const manifestPath = join(DATA, '.seed-manifest.json');
const previousManifest = JSON.parse(await readFile(manifestPath, 'utf8').catch(() => '{"files":{}}'));
const nextManifest = { note: 'Hashes of generated files, used to avoid overwriting hand edits.', files: {} };
const skipped = [];

async function writeGenerated(relativePath, content) {
  const target = join(DATA, relativePath);
  const text = `${content}\n`;
  const existing = await readFile(target, 'utf8').catch(() => null);
  const recorded = previousManifest.files[relativePath];
  if (existing !== null && !FORCE && hash(existing) !== (recorded ?? hash(text))) {
    skipped.push(relativePath); // edited by hand since the last build → keep it
    if (recorded) nextManifest.files[relativePath] = recorded;
    return;
  }
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, text);
  nextManifest.files[relativePath] = hash(text);
}

// ───────────────────────────────── specification trees ─────────────────────────────────

const specs = new Map(); // subject_id → spec document
const specIds = new Map(); // spec node id → subject_id (all subjects, for crossover checks)

function expandSpec(subject) {
  const source = SPEC_SOURCES[subject.subject_id];
  if (!source) fail(`${subject.subject_id}: no specification tree in tools/seed/specs`);
  const prefix = subject.sp_prefix;
  const register = (id) => {
    if (specIds.has(id)) fail(`Duplicate spec id ${id}`);
    specIds.set(id, subject.subject_id);
  };
  const sections = (source || []).map((s) => {
    const section = { id: `${prefix}_SEC_${s.key}`, title: s.title, ...(s.note && { note: s.note }), topics: [] };
    register(section.id);
    for (const [key, code, title, points, options = {}] of s.topics) {
      const topic = { id: `${prefix}_${key}`, code, title, kind: options.kind || 'topic', points: [] };
      register(topic.id);
      for (const raw of points) {
        const bar = raw.indexOf('|');
        const pointCode = raw.slice(0, bar);
        let pointTitle = raw.slice(bar + 1);
        const higher = /\s*\{H\}\s*$/.test(pointTitle);
        if (higher) pointTitle = pointTitle.replace(/\s*\{H\}\s*$/, '');
        // "2.1" + "2.1.3" → OCR_CHEM_2.1.3 ; "M2" + "2.2" → EDX_PHYS_M2_2.2
        const id = pointCode.startsWith(key) ? `${prefix}_${pointCode}` : `${topic.id}_${pointCode}`;
        register(id);
        topic.points.push({ id, code: pointCode, title: pointTitle, ...(higher && { tier: 'Higher' }) });
      }
      section.topics.push(topic);
    }
    return section;
  });
  return { subject_id: subject.subject_id, sections };
}

// ───────────────────────────────── official paper catalogue ─────────────────────────────────

function seriesFor(catalogue) {
  const out = [];
  const withNovember = catalogue.pattern === 'summer+november';
  for (let year = catalogue.first; year <= LAST_SUMMER; year++) {
    if (year === 2020 || year === 2021) {
      // No summer exams in 2020–21: papers come from the autumn series instead.
      out.push(withNovember ? { year, series: 'November', key: 'NOV' } : { year, series: 'Autumn', key: 'AUTUMN' });
      continue;
    }
    out.push({ year, series: 'June', key: 'JUNE' });
    if (withNovember && year <= LAST_NOVEMBER) out.push({ year, series: 'November', key: 'NOV' });
  }
  return out;
}

function minutesFor([, , , minutes, options = {}], year) {
  let value = minutes;
  for (const [from, mins] of options.minutesByYear || []) if (year >= from) value = mins;
  return value;
}

function cataloguePapers(subject) {
  if (!subject.catalogue) return [];
  const papers = [];
  for (const { year, series, key } of seriesFor(subject.catalogue).reverse()) {
    for (const template of subject.catalogue.papers) {
      const [code, title, marks, , options = {}] = template;
      papers.push({
        paper_id: `${subject.id_stem}_${year}_${key}_${code}`,
        paper_type: 'real_past_paper',
        subject_id: subject.subject_id,
        board: subject.board,
        level: subject.level,
        subject: subject.subject,
        spec_code: subject.spec_code,
        year,
        series,
        paper_code: code,
        tier: options.tier || null,
        title: `${series} ${year} ${title}`,
        total_marks: marks,
        duration_minutes: minutesFor(template, year),
        question_ids: [],
        full_paper_pdf_url: null,
        full_mark_scheme_pdf_url: null,
        official_source_url: subject.official_url,
        catalogue_generated: true,
      });
    }
  }
  return papers;
}

// ───────────────────────────────── demo papers & questions ─────────────────────────────────

function demoContent(subject, sets) {
  const papers = [];
  const questions = [];
  const resolveTag = (tag, where) => {
    const id = tag.startsWith('@') ? tag.slice(1) : `${subject.sp_prefix}_${tag}`;
    if (!specIds.has(id)) fail(`${where}: unknown spec point "${tag}" → ${id}`);
    return id;
  };
  for (const set of sets) {
    const paperId = `${subject.id_stem}_DEMO_${set.code}`;
    const ids = [];
    let totalMarks = 0;
    let totalMinutes = 0;
    set.questions.forEach((q, index) => {
      const number = String(q.n ?? index + 1);
      const id = `${paperId}_Q${number.padStart(2, '0')}`;
      const where = `${id}`;
      if (!DIFFICULTY[q.d]) fail(`${where}: difficulty must be one of e/m/h/x`);
      if (!(q.m > 0)) fail(`${where}: marks must be positive`);
      if (!q.p?.length) fail(`${where}: at least one primary spec point is required`);
      if (!q.q || !q.ms) fail(`${where}: question and mark scheme text are required`);
      const minutes = q.t ?? Math.max(1, Math.round(q.m * (subject.level === 'GCSE' ? 1.1 : 1.25)));
      ids.push(id);
      totalMarks += q.m;
      totalMinutes += minutes;
      questions.push({
        question_id: id,
        source_type: 'real_past_paper',
        is_sample: true,
        paper_id: paperId,
        include_in_custom_pool: true,
        subject_id: subject.subject_id,
        board: subject.board,
        level: subject.level,
        subject: subject.subject,
        spec_code: subject.spec_code,
        subject_category: subject.subject_category,
        year: null,
        series: 'Demo',
        question_number: number,
        marks: q.m,
        estimated_minutes: minutes,
        difficulty: DIFFICULTY[q.d],
        primary_spec_points: (q.p || []).map((tag) => resolveTag(tag, where)),
        crossover_spec_points: (q.x || []).map((tag) => resolveTag(tag, where)),
        content: {
          question_html: toHtml(q.q),
          question_image_url: null,
          mark_scheme_html: toHtml(q.ms),
          mark_scheme_image_url: null,
        },
      });
    });
    papers.push({
      paper_id: paperId,
      paper_type: 'real_past_paper',
      is_sample: true,
      sample_note: SAMPLE_NOTE,
      subject_id: subject.subject_id,
      board: subject.board,
      level: subject.level,
      subject: subject.subject,
      spec_code: subject.spec_code,
      year: null,
      series: 'Demo',
      paper_code: set.code,
      tier: set.tier || null,
      title: set.title,
      total_marks: totalMarks,
      duration_minutes: set.minutes ?? Math.ceil(totalMinutes / 5) * 5,
      question_ids: ids,
      full_paper_pdf_url: null,
      full_mark_scheme_pdf_url: null,
      official_source_url: null,
    });
  }
  return { papers, questions };
}

// ───────────────────────────────────────── build ─────────────────────────────────────────

const subjectById = new Map(subjects.map((s) => [s.subject_id, s]));
if (subjectById.size !== subjects.length) fail('Duplicate subject_id in subjects.mjs');

for (const subject of subjects) specs.set(subject.subject_id, expandSpec(subject));
for (const id of Object.keys(SPEC_SOURCES)) if (!subjectById.has(id)) fail(`Spec tree for unknown subject ${id}`);

const setsBySubject = new Map();
for (const set of questionSets) {
  if (!subjectById.has(set.subject)) {
    fail(`Question set for unknown subject ${set.subject}`);
    continue;
  }
  (setsBySubject.get(set.subject) || setsBySubject.set(set.subject, []).get(set.subject)).push(set);
}

const summary = [];
const output = [];
for (const subject of subjects) {
  const rules = CATEGORY_RULES[subject.subject_category];
  if (!rules) fail(`${subject.subject_id}: unknown subject_category "${subject.subject_category}"`);
  const hasExam = !subject.no_written_exam;
  const demo = demoContent(subject, setsBySubject.get(subject.subject_id) || []);
  const papers = [...demo.papers, ...cataloguePapers(subject)];
  const spec = specs.get(subject.subject_id);
  const pointCount = spec.sections.reduce((n, s) => n + s.topics.reduce((m, t) => m + t.points.length, 0), 0);

  const { catalogue, ...rest } = subject;
  output.push({
    record: {
      ...rest,
      category_group: rules?.group,
      practice_modes: hasExam ? rules?.modes || [] : [],
      grade_scheme: GRADE_SCHEME[subject.level],
      has_written_exam: hasExam,
      extra_hard: Boolean(subject.extra_hard),
      has_catalogue: Boolean(catalogue),
    },
    spec,
    papers,
    questions: demo.questions,
  });
  summary.push({
    subject: `${subject.level} ${subject.subject}`.slice(0, 44),
    spec_points: pointCount,
    catalogue_papers: papers.length - demo.papers.length,
    demo_papers: demo.papers.length,
    demo_questions: demo.questions.length,
  });
}

if (errors.length) {
  console.error(`\n${errors.length} problem(s) found — nothing was written:\n`);
  for (const message of errors) console.error(`  • ${message}`);
  process.exit(1);
}

await writeGenerated('subjects.json', format(output.map((o) => o.record), 2));
for (const { record, spec, papers, questions } of output) {
  await writeGenerated(`specs/${record.subject_id}.json`, format(spec, 6));
  await writeGenerated(`papers/${record.subject_id}.json`, format(papers, 1));
  await writeGenerated(`questions/${record.subject_id}.json`, format(questions));
}
const packsIndex = join(DATA, 'packs', 'index.json');
if ((await readFile(packsIndex, 'utf8').catch(() => null)) === null) {
  await mkdir(dirname(packsIndex), { recursive: true });
  await writeFile(packsIndex, `${format({ packs: [] })}\n`);
}
await writeFile(manifestPath, `${format(nextManifest)}\n`);
// Headline numbers for the landing page, so it does not have to load every subject's files.
const sum = (key) => summary.reduce((n, row) => n + row[key], 0);
await writeFile(
  join(DATA, 'stats.json'),
  `${format({ subjects: summary.length, spec_points: sum('spec_points'), catalogue_papers: sum('catalogue_papers') })}\n`,
);

console.table(summary);
const total = (key) => summary.reduce((n, row) => n + row[key], 0);
console.log(
  `${summary.length} subjects · ${total('spec_points')} spec points · ${total('catalogue_papers')} catalogue papers · ` +
    `${total('demo_papers')} demo papers · ${total('demo_questions')} demo questions`,
);
if (skipped.length) {
  console.warn(`\nKept ${skipped.length} hand-edited file(s) (use --force to overwrite):`);
  for (const file of skipped) console.warn(`  • data/${file}`);
}
