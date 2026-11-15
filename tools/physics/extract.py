#!/usr/bin/env python3
"""Resumable, source-coordinate extraction of public Pearson 9PH0/8PH0 Physics PDFs.

Adapted from tools/maths/extract.py: Physics prints "(Total for Question N = M marks)",
single-mark multiple-choice questions carry no "(1)" tariff (the total line is used as
their tariff), and extended-response parts are starred "*(c)".

Requires pdfplumber and pypdfium2 (development only). Never rewrites questions:
source images are the authoritative mathematical rendering. Output is a review
candidate, not a publishable content pack. Run build only after review.
"""
import argparse
import concurrent.futures
import hashlib
import json
import re
from pathlib import Path


VERSION = 'pearson-9ph0-layout-v5-checked-ocr-overrides'
TOTAL = r'Total for Question\s+{n}\s*=\s*(\d+)\s*marks?'


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def _shift(obj, ox, oy):
    out = dict(obj)
    for key in ('x0', 'x1'):
        if key in out: out[key] = out[key] - ox
    for key in ('top', 'bottom'):
        if key in out: out[key] = out[key] - oy
    return out


class CropView:
    """A page seen through its CropBox: the area PDFium renders and readers see.

    Some 2020+ Pearson booklets have a MediaBox inset by 28.35pt on every side. All
    coordinates here are relative to the CropBox so extraction thresholds and the
    rendered crops share one geometry (render.py renders the CropBox).
    """

    def __init__(self, page):
        x0, y0, x1, y1 = page.cropbox
        mh = page.mediabox[3] - page.mediabox[1]
        self.raw, self.ox, self.oy = page, x0, mh - y1
        self.width, self.height = x1 - x0, y1 - y0
        inside = lambda o: o['x0'] >= x0 - 1 and o['x1'] <= x1 + 1
        self.curves = [_shift(o, self.ox, self.oy) for o in page.curves if inside(o)]
        self.lines = [_shift(o, self.ox, self.oy) for o in page.lines if inside(o)]
        self.images = [_shift(o, self.ox, self.oy) for o in page.images if inside(o)]
        self.rects = [_shift(o, self.ox, self.oy) for o in page.rects if inside(o)]

    def extract_words(self, **kw):
        return [_shift(w, self.ox, self.oy) for w in self.raw.extract_words(**kw)]

    def crop(self, bbox):
        a, b, c, d = bbox
        X0, T0, X1, B1 = self.raw.bbox
        box = (max(X0, a + self.ox), max(T0, b + self.oy), min(X1, c + self.ox), min(B1, d + self.oy))
        return self.raw.crop(box)

    def extract_text(self):
        return self.crop((0, 0, self.width, self.height)).extract_text()


def _merge_split_numbers(words):
    # Some booklets set a starred question number as "*1" + "5" with a kerning gap.
    out = []
    for w in words:
        prev = out[-1] if out else None
        if (prev and re.fullmatch(r'\*?\d', prev['text']) and re.fullmatch(r'\d', w['text'])
                and abs(prev['top'] - w['top']) < 1 and 0 <= w['x0'] - prev['x1'] < 2.5
                and 'Bold' in prev['fontname'] and 'Bold' in w['fontname']):
            out[-1] = {**prev, 'text': prev['text'] + w['text'], 'x1': w['x1']}
            continue
        # A starred part label can be set as "*(" + "c)".
        if (prev and prev['text'] in ('*(', '(') and re.fullmatch(r'(?:[a-h]|[ivx]+)\)', w['text'])
                and abs(prev['top'] - w['top']) < 1 and 0 <= w['x0'] - prev['x1'] < 2.5):
            out[-1] = {**prev, 'text': prev['text'] + w['text'], 'x1': w['x1']}
            continue
        out.append(w)
    return out


