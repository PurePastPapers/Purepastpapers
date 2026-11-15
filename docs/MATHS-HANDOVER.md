# Maths corpus: release and continuation notes

Updated 15 November 2026. This release activates all **60 verified public
current-specification Edexcel Maths sources** found in the audited inventories:
55 exam booklets from 2018–2025 and five official sample assessment components.
The seven recorded 2026 booklets are restricted; they are not in the public bank.

## Exact coverage

| Source group | Booklets | Original source questions | Scored units | Marks |
| --- | ---: | ---: | ---: | ---: |
| A-Level 9MA0 exams | 32 | 345 | 658 | 2,500 |
| AS 8MA0 exams | 23 | 190 | 333 | 1,280 |
| A-Level official samples | 3 | 41 | 75 | 300 |
| AS official samples | 2 | 26 | 44 | 160 |
| Total | 60 | 602 | 1,110 | 4,240 |

All 1,544 original printed tariff occurrences are assigned exactly once. Counts
are source-scoped: the legitimate distinct 2025 modified Paper 2 remains a
separate source. These are not claims of semantic deduplication of every phrase.
Split Statistics/Mechanics booklets are components, not extra complete sittings.
First certification is 2018. Series in 2020/2021 are October/November respectively.

All 60 source QPs and matching schemes are present; the five sample components
retain original official ZIP entry, PDF page offsets and source checksums.
Examiner-report links cover 54/55 exam booklets. The 2020 AS Statistics 21 report
was not found. Samples have no invented exam year or examiner report.

Review status is **model_reviewed**, not teacher/human reviewed. All 90 stable
runtime skill IDs occur in primary or prerequisite tags; 89 occur as primary
assessed tags. Difficulty is reasoned per scored unit: 409 Easy, 593 Medium,
108 Hard. The Extra hard option remains available; none of these official units
was assigned that beyond-specification category.

## Learner and filter logic

- The full-width notebook filter panel precedes results. Difficulty uses four
  selectable chips; My progress uses independent checkboxes. Shuffle is one
  separate action, removed from the Sort menu.
- Year 12 selects reviewed AS-scope units from either qualification. Year 13
  includes all content by default, including all 377 AS exam/sample units.
  The explicit “Year 13 topics only” checkbox selects introduced_year 13;
  it excludes AS and the AS-scope units from A-level papers. Broad specification
  leaves span both years, so their overlap alone cannot determine unit scope.
- Qualification chips distinguish 8MA0 from 9MA0 and intersect with year, topic,
  difficulty, marks and progress. Selecting multiple values within a group is OR.
  No year/chapter selection marks anything learned.
- New Maths practice uses real source units. Generated catalogue placeholders
  and demo papers are hidden from new Maths listings; historical lookup IDs,
  marks, drafts and sets remain available. All 639 previously published source
  unit identities were compared with the new release and remain unchanged.
- `data/imports/maths/identities.json` locks source SHA, parent, original tariff
  indices and marks to each unit ID. Build/finalize rejects identity drift.
  If an assessment grouping changes, allocate a new ID and plan a migration;
  never reinterpret an old saved mark as a different assessment.

## Source images and dependencies

Original mathematical typography, graphs and tables are source pixels, stored as
lossless WebP crops. Editorial summaries support browsing/search; they do not
replace original question wording. Shared printed context is visible and
unscored. Dependent earlier answers are grouped with the assessed unit rather
than invented as new givens. The full original question is also expandable.
Official full-question schemes retain alternatives/notes and are labelled when
they include other parts; the saved mark applies only to the selected unit.

The renderer explicitly renders the MediaBox used by pdfplumber coordinates.
Default PDFium CropBox rendering could shift/clamp content in publisher PDFs;
that issue was corrected and the final catalogue rebuilt. The sample Paper 1
Q12(d) bottom tariff and sample Paper 2 Q6 table tariffs have checksum-bound,
reproducible coordinate corrections in `source_overrides.py`.

