#!/usr/bin/env python3
"""Build the official 7692/1 packs from reviewed source-bound inputs."""
import argparse
import json
import re
import sys
from pathlib import Path

from importlib.util import module_from_spec, spec_from_file_location

SUBJECT_ID = 'AQA_ALEVEL_SPAN_7692'
OFFICIAL_SOURCE = 'https://www.aqa.org.uk/subjects/spanish/a-level/spanish-7692/assessment-resources'

SKILLS = {
    'listening': ('AQA_SPAN_LISTENING', 'AO1', 'Listening comprehension'),
    'reading': ('AQA_SPAN_READING', 'AO2', 'Reading comprehension'),
    'summary': ('AQA_SPAN_SUMMARY', 'AO3', 'Summary writing in Spanish'),
    'en-es': ('AQA_SPAN_TRANSLATE_INTO_ES', 'EN → ES', 'Translation into Spanish'),
    'es-en': ('AQA_SPAN_TRANSLATE_INTO_EN', 'ES → EN', 'Translation into English'),
}

# Explicit component-level themes from review. 0 denotes no specific spec subtheme
# where a language-only or literary task would otherwise acquire an incidental label.
SOC = 'AQA_SPAN_SOC1_1.'
MULTI = 'AQA_SPAN_SOC2_2.'
ART = 'AQA_SPAN_ART_3.'
POL = 'AQA_SPAN_POLIT_4.'
THEMES = {
    'NOV20': [0, ART+'2', POL+'2', MULTI+'1', SOC+'2', 0, POL+'3', ART+'1', MULTI+'1', MULTI+'2', SOC+'3'],
    'NOV21': [SOC+'2', ART+'2', POL+'1', ART+'1', POL+'2', 0, ART+'1', MULTI+'1', 0, SOC+'1', ART+'3'],
    'JUN22': [SOC+'2', ART+'2', POL+'1', SOC+'3', ART+'1', ART+'3', POL+'3', 0, ART+'3', SOC+'1', MULTI+'2'],
    'JUN23': [MULTI+'2', 0, POL+'3', ART+'1', POL+'2', ART+'3', SOC+'3', ART+'1', 0, MULTI+'1', POL+'1'],
    'JUN24': [MULTI+'1', SOC+'3', ART+'3', POL+'1', MULTI+'1', 0, ART+'1', POL+'3', MULTI+'3', SOC+'2', ART+'2'],
    'JUN25': [POL+'2', SOC+'2', MULTI+'1', ART+'1', MULTI+'2', ART+'2', ART+'1', 0, ART+'2', SOC+'3', SOC+'1'],
    'SPECIMEN': [MULTI+'1', POL+'1', SOC+'3', POL+'2', 0, POL+'2', MULTI+'2', SOC+'3', MULTI+'3', POL+'2'],
}

# Passage or vignette embedded in an official question page. The hosted stem
# retains rubrics and shared choices but leaves these out of derived imagery.
INLINE_EXTERNAL = {
    'NOV20': {6: (193, 566)},
    'NOV21': {6: (213, 555)},
    'JUN22': {6: (109, 395), 9: (160, 493)},
    'JUN23': {6: (164, 454), 9: (109, 354)},
    'JUN24': {5: (151, 444)},
    'JUN25': {6: (114, 409), 9: (141, 472)},
    'SPECIMEN': {6: (143, 574), 8: (143, 628), 9: (115, 560)},
}
# Part groups sharing a later unscored rubric (physical page, edges).
AUTUMN_MATCHING = {
    'NOV20': (6, [[18, 110, 544, 537, 617], [19, 120, 333, 537, 731]]),
    'NOV21': (7, [[19, 113, 62, 538, 136], [19, 120, 483, 537, 708]]),
}
GAP_INSTRUCTIONS = {'NOV20': 190, 'NOV21': 200, 'JUN22': 196, 'JUN23': 201, 'JUN24': 204, 'JUN25': 192}
Q8_SCHEME_Y = {'NOV20': 144, 'NOV21': 274, 'JUN22': 312, 'JUN23': 274, 'JUN24': 299, 'JUN25': 299}
# Explicit page ranges for exact whole schemes sharing a page with another task.
SCHEME_BOUNDS = {
    ('NOV20', 4, 7): (83, 755),
    ('NOV21', 4, 5): (82, 438),
    ('NOV20', 10, 14): (285, 618),
    ('NOV21', 10, 15): (295, 630),
    ('JUN22', 1, 3): (198, 350),
    ('JUN22', 10, 14): (280, 618),
    ('JUN23', 3, 4): (414, 595),
    ('JUN23', 10, 14): (293, 632),
    ('JUN24', 10, 15): (324, 660),
    ('JUN25', 10, 15): (304, 640),
    ('SPECIMEN', 1, 3): (200, 781),
    ('SPECIMEN', 3, 7): (84, 694),
    ('SPECIMEN', 5, 9): (214, 431),
}


