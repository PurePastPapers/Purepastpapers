"""Reviewed source coordinates for exceptional Edexcel AS Further Maths PDFs."""
import hashlib
from pathlib import Path

import pdfplumber


# Each row is (source page, prompt top, [(scored label, marks, label top,
# tariff top, tariff bottom, printed subparts)]). Page coordinates use points
# in the immutable publisher PDF's MediaBox. Scans are rendered as source pixels.
SCAN_LAYOUTS = {
    'EDX_8FM0_2018_JUNE_27': (
        'fbafe4d0f8618a7499a298e10dac0aa126a6a3cb2421ed4b4a1b27c4a1df21d0',
        40, (70, 590), [
            (2, 108, [('(a)', 6, 552, 594, 606, ['a', 'i', 'ii']),
                      ('(b)', 2, 650, 692, 704, ['b']),
                      ('(c)', 1, 720, 734, 746, ['c'])]),
            (3, 77, [('(a)', 2, 127, 197, 210, ['a', 'i', 'ii']),
                     ('(b)', 3, 225, 267, 280, ['b', 'i', 'ii']),
                     ('(c)', 5, 295, 323, 336, ['c'])]),
            (4, 77, [('(a)', 3, 564, 578, 590, ['a']),
                     ('(b)', 3, 603, 617, 629, ['b']),
                     ('(c)', 1, 643, 656, 668, ['c']),
                     ('(d)', 3, 707, 772, 784, ['d', 'i', 'ii'])]),
            (5, 77, [('(a)', 1, 281, 294, 306, ['a']),
                     ('(b)', 2, 323, 336, 348, ['b']),
                     ('(c)', 8, 521, 590, 602, ['c', 'i', 'ii'])]),
        ],
    ),
    'EDX_8FM0_2019_JUNE_01': (
        '9e968b74773ab6d6ace0602eb744b842598930ca76dc52fae003155e398295e8',
        80, (39, 554), [
            (2, 57, [('(a)', 2, 125, 138, 148, ['a']),
                     ('(b)', 2, 234, 248, 258, ['b']),
                     ('(c)', 2, 273, 286, 296, ['c'])]),
            (4, 57, [('', 5, None, 180, 190, [])]),
            (6, 57, [('', 6, None, 138, 148, [])]),
            (8, 57, [('', 5, None, 209, 219, [])]),
            (10, 57, [('(a)', 2, 279, 306, 316, ['a']),
                      ('(b)', 3, 326, 348, 358, ['b']),
                      ('(c)', 2, 369, 387, 397, ['c']),
                      ('(d)', 2, 431, 472, 482, ['d'])]),
            (14, 57, [('(a)', 3, 138, 195, 205, ['a']),
                      ('(b)', 6, 243, 271, 281, ['b'])]),
            (16, 57, [('(a)', 6, 185, 198, 208, ['a']),
                      ('(b)', 2, 223, 236, 246, ['b'])]),
            (20, 57, [('(a)', 2, 186, 214, 224, ['a']),
                      ('(b)', 7, 338, 399, 409, ['b', 'i', 'ii']),
                      ('(c)', 2, 462, 475, 485, ['c']),
                      ('(d)', 1, 500, 513, 523, ['d'])]),
            (24, 57, [('', 8, None, 206, 216, [])]),
            (28, 57, [('(a)', 1, 227, 240, 250, ['a']),
                      ('(b)(i)', 3, 341, 405, 415, ['b', 'i']),
                      ('(b)(ii)', 3, 430, 443, 453, ['ii']),
                      ('(b)(iii)', 2, 468, 495, 505, ['iii']),
                      ('(c)', 1, 544, 557, 567, ['c']),
                      ('(d)', 2, 620, 685, 695, ['d'])]),
        ],
    ),
}

# Last page retains the final answer and marking notes before publisher back matter.
SCHEME_LAYOUTS = {
    'EDX_8FM0_2020_AUTUMN_24': (
        '11343e6a918ed7e8d9731c44efc1b8a98f1f75fcd67dc4c87b622da691dde25f',
        [(7, 62), (7, 220), (8, 48), (9, 48)], 9,
    ),
    'EDX_8FM0_2023_JUNE_27': (
        '45e1d5e9130bf2bb3576bbf7f9ef7751134d28fcb67da602b2da9ef43896799e',
        [(6, 37), (7, 37), (9, 61), (12, 61), (13, 37)], 13,
    ),
    'EDX_8FM0_2025_JUNE_21': (
        '06134410d51f99431dc38bc1ee4740baf30ee6f7510b5640fa72f446099dae24',
        [(5, 36), (7, 36), (9, 36), (11, 36), (12, 36)], 14,
    ),
}

LEAD_IN_LAYOUTS = {
    # The source prints the three new constraints at the foot of page 5,
    # below part (a)'s allocation. Part (b) begins on the next PDF page.
    'EDX_8FM0_2025_JUNE_27': (
        '87dac7bffcce765d17df7ad2c3ac54f83f35bcfcf02b7214cf4ebf07ec5bbef3',
        '4', 5, 805,
    ),
}