The 2,559 referenced image assets are packaged into lazy per-booklet catalogues
in `data/maths-assets/` (about 123 MB total). A booklet loads when its first
source image is needed, not when listing questions. The browser creates Blob
URLs without recompression. Crop caches in `assets/maths/` are gitignored.
Never print base64 catalogues into an agent context; inspect metadata/checksums
or render local crops. Source PDFs and shared textbook keys are not committed.

## Specification, curriculum and remaining external gaps

`data/specs/EDX_ALEVEL_MATH_9MA0.json` contains 89 exact official reference groups
from Pearson Issue 4 (February 2020), plus 90 stable runtime skill leaves.
See [math-spec-review.md](math-spec-review.md) for the historical proof1.2 ID
(displayed as official1.1) and legacy Statistics4.3 compatibility. New normal
approximation tags use4.2. Do not repurpose existing IDs.

`data/curriculum/index.json` loads the verified Maths year relations and 14 Pure
Year1/AS textbook chapters. The year map has52 Year12 and64 Year13 relations,
including26 partial overlaps, covering all90 runtime leaves. Textbook chapter
maps for PureYear2 and both Statistics/Mechanics books remain unverified and
are not guessed. This does not remove their topics or questions from the bank.
Other subjects still use their existing catalogue/demo content.

Pearson's seven recent2026 source booklets are restricted. Separate specimen
links lead to authenticated MathsEmporium access. Neither access gate was
bypassed. Re-audit those sources when they become publicly available; do not
claim every restricted or historical legacy-syllabus paper is imported.

The owner explicitly confirmed on14 November2026 that Pearson permission covers
public question-bank republication. `rights.json` records owner confirmation,
not an independent licence audit. No Plumi records, tags or assets were imported;
no suitable open-data licence was verified for its mixed current/legacy bank.

## Reproduce and continue

Application: static HTML/CSS/ES modules, no frontend build or processing API key.
Development extraction requires Python with pdfplumber, pypdfium2 and Pillow;
OCR positioning for image-only2019 applied papers uses native macOS Vision.
The private research workspace is `../math-research/` relative to this repo.
It retains immutable source PDFs, extraction/OCR caches, review evidence,
official sample ZIP/page provenance, geometry reports and publish ledgers.
Public copies remove private absolute paths and textbook access keys.

```sh
python3 tools/maths/acquire.py data/imports/maths/inventory/9ma0-inventory.json --cache ../math-research/sources
python3 tools/maths/acquire.py data/imports/maths/inventory/8ma0-inventory.json --cache ../math-research/as-sources
python3 tools/maths/extract.py ../math-research/sources --output ../math-research/extracted --ocr-dir ../math-research/ocr
python3 tools/maths/build.py INVENTORY --sources SOURCE_CACHE --candidates CANDIDATES --reviews ../math-research/reviews
python3 tools/maths/finalize.py --research ../math-research
python3 tools/maths/package_assets.py
python3 tools/maths/geometry_qa.py --output ../math-research/geometry-qa-RELEASE
npm test
npm run validate
node tools/browser-maths-bank.cjs
node tools/browser-regression.cjs
```

Build all four manifests (9ma0/8ma0 exams and samples) with their corresponding
cache/candidate directories. Full commands/source provenance are in tools/maths.
`build.py` validates source and review checksums, tags, introduced year, exact
part coverage and paper totals. Resume signatures include candidate/review bytes;
bump the compiler signature whenever crop behavior changes. `finalize.py`
checks and activates every public source, copies sanitized inventories/reviews,
and updates immutable identities and coverage. It refuses partial completion.
`package_assets.py` then captures exactly the referenced crop bytes.

## Verification and publication

- 60 automated tests pass, including source coverage, immutable identities,
  original tariff occurrences and every packaged image checksum.
- Data validation:38 subjects,986 paper records,1,359 questions (including other
  subjects/demos), zero errors or warnings. Runtime Maths listing has60 authentic
  booklets; catalogue lookup records are retained for historical sessions.
