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

Current counts, missing/thin leaves and source-support totals are generated in checkpoint-summary.json and give-this-to-Will.md. All five subjects remain incomplete in substantive coverage. A leaf count is never a completeness claim.
