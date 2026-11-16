#!/usr/bin/env python3
"""Build reviewed, reconciled, source-rendered Biology A (9BN0/8BN0) packs.

Adapted from tools/maths/build.py. Differences for Biology:
  * a unit's content year is derived from its reviewed tags: Year 13 when any
    required Topic 5-8 statement or Year 13 core practical is tagged, otherwise
    Year 12 (AS units are always Year 12); the basis is stored per unit;
  * official erratum pages issued with a paper are shown as context on the
    questions they name;
  * Paper 3 questions that use the pre-release scientific article carry the
    article pages as visibly unscored context (or an explicit note when the
    article is not publicly available);
  * crops end at each part's content bottom (see extract.py), so multiple-choice
    options, grids and answer tables printed after a tariff are kept.
"""
import argparse
import concurrent.futures
import hashlib
import html
import json
import re
import sys
from collections import Counter, defaultdict, deque
from pathlib import Path

import pdfplumber

import importlib.util

sys.path.insert(0, str(Path(__file__).resolve().parent))
from schemes import scheme_regions  # noqa: E402  (Biology adapter, this directory)

# The PDF renderer is subject-neutral; reuse the unchanged Maths module by path.
_spec = importlib.util.spec_from_file_location('qbank_render', Path(__file__).resolve().parents[1] / 'maths' / 'render.py')
_render = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_render)
_BaseRenderer = _render.SourceRenderer
WEBP_LIMIT = 16000  # WebP's hard limit is 16383 px per side


class SourceRenderer(_BaseRenderer):
    """The Maths renderer, falling back to a smaller (still lossless) scale when a
    long multi-page crop would exceed WebP's maximum height."""

    def __init__(self, path, scale=1.6):
        super().__init__(path, scale)
        self.path = path
        self.reduced = {}

    def render(self, regions, output):
        with pdfplumber.open(self.path) as doc:
            heights = {r['page']: doc.pages[r['page'] - 1].height for r in regions}
        height = sum((r['bbox'][3] - r['bbox'][1]) * heights[r['page']] * self.scale for r in regions) + 12 * (len(regions) - 1)
        if height <= WEBP_LIMIT:
            return super().render(regions, output)
        scale = self.scale * WEBP_LIMIT / height * 0.98
        self.reduced[str(output)] = round(scale, 3)
        return _BaseRenderer(self.path, scale).render(regions, output)

SUBJECT = 'EDX_ALEVEL_BIOL_9BN0'
SLUG = 'biology'
SIGNATURE = b'biology-build-v3'