def words_for(page):
    return [w for w in _merge_split_numbers(page.extract_words(extra_attrs=['fontname']))
            if w.get('upright', True) and 25 < w['x0'] < page.width - 25
            and 35 < w['top'] < page.height - 45
            # Running footers (page number, "Turn over", barcode) sit below the last
            # question line; a total line can sit lower than the Maths layout allows.
            and not (w['top'] > page.height - 72 and re.fullmatch(r'\d{1,2}|Turn|over|\*P\w+\*', w['text']))]


def clean_text(page, top, bottom):
    if getattr(page, '_ocr_words', None):
        rows = []
        for word in sorted(page._ocr_words, key=lambda w: (round(w['top'] / 6), w['x0'])):
            if not (top <= word['top'] < bottom and 25 < word['x0'] < page.width - 25):
                continue
            if not rows or abs(rows[-1][0] - word['top']) > 7:
                rows.append([word['top'], []])
            rows[-1][1].append(word['text'])
        text = '\n'.join(' '.join(row[1]) for row in rows)
    else:
        text = page.crop((25, max(0, top), page.width - 25, min(page.height, bottom))).extract_text() or ''
    return '\n'.join(line for line in text.splitlines() if not re.search(
        r'_{5}|\.{8}|DO NOT WRITE|Question \d+ continued|Total for Question|TOTAL FOR (?:SECTION|PAPER)|BLANK PAGE', line, re.I)).strip()


def tariff_like(ws, p):
    return any(re.fullmatch(r'\(\d{1,2}\)', w['text']) and w['x0'] > p.width * .7 for w in ws)


def region(page, page_index, top, bottom):
    return {'page': page_index + 1, 'bbox': [round(25 / page.width, 6),
            round(max(35, top) / page.height, 6), round((page.width - 25) / page.width, 6),
            round(min(page.height - 45, bottom) / page.height, 6)]}


def apply_ocr_overrides(words, page_number, override, sha):
    """Apply checked corrections to one scanned page's OCR words.

    Overrides only add or correct layout tokens (question numbers, part labels and
    "(n)" tariffs) that tesseract missed or misread. Each was checked against the
    rendered source page. They never supply question text: crops stay source pixels.
    """
    if override.get('source_sha256') != sha:
        raise ValueError(f"OCR override is for another source revision: {override.get('paper_id')}")
    words = list(words)
    for item in override['words']:
        if item['page'] != page_number:
            continue
        if item['action'] == 'add':
            # Keep tesseract's reading order: insert before the first later line.
            at = next((k for k, w in enumerate(words) if w['top'] > item['top'] + 3), len(words))
            words.insert(at, {'text': item['text'], 'x0': item['x0'], 'x1': item['x1'], 'top': item['top'],
                          'bottom': item['bottom'], 'fontname': 'OCR', 'upright': True, 'override': True})
        elif item['action'] == 'correct':
            near = [w for w in words if abs(w['top'] - item['top']) < 5 and abs(w['x0'] - item['x0']) < 8 and w['text'] == item['was']]
            if len(near) != 1:
                raise ValueError(f"OCR override p{page_number} {item}: expected one {item['was']!r} near it, found {len(near)}")
            words[words.index(near[0])] = {**near[0], 'text': item['text'], 'override': True}
        elif item['action'] == 'drop':
            near = [w for w in words if abs(w['top'] - item['top']) < 5 and abs(w['x0'] - item['x0']) < 8 and w['text'] == item['was']]
            if len(near) != 1:
                raise ValueError(f"OCR override p{page_number} {item}: expected one {item['was']!r} near it, found {len(near)}")
            words.remove(near[0])
        else:
            raise ValueError(f"Unknown OCR override action {item['action']!r}")
    return words


