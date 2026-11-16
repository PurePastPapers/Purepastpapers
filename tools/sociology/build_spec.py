#!/usr/bin/env python3
"""Build data/specs/AQA_ALEVEL_SOC_7192.json from AQA's official specification.

Usage: build_spec.py SPEC_PDF
  AQA-7191-7192-SP-2015.PDF (Version 1.2, 14 October 2021). Other revisions are refused.

AQA prints each content section (4.1.1 Education ... 4.3.2 Theory and Methods) as
unnumbered bullets. The leaves are those bullets, in AQA's printed order, identified as
<section> (<bullet number>), for example "4.1.1 (2)" (id AQA_SOC_4.1.1_b2). Bullet
numbers are a positional identity, not a code AQA prints. Methods in Context (4.1.2)
prints one sentence and no bullets; it is one leaf, "4.1.2 (1)". Each leaf keeps AQA's
wording verbatim with its page.

Theory and Methods is printed twice with identical bullets (4.1.3 for Paper 1 and 4.3.2
for Paper 3). It is built once, from 4.1.3; Paper 3 theory and methods questions use
those leaves (recorded in `aliases`).

Scope: Papers 1 and 3 are compulsory. Paper 2 is two optional sections; only the owner's
route is built (Section A Families and households, Section B Beliefs in society). The
other options are listed in `options_not_in_scope`.

AS 7191 (spec section 3) repeats a subset of the same bullets. Each A-level leaf that
AQA also prints in the AS section records its AS section and text similarity; that
subset is the co-teaching (Year 12) content.
"""
import difflib
import hashlib
import json
import re
import subprocess
import sys
from pathlib import Path

SPEC_SHA = '914de53681e7f64301b44b72e952ddd12f50c25b23e96ac40035c87deff5c62a'
SPEC_URL = 'https://cdn.sanity.io/files/p28bar15/green/2dd8b4693a21360d91b21ea4ab9180ab9b6a2c34.pdf'
SPEC_PAGE = 'https://www.aqa.org.uk/subjects/sociology/a-level/sociology-7192/specification'
REPO = Path(__file__).resolve().parents[2]
SUBJECT = 'AQA_ALEVEL_SOC_7192'
leaf_id = lambda section, n: f'AQA_SOC_{section}_b{n}'

PAPERS = [('AQA_SOC_SEC_P1', 'Paper 1', 'Education with theory and methods', '7192/1'),
          ('AQA_SOC_SEC_P2', 'Paper 2', 'Topics in sociology', '7192/2'),
          ('AQA_SOC_SEC_P3', 'Paper 3', 'Crime and deviance with theory and methods', '7192/3')]
# (group id: seeded topic id kept, spec sections, title, paper index, kind, route)
GROUPS = [('AQA_SOC_EDU', ['4.1.1'], 'Education', 0, 'group', 'Paper 1 (compulsory); AS Paper 1'),
          ('AQA_SOC_MIC', ['4.1.2'], 'Methods in context', 0, 'group', 'Paper 1 (compulsory); AS Paper 1'),
          ('AQA_SOC_TM', ['4.1.3'], 'Theory and methods', 0, 'group',
           'Paper 1 and Paper 3 (compulsory; printed as 4.1.3 and 4.3.2); AS Paper 2 Section A research methods'),
          ('AQA_SOC_FAM', ['4.2.2'], 'Families and households', 1, 'option',
           'Paper 2 Section A option (one of culture and identity, families and households, health, work poverty and welfare); AS Paper 2 Section B'),
          ('AQA_SOC_BELIEFS', ['4.2.5'], 'Beliefs in society', 1, 'option',
           'Paper 2 Section B option (one of beliefs in society, global development, the media, stratification and differentiation)'),
          ('AQA_SOC_CRIME', ['4.3.1'], 'Crime and deviance', 2, 'group', 'Paper 3 (compulsory)')]
NOT_IN_SCOPE = {'4.2.1': 'Culture and identity', '4.2.3': 'Health', '4.2.4': 'Work, poverty and welfare',
                '4.2.6': 'Global development', '4.2.7': 'The media', '4.2.8': 'Stratification and differentiation'}
HEAD = re.compile(r'^([34]\.\d\.\d+(?:\.\d)?)\s+([A-Z].*)$')
NOISE = re.compile(r'Visit aqa\.org\.uk|Visit for the most|AQA AS and A-level Sociology|^\d+$')


def pages_text(pdf):
    out = subprocess.run(['pdftotext', '-layout', str(pdf), '-'], check=True, capture_output=True, text=True).stdout
    return out.split('\f')


