#!/usr/bin/env python3
"""Generate data/specs/EDX_ALEVEL_PHYS_9PH0.json from the official 9PH0 Issue 3 PDF.

Statement numbers, topic boundaries and source pages are read from the specification
PDF (checksum-verified); titles come from spec_statements.py. The build fails if any
statement 1-191 is missing from the concept-led pages or appears out of order.
"""
import argparse, hashlib, json, re
from pathlib import Path
import pdfplumber
from spec_statements import TOPICS, STATEMENTS, GROUPS, LEGACY, statement_id

SPEC_SHA = 'f91bef5283754e7cb3624dcb7b4a92b41b033225a5ececf1ce40a53d91ed90d3'
SPEC_URL = 'https://qualifications.pearson.com/content/dam/pdf/A Level/Physics/2015/Specification and sample assessments/pearsonedexcel-alevel-physics-spec.pdf'
SPEC_VERSION = 'pearson-9ph0-issue3-2018-11'
AS_SPEC_URL = 'https://qualifications.pearson.com/content/dam/pdf/A Level/Physics/2015/Specification and sample assessments/PearsonEdexcel-AS-Physics-Spec.pdf'


def locate(pdf_path):
    found, printed = {}, {}
    with pdfplumber.open(pdf_path) as pdf:
        for index, page in enumerate(pdf.pages):
            text = page.extract_text() or ''
            footer = re.search(r'Advanced GCE in Physics\s*-\s*(\d+)\s*$|^(\d+)\s+Pearson Edexcel Level 3 Advanced GCE', text, re.M)
            number = int(next(g for g in footer.groups() if g)) if footer else None
            if number is None or not 7 <= number <= 25:
                continue  # concept-led content pages only (the SHAP section repeats them)
            for line in text.splitlines():
                m = re.match(r'\s*(\d{1,3})\.\s+\S', line)
                if m and 1 <= int(m.group(1)) <= 191 and int(m.group(1)) not in found:
                    n = int(m.group(1))
                    if found and n != max(found) + 1:
                        continue
                    found[n] = index + 1; printed[n] = number
    missing = [n for n in range(1, 192) if n not in found]
    if missing:
        raise SystemExit(f'Statements not located in the specification: {missing}')
    return found, printed


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('spec_pdf', type=Path)
    p.add_argument('--repo', type=Path, default=Path(__file__).resolve().parents[2])
    a = p.parse_args()
    if hashlib.sha256(a.spec_pdf.read_bytes()).hexdigest() != SPEC_SHA:
        raise SystemExit('Specification revision differs from the verified Issue 3 PDF; review before rebuilding.')
    pages, printed = locate(a.spec_pdf)
    sections = [
        {'id': 'EDX_PHYS_SEC_AS', 'title': 'Year 1 and AS content (Topics 1–5)', 'code': 'AS',
         'note': 'Assessed in AS 8PH0 and A level 9PH0. Specification printed pages 8–16.', 'topics': []},
        {'id': 'EDX_PHYS_SEC_A2', 'title': 'Year 2 A level content (Topics 6–13)', 'code': 'A2',
         'note': 'Assessed in A level 9PH0 only. Specification printed pages 17–25.', 'topics': []},
    ]
    group_of = {n: g for g in GROUPS for n in g[2]}
    for topic_id, number, title, first, last in TOPICS:
        groups = []
        for gid, gtitle, members in GROUPS:
            if first <= members[0] <= last:
                assert all(first <= n <= last for n in members), gid
                groups.append({
                    'id': gid, 'title': gtitle, 'code': f'{members[0]}–{members[-1]}' if len(members) > 1 else str(members[0]),
                    'kind': 'group', 'statements': [str(n) for n in members],
                })
        topic = {'id': topic_id, 'code': f'Topic {number}', 'title': title, 'kind': 'topic',
                 'official_reference': {'topic_number': str(number), 'statements': [str(first), str(last)],
                                        'printed_pages': sorted({printed[n] for n in range(first, last + 1)})},
                 'groups': groups}
        sections[0 if number <= 5 else 1]['topics'].append(topic)
    # Runtime tree: official topic → stable navigation group → official statement leaf.
    spec_sections = []
    for section in sections:
        for topic in section['topics']:
            spec_sections.append({
                'id': topic['id'], 'code': topic['code'], 'title': topic['title'],
                'note': ('Year 1 / AS content' if int(topic['official_reference']['topic_number']) <= 5 else 'Year 2 A level content'),
                'official_reference': topic['official_reference'],
                'topics': [{
                    'id': g['id'], 'code': g['code'], 'title': g['title'], 'kind': 'group',
                    'points': [{
                        'id': statement_id(n), 'code': n, 'title': STATEMENTS[int(n)],
                        'introduced_year': 12 if int(n) <= 96 else 13,
                        'official_reference': {'reference_id': f'9PH0-ISSUE3-{n}', 'statement': n,
                                               'topic_number': topic['official_reference']['topic_number'],
                                               'source_pages': [pages[int(n)]], 'printed_pages': [printed[int(n)]],
                                               'qualifications': ['9PH0', '8PH0'] if int(n) <= 96 else ['9PH0'],
                                               **({'core_practical': True} if STATEMENTS[int(n)].startswith('Core practical') else {})},
                    } for n in g['statements']],
                } for g in topic['groups']],
            })
    order = [statement_id(n) for n in range(1, 192)]
    spec = {
        'subject_id': 'EDX_ALEVEL_PHYS_9PH0',
        'specification_version': SPEC_VERSION,
        'official_source_url': SPEC_URL.replace(' ', '%20'),
        'order_status': 'verified',
        'official_source': {
            'title': 'Pearson Edexcel Level 3 Advanced GCE in Physics (9PH0) specification',
            'issue': 'Issue 3', 'issue_date': 'November 2018', 'first_certification': 2017,
            'url': SPEC_URL, 'sha256': SPEC_SHA, 'verified_at': '2026-11-15',
            'as_qualification': {'code': '8PH0', 'issue': 'Issue 2', 'issue_date': 'March 2016', 'first_certification': 2016,
                                 'url': AS_SPEC_URL, 'content': 'Topics 1–5, statements 1–96 with identical numbering'},
            'approach': 'Concept-led content order (the SHAP context-led route reorders the same statements and is assessed by the same papers).',
            'components': {
                '9PH0/01': {'title': 'Advanced Physics I', 'marks': 90, 'minutes': 105, 'topics': [1, 2, 3, 6, 7, 8]},
                '9PH0/02': {'title': 'Advanced Physics II', 'marks': 90, 'minutes': 105, 'topics': [1, 4, 5, 9, 10, 11, 12, 13]},
                '9PH0/03': {'title': 'General and Practical Principles in Physics', 'marks': 120, 'minutes': 150, 'topics': list(range(1, 14))},
                '8PH0/01': {'title': 'Core Physics I', 'marks': 80, 'minutes': 90, 'topics': [1, 2, 3]},
                '8PH0/02': {'title': 'Core Physics II', 'marks': 80, 'minutes': 90, 'topics': [1, 4, 5]},
            },
            'notes': 'Statement numbers are strings. Runtime leaves are the 191 official statements (EDX_PHYS_Snnn). '
                     'Middle-level group ids are the earlier runtime skill ids, retained so saved learned ticks migrate.',
        },
        'legacy_ids': {**{g[0]: [statement_id(n) for n in g[2]] for g in GROUPS}, **{k: [statement_id(n) for n in v] for k, v in LEGACY.items()}},
        'point_order': order,
        'sections': spec_sections,
    }
    target = a.repo / 'data/specs/EDX_ALEVEL_PHYS_9PH0.json'
    target.write_text(json.dumps(spec, ensure_ascii=False, indent=2) + '\n')
    # Content-year view: Pearson lists statements 1-96 as the AS subset (printed pp. 8-16)
    # and 97-191 as the remainder (pp. 17-25). Teaching year, not exam entry.
    index_path = a.repo / 'data/curriculum/index.json'
    index = json.loads(index_path.read_text())
    index['mappings'] = [m for m in index['mappings'] if m.get('id') != 'pearson-9ph0-issue3-years'] + [{
        'subject_id': 'EDX_ALEVEL_PHYS_9PH0', 'id': 'pearson-9ph0-issue3-years', 'type': 'year', 'status': 'verified',
        'source_url': SPEC_URL.replace(' ', '%20'), 'reviewed_at': '2026-11-15', 'review_status': 'model_reviewed',
        'specification_version': SPEC_VERSION, 'source_sha256': SPEC_SHA,
        'evidence_note': 'Pearson 9PH0 Issue 3 concept-led content: the subset required for AS (8PH0) is statements 1-96 '
                         '(printed pages 8-16); the remainder of the A level is statements 97-191 (pages 17-25). '
                         'Every statement belongs to exactly one year, so all coverage is full.',
        'years': [
            {'id': 'pearson-9ph0-year-12', 'title': 'Year 12 (AS content, Topics 1–5)', 'year': 12,
             'coverage': [{'point_id': statement_id(n), 'extent': 'full'} for n in range(1, 97)]},
            {'id': 'pearson-9ph0-year-13', 'title': 'Year 13 (A level content, Topics 6–13)', 'year': 13,
             'coverage': [{'point_id': statement_id(n), 'extent': 'full'} for n in range(97, 192)]},
        ]}]
    index_path.write_text(json.dumps(index, ensure_ascii=False, indent=2) + '\n')
    import sys
    sys.path.insert(0, str(a.repo / 'tools'))
    from write_spec_migrations import write_migrations
    write_migrations(a.repo)
    print('wrote', target, sum(len(t['points']) for s in spec_sections for t in s['topics']), 'statements')


if __name__ == '__main__':
    main()
