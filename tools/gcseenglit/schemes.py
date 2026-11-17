#!/usr/bin/env python3
"""Index Eduqas GCSE English Literature (C720QS) mark-scheme regions per route question.

An Eduqas scheme prints, per section, a generic assessment-objectives grid followed by
indicative content per text:
- Shakespeare: one grid page for extract questions (x1, 15 marks) and one for essay
  questions (x2, 20 + 5 SPaG), then each play's indicative content for x1 and x2.
- Post-1914 prose/drama and 19th century prose: the section grid ("Questions 0 1 to 1 0",
  "2 1 to 2 6"), then each text's indicative content (Section A texts each carry their
  own AO4 SPaG grid after the indicative content).
- Unseen poetry: the grid for 31, the indicative content for 31, the grid for 32, then
  the indicative content for 32.
A unit's scheme is its own indicative content followed by the grid(s) it is marked on,
both kept as source pixels.

Usage (check): schemes.py SCHEME_PDF FAMILY:NUMBER ...   e.g. shakespeare:21 unseen:32
"""
import re
import sys

TITLES = ['Romeo and Juliet', 'Macbeth', 'Othello', 'Much Ado About Nothing', 'Henry V', 'Twelfth Night', 'The Merchant of Venice',
          'Lord of the Flies', 'Anita and Me', 'Never Let Me Go', 'Boys Don’t Cry', "Boys Don't Cry", 'The Woman in Black',
          'Oranges are not the Only Fruit', 'Oranges Are Not the Only Fruit', 'A Taste of Honey', 'Leave Taking', 'An Inspector Calls',
          'The History Boys', 'Blood Brothers', 'A Christmas Carol', 'Silas Marner', 'War of the Worlds', 'The War of the Worlds',
          'Pride and Prejudice', 'Jane Eyre', 'The Strange Case of Dr Jekyll and Mr Hyde']
GRID = re.compile(r'generic assessment objectives? grid', re.I)
FOOTER = re.compile(r'^(©\s*WJEC.*|\d{1,2}|PMT|[A-Z]\d{3}U\d{2}-?\w* .*EDUQAS.*|.*\bMS[ /](Summer|Autumn|ED)\b.*|.*MS/ED.*)$', re.I)


def is_title(text):
    t = text.strip()
    return t in TITLES or t.startswith('The Curious Incident of the Dog in the Night')


def rows_of(pdf):
    out = []
    for pi, page in enumerate(pdf.pages):
        words = [w for w in page.extract_words() if 15 < w['x0'] < page.width - 15 and 35 < w['top'] < page.height - 35 and w.get('upright', True)]
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
            if FOOTER.match(text):
                continue
            out.append({'page': pi, 'top': r['top'], 'bottom': max(w['bottom'] for w in r['w']), 'x0': r['w'][0]['x0'], 'words': r['w'],
                        'text': text, 'frame': (cx0 - mx0, my1 - cy1, cx1 - cx0, cy1 - cy0), 'width': page.width})
    return out


def label_of(row):
    ws = [w for w in row['words'] if w['x0'] < 110 and w['text'] != '*']
    if len(ws) >= 2 and re.fullmatch(r'\*?\d', ws[0]['text']) and re.fullmatch(r'\d', ws[1]['text']) and ws[1]['x0'] - ws[0]['x1'] < 30:
        return ws[0]['text'].lstrip('*') + ws[1]['text']
    m = re.match(r'^\*?(\d)\s?(\d)\s', row['text'] + ' ')
    if m and row['x0'] < 110:
        return m.group(1) + m.group(2)
    return None


def regions(rows):
    by_page = {}
    for r in rows:
        b = by_page.setdefault(r['page'], [r['top'], r['bottom'], r['frame'], r['width']])
        b[0], b[1] = min(b[0], r['top']), max(b[1], r['bottom'])
    out = []
    for p, (t, b, (ox, oy, w, h), width) in sorted(by_page.items()):
        fx = lambda x: round(min(1, max(0, (x - ox) / w)), 6)
        fy = lambda y: round(min(1, max(0, (y - oy) / h)), 6)
        out.append({'page': p + 1, 'bbox': [fx(20), fy(max(oy + 4, t - 8)), fx(width - 20), fy(min(oy + h - 4, b + 8))]})
    return out


