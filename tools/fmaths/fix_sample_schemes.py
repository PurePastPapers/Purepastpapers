#!/usr/bin/env python3
"""Apply reviewed scheme boundaries where SAM rows defeat automatic matching.

Run after tools/parts/refine.py for each rebuilt sample pack. The coordinates are
physical pages of the prepared mark scheme, in points from the top of the page.
"""
import argparse
import base64
import hashlib
import json
import sys
import tempfile
from pathlib import Path

import fitz

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'tools/maths'))
from render import SourceRenderer

# Boundaries account for marked alternatives, continued marking notes, nested
# references and shared left cells. Rows are (page, top, bottom), with optional
# left/right bounds when a source diagram crosses multiple mark cells.
SCHEME_ROWS = {
    'EDX_8FM0_SAMPLE_01': {
        ('1', '(b)', 2): [(1, 101, 117), (1, 281, 415), (1, 554, 657)],
        ('6', '(c)', 5): [(7, 95, 114), (7, 535, 677), (8, 361, 464)],
        ('7', '(e)', 1): [(9, 95, 114), (9, 537, 705), (10, 427, 484)],
        ('9', '(a)', 7): [(12, 94, 502), (13, 94, 775), (14, 303, 669), (15, 92, 293)],
    },
    'EDX_8FM0_SAMPLE_21': {
        ('4', '(a)', 4): [(4, 94, 449), (5, 480, 721)],
        ('4', '(b)', 5): [(4, 94, 114), (4, 450, 654), (5, 94, 371), (6, 79, 400)],
        ('5', '(c)', 8): [(7, 94, 114), (7, 297, 564), (8, 81, 750), (9, 256, 714), (10, 92, 329)],
    },
    'EDX_8FM0_SAMPLE_27': {
        ('3', '(a)', 3): [(4, 78, 102), (4, 102, 296, 76, 454),
                         (4, 172, 236, 456, 537), (4, 410, 468)],
        ('3', '(b)', 4): [(4, 78, 102), (4, 102, 296, 76, 454),
                         (4, 270, 298, 456, 537), (4, 316, 393), (4, 470, 553)],
    },
    'EDX_9FM0_SAMPLE_02': {
        ('3', '(i)(a)', 2): [(3, 82, 161), (4, 94, 155)],
        ('3', '(i)(b)', 4): [(3, 82, 101), (3, 161, 423), (4, 155, 230)],
        ('3', '(ii)', 6): [(3, 82, 101), (3, 423, 725), (4, 230, 338)],
        ('6', '(b)', 7): [(7, 82, 101), (7, 400, 770), (8, 82, 662), (9, 220, 524)],
    },
    'EDX_9FM0_SAMPLE_3A': {
        ('3', '(c)', 2): [(3, 82, 101), (3, 439, 517), (4, 337, 407)],
        ('6', '(d)', 2): [(9, 82, 101), (9, 487, 580), (10, 331, 390)],
        ('8', '(a)', 6): [(12, 82, 740), (13, 553, 736), (14, 80, 297)],
    },
    'EDX_9FM0_SAMPLE_4F': {
        ('7', '(b)', 2): [(10, 82, 101), (10, 425, 528), (11, 519, 574)],
        ('7', '(c)', 5): [(11, 82, 367), (11, 577, 647)],
    },
    'EDX_9FM0_SAMPLE_4A': {
        ('4', '(i)', 4): [(4, 82, 225), (5, 98, 179)],
        ('4', '(ii)(a)', 3): [(4, 82, 101), (4, 227, 313), (5, 179, 232)],
        ('4', '(ii)(b)', 4): [(4, 82, 101), (4, 316, 438), (5, 232, 298)],
        ('4', '(ii)(c)', 2): [(4, 82, 101), (4, 441, 543), (5, 298, 340)],
    },
}


# Pearson's printed tariffs disagree between the question paper and mark scheme
# for these two parts. The printed question-paper marks control saved marks.
SCHEME_TARIFFS = {'EDX_9FM0_SAMPLE_4F': {('7', '(b)', 2): 3, ('7', '(c)', 5): 4}}


