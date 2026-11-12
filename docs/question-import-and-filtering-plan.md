# Question imports and specification filtering

Proposal prepared 12 November 2026. This is an ingestion plan, not a claim that
real exam questions have been imported. Filtering and individual-part runtime
support are implemented in the accompanying change; the bulk pipeline is future work.

## Evidence and limits

- Repository inspection found 38 subjects, 926 paper records and 249 questions;
  all 249 questions have `is_sample: true`. Catalogue records are not extracts.
- `data/packs/index.json` is empty. The existing content-pack seam merges papers
  and questions by stable ID; it is the proposed publication boundary.
- Existing records already have source, board, subject, paper, marks, difficulty,
  primary/crossover tags and HTML/image content. Many sample records bundle
  several parts inside one `question_html`; tags and marks apply to that record.
- Existing sessions store answers, marks and attempts against `question_id`.
  Reusing an ID for a different assessable task would corrupt historical meaning.
- Existing specification trees contain section/topic/point arrays and string
  `code` fields. Their current authored order is available without parsing codes.
  They must not be described as verified verbatim copies of official documents.
- TryPlumi.app is a user-specified reference. An ordinary HTTPS request through
  the environment's inherited proxy failed with `403 Forbidden` at CONNECT.
  Its screens, question inventory, filters and internal data model were **not
  inspected or verified**. No feature or workflow below is attributed to Plumi.
- The Pearson Physics and OCR Chemistry URLs listed below failed the same way.
  No official specification PDF, numbering or reuse permissions were verified.
  The examples below use repository data or explicitly synthetic fixtures.

The useful reference to take from the request is focused question discovery:
choose the actual syllabus points, see precisely which parts match, and retain
enough original context to answer them. Validate competitor observations and
current board specifications when normal permitted access is available.

## Implemented now versus planned imports

The current engine supports inclusive specification ranges, `any`/`all` point
matching, primary versus primary-and-crossover scope, and composed paper/year/
series/tier/source/difficulty/marks/progress/search filters. Sorting offers original
paper order, specification order, difficulty and ascending/descending marks; ties
retain input order. Practice exposes these controls, sample-content handling and
30-result pagination. Runtime records can carry part identity, shared/full context
and explicit dependencies without selecting or scoring unrelated parts. The
accompanying automated suite now contains 35 tests; this is not evidence of a
completed real-content import or official-spec verification.

The source inventory, extraction workers, provenance manifests, review queues,
versioned publication pipeline and large-scale ingestion described below remain
proposals. No competitor data, official question extracts or bulk importer ships
as a result of these runtime changes.

## Specification identity and order

1. Version a specification by board, qualification, subject, specification code,
   issue/version, applicable years and optional pathway. Preserve the source URL,
   document checksum, page references and date checked.
2. Give every node an opaque stable ID. Keep the printed `code` separately as a
   **string**, alongside title, parent ID, node type, tier and paper applicability.
   IDs must be unique even where printed codes repeat under different sections.
3. Use canonical leaf order for the versioned specification. Implemented optional
   `spec.point_order` must be an exact permutation of every leaf ID: omissions,
   duplicates and unknown IDs throw before indexing. It controls `subjectLeaves`,
   ranges and specification sorting. If absent, authored section → topic → point
   array order is the fallback. Never use floating-point comparison, decimal
   arithmetic or lexical sorting as the ordering authority.
4. In a fixture whose authored sequence is `2.9`, `2.10`, `2.11`, selecting the
   first and last includes all three. `parseFloat('2.10')` loses identity and is
   invalid. Natural sorting may help a diagnostic, but must not rewrite the tree.
5. Support codes such as `2.1.1(a)`, `P2`, `N10`, Roman numerals and nonnumeric
   titles. Store any normalization as a separate search key; retain original text.
