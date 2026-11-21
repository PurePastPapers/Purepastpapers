#!/usr/bin/env python3
"""Split official examiner reports into per-question sections for the question bank.

For every published paper of a subject that has an `examiner_report_url`, this reads the
report PDF and writes `data/reports/<slug>/<PAPER_ID>.json`: the report's own words, cut at
its question headings ("Question 3", "Question 3(b)(ii)", "Questions 4 and 5", "Q3a"),
with the page each comment is printed on and a count of example scripts (images) that the
text version cannot show. `js/engine/examiner-report.js` matches those sections to each
question or part at run time, so packs are not rebuilt and no question records change.

The wording is kept as printed (line breaks joined, running headers and footers dropped).
Nothing is summarised or rewritten. Text instead of image crops keeps the site under the
GitHub Pages size limit (docs/SITE-SIZE.md); every section links to its page in the
official PDF for maths notation and example scripts.

Usage
  python3 tools/reports/extract.py --subject maths --fetch            # download, then split
  python3 tools/reports/extract.py --subject physics --pdf-dir ~/pefs # PDFs already saved
  python3 tools/reports/extract.py --subject biology --paper EDX_9BN0_2019_JUNE_01 --show
  python3 tools/reports/extract.py --self-test

PDFs are looked up in --pdf-dir (and the cache) by the file name at the end of the
report URL, e.g. 9PH0_01_pef_20190815.pdf. Needs poppler (pdftohtml, pdfinfo).
"""
import argparse
import hashlib
import json
import os
import re
import subprocess
import sys
import tempfile
import urllib.request
import xml.etree.ElementTree as ET
from collections import Counter, defaultdict
from datetime import date
from pathlib import Path

EXTRACTOR_VERSION = 2
FORMAT = 'examiner-report-text-v1'
REPO = Path(__file__).resolve().parents[2]
CACHE = Path(os.environ.get('PPP_REPORT_CACHE', Path.home() / '.cache' / 'ppp-reports'))

# Subject slug -> pack folder and subject id. A-level History and Geography are planned
# (docs/EXAMINER-REPORTS.md); they need their own heading rules before they are added.
SUBJECTS = {
    'maths': 'EDX_ALEVEL_MATH_9MA0',
    'physics': 'EDX_ALEVEL_PHYS_9PH0',
    'biology': 'EDX_ALEVEL_BIOL_9BN0',
}

ROMAN = r'(?:i{1,3}|iv|vi{0,3}|ix|x)'
PART = rf'\(\s*(?:[a-z]|{ROMAN})\s*\)'
# "(a)(ii)", "(a) (ii)", "(a)ii", "a(ii)", "aii", "(a)(ii)(b)" in one token.
PART_RUN = rf'(?:\s*{PART}|\s*\(\s*[a-z]\s*\)\s*{ROMAN}\b|(?<=\d)[a-z](?:\s*\(\s*{ROMAN}\s*\)|{ROMAN}\b)?)+'
QWORD = r'(?:Questions?|Qu\.?|Q\.?)'
# A heading line: "Question 3", "Question 3 (a)(i)", "Q3ai", "Question 3(a) and (b)",
# "Questions 4 and 5", "Question 6 – Vectors", "Question 1(a)(i) & (ii)".
HEADING = re.compile(
    rf'^{QWORD}\s*(?P<num>\d{{1,2}})(?P<parts>{PART_RUN})?'
    rf'(?P<more>(?:\s*(?:,|&|and|to|–|-)\s*(?:\d{{1,2}}(?:{PART_RUN})?|{PART_RUN}))*)'
    rf'\s*(?P<title>(?:[:–—-]\s*.{{0,60}}|\((?:Mean|Average|Total|Max)[^)]{{0,60}}\)?)?)\s*\.?\s*$',
    re.I,
)
SUBPART = re.compile(rf'^(?P<parts>(?:{PART}\s*)+)\s*$', re.I)
GENERAL_START = re.compile(r'^(Introduction|General [Cc]omments?|Overview|General [Ii]ntroduction)\b')
SUMMARY_START = re.compile(r'^(Paper [Ss]ummary|Summary|Based on (their|the) performance on this paper)')
STOP = re.compile(r'(Grade [Bb]oundaries|Pearson Education Limited\. Registered|Registered company number)')
BOX_LABEL = re.compile(r'^Examiner(?:\'s)?\s+(Comments?|Tips?)$', re.I)
BULLET = re.compile(r'^\s*(?:[•●▪◦‣·\-–]||)\s+')


