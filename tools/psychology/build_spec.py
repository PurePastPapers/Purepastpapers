#!/usr/bin/env python3
"""Build data/specs/AQA_ALEVEL_PSYCH_7182.json from AQA's official specification.

Usage: build_spec.py SPEC_PDF
  AQA-7181-7182-SP-2025-v1.4.pdf (Version 1.4, 1 September 2025; AS exams June 2026
  onwards, first A-level exams June 2027). Other revisions are refused.

AQA prints each content section (4.1.1 Social influence ... 4.3.10 Addiction, and the
research-methods subsections 4.2.3.1-4.2.3.3) as unnumbered bullets. The leaves are
those bullets, in AQA's printed order, identified as <section> (<bullet number>), for
example "4.1.1 (2)" (id AQA_PSYCH_4.1.1_b2). Bullet numbers are a positional
identity, not a code AQA prints. Each leaf keeps AQA's wording verbatim with its page.

Scope: Papers 1 and 2 and Paper 3 Section A are compulsory. Paper 3 Sections B-D are
optional; only the owner's route is built (Cognition and development, Schizophrenia,
Forensic Psychology). The other six options are listed in `options_not_in_scope`.

AS 7181 (spec section 3) repeats a subset of the same bullets. Each A-level leaf that
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

SPEC_SHA = 'db561ba9c36a9109830bcb03bb16d138b85907f068620cce01eff70fdee6ad4d'
SPEC_URL = 'https://cdn.sanity.io/files/p28bar15/green/661250c1cb8bd3586f93ddb48c89a3218a3913ca.pdf'
SPEC_PAGE = 'https://www.aqa.org.uk/subjects/psychology/a-level/psychology-7182/specification'
REPO = Path(__file__).resolve().parents[2]
leaf_id = lambda section, n: f'AQA_PSYCH_{section}_b{n}'

PAPERS = [('AQA_PSYCH_SEC_P1', 'Paper 1', 'Introductory topics in psychology', '7182/1'),
          ('AQA_PSYCH_SEC_P2', 'Paper 2', 'Psychology in context', '7182/2'),
          ('AQA_PSYCH_SEC_P3', 'Paper 3', 'Issues and options in psychology', '7182/3')]
# (group id: seeded topic id kept where it exists, spec sections, title, paper, kind, route)
GROUPS = [('AQA_PSYCH_SOCIAL', ['4.1.1'], 'Social influence', 0, 'group', 'Paper 1 Section A (compulsory)'),
          ('AQA_PSYCH_MEMORY', ['4.1.2'], 'Memory', 0, 'group', 'Paper 1 Section B (compulsory)'),
          ('AQA_PSYCH_ATTACH', ['4.1.3'], 'Attachment', 0, 'group', 'Paper 1 Section C (compulsory)'),
          ('AQA_PSYCH_PSYCHOPATH', ['4.1.4'], 'Clinical psychology and mental health', 0, 'group', 'Paper 1 Section D (compulsory)'),
          ('AQA_PSYCH_APPROACH', ['4.2.1'], 'Approaches in psychology', 1, 'group', 'Paper 2 Section A (compulsory)'),
          ('AQA_PSYCH_BIO', ['4.2.2'], 'Biopsychology', 1, 'group', 'Paper 2 Section B (compulsory)'),
          ('AQA_PSYCH_RM', ['4.2.3', '4.2.3.1', '4.2.3.2', '4.2.3.3'], 'Research methods', 1, 'group',
           'Paper 2 Section C (compulsory); also assessed in Papers 1 and 3'),
          ('AQA_PSYCH_ISSUES', ['4.3.1'], 'Issues and debates in psychology', 2, 'group', 'Paper 3 Section A (compulsory)'),
          ('AQA_PSYCH_COGDEV', ['4.3.4'], 'Cognition and development', 2, 'option',
           'Paper 3 Section B option (one of relationships, gender, cognition and development)'),
          ('AQA_PSYCH_SCHIZ', ['4.3.5'], 'Schizophrenia', 2, 'option',
           'Paper 3 Section C option (one of schizophrenia, eating behaviour, stress)'),
          ('AQA_PSYCH_FORENSIC', ['4.3.9'], 'Forensic psychology', 2, 'option',
           'Paper 3 Section D option (one of aggression, forensic psychology, addiction)')]
NOT_IN_SCOPE = {'4.3.2': 'Relationships', '4.3.3': 'Gender', '4.3.6': 'Eating behaviour', '4.3.7': 'Stress',
                '4.3.8': 'Aggression', '4.3.10': 'Addiction'}
SUBTITLES = {'4.2.3': 'Research methods', '4.2.3.1': 'Scientific processes', '4.2.3.2': 'Data handling and analysis',
             '4.2.3.3': 'Inferential testing'}
HEAD = re.compile(r'^([34]\.\d\.\d+(?:\.\d)?)\s+([A-Z].*)$')
NOISE = re.compile(r'Visit aqa\.org\.uk|AQA AS and A-level Psychology 7181|^\d+$')


def pages_text(pdf):
    out = subprocess.run(['pdftotext', '-layout', str(pdf), '-'], check=True, capture_output=True, text=True).stdout
    return out.split('\f')


def parse(pages, prefix):
    """Section code -> {'bullets': [{'text', 'page'}], 'intro': str} for spec section prefix ('3' AS or '4' A level)."""
    found, current, started = {}, None, False
    for pno, page in enumerate(pages, start=1):
        for raw in page.splitlines():
            line = raw.strip()
            if not line or NOISE.search(line):
                continue
            if re.match(r'^5\s+Scheme of assessment', line) or (prefix == '3' and re.match(r'^4\s+Subject content', line)):
                current = None
                started = False
                continue
            head = HEAD.match(line)
            if head and head.group(1).startswith(prefix + '.') and not re.search(r'\s\d+$', line):
                code = head.group(1)
                started = True
                current = found.setdefault(code, {'title': head.group(2).strip(), 'bullets': [], 'intro': '', 'page': pno})
                continue
            if not started or current is None:
                continue
            if re.match(r'^[34]\.\d\s+[A-Z]', line):   # paper-level heading (4.2 Psychology in context)
                current = None
                continue
            if line.startswith('•'):
                current['bullets'].append({'text': line.lstrip('• ').strip(), 'page': pno})
            elif current['bullets']:
                current['bullets'][-1]['text'] += ' ' + line
            else:
                current['intro'] = (current['intro'] + ' ' + line).strip()
    return found


def norm(text):
    return re.sub(r'[^a-z0-9 ]+', ' ', text.lower()).split()


def main():
    pdf = Path(sys.argv[1])
    if hashlib.sha256(pdf.read_bytes()).hexdigest() != SPEC_SHA:
        raise SystemExit('Not the verified 7181/7182 specification (Version 1.4, 1 September 2025)')
    pages = pages_text(pdf)
    alevel, as_level = parse(pages, '4'), parse(pages, '3')
    as_bullets = [(code, i + 1, b) for code, s in as_level.items() for i, b in enumerate(s['bullets'])]
    expected = {'4.1.1': 4, '4.1.2': 4, '4.1.3': 5, '4.1.4': 5, '4.2.1': 6, '4.2.2': 6, '4.2.3': 6, '4.2.3.1': 17,
                '4.2.3.2': 8, '4.2.3.3': 3, '4.3.1': 6, '4.3.4': 4, '4.3.5': 6, '4.3.9': 4}
    for code, n in expected.items():
        got = len(alevel.get(code, {}).get('bullets', []))
        if got != n:
            raise SystemExit(f'{code}: expected {n} bullets, found {got}')
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
                    text = (s['intro'] + ' ' if code == '4.2.1' else '') + b['text']
                    point = {'id': leaf_id(code, i), 'code': f'{code} ({i})',
                             'title': re.split(r'(?<=[a-z\)])[.:;]\s', b['text'], maxsplit=1)[0].rstrip('.')[:120],
                             'official_reference': {'section': code, 'section_title': SUBTITLES.get(code, gtitle),
                                                    'bullet': i, 'component': comp, 'source_pages': [b['page']],
                                                    'route': route},
                             'content': [text]}
                    best = max(as_bullets, key=lambda a: difflib.SequenceMatcher(None, norm(b['text']), norm(a[2]['text']), autojunk=False).ratio())
                    ratio = difflib.SequenceMatcher(None, norm(b['text']), norm(best[2]['text']), autojunk=False).ratio()
                    if ratio >= 0.85:
                        point['as_reference'] = {'qualification': '7181', 'section': best[0], 'bullet': best[1],
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
        'AQA_PSYCH_SOCIAL_1.1': L('4.1.1', 1), 'AQA_PSYCH_SOCIAL_1.2': L('4.1.1', 2), 'AQA_PSYCH_SOCIAL_1.3': L('4.1.1', 3),
        'AQA_PSYCH_SOCIAL_1.4': L('4.1.1', 4),
        'AQA_PSYCH_MEMORY_2.1': L('4.1.2', 1), 'AQA_PSYCH_MEMORY_2.2': L('4.1.2', 2), 'AQA_PSYCH_MEMORY_2.3': L('4.1.2', 3),
        'AQA_PSYCH_MEMORY_2.4': L('4.1.2', 4),
        'AQA_PSYCH_ATTACH_3.2': L('4.1.3', 1, 2), 'AQA_PSYCH_ATTACH_3.3': L('4.1.3', 3), 'AQA_PSYCH_ATTACH_3.4': L('4.1.3', 4, 5),
        'AQA_PSYCH_PSYCHOPATH_4.1': L('4.1.4', 1), 'AQA_PSYCH_PSYCHOPATH_4.2': L('4.1.4', 2, 3),
        'AQA_PSYCH_PSYCHOPATH_4.3': L('4.1.4', 2, 4), 'AQA_PSYCH_PSYCHOPATH_4.4': L('4.1.4', 2, 5),
        'AQA_PSYCH_APPROACH_5.1': L('4.2.1', 1), 'AQA_PSYCH_APPROACH_5.2': L('4.2.1', 2), 'AQA_PSYCH_APPROACH_5.3': L('4.2.1', 3),
        'AQA_PSYCH_APPROACH_5.4': L('4.2.1', 4, 5, 6),
        'AQA_PSYCH_BIO_6.1': L('4.2.2', 1, 2), 'AQA_PSYCH_BIO_6.2': L('4.2.2', 3, 4), 'AQA_PSYCH_BIO_6.3': L('4.2.2', 6),
        'AQA_PSYCH_BIO_6.4': L('4.2.2', 5, 6),
        'AQA_PSYCH_RM_7.1': L('4.2.3', 1, 2, 3, 4, 5, 6), 'AQA_PSYCH_RM_7.2': L('4.2.3.1', *range(1, 18)),
        'AQA_PSYCH_RM_7.3': L('4.2.3.2', *range(1, 9)), 'AQA_PSYCH_RM_7.4': L('4.2.3.3', 1, 2, 3),
        'AQA_PSYCH_ISSUES_8.1': L('4.3.1', 1), 'AQA_PSYCH_ISSUES_8.2': L('4.3.1', 2, 3), 'AQA_PSYCH_ISSUES_8.3': L('4.3.1', 4, 5),
        'AQA_PSYCH_ISSUES_8.4': L('4.3.1', 6),
        'AQA_PSYCH_OPT1_9.3': L('4.3.4', 1, 2, 3, 4), 'AQA_PSYCH_OPT2_10.1': L('4.3.5', *range(1, 7)),
        'AQA_PSYCH_OPT3_11.2': L('4.3.9', 1, 2, 3, 4),
    }
    for old, new in legacy.items():
        assert all(n in order for n in new), old
    spec = {'subject_id': 'AQA_ALEVEL_PSYCH_7182', 'specification_version': 'aqa-7181-7182-v1.4-2025-09-01',
            'official_source_url': SPEC_PAGE, 'order_status': 'verified',
            'official_source': {'title': 'AQA AS and A-level Psychology (7181, 7182) specification', 'version': 'Version 1.4',
                                'issue_date': '1 September 2025', 'first_teaching': 2025, 'first_exams': 2026,
                                'first_alevel_exams': 2027, 'url': SPEC_URL, 'page': SPEC_PAGE, 'sha256': SPEC_SHA,
                                'verified_at': '2026-11-16',
                                'note': 'Updated specification: AS exams June 2026 onwards, A-level exams June 2027 onwards. '
                                        'Public past papers (2017-2025) were set on the earlier version; questions on content '
                                        'this version no longer includes are excluded from the bank and listed (owner decision 16 Nov 2026).'},
            'approach': 'Official AQA content order. No textbook organisation has been supplied.',
            'route': {'paper_3_options': {'B': 'Cognition and development (4.3.4)', 'C': 'Schizophrenia (4.3.5)',
                                          'D': 'Forensic psychology (4.3.9)'},
                      'evidence': 'The Reach Free School Sixth Form Prospectus 2025/26 (owner-supplied source, 16 Nov 2026)'},
            'options_not_in_scope': NOT_IN_SCOPE,
            'components': {'7182/1': {'title': 'Introductory topics in psychology', 'marks': 96, 'minutes': 120,
                                      'structure': 'A social influence, B memory, C attachment, D clinical psychology and mental health (24 each)'},
                           '7182/2': {'title': 'Psychology in context', 'marks': 96, 'minutes': 120,
                                      'structure': 'A approaches (24), B biopsychology (24), C research methods (48)'},
                           '7182/3': {'title': 'Issues and options in psychology', 'marks': 96, 'minutes': 120,
                                      'structure': 'A issues and debates (24, compulsory); B, C, D one topic each from options 1-3 (24 each)'},
                           '7181/1': {'title': 'AS Introductory topics in psychology', 'marks': 72, 'minutes': 90,
                                      'structure': 'A social influence, B memory, C attachment (24 each)'},
                           '7181/2': {'title': 'AS Psychology in context', 'marks': 72, 'minutes': 90,
                                      'structure': 'A approaches in psychology (incl. biopsychology), B clinical psychology and mental health, C research methods (24 each)'}},
            'as_section_map': as_map, 'year_12_points': year12,
            'notes': 'Leaves are the bullets of AQA content sections, numbered by position ("4.1.1 (2)"). content is AQA wording. '
                     'Options are kind "option" with their Paper 3 section. Linear A level: AQA prints no Year 12/13 order; '
                     'the AS 7181 bullets (spec section 3) give the co-teaching Year 12 subset.',
            'legacy_ids': legacy, 'point_order': order, 'sections': sections}
    target = REPO / 'data/specs/AQA_ALEVEL_PSYCH_7182.json'
    target.write_text(json.dumps(spec, ensure_ascii=False, indent=2) + '\n')
    sys.path.insert(0, str(REPO / 'tools'))
    from write_spec_migrations import write_migrations
    write_migrations(REPO)
    print('wrote', target, len(order), 'leaves;', len(year12), 'AS/Year 12 leaves;', len(as_map), 'AS bullets mapped')
    for c, s in alevel.items():
        if c not in expected and c not in NOT_IN_SCOPE:
            print('  unexpected section', c, s['title'])


if __name__ == '__main__':
    main()