def parse(pages, prefix):
    found, current, started = {}, None, False
    for pno, page in enumerate(pages, start=1):
        for raw in page.splitlines():
            line = raw.strip()
            if not line or NOISE.search(line):
                continue
            if re.match(r'^5\s+Scheme of assessment', line) or (prefix == '3' and re.match(r'^4\s+Subject content', line)):
                current, started = None, False
                continue
            head = HEAD.match(line)
            if head and head.group(1).startswith(prefix + '.') and not re.search(r'\s\d+$|\(page \d+\)', line):
                code = head.group(1)
                started = True
                current = found.setdefault(code, {'title': head.group(2).strip(), 'bullets': [], 'intro': '', 'page': pno})
                continue
            if not started or current is None:
                continue
            if re.match(r'^[34]\.\d\s+[A-Z]', line):
                current = None
                continue
            if line.startswith('•'):
                current['bullets'].append({'text': line.lstrip('• ').strip(), 'page': pno})
            elif current['bullets']:
                current['bullets'][-1]['text'] += ' ' + line
            else:
                current['intro'] = (current['intro'] + ' ' + line).strip()
    for s in found.values():   # a section with no bullets (Methods in Context) is one leaf: its sentence
        if not s['bullets'] and s['intro']:
            s['bullets'] = [{'text': s['intro'], 'page': s['page']}]
    return found


def norm(text):
    return re.sub(r'[^a-z0-9 ]+', ' ', text.lower()).split()


