# Reusable PurePastPapers subject implementation prompt

You are the implementation agent for the existing PurePastPapers repository,
`PurePastPapers/Purepastpapers`. Build a real, source-backed question bank for the
target subject using the working Maths implementation as the reference. Complete
the implementation, validation, publication and handover. Do not stop at a plan,
a list of links, a generated paper catalogue or a small demonstration batch.

Set these run parameters before starting:

```text
TARGET_SUBJECT_ID = <one existing subject_id from data/subjects.json>
TARGET_PHASE = A-level STEM / A-level humanities / GCSE
SOURCE_SCOPE = all verified publicly available current-spec exam papers,
               matching schemes, legitimate distinct variants and official samples
TEXTBOOK_SCOPE = the owner's supplied contents/edition for this subject,
                 with official specification navigation available separately
PUBLISH = tested checkpoints to main throughout, with an updated handover
```

Work on one subject at a time unless the owner explicitly requests a coordinated
multi-subject run. Start with the Biology and Physics entries below; complete
Chemistry as the next STEM subject. Only then move to the humanities phase.
GCSE is a separate later phase. This prompt does not mean all those subjects
have already been imported or that Maths chapter numbers apply to them.

The owner's preferred routing is Sol with High effort for coordination and Luna
with Medium effort for independent extraction/tagging batches, with lead review
of ambiguous tags and dependencies. Use those settings only if the host actually
exposes them; disclose unavailable model names and continue with the available
capabilities. Delegate only when authorized and give workers distinct file/batch
ownership so they cannot overwrite one another's reviews.

## 1. Use the site's actual qualifications

These are the existing A-level targets in the site registry at this handover:

| Priority | Subject | Board | Existing subject_id | Specification code |
| --- | --- | --- | --- | --- |
| First STEM | Biology | Edexcel | EDX_ALEVEL_BIOL_9BN0 | 9BN0 |
| First STEM | Physics | Edexcel | EDX_ALEVEL_PHYS_9PH0 | 9PH0 |
| Next STEM | Chemistry | OCR | OCR_ALEVEL_CHEM_H432 | H432 |
| Later humanities | Geography | AQA | AQA_ALEVEL_GEOG_7037 | 7037 |
| Later humanities | History | Edexcel | EDX_ALEVEL_HIST_9HI0 | 9HI0 |

Re-read `data/subjects.json` at the start of the run. Confirm the exact official
qualification, specification issue, assessment dates, components and optional
routes. In particular, do not substitute a different Edexcel Biology route or
another board's Chemistry course because a resource looks similar. Verify the
corresponding AS qualification and its public source inventory from the board;
do not invent its code by changing a digit in the A-level code.

For the later GCSE phase, the current relevant registry includes:

```text
EDX_GCSE_COMBSCI_1SC0 — Edexcel Combined Science (Double Award), 1SC0
EDX_GCSE_BIOL_1BI0    — Edexcel separate Biology, 1BI0
EDX_GCSE_CHEM_1CH0    — Edexcel separate Chemistry, 1CH0
EDX_GCSE_PHYS_1PH0    — Edexcel separate Physics, 1PH0
AQA_GCSE_GEOG_8035    — AQA Geography, 8035
EDX_GCSE_HIST_1HI0    — Edexcel History, 1HI0
```

Check those entries again when that phase begins. Preserve Combined Science
versus separate science, Foundation versus Higher, component, option and award
identities. Do not merge them into one unqualified question pool.

## 2. Inspect and preserve the existing application

Read `README.md`, `docs/MATHS-HANDOVER.md`, the curriculum/tagging documentation,
the target subject's existing records, current Git status and applicable local
instructions. Check what is already implemented before changing it.

This repository is a static HTML/CSS/JavaScript application with ES modules.
Preserve that architecture, the notebook visual design, semantic colour/type
tokens and existing account/progress behavior. Do not port it to React, replace
the application with a template, add a processing API key to the browser, or
reset the site's database to make importing easier.

The Maths baseline contains 60 public source booklets, 602 source-scoped original
questions and 1,110 scored units. Its textbook navigation contains four supplied
books, 45 chapters and 251 subsections. These are reference implementation
counts, not expected totals for another subject. The source audit excluded seven
restricted 2026 Maths booklets at the time; recheck source availability at your
run date rather than assuming a historical restriction is permanent.

Inspect these reusable implementation areas:

