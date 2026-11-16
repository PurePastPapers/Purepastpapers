#!/usr/bin/env python3
"""Index Pearson English Literature (9ET0/8ET0) mark-scheme regions per question.

A scheme prints, for each set text, a "Question number | Indicative content" table with
one row block per question ("7  Othello / Candidates may refer to..."), followed by the
levels-based marking grid(s) for that section ("Please refer to the Specific Marking
Guidance...", "Level | Mark | Descriptor (AO1, AO2, AO3)", and for Shakespeare a second
AO5 grid). A question's scheme is its own indicative-content block followed by the grid
printed after its table, both kept as source pixels.

Usage (check): schemes.py SCHEME_PDF 7,8,23,24
"""
import re
import sys

HEADER = re.compile(r'^Question\s+(number\s+)?Indicative [Cc]ontent')
GRID = re.compile(r'^(Please refer to (the )?Specific Marking Guidance|Level\s+Mark\b)', re.I)
QROW = re.compile(r'^(\d{1,2})\s+(?!Qualities|No rewardable)[A-Z][a-z]')
SECTION = re.compile(r'^(Paper \d+ Mark scheme\b.*SECTION [A-C]|SECTION [A-C])\b')
FOOTER = re.compile(r'^(PMT|\d{1,2}|Paper \d Mark scheme|Pearson Education Limited.*)$')


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
        mx0, my0, mx1, my1 = page.mediabox
        cx0, cy0, cx1, cy1 = page.cropbox
        for r in rows:
            r['w'].sort(key=lambda w: w['x0'])
            text = ' '.join(w['text'] for w in r['w'])
            if FOOTER.match(text) and not (re.fullmatch(r'\d{1,2}', text) and r['w'][0]['x0'] < page.width * 0.4):
                continue
            out.append({'page': pi, 'top': r['top'], 'bottom': max(w['bottom'] for w in r['w']), 'x0': r['w'][0]['x0'],
                        'text': text, 'frame': (cx0 - mx0, my1 - cy1, cx1 - cx0, cy1 - cy0), 'width': page.width})
    return out


def regions(rows):
    by_page = {}
    for r in rows:
        b = by_page.setdefault(r['page'], [r['top'], r['bottom'], r['frame'], r['width']])
        b[0], b[1] = min(b[0], r['top']), max(b[1], r['bottom'])
    out = []
    for p, (t, b, (ox, oy, w, h), width) in sorted(by_page.items()):
        fx = lambda x: round(min(1, max(0, (x - ox) / w)), 6)
        fy = lambda y: round(min(1, max(0, (y - oy) / h)), 6)
        out.append({'page': p + 1, 'bbox': [fx(15), fy(max(oy + 4, t - 6)), fx(width - 15), fy(min(oy + h - 4, b + 6))]})
    return out


def scheme_regions(path, wanted):
    """wanted: question numbers (strings). Returns {n: {'indicative': [...], 'grid': [...], 'text': str}}."""
    import pdfplumber
    with pdfplumber.open(path) as pdf:
        rows = rows_of(pdf)
    headers = [i for i, r in enumerate(rows) if HEADER.match(r['text'])]
    if not headers:
        raise ValueError(f'No indicative-content tables: {path}')
    heads, expected = [], None
    for h_index, h in enumerate(headers):
        col = rows[h]['x0']
        end = headers[h_index + 1] if h_index + 1 < len(headers) else len(rows)
        for i in range(h + 1, end):
            r = rows[i]
            m = re.match(r'^(\d{1,2})(?:\s+\S.*)?$', r['text'])
            if not m or r['x0'] > col + 20:
                continue
            n = int(m.group(1))
            if expected is None or n == expected:
                heads.append((i, str(n), h_index))
                expected = n + 1
    grids = [i for i, r in enumerate(rows) if GRID.match(r['text'])]
    marks = [i for i, r in enumerate(rows) if SECTION.match(r['text'])]
    head_rows = [i for i, _, _ in heads]
    qrows = [i for i, r in enumerate(rows) if QROW.match(r['text']) and r['x0'] < 95]
    out = {}
    for k, (i, n, h_index) in enumerate(heads):
        if n not in wanted:
            continue
        nxt = heads[k + 1][0] if k + 1 < len(heads) else len(rows)
        h = headers[h_index]
        table_end = headers[h_index + 1] if h_index + 1 < len(headers) else len(rows)
        g = next((x for x in grids if x > i), None)
        if g is not None and any(i < x < g for x in marks):
            g = None             # the next grid belongs to a later section (grids printed before tables)
        if g is not None:        # the grid follows the text's table, or all of its section's tables
            ind_end = min(nxt, g, table_end)
            later = [x for x in headers + qrows + marks if x > g]
            grid_rows = rows[g:min(later + [len(rows)])]
        else:                    # 2022 layout: the section's grid(s) precede its first table
            ind_end = min(nxt, table_end, next((x for x in marks if x > i), len(rows)))
            before = [x for x in grids if x < h]
            if not before:
                raise ValueError(f'No marking grid for question {n}: {path}')
            last_q = max([x for x in head_rows if x < before[-1]], default=-1)
            start = min(x for x in grids if last_q < x <= before[-1])
            end = next(x for x in headers if x > start)
            grid_rows = rows[start:end]
        out[n] = {'indicative': regions(rows[i:ind_end]), 'grid': regions(grid_rows),
                  'text': '\n'.join(r['text'] for r in rows[i:ind_end]),
                  'grid_text': '\n'.join(r['text'] for r in grid_rows)}
    missing = [n for n in wanted if n not in out]
    if missing:
        raise ValueError(f'Scheme regions missing for questions {missing}: {path}')
    return {n: out[n] for n in wanted}


if __name__ == '__main__':
    r = scheme_regions(sys.argv[1], sys.argv[2].split(','))
    for n, v in r.items():
        print(n, [x['page'] for x in v['indicative']], [x['page'] for x in v['grid']], v['text'][:80].replace('\n', ' / '))