def load(path):
    return json.loads(path.read_text())


def fix_schemes(repo, cache):
    data = repo / 'data'
    inventory = load(data / 'imports/fmaths/inventory/fmaths-sample-inventory.json')
    by_id = {row['paper_id']: row for row in inventory['papers']}
    count = 0
    for paper_id, reviews in SCHEME_ROWS.items():
        pack_path = data / 'packs/fmaths' / f'{paper_id}.json'
        if not pack_path.exists():
            continue
        expected = by_id[paper_id]['documents']['mark_scheme']['cache_sha256']
        source = cache / f'{expected}.pdf'
        if hashlib.sha256(source.read_bytes()).hexdigest() != expected:
            raise ValueError(f'Prepared sample scheme changed: {paper_id}')
        cat_path = data / 'fmaths-assets' / f'{paper_id}.json'
        pack, catalogue = load(pack_path), load(cat_path)
        pending = set(reviews)
        with fitz.open(source) as pdf, tempfile.TemporaryDirectory() as temp:
            renderer = SourceRenderer(source)
            for unit in pack['questions']:
                key = (unit['question_number'], unit.get('part_label', ''), unit['marks'])
                if key not in reviews:
                    continue
                pending.remove(key)
                provenance = unit['provenance']
                if provenance['scheme_source_sha256'] != expected:
                    raise ValueError(f"Source scheme mismatch for {unit['question_id']}")
                if unit['scheme_scope'] == 'part' and provenance.get('part_scheme_review') != 'reviewed_sample_source_rows':
                    continue
                regions = []
                for number, top, bottom, *bounds in reviews[key]:
                    w, h = pdf[number - 1].rect.width, pdf[number - 1].rect.height
                    left, right = bounds or (60, w - 45)
                    regions.append({'page': number, 'bbox': [left/w, top/h, right/w, bottom/h]})
                name = unit['question_id'].removeprefix(paper_id + '_') + '_scheme.webp'
                path = Path(temp) / name
                renderer.render(regions, path)
                payload = path.read_bytes()
                catalogue['assets'][name] = {'sha256': hashlib.sha256(payload).hexdigest(),
                    'base64': base64.b64encode(payload).decode('ascii')}
                full_name = f"Q{int(unit['question_number']):02}_scheme.webp"
                unit['content']['mark_scheme_image_url'] = f'assets/fmaths/{paper_id}/{name}'
                unit.setdefault('context', {})['full_scheme_image_url'] = f'assets/fmaths/{paper_id}/{full_name}'
                unit['scheme_scope'] = 'part'
                unit['scheme_question_number'] = unit['question_number'] + key[1]
                provenance['part_scheme_regions'] = regions
                scheme_marks = SCHEME_TARIFFS.get(paper_id, {}).get(key)
                if scheme_marks is None:
                    provenance['part_scheme_check'] = 'verified'
                else:
                    provenance['part_scheme_check'] = 'reference_matched'
                    provenance['part_scheme_tariff_discrepancy'] = {
                        'question_paper_marks': unit['marks'], 'mark_scheme_marks': scheme_marks,
                    }
                    unit['content']['mark_scheme_html'] = (
                        f'<p>The sample question paper prints {unit["marks"]} marks for this part. '
                        f'Pearson’s sample mark scheme allocates {scheme_marks}. '
                        'The mark picker uses the question-paper tariff.</p>'
                    )
                provenance['part_scheme_review'] = 'reviewed_sample_source_rows'
                count += 1
        if pending:
            raise ValueError(f'{paper_id}: reviewed references missing: {sorted(pending)}')
        pack_path.write_text(json.dumps(pack, ensure_ascii=False, indent=2) + '\n')
        cat_path.write_text(json.dumps(catalogue, separators=(',', ':')) + '\n')
    return count


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--sources', type=Path, required=True, help='Prepared PDF files named by SHA-256')
    parser.add_argument('--repo', type=Path, default=ROOT)
    args = parser.parse_args()
    print(f'Rendered {fix_schemes(args.repo, args.sources)} reviewed sample part schemes')


if __name__ == '__main__':
    main()
