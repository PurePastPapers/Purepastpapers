#!/usr/bin/env python3
"""Restore refined GCSE part crops and contexts that finalize.py replaced (audit 2026-11-19).

The GCSE pipelines run build.py, finalize.py, refine.py, then finalize.py again "to recount
refined assets". finalize.py packaged each asset from the local build folder whenever that
file existed, and refine.py writes its part crops and contexts under the same names the build
used (Q04_U02.webp, Q04_U02_context.webp). So the second finalize put the build images back:
each part's context showed everything printed before it, including earlier parts with their
answer lines and marks, so an unselected sibling looked like the question to answer. The pack
records kept refine.py's regions (provenance.source_regions, context_regions).

The source PDFs are not in the repository, but the whole-question image Qnn_full.webp is the
same pages rendered by the same renderer (PDFium, scale 1.6, pieces stacked with 12 px gaps).
This tool cuts each refined unit's own crop and context from it:

1. every current part crop is located in the full image (pixel match);
2. each page's row offset is the one at which the refined crops start 4 px above their
   printed label (refine.py's pad): blank rows above, ink below. Multi-page crops whose build
   and refined regions agree chain the offset onto the next page;
3. own crop = source_regions; context = the introduction (rows above the first part's label)
   when provenance.context_includes_stem_image is set, then refine.py's context_regions less
   every row that belongs to a part (2026-11-20): what remains is lead-ins and shared
   material. Another part's rows come back only when this part's printed wording names it
   ("your answer to (b)(i)"; context_named_parts), or down to the caption of a figure or
   table the part uses that is printed inside it (context_figure_from_parts). refine.py's
   regions are kept as context_regions_refined;
4. a unit is rewritten only when every piece passes the label check; others are reported.

Pixels are the published ones, cut, never redrawn. Re-running changes nothing.

    python3 tools/parts/recut-from-full.py [--dry-run] [--report out.json] [--slug gcsebio ...]
"""
import argparse, base64, hashlib, io, json, re, subprocess
from collections import Counter, defaultdict
from concurrent.futures import ProcessPoolExecutor
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
SLUGS = ['gcsebio', 'gcsechem', 'gcsephys', 'gcsemaths']
GAP = 12
PAD = 4
OCR_BIAS = 3
HEIGHTS = (1347, 1348)  # A4 at PDFium scale 1.6; the exact rounding is chosen per paper


def decode(asset):
    return np.asarray(Image.open(io.BytesIO(base64.b64decode(asset['base64']))).convert('L'))


def encode(pixels):
    out = io.BytesIO()
    Image.fromarray(pixels, 'L').convert('RGB').save(out, 'WEBP', lossless=True, quality=100, method=4)
    data = out.getvalue()
    return {'sha256': hashlib.sha256(data).hexdigest(), 'base64': base64.b64encode(data).decode()}


def locate(crop, full):
    """Row of `crop` inside `full` (both the same render), with the mean grey difference."""
    h = crop.shape[0]
    if h > full.shape[0] or crop.shape[1] != full.shape[1]:
        return None, 999.0
    c, f = crop[:, ::4].astype(np.int16), full[:, ::4].astype(np.int16)
    # Shortlist rows by the per-row mean profile (vectorised), then compare pixels.
    cp, fp = c.mean(axis=1), f.mean(axis=1)
    windows = np.lib.stride_tricks.sliding_window_view(fp, h)
    profile = np.abs(windows - cp).mean(axis=1)
    best = (999.0, None)
    for r in np.argsort(profile)[:8]:
        d = float(np.abs(f[r:r + h] - c).mean())
        if d < best[0]:
            best = (d, int(r))
    return best[1], best[0]


def inky(rows):
    """Printed ink in the body columns (side hatching excluded)."""
    if rows.shape[0] == 0:
        return False
    w = rows.shape[1]
    return bool((rows[:, int(w * 0.03):int(w * 0.80)] < 120).any())


def label_ok(full, row):
    """refine.py starts a part PAD px above its label: blank just above, ink just below."""
    if row < 0 or row + 16 > full.shape[0]:
        return False
    return not inky(full[max(0, row - 1):row + 2]) and inky(full[row + 2:row + 16])


LEAF = re.compile(r'\(([a-h]|i{1,3}|iv|vi{0,3})\)')


