#!/usr/bin/env python3
"""Write the verified Further Mathematics source inventories (9FM0 and 8FM0).

Run on 2026-11-21 from a verified manifest of Pearson's own files:

    python3 tools/fmaths/inventory.py ../fm-research/sources/manifest.json

The manifest was produced in the Claude desktop built-in browser on the owner's
computer (the build host's proxy still refuses qualifications.pearson.com). Every
document was listed by Pearson's past-paper search (A Level > Mathematics (2017) >
each exam series) or the Mathematics (2017) course materials, fetched from
qualifications.pearson.com only, and hashed with SHA-256 in the browser; the bytes
were re-hashed on the build host after transfer (404/404 matched). The source PDFs
are kept in the private research workspace, never in this repository.

Component modules are verified from the printed cover of every question paper:
8FM0/21 FP1, 22 FP2, 23 FS1, 24 FS2, 25 FM1, 26 FM2, 27 D1, 28 D2 (each "the total
mark for this part of the examination is 40"); 8FM0/01 Core Pure, 80 marks.
"""
import json
import re
import sys
from pathlib import Path
from urllib.parse import urlsplit, urlunsplit

REPO = Path(__file__).resolve().parents[2]
OUT = REPO / 'data/imports/fmaths/inventory'
CHECKED = '2026-11-21'
SEARCH = 'https://qualifications.pearson.com/en/support/support-topics/exams/past-papers.html'
METHOD = ('Listed by Pearson past-paper search (A Level > Mathematics (2017) > each exam series) and the '
          'Mathematics (2017) course materials; fetched only from qualifications.pearson.com in the Claude desktop '
          'built-in browser on the owner\'s computer; SHA-256 computed in the browser and re-verified on the build '
          'host. The build host\'s own proxy still refuses the domain (CONNECT 403).')

A_MODULES = [('01', 'CP', 'Core Pure Mathematics 1'), ('02', 'CP', 'Core Pure Mathematics 2'),
             ('3A', 'FP1', 'Further Pure Mathematics 1'), ('3B', 'FS1', 'Further Statistics 1'),
             ('3C', 'FM1', 'Further Mechanics 1'), ('3D', 'D1', 'Decision Mathematics 1'),
             ('4A', 'FP2', 'Further Pure Mathematics 2'), ('4B', 'FS2', 'Further Statistics 2'),
             ('4C', 'FM2', 'Further Mechanics 2'), ('4D', 'D2', 'Decision Mathematics 2')]
AS_MODULES = [('01', 'CP', 'Core Pure Mathematics', 80)] + [
    (str(n), m, t, 40) for n, m, t in [(21, 'FP1', 'Further Pure Mathematics 1'), (22, 'FP2', 'Further Pure Mathematics 2'),
                                       (23, 'FS1', 'Further Statistics 1'), (24, 'FS2', 'Further Statistics 2'),
                                       (25, 'FM1', 'Further Mechanics 1'), (26, 'FM2', 'Further Mechanics 2'),
                                       (27, 'D1', 'Decision Mathematics 1'), (28, 'D2', 'Decision Mathematics 2')]]

# Pearson's exam-series label -> (year, id/catalogue series). 2020/2021 keep the site's existing
# AUTUMN paper ids (saved learner history) while recording Pearson's own label.
SERIES = {'June-2018': (2018, 'June'), 'June-2019': (2019, 'June'), 'October-2020': (2020, 'Autumn'),
          'November-2021': (2021, 'Autumn'), 'June-2022': (2022, 'June'), 'June-2023': (2023, 'June'),
          'June-2024': (2024, 'June'), 'June-2025': (2025, 'June')}
KIND = {'que': 'question_paper', 'rms': 'mark_scheme', 'msc': 'mark_scheme', 'pef': 'examiner_report'}
FILE = re.compile(r'([89]fm0)[-_](\w\w)[-_](que|rms|msc|pef)[-_](\d+)', re.I)
RESTRICTED = {'series': 'June 2026', 'listed_files': 57,
              'reason': 'Listed by Pearson but served from /content/dam/secure/ (teacher-only for 12 months); '
                        'the public fetch fails. Not downloaded; no access gate was bypassed.'}


def clean(url):
    parts = urlsplit(url)
    return urlunsplit((parts.scheme, parts.netloc, parts.path, '', ''))


def doc(rec):
    return {'availability': 'verified_public', 'url': clean(rec['url']), 'sha256': rec['sha256'], 'bytes': rec['size'],
            'last_modified': rec.get('last_modified'), 'etag': (rec.get('etag') or '').strip('"') or None,
            'pearson_label': rec.get('label', '').split(' (PDF')[0]}


def missing(reason='not listed by Pearson for this series'):
    return {'availability': 'not_published', 'url': None, 'sha256': None, 'bytes': None, 'note': reason}


def group(records):
    found, extra = {}, []
    for rec in records:
        if not rec.get('ok') or rec['series'] not in SERIES:
            continue
        name = clean(rec['url']).rsplit('/', 1)[-1]
        hit = FILE.match(name)
        if not hit:
            extra.append(rec)
            continue
        qual, code, kind, _ = hit.groups()
        key = (rec['series'], qual.upper(), code.upper(), KIND[kind.lower()])
        found.setdefault(key, []).append(rec)
    return found, extra


