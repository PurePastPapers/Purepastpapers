#!/usr/bin/env python3
"""Remove dependency links that the wording check matched by mistake (2026-11-19).

Each unit below was checked by eye against its printed crop. The dependency regexes in
tools/parts/refine.py and tools/chem/build.py matched either

* "You may draw a diagram to help with your answer" / "State the unit with your answer"
  (an instruction, not a link to an earlier part), or
* a graph, curve or equation the student draws in the SAME part ("Plot a graph ... Use
  your graph"), which needs nothing from an earlier part.

The regexes now skip both cases, so a rebuild gives the same result; this script fixes the
committed packs without the private source PDFs. Re-running it is harmless.
"""
import json
import pathlib

ROOT = pathlib.Path(__file__).resolve().parents[2]
FALSE = {
    # "... to help with your answer" / "State the unit with your answer"
    'EDX_1BI0_2020_NOVEMBER_1F_Q07_U05', 'EDX_1PH0_2020_NOVEMBER_2H_Q09_U03', 'EDX_1PH0_2020_NOVEMBER_2H_Q10_U04',
    'EDX_1PH0_2021_NOVEMBER_1F_Q03_U02', 'EDX_1PH0_2021_NOVEMBER_1F_Q07_U03', 'EDX_1PH0_2021_NOVEMBER_1F_Q07_U06',
    'EDX_1PH0_2022_JUNE_1H_Q07_U02', 'EDX_1PH0_2024_JUNE_1H_Q05_U03', 'EDX_1PH0_2024_JUNE_1H_Q10_U05',
    'EDX_1PH0_2025_JUNE_1H_Q10_U04', 'EDX_1SC0_2020_NOVEMBER_2PH_Q06_U03', 'EDX_1SC0_2022_JUNE_1PH_Q04_U02',
    'EDX_1SC0_2024_JUNE_1PH_Q03_U03',
    # drawn or written in the same part
    'OCR_H032_2022_JUNE_01_Q24_a_ii', 'OCR_H432_2020_NOVEMBER_03_Q05_c', 'OCR_H432_2025_JUNE_01_Q18_c_ii',
    'OCR_H432_SAMPLE_01_Q17_b',
}

changed = 0
for path in sorted((ROOT / 'data/packs').glob('*/*.json')):
    pack = json.loads(path.read_text())
    touched = False
    for question in pack.get('questions', []):
        if question.get('question_id') in FALSE and question.pop('depends_on_question_ids', None) is not None:
            reasons = question.get('provenance', {}).get('context_reasons')
            if reasons and 'builds on the previous answer' in reasons:
                reasons.remove('builds on the previous answer')
            touched = True
            changed += 1
    if touched:
        path.write_text(json.dumps(pack, ensure_ascii=False, indent=2) + '\n')
print(f'removed {changed} false dependencies')
