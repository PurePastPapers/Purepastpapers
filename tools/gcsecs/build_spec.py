#!/usr/bin/env python3
"""Build data/specs/OCR_GCSE_CS_J277.json from OCR's official GCSE Computer Science J277 specification.

Usage: build_spec.py J277_SPEC_PDF
  558027-specification-gcse-computer-science-j277.pdf (Version 3.1, May 2026). Other files are refused.

OCR prints, per sub-topic ("1.1.1 Architecture of the CPU"), a bulleted content list on the
left and a Required / Not required guidance column on the right. Leaves are the sub-topics
(OCR's own numbering, 26 of them), keeping the earlier ids (OCR_GCSE_CS_1.1.1) so saved
ticks keep their meaning. Each leaf carries OCR's bullets verbatim in `content` and the
guidance in `guidance`. Sections are components 01 and 02; topics are OCR's 1.1 ... 2.5.
"""
import hashlib
import json
import re
import sys
from pathlib import Path

SHA = '39aa7d6d41266f90e3b4e0b848a9eee72febc26be1d4a780d2881769e34a906d'
URL = 'https://www.ocr.org.uk/Images/558027-specification-gcse-computer-science-j277.pdf'
REPO = Path(__file__).resolve().parents[2]
SUB = re.compile(r'^([12]\.\d\.\d)\s+(\S.*)$')
TOP = re.compile(r'^([12]\.\d)\s+[–-]\s+(\S.*)$')
GUIDE_X = 400   # guidance column starts at x=405; content bullets sit left of it


def guide_x(page):
    """x of this page's Guidance column: the left edge of its 'Required' / 'Guidance' words (it drifts a little by page)."""
    xs = [w['x0'] for w in page.extract_words() if w['text'] in ('Required', 'Guidance') and w['x0'] > 250]
    return (min(xs) - 6) if xs else GUIDE_X


def lines(page):
    words = [w for w in page.extract_words() if 50 < w['x0'] and 55 < w['top'] < page.height - 45]
    rows = []
    for w in sorted(words, key=lambda w: (round(w['top'] / 3), w['x0'])):
        key = round(w['top'] / 3)
        if rows and rows[-1][0] == key:
            rows[-1][1].append(w)
        else:
            rows.append((key, [w]))
    return [sorted(ws, key=lambda w: w['x0']) for _, ws in rows]


def main():
    import pdfplumber
    path = Path(sys.argv[1])
    if hashlib.sha256(path.read_bytes()).hexdigest() != SHA:
        sys.exit('refusing: not OCR J277 specification Version 3.1 (May 2026)')
    pdf = pdfplumber.open(path)
    start = next(i for i, p in enumerate(pdf.pages) if 'Content of Computer systems' in (p.extract_text() or ''))
    end = next(i for i, p in enumerate(pdf.pages) if i > start and re.search(r'^3\s*Assessment', p.extract_text() or '', re.M) or 'Assessment of GCSE Computer Science' in (p.extract_text() or '') and i > start + 5)
    topics, subs, cur_top, cur = {}, {}, None, None
    for pno in range(start, end):
        page = pdf.pages[pno]
        gx = guide_x(page)
        for ws in lines(page):
            left = [w for w in ws if w['x0'] < gx]
            right = [w for w in ws if w['x0'] >= gx]
            text = ' '.join(w['text'] for w in left).strip()
            m = TOP.match(text)
            if m:
                cur_top = m.group(1)
                topics[cur_top] = {'title': m.group(2).strip(), 'page': pno + 1}
                continue
            m = SUB.match(text)
            if m and left and left[0]['x0'] < 75:
                cur = m.group(1)
                subs[cur] = {'title': m.group(2).strip(), 'topic': cur_top, 'page': pno + 1, 'bullets': [], 'guidance': []}
                continue
            if cur is None:
                continue
            body = [w['text'] for w in left if w['text'] not in ('¨', 'o', 'ü', 'û')]
            if body:
                first = left[0]['text']
                if first == '¨' or not subs[cur]['bullets']:
                    subs[cur]['bullets'].append(' '.join(body))
                elif first == 'o' or left[0]['x0'] >= 115:
                    subs[cur]['bullets'][-1] += ('; ' if first == 'o' else ' ') + ' '.join(body)
                else:
                    subs[cur]['bullets'][-1] += ' ' + ' '.join(body)
            g = ' '.join(w['text'] for w in right).strip()
            if g and g not in ('Guidance',):
                subs[cur]['guidance'].append(g)
    for code, s in subs.items():
        s['bullets'] = [re.sub(r'\s+', ' ', re.sub(r'\bSub topic\b', ' ', b)).strip() for b in s['bullets'] if len(b.strip()) > 2]
    comp = lambda code: '01' if code.startswith('1') else '02'
    sections = []
    order, legacy = [], {}
    for scode, title in (('1', 'Component 01: Computer systems'), ('2', 'Component 02: Computational thinking, algorithms and programming')):
        tnodes = []
        for tcode, t in topics.items():
            if not tcode.startswith(scode + '.'):
                continue
            points = []
            for code, s in subs.items():
                if s['topic'] != tcode:
                    continue
                pid = f'OCR_GCSE_CS_{code}'
                points.append({'id': pid, 'code': code, 'title': s['title'],
                               'official_reference': {'section': code, 'topic': tcode, 'component': f'J277/{comp(code)}', 'source_pages': [s['page']]},
                               'content': s['bullets'], 'guidance': s['guidance']})
                order.append(pid)
            tnodes.append({'id': f'OCR_GCSE_CS_{tcode}', 'code': tcode, 'title': t['title'], 'kind': 'topic', 'points': points})
        sections.append({'id': f'OCR_GCSE_CS_SEC_C{scode}', 'title': title, 'topics': tnodes})
    spec = {'subject_id': 'OCR_GCSE_CS_J277', 'specification_version': 'ocr-j277-v3.1-2026-05', 'official_source_url': URL, 'order_status': 'verified',
            'official_source': {'title': 'OCR GCSE (9-1) Computer Science (J277) specification', 'version': 'Version 3.1', 'issue_date': 'May 2026',
                                'first_teaching': 2020, 'first_exams': 2022, 'url': URL, 'sha256': SHA, 'verified_at': '2026-11-21'},
            'approach': 'Official OCR content order. No textbook organisation has been supplied.',
            'components': {'J277/01': {'title': 'Computer systems', 'marks': 80, 'minutes': 90, 'sections': ['1.1', '1.2', '1.3', '1.4', '1.5', '1.6']},
                           'J277/02': {'title': 'Computational thinking, algorithms and programming', 'marks': 80, 'minutes': 90,
                                       'sections': ['2.1', '2.2', '2.3', '2.4', '2.5']}},
            'notes': 'Leaves are OCR sub-topics (1.1.1 ... 2.5.2); content is OCR wording. Ids are unchanged from the earlier unverified tree, so no migration is needed.',
            'point_order': order, 'sections': sections}
    (REPO / 'data/specs/OCR_GCSE_CS_J277.json').write_text(json.dumps(spec, ensure_ascii=False, indent=2) + '\n')
    print('topics', len(topics), 'leaves', len(order), 'bullets', sum(len(s['bullets']) for s in subs.values()))
    print([c for c, s in subs.items() if not s['bullets']])


if __name__ == '__main__':
    main()