```text
tools/maths/                       acquisition, extraction, rendering and validation reference
data/imports/maths/                inventories, reviews, rights, identities and coverage
data/packs/maths/                  accepted source question/paper packs
data/maths-assets/                 lazy lossless image catalogues
data/curriculum/maths-textbooks.json
data/imports/maths/textbook-question-links.json
js/engine/textbook-index.js
js/engine/filter-engine.js
js/data/content-repository.js
js/data/source-images.js
js/data/api.js
js/ui/spec-tree.js
js/ui/topic-organisation.js
js/ui/question-view.js
js/ui/views/practice.js
js/ui/views/subject.js
tests/ and tools/browser-*.cjs
```

Maths filenames, tariff detectors and qualification-specific assumptions are not
universal parsers. Extract shared utilities where useful and add a clear subject
adapter. Do not perform a blind global replacement of `9MA0` with another code.

## 3. Establish the complete source inventory first

Use official board specifications, assessment resources, public catalogues and
publisher evidence as primary sources. Record the first current-spec assessment
year and every available series, component, tier, option, legitimate modified
variant and official sample. A split booklet is not automatically a separate
complete exam sitting. Shared durations must stay labelled as shared.

For every expected source, record its stable paper ID, actual qualification,
year/series, component/option, maximum marks, official duration, source URLs,
document kind, availability, source revision and SHA256. Distinguish question
paper, mark scheme and examiner report. Record missing or restricted resources
explicitly. Do not fabricate report links or claim a catalogue row contains
extracted questions. Official samples must have an explicit sample identity,
not an invented exam year.

Acquire public sources into an immutable, resumable cache. Verify PDF magic,
checksums and revisions. Reuse established permission within its documented
scope; do not repeatedly ask the owner to grant the same authorization. Do not
assume a permission record for Pearson automatically establishes permission for
every other board or publisher. If a genuinely new publication permission is
unresolved, prepare the concrete import privately and explain the specific
remaining decision. Do not bypass secure/teacher logins or reuse a competitor's
question database, tags or assets without an appropriate grant.

Keep access-bearing links, shared-folder keys, credentials and private absolute
paths out of the public repository. The original Maths research cache may not
exist on your machine; reconstruct it from public provenance instead of treating
a local path in an old note as a required external dependency.

## 4. Maintain two clearly separate topic organisations

Verify the target's actual official specification, issue and authored order.
Keep stable existing official skill IDs and learner history. Printed codes are
strings, never decimal numbers: `2.9`, `2.10` and `2.11` are distinct. Codes can
repeat across domains, qualifications or optional routes; scope their identity.

Build textbook navigation from the owner's supplied contents and verified
edition evidence. Transcribe the real book, chapter, subsection number, title
and order. Do not invent an ISBN, chapter title or teaching sequence. Store the
source evidence and checksums. A textbook subsection is a separate identity
from an official specification point, even when their printed numbers coincide.

For example, Maths `Pure 1 · 6.2` is “Equation of a circle”; official Pure `6.2`
is a different reference, and Applied 1 has its own `6.2`. Another subject must
have its own correctly scoped equivalents. Searching a book-qualified code must
find the right subsection, with readable book/year labels where ambiguity exists.

Offer prominent native tick/radio choices for Textbook chapters and Official
specification. Use textbook organisation by default where the supplied evidence
supports it. The topic tree must expose the actual chapters and subsections,
not an unrelated generic list disguised as textbook navigation.

Associate each scored unit with its assessed textbook skills and prerequisites
without erasing the official tags. A broad official point can span many book
subsections and both teaching years. Do not tag every subsection as assessed
merely because they share that official point. Require positive content evidence
for a specific subsection. Retain explicit conservative chapter scope when a
subsection cannot be resolved; do not let that ambiguous chapter link falsely
match a single selected subsection. Model review must be labelled as such.

The current Maths associations include both precise subsection links and openly
labelled chapter-level relationships. They are a conservative implementation
pattern, not a claim of independent teacher verification or permission to copy
the same associations into another subject.

## 5. Extract faithful, independently answerable assessment units

Reconcile the original full-question count and every printed mark tariff before
publishing a paper. Preserve repeated label occurrences, nested parts, joint
tariffs, continued pages, diagrams, tables, source material and answer context.
Do not silently drop a page because it contains a figure without searchable text.

Give each independently answerable scored unit a stable source-scoped ID, parent
question ID, original question/part reference, exact marks, source identity,
assessed points, prerequisite points, difficulty rationale, content-year scope
and review status. Preserve the original printed tariff occurrence indices.
The unit marks must sum exactly to the full question and component totals.

