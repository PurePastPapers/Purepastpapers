#!/usr/bin/env python3
"""Re-crop multi-part Pearson questions so a part shows only what it needs.

For every unit of a multi-unit question in the Biology, Physics and Maths packs:

* the unit image starts at the unit's own printed label, not at the previous
  part's answer space or at the top of the question;
* the unscored context is the question's introduction, the lead-in printed
  under the unit's letter (e.g. "(a) The table shows ..." for (a)(ii)), and only
  those earlier figures, scenarios or parts the unit's wording refers to,
  instead of everything printed before the unit;
* a unit whose wording builds on an earlier part's answer ("use your answer to
  (a)", "Hence ...") records that unit in ``depends_on_question_ids`` so the app
  can hold it back until the earlier part's topics are learnt too;
* the mark scheme image holds only the scheme rows whose reference matches the
  unit (plus the table header). The rows are checked against the unit's marks;
  when they cannot be matched safely the full-question scheme is kept and
  labelled as before.

Inputs are the official PDFs named by each unit's provenance checksums, in
``--sources`` as ``<sha256>.pdf`` (``alias.json`` maps checksums of SAM page
extractions to local re-extractions with identical page geometry). Image-only
scans (no text layer) keep their existing crops. Pixels are rendered by the
unchanged tools/maths/render.py at the original scale; nothing is transcribed.

    python3 tools/parts/refine.py --subject biology --sources ../parts-research/sources
"""
import argparse
import base64
import hashlib
import importlib.util
import io
import json
import re
import sys
from collections import defaultdict
from pathlib import Path

import pdfplumber

ROOT = Path(__file__).resolve().parents[2]
_spec = importlib.util.spec_from_file_location('qbank_render', ROOT / 'tools' / 'maths' / 'render.py')
_render = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_render)

MARK_CODES = False  # set for GCSE Mathematics (mark-code column)
MARK_COLUMN = False  # set for GCSE sciences: count tariffs in the Mark column only
ROMAN = ['i', 'ii', 'iii', 'iv', 'v', 'vi', 'vii', 'viii', 'ix', 'x']
GRAPHIC_NOUNS = ['figure', 'fig', 'table', 'graph', 'diagram', 'photograph', 'photo', 'chart', 'flow chart',
                 'micrograph', 'image', 'drawing', 'map', 'key', 'circuit', 'grid', 'histogram', 'curve',
                 'scatter', 'sketch', 'trace', 'pedigree', 'cladogram', 'karyogram', 'gel', 'electron micrograph']
DATA_NOUNS = ['data', 'results', 'information', 'values', 'readings', 'measurements', 'sequence', 'equation',
              'formula', 'structure', 'structures', 'model']
SCENARIO_NOUNS = ['student', 'students', 'scientist', 'scientists', 'investigation', 'experiment', 'experiments',
                  'study', 'studies', 'procedure', 'method', 'apparatus', 'researcher', 'researchers', 'trial',
                  'trials', 'patient', 'patients', 'company', 'technician', 'teacher', 'engineer', 'ball', 'car',
                  'particle', 'block', 'object', 'cyclist', 'satellite', 'spring', 'wire', 'cell', 'battery',
                  'resistor', 'lens', 'mass', 'trolley', 'sphere', 'rocket', 'skydiver', 'boat', 'pendulum',
                  'curve', 'line', 'circle', 'triangle', 'function', 'sequence', 'series', 'model', 'woman', 'man',
                  'child', 'family', 'farmer', 'athlete', 'runner', 'volunteer', 'volunteers', 'mouse', 'mice']
DEPENDENCY = re.compile(
    r'\b(use|using|from|with|apply|applying) (your|their) (answer|answers|value|values|result|results|graph|calculation|'
    r'expression|sketch|line|curve|plot|table|equation|estimate)\b|'
    r'\b(your|their) (answer|value|result|calculation|graph|sketch|expression|equation)s? (to|from|in|for) (part |question )?\(|'
    r'\byou (calculated|found|obtained|derived|drew|plotted|completed|sketched|determined|wrote down)\b|'
    r'^hence\b(?! or otherwise)|[.;:?)] hence\b(?! or otherwise)', re.I)


def tariff_order(units, ui, pi):
    """Printed order of a part: its original tariff index (units may group non-adjacent parts)."""
    indices = units[ui]['provenance'].get('original_tariff_indices') or []
    return (indices[pi] if pi < len(indices) else 10_000, ui, pi)


def norm_label(label):
    """'(a)(ii)' / '*(c)' / 'b(ii)' -> ('a', 'ii'); '(ii)' -> (None, 'ii') only when ambiguous-free."""
    tokens = re.findall(r'\(?([a-z]{1,4})\)?', label.replace('*', '').strip().lower())
    tokens = [t for t in tokens if t]
    letter, roman = None, None
    if tokens:
        first = tokens[0]
        if len(tokens) == 1 and first in ROMAN and first not in ('i', 'v', 'x'):
            roman = first
        else:
            letter = first
        if len(tokens) > 1:
            roman = tokens[1]
    return letter, roman


class _CropRenderer:
    """PDFium's default CropBox view (tools/physics/render.py geometry)."""

    def __init__(self, path, scale=1.6):
        import pypdfium2 as pdfium
        self.document = pdfium.PdfDocument(path)
        self.scale = scale
        self._pages = {}

    def page(self, index):
        if index not in self._pages:
            if len(self._pages) > 6:
                self._pages.clear()
            self._pages[index] = self.document[index].render(scale=self.scale).to_pil().convert('RGB')
        return self._pages[index]