def pick(found, key):
    recs = found.get(key, [])
    if not recs:
        return None, []
    # Pearson lists a few documents twice (a revised re-upload). Keep the newest file name date;
    # record the others so nothing listed is silently dropped.
    name = lambda r: clean(r['url']).rsplit('/', 1)[-1]
    recs = sorted(recs, key=lambda r: (name(r).rsplit('_', 1)[-1].rsplit('-', 1)[-1], 'rms' in name(r).lower()), reverse=True)
    best, others = recs[0], recs[1:]
    for other in others:
        other['duplicate_of_primary'] = other['sha256'] == best['sha256']
    return best, others


def build(records, qual):
    found, extra = group(records)
    rows = []
    modules = A_MODULES if qual == '9FM0' else [(c, m, t) for c, m, t, _ in AS_MODULES]
    for series, (year, cat_series) in SERIES.items():
        if not any(k[0] == series and k[1] == qual for k in found):
            continue
        for code, module, title in modules:
            docs, alternates = {}, []
            for kind in ('question_paper', 'mark_scheme', 'examiner_report'):
                best, others = pick(found, (series, qual, code, kind))
                docs[kind] = doc(best) if best else missing()
                alternates += [doc(o) | {'kind': kind, 'identical_bytes': o['duplicate_of_primary']} for o in others]
            if qual == '9FM0':
                pid = f'EDX_9FM0_{year}_{cat_series.upper()}_P{code.lstrip("0") if code in ("01", "02") else code}'
                marks, minutes = 75, 90
            else:
                pid = f'EDX_8FM0_{year}_{cat_series.upper()}_{code}'
                marks = 80 if code == '01' else 40
                minutes = 100 if code == '01' else None
            row = {'paper_id': pid, 'qualification_code': qual, 'level': 'A-Level' if qual == '9FM0' else 'AS',
                   'is_as': qual == '8FM0', 'year': year, 'series': cat_series, 'pearson_series': series.replace('-', ' '),
                   'official_paper_code': f'{qual}/{code}', 'module_ids': [module], 'component_title': title,
                   'max_marks': marks, 'duration_minutes': minutes, 'module_verified_from': 'printed question-paper cover',
                   'documents': docs, 'imported': False}
            if qual == '8FM0' and code != '01':
                row['shared_duration'] = 'AS Paper 2 is 1 h 40 min for the two modules of the route'
            if alternates:
                row['alternate_listings'] = alternates
            rows.append(row)
    return rows, extra


def samples(records, qual):
    sam = next((r for r in records if r.get('ok') and r['url'].endswith('as-al-maths-further-sams.zip')), None)
    entry = '9FM0 A level Further Mathematics SAMs.pdf' if qual == '9FM0' else '8FM0 AS Further Mathematics SAMs.pdf'
    if not sam:
        return None
    return {'availability': 'verified_public', 'url': clean(sam['url']), 'sha256': sam['sha256'], 'bytes': sam['size'],
            'zip_entry': entry, 'pearson_label': 'AS & A level Maths and AS & A level Further Maths Sample Assessment Materials',
            'note': 'One PDF per qualification holds every sample component; page ranges are taken at import.'}


def main(manifest_path):
    manifest = json.loads(Path(manifest_path).read_text())
    records = manifest['records']
    OUT.mkdir(parents=True, exist_ok=True)
    for qual, name, title, spec, first in (
            ('9FM0', '9fm0-inventory.json', 'Pearson Edexcel A Level Further Mathematics 9FM0', 'Issue 4, June 2023', 'June 2019'),
            ('8FM0', '8fm0-inventory.json', 'Pearson Edexcel AS Further Mathematics 8FM0', 'Issue 5, July 2025', 'June 2018')):
        rows, extra = build(records, qual)
        data = {'qualification': title, 'specification': spec, 'first_assessment': first, 'checked_at': CHECKED,
                'retrieved_at': manifest.get('retrieved_at'), 'source_search': SEARCH, 'evidence_method': METHOD,
                'restricted': RESTRICTED, 'official_samples': samples(records, qual), 'papers': rows}
        if qual == '8FM0':
            data['route_vs_component'] = ('Pearson publishes AS Paper 2 as eight 40-mark module components, 8FM0/21-28. A '
                                          'route 2A-2K is two of them sat together (80 marks, 1 h 40 min). No 8FM0 '
                                          'sitting was published for November 2021.')
        others = [{'url': clean(r['url']), 'sha256': r['sha256'], 'bytes': r['size'], 'pearson_label': r.get('label', '')[:160]}
                  for r in extra if qual.lower() in r['url'].lower() or (qual == '9FM0' and 'P61181A' in r['url'])]
        if others:
            data['other_listed_documents'] = others
        (OUT / name).write_text(json.dumps(data, indent=1, ensure_ascii=False) + '\n')
        n = sum(1 for r in rows for d in r['documents'].values() if d['availability'] == 'verified_public')
        print(name, len(rows), 'components,', n, 'verified documents')


if __name__ == '__main__':
    if len(sys.argv) != 2:
        sys.exit('usage: inventory.py PATH/TO/manifest.json')
    main(sys.argv[1])
