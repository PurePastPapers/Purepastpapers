# 9MA0 extraction and review contract

The canonical reference is Pearson Issue 4 (89 printed points), with the runtime
crosswalk in the source workspace's spec/runtime-crosswalk.json. Runtime IDs are
stable; printed codes are strings, scoped to Pure / Statistics / Mechanics.
Pure proof by contradiction uses legacy runtime ...PROOF_1.2 but official code1.1.
Normal approximation belongs ...STATS_DIST_4.2, not legacy4.3.

1. `extract.py SOURCE_DIR --output CANDIDATES` produces coordinate-based review
   candidates, not published content. Source checksums/version make reruns safe.
2. Inspect actual source rendering where text extraction loses mathematical
   notation, figures or context: `render.py CANDIDATE --question N --output Q.png`.
   Source pixels, not OCR or rewritten prose, are the displayed question.
3. Each review output is JSON `{paper_id, reviewer_type:"model", questions:[...]}`.
   Each question is `{number, units:[...], exceptions:[]}`. A unit contains:
   - `parts`: original part-label strings from candidates, each used exactly once
   - `primary_spec_points`: precise assessed runtime leaf IDs
   - `crossover_spec_points`: genuine outside prerequisites, not surrounding context
   - `difficulty`: easy|medium|hard, with `difficulty_basis` explaining reasoning,
     scaffolding and interpretation rather than simply counting marks
   - `summary`: short editorial discovery description, not a transcription
   - `context_basis`: independent|shared_stem|grouped_dependency
   - `review_status`: model_reviewed, or needs_review with an exception
4. Do not copy a question's full tag union to every part. Do not infer a result
   from a preceding answer or reveal the answer to the selected part. Group a
   dependent part with its prerequisites when it cannot stand alone safely;
   each original assessable mark must appear in only one resulting unit.
5. Verify part-label/tariff alignment against source. Retain source page/bbox,
   printed question total, question paper and matching scheme fingerprints.
   No claim of human review. Ambiguous records go to the exceptions queue.
6. Reconcile every original question total and component total (100 for01/02/03;
   50 for31/32), unique IDs, source asset existence, tags and dependencies. Model
   proposals with invalid IDs or unresolved layout do not enter the accepted pack.

Development Python: pdfplumber, pypdfium2, Pillow. Application remains static and
has no runtime processing credentials or PDF extraction dependency. The owner
confirmed on 2026-11-14 that Pearson permission covers the public question bank;
record this as owner-confirmed permission, not an independently audited licence.
Textbook PDFs and private shared-folder access keys stay outside the repository.
