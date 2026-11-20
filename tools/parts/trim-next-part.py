#!/usr/bin/env python3
"""Cut part crops that run on into the next part's label (audit 2026-11-20).

The specimen papers' recorded rows (OCR H046/H446 paper 2, H432 samples) end a little
late, so a part's crop finishes with the next part's label and first line ("(c) Explain why
good programming practice ..."): an unselected sibling shown as part of the task. A crop
is cut 8 px above the first later-sibling label tesseract reads in its left margin (below
its own first 30 px), and its last recorded region is shortened by the same rows. Re-running
finds nothing more to cut.

    python3 tools/parts/trim-next-part.py [--dry-run] [--slug cs ...]
"""
import argparse, base64, hashlib, io, json, re, subprocess
from concurrent.futures import ProcessPoolExecutor
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
LEAF = re.compile(r'\(([a-h]|i{1,3}|iv|vi{0,3})\)')
GAP = 12


def labels(image):
    w = image.width
    crop = image.crop((0, 0, int(w * 0.14), image.height))
    big = crop.resize((crop.width * 3, crop.height * 3))
    buf = io.BytesIO()
    big.save(buf, 'PNG')
    tsv = subprocess.run(['tesseract', '-', '-', '--psm', '11', 'tsv'], input=buf.getvalue(),
                         capture_output=True).stdout.decode(errors='ignore')
    out = []
    for row in tsv.splitlines()[1:]:
        f = row.split('\t')
        if len(f) >= 12:
            t = f[11].strip().replace('l', 'i').replace('|', 'i').rstrip('*')
            if LEAF.fullmatch(t):
                out.append((int(f[7]) // 3, t.strip('()')))
    return sorted(out)


def process(job):
    path, dry = job
    path = Path(path)
    pack = json.loads(path.read_text())
    slug = path.parent.name
    cat_path = ROOT / 'data' / f'{slug}-assets' / f'{path.stem}.json'
    catalogue = json.loads(cat_path.read_text())
    groups = {}
    for q in pack['questions']:
        groups.setdefault(q.get('parent_question_id'), []).append(q)
    cut = []
    for units in groups.values():
        units.sort(key=lambda q: q['question_id'])
        for u, nxt in zip(units, units[1:]):
            name = ((u.get('content') or {}).get('question_image_url') or '').rsplit('/', 1)[-1]
            if name not in catalogue['assets'] or name.endswith('_full.webp'):
                continue
            mine = set(LEAF.findall(u.get('part_label') or ''))
            theirs = LEAF.findall(nxt.get('part_label') or '')
            wanted = {theirs[0], theirs[-1]} - mine if theirs else set()
            image = Image.open(io.BytesIO(base64.b64decode(catalogue['assets'][name]['base64']))).convert('RGB')
            hit = next((top for top, t in labels(image) if top > 30 and t in wanted), None)
            if hit is None:
                continue
            keep = hit - 8
            removed = image.height - keep
            regions = (u.get('provenance') or {}).get('source_regions') or []
            cut.append(f"{u['question_id']} {u.get('part_label')}: {image.height} -> {keep} (next part {nxt.get('part_label')})")
            if dry:
                continue
            buf = io.BytesIO()
            image.crop((0, 0, image.width, keep)).save(buf, format='WEBP', lossless=True)
            data = buf.getvalue()
            catalogue['assets'][name] = {'sha256': hashlib.sha256(data).hexdigest(), 'base64': base64.b64encode(data).decode()}
            if regions:
                spans = sum(r['bbox'][3] - r['bbox'][1] for r in regions)
                scale = (image.height - GAP * (len(regions) - 1)) / spans
                last = regions[-1]
                last['bbox'][3] = round(last['bbox'][3] - removed / scale, 6)
            u['provenance']['next_part_trimmed'] = '2026-11-20'
    if cut and not dry:
        path.write_text(json.dumps(pack, ensure_ascii=False, indent=2) + '\n')
        newline = '\n' if cat_path.read_text().endswith('\n') else ''
        cat_path.write_text(json.dumps(catalogue, separators=(',', ':')) + newline)
    return cut


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--dry-run', action='store_true')
    ap.add_argument('--slug', action='append', required=True)
    a = ap.parse_args()
    jobs = [(str(p), a.dry_run) for s in a.slug for p in sorted((ROOT / 'data/packs' / s).glob('*.json'))]
    found = []
    with ProcessPoolExecutor() as ex:
        for r in ex.map(process, jobs):
            found += r
    print(f"{len(found)} crops {'would be ' if a.dry_run else ''}cut")
    for line in found:
        print(' ', line)


if __name__ == '__main__':
    main()
