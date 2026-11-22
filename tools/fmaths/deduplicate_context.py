#!/usr/bin/env python3
"""Reuse byte-identical Further Maths context images within each booklet."""
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
FIELDS = ('stem_image_url', 'lead_in_image_url')


def main():
    saved = 0
    for pack_path in sorted((ROOT / 'data/packs/fmaths').glob('*.json')):
        pid = pack_path.stem
        pack = json.loads(pack_path.read_text())
        catalogue_path = ROOT / 'data/fmaths-assets' / f'{pid}.json'
        catalogue = json.loads(catalogue_path.read_text())
        assets = catalogue['assets']
        canonical = {}
        changed = False
        for question in pack['questions']:
            context = question.get('context', {})
            for field in FIELDS:
                if not context.get(field):
                    continue
                url = context[field]
                name = url.rsplit('/', 1)[1]
                data = assets[name]
                selected = canonical.setdefault((field, data['sha256']), name)
                if selected != name:
                    if assets[selected]['base64'] != data['base64']:
                        raise ValueError(f'{pid}: equal hashes with different bytes')
                    context[field] = url.rsplit('/', 1)[0] + '/' + selected
                    changed = True
        if not changed:
            continue
        output = json.dumps(pack, ensure_ascii=False, indent=2) + '\n'
        referenced = set(re.findall(r'assets/fmaths/' + pid + r'/([A-Za-z0-9_]+\.webp)', output))
        saved += sum(len(asset['base64']) for name, asset in assets.items() if name not in referenced)
        catalogue['assets'] = {name: assets[name] for name in sorted(referenced)}
        pack_path.write_text(output)
        catalogue_path.write_text(json.dumps(catalogue, separators=(',', ':')) + '\n')
    print(f'{saved:,} bytes of duplicate encoded context images removed')


if __name__ == '__main__':
    main()