def norm_part(text):
    """'(a) (ii)' / 'aii' / 'a(ii)' -> '(a)(ii)'; '' for none."""
    text = re.sub(r'\s+', '', (text or '').lower())
    out = []
    for paren, bare in re.findall(r'\(([a-z]+)\)|([a-z]+)', text):
        if paren:
            out.append(f'({paren})')
        elif not out and len(bare) > 1 and not re.fullmatch(ROMAN, bare) and re.fullmatch(ROMAN, bare[1:]):
            out += [f'({bare[0]})', f'({bare[1:]})']  # "aii" -> (a)(ii)
        else:
            out.append(f'({bare})')
    return ''.join(out)


def parse_heading(text):
    """Return the question/part targets a heading line covers, or None if it is not one."""
    match = HEADING.match(text.strip())
    if not match:
        return None
    number = str(int(match['num']))
    targets = [{'q': number, 'part': norm_part(match['parts'])}]
    more = match['more'] or ''
    for piece in re.split(r'\s*(?:,|&|\band\b|\bto\b|–|-)\s*', more):
        piece = piece.strip()
        if not piece:
            continue
        lead = re.match(r'^(\d{1,2})(.*)$', piece)
        if lead:
            targets.append({'q': str(int(lead[1])), 'part': norm_part(lead[2])})
        else:
            # "Question 3(a) and (b)": a sibling part of the same question. "(a)(i) & (ii)"
            # keeps the parent letter.
            part = norm_part(piece)
            base = targets[-1]['part']
            if re.fullmatch(rf'\({ROMAN}\)', part) and re.match(r'^\([a-z]\)', base) and not re.fullmatch(rf'\({ROMAN}\)', base):
                part = base[:3] + part
            targets.append({'q': targets[-1]['q'], 'part': part})
    # "Questions 4 to 6"
    if re.search(r'\bto\b', more) and len(targets) == 2 and not any(t['part'] for t in targets):
        first, last = int(targets[0]['q']), int(targets[1]['q'])
        if 0 < last - first < 6:
            targets = [{'q': str(n), 'part': ''} for n in range(first, last + 1)]
    return targets


# ---------------------------------------------------------------------------------------
# PDF reading


def run(*args):
    return subprocess.run(args, check=True, capture_output=True, text=True).stdout


def garbled(pages):
    """Fonts without a usable character map extract as control characters."""
    text = ''.join(l['text'] for p in pages for l in p['lines'])
    if len(text) < 200:
        return False
    plain = sum(ch.isascii() and (ch.isalnum() or ch in ' .,;:()\'"-%') for ch in text)
    return plain / len(text) < 0.75


def read_layout(pdf):
    """Lines and images per page from pdftohtml -xml (positions in points)."""
    with tempfile.TemporaryDirectory() as tmp:
        out = Path(tmp) / 'r'
        subprocess.run(['pdftohtml', '-xml', '-nodrm', '-hidden', '-q', str(pdf), str(out)], check=True,
                       capture_output=True)
        xml = (Path(tmp) / 'r.xml').read_text(errors='replace')
    xml = re.sub(r'<!DOCTYPE[^>]*>', '', xml)
    root = ET.fromstring(xml)
    fonts, pages, raw = {}, [], []
    for page in root.iter('page'):
        for spec in page.iter('fontspec'):
            fonts[spec.get('id')] = {'size': float(spec.get('size')), 'family': spec.get('family', '')}
        height, width = float(page.get('height')), float(page.get('width'))
        fragments, images = [], []
        for node in page:
            if node.tag == 'text':
                text = ''.join(node.itertext())
                if not text.strip():
                    continue
                bold = node.find('b') is not None and len(''.join(node.find('b').itertext()).strip()) >= len(text.strip()) * 0.6
                font = fonts.get(node.get('font'), {})
                bold = bold or bool(re.search(r'bold|black|heavy', font.get('family', ''), re.I))
                fragments.append({'top': float(node.get('top')), 'left': float(node.get('left')),
                                  'width': float(node.get('width')), 'height': float(node.get('height')),
                                  'text': text, 'bold': bold, 'size': font.get('size', 0),
                                  'family': font.get('family', '')})
            elif node.tag == 'image':
                images.append({'top': float(node.get('top')), 'left': float(node.get('left')),
                               'width': float(node.get('width')), 'height': float(node.get('height'))})
        raw.append((page, height, width, fragments, images))
    sizes = Counter(round(f['size']) for *_, fragments, _ in raw for f in fragments if len(f['text'].strip()) > 20)
    body = sizes.most_common(1)[0][0] if sizes else 12
    for page, height, width, fragments, images in raw:
        for frag in fragments:
            frag['math'] = is_math_fragment(frag, body)
        lines = merge_lines(fragments)
        mark_math_lines(lines)
        pages.append({'number': int(page.get('number')), 'height': height, 'width': width,
                      'lines': lines, 'images': images})
    return pages


