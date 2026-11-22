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

STATISTICS_LETTER_I = 'EDX_8FM0_2020_AUTUMN_24'
STATISTICS_LETTER_I_SHA = '4f939d4c2118b4034d525dd872991bc0c64650193651fa98547713b843b953f9'
EARLY_CAYLEY_TABLE = 'EDX_8FM0_2018_JUNE_22'
EARLY_CAYLEY_TABLE_SHA = 'cecb2bbc37082be6d7360a1d55022efaaac0827b021f9e14e95047dfc7b7e46c'
CORE_2019 = 'EDX_8FM0_2019_JUNE_01'
CORE_2019_SCHEME_SHA = 'f899092ecd6d7d4f92dbe33c70709c7ffcba03901d56c3272bc3406f861089ec'
STATISTICS_1_2023_SCHEME_SHA = 'b5f1f6a135511b29531b56ccddb635a58b5ac751f8b813152eb8cc4875323292'
DECISION_1_2023_SCHEME_SHA = '45e1d5e9130bf2bb3576bbf7f9ef7751134d28fcb67da602b2da9ef43896799e'
DECISION_2_2023_SCHEME_SHA = '8170307dcf3d33540bdb8ac0a3201308db2c6a5631ea8518639da867128bfd60'

# The second matrix and transformation definitions sit between two scored parts.
# Retain those definitions while omitting the earlier questions and marks.
CORE_2023_CONTEXT = {
    '(b)': [(8, 67, 90, 579, 198), (8, 67, 241, 579, 512)],
    '(c)': [(8, 67, 90, 579, 198), (8, 67, 241, 579, 374)],
}