def extract(path, ocr_dir=None, overrides_dir=None):
    import pdfplumber
    with pdfplumber.open(path) as pdf:
        views = [CropView(p.filter(lambda c: c.get('object_type') != 'char' or c.get('upright', True))) for p in pdf.pages]
        pages = [{'page': v, 'words': words_for(v)} for v in views]
        sha = digest(path)
        pid = path.stem.replace('__question_paper', '')
        override_file = Path(overrides_dir) / f'{pid}.json' if overrides_dir else None
        override = json.loads(override_file.read_text()) if override_file and override_file.exists() else None
        if ocr_dir:
            for i, data in enumerate(pages):
                cache = Path(ocr_dir) / path.stem.replace('__question_paper', '') / f'page-{i + 1:03}.json'
                if not data['words'] and cache.exists():
                    cached = json.loads(cache.read_text())
                    data['words'] = cached['words']
                    if override:
                        data['words'] = apply_ocr_overrides(data['words'], i + 1, override, sha)
                    data['page']._ocr_words = data['words']
                    # A scan is one page image: use OCR ink bands as its drawings.
                    data['page'].images = []
                    data['page'].curves = [{**f, 'ocr_figure': True} for f in cached.get('figures', [])
                                           for _ in range(3)]
        starts = []
        exceptions = []
        expected = 1
        cover_text = (pdf.pages[0].extract_text() or '') if pdf.pages else ''
        if pages and getattr(pages[0]['page'], '_ocr_words', None):
            cover_text = clean_text(pages[0]['page'], 0, pages[0]['page'].height)
        expected_count_match = None
        expected_count = int(expected_count_match.group(1)) if expected_count_match else None
        expected_marks_match = re.search(r'total marks? for (?:this (?:part of the examination|paper|question paper)|the paper) is\s+(\d+)', cover_text, re.I)
        expected_marks = int(expected_marks_match.group(1)) if expected_marks_match else None
        for i, data in enumerate(pages):
            if getattr(data['page'], '_ocr_words', None) and i > 0:
                # Vision can omit an isolated number above a diagram. The next
                # source page's explicit continuation header identifies that
                # question; retain the evidence and require source-crop review.
                for word in data['words']:
                    if word['text'].lower() != 'question' or word['x0'] > 100 or word['top'] > 150:
                        continue
                    header = ' '.join(w['text'] for w in sorted(data['words'], key=lambda w: w['x0'])
                                      if abs(w['top'] - word['top']) < 5)
                    continued = re.search(r'Question\s+(\d+)\s+continued', header, re.I)
                    if continued and int(continued.group(1)) == expected and not any(p == i - 1 for p, _, _ in starts):
                        starts.append((i - 1, 38, expected))
                        exceptions.append({'question': expected, 'type': 'ocr_question_number_inferred_from_continuation',
                                           'source_page': i + 1, 'start_page': i,
                                           'review_required': 'Compare the source question-number and diagram crop.'})
                        expected += 1
            for w in data['words']:

                # Bold question numbers at the left margin; reject cover/answer lines.
                if (w['x0'] < 78 and re.fullmatch(r'\*?\d{1,2}', w['text'])
                        and ('Bold' in w['fontname'] or w['fontname'] == 'OCR') and int(w['text'].lstrip('*')) == expected
                        and w['top'] < pages[i]['page'].height - 80):
                    top = 38 if not starts or starts[-1][0] != i else w['top'] - 25
                    if getattr(data['page'], '_ocr_words', None) and top > 38:
                        # Scans: never start inside the previous question's total line.
                        totals = [o for o in data['words'] if o['text'] == '(Total' and o['bottom'] > top and o['top'] < w['top'] - 3]
                        above = [o['bottom'] for t in totals for o in data['words'] if abs(o['top'] - t['top']) < 4]
                        top = max([top] + [b + 7 for b in above])
                    starts.append((i, top, expected))
                    expected += 1
        questions = []
        for index, (start_page, start_y, number) in enumerate(starts):
            end_page, end_y, _ = starts[index + 1] if index + 1 < len(starts) else (len(pages) - 1, 10000, 0)
            fragments, labels, marks, totals = [], [], [], []
            text_parts = []
            for pi in range(start_page, end_page + 1):
                p = pages[pi]['page']
                lo = start_y if pi == start_page else 38
                hi = end_y if pi == end_page else p.height - 45
                ws = [w for w in pages[pi]['words'] if lo <= w['top'] < hi]
                # Blank answer continuations are intentionally omitted; prompts,
                # diagrams and all mark tariffs remain faithful source regions.
                drawings = [c for c in p.curves + p.lines + p.images + getattr(p, 'rects', [])
                            if (c.get('ocr_figure') and lo <= c['top'] < hi) or c['x0'] > 60 and c['x1'] < p.width - 60
                            and lo <= c['top'] < hi and c['bottom'] < p.height - 60
                            and c['bottom'] - c['top'] > 3
                            and c['x1'] - c['x0'] < p.width * .75]
                has_figure = len(drawings) >= 3
                substantive = [w for w in ws if not re.search(r'_{5}|\.{8}|Total|Question|continued', w['text'], re.I)]
                if re.search(r'BLANK\s+PAGE', ' '.join(w['text'] for w in ws), re.I) and not tariff_like(ws, p):
                    continue
                tariff = [w for w in ws if re.fullmatch(r'\(\d{1,2}\)', w['text']) and w['x0'] > p.width * .7]
                page_text = (p.extract_text() or '') if not getattr(p, '_ocr_words', None) else ' '.join(w['text'] for w in p._ocr_words)
                total_words = [w for w in ws if w['text'] == '(Total' and w['x0'] > p.width * .45]
                if pi == end_page and index + 1 < len(starts) and start_page != end_page and hi <= 38:
                    continue
                if not has_figure and (not substantive or (not tariff and all(w['text'].strip('().').isdigit() for w in substantive))):
                    continue
                text = clean_text(p, lo, hi)
                tm = re.search(TOTAL.format(n=number), page_text, re.I)
                if tm:
                    totals.append(int(tm.group(1)))
                    # A multiple-choice question has no part tariff: its printed total
                    # line is the single tariff occurrence for the whole question.
                    if not tariff and not marks and total_words:
                        tw = total_words[-1]
                        tariff = [{**tw, 'text': f'({tm.group(1)})', 'total_line': True}]
                # Remove answer lines and continuation-only pages. The last mark
                # tariff bounds an exam prompt; diagram content preceding it stays.
                bottom = max((w['bottom'] for w in tariff), default=0)
                if bottom:
                    # Physics prints a part's data and diagrams after its "(n)" tariff, and the
                    # next part's stem can follow the answer lines: keep all printed content.
                    printed = [w['bottom'] for w in substantive if not re.fullmatch(r'TURN|OVER|FOR|QUESTION|\d+', w['text'], re.I)]
                    bottom = max([bottom] + printed + [c['bottom'] for c in drawings if c['top'] > bottom])
                if not bottom:
                    if not has_figure and (not text or len(re.sub(r'[\W\d_]', '', text)) < 8):
                        continue
                    non_lines = [w for w in ws if '_' not in w['text']]
                    if not non_lines or re.fullmatch(r'[\W\d]*(?:Total for Question.*)?', text, re.I):
                        continue
                    bottom = max([w['bottom'] for w in non_lines] + [c['bottom'] for c in drawings])
                if not tariff and 'Question' in text and 'continued' in text and len(text) < 120:
                    continue
                frag_index = len(fragments)
                fragment = region(p, pi, lo, bottom + 7)
                if not tariff and has_figure: fragment['shared_figure'] = True
                fragments.append(fragment)
                text_parts.append(clean_text(p, lo, bottom + 7))
                for w in ws:
                    if w['top'] > bottom + 2:
                        continue
                    label = re.fullmatch(r'\*?\(([a-h]|[ivx]+)\)', w['text'])
                    if label and w['x0'] < p.width * .28:
                        labels.append({'label': label.group(1), 'page': pi + 1, 'top': w['top'], 'x': w['x0'], 'fragment': frag_index})
                for w in tariff:
                    if w['top'] <= bottom + 2:
                        marks.append({'marks': int(w['text'][1:-1]), 'page': pi + 1, 'top': w['top'], 'bottom': w['bottom'], 'fragment': frag_index,
                                      **({'source': 'total_line'} if w.get('total_line') else {})})
            # A question has one tariff per assessable leaf. Associate each tariff
            # with its closest preceding part label, preserving nested Roman paths.
            parts, letter, consumed = [], '', set()
            for mi, mark in enumerate(marks):
                preceding = [l for l in labels if (l['page'], l['top']) <= (mark['page'], mark['top'] + 2)]
                last = preceding[-1] if preceding else None
                for label in preceding:
                    if label['label'] in 'abcdefgh' and len(label['label']) == 1:
                        letter = label['label']
                if last:
                    value = last['label']
                    # (i) after (h) can be a letter; x indentation differentiates
                    # Roman leaves in Pearson booklets. Ambiguous cases are queued.
                    part_label = f'({letter})({value})' if value in ['i','ii','iii','iv','v','vi'] and letter else f'({value})'
                    key = (last['page'], last['top'])
                    if key in consumed:
                        exceptions.append({'question': number, 'type': 'repeated_tariff_after_label', 'part': part_label})
                    consumed.add(key)
                else:
                    part_label = ''
                earlier = marks[mi - 1] if mi else {'page': 0, 'top': 0}
                joint_labels = [l for l in preceding if (l['page'], l['top']) > (earlier['page'], earlier['top'])]
                parts.append({'part_label': part_label, **mark, 'start': joint_labels[0] if joint_labels else last, 'joint_labels': [l['label'] for l in joint_labels]})
            total = totals[0] if totals else sum(m['marks'] for m in marks)
            if total != sum(m['marks'] for m in marks):
                exceptions.append({'question': number, 'type': 'marks_mismatch', 'printed_total': total, 'tariff_sum': sum(m['marks'] for m in marks)})
            if not marks:
                exceptions.append({'question': number, 'type': 'no_tariffs'})
            questions.append({'number': str(number), 'marks': total, 'regions': fragments,
                              'text': '\n'.join(text_parts), 'parts': parts})
        if not questions:
            exceptions.append({'type': 'empty_question_extraction', 'expected_question_count': expected_count})
        if expected_count is not None and len(questions) != expected_count:
            exceptions.append({'type': 'question_count_mismatch', 'expected': expected_count, 'actual': len(questions)})
        if expected_marks is not None and sum(q['marks'] for q in questions) != expected_marks:
            exceptions.append({'type': 'paper_marks_mismatch', 'expected': expected_marks,
                               'actual': sum(q['marks'] for q in questions)})
        candidate = {'expected_question_count': expected_count, 'expected_total_marks': expected_marks,
                'extraction_version': VERSION, 'source_sha256': sha, 'source_file': str(path),
                'ocr_overrides': len(override['words']) if override else 0,
                'page_count': len(pages), 'questions': questions,
                'total_marks': sum(q['marks'] for q in questions), 'exceptions': exceptions}
        return candidate


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('sources', type=Path)
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--ocr-dir', type=Path)
    parser.add_argument('--ocr-overrides', type=Path, help='checked OCR layout corrections, one JSON per paper')
    parser.add_argument('--workers', type=int, default=4)
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=True)
    paths = sorted(args.sources.glob('*__question_paper.pdf'))
    pending = []
    for path in paths:
        out = args.output / (path.stem.replace('__question_paper', '') + '.json')
        if out.exists():
            old = json.loads(out.read_text())
            if old.get('extraction_version') == VERSION and old.get('source_sha256') == digest(path):
                continue
        pending.append((path, out))
    with concurrent.futures.ProcessPoolExecutor(max_workers=args.workers) as pool:
        futures = {pool.submit(extract, p, args.ocr_dir, args.ocr_overrides): (p, out) for p, out in pending}
        for future in concurrent.futures.as_completed(futures):
            path, out = futures[future]
            try:
                data = future.result()
                out.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n')
                print(path.name, len(data['questions']), 'questions', data['total_marks'], 'marks', len(data['exceptions']), 'exceptions', flush=True)
            except Exception as exc:
                print(path.name, 'FAILED', repr(exc), flush=True)
    print('Candidates require source and tagging review before publication.', flush=True)


if __name__ == '__main__':
    main()
