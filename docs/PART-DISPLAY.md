# Part display: own crop, minimal context, part-only mark scheme

Applies to the Pearson banks built from booklets split into scored units: Biology A
(9BN0/8BN0), Physics (9PH0/8PH0) and Mathematics (9MA0/8MA0). Politics and History
units are whole questions. AQA Geography was already built with part crops and
part schemes (`scheme_scope: "part"`), so it is unchanged.

## The problem (owner report, 2026-11-16)

- A selected part such as 3(b) showed the whole question. Each unit's
  "preceding context" image was everything printed before the part (sometimes with
  the introduction repeated), so Biology cards were several screens tall.
- Some parts looked empty. Example: AS Biology June 2025 Paper 1 Q5(b)(ii). The
  part's own image was lazy-loaded from a 5 MB booklet catalogue and sat below the
  giant context, so it could stay blank.
- The mark scheme was the whole question's scheme for every part.

## What `tools/parts/refine.py` does

It post-processes the committed packs and catalogues from the official PDFs, which
it identifies by the checksums already recorded in each unit's provenance. For every
unit of a multi-unit question:

1. **Own crop** from the unit's printed label (e.g. "(ii)") to its existing end.
   It no longer starts at the top of the question or in the previous part's answer
   space.
2. **Context** (`context.stem_image_url`, shown open and labelled unscored):
   - the question introduction before the first part;
   - the lead-in printed under the unit's letter, e.g. "(a) The table shows ..."
     for (a)(ii);
   - unlabelled text printed after the previous part's answer space and before the
     unit's label, e.g. "In reality the stone will be subject to air resistance."
     before "(d) Explain how this would affect your answer". Dotted answer lines,
     multiple-choice options, answer tables and lower-case figure labels are not
     taken. The text is kept in `provenance.context_bridge_text`;
   - only the earlier material the unit's wording needs:
     - a named earlier part ("your answer to (a)(i)");
     - "Hence" or "use your answer" (the previous part);
     - a numbered Figure or Table printed earlier;
     - "the graph" or "these data" when neither the part nor the introduction
       contains a figure;
     - a scenario introduced earlier ("the student", "this investigation");
     - earlier "show that" results.
   The reasons are stored in `provenance.context_reasons`.
3. **Dependency gate**: when the wording builds on an earlier part's answer, the unit
   gets `depends_on_question_ids`. At load time, `js/data/content-repository.js` adds
   those parts' topics as `dependency_spec_points`, and `requiredSpecPoints` includes
   them. So with "Only content I've covered", the part stays hidden until the part it
   builds on is learnt too. Earlier figures and scenarios are shown as context only;
   they do not gate.
4. **Part mark scheme**: the scheme rows whose left-column reference matches the
   unit (e.g. "5(b)(ii)", "12b(ii)", "(b)" in Maths) are rendered with their table
   header. The rows are checked against the unit's marks in the Mark column:
   - `verified`: the marks equal the unit's marks;
   - `includes_sibling_rows`: a Maths row "(a)" covers (a)(i) and (a)(ii);
   - `reference_matched`: no mark numbers printed, but the references match exactly.

   Anything else keeps the full-question scheme with its existing caveat. The full
   scheme stays available as a collapsed "Show the mark scheme for the whole
   question" (`context.full_scheme_image_url`).

Image-only scans (Physics June 2019 sittings, Biology 9BN0 June 2019 Paper 3, Maths
June 2019 Papers 31 and 32) are positioned from tesseract word boxes. This is for
positioning only; the pixels are still the source page, and
`provenance.part_display_positioning` records it. A few questions with irregular
printed labels (for example 8BN0 June 2023 Paper 1 Q7, which prints (i), (ii) before
(b)) keep their previous crops and context but still get part schemes
(`provenance.part_display: "scheme_only"`). Every other multi-part unit is
`"refined"`. The tool never re-crops a refined unit, because its regions no longer
include the introduction. `--rescheme` recomputes only the part schemes of refined
units.

## Re-running

The sources live in a private workspace (not committed), keyed by SHA256:

```bash
python3 tools/parts/refine.py --subject biology --sources ../parts-research/sources --report ../parts-research/biology.json
```

Physics booklets are measured in CropBox geometry (as `tools/physics` renders them).
Biology and Maths use MediaBox geometry (`tools/maths/render.py`). Biology SAM page
extractions are regenerated with `tools/biology/samples.py`'s
`extract_pages`. Their checksums differ from the originals (pypdf metadata) while the
page geometry is identical, so `../parts-research/alias.json` maps each original
checksum to the local file. The Maths SAMs come from Pearson's
`as-al-maths-further-sams.zip`.