MATH_FONT = re.compile(r'Symbol|MT ?Extra|Math|Cambria ?Math|Euclid|Mathematica|MTSY|CMSY|CMMI|CMEX', re.I)
PUA = re.compile(r'[\ue000-\uf8ff]')


def is_math_fragment(frag, body):
    """Pieces of an equation (Equation Editor / MathType output): symbol fonts, private-use
    glyphs (stretchy brackets, fraction bars) and small raised or lowered figures."""
    text = frag['text'].strip()
    if BULLET.fullmatch(text + ' ') or text in {'•', '\uf0b7', '\uf0a7'}:
        return False
    if MATH_FONT.search(frag['family']) or PUA.search(text):
        return True
    return frag['size'] < body - 3 and len(text) <= 6


def mark_math_lines(lines):
    """A line is mathematics if it holds an equation piece, is a stray figure off the text
    baseline (a numerator, an exponent), or shares its height with such a line."""
    for line in lines:
        short = len(line['text']) <= 3 and not line['bold'] and not BULLET.fullmatch(line['text'] + ' ')
        line['math'] = line.get('math', False) or short
    maths = [line for line in lines if line['math']]
    for line in lines:
        if line['math']:
            continue
        top, bottom = line['top'], line['top'] + line['height']
        if any(m['top'] < bottom - 2 and m['top'] + m['height'] > top + 2 for m in maths):
            line['math'] = True


def merge_lines(fragments, gap=15):
    """Fragments on one baseline (±3 pt) become one line, read left to right."""
    fragments.sort(key=lambda f: (round(f['top']), f['left']))
    lines = []
    for frag in fragments:
        line = lines[-1] if lines else None
        # A wide gap is a second column (the "Examiner Comments | Examiner Tip" boxes), not one line.
        if line and abs(line['top'] - frag['top']) <= 3 and line['right'] - 2 <= frag['left'] <= line['right'] + gap:
            gap = frag['left'] - line['right']
            line['text'] += ('' if gap < 1.5 or line['text'].endswith(' ') else ' ') + frag['text']
            line['right'] = frag['left'] + frag['width']
            line['bold'] = line['bold'] and frag['bold']
            line['height'] = max(line['height'], frag['height'])
            line['math'] = line['math'] or frag.get('math', False)
        else:
            lines.append({'top': frag['top'], 'left': frag['left'], 'right': frag['left'] + frag['width'],
                          'height': frag['height'], 'text': frag['text'], 'bold': frag['bold'], 'size': frag['size'],
                          'math': frag.get('math', False)})
    for line in lines:
        line['text'] = re.sub(r'\s+', ' ', line['text']).strip()
    return [line for line in lines if line['text']]


def running_lines(pages):
    """Running headers/footers: text (digits ignored) repeated in the top or bottom margin."""
    counts = Counter()
    for page in pages:
        seen = set()
        for line in page['lines']:
            if (line['top'] < page['height'] * 0.09 or line['top'] > page['height'] * 0.9) and not parse_heading(line['text']):
                seen.add(re.sub(r'\d+', '#', line['text']))
        counts.update(seen)
    floor = max(2, len(pages) * 0.3)
    return {text for text, count in counts.items() if count >= floor}


