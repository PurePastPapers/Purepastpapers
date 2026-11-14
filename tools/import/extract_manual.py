"""Build question images/JSON from hand-measured segmentation (tools/import/manual/9MA0.json)
for papers whose PDF has no text layer. Output format matches extract_qp.py.
usage: python3 -I tools/import/extract_manual.py <paper_id> <qp.pdf> <out_dir_json> <out_dir_img> <manual.json>"""
import sys, json, os
import pypdfium2
from PIL import Image
SCALE, X0, X1 = 2.0, 36, 560
paper_id, pdf_path, out_json, out_img, manual = sys.argv[1:6]
doc = pypdfium2.PdfDocument(pdf_path)
os.makedirs(out_img, exist_ok=True); os.makedirs(out_json, exist_ok=True)
out = {'paper_id': paper_id, 'pages': len(doc), 'questions': [], 'exceptions': [], 'manual_segmentation': True}
for q in json.load(open(manual))[paper_id]:
    (page, a, b), = q['segments']          # single-page questions only
    H = b - a
    W = int(round((X1 - X0 + 2) * SCALE))
    im = doc[page - 1].render(scale=SCALE).to_pil().convert('L').crop((int((X0 - 1) * SCALE), int(a * SCALE), int((X0 - 1) * SCALE) + W, int(b * SCALE)))
    name = f'q{q["number"]:02d}.webp'
    im.save(os.path.join(out_img, name), 'WEBP', quality=72, method=6)
    units, prev = [], q['stem_end']
    for label, marks, end in q['units']:
        units.append({'label': label, 'marks': marks, 'y0': round((prev - a) / H, 5), 'y1': round((end - a) / H, 5), 'text': ''}); prev = end
    assert sum(u['marks'] for u in units) == q['total'], (paper_id, q['number'])
    out['questions'].append({'number': q['number'], 'section': 1, 'key': f'q{q["number"]:02d}', 'total': q['total'], 'image': name,
                             'width': W, 'height': im.size[1], 'pages': [page], 'stem_end': round((q['stem_end'] - a) / H, 5), 'tail_start': None,
                             'units': units, 'has_graphics': True, 'text': q['text'], 'text_source': 'manual_transcription'})
out['paper_total'] = sum(q['total'] for q in out['questions'])
json.dump(out, open(os.path.join(out_json, f'{paper_id}.qp.json'), 'w'), indent=1, ensure_ascii=False)
print(paper_id, 'questions', len(out['questions']), 'units', sum(len(q['units']) for q in out['questions']), 'total', out['paper_total'], '(manual)')
