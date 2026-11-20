#!/usr/bin/env python3
"""Cut equation sheets, formula booklets and periodic tables off last questions (2026-11-19).

The last part of a paper was cropped "to its existing end", which ran on into the pages
printed after the paper: the insert cover, the physics equation list or data and formulae
booklet, the periodic table and the maths formula sheet. Those pages are the same in every
paper of a subject, so a page that also appears (near enough pixel for pixel) at the end of
another paper's last part is a booklet page. Each affected part keeps only the pieces
printed before the first such page; its recorded regions and, where it holds the same
pages at its foot, the whole-question image are cut to match. Re-running is harmless.

Pieces are located as refine.py renders them: full-width page crops stacked with 12 px
gaps at one scale, so a page's height in pixels follows from the image and its regions.
"""
import base64
import hashlib
import io
import json
import pathlib
import re
import sys

from PIL import Image, ImageChops, ImageStat

ROOT = pathlib.Path(__file__).resolve().parents[2]
DRY_RUN = '--dry-run' in sys.argv
GAP = 12
# Checked by eye. Regions to keep where the matching gets it wrong: half a page of the 2023
# Foundation equation list and a 2023 formulae sheet printed at another scale (no other paper
# matches them), and 0 (trim nothing) for a lined "Question continued" page that is close to
# many other lined pages.
KEEP = {
    'EDX_1PH0_2023_JUNE_1F_Q10_U06': 1,
    'EDX_1SC0_2023_JUNE_1PF_Q06_U04': 2,
    'EDX_9PH0_2023_JUNE_02_Q18_U05': 1,
    'EDX_8MA0_2018_JUNE_01_Q15_U01': 0,
    'EDX_8MA0_2018_JUNE_02_Q05_U01': 0,
    # 2026-11-19 audit, after widening candidates to two-page tails (each checked by eye).
    # The question's last part and paper total are on the second page; the third is the list.
    'EDX_1SC0_2020_NOVEMBER_1PF_Q06_U05': 2,
    'EDX_1SC0_2021_NOVEMBER_2PH_Q06_U03': 2,
    # "Question N continued" answer pages carrying the question and section totals, and an
    # AQA sample figure page: not booklet pages.
    'AQA_7037_SAMPLE_02_Q02_P02': 0,
    'EDX_8MA0_2021_NOVEMBER_21_Q05_U01': 0,
    'EDX_8MA0_2025_JUNE_21_Q05_U01': 0,
    'EDX_8MA0_2025_JUNE_22_Q04_U01': 0,
    'EDX_9MA0_2021_NOVEMBER_31_Q06_U01': 0,
    'EDX_9MA0_2024_JUNE_32_Q06_U01': 0,
    'EDX_9MA0_2025_JUNE_31_Q06_U01': 0,
    'EDX_9MA0_SAMPLE_01_Q15_U01': 0,
    'EDX_9MA0_SAMPLE_02_Q16_U01': 0,
}


def decode(asset):
    return Image.open(io.BytesIO(base64.b64decode(asset['base64']))).convert('RGB')


def encode(image):
    buffer = io.BytesIO()
    image.save(buffer, format='WEBP', lossless=True)
    data = buffer.getvalue()
    return {'sha256': hashlib.sha256(data).hexdigest(), 'base64': base64.b64encode(data).decode()}


def pieces(image, regions):
    height = (image.height - GAP * (len(regions) - 1)) / sum(r['bbox'][3] - r['bbox'][1] for r in regions)
    out, y = [], 0
    for region in regions:
        h = round(region['bbox'][3] * height) - round(region['bbox'][1] * height)
        out.append((y, min(image.height, y + h)))
        y += h + GAP
    return out


def signature(image):
    return image.convert('L').resize((160, 224))


def series(paper):
    """'2024_JUNE' from 'EDX_1PH0_2024_JUNE_1H': papers of one series share questions."""
    match = re.match(r'[A-Z]+_\w+?_(\d{4}_[A-Z]+)_', paper)
    return match.group(1) if match else 'SAMPLE'  # official samples have no year


def differ(a, b):
    return ImageStat.Stat(ImageChops.difference(a, b)).mean[0]


def candidates():
    """Parts whose regions run over three or more pages.

    The span was ">= 3" until the 2026-11-19 audit: a last part printed on one page and
    followed by a two-page list (AS Physics 8PH0 "List of data, formulae and relationships")
    spans only 2 and kept the list. Booklet pages are still decided by matching other series.
    """
    for pack_path in sorted((ROOT / 'data/packs').glob('*/*.json')):
        pack = json.loads(pack_path.read_text())
        for question in pack.get('questions', []):
            regions = (question.get('provenance') or {}).get('source_regions') or []
            pages = [r['page'] for r in regions]
            if (question.get('provenance') or {}).get('own_rows_from_full'):
                continue  # reviewed rows (manual-contexts.py) already stop at the question total
            if len(regions) > 1 and max(pages) - min(pages) >= 2:
                yield pack_path, question['question_id']


