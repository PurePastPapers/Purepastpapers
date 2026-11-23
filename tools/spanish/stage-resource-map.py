#!/usr/bin/env python3
"""Build a source-only Paper 1 map with exact page and audio entry points."""
import json
import re
import sys
from pathlib import Path

import fitz

from importlib.util import module_from_spec, spec_from_file_location

MODULE_SPEC = spec_from_file_location('survey', Path(__file__).with_name('survey-paper-one.py'))
SURVEY = module_from_spec(MODULE_SPEC)
MODULE_SPEC.loader.exec_module(SURVEY)

# Pages of unnumbered, whole-task schemes and confirmed continuations.
WHOLE_SCHEME_PAGES = {
    'NOV20': {4: [5, 6, 7], 7: [10, 11, 12], 8: [13], 10: [14, 15, 16], 11: [17, 18, 19]},
    'NOV21': {4: [6, 7], 7: [11, 12, 13], 8: [14], 10: [15, 16, 17], 11: [18, 19, 20]},
    'JUN22': {1: [3], 4: [5, 6, 7], 7: [10, 11, 12], 8: [13], 10: [14, 15, 16], 11: [17, 18, 19]},
    'JUN23': {3: [4], 4: [5, 6, 7], 7: [10, 11, 12], 8: [13], 10: [14, 15, 16], 11: [17, 18, 19]},
    'JUN24': {4: [6, 7, 8], 7: [11, 12, 13], 8: [14], 10: [15, 16, 17], 11: [18, 19, 20]},
    'JUN25': {4: [6, 7, 8], 7: [11, 12, 13], 8: [14], 10: [15, 16, 17], 11: [18, 19, 20]},
    'SPECIMEN': {1: [3, 4, 5], 3: [7], 5: [9], 7: [11, 12, 13], 10: [19, 20, 21]},
}
MS_NAMES = {'NOV20': 'AQA-76921-W-MS-NOV20.PDF', 'JUN24': 'AQA-7692-1-FINAL-MS-JUN24-V2.0.PDF',
            'SPECIMEN': 'AQA-76921-SMS.PDF'}


def source_link(record, pages=None):
    source = {key: record[key] for key in ('url', 'name', 'sha256')}
    if pages:
        source['pages'] = pages
        source['open_url'] = f"{record['url']}#page={pages[0]}"
    return source


def detect_scheme_rows(pdf):
    result = {}
    for index, p in enumerate(pdf):
        if index < 2:
            continue
        for x, y, text in SURVEY.page_lines(p):
            if 35 < x < 112 and 75 < y < 787 and re.fullmatch(r'0\d\.\d{1,2}', text):
                result[text] = index + 1
    return result


def build_map(manifest, qp_survey, series, root, audio):
    assets = root / 'assets'
    is_specimen = series == 'SPECIMEN'
    qp = manifest['AQA-76921-SQP.PDF' if is_specimen else f'AQA-76921-QP-{series}.PDF']
    ms = manifest[MS_NAMES.get(series, f'AQA-76921-MS-{series}.PDF')]
    transcript = manifest['AQA-76921-STR.PDF' if is_specimen else f'AQA-76921-TR-{series}.PDF']
    insert = manifest.get(f'AQA-76921-INS-{series}.PDF')
    recording = next(d for k, d in manifest.items() if re.fullmatch(
        r'AQA-76921-SOUND-UNTRACKED.MP3' if is_specimen else fr'AQA-76921-SF-(?:UNTRACKED-)?{series}\.MP3', k))
    archive = next((d for k, d in manifest.items() if re.fullmatch(
        r'AQA-76921-SOUND-TRACKED.ZIP' if is_specimen else fr'AQA-76921-SF-TRACKED-{series}\.ZIP', k)), None)
    ms_pdf = SURVEY.source(assets, ms)
    ms_cover = ' '.join(ms_pdf[0].get_text().split())
    if is_specimen:
        # Official listed source has a printed transposed code. Its complete
        # prompt and tariff crosswalk establishes the match to the official SQP.
        assert '7962/1' in ms_cover and 'SPECIMEN MATERIAL' in ms_cover
    else:
        assert f'June 20{series[-2:]}' in ms_cover and '7692/1' in ms_cover
    scheme_rows = detect_scheme_rows(ms_pdf)
    names = set()
    insert_pages = {}
    if insert:
        for index, p in enumerate(SURVEY.source(assets, insert)):
            for name in re.findall(r'Text for use with Question\s+(\d+)', p.get_text(), re.IGNORECASE):
                insert_pages[int(name)] = index + 1
    qps = SURVEY.source(assets, qp)
    questions = []
    for number, review in qp_survey['questions'].items():
        n = int(number)
        parts = {f'{n:02}.{part}': page for part, page in review['part_pages'].items()}
        scheme_parts = {ref: scheme_rows[ref] for ref in parts}
        if is_specimen and n == 9:
            scheme_parts['09.11'] = 17
        pages = sorted(set(scheme_parts.values())) if scheme_parts else WHOLE_SCHEME_PAGES[series][n]
        if is_specimen and n == 9:
            pages.extend([16, 18])
            pages.sort()
        refs = {'reference': n,
                'section': review['section'],
                'marks': sum(review['tariffs']),
                'question_paper': source_link(qp, [review['start_page']]),
                'mark_scheme': source_link(ms, pages),
                'parts': [{'reference': ref, 'question_page': page, 'scheme_page': scheme_parts[ref]}
                          for ref, page in parts.items()]}
        names.update(parts)
        if n in insert_pages:
            refs['insert'] = source_link(insert, [insert_pages[n]])
        if review['section'] == 'A':
            refs['audio'] = source_link(recording)
            aligned = next((cue for cue in audio.get(series, {}).get('alignment', []) if cue['question'] == n), None)
            if aligned:
                refs['audio']['range'] = aligned
                start = aligned['from_seconds']
                end = aligned['to_seconds']
                fragment = f'{start},{end}' if end is not None else str(start)
                refs['audio']['segment_url'] = f"{recording['url']}#t={fragment}"
            if review['tracks']:
                refs['audio']['printed_track_range'] = review['tracks']
            if archive:
                refs['tracked_audio_zip'] = source_link(archive)
            refs['transcript_for_review'] = source_link(transcript)
        questions.append(refs)
    outside = set(scheme_rows) - names
    assert not outside or (is_specimen and outside == {'03.1', '03.2', '03.3', '03.4'}), (series, outside)
    return {'series': series, 'question_paper': source_link(qp), 'mark_scheme': source_link(ms),
            'printed_mark_scheme_cover': ms_cover, 'notes': ['AQA specimen scheme cover transposes 7692 to 7962.'] if is_specimen else [],
            'question_pages': len(qps), 'maximum_marks': 100, 'duration_minutes': 150, 'questions': questions}


def main(root, survey_path, audio_path):
    manifest = {d['name'].upper(): d for d in json.loads((root / 'official-manifest.json').read_text()) if d.get('sha256')}
    survey = json.loads(survey_path.read_text())
    audio = json.loads(audio_path.read_text())
    maps = [build_map(manifest, entry, series, root, audio) for series, entry in survey.items()]
    print(json.dumps(maps, indent=2))


if __name__ == '__main__':
    main(*(Path(arg) for arg in sys.argv[1:]))
