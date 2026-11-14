# Curriculum and question tagging: start here

## Product and evidence

PurePastPapers helps a student choose a subject, find individual questions by
specification point, answer and self-mark, then review progress. Keep the
notebook-inspired paper background, typography, colours and cards. Browsing and
filtering are free for guests. An optional free account retains marks and progress
in the current browser; it does not sync across devices. Do not imply a complete
bank of real question extracts: the shipped question records are labelled demo
content. The official paper catalogue and question extracts are different things.

This document is the authoritative home for curriculum identity, navigation and
the question-tagging relationship. The [Phase 1 plan](phase-one-question-bank-and-onboarding.md)
records product work, while the [import plan](question-import-and-filtering-plan.md)
contains the provenance, permissions, review and publication contract. This model
does not itself import or license exam content.

## Current data and verification status

- `data/subjects.json` contains the repository's board, qualification, subject
  and specification identifiers. `data/specs/<subject_id>.json` contains each
  subject's sections, topics, points and printed codes. These trees and fallback
  ordering are working data, not verified verbatim official specifications.
- `data/curriculum/index.json` is a separate mapping index. It currently has an
  empty `mappings` array. No textbook chapter or teaching-year mapping has been
  verified or shipped. The selector says so rather than presenting a guess.
- The previous cloud pass reported HTTP CONNECT 403 for source sites. On 14 November
  2026 the local browser could list the shared textbook folder and its Edexcel Maths
  subfolder, and the official Pearson specification was readable. See the source
  review below. Other boards were not reverified in this follow-up. Never commit
  access-bearing shared-folder links, keys or textbook PDFs.
- `data/questions/` contains sample questions, `data/papers/` contains catalogue
  records, and `data/packs/index.json` lists optional content packs. These are not
  proof of permission to reproduce source extracts. The import plan defines the
  required source and rights review.

## Identity, hierarchy and order

Use stable IDs scoped to the actual subject, board, qualification and
specification version. `subject_id` connects subject, spec, paper and question;
individual spec nodes have their own IDs. Printed `code` values are strings and
are display references, never decimal numbers or globally unique IDs. The codes
`2.9`, `2.10`, and `2.11` must remain distinct. A syllabus version, textbook
edition, suggested teaching year and exam year are separate concepts.

`js/engine/spec-index.js` builds the shared index from the tree and expands
selected topic/node IDs to canonical leaves. An optional `point_order` must be
an exact permutation of its leaf IDs and controls range and specification sort
order. Otherwise the authored tree order is the fallback, which may group by
paper rather than official syllabus order. Verify the exact official document,
issue, applicable years and ordering before asserting that a sequence is
verified. Never derive order by decimal comparison.

Existing IDs, learned records and attempts have historical meaning. If a new
specification version needs different IDs or coverage, create an explicitly
versioned mapping and migration plan; never silently repurpose an old ID or
reinterpret saved attempts. Existing whole-question attempts must not be
relabelled as an individual child part.

## Official points, teaching years and textbook chapters

Official specifications define the canonical points. A year or textbook chapter
is a separately sourced navigation view over those same points, not a replacement
code system. `js/engine/curriculum-map.js` validates a subject's mapping entries;
`js/data/content-repository.js` loads the index with `getCurriculum`, and
`js/ui/curriculum-selector.js` presents verified year/book/chapter choices. A
mapping can contain multiple points; a point can occur in multiple chapters or
years. Each coverage item uses a `point_id` and `extent` of `full` or `partial`;
partial coverage needs a note. Partial can be used for discovery but must not
silently mark the whole point covered. Switching a view is read-only and does
not change the student's learned records. Selecting Year 13 never automatically
marks Year 12 learned.

Illustrative **synthetic** shape, not a verified textbook or official mapping:

```json
{
  "subject_id": "SYNTH_SUBJECT",
  "mappings": [{
    "id": "synthetic-book-edition-1",
    "type": "textbook",
    "status": "verified",
    "source_url": "https://example.org/synthetic-source",
    "reviewed_at": "2026-11-14",
    "specification_version": "synthetic-v1",
    "publisher": "Example publisher",
    "book": "Illustrative book",
    "edition": "1",
    "chapters": [{
      "id": "synthetic-chapter-1",
      "position": 1,
      "title": "Illustrative chapter",
      "coverage": [
        {"point_id": "SYNTH_POINT_2_2", "extent": "full"},
        {"point_id": "SYNTH_POINT_2_3", "extent": "partial", "note": "Only the named subskill"}
      ]
    }]
  }]
}
```

In the actual index each mapping is associated with `subject_id`; the repository
loader passes only that subject's records to `createCurriculumMap`. Year records
use `type: "year"` and `years` entries with `id`, `title`, `year` (12 or 13)
and `coverage`. Textbook records require publisher, title, edition and chapter
IDs. Verified entries require an HTTPS source URL, review date and specification
version; provisional records stay hidden. The shape above illustrates the loader's
subject-scoped input rather than a verified catalogue entry. Tests use synthetic
records and do not validate real textbook contents.

For a new subject or edition, obtain the exact official board specification and
its issue/applicable assessment years; separately inspect the publisher's book,
edition and contents. Record page-level evidence, review date, scoped relations
and partial coverage in a reviewable manifest. Map only to leaves belonging to
that subject/version. Validate the whole index with `npm run validate`, and add
focused mapping and filtering tests. Do not promote provisional evidence to
verified because a title looks plausible. Keep copyrighted source files and
access credentials outside the repository.

## How question filtering joins to the same IDs

