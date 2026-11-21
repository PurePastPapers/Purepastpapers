#!/usr/bin/env python3
"""Locate each scored unit's official scheme in an AQA GCSE Geography 8035 mark scheme.

AQA prints a "Qu | Pt | Marking guidance | Total marks" table: each part is a row that starts
with its question and part numbers ("01 4 With reference to ..."), followed by its
indicative content, level descriptors and SPaG grid. A unit's scheme runs from its label row
to the next part's label row (or a "Section B" heading). The repeated table header line
("Qu Pt Marking guidance Total") is not part of any scheme. Labels are found strictly in
paper order, so a stray number in the notes never starts a scheme. The general marking
instructions (first pages) are not repeated per unit.
"""
import re

HEADING = re.compile(r'^Section [A-D]\s*$')
TABLE_HEAD = re.compile(r'^(Qu Pt Marking guidance|marks$|Qu Pt$)', re.I)
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
                if 40 < line['top'] < page.height - 40 and not TABLE_HEAD.match(line['text']):
                    stream.append((pi, line))
        starts, k = [], 0
        for idx, (pi, line) in enumerate(stream):
            if k >= len(labels):
                break
            q, _, part = labels[k].partition('.')
            want = re.compile(rf'^s?0?{int(q)}\s+{part}(?!\d)' if part else rf'^0?{int(q)}\b')
            if line['x0'] < 95 and want.match(line['text']):
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