def is_margin_noise(line, page, running):
    in_margin = line['top'] < page['height'] * 0.09 or line['top'] > page['height'] * 0.9
    if not in_margin or parse_heading(line['text']):
        return False
    key = re.sub(r'\d+', '#', line['text'])
    return key in running or re.fullmatch(r'(Page\s*)?\d{1,3}(\s*of\s*\d{1,3})?', line['text'], re.I) is not None


def repeated_images(pages):
    """Logos: images at the same place on many pages."""
    counts = Counter()
    for page in pages:
        counts.update({(round(i['top'] / 5), round(i['left'] / 5), round(i['width'] / 5)) for i in page['images']})
    return {key for key, count in counts.items() if count >= max(2, len(pages) * 0.3)}


# ---------------------------------------------------------------------------------------
# Splitting


def split_report(pages):
    running = running_lines(pages)
    logos = repeated_images(pages)
    # Body text's left edge per page parity (printed reports alternate margins). Comments on
    # example scripts sit in boxes indented well to the right of it; their "Examiner
    # Comments" label is often an image, so the indent is what marks them.
    body_left = {}
    heading_lefts = {0: [], 1: []}
    for p in pages:
        for l in p['lines']:
            if parse_heading(l['text']):
                heading_lefts[p['number'] % 2].append(l['left'])
    for parity in (0, 1):
        lefts = heading_lefts[parity] or heading_lefts[1 - parity]
        if lefts:
            body_left[parity] = Counter(round(x / 4) * 4 for x in lefts).most_common(1)[0][0]
        else:
            counts = Counter(round(l['left'] / 4) * 4 for p in pages for l in p['lines'] if len(l['text']) > 45)
            body_left[parity] = min(counts) if counts else 0
    body_size = Counter(round(l['size']) for p in pages for l in p['lines']).most_common(1)
    body_size = body_size[0][0] if body_size else 11
    blocks = {'general': None, 'summary': None}
    sections, current, stopped = [], None, False

    def start(kind, heading=None, targets=None, page=None):
        nonlocal current
        current = {'kind': kind, 'heading': heading, 'targets': targets or [], 'pages': [], 'lines': [], 'figures': Counter()}
        if kind == 'section':
            sections.append(current)
        else:
            blocks[kind] = current
        return current

    for page in pages:
        if stopped:
            break
        items = [('line', l) for l in page['lines'] if not is_margin_noise(l, page, running)]
        items += [('image', i) for i in page['images']
                  if i['width'] > 60 and i['height'] > 30
                  and (round(i['top'] / 5), round(i['left'] / 5), round(i['width'] / 5)) not in logos]
        items.sort(key=lambda item: item[1]['top'])
        box = None  # {'top', 'size', 'columns': [(label_left, kind, lines)]} for the box being read

        def close_box():
            nonlocal box
            if box and current:
                for _, box_kind, box_lines in sorted(box['columns'], key=lambda c: c[1] != 'ex'):
                    text = ' '.join(l['text'] for l in box_lines).strip()
                    if text:
                        current['lines'].append({'box': box_kind, 'text': text, 'page': page['number'],
                                                 'top': box_lines[0]['top'], 'height': 0, 'bold': False})
            box = None

        for kind, item in items:
            if kind == 'line':
                label = BOX_LABEL.match(item['text'])
                if label:
                    box_kind = 'tip' if label[1].lower().startswith('tip') else 'ex'
                    if box and abs(item['top'] - box['top']) <= 12:
                        box['columns'].append((item['left'], box_kind, []))
                    else:
                        close_box()
                        box = {'top': item['top'], 'size': None, 'columns': [(item['left'], box_kind, [])]}
                    continue
                if box and item['top'] > box['top'] - 12 and not item['bold'] and (box['size'] is None or abs(item['size'] - box['size']) < 0.6):
                    box['size'] = item['size']
                    centre = item['left'] + 40
                    column = min(box['columns'], key=lambda c: abs(c[0] - centre))
                    column[2].append(item)
                    continue
                close_box()
            if kind == 'image':
                if current:
                    current['figures'][page['number']] += 1
                continue
            text = item['text']
            if STOP.search(text) and sections:  # back-page text; the cover can carry it too
                stopped = True
                break
            headingish = item['bold'] or item['size'] > body_size + 0.5
            targets = parse_heading(text) if (headingish or len(text) < 30) else None
            if targets and (headingish or not current or current['kind'] != 'section' or text.lower().startswith('q')):
                start('section', heading=text, targets=targets)
            elif headingish and SUMMARY_START.match(text) and sections:
                start('summary', heading=text)
            elif headingish and GENERAL_START.match(text) and not sections:
                start('general', heading=text)
            elif headingish and current and current['kind'] == 'section' and SUBPART.match(text) and len(current['targets']) == 1:
                # A bold "(b)" under "Question 3" starts the comment on 3(b).
                parent = current['targets'][0]
                part = norm_part(text)
                start('section', heading=f"Question {parent['q']}{part}", targets=[{'q': parent['q'], 'part': part}])
            elif current:
                text_ok = len(item['text']) >= 25 or item['text'][:1].isupper()
                indent = (item['left'] > body_left[page['number'] % 2] + 40 and not item.get('math')
                          and not BULLET.match(item['text']) and text_ok)
                current['lines'].append({**item, 'page': page['number'], 'indent': indent})
        close_box()

    out = {'sections': []}
    for name in ('general', 'summary'):
        if blocks[name] and blocks[name]['lines']:
            out[name] = finish(blocks[name])
    for index, section in enumerate(sections, 1):
        done = finish(section)
        if not done['paras'] and not done['figures']:
            continue
        out['sections'].append({'id': f's{index}', 'heading': section['heading'], 'targets': section['targets'], **done})
    return out