def scheme_regions(path, wanted):
    """wanted: [(family, number, title)]. Returns {number: {'indicative', 'grid', 'text', 'grid_text'}}."""
    import pdfplumber
    with pdfplumber.open(path) as pdf:
        rows = rows_of(pdf)
    n = len(rows)
    titles = [i for i, r in enumerate(rows) if is_title(r['text']) and r['x0'] < 120]
    grids = [i for i, r in enumerate(rows) if GRID.search(r['text'])]
    sections = [i for i, r in enumerate(rows) if re.match(r'^SECTION [ABC]\b', r['text'])]
    labels = [(i, label_of(r)) for i, r in enumerate(rows)]
    labels = [(i, l) for i, l in labels if l and not rows[i]['text'].startswith(('Answer', 'You are', 'Question'))]
    stops = sorted(set(titles + grids + sections))

    def grid_start(g):
        # include a 'SECTION ...' heading printed just above the grid heading
        return g - 1 if g > 0 and rows[g - 1]['page'] == rows[g]['page'] and rows[g - 1]['text'].startswith('SECTION') else g

    def until(i, stop_set):
        return min([x for x in stop_set if x > i] + [n])

    out = {}
    for family, number, title in wanted:
        if family == 'shakespeare':
            t = next(i for i in titles if rows[i]['text'].strip() == title)
            l1 = next(i for i, l in labels if i > t and l == number[0] + '1')
            l2 = next(i for i, l in labels if i > l1 and l == number[0] + '2')
            end = until(l2, titles + grids + sections)
            ind = rows[t:l2] if number[1] == '1' else rows[l2:end]
            g = [x for x in grids if x < t][-1]
            g_end = until(g, titles + sections + [s for s in grids if s > g])
            block = rows[grid_start(g):g_end]
            essay = next((k for k, r in enumerate(block) if r['text'].startswith('Essay questions')), None)
            if essay is None:
                raise ValueError(f'No essay grid heading: {path}')
            grid = block[:essay] if number[1] == '1' else block[essay:]
        elif family in ('prose_drama', 'c19_prose'):
            t = next(i for i in titles if rows[i]['text'].strip() == title)
            end = until(t, titles + grids + sections)
            ind = rows[t:end]
            g = [x for x in grids if x < t][-1]
            grid = rows[grid_start(g):until(g, titles + [s for s in sections if s > g + 1] + [s for s in grids if s > g])]
        elif family == 'unseen':
            q = lambda k: next(i for i, r in enumerate(rows) if re.match(r'^Q\s?uestion\s+3\s*' + k + r'\b', r['text']))

            def back(i):
                while i > 0 and rows[i - 1]['page'] == rows[i]['page'] and (GRID.search(rows[i - 1]['text']) or rows[i - 1]['text'].startswith('SECTION')):
                    i -= 1
                return i
            g31, g32 = back(q('1')), back(q('2'))
            i31 = next(i for i in range(g31 + 1, n) if not (g32 <= i < g32 + 3) and (label_of(rows[i]) == '31' or
                       rows[i]['text'].startswith(('Answer both', 'Read the two poems', 'INDICATIVE CONTENT', 'You are advised to spend about 20', 'Write about the poem'))))
            i31 = back(i31)
            l2 = next(i for i, l in labels if l == '32' and i > max(g32, i31))
            if l2 > 0 and rows[l2 - 1]['page'] == rows[l2]['page'] and rows[l2 - 1]['text'].startswith('Now compare'):
                l2 -= 1
            starts = sorted([g31, g32, i31, l2])
            block = lambda a: rows[a:min([x for x in starts if x > a] + [n])]
            grid, ind = (block(g31), block(i31)) if number == '31' else (block(g32), block(l2))
        else:
            raise ValueError(family)
        if not ind or not grid:
            raise ValueError(f'Empty scheme region for {number}: {path}')
        out[number] = {'indicative': regions(ind), 'grid': regions(grid),
                       'text': '\n'.join(r['text'] for r in ind), 'grid_text': '\n'.join(r['text'] for r in grid)}
    return out


if __name__ == '__main__':
    want = []
    for arg in sys.argv[2:]:
        fam, num, *title = arg.split(':')
        want.append((fam, num, title[0] if title else None))
    for k, v in scheme_regions(sys.argv[1], want).items():
        print(k, [x['page'] for x in v['indicative']], [x['page'] for x in v['grid']], '|', v['text'][:70].replace('\n', ' / '), '|', v['grid_text'][:60].replace('\n', ' / '), '...', v['text'][-60:].replace('\n', ' / '))