def main():
    pdf = Path(sys.argv[1])
    if hashlib.sha256(pdf.read_bytes()).hexdigest() != SPEC_SHA:
        raise SystemExit('Not the verified 7191/7192 specification (Version 1.2, 14 October 2021)')
    pages = pages_text(pdf)
    alevel, as_level = parse(pages, '4'), parse(pages, '3')
    as_level = {c: s for c, s in as_level.items() if c in ('3.1.1', '3.1.2', '3.2.1', '3.2.2.2')}   # AS route content
    as_bullets = [(code, i + 1, b) for code, s in as_level.items() for i, b in enumerate(s['bullets'])]
    expected = {'4.1.1': 4, '4.1.2': 1, '4.1.3': 11, '4.2.2': 5, '4.2.5': 5, '4.3.1': 4, '4.3.2': 11}
    for code, n in expected.items():
        got = len(alevel.get(code, {}).get('bullets', []))
        if got != n:
            raise SystemExit(f'{code}: expected {n} bullets, found {got}')
    if [b['text'] for b in alevel['4.1.3']['bullets']] != [b['text'] for b in alevel['4.3.2']['bullets']]:
        raise SystemExit('4.1.3 and 4.3.2 Theory and Methods differ')
    sections, order, as_map, year12 = [], [], {}, []
    for pindex, (pid, plabel, ptitle, comp) in enumerate(PAPERS):
        topics = []
        for gid, codes, gtitle, gpaper, kind, route in GROUPS:
            if gpaper != pindex:
                continue
            points = []
            for code in codes:
                s = alevel[code]
                for i, b in enumerate(s['bullets'], start=1):
                    point = {'id': leaf_id(code, i), 'code': f'{code} ({i})',
                             'title': (b['text'][0].upper() + b['text'][1:]).split(';')[0].rstrip('.')[:120],
                             'official_reference': {'section': code, 'section_title': s['title'], 'bullet': i,
                                                    'component': comp, 'source_pages': [b['page']], 'route': route},
                             'content': [b['text']]}
                    if code == '4.1.3':
                        point['official_reference']['also_printed_as'] = f'4.3.2 ({i})'
                    if as_bullets:
                        best = max(as_bullets, key=lambda a: difflib.SequenceMatcher(None, norm(b['text']), norm(a[2]['text']), autojunk=False).ratio())
                        ratio = difflib.SequenceMatcher(None, norm(b['text']), norm(best[2]['text']), autojunk=False).ratio()
                        if ratio >= 0.85:
                            point['as_reference'] = {'qualification': '7191', 'section': best[0], 'bullet': best[1],
                                                     'title': as_level[best[0]]['title'], 'source_pages': [best[2]['page']],
                                                     'text_similarity': round(ratio, 3)}
                            as_map.setdefault(f'{best[0]} ({best[1]})', leaf_id(code, i))
                            year12.append(leaf_id(code, i))
                    points.append(point)
                    order.append(leaf_id(code, i))
            topics.append({'id': gid, 'code': codes[0], 'title': gtitle, 'kind': kind, 'route': route, 'points': points})
        sections.append({'id': pid, 'code': plabel, 'title': f'{plabel}: {ptitle}', 'official_reference': {'component': comp},
                         'topics': topics})
    unmatched = [f'{c} ({i})' for c, i, _ in as_bullets if f'{c} ({i})' not in as_map]
    if unmatched:
        raise SystemExit(f'AS bullets without an A-level leaf: {unmatched}')
    L = lambda code, *ns: [leaf_id(code, n) for n in ns]
    legacy = {
        'AQA_SOC_EDU_1.1': L('4.1.1', 1), 'AQA_SOC_EDU_1.2': L('4.1.1', 2), 'AQA_SOC_EDU_1.3': L('4.1.1', 3),
        'AQA_SOC_EDU_1.4': L('4.1.1', 4), 'AQA_SOC_MIC_2.1': L('4.1.2', 1),
        'AQA_SOC_TM_3.1': L('4.1.3', 1, 2, 3), 'AQA_SOC_TM_3.2': L('4.1.3', 4, 5), 'AQA_SOC_TM_3.3': L('4.1.3', 6),
        'AQA_SOC_TM_3.4': L('4.1.3', 7, 8, 10), 'AQA_SOC_TM_3.5': L('4.1.3', 9, 11),
        'AQA_SOC_FAM_4.1': L('4.2.2', 1), 'AQA_SOC_FAM_4.2': L('4.2.2', 2), 'AQA_SOC_FAM_4.3': L('4.2.2', 3),
        'AQA_SOC_FAM_4.4': L('4.2.2', 4), 'AQA_SOC_FAM_4.5': L('4.2.2', 5),
        'AQA_SOC_BELIEFS_5.1': L('4.2.5', 1), 'AQA_SOC_BELIEFS_5.2': L('4.2.5', 2), 'AQA_SOC_BELIEFS_5.3': L('4.2.5', 3),
        'AQA_SOC_BELIEFS_5.4': L('4.2.5', 4), 'AQA_SOC_BELIEFS_5.5': L('4.2.5', 5),
        'AQA_SOC_CRIME_6.1': L('4.3.1', 1), 'AQA_SOC_CRIME_6.2': L('4.3.1', 2), 'AQA_SOC_CRIME_6.3': L('4.3.1', 3),
        'AQA_SOC_CRIME_6.4': L('4.3.1', 4),
    }
    for old, new in legacy.items():
        assert all(n in order for n in new), old
    spec = {'subject_id': SUBJECT, 'specification_version': 'aqa-7191-7192-v1.2-2021-10-14',
            'official_source_url': SPEC_PAGE, 'order_status': 'verified',
            'official_source': {'title': 'AQA AS and A-level Sociology (7191, 7192) specification', 'version': 'Version 1.2',
                                'issue_date': '14 October 2021', 'first_teaching': 2015, 'url': SPEC_URL, 'page': SPEC_PAGE,
                                'sha256': SPEC_SHA, 'verified_at': '2026-11-16',
                                'note': 'Current specification; all public past papers were set on it.'},
            'approach': 'Official AQA content order. No textbook organisation has been supplied.',
            'route': {'paper_2_options': {'A': 'Families and households (4.2.2)', 'B': 'Beliefs in society (4.2.5)'},
                      'as_paper_2_option': 'Families and households (3.2.2.2)',
                      'evidence': 'The Reach Free School Sixth Form Prospectus 2025/26 (owner-supplied source, 16 Nov 2026)'},
            'options_not_in_scope': NOT_IN_SCOPE,
            'aliases': {'4.3.2': 'Theory and Methods for Paper 3 is printed with the same bullets as 4.1.3; its questions use the 4.1.3 leaves.'},
            'components': {'7192/1': {'title': 'Education with theory and methods', 'marks': 80, 'minutes': 120,
                                      'structure': 'A education with methods in context (50), B theory and methods (30)'},
                           '7192/2': {'title': 'Topics in sociology', 'marks': 80, 'minutes': 120,
                                      'structure': 'A one topic from culture and identity, families and households, health, work poverty and welfare (40); B one topic from beliefs in society, global development, the media, stratification and differentiation (40)'},
                           '7192/3': {'title': 'Crime and deviance with theory and methods', 'marks': 80, 'minutes': 120,
                                      'structure': 'A crime and deviance (50), B theory and methods (30)'},
                           '7191/1': {'title': 'AS Education with methods in context', 'marks': 60, 'minutes': 90,
                                      'structure': 'Education with methods in context (one section)'},
                           '7191/2': {'title': 'AS Research methods and topics in sociology', 'marks': 60, 'minutes': 90,
                                      'structure': 'A research methods (20), B one topic (40)'}},
            'as_section_map': as_map, 'year_12_points': year12,
            'notes': 'Leaves are the bullets of AQA content sections, numbered by position ("4.1.1 (2)"). content is AQA wording. '
                     'Paper 2 options are kind "option". Linear A level: AQA prints no Year 12/13 order; the AS 7191 bullets '
                     '(spec section 3) give the co-teaching Year 12 subset.',
            'legacy_ids': legacy, 'point_order': order, 'sections': sections}
    target = REPO / f'data/specs/{SUBJECT}.json'
    target.write_text(json.dumps(spec, ensure_ascii=False, indent=2) + '\n')
    sys.path.insert(0, str(REPO / 'tools'))
    from write_spec_migrations import write_migrations
    write_migrations(REPO)
    print('wrote', target, len(order), 'leaves;', len(year12), 'AS/Year 12 leaves;', len(as_map), 'AS bullets mapped')


if __name__ == '__main__':
    main()
