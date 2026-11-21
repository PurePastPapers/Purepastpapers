# Examiner reports by question

Every question and part in a subject with linked examiner reports gets an **Examiner's report**
button. It opens the official report's own comments on that question, as printed, in a
panel under the question card. Built 20 November 2026 for A-level Maths (9MA0/8MA0),
Physics (9PH0/8PH0) and Biology (9BN0/8BN0); History and Geography are planned below.

## How it looks and behaves

The button sits beside **Show mark scheme** (single questions) or **Show mark scheme for
all parts** (linked questions). The report is independent of the mark scheme: it opens
under whichever is showing and stays open until it is closed with its own button or the ×.

| Situation | What the student sees |
| --- | --- |
| Question showing, report opened | Panel under the question with "Examiners discuss the answers here. Try the question first." |
| Mark scheme open, report opened | Panel under the mark scheme, so scheme and comments are read together, above the answer box and mark buttons on a phone. No warning. |
| Report open, then mark scheme opened or closed | Report stays where it is, under the new view. |
| Report opened below the screen | Scrolled into view; if it is already visible nothing jumps. Focus moves to its close button. |
| Part with its own comment, e.g. 3(b) | The 3(b) comment, plus sub-parts 3(b)(i), (ii) if the report splits it. |
| Report comments on the whole question too | "On the whole question" comment first, then the part's own. |
| Only a parent-part comment, e.g. 3(b) for unit 3(b)(i) | "The report comments on this part as a whole." |
| Only a whole-question comment | "The report comments on the whole question, not this part on its own." |
| No comment on this question | "The examiners didn't comment on this question" with the paper's general comments folded underneath. |
| Linked question (parts shown together) | One panel for the group: the whole-question comment once, then each part's; a comment shared by two parts appears once with a pointer. |
| Comment shows example scripts | The report's "Examiner Comments" on them fold under "Comments on 2 example responses (2)", with a link to the PDF page where the scripts are printed. |
| Report gives an "Examiner Tip" | Shown as a highlighted "Examiner tip" line under the comment. |
| Comment contains equations (all Maths, some Physics/Biology) | The comment is shown as a crop of the printed report, so fractions, powers and brackets stay exact; the text is the image's alt text. |
| Pearson published no report ("insufficient entries") | No button. |
| Paper's report not split yet | No button; the small "Official examiner's report" PDF link shows as before. |
| Report fails to load (offline) | Says so, with a link to the full PDF. |
| Question set (test or mark-as-you-go) | Nothing while answering. After **Mark scheme** is revealed, and on the marking and review screens, a closed "Examiner's report" fold under the scheme. |

Every panel ends with "From the official Pearson Edexcel examiner's report, June 2019, quoted
as printed. Open page 7", linking to the PDF at that page.

## Files

| Path | What |
| --- | --- |
| `tools/reports/extract.py` | Splits report PDFs into sections at the report's own headings. `--self-test` runs it on a generated Pearson-style report. |
| `data/reports/<slug>/<PAPER_ID>.json` | One paper's report text (`examiner-report-text-v1`). |
| `data/reports/index.json` | Which papers have a split report. Loaded once, only when a panel opens. |
| `js/engine/examiner-report.js` | Matches sections to a question or part at run time (no pack changes). |
| `js/data/examiner-reports.js` | The panel, the session fold, loading and caching. |
| `tests/examiner-report.test.mjs` | Matching rules, every Maths/Physics/Biology unit's parts, report file shape. |
| `tools/browser-examiner-report.cjs` | Browser check of every situation in the table, at 1280 and 390 px. Serves its own fixture report. |

### Text first, crops only for equations

The image catalogues are about 0.92 GB against the 1.15 GB test limit (`docs/SITE-SIZE.md`),
so whole-report crops (~130 MB) are out. Text is 20–40 KB a paper, reflows on a phone and
is searchable. Equations do not survive as text (pdftotext turns a stacked fraction into
"2 2 x x 4 4"), so:

- **Maths** (`WHOLE_SECTION_CROPS` in `extract.py`): every question comment that contains
  an equation is one crop per page of the printed comment (150 dpi greyscale WebP, about
  0.7 MB a paper). Cutting at paragraph boundaries around displayed equations proved
  unreliable on real reports; whole-comment crops never cut a line.
