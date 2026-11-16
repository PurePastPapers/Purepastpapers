#!/usr/bin/env python3
"""Build data/specs/AQA_ALEVEL_GEOG_7037.json from AQA's official specifications.

Usage: build_spec.py SPEC_7037_PDF SPEC_7036_PDF
  AQA-7037-SP-2016.PDF (Version 1.2, 2 September 2019) and
  AQA-7036-SP-2016.PDF (AS, Version 1.0, 2 June 2016). Other revisions are refused.

Leaves are AQA's finest numbered content sections (3.1.1.1 ... 3.2.5.7, with
3.2.1.5.1 and 3.2.2.2.1-2), the fieldwork requirements (3.3.1) and the geographical
skills checklist (3.4.1, 3.4.2.1-5). Each leaf keeps AQA's content text verbatim with
its source pages. Optional topics are marked kind "option" with the paper section
they are chosen in, so routes are never merged into one common pool.

AS 7036 numbers the same content differently (AS 3.1.2 Coasts = A-level 3.1.3).
Each A-level leaf records its AS code and the normalised text similarity of the two
sections, so AS questions are tagged to the A-level leaf only where the content is
the same. The earlier seeded leaf ids migrate to official leaves.
"""
import difflib
import hashlib
import json
import re
import sys
from pathlib import Path

SPEC_SHA = 'f7fac6d21e535784f1fb349797e4ee8501b4b885dbf264fa916386713b7fca72'
AS_SHA = 'f907ae02ab4006ad3e54644c3af429ece0a36d7cf86be553a9991c52217d4c51'
SPEC_URL = 'https://filestore.aqa.org.uk/resources/geography/specifications/AQA-7037-SP-2016.PDF'
AS_URL = 'https://filestore.aqa.org.uk/resources/geography/specifications/AQA-7036-SP-2016.PDF'
REPO = Path(__file__).resolve().parents[2]
leaf_id = lambda code: f'AQA_GEOG_{code}'

# (section id, label, title, component)
PAPERS = [('AQA_GEOG_SEC_PHYS', 'Paper 1', 'Physical geography', '7037/1'),
          ('AQA_GEOG_SEC_HUM', 'Paper 2', 'Human geography', '7037/2'),
          ('AQA_GEOG_SEC_SKILLS', 'Skills', 'Geographical skills and fieldwork', None)]
# (group id kept from the seeded spec, code, title, paper index, kind, route note)
GROUPS = [('AQA_GEOG_WC', '3.1.1', 'Water and carbon cycles', 0, 'group', 'Paper 1 Section A (compulsory)'),
          ('AQA_GEOG_HD', '3.1.2', 'Hot desert systems and landscapes', 0, 'option', 'Paper 1 Section B option (one of hot deserts, coasts, glaciers)'),
          ('AQA_GEOG_COAST', '3.1.3', 'Coastal systems and landscapes', 0, 'option', 'Paper 1 Section B option (one of hot deserts, coasts, glaciers)'),
          ('AQA_GEOG_GLAC', '3.1.4', 'Glacial systems and landscapes', 0, 'option', 'Paper 1 Section B option (one of hot deserts, coasts, glaciers)'),
          ('AQA_GEOG_HAZ', '3.1.5', 'Hazards', 0, 'option', 'Paper 1 Section C option (one of hazards, ecosystems under stress)'),
          ('AQA_GEOG_ECO', '3.1.6', 'Ecosystems under stress', 0, 'option', 'Paper 1 Section C option (one of hazards, ecosystems under stress)'),
          ('AQA_GEOG_GS', '3.2.1', 'Global systems and global governance', 1, 'group', 'Paper 2 Section A (compulsory)'),
          ('AQA_GEOG_CP', '3.2.2', 'Changing places', 1, 'group', 'Paper 2 Section B (compulsory)'),
          ('AQA_GEOG_URB', '3.2.3', 'Contemporary urban environments', 1, 'option', 'Paper 2 Section C option (one of urban, population, resources)'),
          ('AQA_GEOG_POP', '3.2.4', 'Population and the environment', 1, 'option', 'Paper 2 Section C option (one of urban, population, resources)'),
          ('AQA_GEOG_RES', '3.2.5', 'Resource security', 1, 'option', 'Paper 2 Section C option (one of urban, population, resources)'),
          ('AQA_GEOG_FW', '3.3', 'Geography fieldwork', 2, 'skill', 'A-level: assessed by the NEA, not the written papers. AS: assessed in Paper 2 Section B.'),
          ('AQA_GEOG_SK', '3.4', 'Geographical skills checklist', 2, 'skill', 'Assessed across all written papers')]
