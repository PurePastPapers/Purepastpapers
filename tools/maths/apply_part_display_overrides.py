#!/usr/bin/env python3
"""Apply reviewed Edexcel Maths display corrections using checksum-matched Pearson PDFs."""
import argparse
import base64
import hashlib
import json
import re
from pathlib import Path
from tempfile import TemporaryDirectory

ROOT = Path(__file__).resolve().parents[2]
OVERRIDES = ROOT / 'data/imports/maths/part-display-overrides.json'
REPLACED_REASONS = {
    'builds on the previous answer',
    'earlier "show that" result',
    'names an earlier part',
}


def find_source(sources, paper, digest):
    for path in (sources / f'{digest}.pdf', sources / f'{paper}-qp.pdf'):
        if path.is_file() and hashlib.sha256(path.read_bytes()).hexdigest() == digest:
            return path
    return None


def apply_overrides(sources, renderer_type, root=ROOT, paper_ids=None, require_sources=False):
    reviewed = json.loads((root / OVERRIDES.relative_to(ROOT)).read_text())
    by_paper = {}
    for qid, entry in reviewed.items():
        paper = qid.rsplit('_Q', 1)[0]
        by_paper.setdefault(paper, {})[qid] = entry

    applied = 0
    missing = []
    with TemporaryDirectory() as output:
        for paper, entries in by_paper.items():
            if paper_ids is not None and paper not in paper_ids:
                continue
            pack_path = root / f'data/packs/maths/{paper}.json'
            if not pack_path.exists():
                continue
            digest = next(iter(entries.values()))['source_sha256']
            source = find_source(sources, paper, digest)
            if source is None:
                missing.append(paper)
                continue
            pack = json.loads(pack_path.read_text())
            catalogue_path = root / f'data/maths-assets/{paper}.json'
            catalogue_text = catalogue_path.read_text()
            catalogue = json.loads(catalogue_text)
            assets = catalogue['assets']
            renderer = renderer_type(str(source))
            old_stems = set()

            def render(name, regions, offset):
                output_path = Path(output) / name
                adjusted = [{**item, 'page': item['page'] + offset} for item in regions]
                renderer.render(adjusted, output_path)
                data = output_path.read_bytes()
                assets[name] = {
                    'sha256': hashlib.sha256(data).hexdigest(),
                    'base64': base64.b64encode(data).decode('ascii'),
                }
                return f'assets/maths/{paper}/{name}'

            for question in pack['questions']:
                qid = question['question_id']
                if qid not in entries:
                    continue
                entry = entries[qid]
                pv = question['provenance']
                if pv['question_source_sha256'] != entry['source_sha256']:
                    raise ValueError(f'Source changed for {qid}')
                offset = pv['question_page_offset']
                short_id = qid.removeprefix(f'{paper}_')
                context = question.setdefault('context', {})
                if 'source_regions' in entry:
                    pv['source_regions'] = entry['source_regions']
                    own_name = question['content']['question_image_url'].rsplit('/', 1)[-1]
                    question['content']['question_image_url'] = render(own_name, entry['source_regions'], offset)
                old_stem = context.get('stem_image_url')
                if old_stem:
                    old_stems.add(old_stem.rsplit('/', 1)[-1])
                regions = entry['context_regions']
                if regions:
                    context['stem_image_url'] = render(f'{short_id}_context.webp', regions, offset)
                    pv['context_regions'] = regions
                    pv['context_regions_refined'] = regions
                else:
                    context.pop('stem_image_url', None)
                    pv.pop('context_regions', None)
                    pv.pop('context_regions_refined', None)
                if entry.get('figures'):
                    context['figures'] = [{
                        'label': figure['label'],
                        'source': 'paper',
                        'image_url': render(f'{short_id}_figure_{index}.webp', [figure['region']], offset),
                    } for index, figure in enumerate(entry['figures'], 1)]
                denied = set(entry.get('remove_dependencies', []))
                if denied:
                    remaining = [dep for dep in question.get('depends_on_question_ids', []) if dep not in denied]
                    if remaining:
                        question['depends_on_question_ids'] = remaining
                    else:
                        question.pop('depends_on_question_ids', None)
                    for key in ('context_named_parts', 'dependency_detected'):
                        existing = pv.get(key)
                        if existing:
                            if isinstance(existing, dict):
                                kept = {key: reason for key, reason in existing.items() if key not in denied}
                            else:
                                kept = [dep for dep in existing if dep not in denied]
                            if kept:
                                pv[key] = kept
                            else:
                                pv.pop(key)
                    if not pv.get('dependency_detected'):
                        pv.pop('dependency_detected_on', None)
                    if pv.get('context_from_linked_part') in denied:
                        pv.pop('context_from_linked_part')
                    if not remaining and 'context_reasons' in pv:
                        pv['context_reasons'] = [reason for reason in pv['context_reasons'] if reason not in REPLACED_REASONS]
                pv['part_display_review'] = entry['review']
                pv['part_display_review_source'] = entry['source_sha256']
                applied += 1

            pack_text = json.dumps(pack, ensure_ascii=False, indent=2) + '\n'
            referenced = set(re.findall(rf'assets/maths/{paper}/([A-Za-z0-9_]+\.webp)', pack_text))
            for name in old_stems - referenced:
                assets.pop(name, None)
            pack_path.write_text(pack_text)
            newline = '\n' if catalogue_text.endswith('\n') else ''
            catalogue_path.write_text(json.dumps(catalogue, ensure_ascii=False, separators=(',', ':')) + newline)

    if missing and require_sources:
        raise ValueError(f'Missing checksum-matched Pearson PDFs for {", ".join(missing)}')
    return applied, missing


if __name__ == '__main__':
    from render import SourceRenderer

    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--sources', type=Path, required=True)
    parser.add_argument('--root', type=Path, default=ROOT)
    args = parser.parse_args()
    count, _ = apply_overrides(args.sources, SourceRenderer, args.root, require_sources=True)
    print(f'Regenerated {count} reviewed Maths part displays')
