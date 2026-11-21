#!/usr/bin/env python3
"""Index the figures printed in AQA GCSE Geography 8035 inserts and Paper 3 resource booklets.

Sources: the Paper 3 pre-release resource booklet ("Figure 1 ... Figure 3", each followed by a
"Figure n continued" page), OS map key inserts ("Key for the OS map extract (Figure 14)": indexed
as "Key for Figure 14", or the generic "Key" when it names no figure), and colour inserts that
print a map ("Figure 9 - for use with Question 3"). The June 2024 resource booklet and the
Paper 3 specimen resources have no text layer (outlined type), so their figure pages are listed
in NOTEXT after being read by eye. Modified (MQP) inserts are never used.

Each figure heading ("Figure 1a", "Table 2") starts a vertical band that runs to the next
heading on the page, or the page foot. A page with no heading (a key or a continued figure) is
added to the figures it names, or else to the previous figure. A figure is marked removed when its
band carries AQA's copyright notice ("not reproduced here due to third-party copyright
restrictions"). Bands are source-pixel regions for the build; nothing is re-typed.
"""
import hashlib
import re
from pathlib import Path

HEAD = re.compile(r'^(Figure|Table)s? (\d{1,2}[a-z]?)(?: (?:and|&) (?:Figure |Table )?(\d{1,2}[a-z]?))?\b')
NAMED = re.compile(r'\b(Figure|Table)s? (\d{1,2}[a-z]?)')
REMOVED = re.compile(r'not reproduced here|cannot be reproduced|copyright restrictions|has been removed', re.I)
FOOT = re.compile(r'^(IB/|G/|Turn over|\d{1,2}$|\*|Copyright|END OF|There are no|Insert|Do not)', re.I)
BLANK = re.compile(r'There (?:are|is) no (?:resources|resource material|material) printed on this page|Copyright information')
ACK = re.compile(r'^(Acknowledgement|Copyright information|Permission to reproduce)', re.I)
KEYHEAD = re.compile(r'^(OS map extract key|Key for)\b', re.I)
LISTED = re.compile(r'Figures?\s+(\d{1,2}[a-z]?(?:(?:,\s*|\s+and\s+|\s*&\s*)(?:Figure\s+)?\d{1,2}[a-z]?)*)')
# Booklets whose pages carry no text layer: figure -> pages (read by eye from the rendered pages).
NOTEXT = {'AQA-80353-CM-JUN24.PDF': {'Figure 1': [2, 3], 'Figure 2': [4, 5], 'Figure 3': [6, 7]},
          'AQA-80353-SIN-2024.PDF': {'Figure 2': [2, 3], 'Figure 4': [4, 5], 'Figure 5': [6, 7]}}


def key_names(text):
    names = []
    for m in LISTED.finditer(text):
        names += [f'Figure {n}' for n in re.findall(r'\d{1,2}[a-z]?', m.group(1))]
    return names


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


def full_page(page):
    return {'bbox': [20 / page.width, 36 / page.height, (page.width - 20) / page.width, (page.height - 36) / page.height]}


def index_insert(path):
    import pdfplumber
    import pypdfium2 as pdfium
    path = Path(path)
    figures, order, last = {}, [], None
    document = pdfium.PdfDocument(str(path))

    def add(name, page_no, bbox, removed):
        nonlocal last
        fig = figures.setdefault(name, {'regions': [], 'removed': False})
        if name not in order:
            order.append(name)
        fig['regions'].append({'page': page_no, 'bbox': bbox})
        fig['removed'] |= bool(removed)
        last = name

    notext = NOTEXT.get(path.name, {})
    pages_of = {pg: name for name, pgs in notext.items() for pg in pgs}
    with pdfplumber.open(path) as pdf:
        for pi, page in enumerate(pdf.pages):
            if pi == 0:
                continue   # cover lists contents only
            if notext:
                if (pi + 1) in pages_of:
                    add(pages_of[pi + 1], pi + 1, full_page(page)['bbox'], False)
                continue
            plain = page.extract_text() or ''
            chars = page.chars
            if chars and sum(not c.get('upright', True) for c in chars) > len(chars) / 2:
                # A landscape page: pdfplumber reads its text reversed, PDFium in order.
                text = document[pi].get_textpage().get_text_range()
                if re.search(r'\bkey\b', text[:400], re.I):
                    names = [f'Key for {n}' for n in key_names(text[:400])] or ['Key']
                else:
                    names = []
                    for k, n in NAMED.findall(text[:400]):
                        if f'{k} {n}' not in names:
                            names.append(f'{k} {n}')
                    names = names or ([last] if last else [])   # a landscape page can hold two figures
                for name in names:
                    add(name, pi + 1, full_page(page)['bbox'], REMOVED.search(text))
                    figures[name]['regions'][-1]['rotate'] = True   # the page is printed sideways: the build turns it upright
                continue
            rows = rows_of(page)
            bottom_limit = page.height - 40
            for r in rows:
                if ACK.match(r['text']):
                    bottom_limit = min(bottom_limit, r['top'] - 6)   # a printed acknowledgement is not part of the figure
                    break
            rows = [r for r in rows if r['top'] < bottom_limit]
            heads = []
            for r in rows:
                m = HEAD.match(r['text'])
                # a heading is a short line: the label, maybe a title, never a sentence about the figure
                if m and (len(r['text'].split()) <= 3 or not re.search(r'\b(shows|show|is|are|represents)\b', r['text'])):
                    heads.append((r['top'], [f'{m.group(1)} {m.group(2)}'] + ([f'{m.group(1)} {m.group(3)}'] if m.group(3) else [])))
            if BLANK.search(plain) and not heads:
                continue   # blank or acknowledgements page
            content = [r for r in rows if not FOOT.match(r['text'])]
            page_text = ' '.join(r['text'] for r in content)
            if not heads:
                if not content:
                    continue
                if KEYHEAD.match(content[0]['text']):
                    names = [f'Key for {n}' for n in key_names(content[0]['text'])] or ['Key']
                    for name in names:
                        add(name, pi + 1, [20 / page.width, max(36, content[0]['top'] - 6) / page.height,
                                           (page.width - 20) / page.width, bottom_limit / page.height], REMOVED.search(page_text))
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
                    add(name, pi + 1, [20 / page.width, max(36, top - 6) / page.height, (page.width - 20) / page.width, end / page.height],
                        REMOVED.search(band_text))
    for fig in figures.values():
        fig['regions'] = [{'page': r['page'], 'bbox': [round(x, 6) for x in r['bbox']], **({'rotate': True} if r.get('rotate') else {})} for r in fig['regions']]
    return {'source_sha256': hashlib.sha256(path.read_bytes()).hexdigest(), 'file': path.name, 'figures': figures, 'order': order}


def index_resources(paths):
    """Merge the indexes of a paper's resource booklet and insert; every figure records its source file."""
    merged = {'figures': {}, 'order': [], 'files': {}}
    for path in paths:
        idx = index_insert(path)
        merged['files'][idx['file']] = idx['source_sha256']
        for name, fig in idx['figures'].items():
            if name in merged['figures']:
                raise ValueError(f'{name} is indexed in two sources ({path.name})')
            merged['figures'][name] = {**fig, 'file': idx['file']}
            merged['order'].append(name)
    return merged


if __name__ == '__main__':
    import sys
    for f in sys.argv[1:]:
        idx = index_insert(f)
        print(Path(f).name, len(idx['figures']), 'figures; removed:', [n for n, v in idx['figures'].items() if v['removed']])
        print('   ', {n: [r['page'] for r in v['regions']] for n, v in idx['figures'].items()})
