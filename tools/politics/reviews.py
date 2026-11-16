#!/usr/bin/env python3
"""Compile a reviewer's compact line sheet into the JSON review consumed by build.py.

One line per publishable question (lines starting with # are comments):

    Q | sections [; prerequisite sections] | e/m/h | summary | difficulty basis

Sections are official AQA 7152 section codes such as 3.1.2.3. A question whose
public source was copyright-removed is not reviewed (it is excluded from the build).
"""
import json
import re
import sys
from pathlib import Path

DIFF = {'e': 'easy', 'm': 'medium', 'h': 'hard'}
CODE = re.compile(r'3\.[123]\.[12]\.[1-8]')


def compile_sheet(sheet, candidate, valid):
    out = {}
    for n, raw in enumerate(sheet.read_text().splitlines(), 1):
        line = raw.strip()
        if not line or line.startswith('#'):
            continue
        cells = [c.strip() for c in line.split('|')]
        if len(cells) != 5:
            raise ValueError(f'{sheet.name}:{n}: expected 5 fields, got {len(cells)}')
        q, tags, diff, summary, basis = cells
        main, _, pre = tags.partition(';')
        sections, prereqs = CODE.findall(main), CODE.findall(pre)
        if not sections or any(c not in valid for c in sections + prereqs):
            raise ValueError(f'{sheet.name}:{n}: unknown or missing section codes')
        if q in out:
            raise ValueError(f'{sheet.name}:{n}: Q{q} reviewed twice')
        out[q] = {'number': q, 'sections': sections, 'prerequisites': [c for c in prereqs if c not in sections],
                  'difficulty': DIFF[diff], 'summary': summary, 'difficulty_basis': basis, 'review_status': 'model_reviewed'}
    publishable = [q['number'] for q in candidate['questions'] if not q.get('copyright_removed_content')]
    if set(out) != set(publishable):
        raise ValueError(f'{sheet.name}: reviewed {sorted(out)} but publishable questions are {publishable}')
    return [out[q] for q in publishable]


def main():
    research = Path(sys.argv[1])
    repo = Path(__file__).resolve().parents[2]
    spec = json.loads((repo / 'data/specs/AQA_ALEVEL_POL_7152.json').read_text())
    valid = {p['code'] for s in spec['sections'] for t in s['topics'] for p in t['points']}
    for sheet in sorted((research / 'review-src').glob(sys.argv[2] if len(sys.argv) > 2 else '*.txt')):
        pid = sheet.stem
        candidate = json.loads((research / 'candidates' / f'{pid}.json').read_text())
        review = {'paper_id': pid, 'reviewer_type': 'model', 'review_status': 'model_reviewed',
                  'source_sha256': candidate['source_sha256'], 'tagging_basis': 'AQA 7152 specification section codes (3.x.x.x)',
                  'questions': compile_sheet(sheet, candidate, valid)}
        target = research / 'reviews' / f'{pid}.json'
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(json.dumps(review, ensure_ascii=False, indent=1) + '\n')
        print(pid, len(review['questions']), 'questions reviewed')


if __name__ == '__main__':
    main()
