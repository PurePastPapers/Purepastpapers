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


def table_rows(page):
    """Locate labelled rows even when the printed question number is vertically centred."""
    result = {}
    for table in page.find_tables():
        for row, columns in zip(table.rows, table.extract(), strict=True):
            if len(columns) != 4 or row.bbox[0] >= 95 or not all(columns):
                continue
            q, part, guidance, marks = (c.strip() for c in columns)
            if q.isdecimal() and part.isdecimal() and marks.isdecimal() and re.search(r'[A-Za-z]', guidance):
                result[(int(q), int(part))] = row.bbox
    return result


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
        starts, k, table_by_page = [], 0, {}
        for idx, (pi, line) in enumerate(stream):
            if k >= len(labels):
                break
            q, _, part = labels[k].partition('.')
            want = re.compile(rf'^s?0?{int(q)}\s+{part}(?!\d)' if part else rf'^0?{int(q)}\b')
            if line['x0'] < 95 and want.match(line['text']):
                start, row_bounds = idx, None
                if part:
                    if pi not in table_by_page:
                        table_by_page[pi] = table_rows(pdf.pages[pi])
                    bounds = table_by_page[pi].get((int(q), int(part)))
                    if bounds and bounds[1] <= line['top'] < bounds[3]:
                        row_bounds = bounds
                        while start and stream[start - 1][0] == pi and stream[start - 1][1]['top'] >= bounds[1]:
                            start -= 1
                starts.append((labels[k], start, row_bounds, start < idx))
                k += 1
        if k != len(labels):
            raise ValueError(f'Scheme labels not found from {labels[k]} on')
        for n, (label, idx, row_bounds, starts_before_label) in enumerate(starts):
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
            if row_bounds and starts_before_label and regions:
                page = pdf.pages[regions[0]['page'] - 1]
                regions[0]['bbox'][1] = round(row_bounds[1] / page.height, 6)
                if len(regions) == 1 and row_bounds[3] + 10 < regions[0]['bbox'][3] * page.height:
                    regions[0]['bbox'][3] = round(row_bounds[3] / page.height, 6)
            found[label] = regions
        for (before, _, _, _), (after, idx, row_bounds, _) in zip(starts, starts[1:]):
            if not found[before] or not found[after] or not row_bounds:
                continue
            tail, head = found[before][-1], found[after][0]
            pi, first = stream[idx]
            previous_page, last = stream[idx - 1]
            if previous_page != pi or tail['page'] != head['page'] or tail['bbox'][3] <= head['bbox'][1]:
                continue
            page = pdf.pages[pi]
            if tail['bbox'][3] * page.height < first['top'] and head['bbox'][1] * page.height > last['bottom']:
                continue
            # For adjacent rows with minimal spacing, the table rule gives the ownership boundary.
            edge = round(row_bounds[1] / page.height, 6)
            tail['bbox'][3] = min(tail['bbox'][3], edge)
            head['bbox'][1] = max(head['bbox'][1], edge)
    return found
