# 9MA0 import: status, pipeline and how to continue

Entry point for the Edexcel A-Level Mathematics (9MA0) question bank. Read this first, then
[curriculum and tagging](curriculum-and-question-tagging.md) and the
[import contract](question-import-and-filtering-plan.md). Where those older documents say no
real questions or mappings exist, this document supersedes them for 9MA0 only.

## Status on 14 November 2026

| Item | Count | Notes |
| --- | --- | --- |
| Exam series in scope | 9 | June 2018, June 2019, Autumn 2020, Autumn 2021, June 2022 to June 2026 |
| Series imported | 8 | June 2026 not found on PMT; Pearson normally restricts the newest series |
| Question-paper booklets imported | 31 | Paper 3 is two booklets (Statistics, Mechanics) from 2019 |
| Mark schemes imported | 31 | Shown per question, not split per part |
| Full questions | 329 | |
| Assessable parts | 870 | Sum to 2,400 marks = 8 series x 300, matching every printed total |
| Examiner reports | 0 of 41 | Pearson lists them through a search service this session could not reach |
| Sample (2017) and specimen papers | 6 PDFs + 6 schemes | PDF only, labelled "not a sat exam"; not segmented (see gaps) |
| Specification points | 89 | Codes and order verified against Issue 4; 86 are assessed by at least one part |
| Textbook mappings | 4 books, 45 chapters | AI-reviewed, not checked against the books page by page |
| Review status | model-reviewed | No record is human-reviewed. 72 parts are in the review queue |

## Sources

- Papers and mark schemes: Physics & Maths Tutor's public mirror of the Pearson PDFs
  (`pmt.physicsandmathstutor.com/download/Maths/A-level/Papers/Edexcel/...`). Each URL, sha256
  and fetch date is in `data/import/9MA0/inventory.json`. The PDFs carry a small "PMT" mark in
  the page margin, which the crops exclude. They were not compared byte-for-byte with Pearson's
  own files because Pearson's direct file URLs could not be discovered.
- Specification: Pearson 9MA0 Specification Issue 4 (February 2020), sha256 in
  `data/import/9MA0/specification.json`.
- Textbook chapter titles: PMT's public solution-bank listings for the four Pearson books.
  The shared MEGA folder was not reachable, so no textbook PDF was opened.
- Plumi: site unreachable from this session; a public GitHub search found no repository for the
  product. Nothing from Plumi is used.

Pearson owns the papers. They are free to download but not openly licensed. Hosting the PDFs
and crops was the site owner's explicit instruction.

## Pipeline (all steps are safe to rerun)

| Step | Command | Output |
| --- | --- | --- |
| Inventory | `node tools/import/build-inventory.mjs` | `data/import/9MA0/inventory.json` |
| Fetch | `node tools/import/fetch-sources.mjs fetch` | `.import-cache/9MA0/*.pdf` (gitignored), checksums in inventory |
| Spec check | `python3 -I tools/import/spec_extract.py <spec.pdf> <out.json>` | ordered official codes and content text |
| Segment | `tools/import/run-extract.sh` | `assets/questions/9MA0/`, `assets/schemes/9MA0/`, work JSON |
| Tagging inputs | `python3 -I tools/import/build_tagging_inputs.py` | `.import-cache/9MA0/work/tagging/*.in.json` |
| Tag | one worker per series following `tools/import/TAGGING.md` | `data/import/9MA0/tags/<paper>.json` |
| Validate tags | `node tools/import/validate-tags.mjs` | errors, low-confidence count |
| Build pack | `node tools/import/build-pack.mjs` | `data/packs/edx-9ma0.json`, `exceptions.json` |
| Mappings | `node tools/import/build-curriculum.mjs` | `data/curriculum/index.json` |
| Site checks | `npm test` and `npm run validate` | |

After segmenting, copy `.import-cache/9MA0/work/{qp,ms}/*.json` to `data/import/9MA0/extract/`
and the PDFs to `assets/pdfs/9MA0/`; `build-pack.mjs` reads the committed copies.

## Data format

Each question is one stitched image of its printed content (answer lines, margins and footers
removed). A part is a vertical slice of that image, so no maths is retyped. A part record has:

- `question_id` (`<source booklet>_Q07_B`), `parent_question_id`, `part_label`, `question_number`,
  `section_label` and `component` for Paper 3, `sort_key`.
- `marks`, `difficulty`, `primary_spec_points` (assessed), `crossover_spec_points` (genuine
  prerequisites), `depends_on_question_ids`.
- `content.question_slices` (stem, part, trailing figure), `content.preview_text` (AI-written
  description for result lists), `content.search_text` (raw PDF text, for search only),
  `content.mark_scheme_image_url` with `mark_scheme_scope`.
- `context.earlier_parts` (shown open when the part depends on earlier parts or continues a
  nested part) and `context.full_question_image_url`.
- `provenance`: source booklet, pages, sha256, extraction method, review status, tag confidence,
  difficulty basis.

Difficulty rubric and tagging rules: `tools/import/TAGGING.md`.

## Checks performed

- Part marks equal the printed "Total for Question" for all 329 questions, and every booklet
  sums to its 100 or 50 marks.
- Mark scheme question numbers match the question paper for all 31 booklets.
- `validate-tags.mjs`: 870 units, 0 errors (unknown ids, wrong labels, bad dependencies).
- `build-pack.mjs` fails on duplicate ids or broken dependencies: none.
- `npm test`: 52 passing. `npm run validate`: 0 errors, 0 warnings.
- Chromium at 390, 768 and 1280 px: combined filters, opened questions, schemes and earlier-part
  context render with no page-wide overflow and no script errors.

## Known gaps and limits

1. June 2026 papers: not available from the sources reached.
2. Examiner reports: none linked. The card says so and links to Pearson.
3. Sample and specimen papers: their PDFs have a garbled text layer or drawn answer lines, so
   automatic segmentation failed. They are offered as whole PDFs only.
4. June 2019 Paper 3 (both booklets) has no text layer. It was segmented by hand-measured
   coordinates in `tools/import/manual/9MA0.json`; 34 parts carry `manual_segmentation`.
5. Mark schemes are per question. A part shows the whole question's scheme with a note.
6. Tags, difficulty, dependencies and previews are AI output. Most workers tagged from extracted
   text without opening the images. `data/import/9MA0/exceptions.json` lists 70 medium and 2
   low-confidence parts for human review. Nothing is labelled human-reviewed.
7. Textbook and Year 12/13 mappings are AI-reviewed (`status: model_reviewed`) and labelled so
   in the selector. ISBNs and page references are not recorded.
8. Spec description text in `specification.json` is PDF-extracted; formulae are approximate.
9. No "question type" filter exists. Search over the raw text (for example "hence", "show that")
   is the nearest equivalent.
10. The official tree previously had a point "1.2 Proof by contradiction". The specification has
    a single proof point, 1.1, so 1.2 was removed. A browser that saved 1.2 as learned keeps a
    stale id.
