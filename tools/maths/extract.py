#!/usr/bin/env python3
"""Resumable, source-coordinate extraction of public Pearson 9MA0 PDFs.

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

from source_overrides import apply_overrides

VERSION = 'pearson-9ma0-layout-v5'


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def words_for(page):
    return [w for w in page.extract_words(extra_attrs=['fontname'])
            if w.get('upright', True) and 25 < w['x0'] < page.width - 25
            and 35 < w['top'] < page.height - 72]


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
        r'_{5}|DO NOT WRITE|Question \d+ continued|Total for Question|TOTAL FOR PAPER|BLANK PAGE', line, re.I)).strip()


def region(page, page_index, top, bottom):
    return {'page': page_index + 1, 'bbox': [round(25 / page.width, 6),
            round(max(35, top) / page.height, 6), round((page.width - 25) / page.width, 6),
            round(min(page.height - 72, bottom) / page.height, 6)]}


def extract(path, ocr_dir=None):
    import pdfplumber
    with pdfplumber.open(path) as pdf:
        pages = [{'page': p.filter(lambda c: c.get('object_type') != 'char' or c.get('upright', True)), 'words': words_for(p)} for p in pdf.pages]
        if ocr_dir:
            for i, data in enumerate(pages):
                cache = Path(ocr_dir) / path.stem.replace('__question_paper', '') / f'page-{i + 1:03}.json'
                if not data['words'] and cache.exists():
                    data['words'] = json.loads(cache.read_text())['words']
                    data['page']._ocr_words = data['words']
        starts = []
        exceptions = []
        expected = 1
        cover_text = (pdf.pages[0].extract_text() or '') if pdf.pages else ''
        if pages and getattr(pages[0]['page'], '_ocr_words', None):
            cover_text = clean_text(pages[0]['page'], 0, pages[0]['page'].height)
        expected_count_match = re.search(r'There are\s+(\d+)\s+questions?', cover_text, re.I)
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
                if (w['x0'] < 88 and re.fullmatch(r'\d{1,2}\.?', w['text'])
                        and ('Bold' in w['fontname'] or (w['fontname'] == 'OCR' and w['text'].endswith('.'))) and int(w['text'].rstrip('.')) == expected):
                    starts.append((i, 38 if not starts or starts[-1][0] != i else w['top'] - 25, expected))
                    expected += 1
        questions = []
        for index, (start_page, start_y, number) in enumerate(starts):
            end_page, end_y, _ = starts[index + 1] if index + 1 < len(starts) else (len(pages) - 1, 10000, 0)
            fragments, labels, marks, totals = [], [], [], []
            text_parts = []
            for pi in range(start_page, end_page + 1):
                p = pages[pi]['page']
                lo = start_y if pi == start_page else 38
                hi = end_y if pi == end_page else p.height - 72
                ws = [w for w in pages[pi]['words'] if lo <= w['top'] < hi]
                # Blank answer continuations are intentionally omitted; prompts,
                # diagrams and all mark tariffs remain faithful source regions.
                drawings = [c for c in p.curves + p.lines + p.images
                            if c['x0'] > 60 and c['x1'] < p.width - 60
                            and lo <= c['top'] < hi and c['bottom'] < p.height - 90
                            and c['bottom'] - c['top'] > 3
                            and c['x1'] - c['x0'] < p.width * .75]
                has_figure = len(drawings) >= 3
                substantive = [w for w in ws if not re.search(r'_{5}|Total|Question|continued', w['text'], re.I)]
                tariff = [w for w in ws if re.fullmatch(r'\(\d{1,2}\)', w['text']) and w['x0'] > p.width * .7]
                if pi == end_page and index + 1 < len(starts) and start_page != end_page and hi <= 38:
                    continue
                if not has_figure and (not substantive or (not tariff and all(w['text'].strip('().').isdigit() for w in substantive))):
                    continue
                text = clean_text(p, lo, hi)
                tm = re.search(rf'Total for Question\s+{number}\s+is\s+(\d+)\s+marks?', (p.extract_text() or '') if not getattr(p, '_ocr_words', None) else ' '.join(w['text'] for w in p._ocr_words), re.I)
                if tm:
                    totals.append(int(tm.group(1)))
                # Remove answer lines and continuation-only pages. The last mark
                # tariff bounds an exam prompt; diagram content preceding it stays.
                bottom = max((w['bottom'] for w in tariff), default=0)
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
                    label = re.fullmatch(r'\(([a-h]|[ivx]+)\)', w['text'])
                    if label and w['x0'] < p.width * .28:
                        labels.append({'label': label.group(1), 'page': pi + 1, 'top': w['top'], 'x': w['x0'], 'fragment': frag_index})
                    if w in tariff:
                        marks.append({'marks': int(w['text'][1:-1]), 'page': pi + 1, 'top': w['top'], 'bottom': w['bottom'], 'fragment': frag_index})
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
                'extraction_version': VERSION, 'source_sha256': digest(path), 'source_file': str(path),
                'page_count': len(pages), 'questions': questions,
                'total_marks': sum(q['marks'] for q in questions), 'exceptions': exceptions}
        apply_overrides(candidate)
        return candidate


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('sources', type=Path)
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--ocr-dir', type=Path)
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
                if apply_overrides(old):
                    out.write_text(json.dumps(old, ensure_ascii=False, indent=2) + '\n')
                continue
        pending.append((path, out))
    with concurrent.futures.ProcessPoolExecutor(max_workers=args.workers) as pool:
        futures = {pool.submit(extract, p, args.ocr_dir): (p, out) for p, out in pending}
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