class Doc:
    """A source PDF in the geometry its subject build used: MediaBox fractions for
    Biology and Maths (tools/maths/render.py), CropBox fractions for Physics."""

    def __init__(self, path, offset, cropbox=False):
        self.path = Path(path)
        self.offset = offset
        self.cropbox = cropbox
        self.pdf = pdfplumber.open(self.path)
        self.renderer = _CropRenderer(str(self.path)) if cropbox else _render.SourceRenderer(str(self.path), 1.6)
        self._words = {}
        self._objs = {}
        self._frames = {}

    def page(self, page):  # page is 1-based, relative to the record (offset applied here)
        return self.pdf.pages[page + self.offset - 1]

    def frame(self, page):
        """(ox, oy, width, height) of the coordinate frame in pdfplumber top-left points."""
        if page not in self._frames:
            p = self.page(page)
            if self.cropbox:
                x0, y0, x1, y1 = p.cropbox
                mh = p.mediabox[3] - p.mediabox[1]
                self._frames[page] = (x0, mh - y1, x1 - x0, y1 - y0)
            else:
                self._frames[page] = (0, 0, p.width, p.height)
        return self._frames[page]

    def _shift(self, page, item):
        ox, oy, _, _ = self.frame(page)
        if not ox and not oy:
            return item
        return {**item, 'x0': item['x0'] - ox, 'x1': item['x1'] - ox, 'top': item['top'] - oy, 'bottom': item['bottom'] - oy}

    def size(self, page):
        _, _, w, h = self.frame(page)
        return w, h

    ocr_allowed = True
    ocr_used = False

    def ocr_words(self, page):
        """Tesseract word boxes for an image-only page, in this document's geometry.
        Positioning only: displayed pixels are always the source page."""
        import csv
        import shutil
        import subprocess
        if not shutil.which('tesseract'):
            return []
        import hashlib
        import os
        cache_dir = Path(os.environ.get('PARTS_OCR_CACHE', Path(self.path).parent / 'ocr-cache'))
        key = hashlib.sha256(f'{Path(self.path).name}:{page + self.offset}:{self.cropbox}'.encode()).hexdigest()[:24]
        cached = cache_dir / f'{key}.json'
        if cached.exists():
            words = json.loads(cached.read_text())
            self.ocr_used = self.ocr_used or bool(words)
            return words
        import pypdfium2 as pdfium
        doc = pdfium.PdfDocument(str(self.path))
        pg = doc[page + self.offset - 1]
        if not self.cropbox:
            pg.set_cropbox(*pg.get_mediabox())
        scale = 300 / 72
        image = pg.render(scale=scale).to_pil().convert('L')
        buffer = io.BytesIO()
        image.save(buffer, format='PNG')
        out = subprocess.run(['tesseract', 'stdin', 'stdout', '--psm', '3', 'tsv'], input=buffer.getvalue(), capture_output=True,
                             env={**os.environ, 'OMP_THREAD_LIMIT': '1'})
        words = []
        for row in csv.DictReader(io.StringIO(out.stdout.decode('utf8', 'replace')), delimiter='\t', quoting=csv.QUOTE_NONE):
            text = (row.get('text') or '').strip()
            if not text or float(row.get('conf') or -1) < 0:
                continue
            x, y, w, h = (int(row[k]) / scale for k in ('left', 'top', 'width', 'height'))
            words.append({'text': text, 'x0': x, 'x1': x + w, 'top': y, 'bottom': y + h, 'upright': True, 'ocr': True})
        self.ocr_used = self.ocr_used or bool(words)
        cache_dir.mkdir(parents=True, exist_ok=True)
        cached.write_text(json.dumps(words))
        return words

    def rotated(self, page):
        return bool(self.page(page).rotation)

    def words(self, page):
        if page not in self._words:
            p = self.page(page)
            ws = [self._shift(page, w) for w in p.extract_words(keep_blank_chars=False, extra_attrs=['size'])
                  if w.get('upright', True)]
            if not ws and self.ocr_allowed:
                ws = self.ocr_words(page)
            self._words[page] = ws
        return self._words[page]

    def objects(self, page):
        if page not in self._objs:
            p = self.page(page)
            W, H = self.size(page)
            objs = []
            for kind, items in (('image', p.images), ('rect', p.rects), ('curve', p.curves), ('line', p.lines)):
                for o in items:
                    w, h = o['x1'] - o['x0'], o['bottom'] - o['top']
                    if h > H * 0.5 or (w > W * 0.85 and h > H * 0.3):
                        continue  # page frames and "do not write" strips
                    if kind == 'rect' and w < 14 and h < 14:
                        continue  # multiple-choice boxes
                    if kind == 'image' and w * h < 400:
                        continue
                    objs.append(self._shift(page, {'kind': kind, 'x0': o['x0'], 'x1': o['x1'], 'top': o['top'], 'bottom': o['bottom']}))
            self._objs[page] = objs
        return self._objs[page]

    def render(self, regions, output=None):
        shifted = [{'page': r['page'] + self.offset, 'bbox': r['bbox']} for r in regions]
        buffer = io.BytesIO()
        pieces = []
        for region in shifted:
            im = self.renderer.page(region['page'] - 1)
            left, top, right, bottom = region['bbox']
            pieces.append(im.crop((round(left * im.width), round(top * im.height),
                                   round(right * im.width), round(bottom * im.height))))
        from PIL import Image
        canvas = Image.new('RGB', (max(p.width for p in pieces), sum(p.height for p in pieces) + 12 * (len(pieces) - 1)), 'white')
        y = 0
        for piece in pieces:
            canvas.paste(piece, (0, y))
            y += piece.height + 12
        canvas.save(buffer, format='WEBP', lossless=True)
        return buffer.getvalue()


# ---------------------------------------------------------------- geometry helpers

def pos_key(page, y):
    return (page, y)


def clip(regions, start, end):
    """Regions between start (page, yfrac) and end (page, yfrac)."""
    out = []
    for r in regions:
        page, box = r['page'], list(r['bbox'])
        if (page, box[3]) <= start or (page, box[1]) >= end:
            continue
        if page == start[0]:
            box[1] = max(box[1], start[1])
        if page == end[0]:
            box[3] = min(box[3], end[1])
        if box[3] - box[1] > 0.004:
            out.append({'page': page, 'bbox': [round(v, 6) for v in box]})
    return out


def merge(regions):
    """Sort by document position and merge overlapping/adjacent regions on a page."""
    out = []
    for r in sorted(regions, key=lambda r: (r['page'], r['bbox'][1])):
        if out and out[-1]['page'] == r['page'] and r['bbox'][1] <= out[-1]['bbox'][3] + 0.004:
            box = out[-1]['bbox']
            out[-1] = {'page': r['page'], 'bbox': [min(box[0], r['bbox'][0]), box[1], max(box[2], r['bbox'][2]),
                                                     max(box[3], r['bbox'][3])]}
        else:
            out.append({'page': r['page'], 'bbox': list(r['bbox'])})
    return out


def in_region(doc, region, item):
    W, H = doc.size(region['page'])
    x0, y0, x1, y1 = region['bbox']
    mid = (item['top'] + item['bottom']) / 2
    return y0 * H <= mid < y1 * H and x0 * W - 2 <= item['x0'] and item['x1'] <= x1 * W + 2


def region_words(doc, regions):
    out = []
    for r in regions:
        out.extend({**w, 'page': r['page']} for w in doc.words(r['page']) if in_region(doc, r, w))
    return out


def region_objects(doc, regions):
    out = []
    for r in regions:
        out.extend({**o, 'page': r['page']} for o in doc.objects(r['page']) if in_region(doc, r, o))
    return out


def text_of(words):
    return ' '.join(w['text'] for w in sorted(words, key=lambda w: (w['page'], round(w['top']), w['x0'])))


DOTS = re.compile(r'^[.…_·\-–]{3,}$')
TARIFF = re.compile(r'^\(\d{1,2}\)$')


def has_graphic(doc, regions):
    objs = region_objects(doc, regions)
    images = [o for o in objs if o['kind'] == 'image' and (o['x1'] - o['x0']) * (o['bottom'] - o['top']) > 1500]
    shapes = [o for o in objs if o['kind'] != 'image' and ((o['x1'] - o['x0']) > 6 or (o['bottom'] - o['top']) > 6)]
    span = (max(o['bottom'] for o in shapes) - min(o['top'] for o in shapes)) if shapes else 0
    return bool(images) or (len(shapes) >= 3 and span > 25)


