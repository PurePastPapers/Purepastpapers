# Question bank creation: problems hit so far, and how not to repeat them

For any Claude building or fixing a PurePastPapers question bank. Written 19 November 2026
from the project memory, the repo (`docs/`, `tools/`, git history) and the project's past
threads. Every item below is something that actually went wrong or nearly did.

Read this first, then the import brief (`docs/prompts/SUBJECT-QUESTION-BANK-AGENT.md` in the
repo; a newer `subject-question-bank-prompt-v2.md` lives in the project files), then
`docs/PART-DISPLAY.md`, `docs/SITE-SIZE.md` and the handover closest to your subject
(`docs/<SUBJECT>-HANDOVER.md`).

---

## Quick checklist

Before extracting anything:

1. You are in the **"purepastpapers"** cloud environment, and every host you need answers a
   real request (section 1).
2. Board, spec code, route, papers, options, tiers, AS or not, and coursework are confirmed
   with William in **one** message at the start (section 2).
3. Publication rights are confirmed for this board (section 1).
4. You checked whether the spec has changed since the past papers were sat (section 3).

After building, and after **any** rebuild of a pack:

5. Run `tools/parts/refine.py` (part crops, context and part mark schemes).
6. Run `tools/parts/drop-false-dependencies.py` and `tools/parts/lead-ins.py` if links or
   lead-ins changed.
7. Run `tools/parts/trim-booklet-pages.py` (removes equation sheets and periodic tables).
8. Run `python3 tools/assets/compact.py` (keeps the site under 1 GB).
9. Run `npm test`, `npm run validate` and the subject's browser script, then look at real
   rendered crops yourself, especially last questions, first parts, and parts after a
   sentence of text.
10. After deploying, check the GitHub Pages run log for the **size warning**.

---

## 1. Access, environment and permissions

**Blocked source sites.** The OCR Chemistry run stalled on its first step because
`www.ocr.org.uk` was not on the allowlist, and the thread sat waiting for approval. Eduqas,
WJEC and OCR were all blocked when the GCSE work started. Later imports also needed
`pastpapers.download.wjec.co.uk` (Eduqas files) and `cdn.sanity.io` (newer AQA papers).
- Probe **every** host on day one: the board's main site, its file store or CDN, and the spec
  PDF host. Ask for all missing hosts in one request.
- Hosts already allowed: qualifications.pearson.com, www.aqa.org.uk, filestore.aqa.org.uk,
  cdn.sanity.io, www.eduqas.co.uk, www.wjec.co.uk, pastpapers.download.wjec.co.uk,
  www.ocr.org.uk.
- Pearson sometimes resets the first connection. Retry before you report it as blocked.

**Wrong environment.** Imports only work in the personal "purepastpapers" environment
(it is the project default). Check this before you start.

**No shortcuts around the board's site.** Pearson's catalogue runs on Algolia. Harvesting its
API key was refused. Instead, `tools/physics/discover.py` HEAD-probes Pearson's predictable
file names around exam and results dates. Use only public pages: never secure, teacher-only
or logged-in areas.

**Rights are per board.** William confirmed Pearson (14 Nov), AQA (16 Nov), Eduqas/WJEC
(17 Nov) and OCR (Computer Science first, then Chemistry A separately on 17 Nov). An
earlier confirmation for one OCR subject did **not** cover another. For any new board or
subject, ask with a decision card and keep the subject out of `data/packs/index.json`
until he says yes.

**Places you cannot reach.** purepastpapers.com and the Reach Free School website are
blocked from the cloud. Check deploys with the GitHub Pages run instead, and ask William to
look at the live site. The school prospectus (course options) is a Google Doc in William's
Drive: Drive id `1tvAb2yI0eHrE_RcirqbZXtzUQfod_dDuehISptFH1o8`.

**GitHub.** WilliamBurd is not a collaborator on PurePastPapers/Purepastpapers, so assigning
him to a PR or requesting his review fails. Carry on without it.

## 2. Scope: board, spec, route, options and tiers

These all went wrong, or would have gone wrong, by assuming instead of checking:

- **Wrong board in the registry.** GCSE History is **OCR History B (SHP) J411**, not
  Edexcel 1HI0 as `data/subjects.json` said. GCSE Spanish is **Edexcel**, not AQA (William
  corrected this). GCSE sciences are **Edexcel**, not AQA (a PRD correction). Never trust
  the registry's board without checking it against William's answers in memory.
- **Options that share a booklet.** History 9HI0 Route H takes Paper 2H.2 (USA 1955-92) and
  **not** 2H.1 (Boom and bust), even though both are in the same 9HI0/2H paper. Psychology
  Paper 3, Sociology Paper 2 and English Literature poetry all have options in one booklet.
  Import only the route's questions and list the rest as off-route in `coverage.json`.
- **William's numbers differ from the board's.** He said "witch craze option 30"; Pearson's
  code is 33. Use the board's codes and say so.
- **Never assume "all options".** Ask. If William does not know, the school prospectus
  usually does.
- **Separate versus Combined Science, and tiers.** Keep 1BI0, 1CH0 and 1PH0 separate from
  1SC0, and Foundation separate from Higher. Never merge them into one pool. Tiered subjects
  need `"tiers": ["Foundation","Higher"]` in the registry and a tier on each paper and
  question.
- **AS papers.** William wants AS papers included wherever they test the chosen content.
  Check the AS code and its papers on the board's site; do not invent one by changing a digit.
- **Coursework and NEA** are out of scope. So is the OCR Chemistry practical endorsement.
- **Current-spec papers only** (for example Spanish: new spec only).
- **Stop rules.** William stopped GCSE work after English Literature (17 Nov). Do not start
  English Language, GCSE History, Geography, Spanish, Business, Food tech or Drama unless he
  asks again. Always check the latest subject order in project memory before starting
  anything.

## 3. The spec or set texts changed after the papers were sat

- **Psychology:** AQA spec v1.4 (first A-level exam 2027) removed content such as Zimbardo,
  biological rhythms and Schaffer. William chose to leave those questions out (49) and list
  each one with its reason.
- **Eduqas GCSE English Literature:** the poetry anthology changes completely from 2027 (an
  18-poem anthology is replaced by 15 new poems, with no overlap). All 16 old-anthology
  questions were removed; William confirmed this.
- **A-level English Literature:** 2 questions were left out because the poem they name is no
  longer prescribed.

**Lesson:** before tagging, compare the current spec issue (and set-text lists) with what the
papers examined. Ask William once how to treat removed content, recommending "leave out and
list".

## 4. Content the board has removed or corrected

- **Copyright-removed questions:** AQA Politics had 4 Q4s whose sources were removed.
  Exclude them and list them. Do the same for any unseen poem removed from a public paper.
- **Withdrawn questions and errata:** OCR H432/01 June 2022 Q13 was withdrawn (paper total
  becomes 99), so it is recorded in `withdrawn_questions` and excluded. H032/01 June 2017 has
  an erratum, recorded as `board_erratum`. Look for post-exam notices for every board.
- **Papers not public:** June 2026 for every board, Nov 2025 for GCSE Maths, GCSE sciences
  June 2018 and 2019, AQA Politics June 2017 to 2019, and others. Record each gap in
  `coverage.json`. Never fetch them from anywhere else.

## 5. Blank questions and the 1 GB site limit

**What happened (17 Nov):** William found blank questions in A-level Maths (4-6 mark
questions) and GCSE Maths. The data was fine and rendered locally. The cause: after the GCSE
science deploy, the site was 1.33 to 1.40 GB, over GitHub Pages' 1 GB limit, and the deploy
log said "Deployment might fail". Images simply were not served.

**Fix:** `tools/assets/compact.py` stores black-and-white crops with 8 grey levels (16 where
shaded), leaves colour images and photos untouched, and removes empty "introduction" crops.
The site went from about 1.4 GB to about 0.83 GB uploaded. `tests/site-size.test.mjs` now
fails if the catalogues grow back.

**Lessons:**
- Run `compact.py` after every import, `refine.py` run or other catalogue rewrite.
- After every deploy, read the Pages log for the size warning. It warns; it does not fail.
- There is room for about one or two more big subjects. After that, images need their own
  hosting. Raise this with William before a big import rather than after.
- William wanted **before/after pictures** before approving the image change. Changing how
  question images look counts as a visible change: show it first.