Each question or assessable part stores `subject_id`, `paper_id`, a stable
`question_id`, `primary_spec_points` and genuine `crossover_spec_points`. Both
arrays reference the canonical tree IDs, not textbook chapter IDs. The shared
`specIndex` expands a topic tag to all its leaves; prefer precise reviewed leaf
tags. Chapter and year coverage resolve to those same leaf IDs, so a future
API/database can join the same relationships without a second tagging system.
`filterQuestions` in `js/engine/filter-engine.js` is the shared filtering engine.

A strict search requires the part to assess at least one selected point and all
its expanded primary and genuine crossover requirements to fit within the
selection. Thus a 2.2-only part fits a 2.1–2.6 selection, but a part also needing
2.7 does not. Crossover mode permits additional requirements and the browser
should identify them. The covered-content gate is separate and, when enabled,
requires all genuinely required points to be in learned coverage. Search
selections never rewrite learned records. Year/chapter navigation is an
additional content filter; it does not establish learned coverage. Active
filter groups combine with AND; alternatives within a group combine with OR.
Sorting is separate, and a seeded shuffle applies to the full matching set before
pagination. Keep a selected seed stable until the user deliberately reshuffles.

An independently assessable part has its own `question_id`, marks, spec tags
and scheme; `parent_question_id` and `part_label` preserve original context.
`context.shared_stem_html` supplies required information, while optional full
context is a disclosure, not an additional assessment. Do not inherit sibling
part tags. A real dependency requires a reviewed supplied result/information or
an answerable grouped unit; do not invent information. Expansion must not alter
counts, marks or attempts. The import plan contains the full dependency, source,
revision and duplicate-review contract.

## Runtime paths and follow-up work

- `js/main.js` defines routes; `js/ui/views/subjects.js`, `subject.js` and
  `js/ui/subject-dialog.js` handle subject setup and coverage. `practice.js`
  hosts question discovery and `session.js` hosts session flows.
- `js/data/api.js` and `js/data/adapters/local-adapter.js` isolate learner
  progress from content records. Guest progress is temporary in memory and a
  new local account can take it over; login restores an existing account. Avoid
  rewriting old records, IDs or historical marks in content updates.
- `js/engine/analytics.js` derives latest-attempt status; `js/data/schema.js`
  validates content. The separate import plan documents source links, examiner
  reports and missing-content states. Only verified and appropriately scoped
  source/report references may be called official.
- Run `npm test` and `npm run validate`. `tests/curriculum-map.test.mjs`,
  `tests/spec-filtering.test.mjs` and `tests/question-parts.test.mjs` exercise
  synthetic mapping, string ordering, filtering, parts and dependencies. These
  tests establish software behavior, not external data accuracy or rights.

Next: inventory permitted textbooks, inspect actual contents and official
specifications, review the Edexcel A-Level Mathematics editions and chapter
coverage first, publish only sourced mappings with stable versioned identities,
then extend subject by subject. Track inaccessible sources as gaps. A future
server-backed database and cross-device accounts remain separate work.

## Source review update — 14 November 2026

Directly inspected: Pearson Edexcel Level 3 Advanced GCE Mathematics **9MA0**,
[Specification Issue 4, February 2020](https://qualifications.pearson.com/content/dam/pdf/A%20Level/Mathematics/2017/specification-and-sample-assesment/a-level-l3-mathematics-specification-issue4.pdf).
The cover states first teaching September 2017 and first certification 2018;
printed pages 5–6 identify Pure Mathematics papers 1/2 and Statistics/Mechanics
paper 3. This verifies document identity, not every stored point or applicability
to all future exam years. No existing canonical IDs or version scopes were changed.

The shared library root exposed 17 folders. Priority inventory from the
“Pearson Edexcel Mathematics” folder (filenames as displayed):

| File | Indicated coverage | Bibliographic/contents status |
| --- | --- | --- |
| Pure Year 1.pdf | Pure Mathematics Year 1/AS (cover thumbnail) | Exact edition/ISBN and contents unverified |
| Pure Year 2.pdf | Pure Mathematics Year 2 (filename/thumbnail) | Exact edition/ISBN and contents unverified |
| Stats_Mechanics Year 1.pdf | Statistics and Mechanics Year 1/AS (thumbnail) | Exact edition/ISBN and contents unverified |
| Stats_Mechanics Year 2.pdf | Statistics and Mechanics Year 2 (thumbnail) | Exact edition/ISBN and contents unverified |
| Oxford Year1 and Year 2 New Spec Edexcel Mathematics.pdf | Both years, Oxford (filename) | Publisher/title/edition need title-page confirmation |
| CGP A-level Edexcel Maths.pdf | Revision/practice, Edexcel (thumbnail) | Edition and year coverage unverified |
| A-Level-Maths-Workbook-CGP.pdf | Workbook, Edexcel (thumbnail) | Edition and year coverage unverified |
| CGP A-Level Mathematics Edexcel Practice Exam Papers ( PDFDrive.com ).pdf | Practice papers (filename) | Edition/year coverage unverified; not a chapter authority |

A separate “Pre-2017 Textbooks” folder was listed and was not used for the current
specification. An automated attempt to open/download Pure Year 1 did not deliver a
PDF download within 25 seconds. Only listings and cover thumbnails were inspected;
no contents pages, chapter coverage or exact publisher/edition claims were verified.
This is an incomplete source review, not evidence that the whole library is blocked.
The next mapping pass must obtain readable contents and copyright/title pages,
reconcile the full official point order, and then populate the existing mapping
index. Chapter equivalence is currently tested only with labelled synthetic data.

For the control-state and browser verification record, see the
[browser audit](browser-audit-2026-11-14.md).
