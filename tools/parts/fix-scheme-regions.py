#!/usr/bin/env python3
"""Move whole mark-scheme regions to the question they belong to (audit 2026-11-20).

A whole-question scheme is the scheme pages' regions stacked with 12 px gaps. Where the
scheme was split between two questions one region late or early, one question's scheme
opens with the previous question's rows (and that question's scheme stops short), or ends
with the next question's header and first row. Each fix below was found by reading the
question-number column of every whole-question GCSE science scheme and checked by eye:

  1SC0 November 2021 1CH  Q1's scheme stopped at the header of 1(c)(i); the rest of that
                          row (page 6, to 0.8467) and page 7 (1(c)(ii), 1(c)(iii),
                          "Total for question 1 = 9 marks") opened Q2's scheme.
  1PH0 June 2022 2H       Q9's scheme ended with page 27, which is Q10(a)'s header and
                          first row; "Total 11 marks" ends page 26.

Pieces are cut from the rendered images (no source re-render), so the pixels are the
published ones. Re-running is harmless: a fix whose regions are already moved is skipped.

    python3 tools/parts/fix-scheme-regions.py [--dry-run]
"""
import base64, hashlib, io, json, sys
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
GAP = 12


def decode(asset):
    return Image.open(io.BytesIO(base64.b64decode(asset['base64']))).convert('RGB')


def encode(image):
    buf = io.BytesIO()
    image.save(buf, format='WEBP', lossless=True)
    data = buf.getvalue()
    return {'sha256': hashlib.sha256(data).hexdigest(), 'base64': base64.b64encode(data).decode()}


def pieces(image, regions):
    """(top, bottom) of each region in a stacked scheme image."""
    scale = (image.height - GAP * (len(regions) - 1)) / sum(r['bbox'][3] - r['bbox'][1] for r in regions)
    out, y = [], 0
    for r in regions:
        h = round(r['bbox'][3] * scale) - round(r['bbox'][1] * scale)
        out.append((y, y + h))
        y += h + GAP
    return out, scale


def stack(parts):
    width = max(p.width for p in parts)
    out = Image.new('RGB', (width, sum(p.height for p in parts) + GAP * (len(parts) - 1)), 'white')
    y = 0
    for p in parts:
        out.paste(p, (0, y))
        y += p.height + GAP
    return out


def units(pack, number):
    return [q for q in pack['questions'] if int(q['question_number']) == number]


def set_regions(pack, number, regions):
    for q in units(pack, number):
        q['provenance']['scheme_regions'] = regions
        q['provenance']['scheme_regions_fixed'] = 'whole regions moved to the question they print (fix-scheme-regions.py, 2026-11-20)'


def move_to_earlier(pack, assets, earlier, later):
    """The later question's first regions belong to the earlier one."""
    a, b = units(pack, earlier)[0], units(pack, later)[0]
    ra, rb = a['provenance']['scheme_regions'], b['provenance']['scheme_regions']
    ia, ib = decode(assets[f'Q{earlier:02d}_scheme.webp']), decode(assets[f'Q{later:02d}_scheme.webp'])
    spans, scale = pieces(ib, rb)
    # rb[0] continues ra[-1] on the same page (they overlap by a few px); every later region
    # of rb on a page before the earlier question's total is moved whole.
    if rb[0]['page'] != ra[-1]['page'] or rb[0]['bbox'][1] > ra[-1]['bbox'][3]:
        return None
    moved = 2  # page-6 continuation and page 7 (checked by eye; see the docstring)
    overlap = round(ra[-1]['bbox'][3] * scale) - round(rb[0]['bbox'][1] * scale)
    first = ib.crop((0, spans[0][0] + overlap, ib.width, spans[0][1]))
    tail_a = Image.new('RGB', (ia.width, ia.height + first.height), 'white')
    tail_a.paste(ia, (0, 0))
    tail_a.paste(first, (0, ia.height))
    new_a = stack([tail_a] + [ib.crop((0, t, ib.width, bt)) for t, bt in spans[1:moved]])
    new_b = stack([ib.crop((0, t, ib.width, bt)) for t, bt in spans[moved:]])
    regions_a = ra[:-1] + [{**ra[-1], 'bbox': [ra[-1]['bbox'][0], ra[-1]['bbox'][1], ra[-1]['bbox'][2], rb[0]['bbox'][3]]}] + rb[1:moved]
    return {f'Q{earlier:02d}_scheme.webp': new_a, f'Q{later:02d}_scheme.webp': new_b}, {earlier: regions_a, later: rb[moved:]}


def drop_last(pack, assets, number, count):
    q = units(pack, number)[0]
    regions = q['provenance']['scheme_regions']
    image = decode(assets[f'Q{number:02d}_scheme.webp'])
    spans, _ = pieces(image, regions)
    keep = len(regions) - count
    return {f'Q{number:02d}_scheme.webp': image.crop((0, 0, image.width, spans[keep - 1][1]))}, {number: regions[:keep]}


FIXES = [
    # (slug, paper, kind, args, regions count before the fix for the question that changes)
    ('gcsechem', 'EDX_1SC0_2021_NOVEMBER_1CH', move_to_earlier, (1, 2), (1, 6)),
    ('gcsephys', 'EDX_1PH0_2022_JUNE_2H', drop_last, (9, 1), (5,)),
]


def main():
    dry = '--dry-run' in sys.argv
    for slug, paper, fix, args, before in FIXES:
        pack_path = ROOT / 'data/packs' / slug / f'{paper}.json'
        cat_path = ROOT / 'data' / f'{slug}-assets' / f'{paper}.json'
        pack, catalogue = json.loads(pack_path.read_text()), json.loads(cat_path.read_text())
        numbers = args if fix is move_to_earlier else args[:1]
        counts = tuple(len(units(pack, n)[0]['provenance']['scheme_regions']) for n in numbers)
        if counts != before:
            print(f'{paper}: already fixed (regions {counts})')
            continue
        result = fix(pack, catalogue['assets'], *args)
        if not result:
            print(f'{paper}: regions do not continue; left alone')
            continue
        images, regions = result
        for name, image in images.items():
            print(f'{paper} {name}: {decode(catalogue["assets"][name]).size} -> {image.size}')
            catalogue['assets'][name] = encode(image)
        for number, value in regions.items():
            set_regions(pack, number, value)
        if not dry:
            pack_path.write_text(json.dumps(pack, ensure_ascii=False, indent=2) + '\n')
            newline = '\n' if cat_path.read_text().endswith('\n') else ''
            cat_path.write_text(json.dumps(catalogue, separators=(',', ':')) + newline)


if __name__ == '__main__':
    main()
