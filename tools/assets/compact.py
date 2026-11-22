#!/usr/bin/env python3
"""Keep the published site under GitHub Pages' 1 GB limit, and drop empty context crops.

GitHub Pages refuses to publish more than 1 GB reliably ("Uploaded artifact size ...
exceeds the allowed size of 1 GB. Deployment might fail."). Past that, booklet image
catalogues (data/<slug>-assets/<PAPER>.json) can go missing from the live site and the
questions that use them show blank. This tool:

1. re-encodes every black-and-white crop as lossless WebP with a few grey levels: 8 for
   print (black text and line art on white; anti-aliased edges are kept and the crop is
   not visibly different from the source render), 16 where a crop has real grey areas
   such as shaded figures. A result is kept only if it is smaller.
   Crops with real colour are left byte-for-byte as they are;
2. removes "introduction" context crops (context.stem_image_url) that contain no ink,
   which showed as an empty box above the part, and their catalogue entry;
3. updates each asset's sha256 and the image_assets counts in data/imports/*/coverage.json.

Idempotent: a crop already at or below its grey-level target is not re-encoded. Re-run after any
import or refine.py run that rewrites catalogues:  python3 tools/assets/compact.py
"""
import argparse, base64, collections, hashlib, io, json, os, re, sys
from multiprocessing import Pool
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
DATA = ROOT / 'data'
PATH = re.compile(r'^assets/([a-z]+)/([A-Z0-9_]+)/([A-Za-z0-9_]+\.webp)$')
TEXT_LEVELS = 8    # print: black text and line art on white
TONE_LEVELS = 16   # crops with real grey areas (micrographs, photos, shaded figures)
TONE_SHARE = 0.10  # share of mid-grey pixels above which a crop counts as tonal
PHOTO_SHARE = 0.25 # photographs and micrographs: kept exactly as rendered
BLANK_INK = 0.0015  # share of pixels darker than mid-grey below which a crop is empty


def decode(b64):
    image = Image.open(io.BytesIO(base64.b64decode(b64)))
    image.load()
    return image


def ink_share(rgb):
    grey = np.asarray(rgb.convert('L'))
    return float((grey < 160).mean())


def blank_stem(rgb, paper_id):
    if ink_share(rgb) < BLANK_INK:
        return True
    if paper_id.startswith('EDX_9FM0_') and paper_id.endswith(('_P1', '_P2')) and rgb.height <= 100:
        # Some Core Pure stems contain only the booklet border and barcode.
        # These can look inky overall while the printed question body is empty.
        body = np.asarray(rgb.convert('L'))[:, int(rgb.width * 0.105):int(rgb.width * 0.82)]
        return not (body < 120).any()
    return False


def colourful(rgb):
    a = np.asarray(rgb).astype(np.int16)
    spread = np.abs(a[:, :, 0] - a[:, :, 1]) + np.abs(a[:, :, 1] - a[:, :, 2]) + np.abs(a[:, :, 0] - a[:, :, 2])
    return float((spread > 30).mean()) > 0.0005


def levels(grey):
    a = np.asarray(grey)
    return TONE_LEVELS if float(((a > 40) & (a < 215)).mean()) > TONE_SHARE else TEXT_LEVELS


def photo(rgb):
    grey = rgb.convert('L')
    a = np.asarray(grey)
    return len(grey.getcolors(256) or range(257)) > 128 and float(((a > 40) & (a < 215)).mean()) > PHOTO_SHARE


def grey_levels(grey, target):
    """Map a grey crop onto `target` grey levels that keep its darkest ink.

    PIL's median-cut quantize() represents each bucket by its average. In crops dominated
    by light graph grids, black text shared a bucket with the grid and came out light grey
    (darkest level 160-175 instead of about 30; audit 2026-11-19). A 1-D k-means over the
    histogram, seeded evenly from the darkest pixel to white, keeps a near-black level.
    """
    a = np.asarray(grey)
    hist = np.bincount(a.ravel(), minlength=256).astype(np.float64)
    values = np.arange(256, dtype=np.float64)
    lo, hi = int(a.min()), int(a.max())
    centres = np.linspace(lo, hi, target)
    for _ in range(50):
        edges = (centres[:-1] + centres[1:]) / 2
        bucket = np.searchsorted(edges, values)
        new = centres.copy()
        for k in range(target):
            weight = hist[bucket == k]
            if weight.sum():
                new[k] = (values[bucket == k] * weight).sum() / weight.sum()
        if np.allclose(new, centres):
            break
        centres = new
    edges = (centres[:-1] + centres[1:]) / 2
    lut = np.rint(centres[np.searchsorted(edges, values)]).astype(np.uint8)
    return Image.fromarray(lut[a], 'L')


def encode(grey):
    out = io.BytesIO()
    grey.convert('RGB').save(out, 'WEBP', lossless=True, quality=100, method=4)
    return out.getvalue()


def compact(rgb):
    grey = rgb.convert('L')
    target = levels(grey)
    if len(grey.getcolors(256) or range(257)) <= target:
        return None  # already compacted
    return encode(grey_levels(grey, target))


