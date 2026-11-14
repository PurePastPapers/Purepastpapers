// Builds the published 9MA0 content pack from extraction JSON + tagging output.
//   node tools/import/build-pack.mjs
// Inputs : data/import/9MA0/extract/*.qp.json, *.ms.json   (segmentation, committed)
//          data/import/9MA0/tags/*.json                     (model tagging)
//          data/import/9MA0/inventory.json                  (sources + checksums)
// Outputs: data/packs/edx-9ma0.json, data/packs/index.json entry,
//          data/import/9MA0/exceptions.json, inventory processing flags.
// Rerun-safe: ids are derived from paper id + question number + part label, so a rerun
// rewrites the same records. Papers without valid tags are skipped and reported.
import { readFile, writeFile, readdir, access } from 'node:fs/promises';
const ROOT = new URL('../../', import.meta.url);
const read = async (p) => JSON.parse(await readFile(new URL(p, ROOT), 'utf8'));
const exists = (p) => access(new URL(p, ROOT)).then(() => true, () => false);
const SUBJECT = 'EDX_ALEVEL_MATH_9MA0';
const inv = await read('data/import/9MA0/inventory.json');
const spec = await read('data/import/9MA0/specification.json');
const specIds = new Set(spec.points.map((p) => p.id));
const files = (await readdir(new URL('data/import/9MA0/extract/', ROOT))).filter((f) => f.endsWith('.qp.json')).sort();
const questions = [], papers = new Map(), exceptions = [];
const stats = { papers: 0, full_questions: 0, parts: 0, marks: 0, skipped: [] };
const slug = (label) => label.replace(/[()]/g, '').replace(/-/g, '_').toUpperCase();
const SERIES_TITLE = { JUNE: 'June', AUTUMN: 'Autumn' };