- Real-bank browser check:1,110 results,377 AS results in Year12 and cumulative13,
  none with AS plus13-only; actual question/scheme Blob images load; explicit
  zero survives reload;320/390/768/1440 layouts have no horizontal overflow;
  samples have the correct label/source bundle and legacy lookups resolve.
- Filter regression uses an explicit small demo fixture; it covers difficulty
  and progress unions, shuffle, sorting, set selections, drafts, zero/edit/undo,
  reset/reload and22 theme/subject contrast cases (minimum7.68:1).
- Full geometry QA passes:60 booklets,3,088 tariff edges,1,444 part starts,
  1,074 scheme regions and2,038 unique raster assets checked; zero failures.
  Every packaged asset checksum is separately tested. Representative source
  graphs and sample crops were visually checked.
  Reports and visual evidence stay in the private research workspace.

The earlier partial36-booklet/639-unit release was f36ebfff733a2625020fdc9130ac437121a53956.
Release a457592481486e567e83c136ad3d52bd7035143e supersedes it with the
full60-source release and corrected image catalogues. GitHub Pages deploys main automatically; confirm its latest run and
live index/catalogue after each publication. Site domain is purepastpapers.com.

Shell fetch works here but shell push has no credentials. Publishing uses the
connected GitHub create_blob/create_tree/create_commit tools, then update_ref
with expected_sha (never force). Compare the remote tree with the committed
local tree before advancing main. Store upload SHA ledgers privately so a new
agent can resume. Fetch and align local history only after exact tree comparison.

### Deployed release verification

Release `a457592481486e567e83c136ad3d52bd7035143e` was published to main.
GitHub Pages run43755785393 completed successfully. The live HTTP index contains
60 packs; live coverage.json, corrected sample01 image catalogue and a newly
added AS2021 source pack match local release SHA256 bytes. Local and remote Git
trees were matched before publication; local history is aligned with main.

The real-bank and filter browser checks passed locally. A direct isolated Chrome
check of the production HTTP origin was blocked by the client. HTTPS still
fails certificate hostname verification for purepastpapers.com. This is a
separate existing domain/hosting issue; no DNS or TLS configuration was changed
by the Maths import. Do not claim production HTTPS/browser verification passed.

## Topic picker and expanded questions (15 November 2026)

The question browser now has one topic tree. The duplicate specification-range
and selection-mode controls are removed from this view. “Use topics I’ve learned”
sits at the top of Topics: checked uses all learned requirements independently
of the saved manual topic focus; unchecked restores those manual choices.
Topic selection matches assessed points, with crossover requirements still shown
on each card. Learned mode requires all assessed/prerequisite skills to be learned.
The year/chapter, qualification, difficulty, marks and progress filters still apply.

Old saved browser ranges migrate to the visible topic selection (intersecting
an existing focus); no invisible range constraint remains. Timed-test advanced
controls retain their existing behavior. Switching views never edits learned
coverage or saved marks.

All questions on each results page start expanded. The mark-scheme action is
above the source question; schemes remain hidden until requested. Only explicit
manual collapses are saved in closedQuestions. Legacy openQuestions arrays do
not collapse cards after upgrade. Drafts, selected sets and open schemes persist.

Verification:60 unit tests and data validation pass. browser-topic-choice.cjs
covers manual/learned switching, old-range migration, drafts/selections, pagination,
collapse persistence, and320/390/768/1440 widths. browser-maths-bank.cjs and
browser-regression.cjs also pass with the expanded default. Desktop/mobile filters
and an expanded source card were visually inspected; local screenshots are in
../../outputs/top-filters/topics-single-picker*.png and questions-default-expanded.png.

## Textbook organisation work in progress (15 November, evening)

