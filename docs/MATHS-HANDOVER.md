# Maths corpus: continue here

Updated 15 November 2026. **IN PROGRESS: the full question bank is not yet live.**
The user requires all publicly available Edexcel A level 9MA0 AND AS 8MA0,
including public legitimate variants and separately labelled official samples.
They explicitly requested frequent pushes and a resumable handover.

## Latest working-bank checkpoint (15 November)

- Runtime index currently activates **36 real source booklets, 359 original
  questions and 639 independently scored units**, including173ASunits. This is
  a working partial bank, not a comprehensive completion claim. Remaining exam
  booklets and SAMs are still in review/build queues. Seven2026booklets remain
  restricted and are not acquired.
- Unit year scope is reviewed per assessable unit. Year12 includes AS-scope
  questions from either qualification; Year13 is cumulative by default; its
  additional-topics-only checkbox includes only introduced_year13. A broad
  official point can span both years, so year filtering uses reviewed unit scope
  rather than a point-overlap guess. Qualification chips distinguish8MA0/9MA0.
- Browser verified AS visibility in12and13, exclusion with13only, actual source
  image/scheme loads, explicit zero saved acrossreload, nooverflow320/390/768/1440.
  57unit tests pass; data validation962papers/888records incl other-subject demos,
  zero errors/warnings. New Maths practice suppresses demos while retaining their
  historical lookup IDs. Source-source PDF/report links retain truequalification.
- Source pixels remain losslessWebP. `tools/maths/package_assets.py` packages
  referenced crops into **lazy per-booklet JSONassetcatalogues** under
  `data/maths-assets/`. Original crop caches `assets/maths/` are ignored. The
  browser resolves images to BlobURLs only when a question opens. Do NOT dump
  base64catalogues into an agent context; inspect metadata or render source crops.
  This keeps static publishing to one asset catalogue per booklet, with exact
  original byte checksums and no third-party runtime dependencies.
- `tools/maths/build.py` now indexes schemes and renders reviewed units/context;
  before activating another pack require complete original tariff coverage,
  sourcechecksum identity, valid tags, reviewed year/difficulty, reconciled marks,
  nonempty source/scheme regions, and browser visual checks. Joint tariffs keep
  all prompts. Interstitial givens after a previous tariff stay in the selected
  crop; required earlier printed context is visible and unscored. Derived earlier
  answers must be grouped, never invented. Graph-only continued pages are retained.
- Current build failures: a few ASscheme boundaries,2021ALMechanics32schemeempty
  region cases are under inventoryworkerreview. Rootcompiler now tolerates
  explicitly reviewed duplicate raw label occurrences without doublecounting.
- Active workers: canonical2022ALfourbooklets; earlierworker2023ALfour after
  finishingAS2018–21; inventoryworkerSAMS+schemeedgecases. AS2022–25reviewed.
  All outputs remain `../math-research/reviews`; copy completed versions into
  `data/imports/maths/reviews/` at every checkpoint. Rebuild when reviews change.

## Original acquisition checkpoint

- Approved full-width notebook filters are deployed at parent e9950cf. Four
  difficulty choices, progress checkboxes, one separate Shuffle action. Preserve
  saved marks, learned content, drafts and sets; never reinterpret their IDs.
- `data/imports/maths/inventory/` contains the authoritative source inventory:
  32 public A-level booklets (including distinct 2025 Paper2 modified variant),
  23 public AS booklets; recent secure 2026 documents are recorded separately.
  Metadata and source links are not an imported question bank.
- Acquired 32 A-level QPs +32 MS +32 reports, four official 2019 specification
  maps, specification Issue4, plus the official sample bundle. AS acquisition is
  underway (23QP,23MS,22reports; 2020 AS Statistics report not found).
- `data/specs/EDX_ALEVEL_MATH_9MA0.json` retains 90 stable runtime skills plus
  89 exact official reference groups. Read `math-spec-review.md` for proof1.1 /
  legacyproof1.2 and Statistics4.3 compatibility. Source pixels remain the
  authority for mathematical typography.
- `data/curriculum/math-9ma0.json` is a verified mapping candidate, NOT loaded
  until explicitly merged into curriculum/index.json. Year12/13 SOW relations
  and 14 PureYear1 textbook chapters are sourced; other three books unresolved.
- `data/imports/maths/reviews/` stores completed model reviews and exceptions.
  These are NOT human-reviewed and NOT enabled runtime content packs yet.
- Owner confirmed Pearson permission covers public question-bank republication
  on 14Nov2026. Basis is owner confirmation, not an independent licence audit.
  Plumi's public bank mixes A-level, AS and legacy papers and has no verified
  open-data grant. No competitor records/tags/assets were reused.

## Commands and source pipeline

Development Python needs pdfplumber, pypdfium2 and Pillow. On the current Mac:
`/Users/mimanshakvatsyayan/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3`.
The application remains static HTML/CSS/ES modules, without processing keys.

