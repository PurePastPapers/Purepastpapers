# OCR GCSE Computer Science J277 question bank: handover

Notes for the OCR GCSE (9-1) Computer Science import (`OCR_GCSE_CS_J277`). The pipeline is the
A-level CS one (`docs/COMPUTER-SCIENCE-HANDOVER.md`, `tools/cs/`) copied to `tools/gcsecs/` and
adapted: one qualification, 80-mark papers, no AS, no tiers, no coursework.

## Status (21 November 2026)

**Built and verified, NOT live.** All 10 public booklets are built: 8 exam papers (June 2022,
2023, 2024, 2025; Papers 1 and 2) and the 2 official sample papers. 282 scored units, 800 marks,
each booklet reconciled to its 80-mark cover total, every one of the 26 specification
sub-topics has at least one primary unit. Tags and difficulty are **model-reviewed**
(`reviewer_type: model`), not teacher-reviewed.

Difficulty: 88 easy, 153 medium, 41 hard (`data/imports/gcsecs/coverage.json`).

**Rights: not confirmed for GCSE.** The owner's 16 November 2026 confirmation names OCR A-level
Computer Science H446/H046 (and OCR Chemistry H432/H032). It does not name J277, so the packs
are kept out of `data/packs/index.json` and no crop catalogue is committed. Coverage status is
`built_awaiting_rights_confirmation`.

### To go live (only once the owner confirms OCR permission for GCSE J277)

1. Recreate the research folder (below), then
   `python3 tools/gcsecs/finalize.py --research ../gcsecs-research --activate`.
   This lists the 10 packs in the index and writes `data/gcsecs-assets/<PAPER>.json`
   (lazy lossless crop catalogues; the site serves `assets/gcsecs/...` crops from them).
2. Set `rights_basis` wording in `tools/gcsecs/finalize.py` to the owner's confirmation.
3. `npm test`, `npm run validate`, then add `tools/browser-gcsecs-bank.cjs` (copy of
   `browser-cs-bank.cjs`) and run it against `npm start`.

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
- No browser test yet (`tools/browser-gcsecs-bank.cjs`), because the packs are not live.