def write_json(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n')


def clip(regions, start, end):
    output = []
    for region in regions:
        page, box = region['page'], list(region['bbox'])
        if start[0] <= page <= end[0]:
            if page == start[0]:
                box[1] = max(box[1], start[1])
            if page == end[0]:
                box[3] = min(box[3], end[1])
            if box[3] - box[1] > .005:
                output.append({'page': page, 'bbox': box})
    return output


def spec_index(repo):
    spec = json.loads((repo / 'data/specs' / f'{SUBJECT}.json').read_text())
    points = {}
    for section in spec['sections']:
        if section.get('legacy'):
            continue
        for topic in section['topics']:
            for point in topic['points']:
                points[point['id']] = {**point, 'kind': topic.get('kind', 'topic'), 'topic_code': topic['code']}
    return points


def content_year(tags, points, is_as):
    if is_as:
        return 12, 'AS (8BN0) papers assess Topics 1–4 only, so every AS unit is Year 12 content.'
    year13 = [points[t] for t in tags if points[t].get('introduced_year') == 13]
    if year13:
        codes = ', '.join(sorted({p['code'] for p in year13}))
        return 13, f'Requires Year 13 content (Topics 5–8 or their core practicals): {codes}.'
    return 12, 'Every tagged statement is Topics 1–4 (Year 12) content or a mathematical skill.'


def erratum_context(candidate, qp_path, sizes):
    """{question_number: [region, ...]} for official erratum pages naming that question."""
    result = defaultdict(list)
    if not candidate.get('erratum_pages'):
        return result
    with pdfplumber.open(qp_path) as doc:
        for page_number in candidate['erratum_pages']:
            text = doc.pages[page_number - 1].extract_text() or ''
            for number in sorted(set(re.findall(r'[Qq]uestions?\s+(\d{1,2})', text))):
                result[number].append({'page': page_number, 'bbox': [0.04, 0.03, 0.96, 0.97]})
    return result


def uses_article(question):
    return bool(re.search(r'scientific article|the article|in the article', question.get('text', ''), re.I))


def build_paper(paper, candidate, review, sources, asset_dir, repo, points):
    if review.get('reviewer_type') != 'model' or review.get('source_sha256') != candidate['source_sha256']:
        raise ValueError('Review identity/checksum mismatch')
    by_number = {str(q['number']): q for q in review['questions']}
    if set(by_number) != {q['number'] for q in candidate['questions']}:
        raise ValueError('Not every source question has a review')
    if candidate['total_marks'] != paper['max_marks']:
        raise ValueError('Question-paper mark total mismatch')
    pid = paper['paper_id']
    docs = paper['documents']
    qp = sources / f'{pid}__question_paper.pdf'
    ms = sources / f'{pid}__mark_scheme.pdf'
    if hashlib.sha256(qp.read_bytes()).hexdigest() != candidate['source_sha256'] or \
            candidate['source_sha256'] != docs['question_paper']['sha256']:
        raise ValueError('Question source revision mismatch')
    ms_sha = hashlib.sha256(ms.read_bytes()).hexdigest()
    if ms_sha != docs['mark_scheme']['sha256']:
        raise ValueError('Scheme source revision mismatch')
    schemes = scheme_regions(ms, len(candidate['questions']))
    renderer, scheme_renderer = SourceRenderer(qp), SourceRenderer(ms)
    with pdfplumber.open(qp) as doc:
        sizes = [(p.width, p.height) for p in doc.pages]
    errata = erratum_context(candidate, qp, sizes)
    root = asset_dir / pid
    rel = lambda path: path.relative_to(repo).as_posix()

    # Paper 3 pre-release scientific article: rendered once per booklet.
    article = docs.get('pre_release_article') or {}
    article_images = []
    if article.get('availability') == 'verified_public_pdf':
        article_path = sources / article['cache_name']
        if hashlib.sha256(article_path.read_bytes()).hexdigest() != article['sha256']:
            raise ValueError('Article source revision mismatch')
        article_renderer = SourceRenderer(article_path)
        with pdfplumber.open(article_path) as doc:
            count = len(doc.pages)
        for page in range(1, count + 1):
            image = root / f'ARTICLE_P{page:02}.webp'
            article_renderer.render([{'page': page, 'bbox': [0, 0, 1, 1]}], image)
            article_images.append(image)

    records = []
    for question in candidate['questions']:
        number = question['number']
        qn = f'Q{int(number):02}'
        checked = by_number[number]
        raw_parts = question['parts']
        expected = Counter(p['part_label'] for p in raw_parts)
        actual = Counter(label for unit in checked['units'] for label in unit['parts'])
        if expected != actual:
            raise ValueError(f'Q{number}: reviewed part coverage mismatch {dict(expected)} vs {dict(actual)}')
        original = defaultdict(deque)
        for part in raw_parts:
            original[part['part_label']].append(part)
        first = raw_parts[0].get('start')
        prefix = clip(question['regions'], (0, 0), (first['page'], max(0, (first['top'] - 4) / sizes[first['page'] - 1][1]))) if first else []
        prefix.extend(r for r in question['regions'] if r.get('shared_figure') and r not in prefix)
        full_image = root / f'{qn}_full.webp'
        renderer.render(question['regions'], full_image)
        scheme_image = root / f'{qn}_scheme.webp'
        scheme_renderer.render(schemes[number], scheme_image)
        stem_image = root / f'{qn}_stem.webp'
        if prefix:
            renderer.render(prefix, stem_image)
        erratum_image = None
        if errata.get(number):
            erratum_image = root / f'{qn}_erratum.webp'
            renderer.render(errata[number], erratum_image)
        article_needed = paper['component'] == '03' and paper['qualification_code'] == '9BN0' and uses_article(question)

        def part_start(part):
            index = raw_parts.index(part)
            if index == 0:
                return (question['regions'][0]['page'], question['regions'][0]['bbox'][1])
            previous = raw_parts[index - 1]
            begin = part.get('start')
            y = previous['bottom'] + 6
            if begin and begin['page'] == previous['page']:
                y = min(y, begin['top'] - 4)
            if begin and begin['page'] != previous['page']:
                return (begin['page'], (begin['top'] - 4) / sizes[begin['page'] - 1][1])
            return (previous['page'], y / sizes[previous['page'] - 1][1])

        for ui, unit in enumerate(checked['units'], 1):
            if unit.get('review_status') != 'model_reviewed':
                raise ValueError(f'Q{number}: unresolved unit review')
            primary, crossover = unit['primary_spec_points'], unit.get('crossover_spec_points', [])
            if not primary or any(tag not in points for tag in primary + crossover):
                raise ValueError(f'Q{number}: invalid spec tags {[t for t in primary + crossover if t not in points]}')
            if unit.get('difficulty') not in ('easy', 'medium', 'hard') or not unit.get('difficulty_basis'):
                raise ValueError(f'Q{number}: difficulty and basis required')
            if unit.get('context_basis') not in ('independent', 'shared_stem', 'grouped_dependency'):
                raise ValueError(f'Q{number}: invalid context_basis')
            chosen = [original[label].popleft() for label in unit['parts']]
            marks = sum(p['marks'] for p in chosen)
            whole = len(chosen) == len(raw_parts)
            regions = question['regions'] if whole else []
            if not whole:
                for part in chosen:
                    start = part_start(part)
                    end_y = part['bottom'] + 6
                    part_index = raw_parts.index(part)
                    if part_index + 1 < len(raw_parts):
                        next_start = raw_parts[part_index + 1].get('start')
                        if next_start and next_start['page'] == part['page']:
                            end_y = max(part['tariff_bottom'] + 1, min(end_y, next_start['top'] - 4))
                    regions.extend(r for r in clip(question['regions'], start, (part['page'], end_y / sizes[part['page'] - 1][1]))
                                   if r not in regions)
            image = full_image if whole else root / f'{qn}_U{ui:02}.webp'
            if not whole:
                renderer.render(regions, image)
            year, year_basis = content_year(primary + crossover, points, paper['is_as'])
            label = unit.get('display_part_label') or ('–'.join(unit['parts']) if len(unit['parts']) > 1 else unit['parts'][0])
            level = 'AS' if paper['is_as'] else 'A-Level'
            record = {
                'question_id': f'{pid}_{qn}_U{ui:02}', 'parent_question_id': f'{pid}_{qn}',
                'source_type': 'real_past_paper', 'is_sample': False,
                'paper_id': pid, 'subject_id': SUBJECT, 'board': 'Edexcel', 'level': level, 'subject': 'Biology',
                'spec_code': paper['qualification_code'], 'qualification_code': paper['qualification_code'],
                'is_as': paper['is_as'], 'is_official_sample': bool(paper.get('is_sample')), 'subject_category': 'STEM',
                'year': paper['year'], 'series': paper['series'], 'component': paper['component'],
                'question_number': number, 'marks': marks, 'estimated_minutes': max(1, round(marks * 1.2)),
                'difficulty': unit['difficulty'], 'introduced_year': year,
                'primary_spec_points': primary, 'crossover_spec_points': crossover,
                'preview_text': unit['summary'], 'include_in_custom_pool': True,
                'extended_response': any(p.get('extended_response') for p in chosen),
                'content': {'question_html': '', 'question_image_url': rel(image), 'mark_scheme_html': '',
                            'mark_scheme_image_url': rel(scheme_image)},
                'scheme_scope': 'full_question', 'scheme_question_number': number,
                'context': {'full_question_image_url': rel(full_image)} if not whole else {},
                'provenance': {
                    'review_status': 'model_reviewed', 'reviewer_type': 'model',
                    'question_source_sha256': candidate['source_sha256'], 'scheme_source_sha256': ms_sha,
                    'original_question_source_sha256': docs['question_paper']['sha256'],
                    'original_scheme_source_sha256': docs['mark_scheme']['sha256'],
                    'question_page_offset': 0, 'scheme_page_offset': 0,
                    'scheme_regions': schemes[number], 'source_regions': regions,
                    'original_parts': unit['parts'],
                    'original_tariff_indices': [raw_parts.index(part) for part in chosen],
                    'difficulty_basis': unit['difficulty_basis'], 'year_basis': year_basis,
                    'tag_basis': unit.get('tag_basis'),
                    'context_basis': unit['context_basis'], 'qualification_code': paper['qualification_code'],
                    'extraction_version': candidate['extraction_version'],
                },
            }
            if candidate.get('ocr_pages') and any(r['page'] in candidate['ocr_pages'] for r in regions):
                record['provenance']['positioning'] = 'ocr_assisted_image_only_source'
            if label:
                record['part_label'] = label
            unit_prefix = prefix
            if not whole and (unit['context_basis'] != 'independent' or unit.get('shared_source_parts')):
                first_chosen = min(chosen, key=lambda part: (part['page'], part['top']))
                if first_chosen.get('start'):
                    boundary = part_start(first_chosen)
                    unit_prefix = clip(question['regions'], (0, 0), boundary)
                    unit_prefix.extend(r for r in question['regions'] if r.get('shared_figure') and r not in unit_prefix)
            context_image = stem_image
            if unit_prefix and unit_prefix != prefix:
                context_image = root / f'{qn}_U{ui:02}_context.webp'
                renderer.render(unit_prefix, context_image)
            context_html = []
            if unit_prefix and not whole:
                context_html.append('<p>Original question information and preceding context. Only the selected unit is scored:</p>'
                                    f'<img data-math-image="{rel(context_image)}" alt="Shared source stem for question {html.escape(number)}" />')
            if erratum_image:
                context_html.append('<p>Official erratum notice issued with this paper (unscored context):</p>'
                                    f'<img data-math-image="{rel(erratum_image)}" alt="Official erratum notice for question {html.escape(number)}" />')
                record['context']['erratum_image_url'] = rel(erratum_image)
            if article_needed:
                # Rendered by the app from this structured record (see js/ui/question-view.js).
                if article_images:
                    record['context']['article'] = {
                        'title': article.get('title') or 'Pre-release scientific article',
                        'url': article['url'], 'sha256': article['sha256'],
                        'page_image_urls': [rel(p) for p in article_images], 'scored': False}
                else:
                    record['context']['article'] = {'availability': article.get('availability', 'not_listed'), 'scored': False}
            if context_html:
                record['context']['shared_stem_html'] = ''.join(context_html)
            records.append(record)
    if sum(r['marks'] for r in records) != paper['max_marks']:
        raise ValueError('Published unit marks do not reconcile to the component')
    level = 'AS' if paper['is_as'] else 'A-Level'
    title = f"{paper['series']} {paper['year']} · {level} Biology A Paper {int(paper['component'])}: {paper['component_title']}"
    if paper.get('is_sample'):
        title = f"Official sample · {level} Biology A Paper {int(paper['component'])}: {paper['component_title']}"
    runtime_paper = {
        'paper_id': pid, 'paper_type': 'real_past_paper', 'subject_id': SUBJECT, 'board': 'Edexcel', 'level': level,
        'subject': 'Biology', 'spec_code': paper['qualification_code'], 'year': paper['year'], 'series': paper['series'],
        'paper_code': paper['component'], 'title': title, 'total_marks': paper['max_marks'],
        'duration_minutes': paper['duration_minutes'], 'duration_note': None,
        'question_ids': [r['question_id'] for r in records], 'is_official_sample': bool(paper.get('is_sample')),
        'source_bundle_url': None,
        'full_paper_pdf_url': docs['question_paper']['url'], 'full_mark_scheme_pdf_url': docs['mark_scheme']['url'],
        'official_source_url': docs['question_paper']['url'],
        'examiner_report_url': docs.get('examiner_report', {}).get('url') if docs.get('examiner_report', {}).get('availability') == 'verified_public_pdf' else None,
        'examiner_report_note': None if docs.get('examiner_report', {}).get('availability') == 'verified_public_pdf' else 'No public examiner report is listed for this paper.',
    }
    if article:
        runtime_paper['pre_release_article_url'] = article.get('url') if article.get('availability') == 'verified_public_pdf' else None
        runtime_paper['pre_release_article_note'] = None if article.get('availability') == 'verified_public_pdf' else \
            'The pre-release scientific article for this paper is not publicly available.'
    return {'pack_id': pid.lower(), 'papers': [runtime_paper], 'questions': records}


def build_job(job):
    paper, candidate, review, sources, repo, points = job
    pid = paper['paper_id']
    if not review.exists() or not candidate.exists():
        return {'paper_id': pid, 'status': 'awaiting_review_or_source'}
    target = repo / 'data/packs' / SLUG / f'{pid}.json'
    signature = hashlib.sha256(SIGNATURE + candidate.read_bytes() + review.read_bytes()).hexdigest()
    try:
        if target.exists():
            existing = json.loads(target.read_text())
            if existing.get('build_signature') == signature:
                return {'paper_id': pid, 'status': 'built', 'units': len(existing['questions']),
                        'marks': sum(q['marks'] for q in existing['questions']), 'resumed': True}
        pack = build_paper(paper, json.loads(candidate.read_text()), json.loads(review.read_text()),
                           sources, repo / 'assets' / SLUG, repo, points)
        registry_path = repo / 'data/imports' / SLUG / 'identities.json'
        if registry_path.exists():
            registry = json.loads(registry_path.read_text())['units']
            for unit in pack['questions']:
                identity = {'parent_question_id': unit['parent_question_id'],
                            'source_sha256': unit['provenance']['question_source_sha256'],
                            'original_tariff_indices': unit['provenance']['original_tariff_indices'], 'marks': unit['marks']}
                if unit['question_id'] in registry and registry[unit['question_id']] != identity:
                    raise ValueError('Published assessment identity changed; assign a new ID: ' + unit['question_id'])
        pack['build_signature'] = signature
        write_json(target, pack)
        return {'paper_id': pid, 'status': 'built', 'units': len(pack['questions']),
                'marks': sum(q['marks'] for q in pack['questions'])}
    except Exception as error:  # reported per paper; nothing partial is written
        return {'paper_id': pid, 'status': 'needs_review', 'error': str(error)}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('inventory', type=Path)
    parser.add_argument('--sources', type=Path, required=True)
    parser.add_argument('--candidates', type=Path, required=True)
    parser.add_argument('--reviews', type=Path, required=True)
    parser.add_argument('--repo', type=Path, default=Path.cwd())
    parser.add_argument('--paper', action='append')
    args = parser.parse_args()
    repo = args.repo.resolve()
    points = spec_index(repo)
    jobs = []
    for paper in json.loads(args.inventory.read_text())['papers']:
        if args.paper and paper['paper_id'] not in args.paper:
            continue
        if paper['documents']['question_paper'].get('availability') != 'verified_public_pdf':
            continue
        jobs.append((paper, args.candidates / f"{paper['paper_id']}.json", args.reviews / f"{paper['paper_id']}.json",
                     args.sources, repo, points))
    status = []
    with concurrent.futures.ProcessPoolExecutor(max_workers=4) as pool:
        for result in pool.map(build_job, jobs):
            status.append(result)
            print(result, flush=True)
    print('Built', sum(s['status'] == 'built' for s in status), 'of', len(status), 'papers.')


if __name__ == '__main__':
    main()