6. Resolve a range using endpoint **IDs**, in one selected subject/spec version.
   Range bounds run from the earliest descendant of the start node through the
   latest descendant of the end node in canonical order. Nested/overlapping node
   endpoints are valid. Unknown, mixed-subject/version or reversed bounds fail
   closed; the UI does not automatically swap them. Skip neither endpoint.
7. Filter tier/paper applicability separately. A printed code is not a globally
   unique identifier, and a paper's position is not a specification's position.

Repository examples: Edexcel A-Level Mathematics reuses topic codes `1`, `2`,
`3` in Pure and Statistics sections; OCR Chemistry uses three-level string codes
such as `2.1.1`. The Physics tree places topics 1, 2, 3, 6, 7, 8 in its first
section and 4, 5 in another: this is a grouped paper view, and its tree order is
only a provisional fallback, **not necessarily official syllabus order across
those groups**. Verify the actual versioned board document before supplying a
canonical `point_order`; neither numeric sorting nor the existing grouping proves
that order. These examples illustrate representation, not official verification.

## Filtering contract

Keep selection, knowledge prerequisites and presentation as separate operations.

- Expand selected sections/topics/ranges into their leaf IDs using the selected
  specification tree. Keep selected endpoint/node IDs in saved filter state.
- In `primary` scope, compare the selected leaves with the question part's
  expanded `primary_spec_points`. In `primary_and_crossover` scope, compare with
  the union of its expanded primary and crossover tags.
- `any`: at least one selected leaf occurs in that comparison set. `all`: every
  selected leaf occurs. `focus: null` or an unset focus is unrestricted; explicit
  `focus: []` matches no records, including in `all` mode. UI “Clear selections”
  intentionally chooses none; “Use all topics” removes the restriction. Label
  matching modes “Any selected point” and “Every selected point”; broad topic selection
  plus `all` can legitimately return no results.
- A record tagged with a topic expands to that topic's leaves. Prefer precise
  leaf tagging for imports; a broad tag otherwise implies every descendant.
- The existing learned-only rule, when enabled, still requires **all** primary
  and crossover prerequisites. `any` focus must never bypass that rule. Keep its
  opt-in/out UI distinct from matching a chosen spec range.
- Intersect focus with board/spec, paper, year, series, tier, source, difficulty,
  mark band and attempt-status filters. Do not infer a missing tier as both tiers.
  Show counts and a useful empty state; document handling of unknown metadata.
- Sort by the selected mode, retaining original input/paper order on equal keys.
  Stable IDs establish identity, not sort tie-breaks. Preserve printed question/
  part labels and original paper order for labels such as `9(a)(ii)`.
- Match/count **assessable part records**, not every sibling of a matching part.
  Expanding context must never increase the result count, question count, marks,
  estimated assessed time, attempts or mastery evidence.

For a `2.9`–`2.11` selection, a part tagged only `2.10` matches `any`; it does not
match `all`. A part requiring unlearned crossover knowledge can match focus but
remain locked under learned-only. Show why it is locked instead of losing it
silently. Reject obsolete/unknown spec IDs at publication, not at quiz time.

## Part-level question model

Use one existing-schema question record per smallest independently markable part.
A top-level question, shared stimulus and nested part hierarchy need not each
become a scored record. Preserve the original labels and order explicitly.

- `question_id`: stable ID of this assessable part.
- `parent_question_id`: stable group ID for the original full question; need not
  itself be an assessable record.
- `part_label`: original label, e.g. `(b)(ii)`; `question_number` keeps a readable
  full reference. Do not build identity from a display label alone.
- `context.shared_stem_html`: common setup, definitions and stimulus, without
  answers or unrelated part instructions. Include every required figure/table.
- `context.full_question_html` / `full_question_image_url`: faithful optional
  full context for an explicit “View full question” action. Not an answer key.
- `depends_on_question_ids`: explicit prerequisites such as (b) using a result
  obtained in (a). References must be unique, known in the same subject/paper,
  compatible with the parent group, and free of self-links/cycles. Nonempty
  dependencies require a nonempty shared stem supplying the needed earlier
  information/result; a hidden full-question disclosure alone is insufficient.
