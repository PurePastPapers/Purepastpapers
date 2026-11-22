#!/usr/bin/env python3
"""Add official provenance to data/specs/AQA_GCSE_ENGLANG_8700.json from AQA's specification.

Usage: build_spec.py SPEC_PDF
  AQA-8700-SP-2015-v1.6.PDF (Version 1.6, March 2026). Other files are refused.

AQA GCSE English Language has no topic content: its specification assesses reading and writing
skills against assessment objectives AO1 to AO6 (pages 8 to 9 and 15 to 17), by question type.
Leaves are therefore the question types of each paper, with the AOs AQA assigns them. Existing
leaf ids are kept unchanged so saved ticks keep their meaning.
"""
import hashlib
import json
import sys
from pathlib import Path

SHA = '5b734aaeb8c2df0a9effaf48aa2d63195a2eb0c83ec1490bd1d6f199dc683db3'
REPO = Path(__file__).resolve().parents[2]
CONTENT = {
    'P1READ_A.1': ['Paper 1 Question 1: short form question, 4 marks.', 'AO1: identify and interpret explicit and implicit information and ideas.'],
    'P1READ_A.2': ['Paper 1 Question 2: longer form question, 8 marks, on language in a printed extract.', 'AO2: explain, comment on and analyse how writers use language and structure to achieve effects and influence readers.'],
    'P1READ_A.3': ['Paper 1 Question 3: longer form question, 8 marks, on structure across the whole source.', 'AO2.'],
    'P1READ_A.4': ['Paper 1 Question 4: extended question, 20 marks, critical evaluation of a statement about the source.', 'AO4: evaluate texts critically and support this with appropriate textual references.'],
    'P1WRITE_B.1': ['Paper 1 Question 5: descriptive or narrative writing, 40 marks (24 for content and organisation, 16 for technical accuracy).', 'AO5: communicate clearly, effectively and imaginatively. AO6: use a range of vocabulary and sentence structures with accurate spelling and punctuation.'],
    'P2READ_A.1': ['Paper 2 Question 1: short form question, 4 marks, on true statements from the sources.', 'AO1.'],
    'P2READ_A.2': ['Paper 2 Question 2: longer form question, 8 marks, a summary of differences or similarities across both sources.', 'AO1: select and synthesise evidence from different texts.'],
    'P2READ_A.3': ['Paper 2 Question 3: longer form question, 12 marks, on how a writer uses language.', 'AO2.'],
    'P2READ_A.4': ['Paper 2 Question 4: extended question, 16 marks, comparing writers\' ideas and perspectives and how they are conveyed.', 'AO3: compare writers\' ideas and perspectives, as well as how these are conveyed, across two or more texts.'],
    'P2WRITE_B.1': ['Paper 2 Question 5: writing to present a viewpoint, 40 marks (24 for content and organisation, 16 for technical accuracy).', 'AO5 and AO6.'],
}


def main():
    path = Path(sys.argv[1])
    if hashlib.sha256(path.read_bytes()).hexdigest() != SHA:
        sys.exit('refusing: not AQA GCSE English Language 8700 specification Version 1.6 (March 2026)')
    target = REPO / 'data/specs/AQA_GCSE_ENGLANG_8700.json'
    d = json.loads(target.read_text())
    order = []
    for s in d['sections']:
        for t in s['topics']:
            for p in t['points']:
                key = p['id'].replace('AQA_GCSE_ENGLANG_', '')
                p['content'] = CONTENT[key]
                p['official_reference'] = {'section': 'Assessments and assessment objectives', 'source_pages': [8, 9] if key.startswith('P1') else [9, 10]}
                order.append(p['id'])
    d.update({
        'specification_version': 'aqa-8700-v1.6-2026-03',
        'official_source_url': 'https://www.aqa.org.uk/subjects/english/gcse/english-8700/specification',
        'order_status': 'verified',
        'official_source': {'title': 'AQA GCSE English Language 8700 specification', 'version': 'Version 1.6', 'issue_date': 'March 2026',
                            'url': 'https://cdn.sanity.io/files/p28bar15/green/eb2b6cd029547c5409a8f2f31af857a159311acd.pdf',
                            'file_name': 'AQA-8700-SP-2015-v1.6.PDF', 'sha256': SHA, 'verified_at': '2026-11-22',
                            'note': 'First assessment June 2017. Two written papers of 80 marks, 1 hour 45 minutes each; spoken language is a separately reported non-exam endorsement.'},
        'approach': 'Official AQA assessment structure. English Language has no topic content: leaves are the question types of each paper. No textbook organisation has been supplied.',
        'notes': 'Leaf ids are unchanged from the earlier tree. Paper 1 Question 1 in the 2026 sample is four 1-mark multiple choice parts that still assess AO1 (A.1).',
        'point_order': order})
    target.write_text(json.dumps(d, ensure_ascii=False, indent=2) + '\n')
    print('leaves', len(order))


if __name__ == '__main__':
    main()
