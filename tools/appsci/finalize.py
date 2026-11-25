#!/usr/bin/env python3
"""Reconcile reviewed H151 sample packs and update only Applied Science records.

Default: stage disabled pack-index entries for private local verification.
--activate requires a recorded owner confirmation in rights.json.
Original PDFs are supplied to the subject builders separately, never committed.
"""
import argparse
import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SUBJECT = 'OCR_L3_APPSCI_AAQ'
PAPERS = ('OCR_F180_SAMPLE', 'OCR_F181_SAMPLE')


def read(path):
    return json.loads((ROOT / path).read_text())


def write(path, value):
    target = ROOT / path
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--activate', action='store_true')
    args = parser.parse_args()
    rights = read('data/imports/appsci/rights.json')
    if args.activate and rights.get('status') != 'owner_confirmed':
        parser.error('Applied Science republication confirmation is still pending.')
    inventory = read('data/imports/appsci/source-inventory.json')
    records = []
    for paper_id in PAPERS:
        relative = f'appsci/{paper_id}.json'
        pack = read('data/packs/' + relative)
        [paper] = pack['papers']
        questions = pack['questions']
        assert paper['subject_id'] == SUBJECT
        assert paper['paper_id'] == paper_id
        assert paper['is_official_sample'] and not paper.get('is_sample')
        assert paper['year'] is None
        assert all(q['subject_id'] == SUBJECT and q['paper_id'] == paper_id for q in questions)
        assert all(q['provenance']['reviewer_type'] == 'model' for q in questions)
        ids = [q['question_id'] for q in questions]
        assert len(ids) == len(set(ids)) and ids == paper['question_ids']
        marks = sum(q['marks'] for q in questions)
        excluded = paper.get('excluded_questions', [])
        assert marks == paper['available_marks']
        assert marks + sum(q['marks'] for q in excluded) == paper['total_marks']
        catalogue_path = f'data/appsci-assets/{paper_id}.json'
        catalogue = read(catalogue_path)
        records.append({
            'paper_id': paper_id, 'unit': paper['paper_code'], 'series': 'Official sample',
            'printed_marks': paper['total_marks'], 'available_marks': marks,
            'scored_parts': len(questions), 'indexed': args.activate,
            'coverage_status': paper.get('coverage_status', 'partial'),
            'pack': 'data/packs/' + relative, 'blocked': excluded,
            'image_assets': len(catalogue['assets']),
            'catalogue_sha256': hashlib.sha256((ROOT / catalogue_path).read_bytes()).hexdigest(),
        })
    index = read('data/packs/index.json')
    other = [entry for entry in index['packs'] if entry.get('subject_id') != SUBJECT]
    index['packs'] = other + [{'file': f'appsci/{pid}.json', 'subject_id': SUBJECT,
                              'enabled': args.activate} for pid in PAPERS]
    write('data/packs/index.json', index)
    coverage = {
        'subject_id': SUBJECT, 'qualification_code': 'H151', 'checked_on': '2026-11-25',
        'status': 'partial_source_coverage' if args.activate else 'built_awaiting_rights_confirmation',
        'reviewer_type': 'model', 'rights_basis': rights,
        'source_inventory': 'data/imports/appsci/source-inventory.json',
        'papers': records,
        'totals': {'verified_source_files': len(inventory['sources']),
                   'prepared_sample_packs': len(records),
                   'indexed_papers': len(records) if args.activate else 0,
                   'scored_parts': sum(p['scored_parts'] for p in records),
                   'marks_available': sum(p['available_marks'] for p in records),
                   'printed_marks': sum(p['printed_marks'] for p in records),
                   'blocked_marks': sum(p['printed_marks'] - p['available_marks'] for p in records),
                   'image_assets': sum(p['image_assets'] for p in records),
                   'live_past_papers': 0, 'paper_only': 0, 'nea_references': 5},
        'queued_verified_public_material': [],
        'missing_source_controls': [{
            'unit': 'F181', 'series': 'January 2026',
            'status': 'pre_release_only', 'is_complete_paper': False,
            'matching_question_paper': 'not_found_on_public_assessment_page',
            'matching_mark_scheme': 'not_found_on_public_assessment_page',
            'may_pair_with_specimen': False,
        }],
        'nea_reference_units': ['F182', 'F183', 'F184', 'F185', 'F186'],
        'school_nea_route': ['F182', 'F183', 'F185'],
        'grading': 'raw_marks_only; no sample grade or UMS conversion inferred',
    }
    write('data/imports/appsci/coverage.json', coverage)
    print(json.dumps(coverage['totals'], indent=2))


if __name__ == '__main__':
    main()
