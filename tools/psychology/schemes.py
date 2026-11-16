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

END = re.compile(r'^(Copyright|There are no|END OF|Assessment Objectives? (?:Grid|grid|by question))', re.I)


def label_pattern(label):
    q, _, part = label.partition('.')
    n = f'{int(q):02}'
    head = rf'(?:0\s?)?{n[1]}' if n[0] == '0' else rf'{n[0]}\s?{n[1]}'
    if part:
        head += r'\s?\.?\s?' + r'\s?'.join(part)
    return re.compile(rf'^{head}(?:\s*\([a-z]\))?\s+[A-Z‘\'"(]')


def scheme_regions(path, labels, skip_pages=2):
    """labels: unit labels in paper order, e.g. ['1', '2', '3.1', ...]. Returns {label: [regions]}."""
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
            if line['x0'] < 110 and label_pattern(labels[k]).match(line['text']):
                starts.append((labels[k], idx))
                k += 1
        if k != len(labels):
            raise ValueError(f'Scheme labels not found from {labels[k]} on')
        for n, (label, idx) in enumerate(starts):
            end = starts[n + 1][1] if n + 1 < len(starts) else len(stream)
            for j in range(idx + 1, end):
                if END.match(stream[j][1]['text']):
                    end = j
                    break
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
                regions.append({'page': pi + 1, 'bbox': [round(20 / page.width, 6), round(max(30, top - 8) / page.height, 6),
                                                         round((page.width - 20) / page.width, 6),
                                                         round(min(page.height - 30, bottom + 8) / page.height, 6)]})
            found[label] = regions
            text = ' '.join(l['text'] for _, l in stream[idx:end])
            m = re.search(r'Marks for (?:this|each) (?:question|part)\s*:?\s*((?:AO\d\s*[=-]\s*\d+(?:\s*marks?)?\s*(?:and|,|;)?\s*)+)', text)
            if m:
                found[label + '#ao'] = {ao: int(v) for ao, v in re.findall(r'(AO\d)\s*[=-]\s*(\d+)', m.group(1))}
    return found