The owner supplied four exact textbook contents spreads: PureYear1/AS, PureYear2,
Statistics/MechanicsYear1/AS and Statistics/MechanicsYear2. Source images and their
SHA256 provenance are checkpointed in assets/references/maths-textbook-contents
and data/imports/maths/textbook-contents-sources.json. The transcribed dataset is
now data/curriculum/maths-textbooks.json:4 books,45 chapters,251 subsections.
Codes are book-scoped:Pure1 6.2 = Equation of a circle; officialPure6.2 is a
separate reference. These images supersede the earlier incomplete textbook
navigation evidence. Edition pages were not supplied, so unverified ISBNs are
not invented. Official specification IDs and question identities must remain stable.

Next:wire separate Textbook/Official controls, precise per-question textbook
associations with conservative unresolved scopes, textbook learned selections,
expandable reference labels, prominent strict/crossover controls, globally hidden
demos with historical lookup retention, then browser checks and publication.
Finally commit and deliver the requested reusable subject-import agent prompt.

## Textbook UI release checkpoint (15 November, evening)

The earlier source-only checkpoint is now wired into runtime. Textbook chapters
are the default Maths organisation, with a separate Official specification radio
choice. All4 supplied books,45 chapters and251 subsections are selectable. Search
accepts scoped references such as6.2 Pure1; book labels prevent collisions with
Applied1 6.2 or officialPure6.2. Strict/Include crossover choices are prominent.
Question references expand to named textbook sections plus named official points;
the expanded-reference state survives filter redraws. Cards remain expanded.

Textbook ticks are saved separately in learned_textbook_sections. Official ticks
remain unchanged in learned_spec_points. Practice and covered-topic statistics
respect the selected namespace, and a book subsection does not promote a broad
official point to learned. Existing official coverage remains accessible via its
tab. Guests select topics without a learned-editor/save flow. Globally hidden
demos retain only historical lookup records; official sample assessments remain.

All1110 source units have conservative textbook links. Of1949 required official
skill relationships,1713 have a positive named-subsection association and236
retain explicit chapter scope.912 units have subsection-level links for all
requirements;198 contain at least one chapter-level relationship. A chapter
relationship does not falsely match a single subsection and requires its whole
related scope for learned filtering. These are editorial rationale associations,
not an independent teacher review or re-extraction of question mathematics.
No AS unit was linked to Year2-only material. Source question IDs/marks unchanged.

Current checks:66 unit tests pass; data validation has0errors/warnings. Browser
checks cover all4 books, scoped search, strict/crossover, full reference labels,
account reload, independent learned storage, guests, hidden demos/retained history,
source images, samples, inline marks, drafts, shuffle, and four viewport widths.
Desktop/mobile filter and expanded-reference screenshots were visually inspected.
Pending in the next checkpoint: the requested reusable subject-import prompt,
with current board identifiers, source workflow, verification and handover rules.

## Completed handoff and publication verification

The textbook UI was published as64228ff2131e8f076cf46f3b9f577a1cea104a0b;
Pages run43760665944 succeeded. Live HTTP copies of the practice view, textbook
engine, all251-section contents,1110-unit textbook links and hidden-demo
configuration match the release byte checksums. The existing HTTPS hostname
limitation remains separate; no production browser pass is claimed here.

The reusable full prompt is now docs/prompts/SUBJECT-QUESTION-BANK-AGENT.md,
linked from README. It identifies the registered A-level boards/codes, prioritises
Biology and Physics then Chemistry, separates Geography/History and later GCSE,
and explains how to adapt source extraction, curriculum identity, review, UI,
covered learning, validation, publication and handover. The owner also receives
the full prompt text in chat. It is an instruction for a future target-subject
run; it does not claim those other banks are already imported.

Final verification:67 unit tests pass, including zero-mark book/chapter mastery
without double counting. All6 relevant browser suites pass:topic choice,
textbooks, real Maths bank, filter regression, dated/spec fixtures and source-part
context. Synthetic demo fixtures explicitly enable demos only inside their
isolated test profiles; production remains globally hidden. Data validation:
38 subjects,986 raw paper records,1359 raw question records,0errors,0warnings.
Historical demo records are included in those raw validator counts but absent
from runtime discovery. All current source identities, marks and image bytes
remain intact. No further Maths UI work is queued by this request.
