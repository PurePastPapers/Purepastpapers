#!/usr/bin/env python3
"""Write the Further Mathematics source inventories (9FM0 and 8FM0).

Status on 2026-11-19: qualifications.pearson.com was refused by the build host's
outbound proxy (HTTP CONNECT 403, a policy denial, not a transient failure), so no
Pearson exam-material PDF could be probed, downloaded or checksummed. These
inventories therefore record the EXPECTED public sources derived from the official
specifications, with every document marked unverified, plus the little public
evidence that could be seen through web search. Nothing here is an imported pack.

Rerun the Physics-style discovery (HEAD probes of Pearson exam-material file names,
tools/physics/discover.py) from a host that can reach qualifications.pearson.com,
then replace `unverified_host_blocked` rows with verified URLs, sizes and SHA256.
"""
import json
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
OUT = REPO / 'data/imports/fmaths/inventory'
CHECKED = '2026-11-19'
BLOCK = {
    'host': 'qualifications.pearson.com',
    'reason': 'HTTP CONNECT 403 from the build host outbound proxy (policy denial); retried, not transient',
    'checked_at': CHECKED,
}
UNVERIFIED = {'availability': 'unverified_host_blocked', 'url': None, 'sha256': None, 'bytes': None}

A_MODULES = [('01', 'CP', 'Core Pure Mathematics 1'), ('02', 'CP', 'Core Pure Mathematics 2'),
             ('3A', 'FP1', 'Further Pure Mathematics 1'), ('3B', 'FS1', 'Further Statistics 1'),
             ('3C', 'FM1', 'Further Mechanics 1'), ('3D', 'D1', 'Decision Mathematics 1'),
             ('4A', 'FP2', 'Further Pure Mathematics 2'), ('4B', 'FS2', 'Further Statistics 2'),
             ('4C', 'FM2', 'Further Mechanics 2'), ('4D', 'D2', 'Decision Mathematics 2')]
# Sittings already in the site's generated 9FM0 catalogue (June 2020 and June 2021 were cancelled).
A_SITTINGS = [(2019, 'June'), (2020, 'Autumn'), (2021, 'Autumn'), (2022, 'June'), (2023, 'June'), (2024, 'June'), (2025, 'June')]
AS_SITTINGS_EXPECTED = [(2018, 'June'), (2019, 'June'), (2022, 'June'), (2023, 'June'), (2024, 'June'), (2025, 'June')]
AS_SITTINGS_POSSIBLE = [(2020, 'Autumn'), (2021, 'Autumn')]


def docs():
    return {kind: dict(UNVERIFIED) for kind in ('question_paper', 'mark_scheme', 'examiner_report')}


def a_level():
    papers = []
    for year, series in A_SITTINGS:
        for code, module, title in A_MODULES:
            papers.append({'paper_id': f'EDX_9FM0_{year}_{series.upper()}_P{code.lstrip("0") if code in ("01", "02") else code}',
                           'qualification_code': '9FM0', 'level': 'A-Level', 'is_as': False, 'year': year, 'series': series,
                           'official_paper_code': f'9FM0/{code}', 'module_ids': [module], 'component_title': title,
                           'max_marks': 75, 'duration_minutes': 90, 'documents': docs(), 'imported': False})
    for code, module, title in A_MODULES:
        papers.append({'paper_id': f'EDX_9FM0_SAMPLE_{code}', 'qualification_code': '9FM0', 'level': 'A-Level', 'is_as': False,
                       'year': None, 'series': 'Official sample', 'official_paper_code': f'9FM0/{code}', 'module_ids': [module],
                       'component_title': title, 'max_marks': 75, 'duration_minutes': 90, 'is_official_sample': True,
                       'documents': {'sample_assessment': dict(UNVERIFIED)}, 'imported': False})
    return {
        'qualification': 'Pearson Edexcel A Level Further Mathematics 9FM0',
        'specification': 'Issue 4, June 2023', 'first_assessment': 'June 2019', 'checked_at': CHECKED,
        'blocked': BLOCK,
        'evidence_method': 'Expected components from the official specification; catalogue sittings from the site catalogue. '
                           'No Pearson file could be probed from this host.',
        'papers': papers,
    }


def as_level():
    papers = []
    for year, series in AS_SITTINGS_EXPECTED + AS_SITTINGS_POSSIBLE:
        possible = (year, series) in AS_SITTINGS_POSSIBLE
        base = {'qualification_code': '8FM0', 'level': 'AS', 'is_as': True, 'year': year, 'series': series,
                'sitting_status': 'possible_unverified' if possible else 'expected_unverified', 'imported': False}
        papers.append({**base, 'paper_id': f'EDX_8FM0_{year}_{series.upper()}_01', 'official_paper_code': '8FM0/01',
                       'module_ids': ['CP'], 'component_title': 'Core Pure Mathematics', 'max_marks': 80,
                       'duration_minutes': 100, 'documents': docs()})
        for n in range(21, 29):
            papers.append({**base, 'paper_id': f'EDX_8FM0_{year}_{series.upper()}_{n}', 'official_paper_code': f'8FM0/{n}',
                           'module_ids': [], 'component_title': 'Paper 2 option module (module not verified)',
                           'max_marks': None, 'duration_minutes': None, 'shared_duration': 'Paper 2 is 100 minutes for the two route modules',
                           'documents': docs()})
    return {
        'qualification': 'Pearson Edexcel AS Further Mathematics 8FM0',
        'specification': 'Issue 5, July 2025', 'first_assessment': 'June 2018', 'checked_at': CHECKED,
        'blocked': BLOCK,
        'route_vs_component': 'The specification defines Paper 2 routes 8FM0/2A–2K (two modules each, 80 marks, '
                              '1 h 40 min). Pearson publishes Paper 2 as per-module component files (8FM0_21, 8FM0_22, … '
                              'seen in public URLs). A route is therefore two components sat together, not a single '
                              'composite paper; the component-to-module mapping and per-component marks are not verified.',
        'public_evidence': [
            {'url': 'https://qualifications.pearson.com/content/dam/pdf/A-Level/Mathematics/2017/Exam-materials/8FM0_21_pef_20190815.pdf',
             'kind': 'examiner_report', 'component': '8FM0/21', 'series': 'June 2019', 'seen_via': 'web search result title', 'probed': False},
            {'url': 'https://qualifications.pearson.com/content/dam/pdf/A-Level/Mathematics/2017/Exam-materials/8FM0_22_pef_20190815.pdf',
             'kind': 'examiner_report', 'component': '8FM0/22', 'series': 'June 2019', 'seen_via': 'web search result title', 'probed': False},
        ],
        'papers': papers,
        'not_generated_as_catalogue': 'AS rows are not shown on the site until each sitting and component is verified.',
    }


if __name__ == '__main__':
    OUT.mkdir(parents=True, exist_ok=True)
    for name, data in (('9fm0-inventory.json', a_level()), ('8fm0-inventory.json', as_level())):
        (OUT / name).write_text(json.dumps(data, indent=1, ensure_ascii=False) + '\n')
        print(name, len(data['papers']), 'expected components')