After any rebuild of a Biology, Physics or Maths pack from its subject pipeline, run
`refine.py` again for that subject, because the subject builds still emit the old
layout. Use `--only-untouched` to process only the questions that still match git
HEAD.

## Checks

- `tests/part-display.test.mjs`:
  - no "preceding context" stems remain;
  - part schemes carry a check status and keep a link to the full scheme;
  - dependencies point to earlier units of the same question, and those units show
    context;
  - the dependency gate holds a part back until the earlier part is learnt.
- The subject bank tests still check that every catalogue holds exactly the
  referenced assets, with RIFF/WEBP bytes and SHA256.

## Linked parts: one question, an answer box per part (2026-11-19)

Owner request: where a part cannot be answered without an earlier part ("Use your graph
to ...", "Hence ..."), show the parts as one question, only when every part is learned
content, with a separate answer box for each part.

- `js/engine/linked-parts.js` `linkGroups` runs when a subject loads
  (`content-repository.js`). Every part of a question in which some part has
  `depends_on_question_ids` joins one group, as do parts those links reach in a
  neighbouring question (AQA Psychology "Using your answer to question 21"). Each member
  gets `linked_group` and `dependency_spec_points` holding the other parts' topics, which
  `requiredSpecPoints` includes. With "only topics I've learned" the parts are therefore
  offered all together or not at all.
- Find questions and the question picker show one card per group (`collapseLinked`):
  the introduction once, each part's crop with its own answer box, one "Show mark scheme
  for all parts", a mark picker per part and one save that records an attempt on each
  part. Locked groups say which parts still need which topics (`collapseLocked`).
- The test builder treats a group as one question (`buildTest` gets the group entries;
  `expandLinkedIds` turns them back into parts). Selecting a group adds all its parts.
- The session runner (`runnerItems`) shows consecutive linked parts as one numbered
  question in both the scrolling list and mark-as-you-go mode.
- A part's own crop starts at its label, so text printed between the previous part's
  answer space and the label would be lost in a group. `tools/parts/lead-ins.py` cuts it
  out of the part's context image as `context.lead_in_image_url` (same pixels).
- The dependency check matched "You may draw a diagram to help with your answer", "State
  the unit with your answer" and graphs or equations made in the same part. Both regexes
  now skip those; `tools/parts/drop-false-dependencies.py` removed the 17 committed false
  links (each checked against its crop).

## Equation sheets cut off last questions

The last part of a paper used to be cropped to the end of the PDF, so its picture ran on
into the insert cover, the physics equation list or formulae sheet, the periodic table or
the maths formula sheet. `tools/parts/trim-booklet-pages.py` cuts those pages off (82 last
questions across 1CH0, 1SC0, 1MA1, 1PH0, 8PH0 and 9PH0). A page counts as a booklet page
when it is near-identical to a page ending another paper's last part in other exam series
(papers of the same series share questions, so they are not compared). The part's
`source_regions` are cut to match and `provenance.booklet_pages_trimmed` is set. A few
cases the matching gets wrong are fixed by hand in `KEEP`. Re-running changes nothing.

## GCSE contexts restored from the full question (audit 2026-11-19)

Owner report: Combined Science parts such as 4(a) and 4(b) showed the wrong material. Every
GCSE pipeline (`gcsebio`, `gcsechem`, `gcsephys`, `gcsemaths`) runs `finalize.py` again after
`refine.py` "to recount refined assets". `finalize.py` packaged each asset from the local
build folder whenever that file existed, and `refine.py` writes under the build's names
(`Q04_U02.webp`, `Q04_U02_context.webp`), so the second run put the build images back while
the records kept refined regions. A part's context then showed everything printed before it:
for 1SC0 June 2023 1BF Q4(b)(ii), part (a)'s options and part (b)(i)'s Punnett square with
their marks. About 4,000 GCSE parts were affected (own crops in the three sciences, contexts
in all four).

- `finalize.py` now takes refined units' crops, contexts, lead-ins and part schemes from the
  catalogue (`tools/gcse*/finalize.py`).
- `tools/parts/recut-from-full.py` rebuilt them without the PDFs: `Qnn_full.webp` is the same
  pages at the same scale, so each part's recorded `source_regions`, the introduction and its
  `context_regions` are cut from it. Each page's row offset is proved by the part labels
  (refine starts a part 4 px above its label); a question is rewritten only when every part
  passes. Recut contexts carry `provenance.context_recut_from_full`.
- `tests/gcse-part-crops.test.mjs` checks every refined GCSE crop against its recorded
  regions and that contexts of one question share one introduction height.
- `tools/browser-part-context.cjs` checks a part's own crop, its introduction and the
  "Show full question for context" control (opening and closing it changes no result count,
  scheme or saved progress).

Follow-up checks (audit 2026-11-20, GCSE science display supplement):

- **Label proof is mandatory.** A first recut accepted one wrong page offset (1BI0 June 2023
  1F Q2, about 230 px off). `recut-from-full.py` now rewrites a question only when tesseract
  reads each part's own printed label at its cut: label rows in the left 35%, words left of
  20% of the width (an in-text "(a)" is ignored), roman numerals scoped to their letter, a
  single-line fallback, and the letter itself accepted for a letter's first sub-part. Six
  papers map at about 1437 px per page instead of 1347/1348; the page height is estimated
  per paper. Result: 1,531 questions recut and verified; 9 more fail OCR proof and keep crops
  that were checked by eye (2026-11-20).
- **Contexts are the minimum.** The refine "scenario" rule had pulled the part above into a
  context. Contexts now hold the introduction (rows above the first part) and the part's
  own lead-in only. A context region carrying a marks "(n)" is kept only when its recorded
  reason says the wording needs it (names an earlier part, builds on the previous answer, an
  earlier "show that" result, or an earlier figure, table, graph or diagram); otherwise it
  is dropped and listed in `provenance.context_regions_dropped`. Genuine answer
  dependencies are linked parts, shown as one question (`js/engine/linked-parts.js`).
- **Sibling rows removed (second pass).** The display audit still found 437 contexts with a
  printed mark: refine.py's context regions are whole earlier parts, and its regex reasons
  ("earlier figure or data", "earlier \"show that\" result") kept them even where the
  wording uses nothing from that part (1BI0 June 2025 1H Q1(b)(ii) showed (b)(i)'s task;
  1SC0 June 2025 1BF Q4(a)(iv) showed (a)(i)'s options). The recut now removes every row
  that belongs to a part, keeping another part's rows only when the part's own printed
  wording names it ("your answer to (b)(i)": `context_named_parts`; "Give your answer to two
  decimal places" is not a reference) or, for a figure or table the part refers to that is
  printed inside another part, down to its caption (`context_figure_from_parts`). refine.py's
  regions stay in `context_regions_refined`; `tests/gcse-part-crops.test.mjs` fails on any
  context row of another part that is not recorded as used. After this pass the audit finds
  29 contexts with a printed mark, every one recorded (26 named or recorded dependencies, 2
  reviewed, 1 stem), no empty context, and 80 "own label" flags, all OCR misses checked by
  eye (6,996 multi-part units).
- **Reviewed rows where OCR cannot prove a label** (95 questions, 348 parts: scans, labels
  inside tables, numbered items such as "(a)(ii) 2"): `tools/parts/manual-contexts.py`
  records reviewed row ranges of `Qnn_full.webp` (`provenance.own_rows_from_full`,
  `context_rows_from_full`, `context_reviewed`: a model review of the rendered question,
  not a teacher review) and corrects seven part labels to the printed ones (IDs unchanged).
- **Schemes.** Two whole-question schemes were split one region late or early
  (`tools/parts/fix-scheme-regions.py`; see QUESTION-BANK-PITFALLS.md); one scheme tail was
  cut at "Total for Question 9" (`trim-scheme-tails.py`). Part schemes keep the scheme's
  dual F/H reference column ("8(c)(ii)(F) 2(aii)(H)"), which is the printed reference, not
  the other tier's rows.
- **Audit tool.** `tools/parts/audit-part-display.py` reads only the published crops: each
  part's crop starts with its own label, no context shows a printed mark, no context is
  blank. Its flags are leads to inspect, not verdicts (OCR misreads labels on scans).
- **Browser.** `tools/browser-part-context.cjs`: the part's own crop and introduction; the
  context control opens and closes without changing the result count, the open scheme or
  progress, and stays open across viewing the mark scheme ("Back to question"); the part
  scheme is the part's own rows with the whole-question scheme separate; a dependent part
  is offered only inside its linked question; a Foundation test draws Foundation papers
  only; the session never scrolls sideways at 390 or 1280 px.
