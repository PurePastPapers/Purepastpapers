#!/usr/bin/env python3
"""Index AQA 7152 mark-scheme regions per question.

AQA Politics schemes print, per section, a "Levels of response mark scheme for ..."
descriptor grid naming the questions it covers, then one "Indicative content" block
per question. A question's scheme is its section's descriptor grid followed by its
own indicative content, both kept as source pixels. Level rows such as "0 0 •" or
"3 7–9 •" are not question headings; headings are "0 n" or "Question n:".
"""
import re
import sys
import json

HEAD = re.compile(r'^(?:0 ([1-9])(?![–\-\d])\b|Question ([1-9]):)')
GRID = re.compile(r'^Levels? of response mark[ -]?scheme for', re.I)


def rows_of(pdf):
    out = []
    for pi, page in enumerate(pdf.pages):
        words = [w for w in page.extract_words() if 20 < w['x0'] < page.width - 20 and 30 < w['top'] < page.height - 30]
        rows = []
        for w in sorted(words, key=lambda w: (round(w['top']), w['x0'])):
            if rows and abs(rows[-1]['top'] - w['top']) < 3:
                rows[-1]['w'].append(w)
            else:
                rows.append({'top': w['top'], 'w': [w]})
        for r in rows:
            r['w'].sort(key=lambda w: w['x0'])
            text = ' '.join(w['text'] for w in r['w'])
            if text.startswith('MARK SCHEME') or re.fullmatch(r'\d{1,2}', text):
                continue
            out.append({'page': pi, 'top': r['top'], 'bottom': max(w['bottom'] for w in r['w']), 'text': text,
                        'height': page.height, 'width': page.width})
    return out


def regions(rows, start, end):
    by_page = {}
    for r in rows[start:end]:
        box = by_page.setdefault(r['page'], [r['top'], r['bottom'], r['height'], r['width']])
        box[0], box[1] = min(box[0], r['top']), max(box[1], r['bottom'])
    return [{'page': p + 1, 'bbox': [20 / w, max(25, t - 6) / h, (w - 20) / w, min(h - 25, b + 6) / h]}
            for p, (t, b, h, w) in sorted(by_page.items())]


def scheme_regions(path, numbers):
    import pdfplumber
    with pdfplumber.open(path) as pdf:
        rows = rows_of(pdf)
    first = next(i for i, r in enumerate(rows) if GRID.match(r['text']))
    rows = rows[first:]
    # Include a "Section X" line printed immediately before a grid.
    grids = [i for i, r in enumerate(rows) if GRID.match(r['text'])]
    grid_starts = [i - 1 if i and rows[i - 1]['text'].startswith('Section') else i for i in grids]
    heads = []
    for i, r in enumerate(rows):
        m = HEAD.match(r['text'])
        if m and any('Indicative content' in x['text'] for x in rows[i + 1:i + 6]):
            heads.append((i, m.group(1) or m.group(2)))
    head_rows = [i for i, _ in heads]
    out = {}
    for gi, g in enumerate(grid_starts):
        g_end = next((i for i in head_rows if i > g), len(rows))
        covered = {(HEAD.match(r['text']).group(1) or HEAD.match(r['text']).group(2))
                   for r in rows[g:g_end] if HEAD.match(r['text'])}
        for i, n in heads:
            if n not in covered or i < g:
                continue
            following = [x for x in head_rows + grid_starts if x > i]
            end = min(following) if following else len(rows)
            out[n] = {'levels': regions(rows, g, g_end), 'indicative': regions(rows, i, end)}
    missing = [n for n in numbers if n not in out]
    if missing:
        raise ValueError(f'Scheme regions missing for questions {missing}: {path}')
    return out


if __name__ == '__main__':
    r = scheme_regions(sys.argv[1], sys.argv[2].split(','))
    print(json.dumps({k: {'levels': [x['page'] for x in v['levels']], 'indicative': [x['page'] for x in v['indicative']]} for k, v in r.items()}))
