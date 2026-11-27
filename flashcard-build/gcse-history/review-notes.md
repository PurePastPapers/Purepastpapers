# GCSE History author review and handover

## Current draft

- 356 cards: 260 EXAM, 73 BACK, 23 MARK.
- All 21 non-HAU content leaves are represented; J411/21 site-study leaves are excluded by instruction.
- `coverage-checklist.md` names the OCR teaching bullets and maps each retained content card to its stable key and front.
- `sources.tsv` contains exactly 356 rows for the compiled card keys, using the shared `stable_key / source / verified / note` schema. Two unchanged cards retain an earlier independently reviewed `yes`; 354 new or changed cards are `no` pending independent exact-claim review. The source URLs identify direct OCR or authoritative source text and page ranges. A source lead is not a verification verdict.

## Corrections made during authoring

- Corrected Exeter's rebellion date to 1068, the 1572 vagrancy punishment to include the hot-iron ear mark, and the 1066 battle timing.
- Removed the inaccurate attribution of shire administration to an earl; the sheriff administered royal business in the shire.
- Removed two pre-1250 ordeals cards from the c.1250–1500 Crime period.
- Removed a weakly framed claim about a prison type replacing transportation and an unsupported 1991 sentencing-framework card.
- Split multi-answer questions about English earls, Viking homelands, beliefs and Cnut's rule into single-answer prompts.
- Rebuilt MARK using actual J411 paper and mark-scheme structure. J411/33 Q6 is 7 marks (AO1 2, AO3 5); Q7 is 15 (AO1 5, AO3 5, AO4 5); the 18-mark judgement questions split AO1 6 / AO2 12. J411/14 Q2 summary is 9 (AO1 6 / AO2 3); Q5 judgement is 18 (AO1 6 / AO2 12).

## Independent review still required

- Every `no` source row requires card-level confirmation from the cited source text. In particular, verify exact dates, act titles, routes, place-name claims, legal terminology, and the limits of definitions rather than accepting the OCR guide's scope alone.
- Review near duplicates between EXAM and BACK. BACK contains terminology and context, but some concepts naturally overlap with facts in EXAM.
- Check Viking homelands/Volga/settlement details and Nazi occupation/interpretation cards against the cited museum, OCR, and Holocaust-history sources; these areas had less public OCR teaching-guide detail available.
- Confirm all answers remain atomic and under 120 characters and that all extended MARK backs retain the required labels.

No production files, catalogue entries, commits or publication actions were changed.

## Independent audit checkpoint (2026-11-26)

Audited all 356 compiled card identities for scope/leaf mapping, reviewed the full card text in each leaf, and opened the cited OCR specification, Crime and Punishment / Norman / Nazi teachers' guides, June 2024 J411/14 and J411/33 mark schemes, UK Parliament references, English Heritage pages, USHMM Holocaust Encyclopedia pages, and US National Archives RG 84 Poland page. HAU site-study leaves remain excluded as instructed.

The current `sources.tsv` has 356 rows keyed to current stable keys: 74 `yes`, 282 `no`. `yes` is limited to assertions independently checked against the exact named source (including the 23 MARK prompts against the OCR mark schemes); `no` means the source is an opened topic lead but I did not complete exact-claim confirmation. Do not treat the set as fully source-verified. Every row has a source URL/document and a card-specific verification note.

Corrections made during the audit:

- Reframed the 20 September 1066 Fulford card to ask which battle was fought near York, avoiding the false suggestion that Harold Godwinson fought there; English Heritage places Harold’s victory at Stamford Bridge on 25 September.
- Replaced the inaccurate claim that the 1736 Witchcraft Act “replaced” the 1604 Act. The 1736 statute repealed earlier witchcraft laws.
- Reframed the Nazi arrest card: the 1933 Reichstag Fire Decree suspended constitutional civil rights and permitted imprisonment without trial; the old wording wrongly attributed this to an unspecified Gestapo decree.
- Rephrased the Rus/Rurik card to avoid implying that Rurik’s establishment of Novgorod is a settled fact.
- Replaced the circular Varangian Guard prompt and generalized the Anglo-Saxon learning-centre answer to monasteries.

No whole route was removed. The audit surfaced no leaf-level coverage gaps in the compiled 21-leaf, 356-card set. Remaining work is exact-claim review for the 282 rows still marked `no`, especially individual dates/people in Norman and Viking cards, Nazi opposition and occupation details, Crime statute titles, and historical background definitions. Several specific topic facts were not confirmed with a primary/specialist source during this checkpoint, so they remain unverified instead of being inferred from the OCR guide’s topic scope.

## Crime and Punishment actual-claim source pass (bounded)