def work(job):
    path, blank_candidates = job
    catalogue = json.loads(Path(path).read_text())
    before = sum(len(a['base64']) for a in catalogue['assets'].values())
    blanks, recoded = [], 0
    for name, asset in catalogue['assets'].items():
        rgb = decode(asset['base64']).convert('RGB')
        if name in blank_candidates and blank_stem(rgb, catalogue['paper_id']):
            blanks.append(name)
            continue
        if colourful(rgb) or photo(rgb):
            continue
        data = compact(rgb)
        if data and len(data) < len(base64.b64decode(asset['base64'])):
            asset['base64'] = base64.b64encode(data).decode('ascii')
            asset['sha256'] = hashlib.sha256(data).hexdigest()
            recoded += 1
    return path, catalogue, blanks, recoded, before


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--slug', help='Compact catalogues for one subject')
    parser.add_argument('--paper', action='append', help='Compact only the selected paper IDs')
    args = parser.parse_args()
    if args.paper and not args.slug:
        parser.error('--paper requires --slug')
    index = json.loads((DATA / 'packs/index.json').read_text())
    pack_files = [DATA / 'packs' / entry['file'] for entry in index['packs']]
    # Packs that are built but not listed (e.g. Computer Science) still own catalogues.
    for folder in (DATA / 'packs').iterdir():
        if folder.is_dir():
            pack_files += [p for p in folder.glob('*.json') if p not in pack_files]
    if args.slug:
        pack_files = [p for p in pack_files if p.parent.name == args.slug and (not args.paper or p.stem in args.paper)]
    packs = {p: json.loads(p.read_text()) for p in pack_files}
    stems = collections.defaultdict(set)  # catalogue path -> stem asset names
    for pack in packs.values():
        for q in pack.get('questions', []):
            url = (q.get('context') or {}).get('stem_image_url')
            m = PATH.match(url or '')
            if m:
                slug, paper, name = m.groups()
                stems[str(DATA / f'{slug}-assets/{paper}.json')].add(name)
    catalogue_dir = f'{args.slug}-assets' if args.slug else '*-assets'
    catalogues = sorted(str(p) for p in DATA.glob(f'{catalogue_dir}/*.json') if not args.paper or p.stem in args.paper)
    jobs = [(c, stems.get(c, set())) for c in catalogues]
    removed = collections.defaultdict(list)  # url -> catalogue
    totals = collections.Counter()
    with Pool(int(os.environ.get('JOBS', os.cpu_count() or 2))) as pool:
        for path, catalogue, blanks, recoded, before in pool.imap_unordered(work, jobs):
            slug = Path(path).parent.name[:-len('-assets')]
            for name in blanks:
                removed[f'assets/{slug}/{catalogue["paper_id"]}/{name}'] = path
            after_catalogue = dict(catalogue)
            after_catalogue['assets'] = {k: v for k, v in catalogue['assets'].items() if k not in blanks}
            text = json.dumps(after_catalogue, separators=(',', ':'))
            Path(path).write_text(text)
            totals[slug, 'before'] += before
            totals[slug, 'after'] += sum(len(a['base64']) for a in after_catalogue['assets'].values())
            totals[slug, 'recoded'] += recoded
            totals[slug, 'blank'] += len(blanks)
            print(f'{Path(path).relative_to(ROOT)}: {recoded} re-encoded, {len(blanks)} empty removed', flush=True)
    # Drop references to removed crops.
    dropped = collections.Counter()  # (slug, group key) -> count
    for path, pack in packs.items():
        changed = False
        for q in pack.get('questions', []):
            ctx = q.get('context') or {}
            if ctx.get('stem_image_url') in removed:
                del ctx['stem_image_url']
                changed = True
        if changed:
            path.write_text(json.dumps(pack, ensure_ascii=False, indent=2) + '\n')
    for url in removed:
        slug, paper, _ = PATH.match(url).groups()
        group = coverage_group(slug, paper, packs)
        dropped[slug, group] += 1
    for (slug, group), count in dropped.items():
        cov_path = DATA / 'imports' / slug / 'coverage.json'
        if not cov_path.exists():
            continue
        cov = json.loads(cov_path.read_text())
        if 'image_assets' in cov.get('totals', {}):
            cov['totals']['image_assets'] -= count
        if group and 'image_assets' in cov.get('groups', {}).get(group, {}):
            cov['groups'][group]['image_assets'] -= count
        cov_path.write_text(json.dumps(cov, ensure_ascii=False, indent=2) + '\n')
    for slug in sorted({k[0] for k in totals}):
        b, a = totals[slug, 'before'], totals[slug, 'after']
        print(f'{slug}: {b/1e6:.0f} MB -> {a/1e6:.0f} MB, {totals[slug, "recoded"]} re-encoded, {totals[slug, "blank"]} empty context crops removed')
    print(f'ALL: {sum(v for k, v in totals.items() if k[1] == "before")/1e6:.0f} MB -> {sum(v for k, v in totals.items() if k[1] == "after")/1e6:.0f} MB')


def coverage_group(slug, paper, packs):
    """Name of the coverage.json group a booklet is counted in, or None."""
    question = None
    for pack in packs.values():
        for q in pack.get('questions', []):
            if q.get('paper_id') == paper:
                question = q
                break
        if question:
            break
    if not question:
        return None
    sample = 'SAMPLE' in paper
    if slug in ('gcsebio', 'gcsechem', 'gcsephys'):
        return f'{paper.split("_")[1]} {question.get("tier")} exams'
    if slug == 'gcsemaths':
        return f'{question.get("tier")} exams'
    if slug == 'physics':
        level = 'AS' if question.get('is_as') else 'A-Level'
        return f'{level} official samples' if sample else f'{level} exams'
    if slug in ('maths', 'biology'):
        level = 'AS' if question.get('is_as') else 'A-Level'
        return f'{level} samples' if sample else f'{level} exams'
    return None


if __name__ == '__main__':
    sys.exit(main())
