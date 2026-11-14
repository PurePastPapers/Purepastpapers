"""Segment an Edexcel 9MA0 question paper PDF into questions and assessable parts.

usage: python3 -I tools/import/extract_qp.py <paper_id> <qp.pdf> <out_dir_json> <out_dir_img>

Each question becomes ONE stitched image of its printed content (answer lines, margins and
footers removed). Parts are vertical slices of that image, so nothing is retyped or rewritten.
Writes <out_dir_json>/<paper_id>.qp.json with slices, marks and reconciliation exceptions.
"""
import sys, json, re, os
import pdfplumber, pypdfium2
from PIL import Image

SCALE = 2.0
X0, X1 = 36, 560           # printed content column in crop-box (A4) points; margins hold "DO NOT WRITE" strips
Y0, Y1 = 52, 790
ROMAN = ['i', 'ii', 'iii', 'iv', 'v', 'vi']
SKIP = re.compile(r'^(Question \d+ continued\.?|\(Total for Question \d+ is \d+ marks?\)|Turn over|BLANK PAGE|END|TOTAL FOR .*|Leave|blank)$', re.I)

def lines_of(words):
    rows = {}
    for w in sorted(words, key=lambda w: (w['top'], w['x0'])):
        key = next((k for k in rows if abs(k - w['top']) < 3.5), None)
        rows.setdefault(w['top'] if key is None else key, []).append(w)
    return [sorted(v, key=lambda w: w['x0']) for _, v in sorted(rows.items())]