def checked_digest(path, expected):
    digest = hashlib.sha256(path.read_bytes()).hexdigest()
    if digest != expected:
        raise ValueError(f'Reviewed AS source revision changed: {path}')
    return digest


def normalized_region(page, page_number, left, top, right, bottom):
    return {'page': page_number, 'bbox': [
        round(left / page.width, 6), round(top / page.height, 6),
        round(right / page.width, 6), round(bottom / page.height, 6),
    ]}


def scan_candidate(paper_id, path):
    """Use visually inspected labels, marks and bounds for two scan layouts."""
    if paper_id not in SCAN_LAYOUTS:
        return None
    path = Path(path)
    checksum, total_marks, (left, right), rows = SCAN_LAYOUTS[paper_id]
    checked_digest(path, checksum)
    questions = []
    with pdfplumber.open(path) as pdf:
        page_count = len(pdf.pages)
        for number, (page_number, top, tariffs) in enumerate(rows, 1):
            page = pdf.pages[page_number - 1]
            parts = []
            for label, marks, start, tariff_top, tariff_bottom, printed in tariffs:
                raw_start = None if start is None else {
                    'label': printed[0], 'page': page_number, 'top': start,
                    'x': left + 20, 'fragment': 0,
                }
                parts.append({'part_label': label, 'marks': marks, 'page': page_number,
                              'top': tariff_top, 'bottom': tariff_bottom, 'fragment': 0,
                              'start': raw_start, 'joint_labels': printed})
            region = normalized_region(page, page_number, left, top, right, tariffs[-1][4] + 7)
            questions.append({'number': str(number), 'marks': sum(p['marks'] for p in parts),
                              'regions': [region], 'parts': parts, 'text': ''})
    if sum(question['marks'] for question in questions) != total_marks:
        raise ValueError(f'AS scan question marks do not reconcile: {paper_id}')
    return {'extraction_version': '8fm0-reviewed-scan-v1', 'source_sha256': checksum,
            'source_file': str(path), 'page_count': page_count, 'questions': questions,
            'total_marks': total_marks, 'exceptions': [], 'expected_total_marks': total_marks,
            'expected_question_count': len(questions)}


def restore_as_lead_ins(paper_id, path, candidate):
    """Restore a continuation printed below a previous part's page-end mark."""
    if paper_id not in LEAD_IN_LAYOUTS:
        return
    checksum, question_number, page_number, bottom = LEAD_IN_LAYOUTS[paper_id]
    checked_digest(path, checksum)
    question = next(q for q in candidate['questions'] if q['number'] == question_number)
    region = next(r for r in question['regions'] if r['page'] == page_number)
    with pdfplumber.open(path) as pdf:
        page = pdf.pages[page_number - 1]
        bbox = region['bbox']
        if bbox[3] >= bottom / page.height:
            return
        continuation = page.crop((bbox[0] * page.width, bbox[3] * page.height,
                                  bbox[2] * page.width, bottom)).extract_text() or ''
        if 'Three further constraints' not in continuation or '2.8 kg' not in continuation:
            raise ValueError(f'AS cross-page lead-in changed: {paper_id} Q{question_number}')
        bbox[3] = round(bottom / page.height, 6)
    candidate['extraction_revision'] = '8fm0-2025-27-q4-continuation-v1'


def reviewed_scheme_regions(paper_id, path, question_count):
    """Keep all scheme rows and alternatives when table headers are nonstandard."""
    if paper_id not in SCHEME_LAYOUTS:
        return None
    path = Path(path)
    checksum, starts, final_page = SCHEME_LAYOUTS[paper_id]
    checked_digest(path, checksum)
    if len(starts) != question_count:
        raise ValueError(f'AS scheme source question count changed: {paper_id}')
    regions = {}
    with pdfplumber.open(path) as pdf:
        for i, (start_page, start_top) in enumerate(starts):
            end_page, end_top = starts[i + 1] if i + 1 < len(starts) else (final_page, None)
            fragments = []
            for page_number in range(start_page, end_page + 1):
                page = pdf.pages[page_number - 1]
                top = start_top if page_number == start_page else 22
                limit = end_top if page_number == end_page and end_top is not None else page.height - 20
                words = [w for w in page.extract_words() if 25 < w['x0'] < w['x1'] <= page.width - 25
                         and top <= w['top'] < w['bottom'] <= limit]
                if words:
                    bottom = min(limit, max(w['bottom'] for w in words) + 8)
                    fragments.append(normalized_region(page, page_number, 25, top, page.width - 25, bottom))
            if not fragments:
                raise ValueError(f'Empty AS scheme region: {paper_id} question {i + 1}')
            regions[str(i + 1)] = fragments
    return regions
