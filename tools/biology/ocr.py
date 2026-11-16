#!/usr/bin/env python3
"""Positioning-only OCR for image-only Biology question papers (Linux, tesseract).

Writes pdfplumber-compatible word records in PDF points (MediaBox coordinates),
fontname 'OCR'. OCR text is used only to locate question numbers, labels and
tariffs; published questions are always the original source pixels.

Usage: python3 tools/biology/ocr.py SOURCE.pdf --output OCR_DIR/<paper_id>
"""
import argparse
import csv
import io
import json
import subprocess
from pathlib import Path

import pypdfium2 as pdfium

DPI = 300


def ocr_pdf(path, output):
    output.mkdir(parents=True, exist_ok=True)
    document = pdfium.PdfDocument(str(path))
    for index in range(len(document)):
        target = output / f'page-{index + 1:03}.json'
        if target.exists():
            continue
        page = document[index]
        page.set_cropbox(*page.get_mediabox())
        width, height = page.get_size()
        image = page.render(scale=DPI / 72).to_pil().convert('L')
        buffer = io.BytesIO()
        image.save(buffer, format='PNG')
        tsv = subprocess.run(['tesseract', 'stdin', 'stdout', '--psm', '3', '-l', 'eng', 'tsv'],
                             input=buffer.getvalue(), capture_output=True, check=True).stdout.decode()
        scale = 72 / DPI
        words = []
        for row in csv.DictReader(io.StringIO(tsv), delimiter='\t', quoting=csv.QUOTE_NONE):
            text = (row.get('text') or '').strip()
            if row.get('level') != '5' or not text or float(row.get('conf') or -1) < 0:
                continue
            x0, top = int(row['left']) * scale, int(row['top']) * scale
            words.append({'text': text, 'x0': x0, 'x1': x0 + int(row['width']) * scale,
                          'top': top, 'bottom': top + int(row['height']) * scale,
                          'fontname': 'OCR', 'upright': True, 'conf': float(row['conf'])})
        target.write_text(json.dumps({'page': index + 1, 'width': width, 'height': height, 'dpi': DPI,
                                      'engine': 'tesseract', 'words': words}) + '\n')
        print(path.name, 'page', index + 1, len(words), 'words', flush=True)


def tariff_pass(path, output, x0=485, x1=560):
    """Second, positioning-only pass over the right-hand tariff column. Scanned
    tariffs are pale grey, so the strip is thresholded and read with a digit and
    bracket whitelist. Results are added to each page cache with pass='tariff'."""
    document = pdfium.PdfDocument(str(path))
    scale = 400 / 72
    for index in range(len(document)):
        target = output / f'page-{index + 1:03}.json'
        data = json.loads(target.read_text())
        if data.get('tariff_pass') and data.get('tariff_pass', {}).get('version') == 3:
            continue
        data['words'] = [w for w in data['words'] if w.get('pass') != 'tariff']
        page = document[index]
        page.set_cropbox(*page.get_mediabox())
        image = page.render(scale=scale).to_pil().convert('L')
        strip = image.crop((round(x0 * scale), 0, round(x1 * scale), image.height))
        strip = strip.point(lambda v: 0 if v < 215 else 255)
        buffer = io.BytesIO()
        strip.save(buffer, format='PNG')
        tsv = subprocess.run(['tesseract', 'stdin', 'stdout', '--psm', '11', '-l', 'eng',
                              '-c', 'tessedit_char_whitelist=()0123456789', 'tsv'],
                             input=buffer.getvalue(), capture_output=True, check=True).stdout.decode()
        added = []
        for row in csv.DictReader(io.StringIO(tsv), delimiter='\t', quoting=csv.QUOTE_NONE):
            text = (row.get('text') or '').strip()
            if row.get('level') != '5' or not text or float(row.get('conf') or -1) < 0:
                continue
            m = __import__('re').fullmatch(r'\(?(\d{1,2})\)?', text)
            if not m or not ('(' in text or ')' in text):
                continue
            left, top = x0 + int(row['left']) / scale, int(row['top']) / scale
            added.append({'text': f'({m.group(1)})', 'raw': text, 'x0': left, 'x1': left + int(row['width']) / scale,
                          'top': top, 'bottom': top + int(row['height']) / scale, 'fontname': 'OCR', 'upright': True,
                          'conf': float(row['conf']), 'pass': 'tariff'})
        # Keep every first-pass word (question totals live in the same column);
        # add only tariffs that the first pass did not already read.
        known = [w for w in data['words'] if w.get('pass') != 'tariff']
        fresh = [a for a in added if not any(abs(a['top'] - w['top']) < 4 and abs(a['x0'] - w['x0']) < 8
                                             and w['text'] == a['text'] for w in known)]
        data['words'] = known + fresh
        data['tariff_pass'] = {'version': 3, 'x0': x0, 'x1': x1, 'dpi': 400, 'threshold': 215, 'found': len(added)}
        target.write_text(json.dumps(data) + '\n')
        print(path.name, 'page', index + 1, 'tariffs', [w['text'] for w in added], flush=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('source', type=Path)
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--tariff-column', default='485,560', help='x range in PDF points for the tariff pass')
    args = parser.parse_args()
    ocr_pdf(args.source, args.output)
    x0, x1 = (float(v) for v in args.tariff_column.split(','))
    tariff_pass(args.source, args.output, x0, x1)


if __name__ == '__main__':
    main()
