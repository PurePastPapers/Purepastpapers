#!/usr/bin/env python3
"""Reapply reviewed standalone contexts after refining and linking Biology parts.

Run with --sources pointing to the official PDFs stored as <sha256>.pdf.
"""
import argparse
import base64
import hashlib
import importlib.util
import json
from pathlib import Path
from tempfile import TemporaryDirectory

import pypdfium2 as pdfium

ROOT = Path(__file__).resolve().parents[2]
REVIEWS = {
    'EDX_9BN0_2018_JUNE_03': {
        'sha': '19984bb747b4b8e107e4fd4244e4c88a6b7701c850f6b2f29c2bab44c7c9a02a',
        'parts': [
            ('Q01_U03', 'Q01_U02', (2, 113, 163), 'The gel electrophoresis task uses no PCR amplification result.'),
        ],
    },
    'EDX_9BN0_2025_JUNE_03': {
        'sha': 'debf8c08430918ba7b477a2da89be85ec46b3aeba432d6b6c81e9116b517383e',
        'parts': [
            ('Q02_U05', 'Q02_U04', (6, 83, 442), 'The investigation and graph supply the evidence for the conclusions.'),
            ('Q02_U06', 'Q02_U04', (6, 83, 442), 'The investigation and graph supply the results to explain.'),
        ],
    },
}


def read(path):
    return json.loads(path.read_text())


def review(paper_id, source, cases, renderer_class):
    if hashlib.sha256(source.read_bytes()).hexdigest() != source.stem:
        raise ValueError(f'Wrong official PDF for {paper_id}')
    pack_path = ROOT / 'data/packs/biology' / f'{paper_id}.json'
    catalogue_path = ROOT / 'data/biology-assets' / f'{paper_id}.json'
    pack = read(pack_path)
    catalogue = read(catalogue_path)
    units = {unit['question_id']: unit for unit in pack['questions']}
    document = pdfium.PdfDocument(str(source))
    renderer = renderer_class(str(source))
    with TemporaryDirectory() as temp:
        output = Path(temp) / 'context.webp'
        for suffix, former_suffix, geometry, reason in cases:
            unit = units[f'{paper_id}_{suffix}']
            former = f'{paper_id}_{former_suffix}'
            provenance = unit['provenance']
            if provenance['question_source_sha256'] != source.stem:
                raise ValueError(f'Source mismatch for {unit["question_id"]}')
            dependencies = unit.get('depends_on_question_ids', [])
            if set(dependencies) - {former}:
                raise ValueError(f'Unexpected dependency of {unit["question_id"]}')
            unit.pop('depends_on_question_ids', None)
            provenance.pop('dependency_detected', None)
            provenance.pop('dependency_detected_on', None)
            provenance.pop('context_from_linked_part', None)
            provenance.pop('context_includes_stem_image', None)
            provenance['dependency_review'] = reason

            context = unit['context']
            context.pop('shared_stem_html', None)
            page, top, bottom = geometry
            x1, _, x2, _ = provenance['source_regions'][0]['bbox']
            page_box = document[page - 1].get_mediabox()
            height = page_box[3] - page_box[1]
            regions = [{'page': page, 'bbox': [x1, round(top / height, 6), x2, round(bottom / height, 6)]}]
            provenance['context_regions'] = regions
            provenance['context_reasons'] = ['reviewed unscored context']
            name = f'{suffix}_context.webp'
            context['stem_image_url'] = f'assets/biology/{paper_id}/{name}'
            renderer.render(regions, output)
            data = output.read_bytes()
            catalogue['assets'][name] = {
                'sha256': hashlib.sha256(data).hexdigest(),
                'base64': base64.b64encode(data).decode(),
            }
    text = json.dumps(pack, ensure_ascii=False, indent=2) + '\n'
    catalogue['assets'] = {name: asset for name, asset in catalogue['assets'].items()
                           if f'assets/biology/{paper_id}/{name}' in text}
    pack_path.write_text(text)
    catalogue_path.write_text(json.dumps(catalogue, separators=(',', ':')) + '\n')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--sources', type=Path, required=True)
    args = parser.parse_args()
    render_spec = importlib.util.spec_from_file_location('maths_render', ROOT / 'tools/maths/render.py')
    render = importlib.util.module_from_spec(render_spec)
    render_spec.loader.exec_module(render)
    for paper_id, reviewed in REVIEWS.items():
        review(paper_id, args.sources / (reviewed['sha'] + '.pdf'), reviewed['parts'], render.SourceRenderer)


if __name__ == '__main__':
    main()
