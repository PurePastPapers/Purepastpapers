# Edexcel A-level History 9HI0 (Route H) question bank: handover

Working notes for the History import (`EDX_ALEVEL_HIST_9HI0`), run under the same
brief as Physics and Politics (`docs/prompts/SUBJECT-QUESTION-BANK-AGENT.md`). See
`docs/PHYSICS-HANDOVER.md` for the reference pipeline.

## Scope (owner, 16 November 2026)

Route H only: **Paper 1 option 1H** (Britain transformed, 1918–97), **Paper 2 option
2H.2** (The USA, 1955–92: conformity and challenge) and **Paper 3 option 33** (The
witch craze in Britain, Europe and North America, c1580–c1750). Option 2H.1 (Boom,
bust and recovery) is excluded even though it shares the 9HI0/2H booklet.
Coursework has no exam and is out of scope. Pearson permission (14 November 2026)
covers these papers, so the packs are live.

## Checkpoint 1: complete and live (16 November 2026)

**Status: complete.** 27 booklets (June 2017–2019, October 2020 and 2021, June
2022–2025, for each of 1H, 2H and 33), 117 scored questions, 1,440 marks. Every
booklet reconciles to its option maximum (1H 60, 2H.2 40, 33 60), counting one
question per choice group. Nothing is excluded: no public booklet had
copyright-removed material in these options. The June 2026 papers are not yet
public and are recorded as unavailable. Pearson's specimen (SAM) collation is no
longer at its public URL, so no specimens are used, and no third-party copies were
used.

| Option | Booklets | Questions | Marks available |
| --- | --- | --- | --- |
| 1H | 9 | 45 | 540 |
| 2H.2 | 9 | 27 | 360 |
| 33 | 9 | 45 | 540 |

### Specification

`tools/history/build_spec.py` builds `data/specs/EDX_ALEVEL_HIST_9HI0.json` from
Pearson's 9HI0 specification, Issue 4 (June 2026, SHA256 `fdb12503…7a17735`). The
build refuses any other revision.

- There are 51 leaves, each one official content bullet with Pearson's wording verbatim
  and its source page: 1H 16 (12 theme bullets plus 4 interpretations bullets), 2H.2
  16, and 33 19 (4 breadth, 15 depth). Pearson prints bullets unnumbered, so a code
  is the bullet's printed position (for example `2.3`, `INT.1`, `D.3.2`).
- Existing ids that were already one bullet are kept. The grouped ids
  `EDX_HIST_1H_INT_5.1`, `EDX_HIST_33_B*` and `EDX_HIST_33_D*` migrate to all their
  bullets through `js/config/spec-id-migrations.js`.
- There is no Year 12/13 split in the specification, so none is recorded.

### Sources

`tools/history/discover.py` reuses the Physics name-probe tool on Pearson's exam
materials folder (HEAD requests only, no secure paths). Names change case in 2022
(`9HI0_1H_que_…` becomes `9hi0-1h-que-…`). `tools/history/inventory.py` fetches
each PDF into the private cache and records its SHA256 and size in
`data/imports/history/inventory/9hi0-route-h-inventory.json`. Each question paper
PDF includes its Extracts or Sources Booklet after the answer pages.

### Extraction and schemes

- `extract.py` (v3) makes one unit per question. A question's crop runs from the
  line after the previous tariff to its own `(20)` or `(Total for Question n = 20
  marks)`. Source and extract questions also get their booklet block ("Sources for
  use with Question 2", "Extracts for use with Section C", "Source for use with
  Section A") as context pixels, ending before the acknowledgements.
- 2H keeps only the questions under "Option 2H.2" (Q2, Q5, Q6).
- **The question-paper PDFs have a CropBox inset of 28.35 pt.** Region fractions
  are therefore CropBox-relative to match the renderer. The AQA and Physics sources
  were checked and are unaffected.
- `schemes.py`: a question's scheme is its section's generic level descriptors
  followed by its own "Question | Indicative content" block. The 2025 Paper 3
  scheme prints its Q2 cell as "22", and the indexer accepts that.

### Review

The tagging is a model review (`reviewer_type: model`), with sheets compiled by
`tools/history/reviews.py`. Difficulty is medium 54 and hard 63:

- **Hard:** every 1H breadth essay and interpretations question, and every 33
  Section C breadth essay.
- **Medium:** the 2H.2 and 33 depth essays and source questions.
- None are marked easy or Extra hard, because every question is a 20-mark extended
  answer.

Three 2H.2 bullets have no primary question yet: 1.1 (urbanisation and affluence),
3.2 (economic change) and 3.4 (individual and civil rights).

### Checks

- `tests/history-spec.test.mjs` and `tests/history-bank.test.mjs` pass, and the
  full suite passes.
- `npm run validate` shows 0 errors.
- `tools/browser-history-bank.cjs` passes: all 117 units are in the bank, question,
  scheme and booklet images load, a paper page lists its 5 questions, and there is
  no overflow from 320 to 1440 px.

### Reproduce

```sh
R=../history-research   # spec.pdf, sources/, candidates/, review-src/, reviews/
python3 tools/history/build_spec.py $R/spec.pdf
python3 tools/history/discover.py --output $R/discovered.json
python3 tools/history/inventory.py $R/discovered.json --cache $R/sources --out data/imports/history/inventory
INV=data/imports/history/inventory/9hi0-route-h-inventory.json
python3 tools/history/extract.py $INV --sources $R/sources --output $R/candidates
python3 tools/history/reviews.py $R
python3 tools/history/build.py $INV --sources $R/sources --candidates $R/candidates --reviews $R/reviews
python3 tools/history/finalize.py --research $R
```

### Still open

- The June 2026 papers, once Pearson publishes them.
- The textbook organisation, because none has been supplied.