def content_trim(doc, regions, stop_at_tariff=False):
    """Trim a part's regions to its printed content: drop trailing answer lines/space."""
    words = [w for w in region_words(doc, regions) if not DOTS.match(w['text'])]
    objs = region_objects(doc, regions)
    if stop_at_tariff:
        tariffs = [w for w in words if TARIFF.match(w['text'])]
        if tariffs:
            last = min(tariffs, key=lambda w: (w['page'], w['top']))
            return clip(regions, (regions[0]['page'], regions[0]['bbox'][1]),
                        (last['page'], (last['bottom'] + 4) / doc.size(last['page'])[1]))
    items = words + [o for o in objs if (o['x1'] - o['x0']) < doc.size(o['page'])[0] * 0.7 or (o['bottom'] - o['top']) > 2]
    if not items:
        return regions
    last = max(items, key=lambda w: (w['page'], w['bottom']))
    return clip(regions, (regions[0]['page'], regions[0]['bbox'][1]),
                (last['page'], min(1, (last['bottom'] + 5) / doc.size(last['page'])[1])))


FURNITURE = re.compile(r'DO NOT WRITE|Turn over|Total for|BLANK PAGE|Leave blank|continued|Source:|^\*?[PS]\d{4,}', re.I)


def bridge_region(doc, regs):
    """Unlabelled text printed after a part's tariff and before the next label, e.g.
    "In reality the stone will be subject to air resistance." before "(d) Explain how
    this would affect...". It introduces the next part, so it belongs to its context."""
    words = region_words(doc, regs)
    tariffs = [w for w in words if TARIFF.match(w['text'])]
    if not tariffs:
        return []
    last = max(tariffs, key=lambda w: (w['page'], w['top']))
    after = sorted((w for w in words if (w['page'], w['top']) > (last['page'], last['bottom'] - 1)),
                   key=lambda w: (w['page'], round(w['top']), w['x0']))
    lines = []
    for w in after:
        if lines and lines[-1][0]['page'] == w['page'] and abs(lines[-1][0]['top'] - w['top']) < 3:
            lines[-1].append(w)
        else:
            lines.append([w])
    # Answer space ends at its last dotted line, option row or answer cell; only text
    # after all of it can introduce the next part.
    for line in lines:
        line.sort(key=lambda w: w['x0'])
    W_of = lambda line: doc.size(line[0]['page'])[0]

    def inner_objects(rs):  # leave out the hatched "do not write" margins
        return [o for o in region_objects(doc, rs)
                if o['x0'] > doc.size(o['page'])[0] * 0.1 and o['x1'] < doc.size(o['page'])[0] * 0.88]

    def graphic(objs):
        images = [o for o in objs if o['kind'] == 'image' and (o['x1'] - o['x0']) * (o['bottom'] - o['top']) > 1500]
        shapes = [o for o in objs if o['kind'] != 'image' and ((o['x1'] - o['x0']) > 6 or (o['bottom'] - o['top']) > 6)]
        span = (max(o['bottom'] for o in shapes) - min(o['top'] for o in shapes)) if shapes else 0
        return bool(images) or (len(shapes) >= 3 and span > 25)
    noise = [i for i, line in enumerate(lines)
             if re.fullmatch(r'[A-D]', line[0]['text']) and line[0]['x0'] < W_of(line) * 0.4
             or any(DOTS.match(w['text']) or '....' in w['text'] or '___' in w['text'] for w in line)]
    start = noise[-1] + 1 if noise else 0
    for line in lines[start:]:
        text = ' '.join(w['text'] for w in line)
        if FURNITURE.search(text) or line[0]['x0'] > W_of(line) * 0.6 or len(re.findall(r'[A-Za-z]{2,}', text)) < 4:
            continue
        # a sentence starts with a capital; lower-case lines are figure labels
        if not re.match(r'[A-Z0-9]', text):
            continue
        # a figure printed between the answer space and this text belongs to it too
        floor = (lines[start - 1][0]['page'], max(w['bottom'] for w in lines[start - 1])) if start else (last['page'], last['bottom'])
        top = (line[0]['page'], line[0]['top'])
        figure = [o for o in inner_objects(regs)
                  if floor < (o['page'], o['top']) < top and (o['kind'] == 'image' or o['bottom'] - o['top'] > 2)
                  and not (o['page'] == line[0]['page'] and o['top'] >= line[0]['top'] - 1)]
        first = min(figure + [line[0]], key=lambda o: (o['page'], o['top']))
        block = clip(regs, wpos(doc, first), (regs[-1]['page'], regs[-1]['bbox'][3]))
        block_text = text_of(region_words(doc, block))
        # a table or figure here is usually an answer grid, unless the text introduces it
        if graphic(inner_objects(block)) and not re.search(r'\b(Figure|Fig|Table|diagram|graph|shows?|below)\b', block_text, re.I):
            return []
        return block
    return []


# ---------------------------------------------------------------- question paper parsing

def line_first_words(doc, regions):
    """Left-zone words that start a printed line, in reading order."""
    words = region_words(doc, regions)
    out = []
    for w in words:
        W, _ = doc.size(w['page'])
        if w['x0'] > W * 0.32:
            continue
        same_line = [v for v in words if v['page'] == w['page'] and abs(v['top'] - w['top']) < 2.5 and v['x1'] <= w['x0'] + 0.5 and v is not w]
        if same_line:
            # allow '2' question number or a star before the label
            if not all(re.fullmatch(r'\*?\d{1,2}\.?|\*|Q\d{1,2}', v['text']) for v in same_line):
                continue
        if re.fullmatch(r'\*?\(?|\*?\([a-z]{1,4}', w['text']):
            # labels split into two words ("*(" "a)") are rejoined
            nxt = sorted([v for v in words if v['page'] == w['page'] and abs(v['top'] - w['top']) < 2.5 and v['x0'] >= w['x1'] - 0.5
                          and v['x0'] - w['x1'] < 4], key=lambda v: v['x0'])
            if nxt:
                w = {**w, 'text': w['text'] + nxt[0]['text'], 'x1': nxt[0]['x1']}
        out.append(w)
    return sorted(out, key=lambda w: (w['page'], w['top'], w['x0']))


