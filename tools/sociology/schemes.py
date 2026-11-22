#!/usr/bin/env python3
"""Locate each scored unit's official scheme in an AQA Psychology mark scheme.

Adapted from tools/geography/schemes.py. AQA prints each question's scheme from a
label row ("0 5 Discuss determinism in psychology ...", specimen "02.1", "0 2 . 1")
followed by "Marks for this question", its own levels grid (for levels-marked
questions) and its possible content. A unit's scheme runs from its label row to the
next unit's label row. Labels are matched strictly in paper order and must be followed
by question wording, so a levels-grid row such as "1 1–2" never starts a scheme. The
general "Level of response marking instructions" pages are not repeated per unit.
"""
import re

END = re.compile(r'^(?:Copyright|There are no|END OF|Assessment Objectives?(?:$| (?:Grid|by question))|Topic [AB]\d+\s)', re.I)
TABLE_HEADER = re.compile(r'^(?:Qu|Question)\s+Marking guidance(?:\s+Total(?:\s+marks)?)?$', re.I)
TABLE_HEADER_FRAGMENT = {'total', 'marks', 'total marks'}


def label_pattern(label):
    q, _, part = label.partition('.')
    n = f'{int(q):02}'
    head = rf'(?:0\s?)?{n[1]}' if n[0] == '0' else rf'{n[0]}\s?{n[1]}'
    if part:
        head += r'\s?\.?\s?' + r'\s?'.join(part)
    return re.compile(rf'^{head}(?:\s*\([a-z]\))?\s+[A-Z‘\'"(]'), re.compile(rf'^{head}(?:\s+(\d{{1,2}})|\s+[a-z][^−–-].*)?$')


def scheme_regions(path, labels, skip_pages=2, marks=None):
    """labels: unit labels in paper order, e.g. ['1', '2', '3.1', ...]. Returns {label: [regions]}.

    Sociology schemes print each question in a table row: the label may sit on its own line
    with only the tariff ("07   20") and the question wording on the line above. Such a row
    counts only when its tariff equals the unit's marks (marks: {label: marks}); the region
    then starts at the wording line above it."""
    import pdfplumber
    found = {}
    with pdfplumber.open(path) as pdf:
        stream = []
        for pi, page in enumerate(pdf.pages):
            if pi < skip_pages:
                continue
            for line in page.extract_text_lines():
                if 40 < line['top'] < page.height - 40:
                    stream.append((pi, line))
        starts, k = [], 0
        for idx, (pi, line) in enumerate(stream):
            if k >= len(labels):
                break
            full, bare = label_pattern(labels[k])
            if line['x0'] < 110 and full.match(line['text']):
                starts.append((labels[k], idx))
                k += 1
            elif 50 <= line['x0'] < 110 and marks and (m := bare.match(line['text'].strip())) and (m.group(1) is None or int(m.group(1)) == marks[labels[k]]):
                prev = stream[idx - 1][1] if idx else None
                above = prev is not None and stream[idx - 1][0] == pi and -14 < line['top'] - prev['bottom'] < 14 and prev['x0'] > line['x0']
                if m.group(1) is None and not above:
                    continue
                starts.append((labels[k], idx - 1 if above else idx))
                k += 1
        if k != len(labels):
            raise ValueError(f'Scheme labels not found from {labels[k]} on')
        for n, (label, idx) in enumerate(starts):
            end = starts[n + 1][1] if n + 1 < len(starts) else len(stream)
            for j in range(idx + 1, end):
                if END.match(stream[j][1]['text']):
                    end = j
                    break
            header = end - 1
            while header > idx and stream[header][1]['text'].strip().lower() in TABLE_HEADER_FRAGMENT:
                header -= 1
            if header > idx and TABLE_HEADER.fullmatch(stream[header][1]['text'].strip()):
                end = header
                while end > idx + 1 and stream[end - 1][1]['text'].strip().lower() in TABLE_HEADER_FRAGMENT:
                    end -= 1
            by_page = {}
            for pi, line in stream[idx:end]:
                if re.fullmatch(r'\d{1,2}', line['text'].strip()):
                    continue   # page number
                box = by_page.setdefault(pi, [line['top'], line['bottom']])
                box[0], box[1] = min(box[0], line['top']), max(box[1], line['bottom'])
            regions = []
            for pi in sorted(by_page):
                page = pdf.pages[pi]
                top, bottom = by_page[pi]
                limit = page.height - 30
                if end < len(stream) and stream[end][0] == pi:
                    # The next row can sit less than 8 pt below this scheme's last line.
                    limit = min(limit, max(bottom, stream[end][1]['top']))
                bottom = min(bottom + 8, limit)
                regions.append({'page': pi + 1, 'bbox': [round(20 / page.width, 6), round(max(30, top - 8) / page.height, 6),
                                                         round((page.width - 20) / page.width, 6),
                                                         round(bottom / page.height, 6)]})
            found[label] = regions
            text = ' '.join(l['text'] for _, l in stream[idx:end])
            m = re.search(r'Marks for (?:this|each) (?:question|part)\s*:?\s*((?:AO\d\s*[=-]\s*\d+(?:\s*marks?)?\s*(?:and|,|;)?\s*)+)', text)
            if m:
                found[label + '#ao'] = {ao: int(v) for ao, v in re.findall(r'(AO\d)\s*[=-]\s*(\d+)', m.group(1))}
    return found