def finish(block):
    lines = block['lines']
    paras = []
    previous = None
    for line in lines:
        text = line['text']
        if line.get('box'):
            # "Examiner Comments" on an example script ('ex') or an "Examiner Tip" ('tip').
            paras.append({'k': line['box'], 't': text})
            previous = None
            continue
        bullet = BULLET.match(text)
        gap = (line['top'] - previous['top']) if previous and previous['page'] == line['page'] else None
        in_maths = previous is not None and (line.get('math') or previous.get('math')) and gap is not None and -40 < gap < max(previous['height'], line['height']) * 3.2
        new = not in_maths and (
            previous is None or bullet or bool(line.get('indent')) != bool(previous.get('indent')) or (gap is not None and gap > max(previous['height'], line['height']) * 1.6)
            or (gap is not None and gap < 0) or line['bold'] != previous['bold']
            or (previous and previous['page'] != line['page'] and previous['text'].rstrip().endswith(('.', ':', '?'))))
        if new:
            kind = 'ex' if line.get('indent') else 'li' if bullet else 'h' if line['bold'] and len(text) < 90 else 'p'
            paras.append({'k': kind, 't': BULLET.sub('', text) if bullet else text, '_math': False, '_boxes': {}})
        else:
            last = paras[-1]
            joiner = '' if last['t'].endswith('-') and text[:1].islower() else ' '
            last['t'] = (last['t'] + joiner + text).strip()
        last = paras[-1]
        last['_math'] = last['_math'] or bool(line.get('math'))
        box = last['_boxes'].setdefault(line['page'], [line['left'], line['top'], line.get('right', line['left']), line['top'] + line['height']])
        box[0], box[1] = min(box[0], line['left']), min(box[1], line['top'])
        box[2], box[3] = max(box[2], line.get('right', box[2])), max(box[3], line['top'] + line['height'])
        previous = line
    regions = {}
    for line in lines:
        if line.get('box'):
            continue
        r = regions.setdefault(line['page'], [line['left'], line['top'], line.get('right', line['left']), line['top'] + line['height']])
        r[0], r[1] = min(r[0], line['left']), min(r[1], line['top'])
        r[2], r[3] = max(r[2], line.get('right', r[2])), max(r[3], line['top'] + line['height'])
    block['_regions'] = regions
    pages = sorted({line['page'] for line in lines if not line.get('box')} | set(block['figures'])) or sorted({line['page'] for line in lines})
    return {'pages': pages, 'paras': paras, '_regions': regions,
            'figures': [{'page': page, 'count': count} for page, count in sorted(block['figures'].items())]}


