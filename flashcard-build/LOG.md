# Flashcard rebuild log

2026-11-25: Read the full supplied brief. Used separate subject writers and different independent reviewers. All content work is under flashcard-build. Main was not edited. Source baseline: f21bab2.

Created local content branch codex/flashcards-carry-over-20261125. Created separate label branch codex/flashcard-subject-labels-20261125; its patch is in this folder. Label code passes JavaScript syntax and whitespace checks. No PR or merge.

Read-only Supabase export recovered 64 Psychology MARK and 28 Sociology MARK cards. The original file is preserved. The known sign-test table was rebuilt from its own question: +,+,0,-,+,-,+,+,0,+; six positive, two negative, two ties, s=2, effective N=8. A second agent recomputed the result. Front and identities are unchanged. A reviewed working subset and a separate quarantine are not suitable as replacement decks.

Independent reviews found and corrected unsupported attributions, overgeneralised historical claims, inaccurate exam-mark allocations, ambiguous literature prompts, and wrong source/page references. See subject review notes and source ledgers for individual verdicts. Unverified draft items remain visibly marked; no upload build has passed.

Psychology: Asch 36.8%, Milgram baseline 26/40=65%, Loftus and Palmer 40.5 mph vs 34.0 mph were checked against original papers. A disputed telephone-variation percentage was quarantined rather than silently overriding an AQA-hosted source. Removed Psychology spec content was excluded.

GCSE Literature lead audit, seed 20261125: 12-card diagnostic sample of the earlier source-backed set found at least three broad recall prompts. This exceeded 2%; all related template prompts were rechecked and cut or replaced. This was a prompt-quality check, not a factual-error estimate for a finished deck.

GCSE Literature lead re-audit, seed 20261126: 12 current cards sampled (over 10% of 112). Eleven assertions had supporting source locations; the twelfth had a wrong source/page citation for Mrs Birling. Citation-error rate 1/12=8.33%; no factual contradiction established. The three records sharing that citation were all rechecked and corrected to a Pearson indicative mark scheme, printed p.11. Full final subject audit remains outstanding; do not report a 0% overall error rate. Other subjects do not yet have a completed lead 10% audit.

Technical verification: shared compiler and tag checker received an independent implementation review. Isolated fixtures rejected unknown leaves, duplicate fronts, long backs, em dashes, list prompts, missing verification and malformed/multiple spec tags. Stable-key hashes and technique tag isolation were checked. Compiler output is now removed on failure, and a source digest prevents stale completeness approval. Actual draft JSON files are checked using the site's createTagMapper/cardPoints functions.

A Git push was automatically rejected. The reviewer interpreted the public branch as publication without approval, despite section 9's requested branch push. No bypass or indirect push was attempted. Read-only remote-ref check found no content branch. The code and review results remain local and in the private checkpoint archive.

At the 25 November checkpoint, checkpoint-summary.json and give-this-to-Will.md recorded draft coverage. Those files are historical and do not establish current completeness or publication. A leaf count is never a completeness claim.

## 26 November release progress
User authorised completing and publishing the five subjects, with quotations in English and Verulamium excluded. PR69 labels merged as d3a6f713. Earlier versions of GCSE English and Psychology were published; later verified versions supersede their initial checkpoint counts. Psychology original MARK fronts, stable keys and card IDs were kept, and the scattergram media was checked. Every batch was checked against exact expected material plus sortedkey count/checksum. Old Psychology atomic catalogue remains unchanged. See publication-results.json for UUIDs and exact verification. Final samples remain gated on all5complete.

## 26 November report and documentation checkpoint
The verified release record now lists Psychology 806, A-level English Literature 435, and GCSE English Literature 349 cards published. Sociology and GCSE History continue through review and release; no final count or publication is asserted here. The final-report fixture now checks that the original Psychology scattergram’s alt text, including its eight data pairs, survives HTML-to-text rendering. The fixture passed. Fresh final samples remain gated on all five strict builds and lead confirmation.

## Final release — 26 November 2026

All five subjects were completed, reviewed, strict-built and published: Psychology 806; Sociology 567; A-level English Literature 435; GCSE History 482, excluding Verulamium; GCSE English Literature 349. Total: 2,639 cards. Exact material comparisons, counts and stable-key checks passed for every catalogue. Lead audits and corrective whole-set reviews are recorded in each subject’s lead-audit.json. The final seeded 222-card stratified handover includes four MARK cards per subject and quotation recall in both English samples. Earlier checkpoint notes are historical; publication-results.json and give this to will.md are current.
