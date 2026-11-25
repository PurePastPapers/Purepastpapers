#!/usr/bin/env python3
"""Render F180 regions for private inspection. Does not publish or activate.

Usage: python3 tools/appsci/f180-render.py SOURCE_PDF PRIVATE_OUTPUT
Coordinates are PDF points. All output is lossless PNG and must be manually reviewed
before creating a pack; source-specific publication rights must also be established.
"""
import argparse, hashlib, json
from pathlib import Path
import fitz
from PIL import Image
from io import BytesIO

ROOT = Path(__file__).resolve().parent

def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument('pdf', type=Path)
    ap.add_argument('output', type=Path)
    args = ap.parse_args()
    manifest = json.loads((ROOT / 'f180-regions.json').read_text())
    digest = hashlib.sha256(args.pdf.read_bytes()).hexdigest()
    if digest != manifest['source_sha256']:
        raise ValueError('Source checksum mismatch; do not apply coordinates to a different revision')
    doc = fitz.open(args.pdf)
    assert len(doc) == 39
    assert sum(p['marks'] for p in manifest['parts']) == 70
    args.output.mkdir(parents=True, exist_ok=True)
    for part in manifest['parts']:
        for kind in ('q','context','ms'):
            regions = part.get(kind, [])
            if not regions: continue
            x0, x1 = (48, 550) if kind == 'ms' else (30, 570)
            crops = []
            for page, y0, y1 in regions:
                p = doc[page - 1]
                if p.rotation or abs(p.rect.width-595.32)>1 or abs(p.rect.height-841.92)>1:
                    raise ValueError(f'Unexpected page geometry on {page}')
                pix = p.get_pixmap(matrix=fitz.Matrix(2,2), clip=fitz.Rect(x0,y0,x1,y1), alpha=False)
                crops.append(Image.open(BytesIO(pix.tobytes('png'))).convert('RGB'))
            out = Image.new('RGB',(max(c.width for c in crops),sum(c.height for c in crops)+max(0,len(crops)-1)*12),'white')
            y = 0
            for crop in crops:
                out.paste(crop,(0,y)); y += crop.height + 12
            out.save(args.output / f"{part['id']}_{kind}.png", optimize=True)
    print(f"Rendered {len(manifest['parts'])} units to {args.output}; not published")
if __name__ == '__main__': main()
