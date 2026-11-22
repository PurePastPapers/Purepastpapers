#!/usr/bin/env python3
"""Cut each part's "printed just before" text out of its context image (2026-11-19).

Linked parts (js/engine/linked-parts.js) are shown together: the question's introduction
once, then every part's own crop. A part's own crop starts at its label, so unlabelled text
printed between the previous part's answer space and this part's label (refine.py's bridge
text, e.g. "In reality the stone will be subject to air resistance.") would be lost.
refine.py stacked that text into the part's context image together with the introduction
and any earlier parts. This tool finds that piece from the recorded regions and saves it on
its own as ``context.lead_in_image_url``, using the same source pixels (lossless WebP).

The context image is ``render(context_regions)`` (optionally under the build's stem image):
full-width page crops stacked with 12 px gaps, at the scale the part's own crop
(``render(source_regions)``) also uses, so the page height in pixels follows from the own
crop and every piece can be located from the bottom of the context image.
"""
import base64
import hashlib
import io
import json
import pathlib
import sys

from PIL import Image

ROOT = pathlib.Path(__file__).resolve().parents[2]
GAP = 12


def decode(asset):
    return Image.open(io.BytesIO(base64.b64decode(asset['base64']))).convert('RGB')


def encode(image):
    buffer = io.BytesIO()
    image.save(buffer, format='WEBP', lossless=True)
    data = buffer.getvalue()
    return {'sha256': hashlib.sha256(data).hexdigest(), 'base64': base64.b64encode(data).decode()}


def page_height(own_image, own_regions):
    share = sum(r['bbox'][3] - r['bbox'][1] for r in own_regions)
    return (own_image.height - GAP * (len(own_regions) - 1)) / share


def lead_in(question, assets, previous_crops=()):
    prov = question.get('provenance') or {}
    regions = prov.get('context_regions') or []
    own = prov.get('source_regions') or []
    stem = (question.get('context') or {}).get('stem_image_url')
    if not prov.get('context_bridge_text') or not regions or not own or not stem:
        return None
    start = (own[0]['page'], own[0]['bbox'][1])
    before = [i for i, r in enumerate(regions) if (r['page'], r['bbox'][3]) <= (start[0], start[1] + 0.005)]
    if not before:
        return None
    index = max(before, key=lambda i: (regions[i]['page'], regions[i]['bbox'][3]))
    bridge = regions[index]
    if bridge['page'] != start[0] and not (bridge['page'] == start[0] - 1):
        return None
    own_image = decode(assets[question['content']['question_image_url'].rsplit('/', 1)[1]])
    context_image = decode(assets[stem.rsplit('/', 1)[1]])
    height = page_height(own_image, own)
    piece = lambda r: round(r['bbox'][3] * height) - round(r['bbox'][1] * height)
    bottom = context_image.height - sum(piece(r) + GAP for r in regions[index + 1:])
    top = bottom - piece(bridge)
    if top < 0 or bottom > context_image.height or piece(bridge) < 8:
        return None
    piece_image = context_image.crop((0, top, context_image.width, bottom))
    # The recorded bridge region starts at the previous part's label. When the previous
    # part's own crop is the top of it, keep only what lies below that crop; when that crop
    # already ends with the text, nothing is missing and no lead-in is needed.
    for earlier in previous_crops:
        if earlier.width != piece_image.width:
            continue
        end = find_rows(earlier, piece_image)
        if end is None:
            continue
        if end >= piece_image.height - 4:
            return None
        piece_image = piece_image.crop((0, end, piece_image.width, piece_image.height))
        break
    return trim_blank(after_tariff(piece_image))


def profile(image):
    grey = image.convert('L')
    band = grey.crop((int(grey.width * 0.04), 0, int(grey.width * 0.85), grey.height))
    data = band.tobytes()
    width = band.width
    return [sum(255 - v for v in data[y * width:(y + 1) * width]) / width for y in range(band.height)]


def find_rows(needle, hay):
    """Row of `hay` where `needle` (an earlier part's crop) ends, or None if it is not there.
    The two crops may start a few pixels apart, so small negative shifts are tried too."""
    a, b = profile(needle), profile(hay)
    best = None
    for shift in range(-30, len(b) - 20):
        start, stop = max(0, -shift), min(len(a), len(b) - shift)
        if stop - start < min(len(a), len(b)) * 0.8:
            continue
        score = sum(abs(a[k] - b[k + shift]) for k in range(start, stop)) / (stop - start)
        if best is None or score < best[0]:
            best = (score, shift)
    if best and best[0] < 1.5:
        return best[1] + len(a)
    return None