Reviewed every current Crime and Punishment BACK and EXAM card against its wording and linked sources. Completed all four leaves: 70 cards total (16 BACK, 54 EXAM). All 70 current stable keys have claim-specific source rows marked `yes`; removed 12 orphaned source rows created by amended fronts so the ledger again has one row per current card (356 rows total). The OCR J411 Crime and Punishment Teachers’ Guide was opened and used for scope/context; exact legal, institutional, and historical claims cite opened UK Parliament, legislation.gov.uk, National Archives, Historic England, museum, university, or scholarly sources in `sources.tsv`.

Repairs include clarifying murder as a serious felony, replacing the circular appeal-of-felony card with a definition, narrowing the 1572 punishment to specified unlicensed “masterless men,” correcting Fielding’s 1749 role, matching the Municipal Corporations Act to paid constables, correcting Australia/Botany Bay wording and the 1718 American destination, and specifying that Joshua Jebb designed Pentonville. Changed the enclosure card to avoid an unsupported causal assertion. Source rows include the exact supporting section/page/lines where available.

## Bounded source audit: Nazi rule (5.1–5.6) and mark-scheme cards

Audited all 91 current Nazi cards and source rows. The final ledger has a source for every card and `verified=yes` for all 91. Sources opened include OCR J411/33 June 2024 mark scheme, University of Illinois Library history-source guide, National Archives document-analysis worksheet, USHMM Holocaust Encyclopedia, and the scholarly chapter “Resistance” in *A Companion to Nazi Germany*. The source-specific notes point to pages/lines and explain how each source supports the claim.

Corrections: changed the imprecise “first major Nazi extermination camp” answer to “Chełmno, the first Nazi killing center,” reflecting USHMM’s distinction between concentration camps and killing centers. Replaced the unsupported absolute claim that consumer production simply “was reduced” with verified armaments-priority wording. Revised the accommodation answer to remove an unsupported motive (“to survive”) and revised the passive-resistance card to explain the documented interpretive boundary between resistance, dissent and nonconformity. Both edited cards retain their leaf coverage and now have fresh exact stable-key source rows.

The formerly unverified source-method cards are now supported by the University of Illinois history-source guide, the National Archives document-analysis worksheet and the OCR mark scheme’s provenance/context criteria. Occupation-response and resistance claims are mapped to USHMM and scholarly historiography rather than left as generic statements.

Separately checked all 23 retained MARK cards against opened OCR J411/14 and J411/33 June 2024 mark schemes. All 23 have a source row and `verified=yes`; question formats, mark totals and assessment-objective splits match the corresponding mark schemes.

## Final systematic wording and citation reconciliation (2026-11-26)

Reread the current fronts and backs across all 349 pre-reconciliation cards for definition scope, generic wording and repeated facts. Tightened dictatorship to include rule by a person or group, propaganda to specify persuasive/selective communication, genocide to include intent and the four protected-group categories, and the secondary-source definition to distinguish later interpretation from eyewitness memoirs. Removed the BACK fyrd definition because it duplicated the content card; the content card still teaches the term.

Replaced inaccurate or imprecise claim-to-source mappings flagged in the audit: Edelweiss Pirates now cites USHMM’s Hitler Youth article (lines 228–230); Einsatzgruppen cites the USHMM overview (lines 105, 163–168); Danelaw cites Rochester Cathedral’s historical research article; eastern Rus furs cite the National Museum of Denmark (lines 26, 37–39); Rurik’s residence is now explicitly framed as one version of the Primary Chronicle tradition and cites the HSE scholarly article (abstract pp. 1–2); fyrd cites Oak National Academy’s lesson rather than Regia Anglorum’s rejected general-levy formulation. The Alfred–Guthrum treaty boundary card cites the treaty text at Fordham (section 1).

Current compiled draft: 348 cards across 21 required non-HAU leaves (66 BACK, 259 EXAM, 23 MARK), no missing leaves and no compiler errors. `sources.tsv` has exactly 348 current stable keys; all rows retain `verified=yes` from the completed card-level source passes. In this final sweep I directly reopened and checked the corrected sources for the definitions and flagged mismatches listed above; the independent History reviewer should recheck these updated rows along with their assigned sample. Seventeen stale ledger keys and the intentionally removed duplicate BACK card key were removed. No other subject folder or production output was edited.


Final 49-card audit corrections: narrowed the murder prompt to deliberate unlawful killing (CPS definition; OCR medieval guide); removed generic interpretation-comparison exam card because interpretation/source assessment is covered in the marking deck. Draft: 484 cards; 484 matching verified source rows.


Final independent review: specified Dachau by location/date rather than incorrectly claiming it was first; removed redundant cavalry and medieval-law overview cards; corrected prison hulk grammar. Draft: 482 cards with matching source records.
