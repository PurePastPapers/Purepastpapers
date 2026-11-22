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
    'EDX_8BN0_2022_JUNE_01': {
        'sha': '1a46b8b139ff91066211a0062cbe343af7b4ab7ad33403670d37d103c8863914',
        'parts': [
            ('Q06_U03', None, [], 'The task asks how elastic fibres work, independently of the earlier valve task.'),
        ],
    },
    'EDX_8BN0_2024_JUNE_01': {
        'sha': 'c4906dac7dac6b8cfdcc806f151c99be1f4fbef7dc1fe497325470c99b9eacc2',
        # Q7(d)(i) ends with option D. The later angioplasty diagram belongs to (d)(ii).
        'own_crop_bottom': {'Q07_U05': 337},
        'parts': [
            ('Q04_U02', None, [], 'Part (b) names both proteins and needs no transport question or table.'),
        ],
    },
    'EDX_9BN0_2017_JUNE_01': {
        'sha': 'd328fbbb6da0d2246c1fcdcfbc16cdfaf89e525fb1b9417c7198ba9536c55429',
        'parts': [
            ('Q10_U03', None, [(27, 36, 491), (28, 55, 280), (29, 55, 95)], 'Preserve the original population information, GBA allele frequencies and conclusion.'),
            ('Q10_U04', None, [], 'The speciation explanation uses no calculation from part (a).'),
        ],
    },
    'EDX_9BN0_2018_JUNE_03': {
        'sha': '19984bb747b4b8e107e4fd4244e4c88a6b7701c850f6b2f29c2bab44c7c9a02a',
        'parts': [
            ('Q01_U03', 'Q01_U02', [(2, 113, 163)], 'The gel electrophoresis task uses no PCR amplification result.'),
        ],
    },
    'EDX_9BN0_2019_JUNE_02': {
        'sha': '885a5c508039414a687bb72e7f38d4bb3ba067710af1464bbfdd36dd8518d247',
        'parts': [
            ('Q10_U04', None, [(27, 55, 634), (29, 55, 368), (30, 55, 292)], 'Preserve the group definitions and results of all three investigations.'),
        ],
    },
    'EDX_9BN0_2019_JUNE_03': {
        'sha': '5354ed07a6344383b64019b3c64052f16f2d216421bb11cbd33bcaecc8700268',
        'parts': [
            ('Q05_U02', None, [], 'The own crop includes the procedure and darkness prompt.'),
            ('Q05_U03', None, [], 'The own crop includes both graphs and the calculation prompt.'),
            ('Q05_U04', None, [(14, 58, 116)], 'The phenotype introduction supplies the definition of weary lettuce.'),
        ],
    },
    'EDX_9BN0_2020_OCTOBER_02': {
        'sha': 'f2a0fca77b00fd8488bf2b072f69d5ee4db87d2342bc9584407dba6c955d74e7',
        'parts': [
            ('Q10_U05', None, [(30, 85, 438)], 'The scatter graph is needed without the earlier respiration multiple choice question.'),
        ],
    },
    'EDX_9BN0_2025_JUNE_03': {
        'sha': 'debf8c08430918ba7b477a2da89be85ec46b3aeba432d6b6c81e9116b517383e',
        'parts': [
            ('Q02_U05', 'Q02_U04', [(6, 83, 442)], 'The investigation and graph supply the evidence for the conclusions.'),
            ('Q02_U06', 'Q02_U04', [(6, 83, 442)], 'The investigation and graph supply the results to explain.'),
        ],
    },
    'EDX_9BN0_SAMPLE_01': {
        'sha': '73446dfc2b07ab9445968b2ff782c111eff278440975c134bf4126d49ee8d085',
        'collation_sha': 'f5e4c6cdcefdc93de82238fc7c82e24bd2029fb249c4c559049bd35d8d7849f3',
        'page_offset': 10,
        'parts': [
            ('Q10_U02', None, [(22, 35.35, 551.2)], 'Preserve the method and results from the first experiment.'),
            ('Q10_U03', None, [(22, 35.35, 551.2)], 'Preserve the first experiment and omit its marked part (a)(i).'),
        ],
    },
    'EDX_9BN0_SAMPLE_03': {
        'sha': '75bb70fcbe1c3bd702ea2a790deb44eb90084044ac3f833c4bb86f70c2aa08de',
        'collation_sha': 'f5e4c6cdcefdc93de82238fc7c82e24bd2029fb249c4c559049bd35d8d7849f3',
        'page_offset': 138,
        'parts': [
            ('Q04_U03', None, [], 'The BMI calculation supplies its own values and formula.'),
            ('Q04_U04', None, [(15, 109, 151, 0.30, 0.70)], 'Preserve the printed BMI definition without the calculation task.'),
            ('Q04_U05', None, [], 'The BMI health risks task is independent of the earlier drug studies.'),
        ],
    },
}


