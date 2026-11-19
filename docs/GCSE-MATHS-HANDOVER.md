# GCSE Mathematics 1MA1 question bank: handover

Notes for the Pearson Edexcel GCSE (9–1) Mathematics import (`EDX_GCSE_MATH_1MA1`).
The pipeline is the A level Physics/Maths one (see `docs/PHYSICS-HANDOVER.md`,
`docs/MATHS-HANDOVER.md` and `docs/PART-DISPLAY.md`), adapted for 1MA1's two tiers.

## Status (17 November 2026)

**Active: all 60 public booklets**, 1,523 source questions, 2,138 scored units,
4,800 marks, every unit's tariff matched to the paper's printed tariffs.
Tags and difficulty are **model-reviewed** (`reviewer_type: model`), not teacher-reviewed.

| Tier | Booklets | Source questions | Scored units | Marks |
| --- | ---: | ---: | ---: | ---: |
| Foundation (1F, 2F, 3F) | 30 | 854 | 1,217 | 2,400 |
| Higher (1H, 2H, 3H) | 30 | 669 | 921 | 2,400 |

Difficulty: 830 easy, 885 medium, 423 hard. Exact figures are in
`data/imports/gcsemaths/coverage.json`.

## Tiers

Tiers are kept apart and never merged. Every paper and unit carries
`tier: "Foundation" | "Higher"` and `paper_code` 1F…3H. The existing practice filter
already offers **Tier** under *More* (`state.tier` / `filter-engine` tiers), so no UI
change was needed for the import. A tier choice when **adding the subject** is a UI
change and is waiting on William's approval of mock-ups (see project memory); it has
not been touched.

Questions printed on both tiers (the overlap questions) stay as separate units on each
paper, with the tier's own tags and difficulty (an overlap question is usually rated a
step harder on Foundation).

## Specification

`data/specs/EDX_GCSE_MATH_1MA1.json` is built by `tools/gcsemaths/build_spec.py` from
Pearson's specification PDF (SHA256 `c30745f2…84f8b`; the build refuses any other file).

- Leaves are the **97 official subject-content statements** `EDX_GCSE_MATH_N1`…`S6`
  (N1–16, A1–25, R1–16, G1–25, P1–9, S1–6), each with Foundation and Higher wording.
- **11 statements are Higher only** (`tier: "Higher"`): A13, A15, A16, A20, R15, G8, G10,
  G22, G23, P9, S3. The build and the test refuse a Higher-only tag on a Foundation unit.
- Sections reuse the earlier runtime topic ids (`EDX_GCSE_MATH_NUM`, `_ALG`, `_RATIO`,
  `_GEOM`, `_PROB`, `_STAT`). The earlier unverified points (`EDX_GCSE_MATH_NUM_1.2` …)
  are `legacy_ids`; `js/config/spec-id-migrations.js` (regenerated with
  `tools/write_spec_migrations.py`) expands them so saved ticks keep their meaning.
  The 17 hidden demo questions in `data/questions/EDX_GCSE_MATH_1MA1.json` were moved
  to the same official leaves.

## Sources

`tools/gcsemaths/discover.py` HEAD-probes Pearson exam-material file names on
qualifications.pearson.com (no secure or signed-in paths). Pearson uses two path styles
(`.../GCSE/mathematics/2015/exam-materials/1MA1_1F_que_YYYYMMDD.pdf` and
`.../GCSE/Mathematics/2015/Exam-materials/1ma1-1f-que-YYYYMMDD.pdf`); both are probed.
`tools/gcsemaths/inventory.py` writes `data/imports/gcsemaths/inventory/1ma1-inventory.json`.

| Series | Public | Not public |
| --- | --- | --- |
| June 2019, Nov 2020, Nov 2021, June 2022, Nov 2022, June 2023, Nov 2023, June 2024, Nov 2024, June 2025 | all 6 papers, with QP, MS and examiner report | |
| June/Nov 2017, June/Nov 2018 | | QP and MS withdrawn from the public site |
| Nov 2019 | | QP not public (MS and report are) |
| Nov 2025, June 2026 | | not yet released on 17 Nov 2026 |

Summer 2020 and 2021 were not sat. All 42 non-public booklets are listed in
`coverage.json` → `not_publicly_available` with the probe evidence in the inventory.
Official sample assessments are not imported (optional follow-up). William asked for
"new papers only", so the legacy (pre-2017) GCSE was not considered.

