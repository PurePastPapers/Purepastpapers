#!/usr/bin/env python3
"""Print a compact review sheet for one candidate: each tariff part with its source text.

The sheet is a reading aid for the reviewer only; published questions are source pixels.
"""
import json, re, sys
from pathlib import Path
import pdfplumber
from extract import CropView


def part_text(views, ocr, regions, start, end):
    out = []
    for r in regions:
        pg = r['page']
        if not (start[0] <= pg <= end[0]):
            continue
        v = views[pg - 1]
        top = r['bbox'][1] * v.height; bottom = r['bbox'][3] * v.height
        if pg == start[0]: top = max(top, start[1])
        if pg == end[0]: bottom = min(bottom, end[1])
        if bottom - top < 2:
            continue
        if ocr.get(pg):
            rows = {}
            for w in ocr[pg]:
                if top <= w['top'] < bottom and 30 < w['x0'] < v.width - 40:
                    rows.setdefault(round(w['top'] / 7), []).append(w)
            text = '\n'.join(' '.join(w['text'] for w in sorted(ws, key=lambda w: w['x0'])) for _, ws in sorted(rows.items()))
        else:
            text = v.crop((30, top, v.width - 40, bottom)).extract_text() or ''
        out.append(text)
    text = '\n'.join(out)
    text = '\n'.join(l for l in text.splitlines() if not re.search(r'\.{6}|_{5}|DO NOT WRITE|BLANK PAGE', l))
    return re.sub(r'[ \t]+', ' ', text).strip()


def main():
    cand = json.loads(Path(sys.argv[1]).read_text())
    limit = int(sys.argv[2]) if len(sys.argv) > 2 else 700
    ocr_dir = Path(sys.argv[3]) if len(sys.argv) > 3 else None
    pid = Path(sys.argv[1]).stem
    with pdfplumber.open(cand['source_file']) as pdf:
        views = [CropView(p) for p in pdf.pages]
        ocr = {}
        if ocr_dir and (ocr_dir / pid).exists():
            for f in (ocr_dir / pid).glob('page-*.json'):
                ocr[int(f.stem[5:])] = json.loads(f.read_text())['words']
        print(f'# {pid}  total {cand["total_marks"]}')
        for q in cand['questions']:
            print(f'\n## Q{q["number"]} ({q["marks"]} marks)')
            first = q['regions'][0]
            prev = (first['page'], first['bbox'][1] * views[first['page'] - 1].height)
            for i, p in enumerate(q['parts']):
                end = (p['page'], p['bottom'] + 2)
                t = part_text(views, ocr, q['regions'], prev, end)
                print(f'- [{p["part_label"] or "-"}] ({p["marks"]}): ' + t.replace('\n', ' ')[:limit])
                prev = (p['page'], p['bottom'] + 3)


if __name__ == '__main__':
    main()
