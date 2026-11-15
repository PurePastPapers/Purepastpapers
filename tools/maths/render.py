#!/usr/bin/env python3
"""Render verified PDF regions without transcribing mathematical notation."""
import argparse
import json
from functools import lru_cache
from pathlib import Path
import pypdfium2 as pdfium
from PIL import Image


class SourceRenderer:
    def __init__(self, path, scale=1.6):
        self.document = pdfium.PdfDocument(path)
        self.scale = scale

    @lru_cache(maxsize=4)
    def page(self, index):
        page = self.document[index]
        # Extraction coordinates use the MediaBox. PDFium otherwise renders the
        # inset CropBox, silently shifting/scaling every normalised crop.
        # Change only this in-memory page view; original PDFs remain immutable.
        page.set_cropbox(*page.get_mediabox())
        return page.render(scale=self.scale).to_pil().convert('RGB')

    def render(self, regions, output):
        pieces = []
        for region in regions:
            im = self.page(region['page'] - 1)
            left, top, right, bottom = region['bbox']
            if bottom <= top:
                raise ValueError('Empty source region')
            piece = im.crop((round(left * im.width), round(top * im.height),
                             round(right * im.width), round(bottom * im.height)))
            pieces.append(piece)
        if not pieces:
            raise ValueError('No source regions')
        canvas = Image.new('RGB', (max(im.width for im in pieces), sum(im.height for im in pieces) + 12 * (len(pieces) - 1)), 'white')
        y = 0
        for piece in pieces:
            canvas.paste(piece, (0, y)); y += piece.height + 12
        output = Path(output)
        output.parent.mkdir(parents=True, exist_ok=True)
        canvas.save(output, lossless=True) if output.suffix == '.webp' else canvas.save(output)
        return {'width': canvas.width, 'height': canvas.height, 'bytes': output.stat().st_size}


if __name__ == '__main__':
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('candidate', type=Path)
    p.add_argument('--question', required=True)
    p.add_argument('--output', type=Path, required=True)
    args = p.parse_args()
    data = json.loads(args.candidate.read_text())
    question = next(q for q in data['questions'] if q['number'] == args.question)
    print(SourceRenderer(data['source_file']).render(question['regions'], args.output))