- The part's `content` contains its own prompt and its own mark scheme only;
  `marks`, `estimated_minutes`, tags and difficulty describe the part.

If (b) depends on (a), merely showing (a)'s wording may not make (b) independent.
Review whether to include (a) as a separately selected task, supply a permitted
“use this result” scaffold, or exclude (b) from standalone random practice.
Any scaffold must be labelled and avoid claiming the original exam conditions.
Supplied results must not reveal the answer to the selected scored part. Do not
silently award or record marks for an unselected prerequisite. Legacy grouped
records can coexist, but deduplicate group and part entries in the same session.

Illustrative synthetic record, using the part-support field contract (the source
URLs and provenance are intentionally omitted because this is not a real import):

```json
{
  "question_id": "PPP_FIXTURE_MECHANICS_Q04_B",
  "parent_question_id": "PPP_FIXTURE_MECHANICS_Q04",
  "part_label": "(b)",
  "question_number": "4(b)",
  "paper_id": "PPP_FIXTURE_MECHANICS",
  "subject_id": "EDX_ALEVEL_PHYS_9PH0",
  "source_type": "real_past_paper",
  "is_sample": true,
  "include_in_custom_pool": true,
  "marks": 3,
  "estimated_minutes": 4,
  "difficulty": "medium",
  "primary_spec_points": ["EDX_PHYS_M2_2.6"],
  "crossover_spec_points": ["EDX_PHYS_M2_2.4"],
  "depends_on_question_ids": ["PPP_FIXTURE_MECHANICS_Q04_A"],
  "context": {
    "shared_stem_html": "<p>Two vehicles collide and move together. For this isolated part, use the result from (a): their shared speed is 9.0 m/s.</p>",
    "full_question_html": "<p>Synthetic full-question context: parts (a) and (b).</p>",
    "full_question_image_url": null
  },
  "content": {
    "question_html": "<p>Using the speed found in (a), calculate the energy transferred.</p>",
    "question_image_url": null,
    "mark_scheme_html": "<p>Synthetic part-specific marking guidance.</p>",
    "mark_scheme_image_url": null
  }
}
```

This abbreviated fixture demonstrates shape, not complete publishable content.
Future ingest metadata belongs in a versioned provenance manifest keyed by
`question_id`; do not assume the runtime currently validates that manifest:

```json
{
  "schema_version": 1,
  "batch_id": "physics-pilot-001",
  "question_id": "PPP_FIXTURE_MECHANICS_Q04_B",
  "content_revision": 1,
  "spec_version_id": "fixture-9PH0-v1",
  "source_document_sha256": "<verified-original-PDF-checksum>",
  "source_region": {"page": 4, "bbox": [0.1, 0.2, 0.9, 0.6]},
  "rights_status": "pending_review",
  "review_status": "draft",
  "tag_confidence": 0.81,
  "reviewer_id": null
}
```

Define bbox coordinates as normalized `[left, top, right, bottom]` in the page's
post-rotation coordinate system; use a list for multi-region/multi-page parts.
Neither example represents a permitted or completed import.

## Import pipeline: pilot before thousands

1. **Inventory and permissions.** Build a manifest of board, subject/spec version,
   year/series, component, paper variant, tier, question paper, mark scheme and
   grade-boundary source. Record official URL, access date, release restrictions,
   rights holder, permitted uses and permission/licence evidence. Public download
   access is not permission to redistribute extracts. Publish only permitted
   material; otherwise retain metadata and link to the board. Never ingest
   restricted teacher/secure papers or scrape competitor question banks.
2. **Acquire and fingerprint.** Download permitted sources with TLS verification;
   validate PDF type, page count and checksum. Store immutable originals and
   acquisition logs privately as permitted. Match paper/mark-scheme versions
   before extraction. Quarantine incomplete downloads and ambiguous variants.
