# Pearson Edexcel A-level English Literature 9ET0 (and AS 8ET0) question bank: handover

Import of `EDX_ALEVEL_ENGLIT_9ET0` under `prompts/subject-question-bank-prompt-v2.md`.
History (`docs/HISTORY-HANDOVER.md`) is the closest pipeline (Pearson essays, CropBox-aware
crops, levels-based schemes). Tags are **model reviews** (`reviewer_type: model`), not teacher reviews.

## Scope (owner, 16 November 2026)

Route from The Reach Free School Sixth Form Prospectus 2025/26: Othello (Paper 1 Section A,
tragedy, with the Critical Anthology), A Streetcar Named Desire (Paper 1 Section B), Science
and Society: Frankenstein and The Handmaid's Tale (Paper 2), Poems of the Decade (Paper 3
Section A) and The Romantics (Paper 3 Section B, the owner's choice). AS 8ET0 is included
(Poems of the Decade, A Streetcar Named Desire, Science and Society). Coursework (9ET0/04)
has no exam. No textbook: navigation is the official specification only.

## Checkpoint 1: specification, sources, extraction, schemes, review, build (16 November 2026)

**Specification** `tools/englit/build_spec.py` builds `data/specs/EDX_ALEVEL_ENGLIT_9ET0.json`
from 9ET0 Issue 11 (August 2025, SHA256 `2f27dbd3…856fd83`) and checks the AS against 8ET0
Issue 8 (September 2023, SHA256 `bad1e11d…cb9fe2`); other revisions are refused. Pearson's
content is a set-text list, so the 45 leaves are the route's texts and prescribed poems in
printed order with positional codes: A.1 Othello, A.2 critical reading (Critical Anthology –
Tragedy), B.1 A Streetcar Named Desire, P.1 The Handmaid's Tale, P.2 Frankenstein, PD.1–PD.20
the Poems of the Decade prescribed poems, PD.U unseen poetry, R.1–R.19 the English Romantic
Verse prescribed poems. Exam questions name the set poem they ask about, so poem leaves carry
direct evidence. 23 leaves are AS-shared (Year 12 basis). Legacy ids migrate:
`EDX_ENGLIT_MODERN_A.1` → the 20 poems, `EDX_ENGLIT_POET_B.1` → the Romantics poems,
`EDX_ENGLIT_POET_B.2` (Keats) → the four Keats poems in the Romantics list. Keats (named
poet), Rossetti and Larkin are not in the route (`options_not_in_scope`). The hidden demo
rows are retagged.

**Sources** (`tools/englit/discover.py`, `inventory.py`): HEAD name probes on Pearson's exam
materials folder, seeded with public search URLs. 45 booklets: A level June 2017–2019,
October 2020 and 2021, June 2022–2025 (Papers 1–3); AS June 2016–2019, October 2020, June
2022–2025 (Papers 1–2). October 2020 schemes use another name pattern
(`9ET0_01_2010-revised-ms.pdf`), added explicitly. Not public: June 2026 (all), AS October
2021 (not sat). Pearson's specimen papers (teaching materials, paper and scheme in one PDF)
are not imported.

**Extraction** (`tools/englit/extract.py`, layout v1): one unit per numbered essay question,
from its number to "(Total for Question n = m marks)". The set-text heading above each pair
decides the route. All 45 booklets reconcile (one tariff per section = cover total) with 0
exceptions: 900 printed questions, 144 on route texts. A-level Paper 3 encloses a Source
Booklet; a Section A question's referenced pages ("page 3 of the source booklet", "(on pages
4-5)") map to PDF pages from the booklet cover and must print the unseen poet and the named
anthology poem. No booklet had copyright-removed poems.

**Schemes** (`tools/englit/schemes.py`): a question's scheme is its own indicative-content
block plus the levels grid(s) for its section. Pearson uses three layouts: grids after each
text's table (2016–2021), grids after all of a section's tables (2023–2025 Paper 1/2), and
grids before a section's tables (2022). Every grid's top marks sum to the question tariff
(Shakespeare: 21 + 14 AO5; AS drama 24 + 24; prose 20 + 20 or AS equivalents).

**Review** (`tools/englit/reviews.py draft|compile`; sheets in
`data/imports/englit/review-src/`): 142 published. Two route questions are left out because
the poem they name is no longer prescribed: AS June 2017 Q1 (Inheritance, Eavan Boland) and
A level June 2017 Q12 (R Alcona to J Brenzaida, Emily Brontë). Othello questions tag A.1 with
A.2 as related content (AO5 is assessed). Difficulty: A level hard (89), AS medium (53).
Leaves with no primary question: A.2 (always related), R.4 The Tyger, R.11 On This Day I
Complete My Thirty-Sixth Year, R.15 The Question, R.16 Ode to a Nightingale.

**Build** (`tools/englit/build.py`, `finalize.py`): question crop; scheme crop (indicative +
grid); unscored context: the prose theme's text list and the Romantics prescribed-text
heading (`stem_image_url`), and for A-level Paper 3 Section A the Source Booklet pages with
the unseen and anthology poems (`figures`). Each route pair is a `choice_group`. Content
year: AS units Year 12; A-level units Year 12 when every primary leaf is an AS set text
(Streetcar, prose, Poems of the Decade without unseen), else Year 13: 89 / 53. Curriculum
mapping `edx-9et0-8et0-co-teaching-years` (23 / 22).

Tests: `tests/englit-bank.test.mjs` (6 pass, no validation warnings). Browser check:
`tools/browser-englit-bank.cjs`.

Reproduce (R = a private research folder outside the repo):

```sh
python3 tools/englit/build_spec.py $R/sources/gce2015-a-level-eng-lit-spec.pdf $R/sources/as-literature-spec.pdf
python3 tools/englit/discover.py --output $R/discovery.json
python3 tools/englit/inventory.py $R/discovery.json --research $R
python3 tools/englit/extract.py --research $R
mkdir -p $R/review-src && cp data/imports/englit/review-src/*.txt $R/review-src/
python3 tools/englit/reviews.py compile $R
python3 tools/englit/build.py --research $R
python3 tools/englit/finalize.py --research $R [--activate]
```
