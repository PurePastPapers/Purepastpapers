#!/usr/bin/env python3
"""Check staged Paper 2 assets, exact PDF-link fallbacks and published work IDs."""

from base64 import b64decode
from hashlib import sha256
from io import BytesIO
import json
from pathlib import Path
import re
import sys

from PIL import Image


def main(output, proof_path, spec_path):
    proof = json.loads(proof_path.read_text())
    spec = json.loads(spec_path.read_text())
    ids = {point['id'] for section in spec['sections'] for topic in section['topics'] for point in topic['points']}
    prompt_links, scheme_links, asset_count = [], [], 0
    for paper_id, evidence in proof.items():
        pack_path = output / 'data' / 'packs' / 'spanish' / f'{paper_id}.json'
        pack_text = pack_path.read_text()
        pack = json.loads(pack_text)
        catalogue = json.loads((output / 'data' / 'spanish-assets' / pack_path.name).read_text())['assets']
        assert set(catalogue) == set(re.findall(r'assets/spanish/[^/]+/([A-Za-z0-9_]+\.webp)', pack_text))
        for asset in catalogue.values():
            encoded = b64decode(asset['base64'], validate=True)
            image = Image.open(BytesIO(encoded))
            assert image.format == 'WEBP' and image.size == (asset['width'], asset['height'])
            darkest, lightest = image.convert('L').getextrema()
            assert darkest <= 32 and lightest == 255
            assert sha256(encoded).hexdigest() == asset['sha256']
        asset_count += len(catalogue)
        for question, option in zip(pack['questions'], evidence['options'], strict=True):
            label = option['label']
            context = question['context']
            content = question['content']
            assert question['question_number'] == label
            assert question['marks'] == 40
            assert question['primary_spec_points'] == [option['work']['id']]
            assert option['work']['id'] in ids
            if context.get('official_resources'):
                [resource] = context['official_resources']
                assert resource['kind'] == 'question_pdf'
                assert resource['url'] == f"{evidence['question_paper']['url']}#page={option['question_pages'][0]}"
                assert not content['question_image_url'] and label in resource['label']
                prompt_links.append((paper_id, label))
            if context.get('official_scheme_required'):
                assert question['provenance']['scheme_source_url'] == f"{evidence['mark_scheme']['url']}#page={option['scheme_pages'][0]}"
                assert not content['mark_scheme_image_url']
                assert 'Assessment_criteria.webp' in content['mark_scheme_html']
                scheme_links.append((paper_id, label))
    print(f'{len(proof)} packs, {asset_count} verified assets, {len(prompt_links)} linked prompts, {len(scheme_links)} linked schemes.')
    print('Linked prompts:', prompt_links)
    print('Linked schemes:', scheme_links)


if __name__ == '__main__':
    main(*(Path(arg) for arg in sys.argv[1:]))