def load_split_module():
    spec = spec_from_file_location('extract_split_parts', Path(__file__).with_name('extract-split-parts.py'))
    mod = module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


SPLIT = load_split_module()


def rows(page):
    return SPLIT.lines(page)


def script_urls(manifest, series):
    suffix = 'SPECIMEN' if series == 'SPECIMEN' else series
    terms = ('WRE', 'EXAMINER')
    return next((d['url'] for d in manifest if (d['name'].upper().startswith('AQA-76921-')
                  or d['name'].upper().startswith('AQA-7692-1-')) and suffix in d['name'].upper()
                 and any(word in d['name'].upper() for word in terms)), None)


def metadata(series):
    if series == 'SPECIMEN':
        return 'AQA_7692_SAMPLE_1_P1', None, 'Sample set 1'
    year = 2000 + int(series[-2:])
    season = 'Autumn' if series.startswith('NOV') else 'June'
    return f'AQA_7692_{year}_{season.upper()}_P1', year, season


def visible_rows(page, minimum_y=62, maximum_y=779):
    return [(text, r) for text, r in rows(page) if minimum_y <= r.y0 < maximum_y
            and 40 < r.x0 < 550 and not re.fullmatch(r'[\d *]+|box|Turn over.*|Do not write.*|outside the', text)]


def part_regions(s, ref, qp_page, ms, ms_page):
    box, marks = SPLIT.qp_region(ref, qp_page)
    q_regions = SPLIT.normalize(qp_page, [box])
    code = ref['reference']
    if s == 'SPECIMEN' and code == '09.11':
        q_regions = SPLIT.normalize(qp_page, [[55, 65, 554, 98], [145, 198, 555, 340]])
        scheme = (SPLIT.normalize(ms[16], [[40, 84, 568, 786]])
                  + SPLIT.normalize(ms[17], [[40, 84, 568, 580]])
                  + SPLIT.normalize(ms[15], [[40, 84, 568, 430]]))
    else:
        scheme = SPLIT.normalize(ms_page, SPLIT.ms_regions(code, ms_page))
    return q_regions, scheme, marks