# Source MediaBox coordinates, including alternative and notes rows where they
# apply. Every fallback below is keyed to the immutable official mark scheme.
AS_PART_SCHEMES = {
    ('EDX_8FM0_2018_JUNE_21', '1', '(a)'): (
        'cbb516c5df4878ebb9c265f3167871d53fb58520891642407f594ace06f35833', 3,
        [(5, 44, 40, 553, 222.4), (5, 44, 382, 553, 518.3)],
    ),
    ('EDX_8FM0_2018_JUNE_21', '1', '(b)'): (
        'cbb516c5df4878ebb9c265f3167871d53fb58520891642407f594ace06f35833', 4,
        [(5, 44, 40, 553, 69), (5, 44, 222.4, 553, 369), (5, 44, 518.3, 553, 797)],
    ),
    ('EDX_8FM0_2018_JUNE_21', '4', '(a)'): (
        'cbb516c5df4878ebb9c265f3167871d53fb58520891642407f594ace06f35833', 3,
        [(9, 45, 47, 555, 262), (9, 45, 491.9, 555, 662)],
    ),
    ('EDX_8FM0_2018_JUNE_21', '4', '(b)'): (
        'cbb516c5df4878ebb9c265f3167871d53fb58520891642407f594ace06f35833', 6,
        [(9, 45, 47, 555, 77), (9, 45, 262, 555, 478), (9, 45, 662, 555, 770),
         (10, 45, 49, 555, 489)],
    ),
    ('EDX_8FM0_2018_JUNE_21', '5', '(a)'): (
        'cbb516c5df4878ebb9c265f3167871d53fb58520891642407f594ace06f35833', 4,
        [(11, 45, 47, 555, 378), (12, 45, 50, 555, 343)],
    ),
    ('EDX_8FM0_2018_JUNE_21', '5', '(b)'): (
        'cbb516c5df4878ebb9c265f3167871d53fb58520891642407f594ace06f35833', 6,
        [(11, 45, 47, 555, 77), (11, 45, 378, 555, 736.5), (12, 45, 343, 555, 713),
         (13, 45, 55, 555, 268)],
    ),
    ('EDX_8FM0_2020_AUTUMN_24', '4', '(i)'): (
        '11343e6a918ed7e8d9731c44efc1b8a98f1f75fcd67dc4c87b622da691dde25f', 1,
        [(9, 45, 50, 555, 68), (9, 45, 498, 555, 531)],
    ),
    ('EDX_8FM0_2018_JUNE_27', '3', '(b)'): (
        'f2a4593c6868b9c173d2c781b305dd0322b2a9ad00613bed102cdc6a18271b57', 3,
        [(9, 108, 99, 450, 305), (10, 40, 163, 541, 315)],
    ),
    (CORE_2019, '10', '(b)(i)'): (
        CORE_2019_SCHEME_SHA, 3,
        [(23, 40, 63, 535, 83), (23, 40, 125, 535, 231), (24, 40, 132, 535, 212)],
    ),
    ('EDX_8FM0_2022_JUNE_01', '3', '(d)'): (
        'db1895024f6e6986585822f610ec7fa0d8cfa19258b0a8ac920c589965b0de49', 1,
        [(11, 60, 26, 560, 54), (11, 60, 439, 560, 484), (12, 60, 26, 560, 173)],
    ),
    ('EDX_8FM0_2023_JUNE_23', '2', '(c)'): (
        STATISTICS_1_2023_SCHEME_SHA, 1,
        [(7, 41, 58, 554, 74), (7, 41, 268, 554, 325), (7, 41, 475, 554, 538)],
    ),
    ('EDX_8FM0_2023_JUNE_23', '3', '(f)'): (
        STATISTICS_1_2023_SCHEME_SHA, 1,
        [(8, 41, 58, 554, 74), (8, 41, 416, 554, 451), (8, 41, 767, 554, 786)],
    ),
    ('EDX_8FM0_2023_JUNE_23', '4', '(f)'): (
        STATISTICS_1_2023_SCHEME_SHA, 2,
        [(9, 41, 58, 554, 74), (9, 41, 433, 554, 498), (9, 41, 725, 554, 793)],
    ),
    # Diagram-rich rows place their question numbers mid-cell. The rectangles
    # here follow the worksheet's actual cell borders and part-specific notes.
    ('EDX_8FM0_2023_JUNE_27', '2', '(a)'): (
        DECISION_1_2023_SCHEME_SHA, 1, [(7, 70, 41, 570, 142), (8, 40, 68, 569, 114)],
    ),
    ('EDX_8FM0_2023_JUNE_27', '2', '(b)'): (
        DECISION_1_2023_SCHEME_SHA, 3,
        [(7, 70, 41, 570, 68), (7, 70, 141, 570, 362), (8, 40, 115, 569, 245)],
    ),
    ('EDX_8FM0_2023_JUNE_27', '2', '(c)'): (
        DECISION_1_2023_SCHEME_SHA, 1,
        [(7, 70, 41, 570, 68), (7, 70, 362, 570, 414), (8, 40, 246, 569, 276)],
    ),
    ('EDX_8FM0_2023_JUNE_27', '2', '(d)'): (
        DECISION_1_2023_SCHEME_SHA, 1,
        [(7, 70, 41, 570, 68), (7, 70, 414, 570, 491), (8, 40, 277, 569, 394)],
    ),
    ('EDX_8FM0_2023_JUNE_27', '2', '(e)'): (
        DECISION_1_2023_SCHEME_SHA, 4,
        [(7, 70, 41, 570, 68), (7, 70, 491, 570, 664), (8, 40, 395, 569, 738)],
    ),
    ('EDX_8FM0_2023_JUNE_27', '3', '(a)'): (
        DECISION_1_2023_SCHEME_SHA, 1, [(9, 70, 64, 570, 190), (9, 70, 621, 570, 736)],
    ),
    ('EDX_8FM0_2023_JUNE_27', '3', '(b)'): (
        DECISION_1_2023_SCHEME_SHA, 6,
        [(9, 70, 64, 570, 91), (9, 70, 189, 570, 469), (9, 70, 744, 570, 799),
         (10, 70, 42, 570, 448), (11, 70, 67, 570, 476)],
    ),
    ('EDX_8FM0_2023_JUNE_27', '3', '(c)'): (
        DECISION_1_2023_SCHEME_SHA, 3,
        [(9, 70, 64, 570, 91), (9, 70, 468, 570, 545), (10, 70, 451, 570, 635)],
    ),
    ('EDX_8FM0_2023_JUNE_27', '3', '(d)'): (
        DECISION_1_2023_SCHEME_SHA, 1,
        [(9, 70, 64, 570, 91), (9, 70, 544, 570, 597), (10, 70, 635, 570, 672)],
    ),
    ('EDX_8FM0_2023_JUNE_27', '4', '(a)'): (
        DECISION_1_2023_SCHEME_SHA, 2, [(12, 70, 64, 570, 151), (12, 70, 378, 570, 452)],
    ),
    ('EDX_8FM0_2023_JUNE_27', '4', '(b)'): (
        DECISION_1_2023_SCHEME_SHA, 5,
        [(12, 70, 64, 570, 91), (12, 70, 150, 570, 355), (12, 70, 451, 570, 789)],
    ),
    ('EDX_8FM0_2023_JUNE_27', '5', '(a)'): (
        DECISION_1_2023_SCHEME_SHA, 1, [(13, 70, 42, 570, 121), (13, 70, 399, 570, 442)],
    ),
    ('EDX_8FM0_2023_JUNE_27', '5', '(b)'): (
        DECISION_1_2023_SCHEME_SHA, 1,
        [(13, 70, 42, 570, 69), (13, 70, 120, 570, 173), (13, 70, 441, 570, 498)],
    ),
    ('EDX_8FM0_2023_JUNE_27', '5', '(c)'): (
        DECISION_1_2023_SCHEME_SHA, 6,
        [(13, 70, 42, 570, 69), (13, 70, 172, 570, 376), (13, 70, 497, 570, 801)],
    ),
    ('EDX_8FM0_2023_JUNE_28', '1', '(a)'): (
        DECISION_2_2023_SCHEME_SHA, 2, [(6, 70, 42, 570, 160), (7, 70, 42, 570, 149)],
    ),
    ('EDX_8FM0_2023_JUNE_28', '1', '(b)'): (
        DECISION_2_2023_SCHEME_SHA, 6,
        [(6, 70, 42, 570, 69), (6, 70, 159, 570, 722), (7, 70, 148, 570, 585)],
    ),
    ('EDX_8FM0_2023_JUNE_28', '1', '(c)'): (
        DECISION_2_2023_SCHEME_SHA, 1,
        [(6, 70, 42, 570, 69), (6, 70, 721, 570, 775), (7, 70, 599, 570, 638)],
    ),
    ('EDX_8FM0_2023_JUNE_28', '2', '(a)'): (
        DECISION_2_2023_SCHEME_SHA, 1, [(8, 70, 41, 570, 129), (9, 40, 68, 569, 103)],
    ),
    ('EDX_8FM0_2023_JUNE_28', '2', '(b)'): (
        DECISION_2_2023_SCHEME_SHA, 1,
        [(8, 70, 41, 570, 68), (8, 70, 129, 570, 181), (9, 40, 104, 569, 137)],
    ),
    ('EDX_8FM0_2023_JUNE_28', '2', '(c)'): (
        DECISION_2_2023_SCHEME_SHA, 3,
        [(8, 70, 41, 570, 68), (8, 70, 181, 570, 256), (9, 40, 137, 569, 249)],
    ),
    ('EDX_8FM0_2023_JUNE_28', '2', '(d)'): (
        DECISION_2_2023_SCHEME_SHA, 1,
        [(8, 70, 41, 570, 68), (8, 70, 256, 570, 487), (9, 40, 250, 569, 313)],
    ),
    ('EDX_8FM0_2023_JUNE_28', '2', '(e)'): (
        DECISION_2_2023_SCHEME_SHA, 3,
        [(8, 70, 41, 570, 68), (8, 70, 487, 570, 602), (9, 40, 313, 569, 468)],
    ),
    ('EDX_8FM0_2025_JUNE_01', '1', '(c)'): (
        'b4b047e3709e91aeae42fe15ba51cb3b7fbbe160610d1f1920197163437dc9d1', 2,
        [(6, 60, 54, 579, 83), (6, 60, 426, 579, 727), (7, 60, 211, 579, 312)],
    ),
    ('EDX_8FM0_2025_JUNE_22', '2', '(ii)(d)'): (
        '3213e4316f0b26e0dcaf4c183c380036ec01f448318ed3f452d8fba9c8d1a1bf', 1,
        [(7, 54, 38, 540, 66), (7, 54, 484, 540, 517), (7, 54, 719, 540, 752)],
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


def restore_statistics_label(paper_id, path, candidate):
    """Preserve the letter (i), aligned with (h), in the nine-part AS FS2 question."""
    if paper_id != STATISTICS_LETTER_I:
        return
    checked_digest(path, STATISTICS_LETTER_I_SHA)
    question = next(q for q in candidate['questions'] if q['number'] == '4')
    previous, last = question['parts'][-2:]
    if previous['part_label'] != '(h)' or last['part_label'] not in ('(i)', '(h)(i)') or abs(last['start']['x'] - previous['start']['x']) > 2:
        raise ValueError(f'AS Statistics last printed part layout changed: {paper_id}')
    last.update(part_label='(i)', printed_labels=['(i)'])
    # The supplied scatter diagram is separately rendered with the part that
    # asks to complete it. Leave off the unrelated end-of-paper back page.
    question['regions'] = [r for r in question['regions'] if r['page'] <= last['page']]
    candidate['extraction_revision'] = '8fm0-2020-24-q4-letter-i-v1'


def place_early_cayley_table(paper_id, path, candidate):
    """Keep only the stem on each unit; the assigned table is a part (a) insert."""
    if paper_id != EARLY_CAYLEY_TABLE:
        return
    checked_digest(path, EARLY_CAYLEY_TABLE_SHA)
    question = next(q for q in candidate['questions'] if q['number'] == '2')
    question['regions'] = [r for r in question['regions'] if r['page'] == 4]
    if len(question['regions']) != 1:
        raise ValueError(f'AS Cayley table question source changed: {paper_id}')
    candidate['extraction_revision'] = '8fm0-2018-22-q2-required-table-v1'


def restore_core_2019_scheme_appendix(paper_id, path, scheme_regions):
    """File the appendix of alternatives with Q8 rather than with the last Q10."""
    if paper_id != CORE_2019:
        return
    checked_digest(path, CORE_2019_SCHEME_SHA)
    last = scheme_regions['10']
    if [r['page'] for r in last] != [23, 24, 25, 26, 27]:
        raise ValueError(f'AS Core scheme appendix layout changed: {paper_id}')
    scheme_regions['10'] = last[:2]
    scheme_regions['8'].extend(last[2:4])


def restore_core_2019_scan_label(paper_id, checksum, words):
    """Correct the recognised text of the visibly printed (b)(iii) label."""
    if paper_id != CORE_2019:
        return words
    if checksum != SCAN_LAYOUTS[paper_id][0]:
        raise ValueError(f'AS Core scan revision changed: {paper_id}')
    corrected = [w for w in words if not (67 < w['x0'] < 95 and 463 < w['top'] < 471)]
    corrected.append({'text': '(iii)', 'x0': 73.2, 'x1': 92, 'top': 468,
                      'bottom': 479, 'upright': True, 'ocr': True})
    return corrected


def reviewed_as_part_scheme(paper_id, checksum, number, labels, marks, page_size):
    if len(labels) != 1:
        return None
    layout = AS_PART_SCHEMES.get((paper_id, str(number), labels[0]))
    if layout is None:
        return None
    expected, count, boxes = layout
    if checksum != expected or marks != count:
        raise ValueError(f'AS part scheme source or mark allocation changed: {paper_id} Q{number} {labels[0]}')
    result = []
    for page, x0, y0, x1, y1 in boxes:
        w, h = page_size(page)
        result.append({'page': page, 'bbox': [x0 / w, y0 / h, x1 / w, y1 / h]})
    return result


def reviewed_as_context(paper_id, checksum, number, labels, page_size):
    if paper_id != 'EDX_8FM0_2023_JUNE_01' or str(number) != '3' or len(labels) != 1:
        return None
    boxes = CORE_2023_CONTEXT.get(labels[0])
    if not boxes:
        return None
    if checksum != 'd63c5b66c50a00582b7da3d14ea566f4923da6e37fff70199ad4c69ef55fd34a':
        raise ValueError(f'AS Core Pure matrix source changed: {paper_id}')
    result = []
    for page, x0, y0, x1, y1 in boxes:
        w, h = page_size(page)
        result.append({'page': page, 'bbox': [x0 / w, y0 / h, x1 / w, y1 / h]})
    return result


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