def find_labels(doc, units):
    """Locate each original part label. Returns {(unit_index, part_index): word} and letter lead-in words."""
    all_regions = merge([r for u in units for r in u['provenance']['source_regions']])
    stream = line_first_words(doc, all_regions)
    starts = {}
    letters = {}
    pointer = 0
    previous_letter = None
    sequence = sorted(((ui, pi, label) for ui, u in enumerate(units) for pi, label in enumerate(u['provenance']['original_parts'])),
                      key=lambda item: tariff_order(units, item[0], item[1]))
    for index, (ui, pi, label) in enumerate(sequence):
        letter, roman = norm_label(label)
        if letter is None and roman is None:
            if index or not stream:
                return None
            # an unlabelled first part starts with the question itself
            first = all_regions[0]
            starts[(ui, pi)] = {'page': first['page'], 'top': first['bbox'][1] * doc.size(first['page'])[1] + 4,
                                'bottom': first['bbox'][1] * doc.size(first['page'])[1] + 8, 'x0': 0, 'x1': 0, 'text': ''}
            continue
        found = None
        if letter and roman:
            if letter != previous_letter:
                # letter token (possibly glued to the roman one)
                for k in range(pointer, len(stream)):
                    t = stream[k]['text'].replace('*', '')
                    m = re.match(r'^\(' + letter + r'\)(\(' + roman + r'\))?', t)
                    if m:
                        letters[letter] = stream[k]
                        pointer = k
                        if m.group(1):
                            found = stream[k]
                            pointer = k + 1
                        break
                else:
                    return None
            if not found and letter in letters and letters[letter] is not None and letter != previous_letter:
                lw = letters[letter]
                same = sorted([w for w in region_words(doc, all_regions)
                               if w['page'] == lw['page'] and abs(w['top'] - lw['top']) < 2.5 and w['x0'] > lw['x1'] - 0.5],
                              key=lambda w: w['x0'])
                if same and re.match(r'^\(' + roman + r'\)', same[0]['text']):
                    found = {**same[0], 'x0': lw['x0']}
                    pointer += 1
            if not found:
                for k in range(pointer, len(stream)):
                    t = stream[k]['text'].replace('*', '')
                    if re.match(r'^\(' + roman + r'\)', t) or re.match(r'^\(' + letter + r'\)\(' + roman + r'\)', t):
                        found = stream[k]
                        pointer = k + 1
                        break
                    if k > pointer and re.match(r'^\([a-h]\)', t) and not re.match(r'^\(' + letter + r'\)', t):
                        break
            previous_letter = letter
        else:
            token = letter or roman
            for k in range(pointer, len(stream)):
                t = stream[k]['text'].replace('*', '')
                if re.match(r'^\(' + token + r'\)', t):
                    found = stream[k]
                    pointer = k + 1
                    break
            if letter:
                letters[letter] = found
                previous_letter = letter
        if not found:
            return None
        starts[(ui, pi)] = found
    return starts, letters


def wpos(doc, w, pad=4):
    return (w['page'], max(0, (w['top'] - pad) / doc.size(w['page'])[1]))


# ---------------------------------------------------------------- mark scheme parsing

ANCHOR = re.compile(r'^\*?Q?(\d{1,2})?\*?(?:\(?([a-h])\)?)?((?:\([ivx]{1,4}\))*)\*?$')


def scheme_blocks(doc, regions, number):
    """Split one question's scheme regions into blocks keyed by their reference."""
    words = region_words(doc, regions)
    if not words:
        return None
    lines = defaultdict(list)
    for w in words:
        W, _ = doc.size(w['page'])
        if w['x0'] < W * 0.22:
            lines[(w['page'], round(w['top'] / 2.5))].append(w)
    anchors, headers = [], []
    for key in sorted(lines):
        ws = sorted(lines[key], key=lambda w: w['x0'])
        picked = [ws[0]]
        for w in ws[1:]:
            # GCSE 1MA1 tables set "5   (a)" with a wider gap between number and part.
            gap = 34 if re.fullmatch(r'(\(([a-h]|[ivx]{1,4})\))+', w['text']) else 7
            if w['x0'] - picked[-1]['x1'] < gap and re.fullmatch(r'\*?\(?[a-z0-9]{1,4}\)?\*?(\([a-z]{1,4}\))*', w['text']):
                picked.append(w)
            else:
                break
        if re.match(r'^Question', ws[0]['text'], re.I):
            picked = ws
        ws = picked
        text = ''.join(w['text'] for w in ws).replace(' ', '')
        if re.match(r'^Question', text, re.I):
            headers.append(ws[0])
            continue
        m = ANCHOR.match(text)
        if not m or not (m.group(1) or m.group(2) or m.group(3)):
            continue
        if m.group(2) and not m.group(1) and not text.startswith('(') and not text.startswith('*('):
            continue  # a bare letter is a word, not a reference
        if m.group(1) and m.group(1) != str(int(number)):
            continue
        if not m.group(2) and not m.group(3) and m.group(1):
            # a bare number must sit on a table row, not a page number or prose
            W, _ = doc.size(ws[0]['page'])
            row = [v for v in words if v['page'] == ws[0]['page'] and abs(v['top'] - ws[0]['top']) < 3 and v['x0'] > ws[-1]['x1']]
            if not row:
                continue
            # ...and in the reference column: an answer such as "9" in the next column is not a row label
            column = min(v['x0'] for v in words if v['page'] == ws[0]['page'])
            if ws[0]['x0'] > column + 30:
                continue
        tokens = ([m.group(2)] if m.group(2) else []) + re.findall(r'\(([ivx]{1,4})\)', m.group(3))
        if tokens and not m.group(2) and anchors and anchors[-1]['tokens'][:1] and anchors[-1]['tokens'][0] not in ROMAN:
            # "(ii)" on its own row under "(a)(i)" continues part (a)
            tokens = anchors[-1]['tokens'][:1] + tokens
        anchors.append({'word': ws[0], 'tokens': tokens})
    if not anchors:
        return None
    blocks = []
    first = regions[0]
    end_all = (regions[-1]['page'], regions[-1]['bbox'][3])
    # some builds cut a scheme page just through its last mark; take in what straddles the edge
    grown = []
    for r in regions:
        lp = r['page']
        W, H = doc.size(lp)
        x0, _, x1, y1 = r['bbox']
        cut = y1 * H
        straddle = [v['bottom'] for v in doc.words(lp) + doc.objects(lp)
                    if v['top'] < cut - 0.5 < v['bottom'] < cut + 20 and x0 * W - 2 <= v['x0'] and v['x1'] <= x1 * W + 2]
        grown.append({'page': lp, 'bbox': r['bbox'][:3] + [min(1, (max(straddle) + 3) / H)]} if straddle else r)
    regions = grown
    end_all = (regions[-1]['page'], regions[-1]['bbox'][3])
    header_rows = []
    for i, a in enumerate(anchors):
        w = a['word']
        H = doc.size(w['page'])[1]
        page_words = [v for v in words if v['page'] == w['page']]
        straddle = [v['top'] for v in page_words if v['bottom'] > w['top'] - 1 and v['top'] < w['top'] + 2]
        row_top = min(straddle + [w['top']])
        above_bottoms = [v['bottom'] for v in page_words if v['bottom'] <= row_top + 0.5]
        top = max(row_top - 6, (max(above_bottoms) + 1) if above_bottoms else 0)
        start = (w['page'], top / H)
        prev_top = (anchors[i - 1]['word']['page'], anchors[i - 1]['word']['top']) if i else (first['page'], -1)
        above = [h for h in headers if (h['page'], h['top']) > prev_top and h['page'] == w['page'] and 0 < w['top'] - h['top'] < 60]
        if above:
            start = (w['page'], (min(h['top'] for h in above) - 5) / H)
        blocks.append({'tokens': a['tokens'], 'start': start, 'has_header': bool(above)})
    seen_tokens = set()
    for b in blocks:  # a reference seen again starts the Maths "Notes" section
        key = tuple(b['tokens'])
        b['notes'] = key in seen_tokens
        seen_tokens.add(key)
    notes_started = False
    for b in blocks:
        notes_started = notes_started or b['notes']
        b['notes'] = notes_started
    for i, b in enumerate(blocks):
        b['end'] = blocks[i + 1]['start'] if i + 1 < len(blocks) else end_all
        b['regions'] = clip(regions, b['start'], b['end'])
    # the table header printed once above the first row (Physics/Maths layout)
    header = None
    if headers:
        h = min(headers, key=lambda h: (h['page'], h['top']))
        first_anchor = anchors[0]['word']
        if (h['page'], h['top']) < (first_anchor['page'], first_anchor['top']):
            H = doc.size(h['page'])[1]
            end_y = first_anchor['top'] - 6
            if first_anchor['page'] == h['page']:
                # never cut through the header row itself (GCSE 1MA1 rows sit close under it)
                line = [v['bottom'] for v in words if v['page'] == h['page'] and abs(v['top'] - h['top']) < 3]
                end_y = max(end_y, min(max(line) + 1.5, first_anchor['top'] - 1))
            start_y = h['top'] - 5
            bar = [v['top'] for v in words if v['page'] == h['page'] and v['text'] == 'Paper:' and 0 < h['top'] - v['top'] < 25]
            if bar:
                start_y = min(bar) - 4  # include the whole "Paper: 1MA1/2H" bar, not a sliver of it
            header = clip(regions, (h['page'], start_y / H), (first_anchor['page'], end_y / doc.size(first_anchor['page'])[1]))
            if header and sum(r['bbox'][3] - r['bbox'][1] for r in header) > 0.12:
                header = None
    # the last block stops before a following question's table header
    last = blocks[-1]
    later = [h for h in headers if (h['page'], (h['top'] - 5) / doc.size(h['page'])[1]) > (last['start'][0], last['start'][1] + 0.02)]
    if later:
        h = min(later, key=lambda h: (h['page'], h['top']))
        last['end'] = (h['page'], (h['top'] - 5) / doc.size(h['page'])[1])
        last['regions'] = clip(regions, last['start'], last['end'])
    return {'blocks': blocks, 'header': header, 'words': words}


