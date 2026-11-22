#!/usr/bin/env python3
"""Re-render scored and adjacent source regions from reviewed source geometry."""
import argparse
import hashlib
import json
import re
import tempfile
from collections import defaultdict
from pathlib import Path

from restore_lead_ins import ROOT, SourceRenderer, asset_name, store_crop


def read(path):
    return json.loads(path.read_text())


def bound(region, key, value):
    index = 1 if key == 'top' else 3
    region['bbox'][index] = value
    if not 0 <= region['bbox'][1] < region['bbox'][3] <= 1:
        raise ValueError(f'Invalid reviewed crop bounds: {region}')


def restore_stem(unit, regions, renderer, assets, temporary, pid):
    provenance = unit['provenance']
    context = unit.setdefault('context', {})
    provenance['context_regions'] = regions
    provenance.pop('context_includes_stem_image', None)
    if not regions:
        context.pop('stem_image_url', None)
        return
    name = asset_name(unit).removesuffix('.webp') + '_reviewed_stem.webp'
    store_crop(renderer, regions, assets, temporary / name)
    context['stem_image_url'] = f'assets/fmaths/{pid}/{name}'


def patch_paper(pid, rows, sources, temporary):
    pack_path = ROOT / 'data/packs/fmaths' / f'{pid}.json'
    catalogue_path = ROOT / 'data/fmaths-assets' / f'{pid}.json'
    pack, catalogue = read(pack_path), read(catalogue_path)
    units = {q['question_id']: q for q in pack['questions']}
    assets = catalogue['assets']
    source_sha = rows[0]['sha256']
    source = sources / f'{source_sha}.pdf'
    if hashlib.sha256(source.read_bytes()).hexdigest() != source_sha:
        raise ValueError(f'{pid}: source revision changed')
    renderer = SourceRenderer(source)
    scored = set()
    for row in rows:
        uid = row['id']
        q = units[uid]
        p = q['provenance']
        if p['question_source_sha256'] != source_sha or row['sha256'] != source_sha:
            raise ValueError(f'{uid}: part source revision changed')
        if 'stem_regions' in row:
            restore_stem(q, row['stem_regions'], renderer, assets, temporary, pid)
        if 'normalized_top' in row:
            first = p['source_regions'][0]
            if first['page'] != row['page']:
                raise ValueError(f'{uid}: reviewed part starts on a different page')
            old = first['bbox'][1]
            top = row['normalized_top'] if row.get('set_top_exactly') else min(old, row['normalized_top'])
            if abs(top - old) > .045:
                raise ValueError(f'{uid}: unexpected current crop boundary')
            bound(first, 'top', top)
            if q.get('context', {}).get('stem_image_url') and not p.get('context_includes_stem_image'):
                context = []
                for region in p.get('context_regions', []):
                    if region['page'] != first['page'] or not top < region['bbox'][3] <= old + .02:
                        context.append(region)
                        continue
                    if region['bbox'][1] < top - .004:
                        context.append({**region, 'bbox': region['bbox'][:3] + [top]})
                if context != p.get('context_regions', []):
                    restore_stem(q, context, renderer, assets, temporary, pid)
            scored.add(uid)
        if 'normalized_bottom' in row:
            last = p['source_regions'][-1]
            if last['page'] != row['page'] or abs(last['bbox'][3] - row['normalized_bottom']) > .06:
                raise ValueError(f'{uid}: reviewed part end moved')
            bound(last, 'bottom', row['normalized_bottom'])
            scored.add(uid)
        if previous := row.get('previous_trim'):
            earlier = units[previous['id']]
            if earlier['parent_question_id'] != q['parent_question_id']:
                raise ValueError(f'{uid}: earlier part belongs to another question')
            last = earlier['provenance']['source_regions'][-1]
            if last['page'] != previous['page'] or abs(last['bbox'][3] - previous['new_normalized_bottom']) > .045:
                raise ValueError(f"{earlier['question_id']}: reviewed earlier part end moved")
            bound(last, 'bottom', min(last['bbox'][3], previous['new_normalized_bottom']))
            scored.add(earlier['question_id'])
    for uid in sorted(scored):
        q = units[uid]
        p = q['provenance']
        store_crop(renderer, p['source_regions'] + p.get('required_insert_regions', []), assets,
                   temporary / asset_name(q))
    content = json.dumps(pack, ensure_ascii=False, indent=2) + '\n'
    names = sorted(set(re.findall(r'assets/fmaths/' + pid + r'/([A-Za-z0-9_]+\.webp)', content)))
    catalogue['assets'] = {name: assets[name] for name in names}
    pack_path.write_text(content)
    catalogue_path.write_text(json.dumps(catalogue, separators=(',', ':')) + '\n')
    print(pid, len(rows), flush=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--sources', type=Path, required=True)
    parser.add_argument('--plan', type=Path, required=True)
    parser.add_argument('--paper', action='append')
    args = parser.parse_args()
    grouped = defaultdict(list)
    for row in read(args.plan)['inline']:
        if not args.paper or row['paper_id'] in args.paper:
            grouped[row['paper_id']].append(row)
    with tempfile.TemporaryDirectory(prefix='fmaths-scored-regions-') as directory:
        for pid, rows in grouped.items():
            patch_paper(pid, rows, args.sources, Path(directory))


if __name__ == '__main__':
    main()
