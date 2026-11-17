# OCR A Level Chemistry A H432 (with AS H032) question bank: handover

Live working notes for the OCR Chemistry A import (`OCR_ALEVEL_CHEM_H432`), run under
`docs/prompts/SUBJECT-QUESTION-BANK-AGENT.md`. Nothing is called complete while public
booklets are still queued.

## Run settings and owner decisions (17 November 2026)

Asked once, in one decision card, at the start of the run:

- **Rights: confirmed.** The owner confirmed OCR Chemistry A H432/H032 may be republished
  (the earlier OCR confirmation named Computer Science only, so this was asked again).
- **Scope:** A Level H432 plus AS H032, all public series June 2017 to June 2025 (incl. Nov 2020
  and Nov 2021) plus OCR's official sample assessment materials. Chemistry B (Salters, H033/H433)
  is a different qualification and is not in scope. The practical endorsement (H432/04) is not a
  written exam and is excluded.
- **Textbook:** none supplied. Navigation is the official OCR specification only
  (**textbook organisation awaiting owner**).
- Network: `www.ocr.org.uk` / `ocr.org.uk` are on the owner's personal "Purepastpapers"
  environment allowlist; all PDFs come from `www.ocr.org.uk/Images/`. Probed OK on 17 Nov.
- Reviews are `reviewer_type: model`, never teacher review.

## Checkpoint 1: inventory, extraction, spec (17 November 2026)

**Status: not yet published.**

- `tools/chem/inventory.py` reads OCR's public assessment page. 30 H432 booklets
  (Jun 2017/18/19, Nov 2020, Nov 2021, Jun 2022/23/24/25 x 3 components, + 3 samples) and
  22 AS H032 booklets (Jun 2016 to Jun 2025 incl. Nov 2020/21, + 2 samples) = 52. Each PDF is
  cached by SHA-256 in `../chem-research/sources`. Data sheets/booklets are recorded per paper.
- `tools/chem/extract.py` (adapted from `tools/cs/extract.py`): **all 52 booklets reconcile to
  their cover totals with 0 exceptions: 839 questions, 2,018 scored units, 4,240 marks.**
  A multiple choice question is one unit (1 mark). Fixes needed vs the CS pipeline: "Additional
  answer space if required" is printed inside question pages (not a stop marker); a question
  number alone is accepted in the true margin even when followed by a digit; sample papers
  repeat the number before each part ("18 (b)"); a tariff split by kerning ("[ 5 ]") and the
  diagonal SPECIMEN watermark in sample papers.
- `tools/chem/schemes.py`: all 2,018 units have scheme rows (2 pending checks below): 2,012 own
  rows, 1 parent row, 5 full-question fallback (OCR printed no label for that row).
- **Board corrections:** H432/01 June 2022 Q13 is withdrawn by OCR's post-exam correction
  (total becomes 99): recorded in `withdrawn_questions` and excluded. H032/01 June 2017 has an
  erratum notice (23(c) Kc units should read dm^6 mol^-2): recorded as `board_erratum` on that unit.
- `tools/chem/build_spec.py` verifies the 43 numbered sections of `data/specs/OCR_ALEVEL_CHEM_H432.json`
  against H432 spec v3.1 (May 2026) and adds OCR's lettered learning outcomes as content, the AS H032
  map (Modules 1 to 4 share section numbers) and A-level-only flags. Skill ids are unchanged.

### Reproduce

```sh
R=../chem-research
curl -A "Mozilla/5.0" -o $R/page.html https://www.ocr.org.uk/qualifications/as-and-a-level/chemistry-a-h032-h432-from-2015/assessment/
python3 tools/chem/inventory.py $R/page.html --sources $R/sources
for q in H432 H032; do python3 tools/chem/extract.py data/imports/chem/inventory/$q-inventory.json --sources $R/sources --output $R/candidates; done
curl -o $R/specs/171720-specification-accredited-a-level-gce-chemistry-a-h432.pdf https://www.ocr.org.uk/Images/171720-specification-accredited-a-level-gce-chemistry-a-h432.pdf
curl -o $R/specs/171750-specification-accredited-as-level-gce-chemistry-a-h032.pdf https://www.ocr.org.uk/Images/171750-specification-accredited-as-level-gce-chemistry-a-h032.pdf
python3 tools/chem/build_spec.py $R/specs/171720-*.pdf $R/specs/171750-*.pdf
```
