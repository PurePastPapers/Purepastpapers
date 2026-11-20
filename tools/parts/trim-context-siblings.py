#!/usr/bin/env python3
"""Cut other parts' tasks out of contexts that recut-from-full.py could not position.

recut-from-full.py rebuilds a context only for questions whose page offsets it can prove; in
the rest (A-level Biology 8BN0 June 2022 Q6, the 9BN0 sample paper 1 Q10, ...) a context
can still end with an earlier part's task and marks ("(i) Explain the function of the
semilunar valve (2)" above (b)(ii)). Here no page offset is needed: each other part's
published crop is found inside the context image pixel for pixel (mean grey difference
<= 3 on its first rows) and those rows are cut out.

Applies only where the context is not justified by the part's wording: a part with a
recorded dependency or with refine.py's reasons "names an earlier part", "builds on the
previous answer" or 'earlier "show that" result' keeps its context (it becomes a linked
question; tools/parts/link-dependencies.py). Re-running finds nothing more to cut.

    python3 tools/parts/trim-context-siblings.py [--dry-run] [--slug biology ...]
"""
import argparse, base64, hashlib, importlib.util, io, json, re, subprocess
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location('recut', ROOT / 'tools/parts/recut-from-full.py')
recut = importlib.util.module_from_spec(spec)
spec.loader.exec_module(recut)
JUSTIFIED = ('names an earlier part', 'builds on the previous answer', 'earlier "show that" result')


MARK = re.compile(r'^[\(\[]\d{1,2}[\)\]]$')


def has_marks(piece):
    """A marks allocation "(n)" / "[n]" right of the text, read in bands that leave out the
    hatched "DO NOT WRITE IN THIS AREA" margin some papers print beside it."""
    w = piece.shape[1]
    for left, right in ((0.80, 1.0), (0.68, 0.93)):
        band = Image.fromarray(piece[:, int(w * left):int(w * right)])
        band = band.resize((band.width * 2, band.height * 2))
        buf = io.BytesIO()
        band.save(buf, 'PNG')
        text = subprocess.run(['tesseract', '-', '-', '--psm', '11'], input=buf.getvalue(),
                              capture_output=True).stdout.decode(errors='ignore')
        if any(MARK.match(t.replace('O', '0').replace('o', '0')) for t in text.split()):
            return True
    return False


def decode(asset):
    return np.asarray(Image.open(io.BytesIO(base64.b64decode(asset['base64']))).convert('L'))


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--dry-run', action='store_true')
    ap.add_argument('--slug', action='append', required=True)
    a = ap.parse_args()
    done = []
    for slug in a.slug:
        for path in sorted((ROOT / 'data/packs' / slug).glob('*.json')):
            pack = json.loads(path.read_text())
            cat_path = ROOT / 'data' / f'{slug}-assets' / f'{path.stem}.json'
            catalogue = None
            groups = {}
            for q in pack['questions']:
                groups.setdefault(q.get('parent_question_id'), []).append(q)
            for units in groups.values():
                for u in units:
                    pv = u.get('provenance') or {}
                    url = (u.get('context') or {}).get('stem_image_url')
                    if not url or pv.get('context_siblings_removed') or pv.get('context_reviewed') or pv.get('context_recut_from_full') or u.get('depends_on_question_ids') \
                            or any(r.startswith(JUSTIFIED) for r in pv.get('context_reasons') or []):
                        continue
                    catalogue = catalogue or json.loads(cat_path.read_text())
                    assets = catalogue['assets']
                    name = url.rsplit('/', 1)[1]
                    context = decode(assets[name])
                    cuts = []
                    for other in units:
                        if other is u:
                            continue
                        oname = ((other.get('content') or {}).get('question_image_url') or '').rsplit('/', 1)[-1]
                        if oname not in assets or oname.endswith('_full.webp'):
                            continue
                        crop = decode(assets[oname])
                        width = min(crop.shape[1], context.shape[1])
                        if abs(crop.shape[1] - context.shape[1]) > 1:
                            continue
                        head = crop[:min(crop.shape[0], 120), :width]
                        if (head < 120).mean() < 0.004:
                            continue  # too little ink to place reliably (answer space)
                        row, diff = recut.locate(head, context[:, :width])
                        bottom = min(context.shape[0], row + crop.shape[0]) if row is not None else None
                        # Only a task: the matched rows hold that part's marks allocation. A part's
                        # crop can begin with a figure printed for the whole question (1PH0 June
                        # 2023 2F Q6, Figure 13), which the context must keep.
                        if row is not None and diff <= 6 and has_marks(context[row:bottom]):
                            cuts.append((row, bottom, other['question_id']))
                    if not cuts:
                        continue
                    keep = np.ones(context.shape[0], bool)
                    for top, bottom, _ in cuts:
                        keep[max(0, top - 4):bottom] = False
                    new = context[keep]
                    done.append(f"{u['question_id']} {u.get('part_label')}: removed {', '.join(c[2] for c in cuts)} ({context.shape[0]} -> {new.shape[0]} rows)")
                    if a.dry_run:
                        continue
                    pv['context_siblings_cut_by_pixels'] = [c[2] for c in cuts]
                    shared = sum(1 for q in pack['questions'] if (q.get('context') or {}).get('stem_image_url') == url) > 1
                    if new.shape[0] < 6 or not recut.inky(new):
                        u['context'].pop('stem_image_url')  # nothing but other parts' tasks
                        if not shared:
                            assets.pop(name, None)
                        continue
                    if shared:  # give this part its own image; the others keep theirs
                        name = f"{u['question_id'].split('_')[-2]}_{u['question_id'].split('_')[-1]}_context.webp"
                        u['context']['stem_image_url'] = url.rsplit('/', 1)[0] + '/' + name
                    buf = io.BytesIO()
                    Image.fromarray(new).save(buf, format='WEBP', lossless=True)
                    data = buf.getvalue()
                    assets[name] = {'sha256': hashlib.sha256(data).hexdigest(), 'base64': base64.b64encode(data).decode()}
            if catalogue is not None and not a.dry_run and any(l.startswith(path.stem) for l in done):
                path.write_text(json.dumps(pack, ensure_ascii=False, indent=2) + '\n')
                newline = '\n' if cat_path.read_text().endswith('\n') else ''
                cat_path.write_text(json.dumps(catalogue, separators=(',', ':')) + newline)
    print(f"{len(done)} contexts {'would be ' if a.dry_run else ''}cut")
    for line in done:
        print(' ', line)


if __name__ == '__main__':
    main()
