#!/usr/bin/env python3
"""Tesseract word positions for image-only Pearson scans (positioning/search only).

OCR text never replaces source wording: the displayed question is always the source
pixels. Words are written in CropBox points (top-left origin), matching extract.py,
to OCR_DIR/<paper_id>/page-NNN.json. Requires the tesseract binary.
"""
import argparse, csv, hashlib, io, json, re, subprocess
from pathlib import Path
import pypdfium2 as pdfium

SCALE = 300 / 72


def ocr_page(page):
    image = page.render(scale=SCALE).to_pil().convert('L')
    buf = io.BytesIO(); image.save(buf, format='PNG')
    out = subprocess.run(['tesseract', 'stdin', 'stdout', '--psm', '3', 'tsv'], input=buf.getvalue(), capture_output=True, check=True)
    words = []
    for row in csv.DictReader(io.StringIO(out.stdout.decode('utf8', 'replace')), delimiter='\t', quoting=csv.QUOTE_NONE):
        text = (row.get('text') or '').strip()
        if not text or float(row.get('conf') or -1) < 0:
            continue
        x, y, w, h = (int(row[k]) / SCALE for k in ('left', 'top', 'width', 'height'))
        words.append({'text': text, 'x0': x, 'x1': x + w, 'top': y, 'bottom': y + h, 'fontname': 'OCR', 'upright': True,
                      'conf': float(row['conf'])})
    # Page-level OCR often drops an isolated bold question number in the margin.
    # Re-read the margin beside each text line start as a digits-only line.
    seen = set()
    for word in sorted(words, key=lambda w: w['top']):
        if not 57 < word['x0'] < 68 or any(abs(word['top'] - t) < 6 for t in seen):
            continue
        seen.add(word['top'])
        if any(o['x1'] <= word['x0'] and o['x0'] > 30 and abs(o['top'] - word['top']) < 6 for o in words):
            continue
        box = tuple(round(v * SCALE) for v in (30, word['top'] - 4, 58, word['bottom'] + 4))
        crop = image.crop(box)
        if crop.getextrema()[0] > 120:
            continue  # no ink in the margin
        b = io.BytesIO(); crop.save(b, format='PNG')
        r = subprocess.run(['tesseract', 'stdin', 'stdout', '--psm', '7', '-c', 'tessedit_char_whitelist=0123456789*'],
                           input=b.getvalue(), capture_output=True)
        digits = r.stdout.decode().strip()
        if re.fullmatch(r'\*?\d{1,2}', digits):
            words.append({'text': digits, 'x0': 40, 'x1': 56, 'top': word['top'], 'bottom': word['bottom'],
                          'fontname': 'OCR', 'upright': True, 'conf': -2, 'margin_reread': True})
    # Likewise isolated "(n)" tariffs in the right-hand column: segment inked rows and
    # re-read each as a single line restricted to brackets and digits.
    strip = image.crop(tuple(round(v * SCALE) for v in (478, 0, 548, page_height(image))))
    rows = [any(strip.getpixel((x, y)) < 185 for x in range(0, strip.width, 2)) for y in range(strip.height)]
    segments, start = [], None
    for y, ink in enumerate(rows + [False]):
        if ink and start is None: start = y
        if not ink and start is not None:
            segments.append((start, y)); start = None
    for a, b in segments:
        top, bottom = a / SCALE, b / SCALE
        if not 5 < bottom - top < 20 or any(abs(o['top'] - top) < 5 and o['x0'] > 470 and re.fullmatch(r'\(\d{1,2}\)', o['text']) for o in words):
            continue
        crop = strip.crop((0, max(0, a - 6), strip.width, b + 6)).point(lambda v: 0 if v < 200 else 255)
        buf2 = io.BytesIO(); crop.save(buf2, format='PNG')
        r = subprocess.run(['tesseract', 'stdin', 'stdout', '--psm', '7', '-c', 'tessedit_char_whitelist=()0123456789'],
                           input=buf2.getvalue(), capture_output=True)
        text = r.stdout.decode().strip()
        if re.fullmatch(r'\(\d{1,2}\)', text):
            words.append({'text': text, 'x0': 497, 'x1': 512, 'top': top, 'bottom': bottom,
                          'fontname': 'OCR', 'upright': True, 'conf': -2, 'margin_reread': True})
    return words, figures(image, words)


def figures(image, words):
    """Vertical bands of non-text ink (diagrams, graph grids, tables) in CropBox points."""
    small = image.resize((image.width // 4, image.height // 4)).point(lambda v: 0 if v < 200 else 255)
    f = SCALE / 4
    px = small.load()
    masked = set()
    for w in words:
        for y in range(int(w['top'] * f) - 1, int(w['bottom'] * f) + 2):
            for x in range(int(w['x0'] * f) - 1, int(w['x1'] * f) + 2):
                masked.add((x, y))
    x_lo, x_hi = int(40 * f), int(548 * f)
    rows = []
    for y in range(int(40 * f), int((page_height(image) - 40) * f)):
        xs = [x for x in range(x_lo, x_hi) if px[x, y] == 0 and (x, y) not in masked]
        rows.append((y, min(xs), max(xs)) if len(xs) > 3 else None)
    bands, cur = [], None
    for item in rows + [None]:
        if item:
            cur = [item[0], item[0], item[1], item[2]] if not cur else [cur[0], item[0], min(cur[2], item[1]), max(cur[3], item[2])]
            gap = 0
        elif cur:
            gap = locals().get('gap', 0) + 1
            if gap > 4:
                if (cur[1] - cur[0]) / f > 25 and (cur[3] - cur[2]) / f > 40:
                    bands.append({'x0': cur[2] / f, 'x1': cur[3] / f, 'top': cur[0] / f, 'bottom': cur[1] / f})
                cur = None
    return bands


def page_height(image):
    return image.height / SCALE


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('pdfs', nargs='+', type=Path)
    p.add_argument('--output', type=Path, required=True)
    a = p.parse_args()
    for path in a.pdfs:
        sha = hashlib.sha256(path.read_bytes()).hexdigest()
        root = a.output / path.stem.replace('__question_paper', '')
        root.mkdir(parents=True, exist_ok=True)
        doc = pdfium.PdfDocument(path)
        for i in range(len(doc)):
            target = root / f'page-{i + 1:03}.json'
            if target.exists() and json.loads(target.read_text()).get('source_sha256') == sha and json.loads(target.read_text()).get('revision') == 4:
                continue
            target.write_text(json.dumps({'source_sha256': sha, 'engine': 'tesseract-5', 'revision': 4, **dict(zip(('words', 'figures'), ocr_page(doc[i])))}) + '\n')
        print(path.name, len(doc), 'pages', flush=True)


if __name__ == '__main__':
    main()