# A-level group code -> AS 7036 group code (same named content, different numbering).
AS_GROUP = {'3.1.1': '3.1.1', '3.1.3': '3.1.2', '3.1.4': '3.1.3', '3.2.2': '3.2.1', '3.1.5': '3.3.1',
            '3.2.3': '3.3.2', '3.4': '3.5'}
# AS fieldwork (7036 3.4) is examined in AS Paper 2 and covers the enquiry stages that
# the A level assesses only through its NEA, so it is its own scoped leaf, not 3.3.1.
AS_FIELDWORK = 'AQA_GEOG_AS_3.4'
LEAF = re.compile(r'^(3\.[12]\.\d\.\d(?:\.\d)?|3\.3\.1|3\.4\.1|3\.4\.2\.\d)\s+(.+)$')
AS_LEAF = re.compile(r'^(3\.[123]\.\d\.\d(?:\.\d)?|3\.5\.1|3\.5\.2\.\d)\s+(.+)$')
STOP = re.compile(r'^(3\.\d(\.\d){0,2})\s+[A-Z]')
NOISE = re.compile(r'^(AQA (AS|A-level) Geography 703[67]\.|Visit aqa\.org\.uk/703[67]|\d+ Visit aqa)|administration \d+$')
LEGACY = {
    'AQA_GEOG_WC_1.1': ['3.1.1.1'], 'AQA_GEOG_WC_1.2': ['3.1.1.2'], 'AQA_GEOG_WC_1.3': ['3.1.1.2'],
    'AQA_GEOG_WC_1.4': ['3.1.1.3'], 'AQA_GEOG_WC_1.5': ['3.1.1.3'], 'AQA_GEOG_WC_1.6': ['3.1.1.4'],
    'AQA_GEOG_WC_1.7': ['3.1.1.6'],
    'AQA_GEOG_HD_2.1': ['3.1.2.1'], 'AQA_GEOG_HD_2.2': ['3.1.2.2'], 'AQA_GEOG_HD_2.3': ['3.1.2.3'], 'AQA_GEOG_HD_2.4': ['3.1.2.4'],
    'AQA_GEOG_COAST_3.1': ['3.1.3.1'], 'AQA_GEOG_COAST_3.2': ['3.1.3.2'], 'AQA_GEOG_COAST_3.3': ['3.1.3.3'],
    'AQA_GEOG_COAST_3.4': ['3.1.3.4'], 'AQA_GEOG_COAST_3.5': ['3.1.3.6'],
    'AQA_GEOG_GLAC_4.1': ['3.1.4.1', '3.1.4.2'], 'AQA_GEOG_GLAC_4.2': ['3.1.4.3'], 'AQA_GEOG_GLAC_4.3': ['3.1.4.4'],
    'AQA_GEOG_GLAC_4.4': ['3.1.4.5'],
    **{f'AQA_GEOG_HAZ_5.{n}': [f'3.1.5.{n}'] for n in range(1, 8)},
    **{f'AQA_GEOG_ECO_6.{n}': [f'3.1.6.{n}'] for n in range(1, 6)},
    **{f'AQA_GEOG_GS_7.{n}': [f'3.2.1.{n}'] for n in range(1, 5)},
    'AQA_GEOG_GS_7.5': ['3.2.1.5', '3.2.1.5.1'],
    'AQA_GEOG_CP_8.1': ['3.2.2.1'], 'AQA_GEOG_CP_8.2': ['3.2.2.2.1', '3.2.2.2.2'], 'AQA_GEOG_CP_8.3': ['3.2.2.4'],
    'AQA_GEOG_URB_9.1': ['3.2.3.1', '3.2.3.2'], 'AQA_GEOG_URB_9.2': ['3.2.3.3'], 'AQA_GEOG_URB_9.3': ['3.2.3.4', '3.2.3.5'],
    'AQA_GEOG_URB_9.4': ['3.2.3.6', '3.2.3.7'], 'AQA_GEOG_URB_9.5': ['3.2.3.8'],
    'AQA_GEOG_POP_10.1': ['3.2.4.2'], 'AQA_GEOG_POP_10.2': ['3.2.4.3'], 'AQA_GEOG_POP_10.3': ['3.2.4.4'],
    'AQA_GEOG_POP_10.4': ['3.2.4.5', '3.2.4.6'],
    'AQA_GEOG_RES_11.1': ['3.2.5.1', '3.2.5.2'], 'AQA_GEOG_RES_11.2': ['3.2.5.3'], 'AQA_GEOG_RES_11.3': ['3.2.5.4'],
    'AQA_GEOG_RES_11.4': ['3.2.5.5', '3.2.5.6'],
    'AQA_GEOG_SK_12.1': ['3.4.1'], 'AQA_GEOG_SK_12.2': ['3.4.2.4'], 'AQA_GEOG_SK_12.3': ['3.4.2.2', '3.4.2.3'],
}


