#!/usr/bin/env python3
"""Resumable, source-coordinate extraction of public Pearson Biology A (9BN0/8BN0) PDFs.

Adapted from tools/maths/extract.py for the Biology booklet layout:
  * each page's printed content box bounds every word and crop, so the rotated
    "DO NOT WRITE IN THIS AREA" strips, barcodes and trim marks never enter a crop
    on either page geometry (652x899 with trim marks, or trimmed A4);
  * question totals read "(Total for Question N = M marks)";
  * a part's crop ends at its last substantive line or drawing before the next
    part, not at its tariff: multiple-choice options A-D, graph grids and answer
    tables printed after a tariff are kept; dotted answer lines are not;
  * cover and erratum pages are never searched for question starts; erratum pages
    are recorded so the build can show them as official context.

Output is a review candidate, never a publishable pack. OCR (tools/biology/ocr.py)
is used for positioning on image-only pages only.
"""
import argparse
import concurrent.futures
import hashlib
import json
import re
from pathlib import Path

from source_overrides import overrides_for

VERSION = 'pearson-9bn0-layout-v12'
JUNK = re.compile(r'^[.·…_\-–\s]+$')
LINE_JUNK = re.compile(r'DO NOT WRITE|Total for Question|TOTAL FOR PAPER|BLANK PAGE|Turn over|\*[A-Z]?\d{5}[A-Z]{1,2}\d{4}\*|^\s*[.·…_\s]+$', re.I)
LABEL = re.compile(r'(\*?)\(([a-z]|[ivx]+)\)')  # '*' marks an extended response
TARIFF = re.compile(r'\((\d{1,2})\)')


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def content_box(page):
    """The printed rounded content frame, or the same layout scaled from A4."""
    width, height = page.width, page.height
    # Collated SAM pages also carry an invisible copy of the facing page placed
    # off-canvas (negative x); only frames inside the visible page count.
    frames = [s for s in page.rects + page.curves
              if s['x1'] - s['x0'] > width * .7 and s['bottom'] - s['top'] > height * .7
              and s['x0'] >= -1 and s['x1'] <= width + 1 and s['top'] >= -1 and s['bottom'] <= height + 1]
    if frames:
        frame = min(frames, key=lambda s: (s['x1'] - s['x0']) * (s['bottom'] - s['top']))
        return frame['x0'], frame['top'], frame['x1'], frame['bottom'], 'frame'
    offset = (width - 595.28) / 2
    return 35 + offset, 36 + offset, 560 + offset, 794 + offset, 'geometry'


def page_words(page, box, ocr_words=None):
    x0, top, x1, bottom, _ = box
    source = ocr_words if ocr_words is not None else page.extract_words(extra_attrs=['fontname', 'size'])
    return [w for w in merge_split_labels(source) if w.get('upright', True) and w['x0'] >= x0 - 2 and w['x1'] <= x1 + 2
            and w['top'] >= top - 1 and w['bottom'] <= bottom + 1]


def merge_split_labels(words):
    """Rejoin labels split by the text layer, e.g. '*(' + 'b)' or '*' + '(b)'."""
    words = sorted(words, key=lambda w: (round(w['top']), w['x0']))
    out, skip = [], False
    for i, w in enumerate(words):
        if skip:
            skip = False
            continue
        nxt = words[i + 1] if i + 1 < len(words) else None
        if nxt and w['text'] in ('*', '*(', '(') and abs(nxt['top'] - w['top']) < 3 and -1.5 <= nxt['x0'] - w['x1'] < 4:
            out.append({**w, 'text': w['text'] + nxt['text'], 'x1': nxt['x1'], 'bottom': max(w['bottom'], nxt['bottom'])})
            skip = True
        else:
            out.append(w)
    return out


def substantive(words):
    """Printed content: drops dotted answer lines and whole Total/TOTAL FOR PAPER lines."""
    total_tops = [w['top'] for w in words if re.search(r'Total|TOTAL', w['text'])
                  and re.search(r'Total for Question|TOTAL FOR PAPER', line_text(words, w), re.I)]
    return [w for w in words if not JUNK.match(w['text']) and not LINE_JUNK.search(w['text'])
            and not any(abs(w['top'] - t) < 4 for t in total_tops)]


def line_text(words, word):
    return ' '.join(w['text'] for w in sorted(words, key=lambda w: w['x0']) if abs(w['top'] - word['top']) < 4)


