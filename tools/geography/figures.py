#!/usr/bin/env python3
"""Index the figures printed in AQA Geography inserts (standard and modified variants).

Each figure heading ("Figure 1a", "Table 2") starts a vertical band that runs to the
next heading on the page, or the page foot. A page with no heading (a key or a
continued figure) is added to the figures it names ("Key for Figure 3a and Figure
3b"), or else to the previous figure. A figure is marked removed when its band
carries AQA's copyright notice ("not reproduced here due to third-party copyright
restrictions"). Bands are source-pixel regions for the build; nothing is re-typed.
"""
import hashlib
import re
from pathlib import Path

HEAD = re.compile(r'^(Figure|Table)s? (\d{1,2}[a-z]?)(?: (?:and|&) (?:Figure |Table )?(\d{1,2}[a-z]?))?\b')
NAMED = re.compile(r'\b(Figure|Table)s? (\d{1,2}[a-z]?)')
REMOVED = re.compile(r'not reproduced here|cannot be reproduced|copyright restrictions|has been removed', re.I)
FOOT = re.compile(r'^(IB/|G/|Turn over|\d{1,2}$|\*|Copyright|END OF|There are no|Insert|Do not)', re.I)


def rows_of(page):
    words = [w for w in page.extract_words() if 40 < w['top'] < page.height - 40 and w['x0'] < page.width - 20]
    rows = []
    for w in sorted(words, key=lambda w: (round(w['top']), w['x0'])):
        if rows and abs(rows[-1]['top'] - w['top']) < 3:
            rows[-1]['words'].append(w)
        else:
            rows.append({'top': w['top'], 'words': [w]})
    for r in rows:
        r['words'].sort(key=lambda w: w['x0'])
        r['text'] = ' '.join(w['text'] for w in r['words']).strip()
        r['bottom'] = max(w['bottom'] for w in r['words'])
    return rows


def index_insert(path):
    import pdfplumber
    import pypdfium2 as pdfium
    figures, order, last = {}, [], None
    document = pdfium.PdfDocument(str(path))
    with pdfplumber.open(path) as pdf:
        for pi, page in enumerate(pdf.pages):
            if pi == 0:
                continue   # cover lists contents only
            plain = page.extract_text() or ''
            if re.search(r'There are no resources printed on this page|Copyright information', plain):
                continue   # blank or acknowledgements page
            chars = page.chars
            if chars and sum(not c.get('upright', True) for c in chars) > len(chars) / 2:
                # A landscape figure: pdfplumber reads its text reversed, PDFium in order.
                text = document[pi].get_textpage().get_text_range()
                names = []
                for k, n in NAMED.findall(text[:400]):
                    if f'{k} {n}' not in names:
                        names.append(f'{k} {n}')
                names = names or ([last] if last else [])   # a landscape page can hold two figures
                for name in names:
                    fig = figures.setdefault(name, {'regions': [], 'removed': False})
                    if name not in order:
                        order.append(name)
                    fig['regions'].append({'page': pi + 1, 'bbox': [20 / page.width, 36 / page.height,
                                                                   (page.width - 20) / page.width, (page.height - 36) / page.height]})
                    fig['removed'] |= bool(REMOVED.search(text))
                    fig['landscape'] = True
                    last = name
                continue
            rows = rows_of(page)
            heads = []
            for r in rows:
                m = HEAD.match(r['text'])
                # a heading is a short line: the label, maybe a title, never a sentence about the figure
                if m and (len(r['text'].split()) <= 3 or not re.search(r'\b(shows|show|is|are|represents)\b', r['text'])):
                    heads.append((r['top'], [f'{m.group(1)} {m.group(2)}'] + ([f'{m.group(1)} {m.group(3)}'] if m.group(3) else [])))
            content = [r for r in rows if not FOOT.match(r['text'])]
            page_text = ' '.join(r['text'] for r in content)
            bottom_limit = page.height - 40
            if not heads:
                if not content:
                    continue
                named = []
                if re.match(r'^Key\b', content[0]['text']):
                    named = [f'{k} {n}' for k, n in NAMED.findall(content[0]['text'])]
                targets = [n for n in named if n in figures] or ([last] if last else [])
                for name in targets:
                    figures[name]['regions'].append({'page': pi + 1, 'bbox': [20 / page.width, max(36, content[0]['top'] - 6) / page.height,
                                                                             (page.width - 20) / page.width, bottom_limit / page.height]})
                    figures[name]['removed'] |= bool(REMOVED.search(page_text))
                continue
            for k, (top, names) in enumerate(heads):
                end = heads[k + 1][0] - 4 if k + 1 < len(heads) else bottom_limit
                band_text = ' '.join(r['text'] for r in content if top - 1 <= r['top'] < end)
                for name in names:
                    fig = figures.setdefault(name, {'regions': [], 'removed': False})
                    if name not in order:
                        order.append(name)
                    fig['regions'].append({'page': pi + 1, 'bbox': [20 / page.width, max(36, top - 6) / page.height,
                                                                   (page.width - 20) / page.width, end / page.height]})
                    fig['removed'] |= bool(REMOVED.search(band_text))
                    last = name
            # text above the first heading on a page continues the previous figure (rare)
    for fig in figures.values():
        fig['regions'] = [{'page': r['page'], 'bbox': [round(x, 6) for x in r['bbox']]} for r in fig['regions']]
    return {'source_sha256': hashlib.sha256(Path(path).read_bytes()).hexdigest(), 'figures': figures, 'order': order}


if __name__ == '__main__':
    import json
    import sys
    for f in sys.argv[1:]:
        idx = index_insert(f)
        print(Path(f).name, len(idx['figures']), 'figures; removed:', [n for n, v in idx['figures'].items() if v['removed']])
        print('   ', {n: [r['page'] for r in v['regions']] for n, v in idx['figures'].items()})
