# AQA A-level Sociology 7192 (and AS 7191) question bank: handover

Live working notes for the AQA Sociology import (`AQA_ALEVEL_SOC_7192`), run under
`prompts/subject-question-bank-prompt-v2.md` (project files). The pipeline is
`tools/sociology/`, adapted from Psychology (`docs/PSYCHOLOGY-HANDOVER.md`).

## Run settings and owner decisions (16 November 2026)

- Network: the "purepastpapers" environment; `www.aqa.org.uk` and `cdn.sanity.io` reachable.
- Rights: the owner confirmed AQA permission on 16 November 2026 (covers AQA papers).
- Route (The Reach Free School Sixth Form Prospectus 2025/26): Paper 1 Education with theory
  and methods, Paper 2 **Families and households** (Section A) and **Beliefs in society**
  (Section B), Paper 3 Crime and deviance with theory and methods. AS 7191 included (AS
  Paper 2 Section B: Families and households). Other Paper 2 topics are extracted so every
  booklet reconciles but are not published.
- Textbook: none; navigation is the official specification only.
- Publishing: tested checkpoints go straight to `main`. Reviews are model reviews.

## Checkpoint 1: specification, inventory, extraction (16 November 2026)

**Specification** `data/specs/AQA_ALEVEL_SOC_7192.json` from AQA-7191-7192-SP-2015.PDF
(Version 1.2, 14 October 2021, SHA256 `914de536…5c62a`; the current specification, so every
public paper was set on it). `tools/sociology/build_spec.py`. 30 leaves: AQA content-section
bullets coded by position (`4.1.1 (2)` = `AQA_SOC_4.1.1_b2`). Methods in Context prints one
sentence and is one leaf (`4.1.2 (1)`). Theory and Methods is printed twice with identical
bullets (4.1.3 for Paper 1, 4.3.2 for Paper 3); it is built once from 4.1.3 and Paper 3
theory questions use those leaves. 15 leaves are AS 7191 shared content (Year 12 basis).
Seeded leaf ids migrate (`legacy_ids`); the 16 hidden demo rows are retagged.

**Inventory** (`tools/sociology/resources.py`, `fetch.py`, `inventory.py`): 31 booklets.
A level 7192: Nov 2020, Nov 2021, June 2022-2025 and the specimen set (21). AS 7191: Nov 2020
and June 2022-2025 (10). Not public: June 2017-2019, AS Nov 2021, an AS specimen.

**Extraction** (`tools/sociology/extract.py`, layout v1): one unit per AQA question; the
"Item A" text sits inside the question, so it is part of the unit's crop. Paper 2 choice
groups come from "Topic A2 Families and Households" headings. All 31 booklets reconcile
to their cover maximum with 0 exceptions; 191 units are in route.

**Schemes** (`tools/sociology/schemes.py`): AQA Sociology schemes print each question in a
table row; the label may sit alone ("07   20") beside wording on the line above, or before
wrapped wording. Those rows count only when their tariff matches (or when the wording line
overlaps the label) and page numbers are ignored. Every unit's scheme region was checked to
start with its own question wording.

## Checkpoint 2: model review and build (16 November 2026)

**Model review** (`reviewer_type: model`, never a teacher review). One line per in-route unit
in `data/imports/sociology/review-src/<PAPER>.txt` (the codes per unit are also kept as the `CODES` table in `codes.py` there; format in
`tools/sociology/reviews.py`), compiled to `data/imports/sociology/reviews/`. All 191 in-route
units are published; no model-review exclusions. 201 Paper 2 option units outside the route
are listed in `coverage.json`, not published. Difficulty follows the AQA tariff ladder (2 and
4 marks easy, 6 and 10 medium, 16/20/30 hard): 39 easy, 90 medium, 62 hard.

**Build** (`tools/sociology/build.py`, `finalize.py`, adapted from Psychology):
- One unit per AQA question (the Item is inside the question crop), question-only scheme
  crop, lossless WebP.
- Reconciliation per booklet: published marks = cover maximum (A level 80, AS 60).
- Content year: AS 7191 units Year 12; A-level units Year 12 only when every primary leaf is
  AS-shared, else Year 13 (132 / 59). Curriculum mapping `aqa-7192-7191-co-teaching-years`.
- 29 of 30 leaves have a primary unit. `4.1.3 (10)` (value freedom) has none: no public
  question takes it as its main focus.

Tests: `tests/sociology-bank.test.mjs` (6 pass, no validation warnings). Browser check:
`tools/browser-sociology-bank.cjs`.

Reproduce after Checkpoint 1's commands:

```sh
cp data/imports/sociology/review-src/*.txt $R/review-src/
python3 tools/sociology/reviews.py compile $R
python3 tools/sociology/build.py --research $R
python3 tools/sociology/finalize.py --research $R [--activate]
```

## Next action

Activated 16 November 2026 (own commit). Browser check `tools/browser-sociology-bank.cjs` passes (191 units, source and scheme pixels, paper page, 4 widths). The paper filter now sits in the compact filter bar's "More" popover, so the Sociology and Psychology browser scripts open it first; the other subjects' browser scripts still select the paper directly and need the same change.