def drawings(page, box, lo, hi):
    x0, top, x1, bottom, _ = box
    out = []
    for s in page.curves + page.lines + page.rects + page.images:
        if s['x1'] - s['x0'] > (x1 - x0) * .9 and s['bottom'] - s['top'] > (bottom - top) * .5:
            continue  # the content frame itself
        if s['bottom'] - s['top'] <= 3:
            continue  # rules and dotted answer lines
        if s['x0'] < x0 - 2 or s['x1'] > x1 + 2 or not (lo <= s['top'] < hi) or s['bottom'] > bottom + 2:
            continue
        out.append(s)
    return out


def region(page, box, page_index, top, bottom):
    x0, btop, x1, bbottom, _ = box
    x0, x1 = x0 + 4, x1 - 4  # stay inside the printed frame's border
    return {'page': page_index + 1, 'bbox': [round(x0 / page.width, 6), round(max(btop, top) / page.height, 6),
                                             round(x1 / page.width, 6), round(min(bbottom, bottom) / page.height, 6)]}


def page_kind(text):
    if re.search(r'Erratum Notice', text, re.I):
        return 'erratum'
    if re.search(r'Candidate surname|Centre Number|Instructions', text) and re.search(r'Information|Total Marks', text):
        return 'cover'
    if re.search(r'^\s*BLANK PAGE\s*$', text, re.M | re.I) and len(text.split()) < 40:
        return 'blank'
    return 'content'