def main():
    found = list(candidates())
    loaded = {}

    def load(path):
        if path not in loaded:
            loaded[path] = json.loads(path.read_text())
        return loaded[path]

    units = []
    for pack_path, qid in found:
        question = next(q for q in load(pack_path)['questions'] if q['question_id'] == qid)
        _, slug, paper, name = question['content']['question_image_url'].split('/')
        cat_path = ROOT / 'data' / f'{slug}-assets' / f'{paper}.json'
        image = decode(load(cat_path)['assets'][name])
        regions = question['provenance']['source_regions']
        spans = pieces(image, regions)
        sigs = [signature(image.crop((0, top, image.width, bottom))) for top, bottom in spans]
        full = [(r['bbox'][3] - r['bbox'][1]) > 0.5 for r in regions]
        units.append({'pack': pack_path, 'catalogue': cat_path, 'question': question, 'name': name,
                      'paper': paper, 'image': image, 'spans': spans, 'sigs': sigs, 'full': full})

    # A booklet page: a full page that also ends the last part of papers from other series.
    # Papers of one series share questions (1PH0 and 1SC0, Foundation and Higher), so a match
    # there proves nothing. Near-identical in two other series, or close in ten, is a booklet
    # page; a lined answer page with the question's last lines is close to only a few.
    def matches(unit, index, limit):
        sig, count = unit['sigs'][index], 0
        for other in units:
            if series(other['paper']) != series(unit['paper']):
                count += min(differ(sig, s) for s in other['sigs'][1:]) < limit
        return count

    def booklet(unit, index):
        if index == 0 or not unit['full'][index]:
            return False
        return matches(unit, index, 4) >= 2 or matches(unit, index, 6.5) >= 10

    # Pages just before the first booklet page that match one other series near enough are
    # booklet pages too (the 2023 papers print last year's equation list, then the new insert).
    def cut_at(unit):
        cut = next((i for i in range(1, len(unit['spans'])) if booklet(unit, i)), None)
        while cut is not None and cut > 1 and unit['full'][cut - 1] and matches(unit, cut - 1, 4) >= 1:
            cut -= 1
        return cut

    for unit in units:
        qid = unit['question']['question_id']
        unit['cut'] = (KEEP[qid] or None) if qid in KEEP else cut_at(unit)

    # Then a full page just before the cut that another paper had cut off goes too (a cover
    # printed only that year).
    def strip(unit, index):
        top, bottom = unit['spans'][index]
        piece = unit['image'].crop((0, top, unit['image'].width, bottom)).convert('L')
        return piece.resize((160, max(1, round(piece.height * 160 / piece.width))))

    changed = True
    while changed:
        changed = False
        removed = [(other['paper'], strip(other, i)) for other in units if other['cut']
                   for i in range(other['cut'], len(other['spans']))]
        for unit in units:
            if not unit['cut'] or unit['cut'] < 2 or not unit['full'][unit['cut'] - 1] \
                    or unit['question']['question_id'] in KEEP:
                continue
            piece = strip(unit, unit['cut'] - 1)
            if any(paper != unit['paper'] and other.height >= piece.height
                   and differ(piece, other.crop((0, 0, 160, piece.height))) < 4 for paper, other in removed):
                unit['cut'] -= 1
                changed = True

    trimmed = []
    for unit in units:
        cut = unit['cut']
        if cut is None:
            continue
        question, image = unit['question'], unit['image']
        keep_bottom = unit['spans'][cut - 1][1]
        removed = image.height - keep_bottom
        assets = load(unit['catalogue'])['assets']
        assets[unit['name']] = encode(image.crop((0, 0, image.width, keep_bottom)))
        question['provenance']['source_regions'] = question['provenance']['source_regions'][:cut]
        question['provenance']['booklet_pages_trimmed'] = True
        # The whole-question image ends with the same pages: cut it by the same height.
        full_url = (question.get('context') or {}).get('full_question_image_url')
        if full_url:
            full_name = full_url.rsplit('/', 1)[1]
            full = decode(assets[full_name])
            tail = image.crop((0, keep_bottom, image.width, image.height))
            if full.width == image.width and full.height > removed and \
                    differ(full.crop((0, full.height - removed, full.width, full.height)).convert('L'), tail.convert('L')) < 2:
                assets[full_name] = encode(full.crop((0, 0, full.width, full.height - removed)))
        trimmed.append(question['question_id'])

    if DRY_RUN:
        print(f'{len(trimmed)} parts would be trimmed (dry run, nothing written)')
        for unit in units:
            if unit['cut'] is not None:
                print(f"  {unit['question']['question_id']} keep {unit['cut']} of {len(unit['spans'])}")
        return
    for path, value in loaded.items():
        if path.parent.name == 'packs' or path.parent.parent.name == 'packs':
            path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n')
        else:
            newline = '\n' if path.read_text().endswith('\n') else ''
            path.write_text(json.dumps(value, separators=(',', ':')) + newline)
    print(f'{len(trimmed)} parts trimmed')
    for qid in trimmed:
        print(' ', qid)


if __name__ == '__main__':
    main()
