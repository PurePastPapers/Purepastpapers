#!/usr/bin/env python3
"""Compile a reviewer's compact line sheet into the JSON review consumed by build.py.

One line per imported question (lines starting with # are comments):

    Q | bullets [; related bullets] | e/m/h | summary | difficulty basis

Bullets are official content-bullet codes within the booklet's option, e.g. 2.3 or
INT.1 (1H), 4.2 (2H.2), B.1.2 or D.3.1 (option 33).
"""
import json
import re
import sys
from pathlib import Path

DIFF = {'e': 'easy', 'm': 'medium', 'h': 'hard'}
OPTION_SECTION = {'1H': 'EDX_HIST_SEC_P1', '2H': 'EDX_HIST_SEC_P2', '33': 'EDX_HIST_SEC_P3'}


def leaves(spec, component):
    section = next(s for s in spec['sections'] if s['id'] == OPTION_SECTION[component])
    return {p['code']: p['id'] for t in section['topics'] for p in t['points']}


def compile_sheet(sheet, candidate, codes):
    out = {}
    for n, raw in enumerate(sheet.read_text().splitlines(), 1):
        line = raw.strip()
        if not line or line.startswith('#'):
            continue
        cells = [c.strip() for c in line.split('|')]
        if len(cells) != 5:
            raise ValueError(f'{sheet.name}:{n}: expected 5 fields, got {len(cells)}')
        q, tags, diff, summary, basis = cells
        main, _, rel = tags.partition(';')
        primary = [c.strip() for c in main.split(',') if c.strip()]
        related = [c.strip() for c in rel.split(',') if c.strip()]
        if not primary or any(c not in codes for c in primary + related):
            raise ValueError(f'{sheet.name}:{n}: unknown or missing bullet codes {primary + related}')
        if q in out:
            raise ValueError(f'{sheet.name}:{n}: Q{q} reviewed twice')
        out[q] = {'number': q, 'bullets': primary, 'related': [c for c in related if c not in primary],
                  'spec_ids': [codes[c] for c in primary], 'related_spec_ids': [codes[c] for c in related if c not in primary],
                  'difficulty': DIFF[diff], 'summary': summary, 'difficulty_basis': basis, 'review_status': 'model_reviewed'}
    publishable = [q['number'] for q in candidate['questions'] if not q.get('copyright_removed_content')]
    if set(out) != set(publishable):
        raise ValueError(f'{sheet.name}: reviewed {sorted(out)} but publishable questions are {publishable}')
    return [out[q] for q in publishable]


def main():
    research = Path(sys.argv[1])
    repo = Path(__file__).resolve().parents[2]
    spec = json.loads((repo / 'data/specs/EDX_ALEVEL_HIST_9HI0.json').read_text())
    for sheet in sorted((research / 'review-src').glob(sys.argv[2] if len(sys.argv) > 2 else '*.txt')):
        pid = sheet.stem
        candidate = json.loads((research / 'candidates' / f'{pid}.json').read_text())
        review = {'paper_id': pid, 'reviewer_type': 'model', 'review_status': 'model_reviewed',
                  'source_sha256': candidate['source_sha256'], 'tagging_basis': 'Pearson 9HI0 Issue 4 content bullets (Route H options)',
                  'questions': compile_sheet(sheet, candidate, leaves(spec, pid.rsplit('_', 1)[1]))}
        target = research / 'reviews' / f'{pid}.json'
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(json.dumps(review, ensure_ascii=False, indent=1) + '\n')
        print(pid, len(review['questions']), 'questions reviewed')


if __name__ == '__main__':
    main()
