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
