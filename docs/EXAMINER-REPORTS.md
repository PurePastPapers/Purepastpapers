# Examiner reports by question

Practice shows **Examiner’s report** beside **Show mark scheme** for papers with reports.
Either control can open independently. A report stays open when the question switches
between the question paper and the mark scheme. Linked cards show shared comments once
and identify the relevant parts. In a timed session the report first becomes available
during marking. Mark-as-you-go sets make the report available after the mark scheme
is revealed. In marking and review the fold loads its contents when opened.

## Sources and coverage

The report must match the active pack's paper ID, subject ID and official source URL.
The source is the publisher's PDF. Each report records its SHA-256, PDF page count and
the actual PDF pages for each excerpt or page-only match. Printed question labels
are kept in the excerpt headings. The matcher normalizes labels for comparison and
checks any section, option or route supplied with the target.

The project owner confirmed on 22 November 2026 that permission covers publishing
examiner-report excerpts and crops for all seven subjects below. The existing Biology A
record also names examiner reports. Candidate responses are linked at the relevant
PDF pages. AQA Politics Answers and Commentaries for the June 2022 questions are
linked as sample-answer commentary under their own label.

| Bank | Coverage decisions |
| --- | --- |
| Edexcel Maths 8MA0/9MA0 | Includes the October 2020 8MA0/21 report under its publisher's unusual file name. Verified the split between Q11(a) and Q11(b) in the October 2020 9MA0/01 report. |
| Edexcel Biology A 8BN0/9BN0 | Includes November 2021 9BN0/01 and /03 with printed short headings. October 2020 AS notices say no reports were published. A public 8BN0/02 June 2022 report was not found. |
| Edexcel Physics 8PH0/9PH0 | Includes October 2020 9PH0/01. June 2024 9PH0/01 has verified page links for Q11–18. Its custom fonts make the text layer unreadable. Candidate answer sheets with similar numbers were excluded when checking the page anchors. Both autumn 2021 AS PDFs are no-report notices. |
| Edexcel History 9HI0 Route H | Supports 1H, 2H.2 and 33. Shared 2H reports omit 2H.1 feedback and keep 2H.2 Q2, Q5 and Q6. The June 2024 1H and 2H text layers are unreadable. Their question headings were visually checked and link to exact PDF pages. Four publisher PDFs are no-report notices. |
| AQA Politics 7152 | 11 active reports have matching booklets. Six November papers have no public report. June 2025 Paper 1 has an official report but no active question pack. Its source is recorded in [availability.json](../data/imports/reports/availability.json). |
| AQA Geography 7036/7037 | 18 reports are integrated. Six newer A-level reports are organised by mark or assessment objective. Their cards show proven excerpts and candidate-response links, with the full PDF for further feedback. Four administered booklets have no public report. |
| OCR Computer Science H046/H446 | 16 question-level reports and two November 2021 general reports. The June 2022–2025 H446/02 Section B start questions are checked against each printed paper. Candidate responses and the examiner's printed Section B code example are presented separately. |

Official specimen papers are excluded from report availability totals. Scope counts
in `coverage.mjs` count each card by its strongest match and additionally count
section feedback alongside a more specific match. A card without a match may belong
to a multiple-choice item or a question the publisher did not remark on. Reports with
unreadable text and verified page links have their own status. Reports with no
question-level feedback and a verified paper overview use `general_only`.

## Data and tools

| Path | Purpose |
| --- | --- |
| `data/reports/index.json` | Lists report files by paper ID and records verified publisher notices where no report exists. |
| `data/reports/<bank>/<PAPER_ID>.json` | Source identity, checksum, page count, review status, general feedback and scoped sections. |
| `data/imports/reports/availability.json` | Source evidence for no-report notices and known reports outside the active packs. |
| `js/engine/examiner-report.js` | Matches printed questions, parts, parent parts, grouped targets and sections. |
| `js/data/examiner-reports.js` | Session fold, Practice panel, official source links, crop zoom and loading. |
| `tools/reports/extract.py` | Common Pearson and Politics extraction plus index generation. |
| `tools/reports/{history,geography,computing}.py` | Report extractors for the three board layouts. |
| `tools/reports/stem_gaps.py` | Rebuilds identified reports with layout exceptions and page-only mappings. |
| `tools/reports/biology_2025.py` | Restores verified short headings and page carryover on AS Biology Paper 1, June 2025. |
| `tools/reports/visible_boxes.py` | Rebuilds verified Physics comment and tip boxes affected by off-page text. |

A section target can be `{"q":"3","part":"(b)(i)"}`, `{"q":"1","part":"01.1"}`
or `{"section":"A"}`. An exact target can also constrain its section, route or option.
When the pack has no section field, a verified printed section can enumerate its
question numbers with `{"section":"A","questions":["1","2"]}`. Multiple targets
identify grouped feedback. An empty paragraph list with verified pages gives a
page-specific PDF link. Candidate-response figures carry a page or page range.
Figures such as an examiner diagram have their own label.

Maths comments with equations use crops. In Physics and Biology, only paragraphs
containing equations are cropped. OCR Computer Science retains one crop for code
indentation. Report crops count towards [the site-size check](SITE-SIZE.md).

## Regenerate and verify

Supply original PDFs under their paper IDs or publisher file names. The different
board extractors read their recorded source inventories and check source identities
or hashes. The shared extractor accepts `--paper PAPER_ID` to select specific papers.
Use the STEM helper for the short headings, verified board misprints, or unreadable
text layers described above.

```sh
python3 tools/reports/extract.py --self-test
python3 tools/reports/extract.py --subject politics --pdf-dir /path/to/pdfs
python3 tools/reports/history.py --pdf-dir /path/to/pdfs
python3 tools/reports/geography.py --pdf-dir /path/to/pdfs --output-dir data/reports/geography
python3 tools/reports/computing.py --pdf-dir /path/to/pdfs
python3 tools/reports/stem_gaps.py /path/to/pdfs --existing-fixes
python3 tools/reports/visible_boxes.py /path/to/pdfs
python3 tools/reports/biology_2025.py /path/to/pdfs/EDX_8BN0_2025_JUNE_01.pdf
python3 tools/reports/extract.py --index-only
node tools/reports/coverage.mjs --all
npm run validate
npm test
node tools/browser-examiner-report.cjs
node --test tests/site-size.test.mjs
```

Compare first and last headings, grouped parts, candidate-response captions, page
breaks and section boundaries with the source PDF and relevant card. Review exact
and negative paper, part, route and option matches. Use `model_reviewed` when the
report is checked to that level. Sampled visual review alone leaves the report
`unreviewed`.