3. **Extract layout.** Prefer PDF text with page coordinates; use OCR only where
   necessary. Retain source regions, extraction method/version and confidence.
   Reconcile reading order across columns/pages, units, equations, superscripts,
   tables, graphs and figures. Keep diagrams as faithful assets with useful alt
   text; OCR text alone cannot replace a graph. Do not crop away axis labels.
4. **Segment hierarchy.** Detect question → (a)/(b) → (i)/(ii), shared stems,
   sub-stems, repeated page headers and page continuations. Review proposed
   boundaries against the original page. Explicitly map which figures/tables
   each part needs; deduplicate shared assets without losing context.
5. **Align marking.** Match each part to its own marking region, mark total,
   acceptable alternatives, method/accuracy codes, error-carried-forward rules
   and levels-of-response rubric. Shared marking rules must remain available.
   Reconcile sums with parent/paper totals and report partial extraction rather
   than inventing absent parts. Verify diagrams in mark schemes independently.
6. **Map spec and dependencies.** Tag the assessed skill as primary; necessary
   supporting skills as crossover, including cross-subject prerequisites. Save
   proposed IDs, reasoning/evidence, model version and confidence per tag.
   Check references against the versioned tree and applicable tier/paper. Build
   dependencies from actual wording/mark scheme, not mere adjacent part labels.
7. **Review difficulty.** Treat model-assigned difficulty as provisional. Use
   board/qualification-aware rubrics (reasoning steps, novelty, scaffolding),
   review with teachers, then calibrate against enough consented attempt data.
   Marks or time alone do not measure difficulty. Track uncertainty and sample
   size; do not silently relabel historical attempts or compare uncalibrated
   subjects as if equivalent. Keep stretch/AI material separately labelled.
8. **Validate and approve.** Run schema, referential, source-region, HTML/URL,
   marks, dependency, rights and asset checks. Sanitize markup at import and
   render boundaries. Human reviewers compare original question and mark scheme
   side by side; every published pilot part receives content and tag review.
   Low-confidence OCR/tags, ambiguous dependencies and rights issues always
   remain quarantined. Confidence scores never substitute for acceptance.
9. **Publish versioned packs.** Stage draft/reviewed/approved/rejected records
   outside the live pool. Publish approved parts in a small versioned pack via
   the existing `data/packs` seam; include checksum manifest and release notes.
   Add its index entry only after checks pass. Keep rollback to the prior index
   and pack revision. Do not ship raw model output directly to the live pool.

For scale, process one subject and one permitted paper first, then batches of
roughly 100–250 parts. These are proposed operational sizes, not performance
claims. Resume work from manifest checkpoints and retry failed stages without
repeating approved extraction. Increase concurrency only after measuring memory,
OCR/API limits and reviewer capacity. Track backlog by stage and failure reason.

Suggested batch scorecard: source/rights completeness, extracted vs expected
parts/marks, OCR corrections, missing figures, alignment defects, unknown spec
IDs, tag disagreement, dependency errors, duplicates, reviewer minutes/part and
approved coverage by spec point/year/tier. Report denominators and sampled vs
fully reviewed counts. Set release thresholds before moving beyond the pilot.
Do not optimize “questions imported” while incomplete contexts accumulate.

## Identity, duplicates and history

- Derive source identity from board + qualification/spec version + year/series +
  component/variant/tier + original question path. Use immutable task IDs; store
  labels and source-path aliases separately so editorial renumbering is safe.
- Idempotency key: source-document checksum + part region/path + extraction
  schema version. Re-running the same batch must not create new live questions.
- Detect exact duplicate assets/text and near duplicates using normalized text,
  image hashes and source identity. Flag resits/reprints and alternate paper
  variants for review; similar wording alone is not proof of duplicate tasks.