- **Physics and Biology**: only paragraphs that contain an equation are cropped.

An equation is found from the PDF itself: symbol fonts (Symbol, MT Extra, Cambria Math),
private-use glyphs (stretchy brackets), small raised or lowered figures, and stray
characters off the text baseline. Crops count towards `tests/site-size.test.mjs`.

Example scripts (candidates' handwritten answers) are not reproduced: the panel links to
the page they are printed on.

### Report file

```json
{
  "format": "examiner-report-text-v1",
  "paper_id": "EDX_9PH0_2019_JUNE_01",
  "source_url": "https://qualifications.pearson.com/…/9PH0_01_pef_20190815.pdf",
  "source_sha256": "…", "source_pages": 18, "extracted_on": "2026-11-20",
  "review_status": "unreviewed",
  "general": {"pages": [3], "paras": [{"k": "p", "t": "…"}]},
  "summary": {"pages": [18], "paras": [{"k": "li", "t": "…"}]},
  "sections": [
    {"id": "s4", "heading": "Question 3 (b)(i)", "targets": [{"q": "3", "part": "(b)(i)"}],
     "pages": [6, 7], "paras": [{"k": "p", "t": "…"}], "figures": [{"page": 7, "count": 2}]}
  ]
}
```

`k` is `p` (paragraph), `li` (bullet), `h` (a bold line inside a section, such as
"Example 1"), `ex` (an "Examiner Comments" box about an example script) or `tip` (an
"Examiner Tip" box). Those boxes print in two columns side by side; the extractor reads
them as columns, not across. In newer reports the "Examiner Comments" label is an image, so
a comment is recognised by its indent instead: text more than 40 pt right of the margin
where that page side's "Question …" headings sit (odd and even pages differ). Tips there
cannot be told from comments and fold with them. A paragraph or section with `img` is shown as those crops
(`{"src": "maths/img/<PAPER>_s4_p5.webp", "w": 741, "h": 433}`, sizes in PDF points ×1.5). A heading such as "Questions 4 and 5" or "Question 2(a) and (b)" has several
targets; it is shown with each.

## Running the extraction (needed before any report text appears)

The button appears only for papers listed in `data/reports/index.json` (empty until the
first run), so nothing changes for students until reports are split. The split needs the PDFs from
`qualifications.pearson.com`, which this repository's ordinary sessions cannot reach. Run
it in the owner's **Purepastpapers** cloud environment (the one that allows Pearson and
AQA hosts), or save the PDFs locally:

```sh
python3 tools/reports/extract.py --self-test
python3 tools/reports/extract.py --subject maths   --fetch --show
python3 tools/reports/extract.py --subject physics --fetch --show
python3 tools/reports/extract.py --subject biology --fetch --show
# or, with the PDFs saved under their URL file names (e.g. 9PH0_01_pef_20190815.pdf):
python3 tools/reports/extract.py --subject physics --pdf-dir ~/Downloads/pefs
npm test && node tools/browser-examiner-report.cjs
```

Expected volume: Maths 54 of 60 booklets, Physics 47 of 52, Biology 46 of 52. Official
samples have no report; nor do 8MA0 October 2020 Paper 21 and 8BN0 June 2022 Paper 2.
Papers without a report show no button.

`node tools/reports/coverage.mjs <slug> [--all]` lists, per paper, how many units get
their own, a parent-part, a whole-question or no comment, and flags papers where most get
none (usually unrecognised headings).

Getting the PDFs: Pearson is blocked in this repository's cloud sessions, and the Claude
desktop app's browser asks where to save **every** download (147 Save dialogs). Use
`--fetch` where Pearson is reachable, or `curl` in the owner's own Terminal into a folder
(no dialogs), then `--pdf-dir`.

Real-report quirks handled (seen 21 November 2026): "Question 1 (Mean Mark 2.6 out of 3)"
and "Question 1." headings (Maths); "Question 18 (b) (i) - (ii)" ranges (Physics); a
"Question N" heading at the very top of a page is not a running header; the 8PH0 Paper 2
2021 PDF only says no report was published.

