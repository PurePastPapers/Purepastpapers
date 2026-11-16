# Biology A (9BN0 / 8BN0) extraction and review contract

Reference: Pearson Edexcel A level Biology A (Salters-Nuffield) specification
Issue 4 (November 2018): 137 statements, 18 core practicals and 28 Appendix 6
mathematical skills, as runtime IDs in `data/specs/EDX_ALEVEL_BIOL_9BN0.json`.
Printed codes are strings (`2.10` is not `2.1`). The 62 `EDX_BIOL_T*` seed IDs
are legacy lookups only and must never be used as tags. AS Topics 1–4 are
worded identically to A level Topics 1–4, so AS questions use the same IDs.

1. `extract.py` writes coordinate candidates. Every question's tariffs must sum
   to its printed "(Total for Question N = M marks)" and every paper to its cover
   total; the candidate's `parts` list is the authoritative tariff inventory.
2. `review_packet.py` writes a worksheet (text layer + mark scheme text) and a
   full-question PNG per question. The text layer is for tagging only: open the
   PNG whenever a figure, micrograph, graph, table, structure or data matters.
3. A review is JSON `{paper_id, reviewer_type: "model", review_status:
   "model_reviewed", source_sha256, questions: [...]}`. Each question is
   `{number, units: [...], exceptions: [...]}`. Each unit has:
   - `parts`: original part labels from the candidate, each tariff used exactly
     once across the question (repeat a label only if the candidate repeats it);
   - `primary_spec_points`: the statements (and, where the marks assess them, core
     practicals or maths skills) that the marks actually assess, judged from the
     mark scheme, not from nouns in the stem;
   - `crossover_spec_points`: genuine prerequisites from elsewhere that a student
     must know to answer, e.g. a maths skill used in a biology calculation;
   - `tag_basis`: one sentence of positive evidence (what the scheme credits);
   - `difficulty`: easy | medium | hard, with `difficulty_basis` explaining the
     demand (recall, application, unfamiliar context, multi-step data analysis,
     extended response) rather than counting marks. Extra hard is never used for
     official questions;
   - `summary`: a short editorial description for browsing, never a transcription
     and never revealing the answer;
   - `context_basis`: independent | shared_stem | grouped_dependency;
   - `review_status`: model_reviewed (or needs_review plus a question exception).
4. Split a question into the smallest independently answerable units. Group parts
   when a later part needs an earlier answer that is not given, or when a joint
   tariff spans labels. Keep source passages, experimental designs, micrographs,
   tables, units and core-practical context attached via shared_stem. Do not
   invent a derived answer as a new given.
5. Content year is derived by the build from the tags (Topics 5–8 and their core
   practicals are Year 13); do not set it by hand. AS units are always Year 12.
6. Paper 3 questions that use the pre-release scientific article get the article
   as unscored context automatically; tag the biology the marks assess.
7. Run `python3 tools/biology/check_review.py CANDIDATE REVIEW` until it passes.
   Never call a model review a teacher review. Put anything uncertain in the
   question's `exceptions` with a reason instead of guessing.

Development Python: pdfplumber, pypdfium2, Pillow, pypdf; tesseract only for
positioning image-only pages. The application stays static and has no runtime
processing credentials. Rights: owner-confirmed Pearson permission
(`data/imports/biology/rights.json`), not an independent licence audit.