def match_tokens(block_tokens, letter, roman):
    if not block_tokens:
        return 'question'
    bl = block_tokens[0]
    if bl in ROMAN and letter is None:
        return 'exact' if bl == roman else None
    if bl != letter:
        return None
    rest = block_tokens[1:]
    if not rest:
        return 'exact' if roman is None else 'parent'
    if roman is None:
        return 'child'
    return 'exact' if roman in rest else None


def scheme_for_unit(doc, parsed, unit, marks):
    parts = [norm_label(p) for p in unit['provenance']['original_parts']]
    chosen, kinds = [], set()
    for b in parsed['blocks']:
        hit = [match_tokens(b['tokens'], l, r) for l, r in parts]
        hit = [h for h in hit if h]
        if hit:
            chosen.append(b)
            kinds.update(hit)
    if not chosen or 'question' in kinds:
        return None, 'no_rows'
    regions = []
    for b in chosen:
        regs = b['regions']
        items = region_words(doc, regs) + region_objects(doc, regs)
        if items:
            last = max(items, key=lambda w: (w['page'], w['bottom']))
            regs = clip(regs, b['start'], (last['page'], min(1, (last['bottom'] + 3) / doc.size(last['page'])[1])))
        regions.extend(regs)
    # verify against the Mark column
    counted = [r for b in chosen if not b['notes'] for r in b['regions']]
    total = 0
    total_lines = {(w['page'], round(w['top'] / 3)) for w in parsed['words'] if re.match(r'^\(?Total', w['text'])}
    mark_column = {}
    if MARK_CODES:
        # GCSE 1MA1 tables carry a narrow "Mark" column of codes (M1, A1, B2, P1, C1);
        # guidance prose to the right is full of numbers, so count only that column.
        for page in {w['page'] for w in parsed['words']}:
            heads = [w for w in doc.words(page) if w['text'] == 'Mark' and w['top'] < doc.size(page)[1] * 0.3]
            if heads:
                mark_column[page] = min(h['x0'] for h in heads)
    for w in parsed['words']:
        if MARK_CODES:
            x = mark_column.get(w['page'])
            m = re.fullmatch(r'[MABPC](\d)', w['text'])
            if x is not None and m and x - 6 <= w['x0'] <= x + 25 and \
                    any(r['page'] == w['page'] and r['bbox'][1] * doc.size(w['page'])[1] <= w['top'] < r['bbox'][3] * doc.size(w['page'])[1] for r in counted):
                total += int(m.group(1))
            continue
        if (w['page'], round(w['top'] / 3)) in total_lines or (w['page'], round(w['top'] / 3) - 1) in total_lines or (w['page'], round(w['top'] / 3) + 1) in total_lines:
            continue
        W, H = doc.size(w['page'])
        if MARK_COLUMN:
            # GCSE science tables put "(1)" after each marking point in the Answer and
            # guidance columns; only the right-hand "Mark" column holds the tariff.
            heads = [h for h in doc.words(w['page']) if h['text'] == 'Mark' and h['x0'] > W * 0.6 and h['top'] <= w['top']]
            x = max(heads, key=lambda h: h['top'])['x0'] - 8 if heads else W * 0.76
            if w['x0'] < x:
                continue
        if MARK_COLUMN and re.fullmatch(r'\d{1,2}', w['text']) and any(
                a['page'] == w['page'] and abs(a['top'] - w['top']) < 3 and 0 <= w['x0'] - a['x1'] < 12 and re.fullmatch(r'AO\d', a['text'])
                for a in parsed['words']):
            continue  # "AO2 1" is an assessment-objective code split in two, not a tariff
        if (w['x0'] > W * 0.70 and TARIFF.match(w['text'])) or (w['x0'] > W * 0.86 and re.fullmatch(r'\d{1,2}', w['text'])):
            if any(r['page'] == w['page'] and r['bbox'][1] * H <= w['top'] < r['bbox'][3] * H for r in counted):
                total += int(w['text'].strip('()'))
    if total == marks:
        status = 'verified'
    elif total > marks and 'parent' in kinds:
        status = 'includes_sibling_rows'
    elif total == 0 and kinds <= {'exact', 'child'}:
        status = 'reference_matched'
    else:
        return None, f'marks {total} != {marks}'
    if parsed['header'] and not chosen[0]['has_header']:
        regions = parsed['header'] + regions
    return regions, status


# ---------------------------------------------------------------- per question

def nouns_in(text, nouns):
    found = set()
    low = ' ' + text.lower() + ' '
    for n in nouns:
        if re.search(r'\b(the|this|these|that|those|each|your)\s+(\w+\s+){0,2}' + re.escape(n) + r's?\b', low):
            found.add(n)
    return found


def numbered_refs(text):
    return {('figure' if k.lower().startswith('fig') else k.lower(), n)
            for k, n in re.findall(r'\b(Figure|Fig\.?|Table|Graph|Diagram|Photograph)\s+(\d+)', text)}