for (const file of files) {
  const src = file.slice(0, -8);                                  // e.g. EDX_9MA0_2023_JUNE_P3S
  const qp = await read(`data/import/9MA0/extract/${file}`);
  const ms = (await exists(`data/import/9MA0/extract/${src}.ms.json`)) ? await read(`data/import/9MA0/extract/${src}.ms.json`) : { questions: [] };
  const item = inv.papers.find((p) => p.paper_id === src);
  if (!(await exists(`data/import/9MA0/tags/${src}.json`))) { stats.skipped.push(`${src}: no tags file`); continue; }
  const tags = await read(`data/import/9MA0/tags/${src}.json`);
  const split = /P3[SM]$/.test(src);
  const paperId = split ? src.slice(0, -1) : src;                 // catalogue paper id
  const sectionOf = (n) => (src.endsWith('P3S') ? 'Statistics' : src.endsWith('P3M') ? 'Mechanics' : null);
  const prefix = src.endsWith('P3S') ? 's' : src.endsWith('P3M') ? 't' : 'q';   // sort: stats before mechanics
  const paper = papers.get(paperId) ?? { paper_id: paperId, subject_id: SUBJECT, question_ids: [], source_documents: [], import_status: 'questions_extracted' };
  papers.set(paperId, paper);
  const label = split ? (src.endsWith('S') ? 'Statistics' : 'Mechanics') : null;
  const pdf = (kind) => `assets/pdfs/9MA0/${src}.${kind}.pdf`;
  paper.source_documents.push(
    { kind: 'question_paper', label: label ? `${label} question paper (PDF)` : 'Question paper (PDF)', url: pdf('question_paper'), sha256: item.documents.question_paper.sha256, fetched_from: item.documents.question_paper.fetched_from },
    { kind: 'mark_scheme', label: label ? `${label} mark scheme (PDF)` : 'Mark scheme (PDF)', url: pdf('mark_scheme'), sha256: item.documents.mark_scheme.sha256, fetched_from: item.documents.mark_scheme.fetched_from });
  if (!split) { paper.full_paper_pdf_url = pdf('question_paper'); paper.full_mark_scheme_pdf_url = pdf('mark_scheme'); }
  let ok = true;
  if (tags.questions.length !== qp.questions.length) { stats.skipped.push(`${src}: tags cover ${tags.questions.length} of ${qp.questions.length} questions`); continue; }
  const built = [];
  for (const [qi, q] of qp.questions.entries()) {
    const tq = tags.questions[qi];
    const scheme = ms.questions.find((m) => m.number === q.number);
    if (!scheme) exceptions.push({ paper: src, question: q.number, type: 'missing_mark_scheme', detail: 'No mark scheme region found for this question.' });
    if (tq.number !== q.number || tq.units.length !== q.units.length) { ok = false; stats.skipped.push(`${src} Q${q.number}: tag units do not match extraction`); break; }
    const groupId = `${src}_Q${String(q.number).padStart(2, '0')}`;
    const img = `assets/questions/9MA0/${src}/${q.image}`;
    const idOf = (u) => (q.units.length === 1 && !u.label ? groupId : `${groupId}_${slug(u.label)}`);
    for (const [ui, u] of q.units.entries()) {
      const t = tq.units[ui];
      const bad = [...t.primary, ...(t.prerequisites || [])].filter((id) => !specIds.has(id));
      if (bad.length || t.label !== u.label) { ok = false; stats.skipped.push(`${src} Q${q.number}${u.label}: invalid tags ${bad.join(',')}`); break; }
      const single = q.units.length === 1;
      const nestedLater = /\)\(/.test(u.label) && ui > 0 && q.units[ui - 1].label.split(')(')[0] === u.label.split(')(')[0];
      const deps = (t.depends_on || []).map((l) => q.units.find((x) => x.label === l)).filter(Boolean).map(idOf);
      const slices = [];
      if (!single && q.stem_end > 0.004) slices.push({ role: 'stem', y0: 0, y1: q.stem_end });
      slices.push({ role: 'part', y0: single ? 0 : u.y0, y1: single ? 1 : u.y1 });
      if (!single && q.tail_start != null) slices.push({ role: 'tail', y0: q.tail_start, y1: 1 });
      const earlier = !single && u.y0 - q.stem_end > 0.01 ? { y0: q.stem_end, y1: u.y0 } : null;
      if (t.confidence !== 'high') exceptions.push({ paper: src, question: q.number, part: u.label, type: `${t.confidence}_confidence_tag`, detail: t.note || '' });
      const record = {
        question_id: idOf(u), ...(single ? {} : { parent_question_id: groupId, part_label: u.label }),
        question_number: String(q.number), ...(sectionOf() ? { section_label: sectionOf() } : {}),
        component: src.endsWith('P1') ? 'Paper 1 (Pure)' : src.endsWith('P2') ? 'Paper 2 (Pure)' : src.endsWith('P3S') || (src.endsWith('P3') && t.primary[0].includes('STATS')) ? 'Paper 3: Statistics' : src.endsWith('P3M') || (src.endsWith('P3') && t.primary[0].includes('MECH')) ? 'Paper 3: Mechanics' : (q.number <= 5 ? 'Paper 3: Statistics' : 'Paper 3: Mechanics'),
        sort_key: `${prefix}${String(q.number).padStart(2, '0')}.${String(ui).padStart(2, '0')}`,
        paper_id: paperId, subject_id: SUBJECT, source_type: 'real_past_paper', include_in_custom_pool: true,
        marks: u.marks, estimated_minutes: Math.max(1, Math.round(u.marks * 1.2)), difficulty: t.difficulty,
        primary_spec_points: t.primary, crossover_spec_points: t.prerequisites || [],
        ...(deps.length ? { depends_on_question_ids: deps } : {}),
        context: { full_question_image_url: img, ...(earlier ? { earlier_parts: earlier, earlier_parts_open: Boolean(deps.length || nestedLater) } : {}), ...(deps.length ? { dependency_context: 'earlier_parts_shown' } : {}) },
        content: { question_html: '', question_image_url: img, image_size: [q.width, q.height], question_slices: slices, preview_text: t.preview,
          search_text: (q.text || '').replace(/\s+/g, ' ').slice(0, 1200),
          mark_scheme_html: '', ...(scheme ? { mark_scheme_image_url: `assets/schemes/9MA0/${src}/${scheme.image}`, mark_scheme_size: [scheme.width, scheme.height], mark_scheme_scope: single ? 'part' : 'question' } : {}) },
        provenance: { source_document: src, source_pages: q.pages, source_sha256: item.documents.question_paper.sha256, extraction: qp.manual_segmentation ? 'manual_segmentation' : 'pdf_segmentation_v1',
          review_status: t.confidence === 'low' ? 'model_reviewed_low_confidence' : 'model_reviewed', tag_confidence: t.confidence, difficulty_basis: t.difficulty_basis, difficulty_rubric: 'tools/import/TAGGING.md v1' },
      };
      built.push(record);
    }
    if (!ok) break;
  }
  if (!ok) continue;
  const total = built.reduce((n, r) => n + r.marks, 0);
  if (total !== item.expected_total_marks) exceptions.push({ paper: src, type: 'paper_total_mismatch', detail: `parts sum to ${total}, expected ${item.expected_total_marks}` });
  questions.push(...built); paper.question_ids.push(...built.map((r) => r.question_id));
  stats.papers++; stats.full_questions += qp.questions.length; stats.parts += built.length; stats.marks += total;
  item.processing = { extracted: true, tagged: true, reviewed: 'model', imported: true };
}
// Sample and specimen papers: PDFs only, clearly labelled, never counted as sat exams.
for (const item of inv.papers.filter((p) => p.kind !== 'exam' && p.documents.question_paper.status === 'fetched')) {
  const what = item.kind === 'specimen' ? 'Specimen' : 'Sample assessment';
  papers.set(item.paper_id, { paper_id: item.paper_id, subject_id: SUBJECT, paper_type: 'real_past_paper', board: 'Edexcel', level: 'A-Level', subject: 'Mathematics', spec_code: '9MA0',
    year: null, series: what, paper_code: item.paper_code, tier: null, title: `${what} Paper ${item.paper_code[1]}: ${item.title} (not a sat exam)`, total_marks: 100, duration_minutes: 120,
    question_ids: [], full_paper_pdf_url: `assets/pdfs/9MA0/${item.paper_id}.question_paper.pdf`, full_mark_scheme_pdf_url: `assets/pdfs/9MA0/${item.paper_id}.mark_scheme.pdf`,
    official_source_url: item.official_listing_url, import_status: 'pdf_only', not_a_sat_exam: true });
}
const ids = new Set();
for (const q of questions) { if (ids.has(q.question_id)) throw new Error(`duplicate id ${q.question_id}`); ids.add(q.question_id); }
for (const q of questions) for (const d of q.depends_on_question_ids || []) if (!ids.has(d)) throw new Error(`broken dependency ${q.question_id} -> ${d}`);
const pack = { pack_id: 'edx-9ma0', title: 'Edexcel A-Level Mathematics 9MA0 past papers', version: 1, generated: new Date().toISOString().slice(0, 10),
  review_status: 'model_reviewed', source_note: 'Question and mark scheme images are crops of Pearson Edexcel papers. Tags, difficulty and previews are AI-reviewed, not teacher-reviewed.',
  papers: [...papers.values()], questions };
await writeFile(new URL('data/packs/edx-9ma0.json', ROOT), JSON.stringify(pack) + '\n');
await writeFile(new URL('data/packs/index.json', ROOT), JSON.stringify({ packs: [{ file: 'edx-9ma0.json', title: pack.title, enabled: true }] }, null, 2) + '\n');
await writeFile(new URL('data/import/9MA0/exceptions.json', ROOT), JSON.stringify({ generated: pack.generated, skipped: stats.skipped, exceptions }, null, 1) + '\n');
await writeFile(new URL('data/import/9MA0/inventory.json', ROOT), JSON.stringify(inv, null, 1) + '\n');
console.log(stats, 'exceptions', exceptions.length);
