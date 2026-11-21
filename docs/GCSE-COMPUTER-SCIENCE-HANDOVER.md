# OCR GCSE Computer Science J277 question bank: handover

Notes for the OCR GCSE (9-1) Computer Science import (`OCR_GCSE_CS_J277`). The pipeline is the
A-level CS one (`docs/COMPUTER-SCIENCE-HANDOVER.md`, `tools/cs/`) copied to `tools/gcsecs/` and
adapted: one qualification, 80-mark papers, no AS, no tiers, no coursework.

## Status (21 November 2026)

**Live.** All 10 public booklets are built, verified and listed in `data/packs/index.json`: 8 exam
papers (June 2022, 2023, 2024, 2025; Papers 1 and 2) and the 2 official sample papers. 282 scored
units, 800 marks, each booklet reconciled to its 80-mark cover total, every one of the 26
specification sub-topics has at least one primary unit. Tags and difficulty are **model-reviewed**
(`reviewer_type: model`), not teacher-reviewed.

Difficulty: 88 easy, 153 medium, 41 hard (`data/imports/gcsecs/coverage.json`, status `complete`).

**Rights: confirmed.** The owner confirmed on 21 November 2026 that their permission covers
republishing OCR GCSE Computer Science J277 papers and mark schemes (the 16 November confirmation
had named only A-level H446/H046). 663 lossless crops are packaged as lazy catalogues in
`data/gcsecs-assets/` (11 MB).

Checks before publishing: `npm test` all pass, `npm run validate` 0 errors, and
`node tools/browser-gcsecs-bank.cjs` against `npm start` (282 units discoverable, question and scheme
pixels load, paper page, 320 to 1440 px, no console errors). The browser test has not been run
against production.

## Specification

`data/specs/OCR_GCSE_CS_J277.json` is built by `tools/gcsecs/build_spec.py` from OCR's J277
specification (Version 3.1, May 2026, SHA256 `39aa7d6d…e769d`; other files are refused).
Leaves are OCR's **26 numbered sub-topics** (1.1.1 ... 2.5.2); each carries OCR's bullet content
and Required / Not required guidance. Ids (`OCR_GCSE_CS_1.2.4`) are unchanged from the earlier
unverified tree, so no migration was needed. Content text is machine-parsed from a two-column
PDF and can carry small run-together artefacts (for example bullets joined on one line).

## Sources

`tools/gcsecs/inventory.py` reads OCR's public J277 assessment page and caches each PDF with
SHA-256, size and Last-Modified (`data/imports/gcsecs/inventory/J277-inventory.json`).
Question papers, mark schemes and examiners' reports are public for June 2022 to June 2025.
The two sample papers are one PDF holding the paper and its scheme. Modified-paper ZIPs repeat
the same questions and are not used. June 2026 is not yet listed. J277 has no coursework.
Earlier series (2020, 2021) are not on the public page.

## Method and decisions

- `extract.py`: one scored unit per printed tariff `[n]`, as for A-level CS. All 10 booklets
  reconcile with no exceptions. Two sample-specific rules are in this copy only: a wider label
  column (sample sub-part labels sit at x about 120) and a spaced `*` after the question number
  ("11 * People ..."). Sample paper 2, Q8(a) prints two tariffs under one label
  (tick a box [1], then "Explanation" [1]); they are one 2-mark unit.
- `schemes.py`: scheme rows aligned to the paper's own ordered labels. Three changes versus the
  A-level copy, each verified to leave the 8 exam booklets' scheme regions byte-identical:
  a bare part letter can only continue the current question (a worked example in the sample's
  general marking guidance had jumped the alignment); a lone `*` counts as a label token; and
  label rows as short as 4 pt are kept (sample 2, Q6(a)).
- `build.py` trims a header-only strip (Question / Answer / Marks / Guidance) copied from the top
  of the next page; one scheme (sample 2, Q6(a)) still shows such a strip.
- Tagging is at sub-topic level, one primary sub-topic per unit (a few have a prerequisite).
  Paper 1 units use section 1 only (checked); Paper 2 may use section 1.
- Part-display tools in `tools/parts/` (own crops from the printed label, minimum contexts,
  dependency linking) were **not** run on J277. Units keep the A-level CS treatment: unit crop plus
  shared stem and lead-in context. Run `tools/parts/audit-part-display.py` before going live.

## Reproduce

```sh
R=../gcsecs-research; mkdir -p $R/sources
curl -A "Mozilla/5.0" -o $R/page.html https://www.ocr.org.uk/qualifications/gcse/computer-science-j277-from-2020/assessment/
python3 tools/gcsecs/build_spec.py $R/558027-specification-gcse-computer-science-j277.pdf
python3 tools/gcsecs/inventory.py $R/page.html --sources $R/sources
python3 tools/gcsecs/extract.py data/imports/gcsecs/inventory/J277-inventory.json --sources $R/sources --output $R/candidates
python3 tools/gcsecs/reviews.py prepare $R        # writes review-in/ packets
# one line per unit in $R/review-src/<PAPER>.txt, then:
python3 tools/gcsecs/reviews.py compile $R
python3 tools/gcsecs/build.py --research $R
python3 tools/gcsecs/finalize.py --research $R
```

The reviewers' line sheets live in `data/imports/gcsecs/reviews/` (compiled JSON).

## Known gaps

- Model review only; no teacher review.
- Examiners' reports are linked, not shown.
- Part-display tools in `tools/parts/` not run (see above); run `audit-part-display.py` and
  look at representative crops.
- June 2026 papers: add when OCR lists them (rerun from `inventory.py`).
