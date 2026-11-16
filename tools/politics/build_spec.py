#!/usr/bin/env python3
"""Build data/specs/AQA_ALEVEL_POL_7152.json from AQA's official 7152 specification PDF.

Usage: build_spec.py SPEC_PDF   (AQA-7152-SP-2017.PDF, Version 1.2, 11 October 2022)

Leaves are the 32 official numbered content sections (3.1.1.1 ... 3.3.2.5), the finest
numbered level AQA prints. Each leaf keeps AQA's own key concepts and "analyse and
evaluate" focus bullets verbatim with the source pages, so tagging can cite them. The
six earlier runtime topic ids are kept as navigation groups; the 31 earlier leaf ids
migrate to the official leaves (their old 4.5 combined two official sections).
"""
import hashlib
import json
import re
import sys
from pathlib import Path

SPEC_SHA = '4c04788bde25edd5361da396f743943225ab5e8f8e198646ccb3a1fd76f37b68'
SPEC_URL = 'https://filestore.aqa.org.uk/resources/politics/specifications/AQA-7152-SP-2017.PDF'
REPO = Path(__file__).resolve().parents[2]

PAPERS = [('AQA_POL_SEC_P1', 'Paper 1', 'Government and politics of the UK', '71521'),
          ('AQA_POL_SEC_P2', 'Paper 2', 'Government and politics of the USA and comparative politics', '71522'),
          ('AQA_POL_SEC_P3', 'Paper 3', 'Political ideas', '71523')]
GROUPS = [('AQA_POL_UKGOV', '3.1.1', 'The government of the UK', 0),
          ('AQA_POL_UKPOL', '3.1.2', 'The politics of the UK', 0),
          ('AQA_POL_USGOV', '3.2.1', 'Government and politics of the USA', 1),
          ('AQA_POL_COMP', '3.2.2', 'Comparative politics', 1),
          ('AQA_POL_CORE', '3.3.1', 'Core ideologies', 2),
          ('AQA_POL_OTHER', '3.3.2', 'Other ideologies', 2)]
# Earlier leaf ids (code n.m within each group) -> official section codes.
LEGACY_GROUP_PREFIX = {'AQA_POL_UKGOV': ('1', '3.1.1'), 'AQA_POL_UKPOL': ('2', '3.1.2'), 'AQA_POL_USGOV': ('3', '3.2.1'),
                       'AQA_POL_COMP': ('4', '3.2.2'), 'AQA_POL_CORE': ('5', '3.3.1'), 'AQA_POL_OTHER': ('6', '3.3.2')}
leaf_id = lambda code: f'AQA_POL_{code}'


def parse(pdf_path):
    import pdfplumber
    sections, current, mode = {}, None, None
    with pdfplumber.open(pdf_path) as pdf:
        for index in range(9, 28):
            lines = (pdf.pages[index].extract_text() or '').splitlines()
            for raw in lines:
                line = raw.strip()
                if not line or line.startswith('Visit for the most') or line.startswith('AQA A-level Politics 7152.') \
                        or re.fullmatch(r'\d+ Visit for.*|.*administration \d+', line):
                    continue
                head = re.match(r'^(3\.[123]\.\d\.\d)\s+(.+)$', line)
                if head:
                    current = {'code': head.group(1), 'title': head.group(2).strip(), 'source_pages': [index + 1],
                               'key_concepts': [], 'focus': []}
                    sections[current['code']] = current
                    mode = None
                    continue
                if re.match(r'^3\.[123](\.\d)?\s', line):
                    current, mode = None, None
                    continue
                if current is None:
                    continue
                if index + 1 not in current['source_pages']:
                    current['source_pages'].append(index + 1)
                if line.lower().startswith('key concepts'):
                    mode = 'key_concepts'; continue
                if line == 'Focus':
                    mode = 'focus'; continue
                if mode is None:
                    continue
                if line.startswith('•'):
                    current[mode].append(line.lstrip('• ').strip())
                elif mode == 'focus' and not current['focus'] and not line.startswith('•'):
                    current['focus'].append(line)
                elif current[mode] and not line.startswith('Students') and current[mode][-1][-1:] not in '.:':
                    current[mode][-1] += ' ' + line   # a wrapped bullet or lead-in line
                else:
                    current[mode].append(line)        # a lead-in such as "Students should analyse and evaluate:"
    return sections