def main(paper_id, pdf_path, out_json, out_img):
    pdf = pdfplumber.open(pdf_path)
    doc = pypdfium2.PdfDocument(pdf_path)
    n = len(pdf.pages)
    pages = []
    gfx_count = {}
    for pno, pg in enumerate(pdf.pages):
        # pdfplumber works in MediaBox space, pdfium renders the CropBox: shift everything to CropBox space
        ml, mb, mr, mt = doc[pno].get_mediabox(); cl, cb, cr, ct = doc[pno].get_cropbox()
        ox, oy = cl - ml, mt - ct
        words = pg.extract_words(x_tolerance=2, y_tolerance=2)
        for w in words:
            w['x0'] -= ox; w['x1'] -= ox; w['top'] -= oy; w['bottom'] -= oy
        gfx = []
        for kind in ('rects', 'curves', 'lines', 'images'):
            for o in getattr(pg, kind):
                b = (o['x0'] - ox, o['top'] - oy, o['x1'] - ox, o['bottom'] - oy)
                gfx.append(b)
                k = tuple(round(v / 4) for v in b)
                gfx_count[k] = gfx_count.get(k, 0) + 1
        pages.append({'words': words, 'gfx': gfx, 'h': pg.height})
    furniture = {k for k, c in gfx_count.items() if c >= max(4, 0.25 * n)}

    # pass 1: flat stream of items in reading order
    items = []        # (page, top, bottom, kind, payload)
    exceptions = []
    for pi, p in enumerate(pages):
        if pi == 0:
            continue
        full = ' '.join(w['text'] for w in p['words'])
        if re.search(r'Mathematical Formulae|Statistical Tables', full) and not re.search(r'Total for Question', full) and pi > n - 4 and not re.search(r'^\s*\d+\.', full):
            pass
        body = [w for w in p['words'] if X0 - 2 <= w['x0'] < X1 and Y0 <= w['top'] <= Y1 and not set(w['text']) <= set('_')]
        for ln in lines_of(body):
            text = ' '.join(w['text'] for w in ln).strip()
            top, bot = min(w['top'] for w in ln), max(w['bottom'] for w in ln)
            m = re.fullmatch(r'\(Total for Question (\d+) is (\d+) marks?\)', text)
            if m:
                items.append((pi, top, bot, 'total', (int(m[1]), int(m[2]))))
                continue
            if SKIP.match(text) or re.match(r'^\*?P\d{5}', text):
                continue
            items.append((pi, top, bot, 'line', ln))
        for b in p['gfx']:
            if tuple(round(v / 4) for v in b) in furniture:
                continue
            if b[0] < X0 - 2 or b[2] > X1 + 2 or b[1] < Y0 or b[3] > Y1 or (b[3] - b[1] < 1.5 and b[2] - b[0] > 380):
                continue
            items.append((pi, b[1], b[3], 'gfx', None))
    items.sort(key=lambda t: (t[0], t[1]))

    # pass 2: split into questions on "N." at the left margin
    questions, cur, expect = [], None, 1
    for it in items:
        pi, top, bot, kind, payload = it
        if kind == 'line':
            w0 = payload[0]
            m = re.match(r'^(\d{1,2})\.', w0['text']) or (len(payload) > 1 and re.fullmatch(r'(\d{1,2})', w0['text']))
            if m and w0['x0'] < X0 + 16 and int(m[1]) in (expect, 1) and (int(m[1]) == expect or (cur and cur['number'] >= 3)):
                cur = {'number': int(m[1]), 'items': [], 'total': None}
                questions.append(cur)
                expect = int(m[1]) + 1
        if cur is None:
            continue
        if kind == 'total':
            if payload[0] == cur['number']:
                cur['total'] = payload[1]
            continue
        cur['items'].append(it)

    os.makedirs(out_img, exist_ok=True)
    rendered = {}
    def page_img(pi):
        if pi not in rendered:
            rendered.clear()
            rendered[pi] = doc[pi].render(scale=SCALE).to_pil().convert('L')
        return rendered[pi]

    out = {'paper_id': paper_id, 'pages': n, 'questions': [], 'exceptions': exceptions}
    seen = {}
    for q in questions:
        seen[q['number']] = seen.get(q['number'], 0) + 1
        section = seen[q['number']]
        its = q['items']
        # segments: contiguous content runs per page
        segs = []
        for pi in sorted({i[0] for i in its}):
            ys = sorted((i[1], i[2]) for i in its if i[0] == pi)
            a, b = ys[0][0], ys[0][1]
            for t, bt in ys[1:]:
                if t - b > 60:           # answer-line block between content runs
                    segs.append([pi, a, b]); a = t
                b = max(b, bt)
            segs.append([pi, a, b])
        pad = 7
        segs = [[pi, max(Y0 - 6, a - pad), min(Y1 + 6, b + pad)] for pi, a, b in segs]
        offs, total_h = [], 0
        for pi, a, b in segs:
            offs.append(total_h); total_h += (b - a)
        def ypos(pi, y):
            for (spi, a, b), o in zip(segs, offs):
                if spi == pi and a - 1 <= y <= b + 1:
                    return o + (y - a)
            later = [o for (spi, a, b), o in zip(segs, offs) if (spi, a) > (pi, y)]
            return later[0] if later else total_h
        # labels and marks
        labels, marks = [], []
        top_type, n_top, n_sub = None, 0, 0
        LET = 'abcdefghjk'
        for pi, top, bot, kind, ln in its:
            if kind != 'line':
                continue
            prev_label = True
            for wi, w in enumerate(ln):
                t = w['text']
                m = re.fullmatch(r'\((\d{1,2})\)', t)
                if m and w['x0'] > 452:
                    marks.append((pi, top, bot, int(m[1])))
                    continue
                m = re.match(r'^\(([a-z]{1,3})\)', t)
                initial = prev_label or (wi == 1 and re.fullmatch(r'\d{1,2}\.?', ln[0]['text']))
                prev_label = bool(m) and initial
                if not m:
                    continue
                s = m[1]
                typ = 'R' if s in ROMAN and not (top_type == 'L' and LET[n_top:n_top + 1] == 'i') else ('L' if len(s) == 1 else None)
                if typ is None:
                    continue
                seq = ROMAN if typ == 'R' else LET
                if top_type is None and initial and s == seq[0]:
                    top_type = typ
                if typ == top_type:
                    nxt = LET[n_top:n_top + 1] if typ == 'L' else (ROMAN[n_top] if n_top < len(ROMAN) else None)
                    if initial and s == nxt:
                        labels.append((pi, top, 'T', s)); n_top += 1; n_sub = 0
                elif top_type is not None:
                    ok = (typ == 'L' and initial and s == LET[n_sub:n_sub + 1]) or (typ == 'R' and n_sub < len(ROMAN) and s == ROMAN[n_sub] and w['x0'] < 187)
                    if ok:
                        labels.append((pi, top, 'S', s)); n_sub += 1
        events = sorted([(pi, top, 0, ('label', lv, s)) for pi, top, lv, s in labels] + [(pi, top, 1, ('mark', bot, mk)) for pi, top, bot, mk in marks], key=lambda e: (e[0], e[1], e[2]))
        units, span, cur_letter = [], [], None
        prev_end = None
        first_label = min(((pi, top) for pi, top, _, _ in labels), default=None)
        stem_end = ypos(first_label[0], first_label[1] - 3) if first_label else None
        for pi, top, _, ev in events:
            if ev[0] == 'label':
                span.append((ev[1], ev[2], pi, top))
                continue
            _, bot, mk = ev
            letters = [s for lv, s, *_ in span if lv == 'T']
            romans = [s for lv, s, *_ in span if lv == 'S']
            if letters:
                cur_letter = letters[-1]
            if letters and len(letters) > 1:
                label = f'({letters[0]})-({letters[-1]})'
            elif letters and len(romans) == 1:
                label = f'({letters[0]})({romans[0]})'
            elif letters:
                label = f'({letters[0]})'
            elif romans:
                label = (f'({cur_letter})' if cur_letter else '') + (f'({romans[0]})' if len(romans) == 1 else f'({romans[0]})-({romans[-1]})')
            else:
                label = ''
            start = prev_end if prev_end is not None else (stem_end if stem_end is not None else 0)
            end = ypos(pi, bot + 5)
            units.append({'label': label, 'marks': mk, 'y0': start, 'y1': end})
            prev_end, span = end, []
        if span:
            exceptions.append(f'Q{q["number"]}: label(s) {[s for _, s, *_ in span]} without a mark')
        if not units:
            exceptions.append(f'Q{q["number"]}: no mark tokens found')
            units = [{'label': '', 'marks': q['total'] or 0, 'y0': 0, 'y1': total_h}]
        if len(units) == 1 and units[0]['label'] == '':
            units[0]['y0'], stem_end = 0, 0
        if stem_end is None:
            stem_end = 0
        labs = [u['label'] for u in units]
        if len(set(labs)) != len(labs):
            exceptions.append(f'Q{q["number"]}: duplicate part labels {labs}')
        if len(units) > 1 and '' in labs:
            exceptions.append(f'Q{q["number"]}: unlabelled marked unit among parts {labs}')
        msum = sum(u['marks'] for u in units)
        if q['total'] is None:
            exceptions.append(f'Q{q["number"]}: no "Total for Question" line')
        elif msum != q['total']:
            exceptions.append(f'Q{q["number"]}: part marks {msum} != printed total {q["total"]}')
        # stitch image
        W = int(round((X1 - X0 + 2) * SCALE))
        canvas = Image.new('L', (W, max(1, int(round(total_h * SCALE)))), 255)
        for (pi, a, b), o in zip(segs, offs):
            im = page_img(pi).crop((int((X0 - 1) * SCALE), int(a * SCALE), int((X0 - 1) * SCALE) + W, int(b * SCALE)))
            canvas.paste(im, (0, int(round(o * SCALE))))
        suffix = f'q{q["number"]:02d}' + ('' if section == 1 else f's{section}')
        name = f'{suffix}.webp'
        canvas.save(os.path.join(out_img, name), 'WEBP', quality=72, method=6)
        text = '\n'.join(' '.join(w['text'] for w in ln) for _, _, _, kind, ln in its if kind == 'line')
        def utext(u):
            rows = [' '.join(w['text'] for w in ln) for pi, top, bot, kind, ln in its if kind == 'line' and u['y0'] - 2 <= ypos(pi, top) < u['y1'] - 2]
            return '\n'.join(rows)
        out['questions'].append({
            'number': q['number'], 'section': section, 'key': suffix, 'total': q['total'], 'image': name,
            'width': W, 'height': canvas.size[1], 'pages': sorted({s[0] + 1 for s in segs}),
            'stem_end': round(stem_end / total_h, 5) if total_h else 0,
            'tail_start': round(units[-1]['y1'] / total_h, 5) if total_h - units[-1]['y1'] > 40 else None,
            'units': [{'label': u['label'], 'marks': u['marks'], 'y0': round(u['y0'] / total_h, 5), 'y1': round(u['y1'] / total_h, 5), 'text': utext(u)} for u in units],
            'has_graphics': any(i[3] == 'gfx' for i in its), 'text': text,
        })
    out['paper_total'] = sum(q['total'] or 0 for q in out['questions'])
    os.makedirs(out_json, exist_ok=True)
    json.dump(out, open(os.path.join(out_json, f'{paper_id}.qp.json'), 'w'), indent=1, ensure_ascii=False)
    print(paper_id, 'questions', len(out['questions']), 'units', sum(len(q['units']) for q in out['questions']), 'total', out['paper_total'], 'exceptions', len(exceptions))
    for e in exceptions:
        print('   !', e)

if __name__ == '__main__':
    main(*sys.argv[1:5])