def after_tariff(image):
    """Keep only what follows the last mark tariff, e.g. "(1)" printed at the right on a row
    of its own: anything above it is the end of an earlier part."""
    grey = image.convert('L')
    w = grey.width
    left = grey.crop((int(w * 0.04), 0, int(w * 0.78), grey.height)).tobytes()
    right = grey.crop((int(w * 0.80), 0, int(w * 0.92), grey.height)).tobytes()
    lw, rw = int(w * 0.78) - int(w * 0.04), int(w * 0.92) - int(w * 0.80)
    last = None
    for y in range(grey.height):
        if min(right[y * rw:(y + 1) * rw]) < 200 and min(left[y * lw:(y + 1) * lw]) >= 140:
            last = y
    if last is None:
        return image
    return image.crop((0, last + 1, w, image.height))


def mean_difference(a, b):
    from PIL import ImageChops, ImageStat
    return sum(ImageStat.Stat(ImageChops.difference(a.convert('L'), b.convert('L'))).mean)


def trim_blank(image):
    """Drop blank rows at the top and bottom; None when only blank rows (or a sliver) remain."""
    grey = image.convert('L')
    width = grey.width
    band = grey.crop((int(width * 0.04), 0, int(width * 0.85), grey.height))   # leave out page rules and margins
    rows = [y for y in range(band.height) if min(band.crop((0, y, band.width, y + 1)).tobytes()) < 140]
    if not rows or rows[-1] - rows[0] < 10:
        return None
    return image.crop((0, max(0, rows[0] - 8), width, min(image.height, rows[-1] + 9)))


def main(slugs, paper_ids=()):
    made = 0
    for slug in slugs:
        for pack_path in sorted((ROOT / 'data/packs' / slug).glob('*.json')):
            if paper_ids and pack_path.stem not in paper_ids:
                continue
            pack = json.loads(pack_path.read_text())
            catalogues = {}
            changed = False
            # Only parts shown in a linked group need one: every part of a question in
            # which some part depends on another (see linkGroups in js/engine/linked-parts.js).
            linked = {q.get('parent_question_id') for q in pack.get('questions', []) if q.get('depends_on_question_ids')}
            for question in pack.get('questions', []):
                if question.get('parent_question_id') not in linked and not (question.get('context') or {}).get('lead_in_image_url'):
                    continue
                if question.get('parent_question_id') not in linked:
                    question['context'].pop('lead_in_image_url')
                    changed = True
                    continue
                url = (question.get('content') or {}).get('question_image_url') or ''
                parts = url.split('/')
                if len(parts) != 4:
                    continue
                cat_path = ROOT / 'data' / f'{parts[1]}-assets' / f'{parts[2]}.json'
                if cat_path not in catalogues:
                    catalogues[cat_path] = json.loads(cat_path.read_text())
                assets = catalogues[cat_path]['assets']
                earlier = [q for q in pack['questions'] if q.get('parent_question_id') == question.get('parent_question_id')]
                earlier = earlier[:earlier.index(question)]
                previous = [decode(assets[q['content']['question_image_url'].rsplit('/', 1)[1]]) for q in reversed(earlier)
                            if (q.get('content') or {}).get('question_image_url', '').rsplit('/', 1)[-1] in assets]
                image = lead_in(question, assets, previous)
                name = parts[3].replace('.webp', '_leadin.webp')
                if image is None:
                    if question.get('context', {}).pop('lead_in_image_url', None):
                        assets.pop(name, None)
                        changed = True
                    continue
                assets[name] = encode(image)
                question['context']['lead_in_image_url'] = f'assets/{parts[1]}/{parts[2]}/{name}'
                changed = True
                made += 1
            if changed:
                pack_path.write_text(json.dumps(pack, ensure_ascii=False, indent=2) + '\n')
                for cat_path, catalogue in catalogues.items():
                    catalogue['assets'] = dict(sorted(catalogue['assets'].items()))
                    newline = '\n' if cat_path.read_text().endswith('\n') else ''
                    cat_path.write_text(json.dumps(catalogue, separators=(',', ':')) + newline)
    print(f'{made} lead-in images')


if __name__ == '__main__':
    import argparse
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('slugs', nargs='*')
    parser.add_argument('--paper', action='append')
    args = parser.parse_args()
    main(args.slugs or ['maths', 'gcsemaths', 'physics', 'gcsephys', 'biology', 'gcsebio', 'gcsechem'], args.paper)
