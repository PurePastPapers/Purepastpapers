#!/usr/bin/env python3
"""Apply checksum-bound corrections for visually reviewed publisher layouts.

Only coordinates and original printed tariffs are restored. Source PDFs, question
text, mathematical notation and answers are never rewritten. Applied automatically
by extract.py for fresh and resumed candidates; may also be rerun directly:
  source_overrides.py CANDIDATE.json
"""
import argparse
import hashlib
import json
from pathlib import Path

import pdfplumber


SAMPLE_01_SHA = 'e3faaf59ebf4aab5281088fa0f11cfc7b8b6b8294cda453bdba30e65f273d30e'
SAMPLE_02_SHA = '8b1090840cab51618728358bd0d22a51f88451129ecb1d0a1304e90eebd3ef41'


def apply_overrides(candidate):
    checksum = candidate.get('source_sha256')
    if checksum not in [SAMPLE_01_SHA, SAMPLE_02_SHA]:
        return False
    source = Path(candidate['source_file'])
    if hashlib.sha256(source.read_bytes()).hexdigest() != checksum:
        raise ValueError('Reviewed sample source checksum changed')
    if checksum == SAMPLE_01_SHA:
        return restore_sample_01_boundary(candidate, source)
    return restore_sample_02_tariffs(candidate, source)


def restore_sample_01_boundary(candidate, source):
    question = next(q for q in candidate['questions'] if q['number'] == '12')
    part = next(p for p in question['parts'] if p['part_label'] == '(d)')
    page_number = 18
    with pdfplumber.open(source) as document:
        page = document.pages[page_number - 1]
        words = [w for w in page.extract_words()
                 if 25 < w['x0'] < w['x1'] < page.width - 25
                 and 0 <= w['top'] < w['bottom'] <= page.height - 20]
        label = next(w for w in words if w['text'] == '(d)' and w['x0'] < 80)
        tariffs = [w for w in words if w['text'] == '(1)' and w['x0'] > page.width * .7
                   and label['bottom'] <= w['top'] < label['bottom'] + 30]
        if question['marks'] != 9 or part['marks'] != 1 or part['page'] != page_number or len(tariffs) != 1:
            raise ValueError('Reviewed sample question 12(d) tariff layout changed')
        tariff = tariffs[0]
        if abs(part['bottom'] - tariff['bottom']) > 0.1:
            raise ValueError('Reviewed sample question 12(d) tariff coordinates changed')
        bottom = round((tariff['bottom'] + 7) / page.height, 6)
    region = next(r for r in question['regions'] if r['page'] == page_number)
    region['bbox'][3] = max(region['bbox'][3], bottom)
    candidate['extraction_revision'] = 'pearson-sample01-q12-tariff-boundary-v1'
    candidate['source_overrides'] = [item for item in candidate.get('source_overrides', [])
                                     if str(item.get('question')) != '12'] + [{
        'question': '12', 'source_sha256': SAMPLE_01_SHA,
        'reviewer_type': 'model', 'source_page': page_number,
        'original_labels': ['(d)'], 'original_marks': [1],
        'restored_region_bottom': bottom,
        'reason': 'The printed final tariff extends below the generic page footer cutoff; retain its full height and source padding.',
        'reproduce': 'python3 tools/maths/source_overrides.py CANDIDATE.json',
    }]
    return True


def restore_sample_02_tariffs(candidate, source):
    question = next(q for q in candidate['questions'] if q['number'] == '6')
    page_number = 7
    with pdfplumber.open(source) as document:
        page = document.pages[page_number - 1]
        # The three tariffs are inside the statement column, not at the usual
        # right page margin. Positive bounds exclude invisible adjacent pages.
        words = [w for w in page.extract_words()
                 if 25 < w['x0'] < w['x1'] < page.width - 25
                 and 0 <= w['top'] < w['bottom'] <= page.height - 20]
        labels = [next(w for w in words if w['text'] == label and w['x0'] < 80)
                  for label in ['(i)', '(ii)', '(iii)']]
        tariffs = sorted((w for w in words if w['text'] == '(2)'
                          and 140 < w['x0'] < 200 and w['top'] > labels[0]['top']),
                         key=lambda w: w['top'])
    if question['marks'] != 6 or len(tariffs) != 3:
        raise ValueError('Reviewed table no longer has its three printed two-mark tariffs')
    parts = []
    for index, (label, tariff) in enumerate(zip(labels, tariffs)):
        end = labels[index + 1]['top'] if index + 1 < len(labels) else page.height
        if not label['top'] < tariff['top'] < end:
            raise ValueError('Reviewed sample table label/tariff alignment changed')
        roman = label['text'].strip('()')
        parts.append({'part_label': label['text'], 'marks': 2,
                      'page': page_number, 'top': tariff['top'], 'bottom': tariff['bottom'],
                      'fragment': 0,
                      'start': {'label': roman, 'page': page_number,
                                'top': label['top'], 'x': label['x0'], 'fragment': 0},
                      'joint_labels': [roman]})
    question['parts'] = parts
    candidate['exceptions'] = [e for e in candidate.get('exceptions', [])
                               if not (str(e.get('question')) == '6'
                                       and e.get('type') in ['marks_mismatch', 'no_tariffs'])]
    candidate['source_overrides'] = [{
        'question': '6', 'source_sha256': SAMPLE_02_SHA,
        'reviewer_type': 'model', 'source_page': page_number,
        'original_labels': ['(i)', '(ii)', '(iii)'], 'original_marks': [2, 2, 2],
        'reason': 'The printed tariffs are in the table statement column; the generic right-margin tariff detector omits them.',
        'reproduce': 'python3 tools/maths/source_overrides.py CANDIDATE.json',
    }]
    return True


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('candidate', type=Path)
    args = parser.parse_args()
    data = json.loads(args.candidate.read_text())
    if apply_overrides(data):
        args.candidate.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n')
        print('Applied checksum-bound source layout overrides.')
    else:
        print('No reviewed source override applies.')