# ---------------------------------------------------------------------------------------
# Papers and files


def load_papers(slug):
    subject_id = SUBJECTS[slug]
    papers = []
    for path in sorted((REPO / 'data/packs' / slug).glob('*.json')):
        pack = json.loads(path.read_text())
        for paper in pack.get('papers', []):
            if paper.get('subject_id') == subject_id and paper.get('examiner_report_url'):
                papers.append(paper)
    return papers


def locate_pdf(url, pdf_dirs, fetch):
    name = url.rsplit('/', 1)[-1]
    for folder in [*pdf_dirs, CACHE]:
        candidate = Path(folder).expanduser() / name
        if candidate.exists() and candidate.stat().st_size > 1000:
            return candidate
    if not fetch:
        return None
    CACHE.mkdir(parents=True, exist_ok=True)
    target = CACHE / name
    request = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0 (PurePastPapers report import)'})
    with urllib.request.urlopen(request, timeout=180) as response:
        data = response.read()
    if not data.startswith(b'%PDF'):
        raise RuntimeError(f'{url} did not return a PDF')
    target.write_bytes(data)
    return target


WHOLE_SECTION_CROPS = {'maths'}  # equations on most lines: crop each question's comment whole


def crop_maths(split, pdf, slug, paper_id, whole=False):
    """Paragraphs holding an equation become a crop of that paragraph (pdftotext flattens
    fractions, powers and brackets into nonsense). The text stays as 't' for search and alt."""
    from PIL import Image
    folder = REPO / 'data/reports' / slug / 'img'
    folder.mkdir(parents=True, exist_ok=True)
    for old in folder.glob(f'{paper_id}_*.webp'):
        old.unlink()
    rendered = {}

    def page_image(page):
        if page not in rendered:
            with tempfile.TemporaryDirectory() as tmp:
                subprocess.run(['pdftoppm', '-r', str(CROP_DPI), '-gray', '-png', '-f', str(page), '-l', str(page),
                                str(pdf), f'{tmp}/p'], check=True, capture_output=True)
                rendered[page] = Image.open(next(Path(tmp).glob('p*.png'))).copy()
        return rendered[page]

    def save(page, x0, y0, x1, y1, name_out):
        image = page_image(page)
        scale = image.width / max(1, PAGE_WIDTHS.get(page, image.width))
        box = [int(max(0, (x0 - 6) * scale)), int(max(0, (y0 - 8) * scale)),
               int(min(image.width, (x1 + 8) * scale)), int(min(image.height, (y1 + 10) * scale))]
        crop = image.crop(box)
        crop.save(folder / name_out, 'WEBP', quality=CROP_QUALITY, method=6)
        return {'src': f'{slug}/img/{name_out}', 'w': round(crop.width / scale), 'h': round(crop.height / scale)}

    blocks = [('general', split.get('general')), ('summary', split.get('summary'))] + [(sec['id'], sec) for sec in split['sections']]
    for name, block in blocks:
        if not block:
            continue
        regions = block.pop('_regions', {})
        if whole or (slug in WHOLE_SECTION_CROPS and any(p.get('_math') for p in block['paras'])):
            block['img'] = [save(page, *box, f'{paper_id}_{name}_p{page}.webp') for page, box in sorted(regions.items())]
            for para in block['paras']:
                if para['k'] == 'ex':  # the crop shows them in place
                    para['k'] = 'p'
            continue
        count = 0
        for para in block['paras']:
            boxes = para.pop('_boxes', {})
            if not para.pop('_math', False) or para['k'] in ('ex', 'tip'):
                continue
            images = []
            for page, box in sorted(boxes.items()):
                count += 1
                images.append(save(page, *box, f'{paper_id}_{name}_{count}.webp'))
            para['img'] = images
    for _, block in blocks:
        (block or {}).pop('_regions', None)
        for para in (block or {}).get('paras', []):
            para.pop('_boxes', None); para.pop('_math', None)


PAGE_WIDTHS = {}
CROP_DPI = 150      # pdftohtml works at 108 dpi; 150 keeps small print sharp on phones
CROP_QUALITY = 45