def leaf(label):
    """The part's own printed label: "(ii)" for "(b)(ii)"."""
    found = LEAF.findall(label or '')
    return f'({found[-1]})' if found else None


def ocr_labels(full):
    """Rows of part labels ("(b)", "(ii)") printed in the left of a full-question image.

    tesseract is used for positioning only (word boxes); the pixels cut are the render's.
    """
    w = full.shape[1]
    strip = Image.fromarray(full[:, :int(w * 0.35)])
    strip = strip.resize((strip.width * 2, strip.height * 2))
    buf = io.BytesIO()
    strip.save(buf, 'PNG')
    tsv = subprocess.run(['tesseract', '-', '-', '--psm', '4', 'tsv'], input=buf.getvalue(),
                         capture_output=True).stdout.decode(errors='ignore')
    found = []
    for line in tsv.splitlines()[1:]:
        f = line.split('\t')
        if len(f) < 12 or not f[11].strip():
            continue
        if int(f[6]) // 2 > w * 0.20:
            continue  # part labels sit at the left margin; "(a)" in a sentence or table is not one
        for m in LEAF.finditer(f[11].strip().replace('l', 'i').replace('|', 'i')):
            found.append((int(f[7]) // 2, f'({m.group(1)})'))
    return found


ROMAN = {'(i)', '(ii)', '(iii)', '(iv)', '(v)', '(vi)', '(vii)', '(viii)'}


def letter_of(label):
    """"(b)" for "(b)(ii)"; None for a one-level label such as "(c)"."""
    found = LEAF.findall(label or '')
    return f'({found[0]})' if len(found) > 1 else None


def enclosing(labels, row):
    """The last letter label ("(b)") printed at or above `row`."""
    above = [(top, found) for top, found in labels if found not in ROMAN and top <= row + 6]
    return max(above)[1] if above else None


def line_text(full, start):
    """tesseract's reading of the single printed line at `start` (left of the page)."""
    w = full.shape[1]
    line = Image.fromarray(full[max(0, start):start + 34, :int(w * 0.45)])
    line = line.resize((line.width * 3, line.height * 3))
    buf = io.BytesIO()
    line.save(buf, 'PNG')
    text = subprocess.run(['tesseract', '-', '-', '--psm', '7'], input=buf.getvalue(),
                          capture_output=True).stdout.decode(errors='ignore')
    return text.replace('l', 'i').replace('|', 'i').replace('1', 'i')


def label_at(labels, start, wanted, full=None, letter=None, first_of_letter=False, span=None):
    """The part starts on its own printed label: `wanted` ("(ii)") PAD px below `start`, under
    its own letter. The page OCR is tried first, then the single line at `start`."""
    if wanted is None:
        return False
    if letter and enclosing(labels, start + PAD) != letter:
        return False
    # refine.py may open a letter's first sub-part at the letter's lead-in ("(a) Figure 4 ...",
    # then "(i)"), so the part's own letter label also counts there.
    # That crop then holds the sub-part's own label below the lead-in; a crop that ends before
    # it is a lead-in line cut at the sub-part's height (1PH0 Nov 2021 1H Q10(a)(i) showed only
    # "10 (a) Figure 13 shows wind turbines").
    below = span is not None and any(found == wanted and start + span <= top < start + span + 400
                                     for top, found in labels)
    inside = span is not None and any(found == wanted and start + PAD + 6 < top < start + span
                                      for top, found in labels)
    lead_in_ok = first_of_letter and letter and (inside or not below)
    accepted = {wanted, letter if lead_in_ok else None} - {None}
    if any(found in accepted and abs(start + PAD - top) <= 6 for top, found in labels):
        return True
    if full is None:
        return False
    text = line_text(full, start)
    return any(label in text for label in accepted)


def page_height(groups, labels_of):
    """Pixels per page height for a paper, from printed label rows (median of pairs of parts
    on one page). Most papers are A4 at PDFium scale 1.6 (1347-1348 px); some papers' regions
    were recorded against another PDF box and map at about 1437 px (1PH0 June 2024 1F,
    1CH0 June 2025 1F: audit 2026-11-20)."""
    estimates = []
    for parent, units in groups.items():
        labels = labels_of(parent)
        if labels is None:
            continue
        by_page = defaultdict(list)
        for u in units:
            first = u['provenance']['source_regions'][0]
            want, letter = leaf(u.get('part_label')), letter_of(u.get('part_label'))
            rows = [t for t, f in labels if f == want and (letter is None or enclosing(labels, t) == letter)]
            if len(rows) == 1:
                by_page[first['page']].append((first['bbox'][1], rows[0]))
        for pts in by_page.values():
            for i in range(len(pts)):
                for j in range(i + 1, len(pts)):
                    if pts[j][0] - pts[i][0] > 0.15:
                        estimates.append((pts[j][1] - pts[i][1]) / (pts[j][0] - pts[i][0]))
    return float(np.median(estimates)) if len(estimates) >= 3 else None


def solve_ocr(units, full, H, labels):
    """Page offsets that put every part's recorded start on its own printed label."""
    starts = defaultdict(list)
    for u in units:
        first = u['provenance']['source_regions'][0]
        starts[first['page']].append((round(first['bbox'][1] * H), leaf(u.get('part_label')), letter_of(u.get('part_label'))))
    offsets = {}
    for page, items in starts.items():
        def fits(top, found, lab, letter):
            return found == lab and (letter is None or enclosing(labels, top) == letter)
        # tesseract's word top sits about OCR_BIAS px below the PDF label top refine.py used
        tried = {top - OCR_BIAS - PAD - y for y, lab, letter in items for top, found in labels if fits(top, found, lab, letter)}
        best = None
        for o in tried:
            hits = sum(any(fits(top, found, lab, letter) and abs(o + y + PAD + OCR_BIAS - top) <= 5 for top, found in labels)
                       for y, lab, letter in items)
            if best is None or hits > best[0]:
                best = (hits, o)
        if not best or best[0] < len(items):
            continue
        o = best[1]
        fine = [d for d in range(-3, 4) if all(label_ok(full, o + d + y) for y, _, _ in items)]
        if fine:
            offsets[page] = o + min(fine, key=abs)
    return offsets


# Reasons under which refine.py may show an earlier part (with its marks) as context.
NEEDS_EARLIER_PART = ('names an earlier part', 'builds on the previous answer', 'earlier "show that" result',
                      'earlier figure or data', 'figure ', 'table ', 'graph ', 'diagram ')
MARK = re.compile(r'^\(\d{1,2}\)$')


def shows_marks(piece):
    """A marks allocation "(n)" in the right margin: the piece holds another part's task."""
    w = piece.shape[1]
    right = Image.fromarray(piece[:, int(w * 0.80):])
    right = right.resize((right.width * 2, right.height * 2))
    buf = io.BytesIO()
    right.save(buf, 'PNG')
    text = subprocess.run(['tesseract', '-', '-', '--psm', '4'], input=buf.getvalue(),
                          capture_output=True).stdout.decode(errors='ignore')
    return any(MARK.match(t.replace('O', '0').replace('o', '0')) for t in text.split())


# Wording that names an earlier part or uses its answer ("your answer to (b)(i)", "part (a)",
# "the value you calculated in (c)"). "Give your answer to two decimal places" is not one.
REFERS = re.compile(r"(?:your )?answers? (?:to|from|in) (?:part |question )?(\([a-h]\)(?:\s*\([ivx]+\))?|\([ivx]+\))|"
                    r"(?:part|question)s? (\([a-h]\)(?:\s*\([ivx]+\))?|\([ivx]+\))|"
                    r"you (?:calculated|found|worked out|gave|drew|plotted|wrote)(?: in| for)?\s*(?:part )?(\([a-h]\)(?:\s*\([ivx]+\))?|\([ivx]+\))?|"
                    r"(?:use|using) (?:the |your )?(?:value|result|answer|calculation)s? (?:from|in|to|of) (?:part )?(\([a-h]\)(?:\s*\([ivx]+\))?|\([ivx]+\))", re.I)
REFERENCE = re.compile(r'\b(figure|table)\s*(\d{1,2})\b', re.I)
CAPTION = re.compile(r'^(figure|table)\s*(\d{1,2})$', re.I)


def ocr_lines(pixels):
    """[(top, bottom, text)] for each printed line, in the image's rows."""
    image = Image.fromarray(pixels)
    big = image.resize((image.width * 2, image.height * 2))
    buf = io.BytesIO()
    big.save(buf, 'PNG')
    tsv = subprocess.run(['tesseract', '-', '-', '--psm', '4', 'tsv'], input=buf.getvalue(),
                         capture_output=True).stdout.decode(errors='ignore')
    lines = defaultdict(list)
    for row in tsv.splitlines()[1:]:
        f = row.split('\t')
        if len(f) >= 12 and f[11].strip():
            lines[(f[2], f[3], f[4])].append((int(f[6]) // 2, int(f[7]) // 2, int(f[9]) // 2, f[11].strip()))
    return sorted((min(w[1] for w in ws), max(w[1] + w[2] for w in ws),
                   ' '.join(w[3] for w in sorted(ws))) for ws in lines.values())


def needs_of(own, reasons):
    """What printed material outside its own rows a part's wording uses: (the earlier parts it
    names: labels such as '(b)(i)' or '(i)', or '' for "the value you calculated"; and the
    figures and tables it refers to, {('figure', '3'), ...})."""
    text = ' '.join(t for _, _, t in ocr_lines(own))
    named = set()
    for m in REFERS.finditer(text):
        label = next((g for g in m.groups() if g), '')
        named.add(re.sub(r'\s+', '', label.lower()))
    wanted = {(k.lower(), n) for k, n in REFERENCE.findall(text)}
    # Unnumbered material ("Use the graph", "the data in the table"), common in A-level papers:
    # with refine.py's "earlier figure or data" reason, the part uses something printed in
    # the part before it. '' marks the nearest earlier part of the same letter (else the one
    # just before).
    if any(r.lower().startswith('earlier figure or data') for r in reasons) and \
            re.search(r'\b(the|this|these|your) (graph|diagram|table|data|results|photograph|chart|drawing|map|sketch|curve)', text, re.I) \
            and not REFERENCE.search(text):
        named.add('~')
    for reason in reasons:
        m = re.match(r'(figure|table) (\d{1,2})\b', reason.lower())
        if m:
            wanted.add((m.group(1), m.group(2)))
    return named, wanted


def is_named(label, named, previous, own_label=None, nearest_same_letter=False):
    """Whether a sibling part is one the wording names ('' = the part just before; '~' =
    unnumbered material: the nearest earlier part of the same letter, else the one before)."""
    label = re.sub(r'\s+', '', (label or '').lower())
    if '~' in named and (nearest_same_letter or previous):
        return True
    for n in named - {'~'}:
        if not n:
            if previous:
                return True
        elif label == n or label.endswith(n) or label.startswith(n):
            return True
    return False


def shows_that_used(pv):
    """refine.py found this part using an earlier "show that" value."""
    return any(r.lower().startswith('earlier "show that" result') for r in pv.get('context_reasons') or [])


_show_that = {}


def says_show_that(unit, full, offsets, H):
    """The unit's own printed task is a "Show that" (its result is then used later without
    naming the part: 9PH0 "weight of base" after "Show that ... about 870 N")."""
    key = (unit['question_id'], H, tuple(offsets.get(r['page']) for r in unit['provenance']['source_regions']))
    if key not in _show_that:
        rows = [full[offsets[r['page']] + round(r['bbox'][1] * H):offsets[r['page']] + round(r['bbox'][3] * H)]
                for r in unit['provenance']['source_regions'] if r['page'] in offsets]
        text = ' '.join(t for piece in rows if piece.shape[0] > 0 for _, _, t in ocr_lines(piece))
        # the command itself, with a value: not "the test to show that a gas is oxygen"
        _show_that[key] = bool(re.search(r"(?:^|[.)]\s+|\s{2,})Show that\b[^.]{0,160}?\d", text, re.M))
    return _show_that[key]


def nearest_same_letter(units, owner, me):
    """owner is the closest earlier part sharing my letter ((a)(i) for (a)(ii))."""
    mine = letter_of(units[me].get('part_label'))
    same = [i for i in range(me) if letter_of(units[i].get('part_label')) == mine and mine]
    return bool(same) and owner == same[-1]


def subtract(top, bottom, spans):
    """[top, bottom) without the spans [(a, b, owner)]: (kept, removed) where removed carries
    the owner of each removed row range."""
    kept, removed, y = [], [], top
    for a, b, owner in sorted(spans):
        a, b = max(a, top), min(b, bottom)
        if b <= a or b <= y:
            continue
        if a > y:
            kept.append((y, a))
        removed.append((max(a, y), b, owner))
        y = b
    if y < bottom:
        kept.append((y, bottom))
    return kept, removed


def caption_end(full, top, bottom, wanted):
    """Last row of the caption of a wanted figure or table printed in [top, bottom)."""
    for a, b, text in ocr_lines(full[top:bottom]):
        m = CAPTION.match(text.strip().rstrip('.'))
        if m and (m.group(1).lower(), m.group(2)) in wanted:
            return top + b + 6
    return None


def height(regions, H):
    return sum(round(r['bbox'][3] * H) - round(r['bbox'][1] * H) for r in regions) + GAP * (len(regions) - 1)


def stack(pieces, width):
    pieces = [p for p in pieces if p.shape[0] > 0]
    out = np.full((sum(p.shape[0] for p in pieces) + GAP * (len(pieces) - 1), width), 255, np.uint8)
    y = 0
    for p in pieces:
        out[y:y + p.shape[0]] = p
        y += p.shape[0] + GAP
    return out


def solve(units, full, assets, H):
    """Row offset of each page in the full image, or None where it cannot be proved."""
    candidates = defaultdict(Counter)
    for u in units:
        regions = u['provenance']['source_regions']
        name = u['content']['question_image_url'].rsplit('/', 1)[1]
        crop = decode(assets[name])
        row, diff = locate(crop, full)
        if row is None or diff > 3:
            continue
        first = regions[0]
        candidates[first['page']][row - round(first['bbox'][1] * H)] += 1
        if crop.shape[0] == height(regions, H):  # build and refined regions agree: chain pages
            y = row
            for r in regions:
                candidates[r['page']][y - round(r['bbox'][1] * H)] += 2
                y += round(r['bbox'][3] * H) - round(r['bbox'][1] * H) + GAP
    offsets = {}
    for page, counts in candidates.items():
        tried = sorted({o + d for o in counts for d in (-1, 0, 1)})

        def score(o):
            starts = [u for u in units if u['provenance']['source_regions'][0]['page'] == page]
            ok = sum(label_ok(full, o + round(u['provenance']['source_regions'][0]['bbox'][1] * H)) for u in starts)
            return (ok, counts.get(o, 0))
        best = max(tried, key=score)
        offsets[page] = best
    return offsets


def cut(full, offsets, regions, H):
    pieces = []
    for r in regions:
        if r['page'] not in offsets:
            return None
        top = offsets[r['page']] + round(r['bbox'][1] * H)
        bottom = offsets[r['page']] + round(r['bbox'][3] * H)
        if 0 < bottom - full.shape[0] <= 6:
            bottom = full.shape[0]  # a region ending at the foot of the render
        if top < 0 or bottom > full.shape[0] or bottom <= top:
            return None
        pieces.append(full[top:bottom])
    return stack(pieces, full.shape[1])


def process(pack_path, slug, dry, report):
    pack = json.loads(pack_path.read_text())
    pid = pack_path.stem
    cat_path = ROOT / 'data' / f'{slug}-assets' / f'{pid}.json'
    catalogue = json.loads(cat_path.read_text())
    assets = catalogue['assets']
    groups = defaultdict(list)
    for q in pack['questions']:
        groups[q['parent_question_id']].append(q)
    changed_pack = changed_cat = False
    label_cache = {}

    def labels_of(parent):
        if parent not in label_cache:
            name = f"{re.search(r'_(Q\d+)$', parent).group(1)}_full.webp"
            label_cache[parent] = ocr_labels(decode(assets[name])) if name in assets else None
        return label_cache[parent]

    multi = {p: sorted(u, key=lambda q: q['question_id']) for p, u in groups.items() if len(u) > 1
             and all(x['provenance'].get('part_display') == 'refined' for x in u)}
    estimate = page_height(multi, labels_of)
    if not estimate or not 1200 < estimate < 1700:
        # label pairs misread (8MA0 June 2018 Paper 1 gave 334): estimate from the part crops,
        # whose heights are their regions at the paper's scale
        spans = []
        for units in multi.values():
            for q in units:
                rg = q['provenance'].get('source_regions') or []
                name = q['content']['question_image_url'].rsplit('/', 1)[1]
                if len(rg) == 1 and rg[0]['bbox'][3] - rg[0]['bbox'][1] > 0.1 and name in assets and not name.endswith('_full.webp'):
                    spans.append(decode(assets[name]).shape[0] / (rg[0]['bbox'][3] - rg[0]['bbox'][1]))
        estimate = float(np.median(spans)) if spans else None
    heights = HEIGHTS
    if estimate and abs(estimate - 1347.5) > 6:
        heights = tuple(range(round(estimate) - 2, round(estimate) + 3))
        report['paper_page_height'].append(f'{pid} {estimate:.1f}')
    for parent, units in groups.items():
        units.sort(key=lambda q: q['question_id'])
        if any(u['provenance'].get('own_rows_from_full') for u in units):
            report['reviewed_rows_kept'].append(parent)  # tools/parts/manual-contexts.py owns these
            continue
        if len(units) < 2 or not all(u['provenance'].get('part_display') == 'refined' for u in units):
            if len(units) > 1:
                report['not_refined_questions'].append(parent)
            continue
        qn = re.search(r'_(Q\d+)$', parent).group(1)
        if f'{qn}_full.webp' not in assets:
            report['no_full_image'].append(parent)
            continue
        full = decode(assets[f'{qn}_full.webp'])
        labels = labels_of(parent)

        def attempts():
            for H in heights:
                yield H, solve(units, full, assets, H), 'crop match'
            for H in heights:
                ocr = solve_ocr(units, full, H, labels)
                yield H, ocr, 'tesseract label rows'
                # pixel-matched pages where the crops prove them, label rows for the others
                yield H, {**ocr, **solve(units, full, assets, H)}, 'crop match and tesseract label rows'

        best = None
        for H, offsets, how in attempts():
            if best is not None and not best[2]:
                break  # the pixel-matched solution already passes every part
            plan, failures = [], []
            seen_letters = set()
            for u in units:
                pv = u['provenance']
                regions = pv['source_regions']
                first_of_letter = letter_of(u.get('part_label')) not in seen_letters
                seen_letters.add(letter_of(u.get('part_label')))
                start = offsets.get(regions[0]['page'], None)
                start = None if start is None else start + round(regions[0]['bbox'][1] * H)
                own = cut(full, offsets, regions, H)
                # Mandatory: the part starts on its own printed label. Blank-above/ink-below
                # alone once passed a page offset 230 px out (1BI0 June 2023 1F Q2).
                # With --contexts-only the published crop itself proves the offset: it is cut
                # unchanged (within a grey level) from the full image at this offset.
                pixel_proved = CONTEXTS_ONLY and own is not None and how == 'crop match' and \
                    (lambda cur: cur.shape == own.shape and float(np.abs(cur.astype(np.int16) - own).mean()) <= 2)(
                        decode(assets[u['content']['question_image_url'].rsplit('/', 1)[1]]))
                if pixel_proved:
                    pass
                elif own is None or start is None or not label_ok(full, start) \
                        or not label_at(labels, start, leaf(u.get('part_label')), full, letter_of(u.get('part_label')),
                                        first_of_letter=first_of_letter, span=own.shape[0]):
                    failures.append(u['question_id'])
                    continue
                pieces = []
                intro_end = 0
                if pv.get('context_includes_stem_image'):
                    first = units[0]['provenance']['source_regions'][0]
                    intro_end = offsets.get(first['page'], 0) + round(first['bbox'][1] * H)
                    pieces.append(full[:max(0, intro_end)])
                bad = False
                dropped = []
                kept_regions = []
                kept_parts, kept_figures, stem_rows = set(), set(), set()
                needs = None
                for region in pv.get('context_regions_refined') or pv.get('context_regions') or []:
                    if region['page'] not in offsets:
                        bad = True
                        break
                    base = offsets[region['page']]
                    top = base + round(region['bbox'][1] * H)
                    bottom = base + round(region['bbox'][3] * H)
                    # refine.py stacked the build's stem and then only the regions not in it.
                    # The introduction here is every row above the first part, so a lead-in
                    # printed there ("3 (a) Sickle cell disease ..." above "(i)") is not repeated.
                    top = max(top, intro_end)
                    if bottom - top < 6:
                        continue
                    if top < 0 or bottom > full.shape[0]:
                        bad = True
                        break
                    # Minimum context (audit 2026-11-20, second pass): a context region is cut to
                    # the rows that belong to no part (introductions, lead-ins, shared figures).
                    # Rows of another part of the question (its task, answer lines and marks) are
                    # kept only when this part's printed wording names an earlier part or answer;
                    # a figure or table the part refers to that is printed inside another part is
                    # kept down to its caption. Regions are whole earlier parts in refine.py, so
                    # without this a context showed the sibling's task with its marks.
                    spans = [(offsets[r['page']] + round(r['bbox'][1] * H), offsets[r['page']] + round(r['bbox'][3] * H), i)
                             for i, s in enumerate(units) for r in s['provenance']['source_regions'] if r['page'] == region['page']]
                    segments, removed = subtract(top, bottom, spans)
                    # refine.py found this region as the text printed just before the part (a
                    # stem after the previous part's answer space, as in 1MA1 June 2024 3F Q16(b),
                    # where "In a competition ..." lies inside (a)'s recorded rows): kept whole
                    # when it holds no marks allocation, so no other part's task.
                    if 'text printed just before this part' in (pv.get('context_reasons') or []) and removed \
                            and not shows_marks(full[top:bottom]):
                        segments, removed = [(top, bottom)], []
                        stem_rows.update(units[o]['question_id'] for _, _, o in subtract(top, bottom, spans)[1])
                    me = units.index(u)
                    # Rows of another part above its own printed label are that part's stem or
                    # lead-in, printed for the question ("In a competition, a player gets ..."
                    # above "(a)" in 1MA1 June 2024 3F Q16): they stay.
                    split = []
                    for a, b, owner in removed:
                        mine = {leaf(units[owner].get('part_label')), letter_of(units[owner].get('part_label'))} - {None}
                        rows = [top for top, found in labels if found in mine and a <= top - PAD < b] if labels else []
                        label_row = min(rows) - PAD if rows else a
                        if label_row - a > 8 and inky(full[a:label_row]):
                            segments.append((a, label_row))
                            stem_rows.add(units[owner]['question_id'])
                            a = label_row
                        if b - a > 0:
                            split.append((a, b, owner))
                    for a, b, owner in split:
                        if needs is None:
                            needs = needs_of(own, pv.get('context_reasons') or [])
                        named, wanted = needs
                        if owner < me and (units[owner]['question_id'] in (u.get('depends_on_question_ids') or [])
                                           or is_named(units[owner].get('part_label'), named, owner == me - 1,
                                                       nearest_same_letter=nearest_same_letter(units, owner, me))
                                           or (shows_that_used(pv) and (owner == me - 1 or nearest_same_letter(units, owner, me))
                                               and says_show_that(units[owner], full, offsets, H))):
                            segments.append((a, b))
                            kept_parts.add(units[owner]['question_id'])
                        elif wanted:
                            end = caption_end(full, a, b, wanted)
                            if end and not shows_marks(full[a:min(end, b)]):
                                segments.append((a, min(end, b)))
                                kept_figures.add(units[owner]['question_id'])
                    merged = []
                    for a, b in sorted(segments):
                        if merged and a <= merged[-1][1] + 1:
                            merged[-1] = (merged[-1][0], max(merged[-1][1], b))
                        else:
                            merged.append((a, b))
                    for a, b in merged:
                        piece = {'page': region['page'], 'bbox': [region['bbox'][0], (a - base) / H, region['bbox'][2], (b - base) / H]}
                        if b - a < 6 or not inky(full[a:b]):
                            continue
                        if not any(r.lower().startswith(NEEDS_EARLIER_PART) for r in pv.get('context_reasons') or []) \
                                and shows_marks(full[a:b]):
                            dropped.append(piece)
                            continue
                        kept_regions.append(piece)
                        pieces.append(full[a:b])
                if bad:
                    failures.append(u['question_id'])
                    continue
                context = stack(pieces, full.shape[1]) if pieces else None
                plan.append((u, own, context, dropped, kept_regions, kept_parts, kept_figures, stem_rows))
            if best is None or len(failures) < len(best[2]):
                best = (H, plan, failures, how)
        H, plan, failures, how = best
        if failures:
            report['unverified_questions'].append({'question': parent, 'units': failures})
            continue  # all parts of a question or none, so a question never mixes layouts
        for u, own, context, dropped, kept_regions, kept_parts, kept_figures, stem_rows in plan:
            pv = u['provenance']
            # the other parts whose rows this context keeps on purpose: named by the wording,
            # or holding a figure or table it uses (kept down to the caption)
            for key, value in (('context_named_parts', kept_parts), ('context_figure_from_parts', kept_figures),
                               ('context_stem_from_parts', stem_rows)):
                if not dry and sorted(value) != (pv.get(key) or []):
                    if value:
                        pv[key] = sorted(value)
                    else:
                        pv.pop(key, None)
                    changed_pack = True
            if (pv.get('context_regions') or pv.get('context_regions_refined')) and not dry \
                    and kept_regions != (pv.get('context_regions') or []):
                # the regions now shown; refine.py's whole-part regions are kept for reference
                pv.setdefault('context_regions_refined', pv.get('context_regions') or [])
                pv['context_regions'] = kept_regions
                pv['context_siblings_removed'] = '2026-11-20'
                changed_pack = True
            if dropped:
                report['context_sibling_dropped'].append(u['question_id'])
            if not dry and dropped != (pv.get('context_regions_dropped') or []):
                if dropped:
                    pv['context_regions_dropped'] = dropped
                else:
                    pv.pop('context_regions_dropped', None)
                changed_pack = True
            name = u['content']['question_image_url'].rsplit('/', 1)[1]
            current = decode(assets[name])
            if current.shape != own.shape or float(np.abs(current.astype(np.int16) - own).mean()) > 2:
                report['own_recut' if not CONTEXTS_ONLY else 'own_differs_kept'].append(u['question_id'])
                if not dry and not CONTEXTS_ONLY:
                    assets[name] = encode(own)
                    changed_cat = True
            ctx = u.setdefault('context', {})
            ctx_name = f"{qn}_{re.search(r'_(U\d+|P\d+)$', u['question_id']).group(1)}_context.webp"
            if context is None or not inky(context):
                if ctx.get('stem_image_url'):
                    report['context_removed_empty'].append(u['question_id'])
                    if not dry:
                        assets.pop(ctx['stem_image_url'].rsplit('/', 1)[1], None)
                        ctx.pop('stem_image_url')
                        changed_pack = changed_cat = True
                continue
            cur_name = (ctx.get('stem_image_url') or '').rsplit('/', 1)[-1]
            current = decode(assets[cur_name]) if cur_name in assets else None
            if current is None or current.shape != context.shape or float(np.abs(current.astype(np.int16) - context).mean()) > 2:
                report['context_recut'].append(u['question_id'])
                if not dry:
                    assets[ctx_name] = encode(context)
                    ctx['stem_image_url'] = f'assets/{slug}/{pid}/{ctx_name}'
                    u['provenance']['context_recut_from_full'] = '2026-11-19'
                    if how != 'crop match':
                        u['provenance']['context_recut_positioning'] = how
                    changed_pack = changed_cat = True
        report['questions_verified'].append(parent)
        if how != 'crop match':
            report['positioned_by_ocr'].append(parent)
    if not dry:
        if changed_pack:
            pack_path.write_text(json.dumps(pack, ensure_ascii=False, indent=2) + '\n')
        if changed_cat:
            newline = '\n' if cat_path.read_text().endswith('\n') else ''
            cat_path.write_text(json.dumps(catalogue, separators=(',', ':')) + newline)


CONTEXTS_ONLY = False  # --contexts-only: own crops already verified elsewhere stay as they are


def run_paper(job):
    global CONTEXTS_ONLY
    pack_path, slug, dry, CONTEXTS_ONLY = job
    report = defaultdict(list)
    process(pack_path, slug, dry, report)
    return dict(report)


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--dry-run', action='store_true')
    ap.add_argument('--report', type=Path)
    ap.add_argument('--slug', action='append')
    ap.add_argument('--paper', action='append')
    ap.add_argument('--contexts-only', action='store_true',
                    help='rebuild contexts only; leave part crops (A-level banks, whose crops already match their regions)')
    a = ap.parse_args()
    jobs = [(p, slug, a.dry_run, a.contexts_only) for slug in a.slug or SLUGS for p in sorted((ROOT / 'data/packs' / slug).glob('*.json'))
            if not a.paper or p.stem in a.paper]
    report = defaultdict(list)
    with ProcessPoolExecutor() as pool:  # one paper per worker: each owns its pack and catalogue
        for part in pool.map(run_paper, jobs):
            for key, items in part.items():
                report[key] += items
    for key, items in report.items():
        print(f'{key}: {len(items)}')
    if a.report:
        a.report.write_text(json.dumps(report, indent=1))


if __name__ == '__main__':
    main()