def refine_question(qdoc, sdoc, units, stats):
    """Returns per-unit dict with new regions, or None when the question keeps its old crops."""
    found = find_labels(qdoc, units)
    if not found:
        stats['labels_not_found'] += len(units)
        return None
    starts, letters = found
    q_regions = merge([r for u in units for r in u['provenance']['source_regions']])
    q_start = (q_regions[0]['page'], q_regions[0]['bbox'][1])
    q_end = (q_regions[-1]['page'], q_regions[-1]['bbox'][3])
    first_label = min([starts[(0, 0)]] + [w for w in letters.values() if w], key=lambda w: (w['page'], w['top']))
    stem = clip(q_regions, q_start, wpos(qdoc, first_label))
    stem = content_trim(qdoc, stem) if stem else []
    if stem and not region_words(qdoc, stem) and not region_objects(qdoc, stem):
        stem = []
    # The unit regions of some builds begin below the question number (the stem was a
    # separate image). Then the question's own stem image is reused instead.
    number = str(units[0]['question_number'])
    stem_ok = any(re.fullmatch(r'\*?Q?' + re.escape(number) + r'\.?', w['text']) and w['x0'] < qdoc.size(w['page'])[0] * 0.2
                  for w in region_words(qdoc, stem)) if stem else False

    # segments: every part's own extent, and each letter's lead-in
    seq = sorted(((ui, pi) for ui, u in enumerate(units) for pi in range(len(u['provenance']['original_parts']))),
                 key=lambda k: tariff_order(units, k[0], k[1]))
    part_regions = {}
    bridges = []
    for idx, key in enumerate(seq):
        begin = wpos(qdoc, starts[key])
        nxt = None
        for later in seq[idx + 1:]:
            nxt = starts[later]
            break
        end = q_end
        if nxt is not None:
            letter_next = norm_label(units[later[0]]['provenance']['original_parts'][later[1]])[0]
            lw = letters.get(letter_next)
            candidates = [wpos(qdoc, nxt)]
            if lw is not None and (lw['page'], lw['top']) > (starts[key]['page'], starts[key]['top']):
                candidates.append(wpos(qdoc, lw))
            end = min(candidates)
        part_regions[key] = clip(q_regions, begin, end)
        if nxt is not None:
            bridge = bridge_region(qdoc, part_regions[key])
            if bridge:
                bridges.append((norm_label(units[later[0]]['provenance']['original_parts'][later[1]])[0], bridge))
                part_regions[key] = clip(part_regions[key], (part_regions[key][0]['page'], part_regions[key][0]['bbox'][1]),
                                         (bridge[0]['page'], bridge[0]['bbox'][1]))
    leadins = {}
    for letter, lw in letters.items():
        if lw is None:
            continue
        firsts = [starts[k] for k in seq if norm_label(units[k[0]]['provenance']['original_parts'][k[1]])[0] == letter]
        roman_first = min(firsts, key=lambda w: (w['page'], w['top']))
        if (roman_first['page'], roman_first['top']) > (lw['page'], lw['top'] + 3):
            leadins[letter] = clip(q_regions, wpos(qdoc, lw), wpos(qdoc, roman_first))

    stem_text = text_of(region_words(qdoc, stem)) if stem else ''
    segments = []  # (order key, kind, label, regions, text, graphic)
    for letter, regs in leadins.items():
        if regs:
            segments.append({'kind': 'leadin', 'letter': letter, 'regions': regs,
                             'text': text_of(region_words(qdoc, regs)), 'graphic': has_graphic(qdoc, regs)})
    for letter, regs in bridges:
        segments.append({'kind': 'leadin', 'letter': letter, 'regions': content_trim(qdoc, regs), 'bridge': True,
                         'text': text_of(region_words(qdoc, regs)), 'graphic': has_graphic(qdoc, regs)})
    for key, regs in part_regions.items():
        if regs:
            label = units[key[0]]['provenance']['original_parts'][key[1]]
            segments.append({'kind': 'part', 'key': key, 'label': norm_label(label), 'regions': regs,
                             'text': text_of(region_words(qdoc, regs)), 'graphic': has_graphic(qdoc, regs)})
    segments.sort(key=lambda s: (s['regions'][0]['page'], s['regions'][0]['bbox'][1]))

    results = []
    for ui, unit in enumerate(units):
        keys = [(ui, pi) for pi in range(len(unit['provenance']['original_parts']))]
        own_start = wpos(qdoc, starts[keys[0]])
        old = unit['provenance']['source_regions']
        old_end = (old[-1]['page'], old[-1]['bbox'][3])
        own = clip(merge(old), own_start, old_end)
        if not own:
            stats['empty_own'] += 1
            return None
        own_text = text_of(region_words(qdoc, own))
        own_graphic = has_graphic(qdoc, own)
        letters_here = {norm_label(p)[0] for p in unit['provenance']['original_parts']}
        context = list(stem)
        context_text = stem_text
        context_graphic = bool(stem) and has_graphic(qdoc, stem)
        included = set()
        bridged = False
        for seg in segments:
            if seg['kind'] == 'leadin' and seg['letter'] in letters_here:
                if (seg['regions'][0]['page'], seg['regions'][0]['bbox'][1]) < own_start:
                    context += seg['regions']
                    context_text += ' ' + seg['text']
                    context_graphic = context_graphic or seg['graphic']
                    included.add(id(seg))
                    if seg.get('bridge'):
                        bridged = ' '.join(seg['text'].split())[:300]
        earlier = [s for s in segments if (s['regions'][0]['page'], s['regions'][0]['bbox'][1]) < own_start
                   and id(s) not in included and not (s['kind'] == 'part' and s['key'][0] == ui)]
        depends = set()
        reasons = ['text printed just before this part'] if bridged else []

        def include(seg, trim=True, tariff=False):
            nonlocal context_text, context_graphic
            if id(seg) in included:
                return
            included.add(id(seg))
            regs = content_trim(qdoc, seg['regions'], stop_at_tariff=tariff) if trim else seg['regions']
            context.extend(regs)
            context_text += ' ' + seg['text']
            context_graphic = context_graphic or seg['graphic']

        # 1. explicit references to earlier parts, e.g. "your answer to (a)(ii)"
        body = re.sub(r'^\s*\*?\([a-z]{1,4}\)(\s*\([a-z]{1,4}\))?', '', own_text)
        refs = []
        for m in re.finditer(r'(?:part\s+)?\(([a-h])\)\s*(?:\((i{1,3}|iv|v|vi)\))?|\bpart\s+([a-h])\b', body):
            letter = m.group(1) or m.group(3)
            refs.append((letter, m.group(2)))
        explicit_dep = bool(DEPENDENCY.search(body))
        own_letters = {norm_label(p)[0] for p in unit['provenance']['original_parts']}
        refs = [(l, r) for l, r in refs if l not in own_letters]
        before = len(included)
        for letter, roman in refs:
            targets = [s for s in earlier if s['kind'] == 'part' and s['label'][0] == letter and (roman is None or s['label'][1] == roman)]
            for s in targets:
                include(s)
                if explicit_dep:
                    depends.add(s['key'][0])
            leads = [s for s in earlier if s['kind'] == 'leadin' and s['letter'] == letter]
            for s in leads:
                include(s)
        if len(included) > before:
            reasons.append('names an earlier part')
        # "Hence" / "your answer" without a named part: the part printed just before
        if explicit_dep and not refs:
            prev = [s for s in earlier if s['kind'] == 'part']
            if prev:
                include(prev[-1])
                depends.add(prev[-1]['key'][0])
                reasons.append('builds on the previous answer')
        # 2. numbered figures and tables
        for kind, n in numbered_refs(body):
            if re.search(r'\b' + kind + r'\.?\s+' + n + r'\b', own_text[:0] + context_text, re.I):
                continue
            if re.search(r'\b(Figure|Fig\.?|Table|Graph|Diagram|Photograph)\s+' + n + r'\b', own_text, re.I) and own_graphic:
                continue
            hits = [s for s in earlier if re.search(r'\b' + kind[:3] + r'\w*\.?\s+' + n + r'\b', s['text'], re.I)]
            if hits:
                include(hits[0])
                reasons.append(f'{kind} {n}')
        # 3. unnumbered figures, tables and data ("the graph", "these results")
        g_nouns = nouns_in(body, GRAPHIC_NOUNS) | nouns_in(body, DATA_NOUNS)
        if g_nouns and not own_graphic and not context_graphic:
            hits = [s for s in earlier if s['graphic']]
            named = [s for s in hits if any(re.search(r'\b' + re.escape(n), s['text'], re.I) for n in g_nouns)]
            pick = (named or hits)[-1:] if (named or hits) else []
            for s in pick:
                include(s)
                reasons.append('earlier figure or data')
        # 4. scenario nouns introduced in an earlier part ("the student", "this investigation")
        s_nouns = {n for n in nouns_in(body, SCENARIO_NOUNS)
                   if not re.search(r'\b' + re.escape(n), context_text + ' ' + own_text.split('.')[0][:0], re.I)
                   and not re.search(r'\b(a|an|one|two|some)\s+(\w+\s+)?' + re.escape(n), own_text, re.I)}
        for n in sorted(s_nouns):
            hits = [s for s in earlier if re.search(r'\b' + re.escape(n), s['text'], re.I)]
            if hits:
                first = hits[0]
                lead = [s for s in earlier if s['kind'] == 'leadin' and re.search(r'\b' + re.escape(n), s['text'], re.I)]
                include(lead[0] if lead else first)
                reasons.append(f'scenario ({n})')
        # 5. "show that" results printed earlier are needed values
        for s in earlier:
            if s['kind'] == 'part' and re.search(r'\bshow that\b', s['text'], re.I):
                include(s, tariff=True)
                reasons.append('earlier "show that" result')
        results.append({
            'own': own, 'context': merge(context), 'depends_units': sorted(depends - {ui}),
            'stem_ok': stem_ok, 'after_stem': merge([r for r in context if r not in stem]),
            'context_reasons': sorted(set(reasons)), 'own_text': own_text, 'bridge_text': bridged or None,
        })
    return results


