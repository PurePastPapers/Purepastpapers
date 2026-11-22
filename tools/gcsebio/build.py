#!/usr/bin/env python3
"""Build only reviewed, reconciled source-rendered GCSE Biology 1BI0 / Combined Science 1SC0 packs.

Adapted from tools/gcsemaths/build.py. Reviews tag official biology statement codes
(1.6, 2.10B, 7.14 ...); the build maps them to runtime leaves EDX_GCSE_BIOL_OFF_<code>
(1BI0) or EDX_GCSE_COMBSCI_BIO_<code> (1SC0). Every unit keeps its paper's tier and
qualification: Foundation units may not tag Higher-only statements and 1SC0 units may
not tag separate-Biology-only (B) statements.
"""
import argparse
import concurrent.futures
import hashlib
import html
import json
import re
from collections import Counter, defaultdict, deque
from pathlib import Path
import pdfplumber
from render import SourceRenderer
from schemes import scheme_regions
from display_reviews import whole_scheme_review

PREFIX = {'1BI0': 'EDX_GCSE_BIOL_OFF_', '1SC0': 'EDX_GCSE_COMBSCI_BIO_'}
NAMES = {'1BI0': 'Biology', '1SC0': 'Combined Science'}


def write_json(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n')


def clip(regions, start, end):
    output = []
    for region in regions:
        page, box = region['page'], list(region['bbox'])
        if start[0] <= page <= end[0]:
            if page == start[0]: box[1] = max(box[1], start[1])
            if page == end[0]: box[3] = min(box[3], end[1])
            if box[3] - box[1] > .005: output.append({'page': page, 'bbox': box})
    return output


def build_paper(paper, candidate, review, sources, asset_dir, repo, valid_ids, higher_only):
    qual = paper['qualification_code']; SUBJECT = paper['subject_id']
    sid = lambda code: PREFIX[qual] + code
    if review.get('reviewer_type') != 'model' or review.get('source_sha256') != candidate['source_sha256']:
        raise ValueError('Review identity/checksum mismatch')
    by_number = {str(q['number']): q for q in review['questions']}
    if set(by_number) != {q['number'] for q in candidate['questions']}:
        raise ValueError('Not every source question has a review')
    if candidate['total_marks'] != paper['max_marks']:
        raise ValueError('Question-paper mark total mismatch')
    qp = sources / (paper['paper_id'] + '__question_paper.pdf')
    ms = sources / (paper['paper_id'] + '__mark_scheme.pdf')
    if hashlib.sha256(qp.read_bytes()).hexdigest() != candidate['source_sha256']:
        raise ValueError('Question source revision mismatch')
    ms_sha = hashlib.sha256(ms.read_bytes()).hexdigest()
    if ms_sha != paper['documents']['mark_scheme']['sha256']:
        # Official samples are page ranges of a collation: the private cache must be
        # the recorded faithful extraction of the recorded original source.
        manifest_path = sources/'source-page-provenance.json'
        manifest = json.loads(manifest_path.read_text())['records'] if manifest_path.exists() else []
        derivation = next((item for item in manifest if item['paper_id'] == paper['paper_id'] and item['kind'] == 'mark_scheme'), None)
        if not derivation or derivation['cache_sha256'] != ms_sha or derivation['original_source_sha256'] != paper['documents']['mark_scheme']['sha256']:
            raise ValueError('Scheme source revision mismatch')
    schemes = scheme_regions(ms, len(candidate['questions']))
    schemes = {number: whole_scheme_review(paper['paper_id'], ms_sha, number, regions)
               for number, regions in schemes.items()}
    renderer, scheme_renderer = SourceRenderer(qp), SourceRenderer(ms)
    with pdfplumber.open(qp) as doc:
        sizes = [(p.cropbox[2] - p.cropbox[0], p.cropbox[3] - p.cropbox[1]) for p in doc.pages]
    records = []
    for question in candidate['questions']:
        checked = by_number[question['number']]
        raw_parts = question['parts']
        expected = Counter(p['part_label'] for p in raw_parts)
        actual = Counter(label for unit in checked['units'] for label in unit['parts'])
        if expected != actual:
            raise ValueError(f"Q{question['number']}: reviewed part coverage mismatch")
        original = defaultdict(deque)
        for part in raw_parts: original[part['part_label']].append(part)
        # Shared source stem precedes the first marked part. Source equations are
        # always pixels; no extraction text is substituted for original wording.
        first = raw_parts[0].get('start')
        prefix = clip(question['regions'], (0, 0), (first['page'], max(0, (first['top'] - 4) / sizes[first['page']-1][1]))) if first else []
        prefix.extend(r for r in question['regions'] if r.get('shared_figure'))
        root = asset_dir / paper['paper_id']
        full_image = root / f"Q{int(question['number']):02}_full.webp"
        renderer.render(question['regions'], full_image)
        scheme_image = root / f"Q{int(question['number']):02}_scheme.webp"
        scheme_renderer.render(schemes[question['number']], scheme_image)
        stem_image = root / f"Q{int(question['number']):02}_stem.webp"
        if prefix: renderer.render(prefix, stem_image)
        def part_start(part):
            # From the part's first label (its stem), else just after the previous tariff.
            index = raw_parts.index(part)
            begin = part.get('start')
            if begin:
                return (begin['page'], max(0, begin['top'] - 4) / sizes[begin['page'] - 1][1])
            if index == 0:
                return (question['regions'][0]['page'], question['regions'][0]['bbox'][1])
            previous = raw_parts[index - 1]
            return (previous['page'], (previous['bottom'] + 7) / sizes[previous['page'] - 1][1])

        def part_end(part):
            # Up to the next part's stem, so data printed after a tariff stays with its part.
            index = raw_parts.index(part)
            if index + 1 < len(raw_parts):
                following = raw_parts[index + 1]
                if following.get('start') and (following['start']['page'], following['start']['top']) > (part['page'], part['bottom']):
                    return part_start(following)
                return (part['page'], (part['bottom'] + 7) / sizes[part['page'] - 1][1])
            last = question['regions'][-1]
            return (last['page'], last['bbox'][3])
        for ui, unit in enumerate(checked['units'], 1):
            if unit.get('review_status') != 'model_reviewed':
                raise ValueError(f"Q{question['number']}: unresolved unit review")
            primary = [sid(n) for n in unit['statements']]
            crossover = [sid(n) for n in unit.get('prerequisites', []) if sid(n) not in primary]
            if not primary or any(tag not in valid_ids for tag in primary + crossover):
                raise ValueError(f"Q{question['number']}: invalid statement tags {primary + crossover}")
            if paper['tier'] == 'Foundation' and any(tag in higher_only for tag in primary + crossover):
                raise ValueError(f"Q{question['number']}: Foundation unit tagged with Higher-only content")
            chosen = [original[label].popleft() for label in unit['parts']]
            marks = sum(p['marks'] for p in chosen)
            whole = len(chosen) == len(raw_parts)
            regions = question['regions'] if whole else []
            if not whole:
                for part in chosen:
                    regions.extend(clip(question['regions'], part_start(part), part_end(part)))
            image = full_image if whole else root / f"Q{int(question['number']):02}_U{ui:02}.webp"
            if not whole: renderer.render(regions, image)
            rel = lambda path: path.relative_to(repo).as_posix()
            label = unit.get('display_part_label') or (' + '.join(unit['parts']) if len(unit['parts']) > 1 else unit['parts'][0])
            record = {
                'question_id': f"{paper['paper_id']}_Q{int(question['number']):02}_U{ui:02}",
                'parent_question_id': f"{paper['paper_id']}_Q{int(question['number']):02}",
                'source_type': 'real_past_paper', 'is_sample': False,
                'paper_id': paper['paper_id'], 'subject_id': SUBJECT, 'board': 'Edexcel',
                'level': 'GCSE', 'subject': NAMES[qual], 'science': 'Biology', 'tier': paper['tier'],
                'spec_code': qual, 'qualification_code': qual,
                'is_as': False, 'is_official_sample': bool(paper.get('is_sample')), 'subject_category': 'STEM',
                'year': paper['year'], 'series': paper['series'], 'component': paper['component'],
                'question_number': question['number'], 'marks': marks,
                'estimated_minutes': max(1, round(marks * paper['duration_minutes'] / paper['max_marks'])),
                'difficulty': unit['difficulty'], 'calculator': paper['calculator'],
                'official_statements': [str(n) for n in unit['statements']],
                'primary_spec_points': primary, 'crossover_spec_points': crossover,
                'preview_text': unit['summary'], 'include_in_custom_pool': True,
                'content': {'question_html': '', 'question_image_url': rel(image), 'mark_scheme_html': '', 'mark_scheme_image_url': rel(scheme_image)},
                # A whole single-unit question's scheme is exactly its own; only split units say "including other parts".
                'scheme_scope': 'whole_question' if whole and len(checked['units']) == 1 else 'full_question',
                'scheme_question_number': question['number'],
                'context': {'full_question_image_url': rel(full_image)} if not whole else {},
                'provenance': {'review_status': 'model_reviewed', 'reviewer_type': 'model',
                    'question_source_sha256': candidate['source_sha256'], 'scheme_source_sha256': ms_sha,
                    'original_question_source_sha256': paper['documents']['question_paper']['sha256'],
                    'original_scheme_source_sha256': paper['documents']['mark_scheme']['sha256'],
                    'question_page_offset': paper['documents']['question_paper'].get('source_pages_inclusive', [1])[0]-1,
                    'scheme_page_offset': paper['documents']['mark_scheme'].get('source_pages_inclusive', [1])[0]-1,
                    'scheme_regions': schemes[question['number']],
                    'source_regions': regions, 'original_parts': unit['parts'],
                    'original_tariff_indices': [raw_parts.index(part) for part in chosen],
                    'difficulty_basis': unit['difficulty_basis'],
                    'tier': paper['tier'],
                    'official_statements': [str(n) for n in unit['statements']], 'prerequisite_statements': [str(n) for n in unit.get('prerequisites', [])],
                    'context_basis': unit['context_basis'], 'qualification_code': paper['qualification_code']},
            }
            if label: record['part_label'] = label
            if any(p.get('source') == 'total_line' for p in chosen): record['question_type'] = 'multiple_choice'
            unit_prefix = prefix
            if not whole and (unit.get('context_basis') != 'independent' or unit.get('shared_source_parts')):
                first_chosen = min(chosen, key=lambda part: (part['page'], part['top']))
                begin = first_chosen.get('start')
                if begin:
                    boundary = part_start(first_chosen)
                    unit_prefix = clip(question['regions'], (0, 0), boundary)
                    unit_prefix.extend(r for r in question['regions'] if r.get('shared_figure') and r not in unit_prefix)
            context_image = stem_image
            if unit_prefix and unit_prefix != prefix:
                context_image = root / f"Q{int(question['number']):02}_U{ui:02}_context.webp"
                renderer.render(unit_prefix, context_image)
            if unit_prefix and not whole:
                record['context']['shared_stem_html'] = '<p>Original question information and preceding context. Only the selected unit is scored:</p><img data-math-image="'+rel(context_image)+'" alt="Shared source stem for question '+html.escape(question['number'])+'" />'
            records.append(record)
    if sum(r['marks'] for r in records) != paper['max_marks']:
        raise ValueError('Published unit marks do not reconcile to the component')
    component = paper['component']
    title = f"{paper['series']} {paper['year']} · {paper['component_title']}"
    if paper.get('is_sample'): title = f"Official sample · {paper['component_title']}"
    if paper.get('variant', 'standard') != 'standard': title += ' · '+paper['variant'].title()
    docs = paper['documents']
    runtime_paper = {'paper_id': paper['paper_id'], 'paper_type': 'real_past_paper', 'subject_id': SUBJECT,
        'board': 'Edexcel', 'level': 'GCSE', 'subject': NAMES[qual], 'science': 'Biology', 'tier': paper['tier'],
        'spec_code': qual, 'year': paper['year'], 'series': paper['series'],
        'paper_code': component, 'title': title, 'calculator': paper['calculator'], 'total_marks': paper['max_marks'],
        'duration_minutes': paper['duration_minutes'], 'duration_note': paper.get('duration_note'),
        'qualification_code': qual, 'is_as': False,
        'question_ids': [r['question_id'] for r in records], 'is_official_sample': bool(paper.get('is_sample')),
        'source_bundle_url': docs['question_paper']['url'] if paper.get('source_format') == 'zip' else None,
        'full_paper_pdf_url': (docs['question_paper']['url'] + ('#page='+str(docs['question_paper']['source_pages_inclusive'][0]) if docs['question_paper'].get('source_pages_inclusive') else '')) if paper.get('source_format') != 'zip' else None,
        'full_mark_scheme_pdf_url': (docs['mark_scheme']['url'] + ('#page='+str(docs['mark_scheme']['source_pages_inclusive'][0]) if docs['mark_scheme'].get('source_pages_inclusive') else '')) if paper.get('source_format') != 'zip' else None, 'official_source_url': docs['question_paper']['url'],
        'examiner_report_url': docs.get('examiner_report', {}).get('url')}
    return {'pack_id': paper['paper_id'].lower(), 'papers': [runtime_paper], 'questions': records}


def build_job(job):
    paper, candidate, review, sources, repo, valid, higher_only = job
    paper_id = paper['paper_id']
    if not review.exists() or not candidate.exists():
        return {'paper_id': paper_id, 'status': 'awaiting_review_or_source'}
    target = repo/'data/packs/gcsebio'/f'{paper_id}.json'
    signature = hashlib.sha256(b'gcsebio-build-v2' + candidate.read_bytes() + review.read_bytes()).hexdigest()
    try:
        if target.exists():
            existing = json.loads(target.read_text())
            if existing.get('build_signature') == signature:
                return {'paper_id': paper_id, 'status': 'built', 'units': len(existing['questions']), 'marks': sum(q['marks'] for q in existing['questions']), 'resumed': True}
        pack = build_paper(paper, json.loads(candidate.read_text()), json.loads(review.read_text()), sources, repo/'assets/gcsebio', repo, valid, higher_only)
        registry_path = repo/'data/imports/gcsebio/identities.json'
        if registry_path.exists():
            registry = json.loads(registry_path.read_text())['units']
            for unit in pack['questions']:
                identity = {'parent_question_id': unit['parent_question_id'],
                            'source_sha256': unit['provenance']['question_source_sha256'],
                            'original_tariff_indices': unit['provenance']['original_tariff_indices'],
                            'marks': unit['marks']}
                if unit['question_id'] in registry and registry[unit['question_id']] != identity:
                    raise ValueError('Published assessment identity changed; assign a new ID: '+unit['question_id'])
        pack['build_signature'] = signature
        write_json(target, pack)
        return {'paper_id': paper_id, 'status': 'built', 'units': len(pack['questions']), 'marks': sum(q['marks'] for q in pack['questions'])}
    except Exception as e:
        return {'paper_id': paper_id, 'status': 'needs_review', 'error': str(e)}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('inventory', type=Path)
    parser.add_argument('--sources', type=Path, required=True)
    parser.add_argument('--candidates', type=Path, required=True)
    parser.add_argument('--reviews', type=Path, required=True)
    parser.add_argument('--repo', type=Path, default=Path(__file__).resolve().parents[2])
    parser.add_argument('--only', nargs='*')
    args = parser.parse_args()
    repo = args.repo.resolve()
    valid, higher_only = set(), set()
    for subject in ('EDX_GCSE_BIOL_1BI0', 'EDX_GCSE_COMBSCI_1SC0'):
        spec = json.loads((repo/'data/specs'/f'{subject}.json').read_text())
        points = [p for s in spec['sections'] for t in s['topics'] for p in t['points'] if p['id'].startswith(tuple(PREFIX.values()))]
        valid |= {p['id'] for p in points}
        higher_only |= {p['id'] for p in points if p.get('tier') == 'Higher'}
    jobs = []
    only = set(args.only or [])
    for paper in json.loads(args.inventory.read_text())['papers']:
        if only and paper['paper_id'] not in only: continue
        candidate = args.candidates/(paper['paper_id']+'.json'); review = args.reviews/(paper['paper_id']+'.json')
        jobs.append((paper, candidate, review, args.sources, repo, valid, higher_only))
    status = []
    with concurrent.futures.ProcessPoolExecutor(max_workers=4) as pool:
        for result in pool.map(build_job, jobs):
            status.append(result)
            print(result, flush=True)
    write_json(repo/'data/imports/gcsebio'/f"{args.inventory.stem}-build-status.json", status)
    print('Built',sum(p['status']=='built' for p in status),'papers. Packs require index activation and browser verification.')
    for r in status:
        if r['status'] != 'built': print(r)


if __name__ == '__main__': main()