def main():
    pdf = Path(sys.argv[1])
    if hashlib.sha256(pdf.read_bytes()).hexdigest() != SPEC_SHA:
        raise SystemExit('Not the verified 7152 specification (Version 1.2, 11 October 2022)')
    found = parse(pdf)
    if len(found) != 32:
        raise SystemExit(f'Expected 32 official sections, found {len(found)}: {sorted(found)}')
    out_sections, order, legacy = [], [], {}
    for pid, pcode, ptitle, comp in PAPERS:
        topics = []
        for gid, gcode, gtitle, paper_index in GROUPS:
            if PAPERS[paper_index][0] != pid:
                continue
            points = []
            for code in sorted((c for c in found if c.startswith(gcode + '.')), key=lambda c: int(c.rsplit('.', 1)[1])):
                s = found[code]
                points.append({'id': leaf_id(code), 'code': code, 'title': s['title'],
                               'official_reference': {'section': code, 'component': f'7152/{comp[-1]}',
                                                      'source_pages': s['source_pages']},
                               'key_concepts': s['key_concepts'], 'focus': s['focus']})
                order.append(leaf_id(code))
                short, _ = LEGACY_GROUP_PREFIX[gid]
                n = code.rsplit('.', 1)[1]
                if gid == 'AQA_POL_COMP' and n in ('5', '6'):
                    legacy.setdefault(f'{gid}_{short}.5', []).append(leaf_id(code))
                else:
                    legacy[f'{gid}_{short}.{n}'] = [leaf_id(code)]
            topics.append({'id': gid, 'code': gcode, 'title': gtitle, 'kind': 'group', 'points': points})
        out_sections.append({'id': pid, 'code': pcode, 'title': f'{pcode}: {ptitle}',
                             'official_reference': {'component': comp}, 'topics': topics})
    spec = {'subject_id': 'AQA_ALEVEL_POL_7152', 'specification_version': 'aqa-7152-v1.2-2022-10-11',
            'official_source_url': SPEC_URL, 'order_status': 'verified',
            'official_source': {'title': 'AQA A-level Politics (7152) specification', 'version': 'Version 1.2',
                                'issue_date': '11 October 2022', 'first_teaching': 2017, 'first_exams': 2019,
                                'url': SPEC_URL, 'sha256': SPEC_SHA, 'verified_at': '2026-11-16',
                                'as_qualification': None},
            'approach': 'Official AQA content order. No textbook organisation has been supplied.',
            'components': {'7152/1': {'title': 'Government and politics of the UK', 'marks': 77, 'minutes': 120, 'sections': ['3.1']},
                           '7152/2': {'title': 'Government and politics of the USA and comparative politics', 'marks': 77, 'minutes': 120, 'sections': ['3.2']},
                           '7152/3': {'title': 'Political ideas', 'marks': 77, 'minutes': 120, 'sections': ['3.3']}},
            'notes': 'Runtime leaves are the 32 official numbered content sections (AQA_POL_3.x.x.x). key_concepts and focus are AQA wording. Linear A level: AQA gives no Year 12/13 split, so none is recorded.',
            'legacy_ids': legacy, 'point_order': order, 'sections': out_sections}
    target = REPO / 'data/specs/AQA_ALEVEL_POL_7152.json'
    target.write_text(json.dumps(spec, ensure_ascii=False, indent=2) + '\n')
    sys.path.insert(0, str(REPO / 'tools'))
    from write_spec_migrations import write_migrations
    write_migrations(REPO)
    print('wrote', target, len(order), 'official sections;', len(legacy), 'legacy ids')


if __name__ == '__main__':
    main()
