#!/usr/bin/env python3
"""Build data/specs/OCR_ALEVEL_CS_H446.json from OCR's official specifications.

Usage: build_spec.py H446_SPEC_PDF H046_SPEC_PDF
  170844-specification-accredited-a-level-gce-computer-science-h446.pdf (Version 3.0, April 2026)
  170845-specification-accredited-as-level-gce-computer-science-h046.pdf (Version 2.0, February 2026)
Other revisions are refused.

OCR prints a two-column content table: a numbered topic on the left ("1.1.1 Structure
and function of the processor") and lettered points on the right ("(a) The Arithmetic
and Logic Unit ..."). Leaves are the lettered points, printed code "1.1.1(a)", id
OCR_CS_1.1.1a, with OCR's wording verbatim and source pages. Topics keep the earlier
ids (OCR_CS_1.1.1); sections are OCR's printed groups 1.1 ... 2.3 with their component.
The programming project (section 3) is coursework and is not exam content.

AS H046 numbers some content differently (AS 1.3.1 Databases = A-level 1.3.2). Every AS
lettered point is matched to the A-level point with the most similar text; matches
below the threshold become AS-only leaves (OCR_CS_AS_...), never forced onto A-level
content. Earlier topic-level leaf ids migrate to all of their lettered points.
"""
import difflib
import hashlib
import json
import re
import sys
from pathlib import Path

SPEC_SHA = '8551bc2636fa4d8718d97901b462b0642b4bb6148e06407f662c507750764a44'
AS_SHA = '7445600025a30cb6ec539e4ffefdd9a8a21f3a9a096cbd1f62076a3c909ecd6b'
BASE = 'https://www.ocr.org.uk/Images/'
SPEC_URL = BASE + '170844-specification-accredited-a-level-gce-computer-science-h446.pdf'
AS_URL = BASE + '170845-specification-accredited-as-level-gce-computer-science-h046.pdf'
REPO = Path(__file__).resolve().parents[2]
MATCH = 0.6   # minimum similarity (word coverage or sequence ratio) for an AS point to share an A-level leaf
TOPIC = re.compile(r'^([12]\.\d\.\d)\b')
SECTION = re.compile(r'^([12]\.\d)\s+(\S.*)$')
POINT = re.compile(r'^\(([a-z])\)\s*(.*)$')


def rows(page):
    """Rows of (left text, right text) split at the content table's column boundary."""
    words = [w for w in page.extract_words() if 60 < w['top'] < page.height - 50
             and not ((w['x0'] > 540 or w['x0'] < 30) and re.fullmatch(r'\d', w['text']))]   # chapter tab digit in either margin
    out = []
    for w in sorted(words, key=lambda w: (round(w['top']), w['x0'])):
        if out and abs(out[-1]['top'] - w['top']) < 3:
            out[-1]['words'].append(w)
        else:
            out.append({'top': w['top'], 'words': [w]})
    result = []
    for r in out:
        ws = sorted(r['words'], key=lambda w: w['x0'])
        left = re.sub(r'\s+\d$', '', ' '.join(w['text'] for w in ws if w['x0'] < 290).strip())   # chapter tab digit
        right = ' '.join(w['text'] for w in ws if w['x0'] >= 290).strip()
        result.append((left, right, ws[0]['x0']))
    return result


def parse(path, pages):
    import pdfplumber
    sections, topics, current_topic, current_point, section = {}, {}, None, None, None
    with pdfplumber.open(path) as pdf:
        for index in pages:
            for left, right, x0 in rows(pdf.pages[index]):
                full = (left + ' ' + right).strip()
                if re.match(r'^(Version \d|\d+ Cambridge OCR|Cambridge OCR Level)', full) or 'Version' in full and '©' in full:
                    continue
                if re.match(r'^[3-9]\.\d', full) or full.startswith('2c. Content of non exam'):
                    return sections, topics   # programming project: coursework
                if re.match(r'^2[a-z]\. ', full):   # a component heading ends the previous topic
                    current_topic = current_point = None
                    section = None
                    continue
                s = SECTION.match(full) if not TOPIC.match(left) else None
                if s and x0 < 60:
                    section = s.group(1)
                    sections[section] = {'code': section, 'title': s.group(2).strip(), 'source_pages': [index + 1], 'intro': ''}
                    current_topic = current_point = None
                    continue
                t = TOPIC.match(left)
                if t:
                    code = t.group(1)
                    current_topic = {'code': code, 'title': left[len(code):].strip(), 'section': section,
                                     'source_pages': [index + 1], 'points': {}}
                    topics[code] = current_topic
                    current_point = None
                elif current_topic is None:
                    if section and section in sections and full and not sections[section]['intro']:
                        sections[section]['intro'] = full
                    continue
                elif left and not right and current_point is None:
                    if not re.fullmatch(r'\d', left):   # a chapter tab digit is not title text
                        current_topic['title'] += ' ' + left   # wrapped topic title
                    continue
                elif left and current_topic and current_point is not None and x0 < 290 and not right:
                    current_topic['title'] += ' ' + left
                    continue
                if index + 1 not in current_topic['source_pages']:
                    current_topic['source_pages'].append(index + 1)
                if not right:
                    continue
                p = POINT.match(right)
                if p:
                    current_point = {'letter': p.group(1), 'text': p.group(2).strip()}
                    current_topic['points'][p.group(1)] = current_point
                elif current_point is not None:
                    current_point['text'] += ' ' + right
                else:   # a topic described without lettered points
                    current_point = {'letter': '', 'text': right, 'unlettered': True}
                    current_topic['points'][''] = current_point
    return sections, topics


