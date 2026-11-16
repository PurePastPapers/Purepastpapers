#!/usr/bin/env python3
"""Index Pearson 9HI0 mark-scheme regions per question.

A 9HI0 scheme prints generic level descriptors per section ("Generic Level Descriptors:
Section A", "Sections B and C", "Section C" ...) and then a "Question | Indicative
content" table per question. A question's scheme is its section's level descriptors
followed by its own indicative content, both kept as source pixels.
"""
import json
import re
import sys

LEVELS = re.compile(r'^(?:Generic Level Descriptors:?\s*)?Sections? ([A-C])(?: and ([A-C]))?\s*$', re.I)
INDICATIVE = re.compile(r'^Section ([A-C]):? [Ii]ndicative content', re.I)
FOOTER = re.compile(r'^PMT$')


def rows_of(pdf):
    out = []
    for pi, page in enumerate(pdf.pages):
        words = [w for w in page.extract_words() if 15 < w['x0'] < page.width - 15 and 25 < w['top'] < page.height - 25]
        rows = []
        for w in sorted(words, key=lambda w: (round(w['top']), w['x0'])):
            if rows and abs(rows[-1]['top'] - w['top']) < 3:
                rows[-1]['w'].append(w)
            else:
                rows.append({'top': w['top'], 'w': [w]})
        for r in rows:
            r['w'].sort(key=lambda w: w['x0'])
            text = ' '.join(w['text'] for w in r['w'])
            if FOOTER.match(text):
                continue
            mx0, my0, mx1, my1 = page.mediabox
            cx0, cy0, cx1, cy1 = page.cropbox
            out.append({'page': pi, 'top': r['top'], 'bottom': max(w['bottom'] for w in r['w']), 'x0': r['w'][0]['x0'],
                        'text': text, 'frame': (cx0 - mx0, my1 - cy1, cx1 - cx0, cy1 - cy0), 'width': page.width})
    return out


def regions(rows):
    """CropBox-relative fractions (the renderer crops the CropBox view)."""
    by_page = {}
    for r in rows:
        box = by_page.setdefault(r['page'], [r['top'], r['bottom'], r['frame'], r['width']])
        box[0], box[1] = min(box[0], r['top']), max(box[1], r['bottom'])
    out = []
    for p, (t, b, (ox, oy, w, h), width) in sorted(by_page.items()):
        fx = lambda x: min(1, max(0, (x - ox) / w))
        fy = lambda y: min(1, max(0, (y - oy) / h))
        out.append({'page': p + 1, 'bbox': [fx(15), fy(max(oy + 4, t - 6)), fx(width - 15), fy(min(oy + h - 4, b + 6))]})
    return out


def scheme_regions(path, wanted):
    """wanted: {question number: section letter}. Returns {n: {'levels': [...], 'indicative': [...]}}."""
    import pdfplumber
    with pdfplumber.open(path) as pdf:
        rows = rows_of(pdf)
    level_heads = [(i, {m.group(1), m.group(2)} - {None}) for i, r in enumerate(rows) if (m := LEVELS.match(r['text']))]
    first_indicative = next(i for i, r in enumerate(rows) if INDICATIVE.match(r['text']) or r['text'].startswith('Question Indicative content'))
    level_heads = [(i, s) for i, s in level_heads if i < first_indicative]
    levels = {}
    for k, (i, letters) in enumerate(level_heads):
        end = level_heads[k + 1][0] if k + 1 < len(level_heads) else first_indicative
        for letter in letters:
            levels[letter] = regions(rows[i:end])
    # Question blocks: a row starting with the question number in the left "Question" column.
    heads, column = [], None
    for i in range(first_indicative, len(rows)):
        if rows[i]['text'].startswith('Question Indicative content'):
            column = rows[i]['x0']   # the "Question" column of this table
            continue
        # The 2025 Paper 3 scheme prints its "2" cell twice, extracted as "22".
        m = re.match(r'^(\d)\1?(?:\s+\S|$)', rows[i]['text'])
        if m and column is not None and rows[i]['x0'] < column + 15 and not any(h[1] == m.group(1) for h in heads) and \
                (not heads or int(m.group(1)) > int(heads[-1][1])):
            heads.append((i, m.group(1)))
    stops = [i for i, r in enumerate(rows) if i > first_indicative and (INDICATIVE.match(r['text']) or r['text'].startswith('Question Indicative content')
                                                                       or r['text'].startswith('Pearson Education Limited'))]
    out = {}
    for k, (i, n) in enumerate(heads):
        nxt = heads[k + 1][0] if k + 1 < len(heads) else len(rows)
        # Stop before the next table header that introduces the next question.
        end = min([s for s in stops if i < s < nxt and (nxt - s <= 3 or nxt == len(rows))] + [nxt])
        if n in wanted:
            letter = wanted[n]
            if letter not in levels:
                raise ValueError(f'No level descriptors for Section {letter}: {path}')
            out[n] = {'levels': levels[letter], 'indicative': regions(rows[i:end])}
    missing = [n for n in wanted if n not in out]
    if missing:
        raise ValueError(f'Scheme regions missing for questions {missing}: {path}')
    return out


if __name__ == '__main__':
    wanted = dict(x.split(':') for x in sys.argv[2].split(','))
    r = scheme_regions(sys.argv[1], wanted)
    print(json.dumps({k: {'levels': [x['page'] for x in v['levels']], 'indicative': [x['page'] for x in v['indicative']]} for k, v in r.items()}))