def extract(path, ocr_dir=None):
    import pdfplumber
    source_sha = digest(path)
    extra_words, override_note = overrides_for(source_sha)
    with pdfplumber.open(path) as pdf:
        pages = []
        for i, p in enumerate(pdf.pages):
            page = p.filter(lambda c: c.get('object_type') != 'char' or c.get('upright', True))
            box = content_box(p)
            ocr = None
            if ocr_dir:
                cache = Path(ocr_dir) / path.stem.replace('__question_paper', '') / f'page-{i + 1:03}.json'
                if cache.exists() and len(p.chars) < 20:
                    ocr = json.loads(cache.read_text())['words'] + extra_words.get(i + 1, [])
            words = page_words(page, box, ocr)
            # For scans, classify from words inside the frame (not the margin strips).
            text = (p.extract_text() or '') if ocr is None else ' '.join(w['text'] for w in words)
            full_text = (p.extract_text() or '') if ocr is None else ' '.join(w['text'] for w in ocr)
            kind = page_kind(text)
            if kind == 'content' and ocr is not None and page_kind(full_text) == 'cover':
                kind = 'cover'
            pages.append({'page': page, 'box': box, 'words': words, 'ocr': ocr is not None,
                          'kind': kind, 'text': full_text})
        cover = next((pg['text'] for pg in pages if pg['kind'] == 'cover'), '')
        expected_marks_match = re.search(r'total mark for this paper is\s+(\d+)', ' '.join(cover.split()), re.I)
        expected_marks = int(expected_marks_match.group(1)) if expected_marks_match else None
        starts, exceptions = [], []
        expected = 1
        for i, data in enumerate(pages):
            if data['kind'] != 'content':
                continue
            bx0 = data['box'][0]
            for w in sorted(data['words'], key=lambda w: (w['top'], w['x0'])):
                bold = 'Bold' in w.get('fontname', '') or w.get('fontname') == 'OCR'
                if not (w['x0'] < bx0 + 22 and bold and re.fullmatch(r'\*?\d{1,2}\.?', w['text'])):
                    continue
                if int(w['text'].strip('*.')) != expected:
                    continue
                rest = [v for v in data['words'] if abs(v['top'] - w['top']) < 4 and v['x0'] > w['x1']]
                if not rest:
                    continue  # a lone number is not a question stem
                first_on_page = not starts or starts[-1][0] != i
                starts.append((i, data['box'][1] + 2 if first_on_page and w['top'] < data['box'][1] + 60 else w['top'] - 8, expected,
                               w['text'].startswith('*')))
                expected += 1
        questions = []
        for index, (start_page, start_y, number, starred) in enumerate(starts):
            end_page, end_y = starts[index + 1][:2] if index + 1 < len(starts) else (len(pages) - 1, 10000)
            fragments, labels, marks, totals, text_parts = [], [], [], [], []
            for pi in range(start_page, end_page + 1):
                data = pages[pi]
                if data['kind'] != 'content':
                    continue
                p, box = data['page'], data['box']
                lo = start_y if pi == start_page else box[1]
                hi = end_y if pi == end_page else box[3]
                if hi - lo < 4:
                    continue
                ws = [w for w in data['words'] if lo <= w['top'] < hi]
                real = substantive(ws)
                # A scanned page's embedded images are the page itself, not figures.
                shapes = [] if data['ocr'] else drawings(p, box, lo, hi)
                total_line = next((line_text(ws, w) for w in ws if w['text'].lstrip('(').startswith('Total')), '')
                tm = re.search(rf'Total for Question\s+{number}\s*=\s*(\d+)\s*marks?', total_line, re.I)
                if tm:
                    totals.append(int(tm.group(1)))
                if not real and not shapes:
                    continue
                bottom = max([w['bottom'] for w in real] + [s['bottom'] for s in shapes])
                frag_index = len(fragments)
                fragment = region(p, box, pi, lo - 2, bottom + 6)
                tariffs = [w for w in ws if TARIFF.fullmatch(w['text']) and w['x0'] > box[0] + (box[2] - box[0]) * .6
                           and not re.search(r'Total|marks', line_text(ws, w), re.I)]
                if not tariffs and shapes:
                    fragment['shared_figure'] = True
                fragments.append(fragment)
                text_parts.append('\n'.join(line_text(real, w) for w in real if w is min(
                    (v for v in real if abs(v['top'] - w['top']) < 4), key=lambda v: v['x0'])))
                page_labels = []
                for w in ws:
                    label = LABEL.fullmatch(w['text'])
                    if label and w['x0'] < box[0] + (box[2] - box[0]) * .25:
                        page_labels.append({'label': label.group(2), 'extended_response': bool(label.group(1)),
                                            'page': pi + 1, 'top': w['top'], 'x': w['x0'], 'fragment': frag_index})
                labels.extend(page_labels)
                for t in tariffs:
                    # Content of this part continues below its tariff (MC options,
                    # grids, tables) until the next label or question on this page.
                    nxt = min([l['top'] for l in page_labels if l['top'] > t['top'] + 2] + [hi])
                    after = [w['bottom'] for w in real if t['top'] - 2 <= w['top'] < nxt]
                    after += [s['bottom'] for s in shapes if t['top'] - 2 <= s['top'] < nxt]
                    marks.append({'marks': int(t['text'][1:-1]), 'page': pi + 1, 'top': t['top'],
                                  'tariff_bottom': t['bottom'], 'bottom': max([t['bottom']] + after),
                                  'fragment': frag_index})
            # '(i)' is the ninth letter only when it follows '(h)' or precedes '(j)';
            # otherwise it is a Roman sub-part (indentation varies between booklets).
            # Letters must also run in sequence; a bracketed symbol such as '(n)' in a
            # formula is not a part label.
            previous_letter, accepted = '', []
            for k, l in enumerate(labels):
                roman = re.fullmatch(r'[ivx]+', l['label'])
                following = labels[k + 1]['label'] if k + 1 < len(labels) else ''
                if not roman or (l['label'] == 'i' and (previous_letter == 'h' or following == 'j')):
                    expected_next = chr(ord(previous_letter) + 1) if previous_letter else None
                    if l['label'] != expected_next and not (not previous_letter and l['label'] in 'ab'):
                        exceptions.append({'question': number, 'type': 'ignored_out_of_sequence_label',
                                           'label': l['label'], 'page': l['page']})
                        continue
                    l['level'] = 'letter'
                    previous_letter = l['label']
                else:
                    l['level'] = 'roman'
                accepted.append(l)
            labels = accepted
            # Some booklets print '(i)', '(ii)' before '(b)' with no '(a)' (the scheme
            # calls them (a)(i), (a)(ii)): record the implied letter.
            first_letter = next((l['label'] for l in labels if l['level'] == 'letter'), None)
            parts, letter, consumed = [], '', set()
            if first_letter == 'b' and labels and labels[0]['level'] == 'roman':
                letter = 'a'
                exceptions.append({'question': number, 'type': 'implied_letter_a',
                                   'note': 'Booklet prints (i), (ii) before (b) without (a); labelled (a)(i), (a)(ii) as in the scheme.'})
            for mi, mark in enumerate(marks):
                preceding = [l for l in labels if (l['page'], l['top']) <= (mark['page'], mark['top'] + 2)]
                last = preceding[-1] if preceding else None
                for label in preceding:
                    if label['level'] == 'letter':
                        letter = label['label']
                if last:
                    value = last['label']
                    part_label = f'({letter})({value})' if last['level'] == 'roman' and letter else f'({value})'
                    key = (last['page'], last['top'])
                    if key in consumed:
                        exceptions.append({'question': number, 'type': 'repeated_tariff_after_label', 'part': part_label})
                    consumed.add(key)
                else:
                    part_label = ''
                earlier = marks[mi - 1] if mi else {'page': 0, 'top': 0}
                joint = [l for l in preceding if (l['page'], l['top']) > (earlier['page'], earlier['top'])]
                parts.append({'part_label': part_label, **mark, 'start': joint[0] if joint else last,
                              'joint_labels': [l['label'] for l in joint],
                              'extended_response': bool(last and last.get('extended_response')) or (starred and not labels)})
            tariff_sum = sum(m['marks'] for m in marks)
            total = totals[0] if totals else tariff_sum
            if not totals:
                exceptions.append({'question': number, 'type': 'no_printed_total'})
            if total != tariff_sum:
                exceptions.append({'question': number, 'type': 'marks_mismatch', 'printed_total': total, 'tariff_sum': tariff_sum})
            if not marks:
                exceptions.append({'question': number, 'type': 'no_tariffs'})
            if any(pages[p['page'] - 1]['ocr'] for p in fragments):
                exceptions.append({'question': number, 'type': 'ocr_positioned',
                                   'review_required': 'Image-only source page: verify crops against the source rendering.'})
            questions.append({'number': str(number), 'marks': total, 'regions': fragments, 'extended_response_marker': starred,
                              'text': '\n'.join(text_parts), 'parts': parts})
        if not questions:
            exceptions.append({'type': 'empty_question_extraction'})
        paper_sum = sum(q['marks'] for q in questions)
        if expected_marks is not None and paper_sum != expected_marks:
            exceptions.append({'type': 'paper_marks_mismatch', 'expected': expected_marks, 'actual': paper_sum})
        printed_paper_total = re.search(r'TOTAL FOR PAPER\s*=?\s*(\d+)\s*MARKS', ' '.join(pg['text'] for pg in pages), re.I)
        if override_note:
            exceptions.append({'type': 'checksum_bound_override', 'note': override_note})
        return {'expected_total_marks': expected_marks,
                'printed_paper_total': int(printed_paper_total.group(1)) if printed_paper_total else None,
                'extraction_version': VERSION, 'source_sha256': source_sha, 'source_file': path.name,
                'page_count': len(pages), 'page_kinds': [pg['kind'] for pg in pages],
                'erratum_pages': [i + 1 for i, pg in enumerate(pages) if pg['kind'] == 'erratum'],
                'ocr_pages': [i + 1 for i, pg in enumerate(pages) if pg['ocr']],
                'content_box_basis': sorted({pg['box'][4] for pg in pages if pg['kind'] == 'content'}),
                'questions': questions, 'total_marks': paper_sum, 'exceptions': exceptions}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('sources', type=Path)
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--ocr-dir', type=Path)
    parser.add_argument('--paper', action='append', help='Limit to these paper ids')
    parser.add_argument('--workers', type=int, default=4)
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=True)
    paths = sorted(args.sources.glob('*__question_paper.pdf'))
    if args.paper:
        paths = [p for p in paths if p.stem.replace('__question_paper', '') in args.paper]
    pending = []
    for path in paths:
        out = args.output / (path.stem.replace('__question_paper', '') + '.json')
        if out.exists():
            old = json.loads(out.read_text())
            if old.get('extraction_version') == VERSION and old.get('source_sha256') == digest(path):
                continue
        pending.append((path, out))
    with concurrent.futures.ProcessPoolExecutor(max_workers=args.workers) as pool:
        futures = {pool.submit(extract, p, args.ocr_dir): (p, out) for p, out in pending}
        for future in concurrent.futures.as_completed(futures):
            path, out = futures[future]
            try:
                data = future.result()
                out.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n')
                print(path.name, len(data['questions']), 'questions', data['total_marks'], 'marks',
                      len(data['exceptions']), 'exceptions', flush=True)
            except Exception as exc:
                print(path.name, 'FAILED', repr(exc), flush=True)


if __name__ == '__main__':
    main()