Provide necessary printed context visibly and mark it as unscored. Group parts
when a later answer depends on an earlier result that is not supplied. Do not
invent a derived answer as a new given, detach a biological source passage from
its question, remove chemistry reaction conditions, or omit a physics figure.
An expandable full original question may supplement the scored unit; it must
not inflate its mark total or cause overlapping units to be counted twice.

Render original source pixels losslessly where faithful typography/layout
matters. OCR can assist positioning and search but must not replace original
equations, units, charges, superscripts, chemical structures or graph axes with
unverified rewritten text. Align extraction coordinates and raster rendering to
the same page geometry: Maths required an explicit MediaBox/CropBox correction.
Inspect bottom tariffs and continuation boundaries, not just whether a file exists.

Index the correct official scheme, preserving alternatives and marking notes.
Method labels such as “Way 2” are not question starts. If a full-question scheme
is shown for an isolated part, label its scope and save marks only out of that
unit's maximum. Link genuine board sources and examiner reports; say when a
report is unavailable rather than generating commentary and calling it official.

## 6. Review tags, difficulty and teaching-year scope

Use the subject's content, not question length alone, to assign Easy, Medium,
Hard or Extra hard. Record a rationale. Extra hard is reserved for appropriate
beyond-specification stretch work; do not force official questions into it just
to populate all four filter counts.

Distinguish assessed skills from prerequisite/crossover knowledge. Review
ambiguous tags, dependencies, combined tariffs and options explicitly. Retain a
review queue with reasons rather than silently accepting a low-confidence guess.
Do not describe an automated/model review as a teacher review.

AS questions must keep their real qualification identity and appear in the
appropriate Year 12 content pool and cumulative Year 13 pool. Year 13 includes
earlier content by default. A separate “Year 13 topics only” choice must use
reviewed additional-content scope per scored unit, not just the exam's A-level
label or an official point shared by both years. A-level papers can also assess
earlier content. Teaching year, textbook book/year and exam year are different
properties; do not auto-mark Year 12 learned when selecting Year 13.

## 7. Preserve the agreed practice and learned-topic experience

Keep one full-width filter panel before the question results. Do not restore a
duplicated specification-range selector below a complete topic picker. Make
“Only these points” and “Include crossover questions” prominent choices.
Strict matching requires every required skill to fit the selection; crossover
matching may include extra required skills, which must be named on the card.

Retain four difficulty chips, mark bands/ranges, My progress checkboxes, real
qualification filters, content/exam years, series, paper, sort and search. Values
within a multi-select group are OR; independent filter groups intersect. Shuffle
is one separate action, not another redundant Sort option.

Show all questions on each results page expanded by default, with the mark-scheme
button above the question. Schemes stay hidden until requested. Preserve explicit
manual collapses, open references, drafts, selected sets and scroll/disclosure
state across filtering and reload. Keep pagination rather than loading an entire
large bank's source images at once. Resolve source assets lazily by booklet.

Question references must expand to full readable descriptions: book, subsection
code/title, official code/title and assessed/prerequisite role. Bare unexplained
numbers and hover-only explanations are insufficient. A student must be able to
tell which numbering system a label belongs to.

Signed-in students can save covered textbook subsections separately from official
skills. Preserve `learned_textbook_sections` and `learned_spec_points` independently.
Selecting one partial textbook section must never mark an entire broad official
point learned. Covered-content filtering must respect the chosen namespace and
all prerequisites. Keep historical official coverage accessible. Guests should
select practice topics freely without being pushed into a save/edit-learned flow.

Hide all demo questions and papers from discovery. Preserve their lookup IDs
only where old sessions/marks need them. `is_official_sample` is distinct from
the historical demo flag `is_sample`; real official samples must remain usable.
Do not re-enable demos in production to make an empty new subject look complete.
Synthetic fixtures may enable them only inside clearly isolated tests.

Marks are saved deliberately: zero is valid, blank is unmarked, editing/undo and
a new attempt are distinct actions. Never infer a score merely because a scheme
was opened. Do not rewrite existing question IDs, marks or attempt meanings.

## 8. Adapt the workflow to the subject

For Biology, retain source passages, experimental designs, micrographs, diagrams,
data tables, calculation units and required practical context. Verify the exact
Biology route. Do not classify a question only by a few nouns in its stem.

