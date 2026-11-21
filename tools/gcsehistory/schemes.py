#!/usr/bin/env python3
"""Index Pearson 1HI0 mark-scheme regions per question part.

A 1HI0 scheme is one table per part, each opened by a "Question" header row followed by the
part's label ("1", "2 (a)", "1 (c) (i)") and wording, then its own target and assessment
objectives, level descriptors (levels of response) or marking instructions, and indicative
content. Everything up to the next "Question" header belongs to that part, including the
"Marks for SPaG" table that follows 5/6 and 3(d). The page title printed above the next
header ("Crime and punishment in Britain, c1000-present") is trimmed. Regions are source pixels,
CropBox-relative (the renderer crops the CropBox view).
"""
import json
import re
import sys

# "2 (a)", "1 (c) (i)", and the bare "2a" that the 2025 Paper 3 scheme prints for 2(a)
LABEL = re.compile(r'^(\d)(?:\s*\(([a-z])\)|([a-z])(?=\s|$))?\s*(?:\(([ivx]+)\))?(?:\s|$)')
STOP = re.compile(r'^Pearson Education Limited')


def rows_of(pdf):
    out = []
    for pi, page in enumerate(pdf.pages):
        mx0, my0, mx1, my1 = page.mediabox
        cx0, cy0, cx1, cy1 = page.cropbox
        frame = (cx0 - mx0, my1 - cy1, cx1 - cx0, cy1 - cy0)
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
            out.append({'page': pi, 'top': r['top'], 'bottom': max(w['bottom'] for w in r['w']), 'x0': r['w'][0]['x0'],
                        'text': text, 'frame': frame, 'width': page.width})
    return out


def regions(rows):
    by_page = {}
    for r in rows:
        box = by_page.setdefault(r['page'], [r['top'], r['bottom'], r['frame'], r['width']])
        box[0], box[1] = min(box[0], r['top']), max(box[1], r['bottom'])
    out = []
    for p, (t, b, (ox, oy, w, h), width) in sorted(by_page.items()):
        fx = lambda x: min(1, max(0, (x - ox) / w))
        fy = lambda y: min(1, max(0, (y - oy) / h))
        out.append({'page': p + 1, 'bbox': [round(fx(15), 6), round(fy(max(oy + 4, t - 6)), 6), round(fx(width - 15), 6), round(fy(min(oy + h - 4, b + 6)), 6)]})
    return out


def normalise(label):
    return re.sub(r'\s+', '', label)


def scheme_regions(path, wanted):
    """wanted: iterable of unit labels ("1", "2(a)", "1(c)(i)"). Returns {label: {'regions': [...], 'text': str}}."""
    import pdfplumber
    with pdfplumber.open(path) as pdf:
        rows = rows_of(pdf)
    heads = []
    for i, r in enumerate(rows):
        if r['text'] != 'Question' or i + 1 >= len(rows):
            continue
        m = LABEL.match(rows[i + 1]['text'])
        if m:
            heads.append((i, ''.join([m.group(1)] + [f'({x})' for x in (m.group(2) or m.group(3), m.group(4)) if x])))
    blocks = {}
    for k, (i, label) in enumerate(heads):
        end = heads[k + 1][0] if k + 1 < len(heads) else len(rows)
        stop = next((j for j in range(i, end) if STOP.match(rows[j]['text'])), end)
        end = min(end, stop)
        # The page title printed above the next table is not this part's scheme.
        while end - 1 > i and end < len(rows) and rows[end - 1]['page'] == rows[end]['page'] and rows[end - 1]['top'] < 70 \
                and rows[end - 1]['x0'] < 70 and not rows[end - 1]['text'].startswith(('•', '1', '2', '3')):
            end -= 1
        if label in blocks:
            raise ValueError(f'Duplicate scheme block for {label}: {path}')
        blocks[label] = rows[i:end]
    out = {}
    for label in wanted:
        if normalise(label) not in blocks:
            continue
        b = blocks[normalise(label)]
        out[label] = {'regions': regions(b), 'text': '\n'.join(r['text'] for r in b)}
    missing = [x for x in wanted if x not in out]
    if missing:
        raise ValueError(f'Scheme regions missing for {missing} (found {sorted(blocks)}): {path}')
    return out


if __name__ == '__main__':
    r = scheme_regions(sys.argv[1], sys.argv[2].split(','))
    print(json.dumps({k: [(x['page'], [round(y, 2) for y in x['bbox']]) for x in v['regions']] for k, v in r.items()}))
