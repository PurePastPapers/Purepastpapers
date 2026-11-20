# Question-bank pitfalls: checks every import and audit must keep

The canonical list of failures already seen in PurePastPapers question banks, with the check
that catches each and the tool that owns the fix. Details live in the linked documents; this
page is the checklist. Created by the site-wide audit of 19–20 November 2026; add new
classes here rather than in a handover.

Run after any import, rebuild or asset tool: `npm test`, `npm run validate`, the subject's
`node tools/browser-<subject>-bank.cjs` against `npm start`, and a look at representative
rendered questions (scans, tables, graphs, multi-page parts, last questions).

## Identity, specification and tiers

| Failure | Check | Owner |
| --- | --- | --- |
| Wrong board, spec code or route; AS merged into A-level; Combined Science merged with separate sciences | Every question's `qualification_code`, `level`, `is_as`, `tier`, `year`, `series` equal its paper's; paper IDs embed the paper's own `spec_code` | subject `build.py`; `tests/*-bank.test.mjs` |
| Foundation question tagged to a Higher-only point (`tier: "Higher"`) | build refuses it; `tests/gcse*-bank.test.mjs` | `tools/gcse*/build.py` |
| Spec codes as numbers (`2.10` read as `2.1`) | codes are strings; `tests/spec-filtering.test.mjs` | spec builders |
| Changed IDs losing learner history | `legacy_ids` + `js/config/spec-id-migrations.js` (`tools/write_spec_migrations.py`) | spec builders |
| Model review described as teacher review | `provenance.reviewer_type` is `model` | review compilers |

## Paper lists

| Failure | Check | Owner |
| --- | --- | --- |
| AS and A-level cards look identical: the card showed the subject's code (9PH0 on 8PH0 papers) and shortening the title at ":" removed "AS Paper 1" (Physics, Biology, Chemistry, Geography, Psychology, Sociology, CS, English Literature) | cards show the paper's own level and code (`AS 8PH0`, `A-Level 9PH0`) with a level filter; single-qualification banks show none | `js/engine/paper-identity.js`; `tests/paper-labels.test.mjs`; `tools/browser-paper-labels.cjs` |
| Official samples (`year: null`) grouped under a "null" heading | "Official samples" group, listed last | `js/ui/views/papers.js`; `tools/browser-paper-labels.cjs` |

## Part crops, contexts and dependencies

See [PART-DISPLAY.md](PART-DISPLAY.md) for the standard: own crop from the printed label,
minimum context, part-only scheme with a full-scheme fallback.

| Failure | Check | Owner |
| --- | --- | --- |
| Whole question shown for every part; giant "preceding context" | `tests/part-display.test.mjs` | `tools/parts/refine.py` |
| **GCSE contexts showing every earlier part** (answer lines, options and marks of unselected siblings, e.g. 1SC0 Q4(b) showing Q4(a)). `finalize.py` packaged the local build image whenever one existed, and `refine.py` writes under the same names, so re-finalizing after refine put the build's images back while the records kept refined regions | `tests/gcse-part-crops.test.mjs`: each crop's size equals its recorded regions; all contexts of a question share one introduction height | `tools/gcse*/finalize.py` (prefers catalogue copies of refined assets); repair: `tools/parts/recut-from-full.py` |
| Recut accepting a wrong page offset (1BI0 June 2023 1F Q2 cut ~230 px off) | a page offset is used only when tesseract reads the part's own printed label at the cut (letter-scoped, left 20% of the page) | `tools/parts/recut-from-full.py` |
| Six papers' regions map at ~1437 px per page, not 1347/1348 (CropBox/MediaBox; 1PH0 June 2024 1F, 1CH0 June 2025 1F) | page height estimated per paper from single-region crops | `recut-from-full.py`; `tests/gcse-part-crops.test.mjs` |
| Context showing an earlier scored part because the refine "scenario" rule pulled in the part above | contexts hold the introduction and lead-ins only; a region with a marks "(n)" is kept only when `context_reasons` says the wording needs it (names an earlier part, an earlier figure or table) and is otherwise listed in `context_regions_dropped`; `tools/parts/audit-part-display.py` flags any context with a printed mark | `refine.py`, `recut-from-full.py` |
| Context showing a sibling's task because refine.py's context regions are whole earlier parts and its regex reasons kept them ("earlier figure or data" with no figure used) | a context keeps another part's rows only when the wording names that part (`context_named_parts`) or uses a figure printed in it, cut at the caption (`context_figure_from_parts`); `tests/gcse-part-crops.test.mjs` checks every context against every other part's rows | `recut-from-full.py` |
| Questions whose labels OCR cannot prove (95 GCSE questions: scans, labels inside tables, numbered items "(a)(ii) 2") | reviewed row ranges of `Qnn_full.webp`, `provenance.own_rows_from_full`, `context_reviewed` (model review, not teacher review) | `tools/parts/manual-contexts.py` |
| Maths lead-in printed before the first label, or a fraction's numerator above the label, cut off | lead-in bridge from the marks row; numerator lift ≤ 12 px | `manual-contexts.py` review; `audit-part-display.py` |
| Part crop starting in the previous part's answer space; text printed between parts lost | own crop starts at the label; `context_bridge_text` / `lead_in_image_url` | `refine.py`, `tools/parts/lead-ins.py` |
| Context capturing answer lines, option grids, tables, figure labels or page hatching | inspect flagged contexts | `refine.py` |
| Regex dependency linking independent parts ("You may draw a diagram to help with your answer") | read each new `depends_on_question_ids` against its crop | `tools/parts/drop-false-dependencies.py` |
| Empty introduction crops shown as blank boxes | `compact.py` removes inkless stems | `tools/assets/compact.py` |
| Wrong geometry: CropBox vs MediaBox | Physics and GCSE render the CropBox, Maths and Biology the MediaBox | renderers, `refine.py` |
| Scanned pages positioned without text | tesseract word boxes, `provenance.part_display_positioning` | `refine.py`, `ocr-overrides/` |