def build_paper(paper, pdf, slug):
    pages = read_layout(pdf)
    if garbled(pages):
        # Text in fonts without a character map. OCR was tried (Tesseract) and misread
        # question numbers, so these papers get no button rather than wrong comments.
        return None
    PAGE_WIDTHS.clear()
    PAGE_WIDTHS.update({page['number']: page['width'] for page in pages})
    split = split_report(pages)
    crop_maths(split, pdf, slug, paper['paper_id'])
    return {
        'format': FORMAT,
        'extractor_version': EXTRACTOR_VERSION,
        'paper_id': paper['paper_id'],
        'subject_id': paper['subject_id'],
        'source_url': paper['examiner_report_url'],
        'source_sha256': hashlib.sha256(pdf.read_bytes()).hexdigest(),
        'source_pages': len(pages),
        'extracted_on': date.today().isoformat(),
        'review_status': 'unreviewed',
        'note': 'Official examiner report text, split at the report\'s own question headings. Not rewritten.',
        **split,
    }


def write_index():
    index = {'format': 'examiner-report-index-v1', 'papers': {}}
    for path in sorted((REPO / 'data/reports').glob('*/*.json')):
        report = json.loads(path.read_text())
        index['papers'][report['paper_id']] = {
            'file': str(path.relative_to(REPO / 'data/reports')),
            'sections': len(report['sections']),
        }
    target = REPO / 'data/reports/index.json'
    target.write_text(json.dumps(index, ensure_ascii=False, indent=1) + '\n')
    return index


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('--subject', choices=sorted(SUBJECTS))
    parser.add_argument('--paper', action='append', default=[], help='only these paper IDs')
    parser.add_argument('--pdf-dir', action='append', default=[], type=Path)
    parser.add_argument('--fetch', action='store_true', help='download reports missing from --pdf-dir and the cache')
    parser.add_argument('--show', action='store_true', help='print the headings found')
    parser.add_argument('--self-test', action='store_true')
    args = parser.parse_args()
    if args.self_test:
        from selftest import run_self_test  # noqa: E402  (tools/reports/selftest.py)
        return run_self_test(sys.modules[__name__])
    if not args.subject:
        parser.error('--subject is required')
    papers = [p for p in load_papers(args.subject) if not args.paper or p['paper_id'] in args.paper]
    missing, failed, written, empty, unreadable = [], [], 0, [], []
    for paper in papers:
        try:
            pdf = locate_pdf(paper['examiner_report_url'], args.pdf_dir, args.fetch)
        except Exception as error:  # network refused, not a PDF, 404
            failed.append((paper['paper_id'], str(error)))
            continue
        if not pdf:
            missing.append(paper['paper_id'])
            continue
        report = build_paper(paper, pdf, args.subject)
        target = REPO / 'data/reports' / args.subject / f"{paper['paper_id']}.json"
        if report is None:
            unreadable.append(paper['paper_id'])
            target.unlink(missing_ok=True)
            continue
        if not report['sections']:
            # e.g. "Pearson will not publish an Examiner's Report for this paper": no button.
            empty.append(paper['paper_id'])
            target.unlink(missing_ok=True)
            continue
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(json.dumps(report, ensure_ascii=False, indent=1) + '\n')
        written += 1
        if args.show:
            print(paper['paper_id'], [s['heading'] for s in report['sections']])
    index = write_index()
    print(f'{args.subject}: {written} reports written, {len(missing)} PDFs not found, {len(failed)} failed; '
          f'{len(index["papers"])} papers in data/reports/index.json')
    if unreadable:
        print('  text not extractable (fonts without a character map):', ', '.join(unreadable))
    if empty:
        print('  no question comments (not published, or headings not recognised):', ', '.join(empty))
    for pid, error in failed[:10]:
        print('  failed', pid, error[:120])
    if missing:
        print('  not found (save as the URL\'s file name in --pdf-dir, or use --fetch):', ', '.join(missing[:8]),
              '…' if len(missing) > 8 else '')
    print('Next: node tools/reports/coverage.mjs', args.subject)
    return 0


if __name__ == '__main__':
    sys.path.insert(0, str(Path(__file__).parent))
    sys.exit(main())
