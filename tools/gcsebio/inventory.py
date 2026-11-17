#!/usr/bin/env python3
"""Turn discovery results (+ acquired cache) into the GCSE Biology source inventories.

Writes data/imports/gcsebio/inventory/1bi0-inventory.json and 1sc0-inventory.json.
Each booklet gets a stable paper id (EDX_1BI0_<year>_<SERIES>_<1F..2H> or
EDX_1SC0_<year>_<SERIES>_<1BF..2BH>), its tier, series, paper number, official
marks/duration and explicit document records. Missing documents are recorded as
not_found with the probe evidence instead of being omitted.
"""
import argparse, hashlib, json
from pathlib import Path

QUALS = {
    '1BI0': {'subject_id': 'EDX_GCSE_BIOL_1BI0', 'marks': 100, 'minutes': 105,
             'title': 'Pearson Edexcel Level 1/Level 2 GCSE (9-1) in Biology 1BI0',
             'papers': {'1': 'Paper 1 (Topics 1-5)', '2': 'Paper 2 (Topics 1, 6-9)'}},
    '1SC0': {'subject_id': 'EDX_GCSE_COMBSCI_1SC0', 'marks': 60, 'minutes': 70,
             'title': 'Pearson Edexcel Level 1/Level 2 GCSE (9-1) in Combined Science 1SC0 (biology papers)',
             'papers': {'1': 'Biology Paper 1 (Topics 1-5)', '2': 'Biology Paper 2 (Topics 1, 6-9)'}},
}
TIERS = {'F': 'Foundation', 'H': 'Higher'}


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('discovery', type=Path, nargs='+')
    p.add_argument('--out', type=Path, required=True)
    p.add_argument('--cache', type=Path)
    p.add_argument('--checked-at', default='2026-11-17')
    a = p.parse_args()
    found = {}
    for f in a.discovery:
        found.update(json.loads(f.read_text()))
    order = lambda k: (int(k.split('_')[2]), k.split('_')[3] != 'JUNE', k.split('_')[1][-1], k.split('_')[1][0])
    out = {q: ([], []) for q in QUALS}
    for key in sorted(found, key=order):
        docs = found[key]
        qual, comp, year, series = key.split('_'); year = int(year)
        info = QUALS[qual]
        pid = f'EDX_{qual}_{year}_{series}_{comp}'
        documents = {}
        for kind, rec in docs.items():
            d = {'availability': 'verified_public_pdf' if rec.get('url') else 'not_found', 'verified_at': a.checked_at,
                 'evidence': rec.get('method', 'name_probe'), 'probes': rec.get('probes')}
            if rec.get('url'):
                d['url'] = rec['url']
                cached = a.cache / f'{pid}__{kind}.pdf' if a.cache else None
                if cached and cached.exists() and cached.read_bytes()[:4] == b'%PDF':
                    data = cached.read_bytes()
                    d['sha256'], d['bytes'] = hashlib.sha256(data).hexdigest(), len(data)
            else:
                d['window'] = rec.get('window')
            documents[kind] = d
        tier = TIERS[comp[-1]]
        entry = {'paper_id': pid, 'subject_id': info['subject_id'], 'qualification_code': qual, 'year': year,
                 'series': series.title(), 'component': comp, 'assessment_paper': comp[0], 'tier': tier,
                 'science': 'Biology', 'component_title': f"{info['papers'][comp[0]]} ({tier})",
                 'calculator': True, 'variant': 'standard', 'max_marks': info['marks'],
                 'duration_minutes': info['minutes'], 'documents': documents}
        qp, ms = documents.get('question_paper', {}), documents.get('mark_scheme', {})
        if qp.get('availability') != 'verified_public_pdf' or ms.get('availability') != 'verified_public_pdf':
            entry['status'] = 'not_publicly_available'
            entry['missing'] = [k for k, d in (('question_paper', qp), ('mark_scheme', ms)) if d.get('availability') != 'verified_public_pdf']
            out[qual][1].append(entry)
        else:
            out[qual][0].append(entry)
    a.out.mkdir(parents=True, exist_ok=True)
    for qual, (papers, restricted) in out.items():
        inv = {'qualification': QUALS[qual]['title'], 'subject_id': QUALS[qual]['subject_id'],
               'checked_at': a.checked_at, 'first_certification_year': 2018,
               'series_note': 'May/June series. Summer 2020 and 2021 exams were not sat; November 2020 and 2021 '
                              'series were held. There is no other November series for GCSE sciences.',
               'evidence_method': 'HEAD probes of Pearson exam-material file names on qualifications.pearson.com '
                                  '(tools/gcsebio/discover.py); no secure or authenticated paths',
               'papers': papers, 'unavailable': restricted}
        (a.out / f'{qual.lower()}-inventory.json').write_text(json.dumps(inv, indent=1) + '\n')
        print(qual, len(papers), 'public booklets;', len(restricted), 'not public')


if __name__ == '__main__':
    main()
