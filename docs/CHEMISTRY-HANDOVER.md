# OCR A Level Chemistry A H432 (with AS H032) question bank: handover

Live working notes for the OCR Chemistry A import (`OCR_ALEVEL_CHEM_H432`), run under
`docs/prompts/SUBJECT-QUESTION-BANK-AGENT.md`. Nothing is called complete while public
booklets are still queued.

## Run settings and owner decisions (17 November 2026)

Asked once, in one decision card, at the start of the run:

- **Rights: confirmed.** The owner confirmed OCR Chemistry A H432/H032 may be republished
  (the earlier OCR confirmation named Computer Science only, so this was asked again).
- **Scope:** A Level H432 plus AS H032, all public series June 2017 to June 2025 (incl. Nov 2020
  and Nov 2021) plus OCR's official sample assessment materials. Chemistry B (Salters, H033/H433)
  is a different qualification and is not in scope. The practical endorsement (H432/04) is not a
  written exam and is excluded.
- **Textbook:** none supplied. Navigation is the official OCR specification only
  (**textbook organisation awaiting owner**).
- Network: `www.ocr.org.uk` / `ocr.org.uk` are on the owner's personal "Purepastpapers"
  environment allowlist; all PDFs come from `www.ocr.org.uk/Images/`. Probed OK on 17 Nov.
- Reviews are `reviewer_type: model`, never teacher review.

## Checkpoint 1: inventory, extraction, spec (17 November 2026)

**Status: superseded by Checkpoint 2 below (live).**

- `tools/chem/inventory.py` reads OCR's public assessment page. 30 H432 booklets
  (Jun 2017/18/19, Nov 2020, Nov 2021, Jun 2022/23/24/25 x 3 components, + 3 samples) and
  22 AS H032 booklets (Jun 2016 to Jun 2025 incl. Nov 2020/21, + 2 samples) = 52. Each PDF is
  cached by SHA-256 in `../chem-research/sources`. Data sheets/booklets are recorded per paper.
- `tools/chem/extract.py` (adapted from `tools/cs/extract.py`): **all 52 booklets reconcile to
  their cover totals with 0 exceptions: 839 questions, 2,018 scored units, 4,240 marks.**
  A multiple choice question is one unit (1 mark). Fixes needed vs the CS pipeline: "Additional
  answer space if required" is printed inside question pages (not a stop marker); a question
  number alone is accepted in the true margin even when followed by a digit; sample papers
  repeat the number before each part ("18 (b)"); a tariff split by kerning ("[ 5 ]") and the
  diagonal SPECIMEN watermark in sample papers.
- `tools/chem/schemes.py`: every unit has scheme rows (see Checkpoint 2 for the final split).
- **Board corrections:** H432/01 June 2022 Q13 is withdrawn by OCR's post-exam correction
  (total becomes 99): recorded in `withdrawn_questions` and excluded. H032/01 June 2017 has an
  erratum notice (23(c) Kc units should read dm^6 mol^-2): recorded as `board_erratum` on that unit.
- `tools/chem/build_spec.py` verifies the 43 numbered sections of `data/specs/OCR_ALEVEL_CHEM_H432.json`
  against H432 spec v3.1 (May 2026) and adds OCR's lettered learning outcomes as content, the AS H032
  map (Modules 1 to 4 share section numbers) and A-level-only flags. Skill ids are unchanged.

### Reproduce

```sh
R=../chem-research
curl -A "Mozilla/5.0" -o $R/page.html https://www.ocr.org.uk/qualifications/as-and-a-level/chemistry-a-h032-h432-from-2015/assessment/
python3 tools/chem/inventory.py $R/page.html --sources $R/sources
for q in H432 H032; do python3 tools/chem/extract.py data/imports/chem/inventory/$q-inventory.json --sources $R/sources --output $R/candidates; done
curl -o $R/specs/171720-specification-accredited-a-level-gce-chemistry-a-h432.pdf https://www.ocr.org.uk/Images/171720-specification-accredited-a-level-gce-chemistry-a-h432.pdf
curl -o $R/specs/171750-specification-accredited-as-level-gce-chemistry-a-h032.pdf https://www.ocr.org.uk/Images/171750-specification-accredited-as-level-gce-chemistry-a-h032.pdf
python3 tools/chem/build_spec.py $R/specs/171720-*.pdf $R/specs/171750-*.pdf
```

## Checkpoint 2: built, verified and live (17 November 2026)

**Status: all 52 public booklets imported and listed in `data/packs/index.json`** (owner confirmed OCR
Chemistry rights the same day). Reviews are **model review** (`reviewer_type: model`) everywhere; no
teacher review exists.

| Group | Booklets | Questions | Scored units | Marks published | Examiner report |
| --- | --- | --- | --- | --- | --- |
| A-level H432 Exams Paper 01 (100) | 9 | 196 | 434 | 899 | 8 |
| A-level H432 Exams Paper 02 (100) | 9 | 198 | 410 | 900 | 8 |
| A-level H432 Exams Paper 03 (70) | 9 | 51 | 250 | 630 | 8 |
| A-level H432 official samples 01/02/03 | 3 | 49 | 124 | 270 | 0 |
| AS H032 Exams Paper 01 (70) | 10 | 254 | 418 | 700 | 7 |
| AS H032 Exams Paper 02 (70) | 10 | 60 | 307 | 700 | 7 |
| AS H032 official samples 01/02 | 2 | 31 | 74 | 140 | 0 |
| **Total** | **52** | **839** | **2,017** | **4,239 of 4,240** | **38** |

- Expected/found/imported booklets: 52 / 52 / 52. Series: June 2017, 2018, 2019, Nov 2020, Nov 2021,
  June 2022 to 2025 (A level); June 2016 to 2025 incl. Nov 2020/2021 (AS); samples.
