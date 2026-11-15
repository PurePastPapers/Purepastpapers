# Edexcel Mathematics 9MA0: specification and curriculum review

Reviewed 14 November 2026. This is a model review, not a human/teacher review.

The runtime specification is versioned as `pearson-9ma0-issue4-2020-02`.
Its [official Pearson source](https://qualifications.pearson.com/content/dam/pdf/A%20Level/Mathematics/2017/specification-and-sample-assesment/a-level-l3-mathematics-specification-issue4.pdf)
is Issue 4, February 2020, with first certification in 2018. The downloaded current
PDF matches the source used for this review byte for byte:
`b008c50064090bab5c3e26e1f3c97778d21b492d5b839219f73eca11828ecef8`.

## Official references and stable runtime skills

`data/specs/EDX_ALEVEL_MATH_9MA0.json` now retains two explicit representations:

- `official_points`: 89 printed specification points in authored order, scoped to
  Pure, Statistics or Mechanics. Each has a string code, content wording,
  component applicability, source PDF/printed pages and content-cell coordinates.
  Mathematical notation is normalized to Unicode/plain text; the original PDF
  remains authoritative for typography and detailed guidance.
- The existing 90 runtime leaves: their IDs and skill meanings remain intact.
  Each has an `official_reference`. `point_order` lists every runtime leaf once
  in the corresponding official sequence; `official_point_order` lists the 89
  official references. Repeated codes across areas are not a global identifier.

Two compatibility details must remain visible to importers:

1. Official Pure point **1.1** includes deduction, exhaustion, counterexamples and
   contradiction. The old runtime tree split contradiction into a leaf whose ID
   ends `_1.2`. That stable ID is retained, while its displayed code is corrected
   to **1.1** and `legacy_display_code` records the old label. Both proof leaves
   are partial skill scopes of official 1.1; do not merge their learner records.
2. The historical Statistics distribution leaf `_4.3` mentions normal
   approximation in its title. Official **4.2** covers the Normal model and its
   relation to the binomial, including normal approximation. Official **4.3** is
   selecting an appropriate distribution. Keep the legacy label/attempt history;
   newly reviewed normal-approximation questions use `_4.2`. Do not copy the old
   title as an authoritative description of official 4.3.

No IDs, stored attempts or learned records were rewritten. No point was removed.

## Teaching years

`data/curriculum/math-9ma0.json` is a candidate for the curriculum index; it is
not loaded merely by existing on disk. Its year mapping follows the explicitly
headed Year 1/AS and Year 2 remaining A level content in Pearson's
[two-year scheme of work, issue 3](https://qualifications.pearson.com/content/dam/pdf/A%20Level/Mathematics/2017/Teaching%20and%20learning%20materials/a-level-maths-2-years-sow-issue-3.docx),
cross-checked against bold common-AS content in the specification. It represents
Pearson's suggested standalone sequence, not a mandatory national teaching order.
Older SOW references sometimes use AS numbering; named content and the current
9MA0 reference determine the mapping.

Year 12 contains 52 runtime skill relations; Year 13 contains 64. The union is all
90 runtime leaves. **26 leaves occur partially in both years**, with explicit
notes identifying each year's subskill (for example integer/rational binomial
powers, 2-D/3-D vectors, or polynomial/other differentiation). Partial relations
must never be promoted to learned full coverage. Selecting Year 13 neither
selects Year 12 as learned nor rewrites any saved learned state.

## Textbooks and remaining evidence

The same candidate includes 14 chapters from *Edexcel AS and A level Mathematics:
Pure Mathematics Year 1/AS*, Pearson, 2017 series, ISBN 9781292183398. The
[publisher's contents PDF](https://www.pearsonschoolsandfecolleges.co.uk/asset-library/pdf/Secondary/mathematics/edexcel-as-a-level-maths-and-further-maths/free-resources/Pure-1-contents.pdf)
identifies chapters/subsections and printed chapter starts; edition/ISBN is
confirmed by the [publisher's 2017 resource page](https://www.pearsonschoolsandfecolleges.co.uk/secondary/subjects/mathematics-secondary/pearson-edexcel-as-and-a-level-mathematics-and-further-mathematics-2017).
Broader A level skills are explicitly partial where the chapter only covers the
Year 1 subset. Chapter numbers are independent of official specification codes.

Pure Year 2, Statistics/Mechanics Year 1 and Statistics/Mechanics Year 2 chapter
maps remain unverified. Their publisher ActiveTeach resource-finder links timed
out in both direct and web access. No guessed chapter mappings are exposed. The
shared-folder access link and textbook PDFs are excluded from the public repo.

## Validation

The mapping candidate passes `createCurriculumMap` against the versioned runtime
specification: 2 year choices, 1 book, 14 chapters. All 52 repository tests pass;
the data validator reports 38 subjects, 926 paper records and 249 current demo
questions, with no errors or warnings at this point. These checks validate the
representation; they do not count this work as imported exam questions.