def apply_refined(unit, res, units, qdoc, ctx, put, qn, tag, number, stats, old_assets):
    uid = unit['question_id']
    unit['content']['question_image_url'] = put(f'{qn}_{tag}.webp', qdoc.render(res['own']))
    unit['provenance']['source_regions'] = res['own']
    if res.get('bridge_text'):
        unit['provenance']['context_bridge_text'] = res['bridge_text']
    else:
        unit['provenance'].pop('context_bridge_text', None)
    if res.get('ocr'):
        unit['provenance']['part_display_positioning'] = 'tesseract OCR word boxes (image-only source page)'
    ctx.pop('shared_stem_html', None)

    ctx.pop('stem_image_url', None)
    stem_asset = old_assets.get(f'{qn}_stem.webp')
    if not res['stem_ok'] and stem_asset:
        # stack the build's own stem image above the rest of the context (same render scale)
        from PIL import Image
        top = Image.open(io.BytesIO(base64.b64decode(stem_asset['base64']))).convert('RGB')
        pieces = [top]
        if res['after_stem']:
            pieces.append(Image.open(io.BytesIO(qdoc.render(res['after_stem']))).convert('RGB'))
        canvas = Image.new('RGB', (max(p.width for p in pieces), sum(p.height for p in pieces) + 12 * (len(pieces) - 1)), 'white')
        y = 0
        for piece in pieces:
            canvas.paste(piece, (0, y))
            y += piece.height + 12
        buffer = io.BytesIO()
        canvas.save(buffer, format='WEBP', lossless=True)
        url = put(f'{qn}_{tag}_context.webp', buffer.getvalue())
        ctx['stem_image_url'] = url
        unit['provenance']['context_regions'] = res['after_stem']
        unit['provenance']['context_includes_stem_image'] = f'{qn}_stem.webp'
        unit['provenance']['context_reasons'] = res['context_reasons']
    elif res['context']:
        url = put(f'{qn}_{tag}_context.webp', qdoc.render(res['context']))
        ctx['stem_image_url'] = url
        unit['provenance']['context_regions'] = res['context']
        unit['provenance']['context_reasons'] = res['context_reasons']
    else:
        unit['provenance'].pop('context_regions', None)
        unit['provenance'].pop('context_reasons', None)
    if ctx.get('erratum_image_url'):
        ctx['shared_stem_html'] = ('<p>Official erratum notice issued with this paper (unscored context):</p>'
                                   f'<img data-math-image="{ctx["erratum_image_url"]}" alt="Official erratum notice for question {number}" />')
    deps = [units[d]['question_id'] for d in res['depends_units']]
    if deps:
        unit['depends_on_question_ids'] = deps
        stats['units_with_dependencies'] += 1
    else:
        unit.pop('depends_on_question_ids', None)
    if res['context'] or (not res['stem_ok'] and stem_asset):
        stats['with_context'] += 1


# ---------------------------------------------------------------- driver

