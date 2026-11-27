# Sociology source and quality handoff

## Current state

The current AQA 7192 draft contains 496 atomic cards (333 CONTENT, 129 EVIDENCE and 34 BACKGROUND) plus the separately parent-managed 28-card MARK deck. All 30 specification leaves remain populated. The shared compiler reports 524 total cards with no structural errors.

The independent source review is complete for all 496 atomic cards. `sources.tsv` has one current stable-key row per atomic card; every row is marked `yes` and records the source and claim-specific support. The parent-managed MARK set and its source ledger were not edited. Nothing has been uploaded or published.

Peer-reviewed exact-card checks and the final claim review led to 11 removals, 18 source-based replacements, and one additional unsupported theory/policy card removal. Eight edited fronts were remapped to their final stable keys. Five additional specification-relevant facts were independently checked against ONS, BRIN and St Andrews Encyclopaedia of Theology sources.

## Cards corrected, split or removed during authorship

- Removed the cross-deck duplicate Durkheim social-solidarity question and the repeated 62.1% partner-living statistic.
- Removed the duplicate 62.1% front within EVIDENCE.
- Removed the list front asking for Wallis’s three movement types; each type is tested separately in CONTENT.
- Split Voas and Crockett’s two-dataset question into separate British Social Attitudes and British Household Panel Survey fronts.
- Moved quantitative and qualitative data definitions from research-design leaf `4.1.3_b1` to data-type leaf `4.1.3_b3`.
- Removed the combined National Curriculum/local-management law front because it overlapped the dated 1988 policy evidence card.
- Added distinct age-specific and demographic facts for fertility, births, family size, mortality, life expectancy and migration, each with a dated ONS front.
- Added a concrete state-corporate environmental crime example from the U.S. Department of Justice account of the Deepwater Horizon case.
- Rephrased remaining general method evaluations to remove “may/can” hedging where a definite evaluative point was intended.

## Review notes and remaining scope

- No atomic source-ledger row remains pending. The parent may run its separate quality review and merge the parent-managed MARK ledger.
- All five late additions are dated/scope-bounded where appropriate: ONS marriage/divorce trends refer to 2023 data, Census religion figures refer to 2021 self-identification, and the BRIN attendance statistic is the 2012 BSA NS-SEC analytic class measure.
- The social-policy perspective card asserting functionalist policy integrates society was removed because its cited material did not substantiate the claim. The remaining cards cover policy as a debated relationship between sociology and government, including verified positivist/applied, Marxist, feminist and postmodern positions.
- One unsupported parental-consent challenge was replaced with Atkinson’s documented Q-methodology study design. School observation/research cards now use claims supported by the linked sources.
- The source ledger verifies the factual claims, not the completeness of every possible teaching example. Coverage is recorded in `coverage-inventory.json`; the parent’s broader sample/quality review remains separate.

## Completeness reconciliation additions (2026-11-26)

Added six targeted cards in `source/completeness-more.txt` in response to the independent AQA coverage review. They cover practical access constraints in topic/method choice (4.1.3_b5); the Marriage (Same Sex Couples) Act 2013 as a concrete state family policy (4.2.2_b1); Weber’s account of scientific knowledge and religious explanation (4.2.5_b1); the ONS limitation that its CSEW crime statistics have no direct social-class breakdown (4.3.1_b2); a MoJ stop-and-search/population comparison with the report’s no-causal-inference caveat (4.3.1_b2); and HRW’s documented torture at Abu Ghraib (4.3.1_b3).

The six new fronts and exact source sections are recorded in `new-cards-for-review.tsv`; their source-ledger rows are explicitly `verified=no` pending the independent reviewer. Sources opened include the University of Essex research-design guide, legislation.gov.uk, Stanford Encyclopedia of Philosophy, ONS, the Ministry of Justice’s 2024 ethnicity and CJS report, and Human Rights Watch. The ONS card explicitly avoids treating occupation or income as a direct class measure. The MoJ card records the published group shares while preserving the report’s warning that unadjusted differences do not establish causation.

