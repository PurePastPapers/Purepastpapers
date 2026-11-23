#!/usr/bin/env python3
"""Reconcile printed AQA 7692/1 assessment structure to the official manifest."""
import hashlib
import json
import re
import sys
from pathlib import Path

import fitz


def page_lines(page):
    lines = []
    for block in page.get_text('dict')['blocks']:
        for line in block.get('lines', []):
            text = ''.join(span['text'] for span in line['spans']).strip()
            lines.append((line['bbox'][0], line['bbox'][1], text))
    return sorted(lines, key=lambda row: (row[1], row[0]))


def source(assets, record):
    file = assets / record['name']
    assert hashlib.sha256(file.read_bytes()).hexdigest() == record['sha256'], file
    return fitz.open(file)


def question_profile(pdf):
    current = None
    questions = {}
    toc_coverage = {'A': 0, 'B': 0}
    section = 'A'
    track_range = None
    for index, page in enumerate(pdf):
        if index == 0:
            continue
        lines = page_lines(page)
        for x, y, text in lines:
            # The specimen splits the last digits of two printed references into
            # distinct text lines at the same baseline.
            if 60 <= x <= 65 and text in {'1', '0 9 . 1'}:
                right_edge = 110 if text == '1' else 145
                continuation = next((other for xx, yy, other in lines
                                     if x + 10 < xx < right_edge and abs(yy - y) < 1
                                     and re.fullmatch(r'\d', other)), '')
                text += continuation
            if 29 <= x <= 65 and y < 760 and (m := re.fullmatch(r'([01])(\d)(?:\.(\d+))?', text.replace(' ', ''))):
                number = int(m[1] + m[2])
                if m[3] is None:
                    current = number
                    questions[current] = {'start_page': index + 1, 'section': section, 'tariffs': [], 'part_pages': {}, 'tracks': track_range}
                    track_range = None
                elif current == number:
                    questions[current]['part_pages'][m[3]] = index + 1
                continue
            if 'END' in text and 'LISTENING' in text.upper() and 'SECTION' in text.upper():
                section = 'B'
            if m := re.match(r'^Track(?:s)?:?\s*([0-9]+)\s*[–—-]\s*([0-9]+)', text, re.I):
                track_range = [int(m[1]), int(m[2])]
            if current and (m := re.search(r'\[(\d+) marks?\]', text, re.I)):
                mark = int(m[1])
                questions[current]['tariffs'].append(mark)
    for q in questions.values():
        toc_coverage[q['section']] += sum(q['tariffs'])
    assert toc_coverage == {'A': 30, 'B': 70}, toc_coverage
    return {'totals': toc_coverage, 'questions': questions, 'page_count': len(pdf)}


def main(root):
    docs = json.loads((root / 'official-manifest.json').read_text())
    manifest = {entry['name'].upper(): entry for entry in docs if entry.get('sha256')}
    result = {}
    for series in ('NOV20', 'NOV21', 'JUN22', 'JUN23', 'JUN24', 'JUN25', 'SPECIMEN'):
        suffix = 'SQP' if series == 'SPECIMEN' else f'QP-{series}'
        question_record = manifest[f'AQA-76921-{suffix}.PDF']
        pdf = source(root / 'assets', question_record)
        result[series] = question_profile(pdf)
        result[series]['first_page_footer'] = [text.strip() for _, _, text in page_lines(pdf[0]) if re.search(r'IB/H/|7692/1', text)]
        result[series]['question_paper'] = question_record['url']
        result[series]['question_paper_sha256'] = question_record['sha256']
    print(json.dumps(result, indent=2))


if __name__ == '__main__':
    main(Path(sys.argv[1]))