def open_doc(sources, alias, sha, original_sha, offset, cropbox=False):
    path = sources / f'{sha}.pdf'
    if path.exists():
        return Doc(path, 0, cropbox)
    if sha in alias:
        return Doc(alias[sha], 0, cropbox)
    path = sources / f'{original_sha}.pdf'
    if path.exists():
        return Doc(path, offset, cropbox)
    raise FileNotFoundError(sha)


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--subject', required=True, choices=['biology', 'physics', 'maths', 'gcsemaths', 'gcsebio', 'gcsechem'])
    ap.add_argument('--sources', type=Path, required=True)
    ap.add_argument('--paper')
    ap.add_argument('--dry', action='store_true')
    ap.add_argument('--rescheme', action='store_true', help='recompute part mark schemes of already refined questions')
    ap.add_argument('--only-untouched', action='store_true', help='skip questions that differ from git HEAD (already refined)')
    ap.add_argument('--shard', default='0/1', help='i/n: process every n-th booklet starting at i')
    ap.add_argument('--report', type=Path)
    args = ap.parse_args()
    alias_path = args.sources.parent / 'alias.json'
    alias = json.loads(alias_path.read_text()) if alias_path.exists() else {}
    slug = args.subject
    global MARK_CODES, MARK_COLUMN
    MARK_CODES = slug == 'gcsemaths'
    MARK_COLUMN = slug in ('gcsebio', 'gcsechem')
    stats = defaultdict(int)
    report = []
    shard, shards = (int(v) for v in args.shard.split('/'))
    for number, pack_path in enumerate(sorted((ROOT / 'data/packs' / slug).glob('*.json'))):
        if number % shards != shard:
            continue
        pack = json.loads(pack_path.read_text())
        pid = pack['papers'][0]['paper_id']
        if args.paper and pid != args.paper:
            continue
        cat_path = ROOT / f'data/{slug}-assets/{pid}.json'
        catalogue = json.loads(cat_path.read_text())
        head = None
        if args.only_untouched:
            import subprocess
            shown = subprocess.run(['git', 'show', f'HEAD:{pack_path.relative_to(ROOT).as_posix()}'], cwd=ROOT, capture_output=True, text=True)
            head = defaultdict(list)
            for q in json.loads(shown.stdout)['questions']:
                head[q['parent_question_id']].append(q)
            for key in head:
                head[key].sort(key=lambda q: q['question_id'])
        groups = defaultdict(list)
        for q in pack['questions']:
            groups[q['parent_question_id']].append(q)
        p0 = pack['questions'][0]['provenance']
        crop = slug in ('physics', 'gcsemaths', 'gcsebio', 'gcsechem')  # tools/physics, gcsemaths, gcsebio and gcsechem render the CropBox
        qdoc = open_doc(args.sources, alias, p0['question_source_sha256'], p0['original_question_source_sha256'], p0['question_page_offset'], crop)
        sdoc = open_doc(args.sources, alias, p0['scheme_source_sha256'], p0['original_scheme_source_sha256'], p0['scheme_page_offset'], crop)
        new_assets = {}

        def put(name, data):
            new_assets[name] = data
            return f'assets/{slug}/{pid}/{name}'

        for parent, units in groups.items():
            units.sort(key=lambda q: q['question_id'])
            qn = re.search(r'_(Q\d+)$', parent).group(1)
            number = units[0]['question_number']
            stats['units'] += len(units)
            if len(units) == 1:
                stats['single_unit'] += 1
                continue
            if any(u['provenance'].get('part_display') == 'refined' for u in units) or \
                    (head is not None and [u for u in head.get(parent, [])] != [json.loads(json.dumps(u)) for u in units]):
                stats['already_refined'] += len(units)
                if not args.rescheme:
                    continue  # never re-crop a refined question: its regions no longer include the stem
            refined = 'keep' if any(u['provenance'].get('part_display') == 'refined' for u in units) else None
            if refined == 'keep':
                refined = [None] * len(units)
            elif not any(qdoc.words(r['page']) for r in units[0]['provenance']['source_regions']):
                stats['image_only_kept'] += len(units)
            else:
                refined = refine_question(qdoc, sdoc, units, stats)
                if refined and any(w.get('ocr') for r in units[0]['provenance']['source_regions'] for w in qdoc.words(r['page'])):
                    for res in refined:
                        res['ocr'] = True
            if refined is None:
                report.append({'question': parent, 'status': 'kept_old_crops'})
                # keep the old crops and context; still give each unit its own scheme rows
                refined = [None] * len(units)
            # scheme rows
            s_regions = units[0]['provenance']['scheme_regions']
            # pdfplumber reads /Rotate pages upright; SAM tables printed sideways yield no upright words (full scheme kept)
            parsed = scheme_blocks(sdoc, s_regions, number)
            for ui, (unit, res) in enumerate(zip(units, refined)):
                uid = unit['question_id']
                tag = re.search(r'_(U\d+|P\d+)$', uid).group(1)
                ctx = unit.setdefault('context', {})
                if unit['provenance'].get('part_display') != 'refined':
                    unit['provenance']['part_display'] = 'refined' if res else 'scheme_only'
                if res is None:
                    pass
                elif not region_words(qdoc, res['own']):
                    stats['own_without_text'] += 1
                    report.append({'question': uid, 'status': 'own_crop_has_no_text'})
                if res is not None:
                    apply_refined(unit, res, units, qdoc, ctx, put, qn, tag, number, stats, catalogue['assets'])
                # scheme
                regions, status = (None, 'scheme_unparsed') if parsed is None else scheme_for_unit(sdoc, parsed, unit, unit['marks'])
                full_scheme = f'assets/{slug}/{pid}/{qn}_scheme.webp'
                if regions:
                    unit['content']['mark_scheme_image_url'] = put(f'{qn}_{tag}_scheme.webp', sdoc.render(regions))
                    unit['scheme_scope'] = 'part'
                    unit['scheme_question_number'] = f"{number}{''.join(unit['provenance']['original_parts'])}"
                    unit['provenance']['part_scheme_regions'] = regions
                    unit['provenance']['part_scheme_check'] = status
                    ctx['full_scheme_image_url'] = full_scheme
                    stats['scheme_' + status] += 1
                else:
                    unit['content']['mark_scheme_image_url'] = full_scheme
                    unit['scheme_scope'] = 'full_question'
                    unit['scheme_question_number'] = str(number)
                    unit['provenance'].pop('part_scheme_regions', None)
                    unit['provenance'].pop('part_scheme_check', None)
                    ctx.pop('full_scheme_image_url', None)
                    stats['scheme_fallback'] += 1
                    report.append({'question': uid, 'status': 'scheme_fallback', 'why': status})
                if not ctx:
                    unit.pop('context')
        # catalogue: rewrite referenced assets
        text = json.dumps(pack, ensure_ascii=False)
        refs = set(re.findall(r'assets/' + slug + '/' + pid + r'/([A-Za-z0-9_]+\.webp)', text))
        assets = {}
        for name in sorted(refs):
            if name in new_assets:
                data = new_assets[name]
                assets[name] = {'sha256': hashlib.sha256(data).hexdigest(), 'base64': base64.b64encode(data).decode()}
            elif name in catalogue['assets']:
                assets[name] = catalogue['assets'][name]
            else:
                raise ValueError(f'{pid}: missing asset {name}')
        old_size = cat_path.stat().st_size
        if not args.dry:
            pack_path.write_text(json.dumps(pack, ensure_ascii=False, indent=2) + '\n')
            cat_path.write_text(json.dumps({'format': catalogue['format'], 'paper_id': pid, 'assets': assets},
                                           separators=(',', ':')) + '\n')
        print(pid, 'assets', len(catalogue['assets']), '->', len(assets), 'bytes', old_size, '->',
              cat_path.stat().st_size if not args.dry else '(dry)', flush=True)
    print(json.dumps(stats, indent=1))
    if args.report:
        args.report.write_text(json.dumps(report, indent=1))


if __name__ == '__main__':
    main()
