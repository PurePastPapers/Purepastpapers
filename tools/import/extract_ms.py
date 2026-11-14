"""Segment an Edexcel 9MA0 mark scheme PDF into one stitched image per question.

usage: python3 -I tools/import/extract_ms.py <paper_id> <ms.pdf> <out_dir_json> <out_dir_img>

Anchors are the "Question | Scheme | Marks" table header rows; the question number comes from
"Qu N" in the header or the first-column entry under it. A question's scheme runs from its
first anchor to the first anchor of the next question number (notes pages included).
Schemes are kept at question level: part rows are not split, so nothing is misattributed.
"""
import sys, json, re, os
import pdfplumber, pypdfium2
from PIL import Image

SCALE = 1.6
XL, XR, YT, YB = 22, 574, 22, 822

def main(paper_id, pdf_path, out_json, out_img):
    pdf = pdfplumber.open(pdf_path)
    doc = pypdfium2.PdfDocument(pdf_path)
    extents, page_words, headers = {}, {}, []
    for pi, pg in enumerate(pdf.pages):
        words = [w for w in pg.extract_words(x_tolerance=2, y_tolerance=2) if not (w['text'] == 'PMT' and w['top'] < 20)]
        page_words[pi] = words
        objs = [(o['top'], o['bottom']) for k in ('rects', 'lines', 'curves') for o in getattr(pg, k) if YT < o['top'] and o['bottom'] < YB]
        ys = [(w['top'], w['bottom']) for w in words if YT < w['top'] < YB] + objs
        extents[pi] = (min(y[0] for y in ys), max(y[1] for y in ys)) if ys else None
        for w in words:
            if w['text'] in ('Question', 'Qu'):
                row = [v['text'] for v in words if abs(v['top'] - w['top']) < 5]
                if 'Scheme' in row and any(t.startswith('Mark') for t in row):
                    nxt = sorted((v for v in words if abs(v['top'] - w['top']) < 5 and v['x0'] > w['x1']), key=lambda v: v['x0'])
                    inline = int(nxt[0]['text']) if nxt and re.fullmatch(r'\d{1,2}', nxt[0]['text']) else None
                    headers.append((pi, w['top'], w['x0'], w['x1'], inline))
    if not headers:
        print(paper_id, 'ms: no table headers found'); headers = [(0, 0, 60, 110, None)]
    band = (min(h[2] for h in headers) - 25, max(h[3] for h in headers) + 8)
    first_page = min(h[0] for h in headers)
    # question starts: "Qu N" headers, or a first-column entry "N", "N(a)", "N (a)" in sequence
    starts, expect = [], 1
    for pi in range(first_page, len(pdf.pages)):
        cands = [(h[1], h[4], True) for h in headers if h[0] == pi and h[4] is not None]
        col = sorted((w for w in page_words[pi] if band[0] < w['x0'] < band[1] and w['top'] > YT), key=lambda w: (w['top'], w['x0']))
        for w in col:
            m = re.match(r'^Q?(\d{1,2})\.?(?=$|\(|[a-h]$)', w['text'])
            if m and not any(abs(v['top'] - w['top']) < 4 and v['x0'] < w['x0'] for v in col):
                cands.append((w['top'], int(m[1]), False))
        for top, num, is_header in sorted(cands):
            if num != expect:
                continue
            above = [h[1] for h in headers if h[0] == pi and 0 <= top - h[1] < 160]
            y = (max(above) if above else top) - 6
            starts.append((pi, max(YT, y), num)); expect += 1
    anchors = headers
    os.makedirs(out_img, exist_ok=True)
    out = {'paper_id': paper_id, 'pages': len(pdf.pages), 'questions': [], 'anchors': len(anchors)}
    for i, (pi, y, num) in enumerate(starts):
        last = len(pdf.pages) - 1
        while last > pi and re.search(r'Pearson Education Limited\. Registered|Publications? Code', ' '.join(w['text'] for w in page_words[last])) :
            last -= 1
        end = starts[i + 1][:2] if i + 1 < len(starts) else (last, YB)
        segs = []
        for p in range(pi, end[0] + 1):
            if extents.get(p) is None:
                continue
            a = y if p == pi else max(YT, extents[p][0] - 6)
            b = end[1] if p == end[0] and i + 1 < len(starts) else min(YB, extents[p][1] + 6)
            if b - a > 12:
                segs.append((p, a, b))
        W = int((XR - XL) * SCALE)
        H = int(sum(b - a for _, a, b in segs) * SCALE)
        exc = []
        if len(segs) > 7:
            exc.append('scheme spans %d pages: check segmentation' % len(segs))
        canvas = Image.new('L', (W, max(H, 1)), 255)
        off = 0
        for p, a, b in segs:
            im = doc[p].render(scale=SCALE).to_pil().convert('L').crop((int(XL * SCALE), int(a * SCALE), int(XL * SCALE) + W, int(b * SCALE)))
            canvas.paste(im, (0, off)); off += im.size[1]
        name = f'q{num:02d}.webp'
        if canvas.size[1] > 16000:
            canvas = canvas.resize((int(W * 16000 / canvas.size[1]), 16000))
        canvas.save(os.path.join(out_img, name), 'WEBP', quality=52, method=6)
        out['questions'].append({'number': num, 'image': name, 'width': W, 'height': canvas.size[1], 'pages': sorted({p + 1 for p, _, _ in segs}), 'exceptions': exc})
    os.makedirs(out_json, exist_ok=True)
    json.dump(out, open(os.path.join(out_json, f'{paper_id}.ms.json'), 'w'), indent=1)
    print(paper_id, 'ms questions', [q['number'] for q in out['questions']][-1:] or 0, 'count', len(out['questions']), 'anchors', len(anchors), 'pages/q', [len(q['pages']) for q in out['questions']])

if __name__ == '__main__':
    main(*sys.argv[1:5])