For Physics, preserve diagrams, vectors, scales, units, uncertainty, significant
figures, formula context and practical dependencies. Distinguish a mathematical
prerequisite from the actual physics skill assessed.

For Chemistry, preserve formulae, ionic charges, reaction conditions, mechanisms,
arrows, structures, spectra and tables. Verify OCR's actual modules/components
and AS relationship; do not transplant Maths chapter labels or parsers.

For Geography, preserve the board's compulsory/optional content, resource booklets,
figures, case-study requirements, command words and assessment objectives. Do not
invent a case study or turn coursework into a written-exam question.

For History, scope content to the actual paper/option and period. Preserve source
and interpretation extracts with their questions, provenance, essay tariffs and
levels-based schemes. Never mix options into one misleading common-topic tree.
Adapt question selection/timing to essay work rather than forcing STEM assumptions.

For the later GCSE phase, additionally enforce tier, Combined versus separate
science and the correct award/grade scale. Verify each qualification independently.

## 9. Verify content, interaction and deployment

Run the relevant unit/data checks and add meaningful tests for new behavior.
Validate unique IDs, source revisions, exact tariff coverage, reconciled totals,
valid tags, complete context, source/scheme asset checksums, nonempty regions and
known assessment identities. A changed assessment grouping requires a new ID or
an explicit migration, never reuse of an old ID with a different mark meaning.

Inspect representative rendered questions from every layout family, including
scans, tables, graphs, joint tariffs and continued pages. Check all crop boundaries
programmatically where possible. Byte existence alone does not prove a readable
question. Label any remaining unresolved scope accurately.

Use isolated browser profiles to test textbook/official switching, book-qualified
search, strict/crossover, AS/year logic, qualification/tier/options, progress
unions, combined filters, pagination, expanded questions, scheme loading, zero,
edits, undo, reload, selected sets and unsaved drafts. Verify guests do not mutate
saved learning. Check keyboard behavior and phone/tablet/desktop widths, including
320, 390, 768 and 1440 pixels, with no horizontal overflow or console errors.

Keep source and data processing outside the browser. If using Maths-style image
catalogues, retain lossless image bytes and SHA256 and load them lazily. Do not
dump base64 assets into agent context or commit duplicate private PDF caches.

## 10. Publish continuously and leave a reliable handover

The owner has requested immediate repository checkpoints so another agent can
resume if usage runs out. Make small coherent commits and push reviewed source,
tooling and accepted content checkpoints throughout. An incomplete checkpoint
must explicitly say what remains; do not label a partial batch “all done.”

Check Git status and the remote head before publishing. Preserve unrelated work.
Use authenticated Git when available. If this host still lacks shell push
credentials, use the connected GitHub blob/tree/commit/ref tools with the current
base tree and expected branch head. Publish large trees incrementally if needed.
Compare the final tree against the committed local snapshot before advancing
main. Never force-push or discard someone else's changes. Align local history
only after verifying that the remote and local trees match.

Maintain `docs/<SUBJECT>-HANDOVER.md` and a machine-readable coverage inventory.
Record source checksums, rights basis, textbook edition/evidence, pipeline
commands, review decisions, accepted IDs, active queue, missing/restricted items,
validation results, latest pushed SHA and the exact next action. Keep private
research/publish ledgers resumable without exposing credentials or access links.
Give concise progress updates during work and continue independent authorized
work while nonessential details are being clarified.

After publishing, confirm the deployment result and compare live index/coverage
and representative source assets with the release. Distinguish local browser
verification from a genuine production browser test. The Maths handover records
an existing domain HTTPS hostname issue; do not claim that is fixed unless you
actually verify it. Do not change unrelated DNS/hosting settings silently.

## Definition of done and final report

The target subject's verified public current-spec source scope is imported,
reviewed, source-faithful, usable through the agreed filters and published.
Book/official references and learned tracking work without corrupting historical
records. Samples, AS, tiers, options, legitimate variants and remaining external
gaps are labelled accurately. The next agent can reproduce and continue the work.

Report expected/found/reviewed/imported booklets separately from original source
questions and scored units. Include total marks, scheme/report coverage,
AS/A-level/sample/tier/option/variant coverage, textbook/official mapping precision,
reviewer type, unresolved or restricted sources, checks, deployment SHA and the
handover path. Catalogue links, unreviewed candidates and proposed mappings do
not count as imported questions. Do not claim completeness while public batches
remain queued. Start by inspecting the repository and target inventory, then
carry the authorized implementation through to this concrete result.