def parse(pdf_path, pages, leaf_re, stop_codes, headings_only=frozenset()):
    import pdfplumber
    found, current = {}, None
    with pdfplumber.open(pdf_path) as pdf:
        for index in pages:
            for raw in (pdf.pages[index].extract_text() or '').splitlines():
                line = raw.strip()
                if not line or NOISE.search(line):
                    continue
                head = leaf_re.match(line)
                if head and head.group(1) not in headings_only:
                    current = {'code': head.group(1), 'title': head.group(2).strip(), 'source_pages': [index + 1], 'content': []}
                    found[current['code']] = current
                    continue
                if STOP.match(line) and (head is None or head.group(1) in headings_only) or any(line.startswith(c + ' ') for c in stop_codes):
                    current = None
                    continue
                if current is None:
                    continue
                if index + 1 not in current['source_pages']:
                    current['source_pages'].append(index + 1)
                content = current['content']
                if line.startswith('•') or not content or content[-1][-1:] in '.:':
                    content.append(line)
                else:
                    content[-1] += ' ' + line   # wrapped line
    return found


def normalise(lines):
    return re.sub(r'[^a-z0-9 ]+', ' ', ' '.join(lines).lower()).split()


def main():
    pdf, as_pdf = Path(sys.argv[1]), Path(sys.argv[2])
    if hashlib.sha256(pdf.read_bytes()).hexdigest() != SPEC_SHA:
        raise SystemExit('Not the verified 7037 specification (Version 1.2, 2 September 2019)')
    if hashlib.sha256(as_pdf.read_bytes()).hexdigest() != AS_SHA:
        raise SystemExit('Not the verified 7036 specification (Version 1.0, 2 June 2016)')
    # 7037 content runs p11-p42; NEA guidance (3.3.2 onwards) is not exam content.
    found = parse(pdf, range(10, 42), LEAF, ['3.3.2'], {'3.2.2.2'})
    as_found = parse(as_pdf, range(8, 22), AS_LEAF, [], {'3.2.1.2'})
    # AS fieldwork (3.4) has no numbered leaf; capture it as one block.
    as_found.update(parse(as_pdf, range(18, 20), re.compile(r'^(3\.4)\s+(Geography fieldwork investigation)$'), ['3.5']))
    expected = 6 + 6 + 6 + 7 + 7 + 7 + 8 + 5 + 9 + 7 + 7 + 1 + 6
    if len(found) != expected:
        raise SystemExit(f'Expected {expected} official leaves, found {len(found)}: {sorted(found)}')
    out_sections, order, legacy, as_map = [], [], {}, {}
    for pindex, (pid, plabel, ptitle, comp) in enumerate(PAPERS):
        topics = []
        for gid, gcode, gtitle, gpaper, kind, route in GROUPS:
            if gpaper != pindex:
                continue
            codes = [c for c in found if c == gcode + '.1' and gcode == '3.3' or c.startswith(gcode + '.') and gcode != '3.3']
            points = []
            for code in codes:   # PDF order is AQA's authored order
                s = found[code]
                point = {'id': leaf_id(code), 'code': code, 'title': s['title'],
                         'official_reference': {'section': code, 'component': comp or 'all written papers',
                                                'source_pages': s['source_pages'], 'route': route},
                         'content': s['content']}
                as_group = AS_GROUP.get(gcode)
                if as_group is not None:
                    as_code = as_group + code[len(gcode):] if gcode != '3.3' else '3.4'
                    other = as_found.get(as_code)
                    if other:
                        ratio = difflib.SequenceMatcher(None, normalise(s['content']), normalise(other['content']), autojunk=False).ratio()
                        point['as_reference'] = {'qualification': '7036', 'section': as_code, 'title': other['title'],
                                                 'source_pages': other['source_pages'], 'text_similarity': round(ratio, 3)}
                        as_map[as_code] = leaf_id(code)
                points.append(point)
                order.append(leaf_id(code))
            if gcode == '3.3':
                fw = as_found['3.4']
                points.append({'id': AS_FIELDWORK, 'code': 'AS 3.4', 'title': 'AS fieldwork enquiry (7036 only)',
                               'official_reference': {'section': '3.4', 'qualification': '7036', 'component': '7036/2',
                                                      'source_pages': fw['source_pages'],
                                                      'route': 'AS Paper 2 Section B (written exam). Not in the A-level written papers.'},
                               'content': fw['content'], 'qualification_scope': ['7036']})
                order.append(AS_FIELDWORK)
                as_map['3.4'] = AS_FIELDWORK
            topics.append({'id': gid, 'code': gcode, 'title': gtitle, 'kind': kind, 'route': route, 'points': points})
        out_sections.append({'id': pid, 'code': plabel, 'title': f'{plabel}: {ptitle}',
                             'official_reference': {'component': comp} if comp else {}, 'topics': topics})
    for old, codes in LEGACY.items():
        legacy[old] = [leaf_id(c) for c in codes]
        assert all(c in found for c in codes), old
    unmatched_as = sorted(set(as_found) - set(as_map))
    if unmatched_as:
        raise SystemExit(f'AS sections without an A-level leaf: {unmatched_as}')
    spec = {'subject_id': 'AQA_ALEVEL_GEOG_7037', 'specification_version': 'aqa-7037-v1.2-2019-09-02',
            'official_source_url': SPEC_URL, 'order_status': 'verified',
            'official_source': {'title': 'AQA A-level Geography (7037) specification', 'version': 'Version 1.2',
                                'issue_date': '2 September 2019', 'first_teaching': 2016, 'first_exams': 2018,
                                'url': SPEC_URL, 'sha256': SPEC_SHA, 'verified_at': '2026-11-16',
                                'as_qualification': {'code': '7036', 'title': 'AQA AS Geography (7036) specification',
                                                     'version': 'Version 1.0', 'issue_date': '2 June 2016',
                                                     'first_exams': 2017, 'url': AS_URL, 'sha256': AS_SHA}},
            'approach': 'Official AQA content order. No textbook organisation has been supplied.',
            'components': {'7037/1': {'title': 'Physical geography', 'marks': 120, 'minutes': 150, 'sections': ['3.1'],
                                      'structure': 'A: water and carbon cycles (36, compulsory); B: one of hot deserts, coasts, glaciers (36); C: one of hazards, ecosystems under stress (48)'},
                           '7037/2': {'title': 'Human geography', 'marks': 120, 'minutes': 150, 'sections': ['3.2'],
                                      'structure': 'A: global systems and global governance (36); B: changing places (36); C: one of urban environments, population and the environment, resource security (48)'},
                           '7037/3': {'title': 'Geography fieldwork investigation (NEA)', 'marks': 60, 'written_exam': False,
                                      'note': 'Coursework: not imported as exam questions.'},
                           '7036/1': {'title': 'AS Physical geography and people and the environment', 'marks': 80, 'minutes': 90,
                                      'structure': 'A: one of water and carbon, coasts, glaciers (40); B: one of hazards, urban environments (40)'},
                           '7036/2': {'title': 'AS Human geography and geography fieldwork investigation', 'marks': 80, 'minutes': 90,
                                      'structure': 'A: changing places (40); B: fieldwork and skills, question 2 plus one of questions 3 or 4 (40)'}},
            'as_section_map': as_map,
            'notes': 'Leaves are AQA numbered content sections (AQA_GEOG_3.x...). content is AQA wording. Optional topics are kind "option" with their paper section. Linear A level: AQA prints no Year 12/13 order; the AS 7036 code map and text similarity are recorded so AS questions are tagged only to matching content.',
            'legacy_ids': legacy, 'point_order': order, 'sections': out_sections}
    target = REPO / 'data/specs/AQA_ALEVEL_GEOG_7037.json'
    target.write_text(json.dumps(spec, ensure_ascii=False, indent=2) + '\n')
    sys.path.insert(0, str(REPO / 'tools'))
    from write_spec_migrations import write_migrations
    write_migrations(REPO)
    low = {p['id']: p['as_reference']['text_similarity'] for s in out_sections for t in s['topics'] for p in t['points']
           if p.get('as_reference') and p['as_reference']['text_similarity'] < 0.9}
    print('wrote', target, len(order), 'leaves;', len(legacy), 'legacy ids;', len(as_map), 'AS sections mapped; below 0.9 similarity:', low)


if __name__ == '__main__':
    main()
