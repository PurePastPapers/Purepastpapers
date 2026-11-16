#!/usr/bin/env python3
"""Locate each scored unit's official scheme in an AQA Geography mark scheme.

AQA prints each part as a table row that starts with its label ("01 4 With reference
to ..."), followed by its indicative content and, for levels-marked parts, its own
"Marking grid for Question 01.4". A unit's scheme therefore runs from its label row
to the next part's label row (or the next "Question N <topic>" heading). Labels are
found strictly in paper order, so a stray number in the notes never starts a scheme.
The general "Level of response marking instructions" pages are not repeated per unit.
"""
import re

HEADING = re.compile(r'^Question \d+\s+[A-Z]')
END = re.compile(r'^(Copyright information|There are no|END OF)', re.I)


def scheme_regions(path, labels):
    """labels: unit labels in paper order, e.g. ['1.1', '1.2', ...]. Returns {label: [regions]}."""
    import pdfplumber
    found = {}
    with pdfplumber.open(path) as pdf:
        stream = []
        for pi, page in enumerate(pdf.pages):
            if pi < 2:
                continue   # cover and general marking guidance
            for line in page.extract_text_lines():
                if 40 < line['top'] < page.height - 40:
                    stream.append((pi, line))
        starts, k = [], 0
        for idx, (pi, line) in enumerate(stream):
            if k >= len(labels):
                break
            q, _, part = labels[k].partition('.')
            want = re.compile(rf'^0?{int(q)}\s*\.?\s*{part}\b' if part else rf'^0?{int(q)}\b')
            stacked = part and idx + 1 < len(stream) and stream[idx + 1][0] == pi and \
                re.match(rf'^0 {part}\s', line['text']) and stream[idx + 1][1]['text'].startswith(f'{int(q)} ')
            if line['x0'] < 95 and (want.match(line['text']) or stacked):   # a label may print stacked ("0 1" over "3")
                starts.append((labels[k], idx))
                k += 1
        if k != len(labels):
            raise ValueError(f'Scheme labels not found from {labels[k]} on')
        for n, (label, idx) in enumerate(starts):
            end = starts[n + 1][1] if n + 1 < len(starts) else len(stream)
            for j in range(idx + 1, end):
                if HEADING.match(stream[j][1]['text']) or END.match(stream[j][1]['text']):
                    end = j
                    break
            by_page = {}
            for pi, line in stream[idx:end]:
                box = by_page.setdefault(pi, [line['top'], line['bottom']])
                box[0], box[1] = min(box[0], line['top']), max(box[1], line['bottom'])
            regions = []
            for pi in sorted(by_page):
                page = pdf.pages[pi]
                top, bottom = by_page[pi]
                # Table rules/grids of this scheme on the page extend the band slightly.
                regions.append({'page': pi + 1, 'bbox': [round(20 / page.width, 6), round(max(30, top - 8) / page.height, 6),
                                                         round((page.width - 20) / page.width, 6),
                                                         round(min(page.height - 30, bottom + 8) / page.height, 6)]})
            found[label] = regions
    return found