Draft compilation after these additions: 530 total cards, 30/30 AQA leaves covered, no missing leaves, no parser or card-format errors. It reports 34 cards still lacking independent source verification and the expected outstanding completeness-review marker; the six newly authored cards remain unverified until checked independently.

## Final targeted completeness additions (2026-11-26)

Added 29 atomic, dated or narrowly framed cards in `source/completeness-final.txt` to close the remaining named gaps in `completeness-independent.md`: ethnic attainment and selective access/opportunity vs outcome; a research-to-policy example; contemporary partnership and childbearing patterns; UK demographic trends since 1900; non-Christian traditions and global religious change; age/class group differences; and distinct criminal-justice agency roles. The source checklist is `new-final-for-review.tsv`; its 29 new stable keys are also present in `sources.tsv`, each marked `verified=no` pending independent review. This status is deliberate; authorship sources were opened and cited, but no independent verdict is claimed here.

The file was frozen after a successful draft compile: 559 cards, all 30 leaves covered, no parser or structural errors. Census affiliation is described as identity rather than belief/practice; the 2011–21 legally separated share is not described as a divorce rate; the attainment and grammar-school figures are bounded to their stated periods and measures. Independent review is pending for these 29 additions.

## Demographic explanations and crime-class evidence (2026-11-26)

Added nine cards in `source/completeness-explanations.txt` to test specific demographic explanations and a named class-related crime study. They include ONS’s proposed links between contraceptive access and lower births, education and later childbearing, vaccination and child mortality, sanitation and life expectancy, child mortality and family size, and the temporal association between EU expansion and increased EU net migration. For crime/class, the Chambliss Saints and Roughnecks study cards distinguish reported delinquency from police/community treatment and state the small, single-community sample limitation. The nine source records are in `new-explanations-for-review.tsv`; independent verdicts are mirrored in `sources.tsv`.

Final draft compile after independent review: 568 total cards, all 30 leaves covered, no format errors. The atomic source ledger has 540 rows for 540 current atomic cards; 539 are independently verified, with one practical-access card still pending review. Parent-managed MARK cards remain separate.

## Final source and wording reconciliation (2026-11-26)

Psychology independently checked the final divorce-law addition, all 29 completeness additions, all nine demographic/class explanations, and the latest four pattern corrections. A separate A-level reviewer supplied and opened direct evidence for four final precision repairs: (1) Weeks, Heaphy and Donovan’s primary text supports friendship-based kin-like networks beyond blood; (2) Wallis’s cult traits are now limited to loose structure, non-exclusivity and individual focus; (3) non-participant observation is described as offering fewer opportunities to discover participants’ meanings; and (4) ONS’s 2025 standardised mean age is explicitly labelled provisional. Divorce-law card is now a single causal relationship: ONS links the 1969 Act’s easing of divorce on separation to the 1972 rise.

Final draft build digest: `18f03388d12611f304657e8ec4ceb9feff139657a9f661871b50ce9181fae55a`. The build reports 569 cards across all 30 leaves with no errors. The ledger has a current stable-key row for every card, including the 28 MARK cards managed by the parent. Of 541 atomic cards, 540 are independently source-verified; one practical-access card remains `no` pending review. No publication or upload was performed by this author.

## Final duplicate-prompt removal (2026-11-26)

Removed ambiguous source card `ppp-soc-7192-content:51f8f0b49d03035260fb` from `source/completeness-more.txt`: “Which practical constraint” had several valid answers. The later school-gatekeeper access prompt remains as the specific practical constraint example. The cut and reason are recorded in `archive/cuts.md`. Final build after this cut: digest `d15f98870dee93246bbda6f254182770bbac05dd29093e6ba92f055f776bb2cb`, 568 cards, 30/30 leaves, zero errors. `sources.tsv` has exact keys for all 568 cards, including 28 parent-managed MARK entries; all 568 source rows are `yes`. This final snapshot supersedes the preceding 569-card/one-pending-entry snapshot.
