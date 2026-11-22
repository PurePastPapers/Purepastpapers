#!/usr/bin/env python3
"""Apply the verified source inventories to the Further Mathematics paper catalogue.

    python3 tools/fmaths/catalogue.py

- 9FM0 rows keep their ids, titles and marks; they gain Pearson's own question-paper,
  mark-scheme and examiner-report URLs and Pearson's exam-series label (October 2020,
  November 2021: the ids keep AUTUMN so saved learner history still resolves).
- 8FM0 rows are added only for sittings and components verified in the inventory:
  Paper 1 (Core Pure, 80 marks) and the eight 40-mark Paper 2 module components 21-28.
  A component is one module, never a complete AS Paper 2 sitting: a route is two.
Rows stay catalogue entries (no questions) until their pack is imported.
"""
import json
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
INV = REPO / 'data/imports/fmaths/inventory'
PAPERS = REPO / 'data/papers/EDX_ALEVEL_FMATH_9FM0.json'
SUBJECT = 'EDX_ALEVEL_FMATH_9FM0'
COURSE = 'https://qualifications.pearson.com/en/qualifications/edexcel-a-levels/mathematics-2017.coursematerials.html#filterQuery=category:Pearson-UK:Category%2FExam-materials'


def urls(row):
    docs = row['documents']
    get = lambda kind: docs[kind]['url'] if docs[kind]['availability'] == 'verified_public' else None
    return {'full_paper_pdf_url': get('question_paper'), 'full_mark_scheme_pdf_url': get('mark_scheme'),
            'examiner_report_url': get('examiner_report'), 'official_source_url': get('question_paper') or COURSE}


def as_record(row):
    code = row['official_paper_code'].split('/')[1]
    label = row['pearson_series']
    component = code != '01'
    if code == '01':
        title = f"{label} AS Paper 1: {row['component_title']}"
    else:
        title = f"{label} AS Paper 2 component {code}: {row['component_title']}"
    record = {
        'paper_id': row['paper_id'], 'paper_type': 'real_past_paper', 'subject_id': SUBJECT, 'board': 'Edexcel',
        'level': 'AS', 'subject': 'Further Mathematics', 'spec_code': '8FM0', 'year': row['year'], 'series': row['series'],
        'pearson_series': row['pearson_series'], 'paper_code': code, 'tier': None, 'title': title,
        'total_marks': row['max_marks'], 'duration_minutes': 50 if component else 100, 'question_ids': [], **urls(row),
        'catalogue_generated': True, 'qualification_code': '8FM0', 'is_as': True, 'module_ids': row['module_ids'],
        'official_paper_code': row['official_paper_code'],
    }
    record['catalogue_verified'] = bool(record['full_paper_pdf_url'] and record['full_mark_scheme_pdf_url'])
    if component:
        record['component_of'] = 'Paper 2'
        record['duration_note'] = ('Suggested practice time for this 40-mark component is 50 minutes. '
                                   'The official AS Paper 2 lasts 1 h 40 min for both components in the chosen route.')
    return record


def main():
    papers = json.loads(PAPERS.read_text())
    by_id = {paper['paper_id']: paper for paper in papers}
    a_rows = json.loads((INV / '9fm0-inventory.json').read_text())['papers']
    as_rows = json.loads((INV / '8fm0-inventory.json').read_text())['papers']
    for row in a_rows:
        paper = by_id[row['paper_id']]  # every verified 9FM0 component already has its catalogue row
        paper.update(urls(row))
        paper['pearson_series'] = row['pearson_series']
        paper['catalogue_verified'] = bool(paper['full_paper_pdf_url'] and paper['full_mark_scheme_pdf_url'])
    added = 0
    for row in as_rows:
        record = as_record(row)
        if record['paper_id'] in by_id:
            existing = by_id[record['paper_id']]
            record['question_ids'] = existing.get('question_ids', [])
            record['catalogue_generated'] = existing.get('catalogue_generated', True)
            existing.update(record)
        else:
            papers.append(record)
            by_id[record['paper_id']] = record
            added += 1
    # Same layout as the file already uses: one compact record per line.
    lines = ',\n'.join('  ' + json.dumps(paper, ensure_ascii=False, separators=(',', ':')) for paper in papers)
    PAPERS.write_text('[\n' + lines + '\n]\n')
    print(f'{len(a_rows)} 9FM0 rows linked, {added} 8FM0 rows added, {len(papers)} records')


if __name__ == '__main__':
    main()