def whole_question_regions(s, q, qp):
    n = q['reference']
    p = qp[q['question_paper']['pages'][0] - 1]
    printed = visible_rows(p)
    start = next((r.y0 for text, r in rows(p) if 29 < r.x0 < 66 and text.replace(' ', '') == f'{n:02}'), 66) - 2
    tracks = [r.y0 for text, r in printed if text.startswith(('Tracks:', 'Length of passage:'))]
    if tracks:
        start = min(tracks) - 2
    tariffs = [r for text, r in printed if re.search(r'\[\d+ marks?\]', text)]
    if s == 'SPECIMEN' and n == 5:
        following = qp[p.number + 1]
        return (SPLIT.normalize(p, [[55, start, 552, 173]])
                + SPLIT.normalize(following, [[85, 91, 260, 580], [475, 620, 551, 650]]))
    if n == 8 and s != 'SPECIMEN':
        following = qp[p.number + 1]
        options = [(text, r) for text, r in rows(following) if 60 <= r.y0 < 585 and 118 < r.x0 < 210]
        assert len([1 for text, _ in options if re.fullmatch(r'[A-Z]', text)]) == (18 if q['marks'] == 12 else 16)
        end = max(r.y1 for text, r in options if not text.startswith('Turn over')) + 3
        return (SPLIT.normalize(p, [[48, start, 542, GAP_INSTRUCTIONS[s]]])
                + SPLIT.normalize(following, [[107, 63, 270, end]]))
    assert tariffs, (s, n)
    end = max(r.y1 for r in tariffs) + 2
    if (s, n) == ('NOV21', 10):
        return SPLIT.normalize(p, [[45, start, 542, 110], [105, 205, 542, end]])
    return SPLIT.normalize(p, [[45, start, 555 if s == 'SPECIMEN' else 541, end]])


def whole_mark_regions(s, q, ms):
    n = q['reference']
    pages = list(q['mark_scheme']['pages'])
    out = []
    if (s == 'SPECIMEN' and n == 10) or (s != 'SPECIMEN' and n in (10, 11)):
        pages = pages[1:] + pages[:1]
    if s == 'NOV21' and n == 4:
        pages = [5, *pages]
    if (s == 'SPECIMEN' and n in (1, 7)) or (s != 'SPECIMEN' and n in (4, 7)):
        pages = pages[-1:] + pages[:-1]
    for pn in pages:
        p = ms[pn - 1]
        if s == 'SPECIMEN' and pn == 21:
            continue
        content = visible_rows(p, 82, 785)
        y0 = min(r.y0 for _, r in content) - 5
        y1 = max(r.y1 for _, r in content) + 3
        explicit = SCHEME_BOUNDS.get((s, n, pn))
        if explicit:
            y0, y1 = explicit
        if s != 'SPECIMEN' and n == 8:
            y0, y1 = min(y0, 84), Q8_SCHEME_Y[s]
        out.extend(SPLIT.normalize(p, [[39, y0, 560, y1]]))
    return out


def title_at(q, p):
    n = q['reference']
    for text, r in rows(p):
        if 29 < r.x0 < 66 and text.replace(' ', '') == f'{n:02}':
            across = [t for t, a in rows(p) if 97 < a.x0 < 510 and abs(a.y0 - r.y0) < 2]
            if across:
                return across[0]
    if n == 10:
        candidate = next((text for text, r in rows(p) if 110 < r.x0 < 510 and 63 < r.y0 < 76), 'Traducción')
        return candidate
    return f'Pregunta {n}'


def stem_regions(s, qp, q):
    n = q['reference']
    part = q['parts'][0]
    p = qp[part['question_page'] - 1]
    ref = part['reference']
    first = SPLIT.question_marker(ref, rows(p))
    mark = next((r for text, r in rows(p) if 29 < r.x0 < 66 and text.replace(' ', '') == f'{n:02}'), None)
    if mark is None:
        raise ValueError((s, n, 'missing stem marker'))
    tracks = [r.y0 for text, r in rows(p) if text.startswith(('Tracks:', 'Length of passage:'))]
    top = min(tracks) - 2 if tracks else mark.y0 - 2
    last_stem_line = max((r.y1 for text, r in visible_rows(p, top, first.y0 - 2)), default=first.y0 - 2)
    bottom = min(first.y0 - 2, last_stem_line + 2)
    passage = INLINE_EXTERNAL.get(s, {}).get(n)
    if passage:
        start_cut, end_cut = passage
        boxes = [[47, top, 329 if (s, n) == ('NOV21', 6) else 543, start_cut]]
        if bottom > end_cut + 5:
            boxes.append([47, end_cut + 1, 543, bottom])
    else:
        boxes = [[47, top, 543, bottom]]
    return SPLIT.normalize(p, boxes)