**Check before publishing:**

1. `--show` prints each paper's headings. Look for papers with no sections (headings not
   bold, or a new style such as "Q01 (a)") and for questions split mid-comment.
2. For each subject, open three papers' panels across the years and compare with the PDF:
   first and last question, a multi-part question, a "Questions 4 and 5" heading, a page
   break inside a comment.
3. Check that running headers, page numbers and the cover's "Edexcel and BTEC
   Qualifications" text do not appear in any section, and that nothing after "Grade
   boundaries" is kept.
4. Set `review_status` to `model_reviewed` only after that read; never call it teacher
   reviewed.
5. Rights: the Biology rights record names examiner reports; confirm the Maths and
   Physics permission covers them too before pushing the data.

Data size: run `node --test tests/site-size.test.mjs` (report text is not in the image
catalogues, but keep an eye on the Pages artifact in the deploy log).

## Plan: A-level History (Edexcel 9HI0, Route H)

27 booklets (1H, 2H, 33; 2017–2025), 117 whole-question essays, one Pearson report per
booklet (27 linked). Matching is simpler than science (no parts), the reports are harder.

1. **Read three real reports first** (1H, 2H, 33) in the Purepastpapers environment.
   History PEFs are organised by **section** ("Section A", "Section B") and question
   *type* more than by question number; many comments name no number at all, and much of
   the length is example scripts with marginal commentary (images).
2. **Heading rules** (`extract.py`): add a `history` subject with section headings
   ("Section A", "Section B: Question 3") as targets `{section: "A"}` and keep "Question 3"
   targets. Map sections to questions from each question's choice group / `section`
   field already in the packs (33: Section A Q1, Section B Q2/3, Section C Q4/5).
3. **2H covers two options.** The 9HI0/2H report discusses 2H.1 and 2H.2; the site has
   only 2H.2 (printed questions 2, 5, 6). Keep only targets for 2H.2's printed numbers
   and the 2H.2 headings; drop 2H.1 comments.
4. **Matcher**: extend `sectionsFor` with a `section` relation ("On Section B as a whole")
   shown when no question-level comment exists. This is likely the common case.
5. **Example scripts**: the comments around them ("This response was placed in Level 4
   because…") are the most useful part. Keep the text; link the figure page. Consider
   cropping the level-judgement boxes only if size allows (measure first; History's
   catalogues are small, about 16 MB).
6. Tests: a History fixture with section-only headings; the 2H.1 exclusion; the browser
   check extended with one History question. Then the same review steps as above.

## Plan: A-level Geography (AQA 7037/7036)

26 booklets, 605 printed parts ("1.1"–"5.5"); reports linked for 18 (none for 7036
November 2020 and some 2021 series; record those as unavailable, do not substitute).

1. **Rights first**: the recorded AQA permission (16 November 2026) covers papers and mark
   schemes. Confirm it covers AQA "Reports on the Examination" before publishing any text.
2. **Hosts**: reports come from `cdn.sanity.io` (AQA's new file store) with opaque file
   names, so `--pdf-dir` lookups must use the paper ID (save as `<PAPER_ID>.pdf`) and
   `--fetch` must follow the URL as stored.
3. **Heading rules**: AQA writes "Question 01.1", "01.1", "Questions 02.1–02.3", and
   option sections ("Section B: Coastal systems and landscapes", where questions 2, 3, 4
   are alternatives). Add an AQA grammar for `NN.N` parts and ranges; store parts as
   "1.1" and teach `normPart`/`unitParts` that form (the packs' `part_label` is already
   "1.1").
4. **Shared reports**: AQA sometimes writes one report per component across options, so
   one file serves several questions with the same number in different sections only if
   numbering differs; check that question numbers are unique per booklet before relying
   on them (they are in the current packs: options take different numbers).
5. **Long answers** (9- and 20-mark): AQA comments are question-level and fit the
   existing panel. Fieldwork (Section B of Paper 2) often has a combined comment; that is
   the "whole question" case already handled.
6. Tests and checks as for History, plus a fixture with "01.1"-style headings and a
   range heading.

Order: Geography first (closer to the science format, question-numbered comments), then
History (needs the section relation and option filtering).
