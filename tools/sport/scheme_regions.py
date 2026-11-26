#!/usr/bin/env python3
"""Extract candidate rubric rows from OCR's ruled mark scheme grids."""
from collections import OrderedDict
import re


def region(page, p, xy):
    x0, y0, x1, y1 = xy
    return [page, x0 / p.rect.width, y0 / p.rect.height, x1 / p.rect.width, y1 / p.rect.height]


def parse(doc, bounds):
    items = OrderedDict()
    previous = None
    number = None
    letter = ''
    for page_number in range(bounds[0] - 1, bounds[1]):
        page = doc[page_number]
        for table in page.find_tables().tables:
            values = table.extract()
            if not values or not values[0]:
                continue
            first = (values[0][0] or '').strip()
            if first == 'Question' and {'Answer', 'Marks', 'Guidance'} <= set(values[0]):
                for row, data in zip(table.rows[1:], values[1:]):
                    if len(data) != 6 or not row.cells[3]:
                        continue
                    n, part, roman, answer, marks, guidance = [(cell or '').strip() for cell in data]
                    if not (answer or guidance):
                        continue
                    a0, a1 = row.cells[3][1::2]
                    clip = region(page_number, page, (table.bbox[0], a0, table.bbox[2], a1))
                    if not (n or part or roman):
                        if previous and not marks:
                            previous['regions'].append(clip)
                        continue
                    if not re.fullmatch(r'\d{1,2}', marks) or (n and not re.fullmatch(r'\d{1,2}\*?', n)):
                        raise ValueError(f'Unexpected OCR answer row on PDF page {page_number + 1}: {data[:3]} / {marks}')
                    if n:
                        number = n.rstrip('*')
                        letter = ''
                    if part.strip('()*'):
                        letter = f'({part.strip("()*")})'
                    subpart = f'({roman.strip("()*")})' if roman.strip('()*') else ''
                    label = f'{number}{letter}{subpart}'
                    if label in items:
                        raise ValueError(f'Duplicate printed label {label} on PDF page {page_number + 1}')
                    previous = {'marks': int(marks), 'regions': [clip],
                                'levels': '*' in n + part + roman or bool(re.search(r'\bLevel [123] \(', guidance))}
                    items[label] = previous
                continue
            rubric = re.fullmatch(r'(\d+)((?:\s*\([a-z]+\))*)\s*\*?\s+.*?[–—-]\s*(\d+)\s+marks', first, re.S | re.I)
            if rubric:
                label = rubric[1] + re.sub(r'\s+', '', rubric[2])
                previous = items.setdefault(label, {'marks': int(rubric[3]), 'regions': [], 'levels': True})
                if previous['marks'] != int(rubric[3]):
                    raise ValueError(f'Conflicting rubric marks for {label}')
                previous['regions'].append(region(page_number, page, table.bbox))
    return items
