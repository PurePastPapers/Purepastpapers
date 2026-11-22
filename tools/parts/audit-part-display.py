#!/usr/bin/env python3
"""Audit what a learner sees for every multi-part GCSE unit (audit 2026-11-20).

Independent of the tools that cut the images: it reads only the published crops.

1. own_label: the part's own crop starts with its printed label ("(ii)" for (b)(ii)) in the
   first lines, so the task shown is the selected part, not a sibling.
2. context_marks: the context image holds no marks allocation "(n)" in its right margin.
   Introductions and lead-ins carry no marks; a mark means an earlier part's task is shown.
3. context_empty: a context image has printed ink in its body (no blank boxes).

tesseract is used to read labels and marks only. Prints counts and writes a JSON report.

    python3 tools/parts/audit-part-display.py [--slug gcsephys ...] [--report out.json]
"""
import argparse, base64, io, json, re, subprocess
from collections import defaultdict
from concurrent.futures import ProcessPoolExecutor
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
SLUGS = ['gcsebio', 'gcsechem', 'gcsephys', 'gcsemaths']
LEAF = re.compile(r'\(([a-h]|i{1,3}|iv|vi{0,3})\)')
MARK = re.compile(r'^\(\d{1,2}\)$')


def grey(asset):
    return Image.open(io.BytesIO(base64.b64decode(asset['base64']))).convert('L')


def words(image, psm='4'):
    big = image.resize((image.width * 2, image.height * 2))
    buf = io.BytesIO()
    big.save(buf, 'PNG')
    tsv = subprocess.run(['tesseract', '-', '-', '--psm', psm, 'tsv'], input=buf.getvalue(),
                         capture_output=True).stdout.decode(errors='ignore')
    out = []
    for line in tsv.splitlines()[1:]:
        f = line.split('\t')
        if len(f) >= 12 and f[11].strip():
            out.append((int(f[6]) // 2, int(f[7]) // 2, f[11].strip()))
    return out


def own_has_label(image, label):
    wanted = LEAF.findall(label or '')
    if not wanted:
        return True
    top = image.crop((0, 0, int(image.width * 0.40), min(image.height, 90)))
    raw = ' '.join(t for _, _, t in words(top, '6'))
    item = re.search(r'\s(\d)$', label or '')  # "(a)(ii) 2": numbered item "2."
    if item:
        return f'{item.group(1)}.' in raw
    return f'({wanted[-1]})' in raw.replace('l', 'i').replace('|', 'i')


def context_marks(image):
    right = image.crop((int(image.width * 0.80), 0, image.width, image.height))
    return [t for _, _, t in words(right, '4') if MARK.match(t.replace('O', '0').replace('o', '0'))]


def inky(image):
    a = np.asarray(image)
    w = a.shape[1]
    return bool((a[:, int(w * 0.04):int(w * 0.80)] < 120).sum() > 40)


def check_paper(job):
    slug, pack_path = job
    pack = json.loads(Path(pack_path).read_text())
    pid = Path(pack_path).stem
    assets = json.loads((ROOT / 'data' / f'{slug}-assets' / f'{pid}.json').read_text())['assets']
    counts = defaultdict(list)
    seen_ctx = {}
    sizes = defaultdict(int)
    for q in pack['questions']:
        sizes[q['parent_question_id']] += 1
    for q in pack['questions']:
        if sizes[q['parent_question_id']] < 2:
            continue
        counts['units'].append(q['question_id'])
        own = q['content']['question_image_url'].rsplit('/', 1)[1]
        if not own.endswith('_full.webp') and not own_has_label(grey(assets[own]), q.get('part_label')):
            counts['own_label_missing'].append(q['question_id'])
        url = (q.get('context') or {}).get('stem_image_url')
        if url:
            name = url.rsplit('/', 1)[1]
            if name not in seen_ctx:
                image = grey(assets[name])
                seen_ctx[name] = (context_marks(image), inky(image))
            marks, ink = seen_ctx[name]
            if marks:
                counts['context_marks'].append(f"{q['question_id']} {marks}")
            if not ink:
                counts['context_empty'].append(q['question_id'])
    return dict(counts)


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--slug', action='append')
    ap.add_argument('--report', type=Path)
    ap.add_argument('--paper', action='append', help='Only audit the selected paper IDs')
    a = ap.parse_args()
    jobs = [(slug, str(p)) for slug in (a.slug or SLUGS)
            for p in sorted((ROOT / 'data/packs' / slug).glob('*.json'))
            if not a.paper or p.stem in a.paper]
    report = defaultdict(list)
    with ProcessPoolExecutor(max_workers=max(1, min(len(jobs), 4))) as ex:
        for counts in ex.map(check_paper, jobs):
            for k, v in counts.items():
                report[k] += v
    for k, v in report.items():
        print(f'{k}: {len(v)}')
    if a.report:
        a.report.write_text(json.dumps(report, indent=1))


if __name__ == '__main__':
    main()