## Last questions and mark schemes

| Failure | Check | Owner |
| --- | --- | --- |
| Last question running past "TOTAL FOR PAPER" into equation lists, formulae sheets, periodic tables or insert covers. The candidate filter needed a 3-page span, so a 1-page last part followed by AS Physics' 2-page "List of data, formulae and relationships" was never checked | `trim-booklet-pages.py --dry-run`, then look at every proposed cut; record wrong ones in `KEEP` | `tools/parts/trim-booklet-pages.py` |
| Whole-question scheme ending with the next question's header or first row (1PH0 Nov 2021 1H Q9 showed Q10(a)(i)) | `trim-scheme-tails.py --dry-run` (finds "Total for Question" lines) | `tools/parts/trim-scheme-tails.py` |
| Scheme split between questions one region late: a scheme opening with the previous question's rows while that question's scheme stops short (1SC0 Nov 2021 1CH Q1/Q2), or ending with a region that is all the next question (1PH0 June 2022 2H Q9, total printed "Total 11 marks") | read the question-number column of every whole-question scheme for a reference `N(x)` that is not its own (the 2026-11-20 scan read all 1,152 GCSE science whole-question schemes; strict pattern only, since `l`→`1` substitution floods it with false hits); fix whole regions | `tools/parts/fix-scheme-regions.py`; `tests/gcse-part-crops.test.mjs` |
| Part scheme clipped at a page boundary; rows of the other tier on shared F/H schemes | `part_scheme_check` is `verified`/`reference_matched`/`includes_sibling_rows`; GCSE `schemes.py` keeps only the scheme's own-tier reference | `refine.py`, `tools/gcse*/schemes.py` |
| Withdrawn, copyright-removed or erratum content shown as complete | record it in the subject's coverage and handover; never redraw removed material | subject pipelines |

## Images, size and deployment

| Failure | Check | Owner |
| --- | --- | --- |
| Questions blank on the live site: Pages artifact over 1 GB | `tests/site-size.test.mjs`; deploy log has no "exceeds the allowed size" warning | [SITE-SIZE.md](SITE-SIZE.md) |
| **Text washed out to light grey** (darkest level 160–175): `compact.py` used median-cut `quantize()`, which averaged black text with light graph grids | `compact.py` now uses a 1-D k-means that keeps a near-black level; `tests/gcse-part-crops.test.mjs` and the audit scan for crops whose darkest grey is ≥ 80 | `tools/assets/compact.py`; repair: `tools/assets/restore-tones.py` (from Git history) |
| Lazy-loaded catalogue images staying blank | catalogue images are not lazy | `js/data/source-images.js` |
| Stale client catalogue after a deploy | one refetch with `cache: 'reload'` when an asset is missing | `js/data/source-images.js` |
| Build skipped because `build_signature` did not change | bump the signature when build or scheme logic changes | subject `build.py` |
| Browser check unreliable after a control moves | update the `tools/browser-*.cjs` selector in the same change | browser checks |
| Overflow checks failing right after `setViewportSize`: `js/ui/question-fit.js` re-places the answer box after a resize, so the old side-by-side width lasts a moment | wait for `scrollWidth <= width` (up to 2 s) before asserting | `tools/browser-*.cjs` |
| Test session scrolling sideways at every width: the runner bar's full-bleed backdrop (`.runner__top::before`, `inset: 0 -100vw`) | `.view--runner { overflow-x: clip }` (not `hidden`, which would stop the bar sticking); `tools/browser-part-context.cjs` checks the session at 390 and 1280 | `css/pages.css` |
