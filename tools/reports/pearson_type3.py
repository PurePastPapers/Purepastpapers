"""Render the examiner commentary from Pearson's three June 2024 Type 3 PDFs."""

import argparse
import hashlib
import json
from collections import defaultdict
from pathlib import Path

import fitz
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
PAPERS = {
    'physics/EDX_9PH0_2024_JUNE_01': (89, (3,)),
    'history/EDX_9HI0_2024_JUNE_1H': (44, (3, 4)),
    'history/EDX_9HI0_2024_JUNE_2H': (47, ()),
}
SCALE = 1.65
LABELS = {'p': 'Examiner feedback', 'ex': 'Comments on example responses', 'tip': 'Examiner tips'}


def extract_page(page, has_heading):
    images = [fitz.Rect(item['bbox']) for item in page.get_image_info()]
    logos = [box for box in images if abs(box.x0 - 99) < 1 and abs(box.width - 150) < 1]
    scripts = [box for box in images if box not in logos]
    rows = defaultdict(list)
    for span in page.get_texttrace():
        for _, _, (x, y), _ in span['chars']:
            if 25 < x < 572 and 32 < y < 815:
                rows[round(y, 1)].append((x, span['size']))
    if has_heading:
        y = min(rows)
        if not 60 <= y <= 70 or max(size for _, size in rows[y]) < 13:
            raise ValueError(f'Missing verified heading on page {page.number + 1}')
        del rows[y]

    groups = []
    for y, glyphs in sorted(rows.items()):
        # Candidate answers are raster images. A ResultsPlus label can extend
        # into its own following text's bounding box, so use its centre.
        if any(box.y0 <= y <= box.y1 for box in scripts):
            raise ValueError(f'Unexpected selectable text inside a figure on page {page.number + 1}')
        previous = max((box for box in images if box.y0 < y), key=lambda box: box.y0, default=None)
        kind = ('tip' if previous.height < 52 else 'ex') if previous in logos else 'p'
        if not groups or groups[-1][0:2] != (kind, previous) or y - groups[-1][2][-1][0] > 25:
            groups.append((kind, previous, []))
        groups[-1][2].append((y, glyphs))

    strips = []
    for kind, _, lines in groups:
        top, bottom = lines[0][0] - 13, lines[-1][0] + 5
        x0 = max(20, min(x for _, glyphs in lines for x, _ in glyphs) - 4)
        x1 = min(578, max(x + size for _, glyphs in lines for x, size in glyphs) + 4)
        # Prevent padding from capturing any part of a candidate script or logo.
        for box in images:
            if box.y0 < lines[0][0]:
                end = min(box.y1, box.y0 + 45) if box in logos else box.y1
                top = max(top, end)
            if box.y0 > lines[-1][0]:
                bottom = min(bottom, box.y0)
        if any(top < script.y1 and bottom > script.y0 for script in scripts):
            raise ValueError(f'Figure overlap on page {page.number + 1}')
        rect = fitz.Rect(x0, top, x1, bottom)
        pix = page.get_pixmap(matrix=fitz.Matrix(SCALE, SCALE), clip=rect, colorspace=fitz.csGRAY)
        strips.append((kind, rect, Image.frombytes('L', (pix.width, pix.height), pix.samples)))
    return strips, len(scripts)


def render_block(pdf, pages, heading_page, directory, paper_id, block_id, heading):
    images = defaultdict(list)
    figures = []
    for number in pages:
        strips, script_count = extract_page(pdf[number - 1], number == heading_page)
        if script_count:
            figures.append({'page': number, 'count': script_count})
        for kind, rect, strip in strips:
            images[kind].append((number, rect, strip))

    paragraphs = []
    for kind, label in LABELS.items():
        strips = images[kind]
        if not strips:
            continue
        left = min(rect.x0 for _, rect, _ in strips)
        offsets = [round((rect.x0 - left) * SCALE) for _, rect, _ in strips]
        width = max(x + strip.width for x, (_, _, strip) in zip(offsets, strips))
        height = sum(strip.height + 8 for _, _, strip in strips) - 8
        combined = Image.new('L', (width, height), 255)
        y = 0
        for x, (_, _, strip) in zip(offsets, strips):
            combined.paste(strip, (x, y))
            y += strip.height + 8
        name = f'{paper_id}_type3_{block_id}_{kind}.webp'
        directory.mkdir(parents=True, exist_ok=True)
        combined.save(directory / name, quality=79, method=6)
        source_pages = sorted({number for number, _, _ in strips})
        pages_label = ', '.join(map(str, source_pages))
        paragraphs.append({
            'k': kind,
            't': f'{label} for {heading}, official PDF pages {pages_label}',
            'img': [{'src': f'{directory.parent.name}/img/{name}', 'w': width, 'h': height}],
            'pages': source_pages,
        })
    if not any(paragraph['k'] == 'p' for paragraph in paragraphs):
        raise ValueError(f'Missing standalone commentary for {paper_id} {heading}')
    return paragraphs, figures


def convert(paper, end_page, general_pages, source_dir):
    output = ROOT / f'data/reports/{paper}.json'
    report = json.loads(output.read_text())
    source = source_dir / f'{report["paper_id"]}.pdf'
    if hashlib.sha256(source.read_bytes()).hexdigest() != report['source_sha256']:
        raise ValueError(f'Unexpected source PDF digest for {paper}')
    directory = output.parent / 'img'
    sections = report['sections']
    with fitz.open(source) as pdf:
        for index, section in enumerate(sections):
            first = section['pages'][0]
            end = sections[index + 1]['pages'][0] if index + 1 < len(sections) else end_page
            if paper.endswith('2H') and section['targets'][0]['q'] == '2':
                end = 20  # The shared PDF switches back to option 2H.1 here.
            section['pages'] = list(range(first, end))
            section['paras'], section['figures'] = render_block(
                pdf, section['pages'], first, directory, report['paper_id'], section['id'], section['heading']
            )
        if general_pages:
            paras, _ = render_block(pdf, general_pages, general_pages[0], directory, report['paper_id'], 'general', 'the paper')
            report['general'] = {'pages': list(general_pages), 'paras': paras}
    report['coverage_status'] = 'integrated'
    report['rendering'] = 'publisher_crops'
    output.write_text(json.dumps(report, ensure_ascii=False, indent=1) + '\n')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('source_dir', type=Path, help='directory of official PDFs named by paper ID')
    args = parser.parse_args()
    for paper, (end_page, general_pages) in PAPERS.items():
        convert(paper, end_page, general_pages, args.source_dir)