def read(path):
    return json.loads(path.read_text())


def review(paper_id, source, reviewed, renderer_class):
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
        offset = reviewed.get('page_offset', 0) if source.stem != reviewed['sha'] else 0

        def put_image(name, regions):
            renderer.render([{**r, 'page': r['page'] + offset} for r in regions], output)
            data = output.read_bytes()
            catalogue['assets'][name] = {
                'sha256': hashlib.sha256(data).hexdigest(),
                'base64': base64.b64encode(data).decode(),
            }

        for suffix, bottom in reviewed.get('own_crop_bottom', {}).items():
            unit = units[f'{paper_id}_{suffix}']
            provenance = unit['provenance']
            if provenance['question_source_sha256'] != reviewed['sha']:
                raise ValueError(f'Source mismatch for {unit["question_id"]}')
            [region] = provenance['source_regions']
            page_box = document[region['page'] + offset - 1].get_mediabox()
            region['bbox'][3] = round(bottom / (page_box[3] - page_box[1]), 6)
            name = unit['content']['question_image_url'].rsplit('/', 1)[1]
            put_image(name, [region])

        for suffix, former_suffix, geometry, reason in reviewed['parts']:
            unit = units[f'{paper_id}_{suffix}']
            former = f'{paper_id}_{former_suffix}'
            provenance = unit['provenance']
            if provenance['question_source_sha256'] != reviewed['sha']:
                raise ValueError(f'Source mismatch for {unit["question_id"]}')
            dependencies = unit.get('depends_on_question_ids', [])
            if set(dependencies) - {former}:
                raise ValueError(f'Unexpected dependency of {unit["question_id"]}')
            unit.pop('depends_on_question_ids', None)
            provenance.pop('dependency_detected', None)
            provenance.pop('dependency_detected_on', None)
            provenance.pop('context_from_linked_part', None)
            provenance.pop('context_includes_stem_image', None)
            provenance['context_review'] = reason
            if former_suffix:
                provenance['dependency_review'] = reason

            context = unit['context']
            context.pop('shared_stem_html', None)
            if not geometry:
                context.pop('stem_image_url', None)
                provenance.pop('context_regions', None)
                provenance.pop('context_reasons', None)
                continue
            regions = []
            for page, top, bottom, *horizontal in geometry:
                frames = provenance.get('context_regions') or []
                original = next((r for r in frames if r['page'] == page), provenance['source_regions'][0])
                x1, x2 = horizontal or original['bbox'][::2]
                page_box = document[page + offset - 1].get_mediabox()
                height = page_box[3] - page_box[1]
                regions.append({'page': page, 'bbox': [x1, round(top / height, 6), x2, round(bottom / height, 6)]})
            provenance['context_regions'] = regions
            provenance['context_reasons'] = ['reviewed unscored context']
            name = f'{suffix}_context.webp'
            context['stem_image_url'] = f'assets/biology/{paper_id}/{name}'
            put_image(name, regions)
    text = json.dumps(pack, ensure_ascii=False, indent=2) + '\n'
    catalogue['assets'] = {name: asset for name, asset in catalogue['assets'].items()
                           if f'assets/biology/{paper_id}/{name}' in text}
    pack_path.write_text(text)
    catalogue_path.write_text(json.dumps(catalogue, separators=(',', ':')) + '\n')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--sources', type=Path, required=True)
    parser.add_argument('--paper', action='append', choices=sorted(REVIEWS))
    args = parser.parse_args()
    render_spec = importlib.util.spec_from_file_location('maths_render', ROOT / 'tools/maths/render.py')
    render = importlib.util.module_from_spec(render_spec)
    render_spec.loader.exec_module(render)
    for paper_id, reviewed in REVIEWS.items():
        if args.paper and paper_id not in args.paper:
            continue
        source = args.sources / (reviewed['sha'] + '.pdf')
        if not source.exists() and reviewed.get('collation_sha'):
            source = args.sources / (reviewed['collation_sha'] + '.pdf')
        review(paper_id, source, reviewed, render.SourceRenderer)


if __name__ == '__main__':
    main()