def resource_entries(s, q):
    n = q['reference']
    entries = []
    if audio := q.get('audio'):
        tracks = audio.get('printed_track_range')
        label = f'Official listening audio for Q{n}' if audio.get('range') else f'Official full listening recording · select Q{n}'
        if tracks:
            label += f' (tracks {tracks[0]:02}–{tracks[1]:02})'
        cue = audio.get('range') or {}
        entries.append({'kind': 'audio', 'label': label, 'url': audio['url'],
                        'start_seconds': cue.get('from_seconds'), 'end_seconds': cue.get('to_seconds')})
    if insert := q.get('insert'):
        entries.append({'kind': 'insert', 'label': f'Official reading insert for Q{n} (page {insert["pages"][0]})',
                        'url': insert['open_url']})
    elif n in INLINE_EXTERNAL.get(s, {}) or (s == 'SPECIMEN' and n in (5, 7)) or (s != 'SPECIMEN' and n == 8) or (s, n) == ('NOV21', 10):
        entries.append({'kind': 'passage', 'label': f'Official source passage for Q{n} (page {q["question_paper"]["pages"][0]})',
                        'url': q['question_paper']['open_url']})
    return entries


def scheme_guidance(number, series, scheme, render, renderer):
    if number not in (2, 9) or series == 'SPECIMEN':
        return ''
    # AQA places question-scoped accept/reject instructions before some answer
    # tables. Find their own headings, then stop at the first scheme table row.
    header = re.compile(fr'Question {number}(?!\d)')
    for page in scheme:
        content = rows(page)
        heading = next((r for text, r in content if header.fullmatch(text)), None)
        if not heading:
            continue
        table_labels = [r.y0 for text, r in content if text == 'Qu' and r.y0 > heading.y0]
        if not table_labels:
            return ''
        before_table = min(table_labels) - 6
        if before_table < heading.y1 + 30:
            return ''
        region = SPLIT.normalize(page, [[40, heading.y1 + 2, 555, before_table]])
        url = render(f'Q{number:02}_scheme_guidance', region, renderer)
        return f'<img data-math-image="{url}" alt="Official marking instructions for Question {number}">'
    return ''