- **Excluded:** H432/01 June 2022 Question 13 (1 mark), withdrawn by OCR's post-exam correction
  (paper total 99). Counted in coverage (`excluded_copyright_removed`, kind `withdrawn_by_board`).
  No copyright-removed content was found in OCR Chemistry papers (the one AS 2017 paper with removed
  third-party spectra, H032/02 4(b)(ii) and 5(c), still prints the figure-dependent wording; checked at review).
- **Board erratum kept:** H032/01 June 2017 23(c): Kc units printed dm^2 mol^-6, OCR says dm^6 mol^-2
  (`provenance.board_erratum`).
- **Scans:** none. Every paper has a text layer; the diagonal SPECIMEN watermark in samples is filtered.
- **Part display:** every unit is its own part (or whole MCQ) with unscored stem and lead-in context.
  Own scheme rows: 2,013 units; parent-part row: 1 (H432 2018 June 03 2(a)(i)); full-question scheme
  fallback, labelled `full_question`: 3 (H032 2018 June 02 6(b)(ii), H432 2021 Nov 03 1(c), H432 sample 03 1(j),
  where OCR printed no label for that scheme row). Unmatched scheme rows: none reported.
- **Dependency-gated parts: 7** (wording "your answer to ...", "Hence"), each with the earlier part rendered
  as unscored context (`context.stem_image_url`). Detection is wording based: parts that rely on an earlier
  answer without saying so are not gated.
- **Difficulty:** 637 easy, 1,087 medium, 293 hard (model review; no extra hard).
  **Tag mapping:** numbered OCR sections (43) via the lettered learning outcomes; mapping precision was not
  measured against a teacher gold set. Reviewers noted flattened or missing diagrams in extracted text for
  some structure/spectrum questions (tagged from wording and scheme): treat those as lower confidence.
  Every one of the 43 sections has at least one primary unit (smallest: 1.1.1 with 8, 5.3.2 with 8).
- **Teaching years:** AS H032 units Year 12. An A-level unit is Year 12 only if every primary section is
  Modules 1 to 4 (the content AS shares); Modules 5 and 6 are Year 13: Year 12 1,386 units, Year 13 631.
  Co-teaching basis, not an OCR-prescribed order.
- `data/subjects.json` now declares `qualifications` (H432 A-Level, H032 AS) and `content_year_source`.
- **Not imported:** modified-paper ZIPs (same questions), practical endorsement H432/04, moderators' reports,
  Chemistry B (Salters). Examiner reports are not public for 2017 A level, AS 2016/2017/Nov 2021, or samples.
  June 2026 papers are not yet listed by OCR.

### Checks (local)

- `npm test`: 196 of 197 pass (new: `tests/chem-spec.test.mjs` 3, `tests/chem-bank.test.mjs` 7). The 1
  failure ("a part is held back until the earlier part it builds on is learnt too",
  `tests/part-display.test.mjs`) fails identically on a clean checkout of `main`.
- `npm run validate`: 0 errors.
- `python3 tools/chem/verify.py`: 6,424 crops (question, context, scheme) decode with real ink, 0 failures.
- Visually inspected: MCQ + scheme, Born-Haber diagram unit + scheme, shared table context + part, sample
  paper unit (SPECIMEN watermark), dependency context, levels-based extended response scheme.
- `node tools/browser-chem-bank.cjs` against a local server passes (counts, AS filter, Year 12/13 logic,
  stems/lead-ins, question and scheme pixels, saved 0 across reload, sample label, withdrawn Q13, no overflow
  at 320/390/768/1440 with popovers closed, guest does not mutate learning, no console errors). Note: with a
  filter popover open at 320px the page is 330px wide (pre-existing UI, not changed here).

### Reproduce the build

```sh
R=../chem-research   # sources/, specs/, candidates/, review-in/, review-src/, reviews/
python3 tools/chem/inventory.py $R/page.html --sources $R/sources
for q in H432 H032; do python3 tools/chem/extract.py data/imports/chem/inventory/$q-inventory.json --sources $R/sources --output $R/candidates; done
python3 tools/chem/reviews.py prepare $R      # writes review-in/ packets
python3 tools/chem/reviews.py compile $R      # review-src/*.txt line sheets -> reviews/*.json
python3 tools/chem/build.py --research $R
python3 tools/chem/finalize.py --research $R --activate
python3 tools/chem/verify.py
```

The review line sheets (`review-src/`) are the only hand-made input; the compiled reviews are public in
`data/imports/chem/reviews/`. Instructions given to the tagging workers: see "Review method" below.

### Review method and run notes

- Tagging: 16 Claude Sonnet workers at medium effort, each owning 2 to 4 papers (distinct files), lead
  review by spot-check of ~22 random units and the compiler's module rules (H432/01 Modules 1,2,3,5;
  /02 Modules 1,2,4,6; /03 any; AS Modules 1 to 4). The brief's "Sol Medium" model is not exposed on this
  host; Sonnet was used instead. No FLAGs were raised. A lead-review sample looked sensible but a few tags
  are debatable (e.g. sigma-bond counting units tagged to 4.1.x rather than 2.2.2).
- PDF geometry: pages are A4 portrait for papers and landscape for schemes; no inset CropBox seen.
- Scheme tables: rule lines are drawn per cell; two parser fixes were needed for Chemistry (a bare "*" next
  to the question number, and a last row with no closing rule). Two-digit question numbers can be split or
  stacked ("1" over "8").
- Network: only `www.ocr.org.uk` (allowlisted).

### Still open

- Textbook organisation: none supplied (awaiting owner). Lettered learning outcomes are stored as section
  content but are not separate tags.
- June 2026 papers: add when OCR lists them.
- Gold-set precision check of tags and a teacher review would raise confidence.
