#!/usr/bin/env python3
"""Render verified Physics PDF regions (CropBox geometry, lossless WebP)."""
import argparse, json
from functools import lru_cache
from pathlib import Path
import pypdfium2 as pdfium
from PIL import Image


class SourceRenderer:
    """Unlike the Maths renderer this keeps PDFium's default CropBox view, matching
    tools/physics/extract.py, whose coordinates are CropBox-relative."""

    def __init__(self, path, scale=1.6):
        self.document = pdfium.PdfDocument(path)
        self.scale = scale

    @lru_cache(maxsize=6)
    def page(self, index):
        return self.document[index].render(scale=self.scale).to_pil().convert('RGB')

    def render(self, regions, output):
        pieces = []
        for region in regions:
            im = self.page(region['page'] - 1)
            left, top, right, bottom = region['bbox']
            if bottom <= top:
                raise ValueError('Empty source region')
            pieces.append(im.crop((round(left * im.width), round(top * im.height),
                                   round(right * im.width), round(bottom * im.height))))
        if not pieces:
            raise ValueError('No source regions')
        canvas = Image.new('RGB', (max(p.width for p in pieces), sum(p.height for p in pieces) + 12 * (len(pieces) - 1)), 'white')
        y = 0
        for piece in pieces:
            canvas.paste(piece, (0, y)); y += piece.height + 12
        output = Path(output); output.parent.mkdir(parents=True, exist_ok=True)
        canvas.save(output, lossless=True) if output.suffix == '.webp' else canvas.save(output)
        return {'width': canvas.width, 'height': canvas.height, 'bytes': output.stat().st_size}


if __name__ == '__main__':
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('candidate', type=Path)
    p.add_argument('--question', required=True)
    p.add_argument('--output', type=Path, required=True)
    a = p.parse_args()
    data = json.loads(a.candidate.read_text())
    q = next(q for q in data['questions'] if q['number'] == a.question)
    print(SourceRenderer(data['source_file']).render(q['regions'], a.output))