def build_paper(paper, assets, site, manifest, renderer_class):
    s = paper['series']
    sample = s == 'SPECIMEN'
    paper_id, year, season = metadata(s)
    root = site / 'assets/spanish' / paper_id
    qp_path, qp = SPLIT.open_document(assets, paper['question_paper'])
    ms_path, ms = SPLIT.open_document(assets, paper['mark_scheme'])
    qr, sr = renderer_class(qp_path), renderer_class(ms_path)
    ref_assets = {}

    def render(name, regions, renderer):
        target = root / f'{name}.webp'
        if target not in ref_assets:
            ref_assets[target] = renderer.render(regions, target)
        return target.relative_to(site).as_posix()

    units = []
    for q in paper['questions']:
        n = q['reference']
        parent = f'{paper_id}_Q{n:02}'
        part_rows = q['parts'] or [None]
        title = title_at(q, qp[q['question_paper']['pages'][0] - 1])
        listening = q['section'] == 'A'
        summary = n in ({1, 7} if sample else {4, 7})
        q_context = {'full_question_pdf_url': q['question_paper']['open_url'],
                     'full_scheme_pdf_url': q['mark_scheme']['open_url']}
        resources = resource_entries(s, q)
        if resources:
            q_context['official_resources'] = resources
        if q['parts']:
            stem = stem_regions(s, qp, q)
            q_context['stem_image_url'] = render(f'Q{n:02}_stem', stem, qr)
        accrued = 0
        for part in part_rows:
            label = part['reference'] if part else f'{n:02}'
            full_translation = n == (10 if sample else 11)
            into_es = (sample and label == '09.11') or (not sample and n == 10)
            skill = 'es-en' if full_translation else 'en-es' if into_es else 'summary' if summary else 'listening' if listening else 'reading'
            prefix = f'Q{n:02}' + (f'_P{int(label.partition(".")[2]):02}' if part else '')
            context = dict(q_context)
            if part:
                question_page, scheme_page = qp[part['question_page'] - 1], ms[part['scheme_page'] - 1]
                q_regions, mark_regions, marks = part_regions(s, part, question_page, ms, scheme_page)
            else:
                q_regions, mark_regions = whole_question_regions(s, q, qp), whole_mark_regions(s, q, ms)
                marks = q['marks']
            if sample and into_es:
                context.pop('stem_image_url', None)
                context['official_resources'] = [{'kind': 'passage', 'label': 'Official reading passage for Q09.11 (page 18)',
                                                  'url': f"{q['question_paper']['url']}#page=18"}]
                context['full_question_pdf_url'] = f"{q['question_paper']['url']}#page={q_regions[0]['page']}"
                context['full_scheme_pdf_url'] = f"{q['mark_scheme']['url']}#page={mark_regions[0]['page']}"
            if s in AUTUMN_MATCHING and n == 9 and part and int(label.partition('.')[2]) >= AUTUMN_MATCHING[s][0]:
                context.pop('stem_image_url', None)
                boxes = AUTUMN_MATCHING[s][1]
                lead = [area for pn, *coords in boxes for area in SPLIT.normalize(qp[pn - 1], [coords])]
                context['intros'] = [{'label': 'Matching instructions and options',
                                      'image_url': render(f'Q{n:02}_matching_options', lead, qr)}]
            primary = [SKILLS[skill][0]]
            if summary:
                primary.append(SKILLS['listening' if listening else 'reading'][0])
            themes = THEMES[s][n - 1]
            crossover = [themes] if themes else []
            if into_es or full_translation or (n == 5 if sample else n == 8):
                crossover.append('AQA_SPAN_GRAM_5.1')
            content = {'question_html': '<p><small>Source: AQA and its licensors.</small></p>', 'question_image_url': render(prefix, q_regions, qr),
                       'mark_scheme_html': scheme_guidance(n, s, ms, render, sr),
                       'mark_scheme_image_url': render(f'{prefix}_scheme', mark_regions, sr)}
            source_reference = q['transcript_for_review']['url'] if listening else None
            rubric_dir = 'English → Spanish' if into_es else 'Spanish → English' if full_translation else None
            unit = {
                'question_id': f'{paper_id}_{prefix}',
                'paper_id': paper_id, 'subject_id': SUBJECT_ID, 'source_type': 'real_past_paper',
                'is_sample': False, 'is_official_sample': sample, 'board': 'AQA', 'level': 'A-Level',
                'subject': 'Spanish', 'spec_code': '7692', 'qualification_code': '7692', 'is_as': False,
                'subject_category': 'Languages', 'year': year, 'series': season, 'component': '7692/1',
                'question_number': f'{n:02}', 'marks': marks,
                'estimated_minutes': max(1, round(marks * 1.5)),
                'difficulty': 'hard' if skill in ('summary', 'es-en', 'en-es') else 'medium',
                'introduced_year': 12 if themes and themes.startswith((SOC, ART)) else 13,
                'section': 'Section A · Listening and writing' if listening else 'Section B · Reading and writing',
                'primary_spec_points': primary, 'crossover_spec_points': crossover,
                'preview_text': rubric_dir or title, 'include_in_custom_pool': True,
                'extended_response': skill in ('summary', 'es-en', 'en-es'),
                'content': content, 'context': context, 'scheme_scope': 'part' if part else 'full_question',
                'scheme_question_number': label,
                'response_language': 'English' if full_translation else 'Spanish',
                'provenance': {'reviewer_type': 'model', 'review_status': 'model_reviewed',
                               'question_source_sha256': paper['question_paper']['sha256'],
                               'scheme_source_sha256': paper['mark_scheme']['sha256'],
                               'source_regions': q_regions, 'scheme_regions': mark_regions,
                               'original_parts': [label], 'original_tariff_indices': [0],
                               'question_source_url': f"{q['question_paper']['url']}#page={q_regions[0]['page']}",
                               'scheme_source_url': f"{q['mark_scheme']['url']}#page={mark_regions[0]['page']}",
                               'credit': 'AQA and its licensors.'},
            }
            if part:
                unit['parent_question_id'] = parent
                unit['part_label'] = label
            if summary:
                unit['summary_max_words'] = 90
                unit['summary_content_marks'] = 7
                unit['summary_language_marks'] = 5
            if rubric_dir:
                unit['translation_direction'] = skill
            if source_reference:
                unit['provenance']['transcript_source_url'] = source_reference
            units.append(unit)
            accrued += marks
        assert accrued == q['marks'], (paper_id, n, accrued)
    assert sum(unit['marks'] for unit in units) == 100
    sample_label = 'Official sample set 1' if sample else f'{season} {year}'
    runtime = {'paper_id': paper_id, 'paper_type': 'real_past_paper', 'subject_id': SUBJECT_ID,
               'board': 'AQA', 'level': 'A-Level', 'subject': 'Spanish', 'spec_code': '7692',
               'qualification_code': '7692', 'is_as': False, 'year': year, 'series': season,
               'paper_code': 'P1', 'component': '7692/1', 'official_paper_code': '7692/1', 'tier': None, 'is_official_sample': sample,
               'title': f'{sample_label} Paper 1: Listening, reading and writing',
               'total_marks': 100, 'duration_minutes': 150, 'question_ids': [u['question_id'] for u in units],
               'full_paper_pdf_url': paper['question_paper']['url'],
               'full_mark_scheme_pdf_url': paper['mark_scheme']['url'],
               'official_source_url': OFFICIAL_SOURCE, 'examiner_report_url': script_urls(manifest, s),
               'catalogue_verified': True, 'catalogue_generated': False}
    output = site / 'data/packs/spanish' / f'{paper_id}.json'
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps({'pack_id': paper_id.lower(), 'papers': [runtime], 'questions': units},
                                 ensure_ascii=False, separators=(',', ':')) + '\n', encoding='utf-8')
    return len(units), len(ref_assets)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source-cache', type=Path, required=True)
    parser.add_argument('--source-map', type=Path, required=True)
    parser.add_argument('--repo', type=Path, required=True)
    parser.add_argument('--stage', type=Path, required=True)
    parser.add_argument('--series', action='append')
    args = parser.parse_args()
    sys.path.insert(0, str(args.repo / 'tools/physics'))
    from render import SourceRenderer
    manifest = json.loads((args.source_cache / 'official-manifest.json').read_text())
    for paper in json.loads(args.source_map.read_text()):
        if args.series and paper['series'] not in args.series:
            continue
        units, assets = build_paper(paper, args.source_cache / 'assets', args.stage, manifest, SourceRenderer)
        print(f'{paper["series"]}: {units} scoring units, {assets} assets')
    spec = {'id': 'AQA_SPAN_PAPER1_SKILLS', 'title': 'Listening, reading, writing and translation',
            'topics': [{'id': 'AQA_SPAN_SKILLS_4_4', 'code': '4.4', 'title': 'Paper 1 language skills', 'kind': 'skill',
                        'points': [{'id': i, 'code': code, 'title': label} for i, code, label in SKILLS.values()]}]}
    (args.stage / 'paper-one-spec-section.json').write_text(json.dumps(spec, ensure_ascii=False, indent=2) + '\n')


if __name__ == '__main__':
    main()