# Lead review (model): AS points whose OCR wording differs but whose content is an A-level point.
OVERRIDES = {
    '1.2.3(a)': ('1.2.4b', 'AS procedural programming techniques are the content of A-level 1.2.4(b) Procedural languages'),
    '2.3.1(e)': ('1.4.2c', 'AS adding to and removing from stacks and queues is A-level 1.4.2(c) for those structures'),
}
STOP = set('the a an and or of to in for with their its use uses using including include how what between different main given such as be is are this that these on by from at learners should can will'.split())


def norm(text):
    return re.sub(r'[^a-z0-9 ]+', ' ', text.lower()).split()


def stems(text):
    return {w[:5] for w in norm(text) if w not in STOP and len(w) > 2}


def coverage(as_text, a_text):
    """Share of the AS point's content words (5-letter stems) printed in the A-level point."""
    a, b = stems(as_text), stems(a_text)
    return len(a & b) / len(a) if a else 0


def main():
    pdf, as_pdf = Path(sys.argv[1]), Path(sys.argv[2])
    if hashlib.sha256(pdf.read_bytes()).hexdigest() != SPEC_SHA:
        raise SystemExit('Not the verified H446 specification (Version 3.0, April 2026)')
    if hashlib.sha256(as_pdf.read_bytes()).hexdigest() != AS_SHA:
        raise SystemExit('Not the verified H046 specification (Version 2.0, February 2026)')
    sections, topics = parse(pdf, range(11, 20))
    as_sections, as_topics = parse(as_pdf, range(11, 18))
    expected = ['1.1.1', '1.1.2', '1.1.3', '1.2.1', '1.2.2', '1.2.3', '1.2.4', '1.3.1', '1.3.2', '1.3.3', '1.3.4',
                '1.4.1', '1.4.2', '1.4.3', '1.5.1', '1.5.2', '2.1.1', '2.1.2', '2.1.3', '2.1.4', '2.1.5', '2.2.1', '2.2.2', '2.3.1']
    if list(topics) != expected:
        raise SystemExit(f'Unexpected H446 topics: {list(topics)}')
    leaves = {}
    for code, t in topics.items():
        for letter, p in t['points'].items():
            leaves[f'{code}{letter}' if letter else f'{code}_whole'] = (code, p)
    # Match AS points to A-level points by text.
    as_map, as_only = {}, []
    for code, t in as_topics.items():
        for letter, p in t['points'].items():
            score = lambda k: max(coverage(p['text'], leaves[k][1]['text']),
                                  difflib.SequenceMatcher(None, norm(p['text']), norm(leaves[k][1]['text']), autojunk=False).ratio())
            best = max(leaves, key=score)
            ratio = score(best)
            key = f'{code}({letter})'
            if key in OVERRIDES:
                leaf, why = OVERRIDES[key]
                as_map[key] = {'leaf': f'OCR_CS_{leaf}', 'similarity': round(ratio, 3), 'lead_override': why}
            elif ratio >= MATCH:
                as_map[f'{code}({letter})'] = {'leaf': f'OCR_CS_{best}', 'similarity': round(ratio, 3)}
            else:
                as_only.append((code, letter, p, t, ratio, best))
    out_sections, order, legacy = [], [], {}
    comp = lambda c: '01' if c.startswith('1.') else '02'
    for scode, s in sections.items():
        topic_nodes = []
        for code, t in topics.items():
            if t['section'] != scode:
                continue
            points = []
            for letter, p in t['points'].items():
                pid = f'OCR_CS_{code}{letter}' if letter else f'OCR_CS_{code}_whole'
                node = {'id': pid, 'code': f'{code}({letter})' if letter else code, 'title': p['text'] if len(p['text']) <= 160 else p['text'][:157].rsplit(' ', 1)[0] + '...',
                        'official_reference': {'section': f'{code}({letter})', 'topic': code, 'component': f"H446/{comp(code)}",
                                               'source_pages': t['source_pages']},
                        'content': [p['text']]}
                if not letter:
                    node['official_reference']['unlettered'] = True   # OCR prints this topic as one paragraph
                ref = [k for k, v in as_map.items() if v['leaf'] == pid]
                if ref:
                    node['as_reference'] = {'qualification': 'H046', 'sections': ref,
                                            'text_similarity': max(as_map[k]['similarity'] for k in ref)}
                points.append(node)
                order.append(pid)
            legacy[f'OCR_CS_{code}'] = [p['id'] for p in points if not p['id'].startswith('OCR_CS_AS_')]
            topic_nodes.append({'id': f'OCR_CS_{code}', 'code': code, 'title': t['title'], 'kind': 'group', 'points': points})
        extra = []
        for (acode, letter, p, at, ratio, best) in as_only:
            if acode.rsplit('.', 1)[0] != scode:
                continue
            pid = f'OCR_CS_AS_{acode}{letter}'
            extra.append({'id': pid, 'code': f'AS {acode}({letter})', 'title': p['text'] if len(p['text']) <= 160 else p['text'][:157].rsplit(' ', 1)[0] + '...',
                          'official_reference': {'section': f'{acode}({letter})', 'qualification': 'H046', 'component': f"H046/{comp(acode)}",
                                                 'source_pages': at['source_pages'], 'nearest_a_level': best, 'similarity': round(ratio, 3)},
                          'content': [p['text']], 'qualification_scope': ['H046']})
            order.append(pid)
            as_map[f'{acode}({letter})'] = {'leaf': pid, 'similarity': round(ratio, 3), 'as_only': True}
        if extra:
            topic_nodes.append({'id': f'OCR_CS_AS_{scode}', 'code': f'AS {scode}', 'title': f'AS only (H046): content not in the A level', 'kind': 'option', 'points': extra})
        out_sections.append({'id': f'OCR_CS_{scode}', 'code': scode, 'title': f"{scode} {s['title']}",
                             'official_reference': {'component': f'H446/{comp(scode)}', 'source_pages': s['source_pages']},
                             'note': s['intro'], 'topics': topic_nodes})
    spec = {'subject_id': 'OCR_ALEVEL_CS_H446', 'specification_version': 'ocr-h446-v3.0-2026-04',
            'official_source_url': SPEC_URL, 'order_status': 'verified',
            'official_source': {'title': 'OCR A Level Computer Science (H446) specification', 'version': 'Version 3.0',
                                'issue_date': 'April 2026', 'first_teaching': 2015, 'first_exams': 2017,
                                'url': SPEC_URL, 'sha256': SPEC_SHA, 'verified_at': '2026-11-16',
                                'as_qualification': {'code': 'H046', 'title': 'OCR AS Level Computer Science (H046) specification',
                                                     'version': 'Version 2.0', 'issue_date': 'February 2026', 'first_exams': 2016,
                                                     'url': AS_URL, 'sha256': AS_SHA}},
            'approach': 'Official OCR content order. No textbook organisation has been supplied.',
            'components': {'H446/01': {'title': 'Computer systems', 'marks': 140, 'minutes': 150, 'sections': ['1.1', '1.2', '1.3', '1.4', '1.5']},
                           'H446/02': {'title': 'Algorithms and programming', 'marks': 140, 'minutes': 150, 'sections': ['2.1', '2.2', '2.3'],
                                       'note': 'Synoptic: may also assess Component 01 content.'},
                           'H446/03-04': {'title': 'Programming project (NEA)', 'written_exam': False, 'note': 'Coursework: not imported as exam questions.'},
                           'H046/01': {'title': 'AS Computing principles', 'marks': 70, 'minutes': 75},
                           'H046/02': {'title': 'AS Algorithms and problem solving', 'marks': 70, 'minutes': 75}},
            'as_section_map': as_map,
            'notes': 'Leaves are OCR lettered content points (OCR_CS_1.1.1a, printed 1.1.1(a)); content is OCR wording. Topics keep the earlier ids. AS H046 points are matched to A-level points by text similarity (recorded); unmatched AS points are AS-only leaves.',
            'legacy_ids': legacy, 'point_order': order, 'sections': out_sections}
    target = REPO / 'data/specs/OCR_ALEVEL_CS_H446.json'
    target.write_text(json.dumps(spec, ensure_ascii=False, indent=2) + '\n')
    sys.path.insert(0, str(REPO / 'tools'))
    from write_spec_migrations import write_migrations
    write_migrations(REPO)
    print('wrote', len(order), 'leaves (', sum(1 for x in order if '_AS_' in x), 'AS-only );', len(as_map), 'AS points mapped;',
          'low matches:', {k: v['similarity'] for k, v in as_map.items() if v['similarity'] < 0.8})


if __name__ == '__main__':
    main()
