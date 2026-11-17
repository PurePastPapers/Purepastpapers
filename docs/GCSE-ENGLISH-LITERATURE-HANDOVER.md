# Eduqas GCSE English Literature (C720QS) question bank: handover

Import of `EDUQAS_GCSE_ENGLIT_C720QS` under `prompts/subject-question-bank-prompt-v2.md`.
The A-level English Literature pipeline (`tools/englit`, `docs/ENGLISH-LITERATURE-HANDOVER.md`)
is the template. Tags are **model reviews** (`reviewer_type: model`), not teacher reviews.

## Scope (owner, 16 and 17 November 2026)

Route: Macbeth (Component 1 Section A), the Eduqas Poetry Anthology (Component 1 Section B),
An Inspector Calls (Component 2 Section A), A Christmas Carol (Component 2 Section B) and
unseen poetry (Component 2 Section C, compulsory). Untiered. No textbook: navigation is the
official specification only ("textbook organisation awaiting owner").

Rights: the owner confirmed Eduqas (WJEC) publication on a decision card on 17 November 2026.
Hosts: `www.eduqas.co.uk` (listing, specification, anthology) and
`pastpapers.download.wjec.co.uk` (paper files; added to the `purepastpapers` environment
allowlist on 17 November 2026).

## Anthology change (important)

Specification Version 4 (August 2024) replaces the 18-poem anthology (examined until 2026)
with a 15-poem anthology examined from 2027. No poem is in both. Every public anthology
question (Component 1 questions 71 and 72) names or compares a poem from the old anthology,
so all 16 are left out as `removed_from_specification` and listed in `coverage.json`, the
same rule as the A-level import. The 15 new poems are spec leaves (P.1 to P.15) with no
past questions yet. The Summer 2022 C722U20-A booklet (anthology only) therefore has no
pack and is listed under `booklets_without_route_units`. If the owner wants the old
anthology questions as extra practice, they would need a separate non-course topic.

## Specification

`tools/gcseenglit/build_spec.py` builds `data/specs/EDUQAS_GCSE_ENGLIT_C720QS.json` from
Version 4 (SHA256 `4ffb7a97…f543f`) and the 2027 anthology PDF (SHA256 `d1fd0b9a…71da`); other
revisions are refused. 20 leaves: A.2 Macbeth, P.1 to P.15 anthology poems (Version 4
appendix order, page numbers from the anthology contents), A.1 An Inspector Calls, B.1 A
Christmas Carol, C.1 unseen single poem, C.2 unseen comparison. Earlier ids for these texts
are kept; `ANTH_B.1` / `ANTH_B.2` migrate to the 15 poems. Out-of-route generated leaves
(other set texts) are dropped; the hidden demo rows naming Romeo and Juliet and Jekyll and
Hyde are retagged to Macbeth and A Christmas Carol.

## Sources

`tools/gcseenglit/inventory.py` holds the file list from the Eduqas page's Past Papers tab
(`/umbraco/surface/TabSurface/GetpastpapersTab?qualificationId=38424`). 19 public booklets
with schemes: Summer 2017 to 2019, Autumn (November) 2020, Summer 2022 (adapted C722 series:
five one-hour papers, one per section), Summer 2023 to 2025. The November 2020 Component 1
paper is unlisted but public at `O20/o20-5720-01.pdf` (its scheme is listed). Not public:
November 2021 Component 1 scheme (paper listed, so not imported), November 2021 Component 2,
Summer 2026. No copyright-removed content was found. Braille versions are not used; no
examiner reports are on the public page.

## Extraction and schemes

`extract.py` (layout `eduqas-c720-layout-v1`) reads the boxed two-digit question codes and
`[n]` tariffs. Shakespeare unit 21 is the text heading, rubric and question with the extract
pages; 22 is the essay. Post-1914 and 19th century units run from the code to the next code,
so the crop carries the extract. Unseen 31 is the section rubric, question and first poem;
32 is the comparison and second poem, with unit 31's region as unscored context
(`context.figures`). Every booklet reconciles (each text 40 marks, one text per section,
sections = cover total) with 0 exceptions: 256 printed questions, 64 on route.

`schemes.py`: a unit's scheme is its own indicative content plus its grid(s): the Shakespeare
extract grid (21) or essay grid (22, the play's AO4 grid is inside its indicative pages), the
Section A or B generic grid, or the unseen 31 / 32 grids. 2024 prints both unseen grids
before both indicative blocks; the block logic handles both orders.

## Review and build

`reviews.py draft|compile` (sheets in `data/imports/gcseenglit/review-src/`, edited after
drafting, so do not re-run `draft` over them): 48 published. Difficulty: 15-mark extract and
single unseen poem questions medium (16), 25-mark essays/comparisons and 40-mark essays hard
(32). `build.py` writes 18 packs (`data/packs/gcseenglit/`); `finalize.py --activate` writes
catalogues (`data/gcseenglit-assets/`), identities and coverage and lists the packs in the
live index. Component 1 papers warn in `npm run validate` (40 of 80 marks published: the
anthology half is removed content); this is expected.

Tests: `tests/gcseenglit-bank.test.mjs` (6 pass). Browser check: `tools/browser-gcseenglit-bank.cjs`
(18 booklets, 48 units, source and scheme pixels, paper page, 4 widths: pass). `npm test`:
163 of 164 pass; the failure ("a part is held back...") also fails on main.

Reproduce (R = a private research folder outside the repo):

```sh
python3 tools/gcseenglit/inventory.py --research $R
curl -o $R/sources/spec-c720qs-v4.pdf https://www.eduqas.co.uk/media/x2zpzwgt/eduqas-gcse-english-lit-spec-from-2015-e.pdf
curl -o $R/sources/anthology-2027.pdf https://www.eduqas.co.uk/media/zd1b4ii5/new-poetry-anthology-for-first-examination.pdf
python3 tools/gcseenglit/build_spec.py $R/sources/spec-c720qs-v4.pdf $R/sources/anthology-2027.pdf
python3 tools/gcseenglit/extract.py --research $R
mkdir -p $R/review-src && cp data/imports/gcseenglit/review-src/*.txt $R/review-src/
python3 tools/gcseenglit/reviews.py compile $R
python3 tools/gcseenglit/build.py --research $R
python3 tools/gcseenglit/finalize.py --research $R --activate
```

## Next action

Live once the PR merges. Possible follow-ups: questions on the 2027 anthology once Eduqas
publishes 2027 papers (or its new sample assessment materials); the November 2021
Component 1 paper if its scheme is published.