```sh
python3 tools/maths/acquire.py data/imports/maths/inventory/9ma0-inventory.json --cache ../math-research/sources
python3 tools/maths/acquire.py data/imports/maths/inventory/8ma0-inventory.json --cache ../math-research/as-sources
python3 tools/maths/extract.py ../math-research/sources --output ../math-research/extracted --ocr-dir ../math-research/ocr
swift tools/maths/ocr.swift SOURCE.pdf OCR_DIRECTORY
python3 tools/maths/render.py CANDIDATE.json --question 1 --output QUESTION.png
npm test
npm run validate
```

Sources are immutable cache files named `<paper_id>__<document_kind>.pdf`.
Acquisition verifies PDF magic, SHA256 and source revisions; it refuses secure
paths. The manifest retains checksums, official URLs, dates, restrictions and
missing-document states. Do not bypass teacher logins. Native macOS Vision OCR
is only a positioning/search aid for image-only 2019 applied booklets; display
faithful PDF crops, never OCR math. See `tools/maths/REVIEW.md` for shared schema.

On this host the complete private research workspace is `../math-research/`
(relative to repo). It contains sources, OCR caches, extraction candidates,
review images, scripts and worker outputs. Public checkpoint copies omit private
absolute paths. Do not commit shared-folder keys or textbook PDFs.

## Work now being done / next required steps

1. Finish extraction QA (many items below superseded by latest checkpoint): current text-PDF extraction reconciles 50/100 marks.
   Scanned 2019 applied starts need OCR-boundary correction (inventory worker
   currently fixing `extract.py`). A correct mark sum alone is not layout proof.
   Joint tariffs for (i)+(ii) must include both prompts and have corrected
   display labels; retain all source labels/regions and exceptions.
2. Finish scheme-region indexing and actual runtime-pack builder. Render source
   question/part/shared context and matching schemes to lossless assets. A
   dependent unit groups its needed earlier parts; don't invent supplied results.
   Validate original part coverage once, question totals, paper totals, IDs,
   assets, source checksums, dependencies and model review before accepting.
3. Active review ownership: earlier-years worker:2018 then2020/2021; later-years
   worker:2024/2025 including modifiedP2; lead:2022/2023; inventory worker:2019
   official mappings +SAMS after AS acquisition/OCR. AS batches must follow.
   Every unit needs introduced_year12|13 by assessed skill, difficulty rationale,
   accurate assessed/prerequisite IDs and model_reviewed/needs_review status.
4. AS qualification remains8MA0 in provenance while sharing the Maths skill bank.
   Year12 = AS-scope skills; Year13 default = cumulative full A-level, including
   all AS questions. Add separately labelled 'Year13 topics only' for additional
   material, using reviewed unit introduced_year (not paper year/qualification).
   Do not guess partial point coverage or auto-mark Year12 learned.
5. Correct synthetic combined applied-paper catalogue rows to authenticated
   component metadata:2019+9MA0 uses31Statistics/32Mechanics;8MA0 uses21/22.
   Their exam allocation is shared120min(Alevel) /75min(AS), not officially
   independent60/37.5min timings. Any per-booklet timer is an explicit allocation.
6. Import accepted packs, preserve notebook styling, expose genuine source and
   paper-level report links, distinguish AS/Alevel/sample/modified. Replace demo
   content for Maths only after real material is functional; retain historical
   demo attempt identities rather than destroying learner records.
7. Complete browser tests with real maths/figures, strict and combined filters,
   exact/scope year behavior, AS visibility, schemes, zero/edit/undo/reload,
   sets, shuffle/pagination, phone/tablet/desktop. Update counts from manifests,
   publish checkpoints and final tested corpus; verify deployed files.

## Publishing from this host

Git shell clone/fetch works; shell push has no credentials. Use connected GitHub
create_blob (base64 assets), create_tree with base tree, create_commit parent,
then update_ref(main, expected_sha=oldhead). Never force or discard contributor
work. Match the new tree to local staged content before moving main. Fetch the
published commit; only align local history after exact tree comparison. Existing
GitHub Pages deployment runs automatically. Site domain is purepastpapers.com;
user's singular spelling is shorthand, not a second configured domain.

## Completion report required

Report expected/found/imported/reviewed papers and unique full questions vs
assessable units separately, source schemes/reports, AS/Alevel/sample/variant
coverage, specification/year/textbook coverage, unresolved/restricted records,
checks and deployment SHA. Do not count catalogue links or proposed extraction
candidates as imported or claim a complete corpus while batches remain.

## Build and publish continuation

```sh
python3 tools/maths/build.py INVENTORY --sources SOURCE_CACHE --candidates CANDIDATES --reviews REVIEWS
python3 tools/maths/package_assets.py
```

Build status JSON is under `data/imports/maths/*-build-status.json`; built packs
are in `data/packs/maths/`. Add only accepted packs to `data/packs/index.json`,
then package assets, validate, test browser and publish. A cache resume signature
includes extraction+review contents; update compiler version when crop logic changes.
Original acquisition scripts/evidence and native OCR caches remain private and
reproducible from inventory. ASsource acquisition is now complete68/68documents.

The private `../math-browser-qa.cjs` holds the realbank browser test; copy it into
`tools/` before final completion (it uses optional devPlaywright/Chrome paths).
Do not use the old demo-count browser regressions without adapting their fixtures.