- Correct transcription/tagging with explicit content/spec-map revisions and an
  audit trail. A substantively changed task needs a new ID. Never change an old
  scored whole-question ID into a single part ID.
- Persist selected part IDs and content/spec-map revision in session snapshots.
  Historical attempts retain their original marks, source, difficulty and tags;
  aggregate group views derive from distinct part attempts without double count.
  Existing whole-question attempts remain valid and require an explicit migration
  policy before any reconciliation with newly imported parts.

## Rollout and acceptance

1. Ship pure range/focus/metadata filters with synthetic regression fixtures.
2. Add optional part/context fields without invalidating legacy grouped records.
3. Review a permitted paper end to end; publish only an approved small pack.
4. Verify real student flows and rollback, then expand subject by subject.

Required acceptance cases:

- `2.9`–`2.11` includes `2.10`; alphanumeric/repeated codes resolve by stable ID;
  canonical order survives reload. Valid explicit `point_order` overrides tree
  order; invalid permutations fail before indexing. Unknown/mixed-version and
  reversed endpoints fail closed; nested/overlapping node bounds remain valid.
- `any`/`all`, primary/crossover scope and learned-only produce the documented
  results together. Null/unset focus is unrestricted; explicit empty focus yields
  zero. Filters compose deterministically with year/series/tier. Equal sort keys
  preserve input order, and pagination never changes the matching set.
- Selecting only Q4(b) displays its required stem/figure and part mark scheme;
  full-context expansion adds no selected IDs, marks, attempts or answer fields.
- A dependency on Q4(a) is visible and handled explicitly; no answer leakage.
  Missing/cyclic dependencies block publication. Legacy questions still render.
- Part marks sum correctly; all required figures, continuations and mark-scheme
  exceptions survive mobile display, printing and accessible text alternatives.
- Re-importing a batch is a no-op for identity/counts; a rejected item never enters
  practice; rollback restores prior content without rewriting attempt history.
- Full-paper selection cannot contain both a scored parent and its scored parts.
  A part's attempt status/mastery uses its own stable ID and assessed tags only.
- Schema/data checks and existing engine/session tests pass. Pilot review records
  prove permissions, transcription, tagging and marking acceptance before scale.

## Sources inspected or attempted

Access/inspection date for all entries: **12 November 2026**.

| Source | Evidence / limitation |
| --- | --- |
| [Repository README](../README.md) | Existing Phase 1, content-pack format, demo status and board-link approach. |
| [Question/paper schema](../js/data/schema.js) | Current record checks; optional part support may evolve in this change. |
| [Spec index](../js/engine/spec-index.js) | Canonical leaf order (`point_order` or tree fallback), inclusive ranges and expansion. |
| [Subjects](../data/subjects.json) | Board/spec identities and official assessment URLs; not proof of permissions. |
| [Physics tree](../data/specs/EDX_ALEVEL_PHYS_9PH0.json) | Repository numbering/order examples, not official document verification. |
| [Mathematics tree](../data/specs/EDX_ALEVEL_MATH_9MA0.json) | Reused printed codes in separate sections. |
| [Chemistry tree](../data/specs/OCR_ALEVEL_CHEM_H432.json) | Nested string-code examples. |
| [Physics sample questions](../data/questions/EDX_ALEVEL_PHYS_9PH0.json) | Shared context, multiple parts and crossover examples; all demo content. |
| [TryPlumi](https://tryplumi.app/) | Proxy CONNECT 403; no page or product behavior observed. |
| [Pearson Physics materials](https://qualifications.pearson.com/en/qualifications/edexcel-a-levels/physics-2015.coursematerials.html) | URL from subjects; proxy CONNECT 403; specification and rights unverified. |
| [OCR Chemistry assessment](https://www.ocr.org.uk/qualifications/as-and-a-level/chemistry-a-h032-h432-from-2015/assessment/) | URL from subjects; proxy CONNECT 403; specification and rights unverified. |
