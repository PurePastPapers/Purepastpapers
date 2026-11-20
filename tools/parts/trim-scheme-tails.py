#!/usr/bin/env python3
"""Cut the next question's rows off GCSE whole-question mark-scheme images (audit 2026-11-19).

A question's scheme region ran to the start of the next question's first row, so where the
next question began on the same page the image ended with that question's table header and a
sliver, or all, of its first row (1PH0 November 2021 1H Q9 showed Q10(a)(i)'s answers). These
images are both the fallback scheme and every part's "whole question" scheme.

For each Qnn_scheme.webp the printed "Total for Question N" line is found with tesseract (used
for positioning only; the pixels are the source render). When anything printed below that
line is a table header ("Question number") or a row for another question, the image is cut
12 px below the total line. Images without a total line are reported and left alone.

    python3 tools/parts/trim-scheme-tails.py [--dry-run] [--report out.json] [--slug gcsephys]
"""
import argparse, base64, hashlib, io, json, re, subprocess
from collections import defaultdict
from concurrent.futures import ProcessPoolExecutor
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
SLUGS = ['gcsebio', 'gcsechem', 'gcsephys', 'gcsemaths']
TOTAL = re.compile(r'total\s*for\s*question', re.I)


def words(image):
    big = image.resize((image.width * 2, image.height * 2))
    buf = io.BytesIO()
    big.save(buf, 'PNG')
    out = subprocess.run(['tesseract', '-', '-', '--psm', '4', 'tsv'], input=buf.getvalue(), capture_output=True).stdout.decode(errors='ignore')
    lines = defaultdict(list)
    for row in out.splitlines()[1:]:
        cells = row.split('\t')
        if len(cells) == 12 and cells[11].strip():
            key = (cells[2], cells[3], cells[4])
            lines[key].append((int(cells[7]) // 2, (int(cells[7]) + int(cells[9])) // 2, int(cells[6]) // 2, cells[11]))
    result = []
    for items in lines.values():
        result.append({'top': min(i[0] for i in items), 'bottom': max(i[1] for i in items), 'left': min(i[2] for i in items),
                       'text': ' '.join(i[3] for i in sorted(items, key=lambda i: i[2]))})
    return sorted(result, key=lambda l: l['top'])


def check(job):
    slug, paper, name, number = job
    catalogue = json.loads((ROOT / f'data/{slug}-assets/{paper}.json').read_text())
    image = Image.open(io.BytesIO(base64.b64decode(catalogue['assets'][name]['base64']))).convert('L')
    lines = words(image)
    totals = [l for l in lines if TOTAL.search(l['text'])]
    if not totals:
        return {'name': f'{slug}/{paper}/{name}', 'status': 'no_total_line'}
    total = totals[-1]
    below = [l for l in lines if l['top'] > total['bottom'] + 4]
    foreign = [l['text'] for l in below if re.search(r'question\s*number|^\s*\d{1,2}\s*\(', l['text'], re.I)
               and not re.match(r'\s*0?' + re.escape(number) + r'\s*\(', l['text'])]
    if not foreign:
        return {'name': f'{slug}/{paper}/{name}', 'status': 'clean'}
    cut = min(image.height, total['bottom'] + 12)
    return {'name': f'{slug}/{paper}/{name}', 'status': 'trim', 'cut': cut, 'height': image.height, 'below': foreign[:3]}


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--dry-run', action='store_true')
    ap.add_argument('--report', type=Path)
    ap.add_argument('--slug', action='append')
    ap.add_argument('--from-report', type=Path, help='apply the "trim" cuts of an earlier --dry-run report')
    a = ap.parse_args()
    if a.from_report:
        apply(json.loads(a.from_report.read_text()).get('trim', []))
        return
    jobs = set()
    for slug in a.slug or SLUGS:
        for pack_path in sorted((ROOT / 'data/packs' / slug).glob('*.json')):
            for q in json.loads(pack_path.read_text())['questions']:
                urls = [q['content'].get('mark_scheme_image_url'), (q.get('context') or {}).get('full_scheme_image_url')]
                for url in urls:
                    m = re.match(r'assets/([a-z]+)/([A-Z0-9_]+)/(Q\d+_scheme\.webp)$', url or '')
                    if m:
                        jobs.add((m.group(1), m.group(2), m.group(3), str(int(q['question_number'])) if str(q['question_number']).isdigit() else str(q['question_number'])))
    with ProcessPoolExecutor() as ex:
        results = list(ex.map(check, sorted(jobs), chunksize=8))
    by = defaultdict(list)
    for r in results:
        by[r['status']].append(r)
    for k, v in by.items():
        print(f'{k}: {len(v)}')
    if a.report:
        a.report.write_text(json.dumps(by, indent=1))
    if a.dry_run:
        return
    apply(by['trim'])


def apply(trims):
    edits = defaultdict(list)
    for r in trims:
        slug, paper, name = r['name'].split('/')
        edits[(slug, paper)].append((name, r['cut']))
    for (slug, paper), items in edits.items():
        path = ROOT / f'data/{slug}-assets/{paper}.json'
        catalogue = json.loads(path.read_text())
        for name, cut in items:
            image = Image.open(io.BytesIO(base64.b64decode(catalogue['assets'][name]['base64']))).convert('RGB')
            out = io.BytesIO()
            image.crop((0, 0, image.width, cut)).save(out, 'WEBP', lossless=True, quality=100, method=4)
            data = out.getvalue()
            catalogue['assets'][name] = {'sha256': hashlib.sha256(data).hexdigest(), 'base64': base64.b64encode(data).decode()}
        newline = '\n' if path.read_text().endswith('\n') else ''
        path.write_text(json.dumps(catalogue, separators=(',', ':')) + newline)


if __name__ == '__main__':
    main()