## 6. Empty boxes and "image unavailable"

- **353 empty "introduction" boxes:** parts had a `context.stem_image_url` crop with no ink,
  so an empty box showed above the question (GCSE Maths 127, GCSE Physics 114, GCSE Biology
  47, GCSE Chemistry 46, others). Never emit an intro crop that contains no ink.
- **Lazy loading:** AS Biology June 2025 Paper 1 Q5(b)(ii) looked empty because its image was
  lazy-loaded from a 5 MB catalogue below a huge context image. Catalogue images are no
  longer lazy-loaded. Do not reintroduce it.
- **Stale browser cache:** twice William saw a problem that was only his browser holding old
  data after a deploy ("Image unavailable; open the official source paper"). The site now
  checks for new data on load and re-downloads a paper's images when one is missing. If he
  reports something just after a deploy, ask him to reload before you dig in.

## 7. Multi-part questions

**What happened (16 Nov):** selected parts showed the **whole question** (worst in Biology,
several screens tall), and mark schemes showed the whole question's scheme for every part.

**What is expected now** (`tools/parts/refine.py`, `docs/PART-DISPLAY.md`):
- **Own crop:** from the part's printed label to its end. It must not start at the top of
  the question or in the previous part's answer space.
- **Minimal context:** the question introduction, the lead-in under the part's letter, any
  unlabelled sentence printed just before the part (for example "In reality the stone will
  be subject to air resistance."), and only the earlier figures or parts its wording refers
  to.
- **Part-only mark scheme:** only the scheme rows for that part, checked against the part's
  marks. Fall back to the full-question scheme only when they cannot be matched, and keep
  the full scheme as a collapsed link.
- **Dependency gate:** a part that builds on an earlier answer ("Hence", "use your answer to
  (a)") gets `depends_on_question_ids`, so it stays hidden until the earlier part's topic is
  learnt.

**Problems found while fixing it** (watch for them in any new pipeline):
- The sentence printed between parts was dropped at first. The first fix to recover it then
  over-matched: answer lines, multiple-choice options, answer tables, figure labels and the
  margin hatching were taken as text.
- Part mark schemes had their last mark clipped at the page edge.
- Scanned papers (Physics June 2019, Biology 9BN0 June 2019 Paper 3, Maths June 2019
  Papers 31 and 32) need tesseract word boxes for positioning. Run tesseract single-threaded
  (`OMP_THREAD_LIMIT=1`), or it crawls.
- Page geometry: Physics is measured in the PDF **CropBox**, Biology and Maths in the
  **MediaBox**. Pearson History PDFs have a 28.35pt CropBox inset. Getting this wrong shifts
  every crop on 2020+ booklets.
- Mark-scheme references come in many shapes: "5(b)(ii)", "12b(ii)", "2bii", a "1" stacked
  over "(b)(ii)", "AO2 1" in the Mark column, and shared Foundation/Higher schemes printing
  "8c(i)(F) 2(ai)(H)" (keep only your tier's). `tools/gcsephys` has the most fixes; gcsebio
  and gcsechem still lack some of them.
- Irregular labels (for example 8BN0 June 2023 Paper 1 Q7 prints (i), (ii) before (b))
  cannot be re-cropped safely. Keep their old crops and give them part schemes only.

**New subject imports should produce part crops, minimal context and part schemes directly,**
not rely on refine.py afterwards. Politics and History use whole questions.

## 8. Linked parts were over-matched (17 false links)

**What happened (19 Nov):** William asked for parts that need earlier parts to be shown as
one question with an answer box per part. The existing "depends on an earlier part" flag
was noisy. 17 questions were linked by mistake, for example GCSE Physics Nov 2020 2H Q9,
whose parts are independent. Causes:
- "You may draw a diagram to help with your answer" and "State the unit with your answer"
  matched the "your answer" rule.
- Graphs or equations made **in the same part** were treated as earlier material.
- Some "earlier show that result" and "builds on" flags were too loose.

**Fix:** both regexes now skip those phrases. `tools/parts/drop-false-dependencies.py`
removed the 17 links, each checked by eye against its crop. That left about 100 linked
questions, mostly Maths. `js/engine/linked-parts.js` groups them, and
`tools/parts/lead-ins.py` keeps the text printed before a part so it is not lost in a group.

**Lesson:** a text-pattern dependency check needs a manual audit of what it matched before
anything is built on it. Sample the matches and look at the crops.

## 9. Equation sheets, formula booklets and periodic tables on last questions

**What happened (19 Nov):** the last part of a paper was cropped to the end of the PDF, so
its picture ran on into the insert cover, the physics equation list, the maths formula sheet
or the periodic table. This affected **82 last questions** across 1CH0, 1SC0, 1MA1, 1PH0,
8PH0 and 9PH0. It was spotted on GCSE Physics June 2024 1H Q10(d) and A-level Physics June
2025 Paper 3 Q12(b)(ii).

**Fix:** `tools/parts/trim-booklet-pages.py` cuts those pages. A page counts as a booklet page
when it is nearly identical to a page ending another paper's last part in a different exam
series. Hand fixes go in `KEEP`. The last question now stops at "TOTAL FOR PAPER".

**Lessons:**
- The last question must end at "TOTAL FOR PAPER" (or the board's equivalent), never at the
  end of the PDF.
- Re-run `trim-booklet-pages.py` after any rebuild of those packs.
- If a question genuinely needs an equation, show only that equation, not the whole sheet.
  (Neither of the two reported parts needed one.)

## 10. Extraction gotchas by board

- **OCR Chemistry:** "Additional answer space if required" appears inside question pages and
  is not a stop marker. Sample papers repeat the number before each part ("18 (b)"), print a
  diagonal SPECIMEN watermark, and split tariffs by kerning ("[ 5 ]").
- **Eduqas English Literature:** boxed two-digit codes ("2 1"); the essay label row sits 4pt
  below its "* text" row; the 2024 unseen mark scheme prints both grids before both
  indicative blocks.
- **Pearson 2024 booklets** leak mirrored "DO NOT WRITE IN THIS AREA" text into extracted
  text; strip it before matching.
- **The Physics spec PDF scrambles equations;** `tools/gcsephys/textfix.py` holds the printed
  wording.
- **Separate-science-only statements** end in C or P (for example 5.8C). Chemistry Topics 5
  and 9 and Physics Topics 7 and 11 are separate-only. Higher-only bold detection must ignore
  the bold maths-skill column.
- **Late publication:** some question papers appear weeks after the exam (Nov 2021 Paper 2 on
  2 Dec 2021; June 2024 Paper 1F on 2 July 2024). Widen discovery date windows.
- **Psychology:** dependent questions must join their source question's parent ("Using your
  answer to question 21").

## 11. Build, test and publishing gotchas

- `tools/gcsemaths/build.py` skips packs whose `build_signature` has not changed; bump the
  version string. Rebuilt packs then need `refine.py --rescheme`.
- Re-count `coverage.json` `image_assets` after re-cropping (Physics especially). Re-run
  Politics `finalize.py --activate` after any rebuild.
- Bank checks for 1SC0 must count packs from several imports.
- One test fails on main and has for a while ("a part is held back until the earlier part it
  builds on is learnt too"). Compare your run against main rather than chasing it, unless you
  are asked to fix it.
- Browser check scripts break when the UI changes (for example, the paper filter moved into
  the filter bar's "More" popover). Fix the script for your subject before trusting it.
- Several threads push to main at the same time. Fetch and merge main before pushing.
- The private research workspace (`../<subject>-research`, `../parts-research/sources`) is
  lost when the container ends. Sources are keyed by SHA256, so the handover must say how to
  rebuild them.

## 12. Working with William

- He often starts a run and leaves. Ask **everything** that could block you in the first few
  minutes, in one message, with decision cards for real choices. Keep working on anything
  that does not depend on the answer. Save each answer to project memory straight away.
- If something needs him or papers cannot be found, skip it, move on, and list it for him.
- **Any visible UI change needs mockup images and his approval first.** Fixes to question
  content (crops, schemes, removed questions) do not, but a change to how all images look
  did need before/after pictures.
- Tags are model-reviewed (`reviewer_type: model`). Never call them teacher-reviewed, and
  never label demo or AI content as official.
- He checks the live site himself and reports by subject, paper and question number. Ask for
  one example straight away if a report is vague; it saved a lot of time on the blank-part
  bug.