## Pipeline (rerun order)

Research files live outside the repo (PDFs, candidates, review sheets, model reviews).

```
python3 tools/gcsemaths/extract.py …            # candidates: questions, parts, tariffs
python3 tools/gcsemaths/reviews.py <research> "*.txt"   # compile model reviews
python3 tools/gcsemaths/build.py data/imports/gcsemaths/inventory/1ma1-inventory.json \
  --sources <research>/sources --candidates <research>/candidates --reviews <research>/reviews
python3 tools/gcsemaths/finalize.py --research <research>
for pid in …; do python3 tools/parts/refine.py --subject gcsemaths --rescheme \
  --sources <research>/parts-sources --paper $pid; done
python3 tools/gcsemaths/finalize.py --research <research>   # recount refined assets
```

`build.py` skips a pack whose `build_signature` matches; bump the signature string when
build or scheme logic changes. Images go to the lazy catalogues
`data/gcsemaths-assets/<PAPER>.json`; `assets/gcsemaths/` is a local build folder (ignored).

### 1MA1 layout notes

- A single-part question has no `(n)` tariff, so `extract.py` uses
  "(Total for Question N is M marks)" as its tariff. A question that starts mid-page
  starts below the previous question's Total line.
- Mark schemes are tables headed `Question | Answer | Mark | Mark scheme | Additional
  guidance` under a `Paper: 1MA1/1H` bar; references sit at x < 110pt with "5" and "(a)"
  20–31pt apart. The last question stops at the last page with a `Paper:` bar (later
  pages hold notes and Modified Large Print amendments).
- `tools/parts/refine.py` changes for 1MA1 (they also apply to other subjects but those
  packs were not re-run): wider number-to-label gap, `(a)(i)` combined labels, a lone
  `(ii)` row inherits the previous letter, answer-column numbers are not row references,
  the header row is never cut, and for `gcsemaths` marks are counted from the Mark
  column codes (M1, A1, B2, P1, C1) rather than numbers in the guidance column.
- Units that are the whole question have `scheme_scope: "whole_question"`, so the app
  does not show the "including other parts" note on single-part questions.

## Part display

1,094 of 1,098 multi-part units have their own crop and their own scheme rows
(verified against the Mark column). Four keep the whole-question scheme with the usual
note: 2023 Nov 3H Q18(b), 2023 Nov 1H Q11(a)(ii), 2024 Nov 1F Q11(b) and 2024 Nov 1H
Q9(b). They show the correct scheme, just with the other part's rows too.

## Checks

- `node --test tests/gcsemaths-bank.test.mjs` (totals 80 per booklet, tier matches
  paper code, no Higher-only tag on Foundation, model reviewer, spec leaf counts,
  identities, tariffs, asset checksums) and gcsemaths is in `tests/part-display.test.mjs`.
- `npm run validate`: 0 errors.
- `node tools/browser-gcsemaths-bank.cjs` (server on :5173): total count, Foundation
  and Higher tier filter counts, part crop and part scheme pixels load, no overflow at
  320/390/768/1440px, no console errors.
- Known unrelated failure on main: `tests/part-display.test.mjs` "a part is held back
  until the earlier part it builds on is learnt too" fails on `origin/main` too.

## Follow-ups

- ~~Tier choice when adding the subject~~ done: see *Tier picker* below.
- Official SAMs (optional), Nov 2025 and June 2026 when Pearson publishes them.
- Teacher review of model tags if wanted.

## Tier picker (17 November 2026)

William chose option A (tier cards). A subject with `"tiers"` in `data/subjects.json`
(GCSE Maths so far) shows a "Choose your tier" step in the add/edit subject window:
Foundation, Higher or Not decided yet. The choice is saved in
`preferences.tiers[subject_id]`. Practice starts with its Tier filter on that tier (Reset
keeps it; changing the setting resets the filter once) and Past papers gets a Tier
filter defaulting to it. Other tiered GCSEs only need `"tiers": ["Foundation", "Higher"]`
in the registry and `tier` on their papers/questions. Check: `node tools/browser-tier-picker.cjs`.

Update 19 November 2026: the GCSE sciences (1SC0, 1BI0, 1CH0, 1PH0) use the same picker with
`"tier_required": true`, which removes "Not decided yet". Practice now shows the Tier as a
visible control (Foundation / Higher / Both tiers) beside the mode switch instead of a select
under *More*, for Maths too; Maths otherwise behaves as before. See the science handovers.
