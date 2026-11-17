#!/usr/bin/env python3
"""Discover public Pearson GCSE Chemistry 1CH0 and Combined Science 1SC0 (chemistry papers) PDFs.

Adapted from tools/gcsemaths/discover.py. Pearson's public catalogue is a third-party
search service, so this checks candidate file names on qualifications.pearson.com
itself (HEAD only, no redirects followed, nothing under /secure/). Every hit and
every explicit miss is recorded, so absence is evidence rather than an assumption.

Series: June 2018-2019 and 2022-2026, November 2020 and 2021 (the only November
series GCSE sciences ran). 1CH0 components 1F/1H/2F/2H; 1SC0 chemistry components
1CF/1CH/2CF/2CH. Both qualifications and both tiers share an exam date, so a date
found for one is tried first for the others.
"""
import argparse, concurrent.futures, datetime as dt, json, re, subprocess
from pathlib import Path

BASES = ['https://qualifications.pearson.com/content/dam/pdf/GCSE/Science/2016/Exam-materials/',
         'https://qualifications.pearson.com/content/dam/pdf/GCSE/Science/2016/exam-materials/']
SERIES = [(2018, 'June'), (2019, 'June'), (2020, 'November'), (2021, 'November'),
          (2022, 'June'), (2023, 'June'), (2024, 'June'), (2025, 'June'), (2026, 'June')]
COMPONENTS = [('1CH0', c) for c in ('1F', '1H', '2F', '2H')] + [('1SC0', c) for c in ('1CF', '1CH', '2CF', '2CH')]
KINDS = {'question_paper': ['que'], 'mark_scheme': ['rms', 'msc', 'ms'], 'examiner_report': ['pef', 'per']}


def windows(year, series, kind):
    if series == 'June':
        return (f'{year}-05-08', f'{year}-06-25') if kind == 'question_paper' else (f'{year}-08-05', f'{year}-10-15')
    if kind == 'question_paper':
        return (f'{year}-10-20', f'{year}-11-30')
    return (f'{year}-12-15', f'{year + 1}-03-15')


def dates(win, first=()):
    a, b = (dt.date.fromisoformat(x) for x in win)
    days = [(a + dt.timedelta(n)).strftime('%Y%m%d') for n in range((b - a).days + 1)]
    return list(dict.fromkeys([d for d in first if d in days] + days))


def names(spec, comp, px, d, year):
    new, old = f'{spec.lower()}-{comp.lower()}-{px}-{d}.pdf', f'{spec}_{comp}_{px}_{d}.pdf'
    order = [(BASES[0], new), (BASES[0], old), (BASES[1], new), (BASES[1], old)] if year >= 2022 else \
        [(BASES[0], old), (BASES[0], new), (BASES[1], old), (BASES[1], new)]
    return [b + n for b, n in order]


def head(url):
    r = subprocess.run(['curl', '-sS', '-I', '-m', '25', '--retry', '2', '-o', '/dev/null', '-w', '%{http_code} %{content_type}', url],
                       capture_output=True, text=True)
    return r.stdout.strip()


def probe(cands, workers):
    chunk = workers * 4
    for i in range(0, len(cands), chunk):
        batch = cands[i:i + chunk]
        with concurrent.futures.ThreadPoolExecutor(workers) as pool:
            res = list(pool.map(head, batch))
        for url, r in zip(batch, res):
            if r.startswith('200') and 'pdf' in r:
                return url, i + batch.index(url) + 1
    return None, len(cands)


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--output', type=Path, required=True)
    p.add_argument('--workers', type=int, default=12)
    p.add_argument('--series', help='only this series, e.g. 2019_JUNE')
    p.add_argument('--hints', type=Path, help='JSON {"<year>_<SERIES>|<kind>": [YYYYMMDD, ...]}: dates other Pearson GCSE '
                   'science/maths files of the same series were published on; tried first, still within the window')
    a = p.parse_args()
    known = json.loads(a.hints.read_text()) if a.hints else {}
    out = json.loads(a.output.read_text()) if a.output.exists() else {}
    for year, series in SERIES:
        if a.series and a.series != f'{year}_{series.upper()}':
            continue
        found = {}  # (paper number, kind) -> dates already hit in this series
        for spec, comp in COMPONENTS:
            key = f'{spec}_{comp}_{year}_{series.upper()}'
            rec = out.setdefault(key, {})
            for kind, prefixes in KINDS.items():
                hint = found.get((comp[0], kind), []) + found.get(('*', kind), []) + known.get(f'{year}_{series.upper()}|{kind}', [])
                if rec.get(kind, {}).get('url'):
                    d = re.search(r'(\d{8})\.pdf$', rec[kind]['url']).group(1)
                    found.setdefault((comp[0], kind), []).append(d); found.setdefault(('*', kind), []).append(d)
                    continue
                if rec.get(kind, {}).get('status') == 'not_found':
                    continue
                cands = [u for d in dates(windows(year, series, kind), hint) for px in prefixes for u in names(spec, comp, px, d, year)]
                url, tried = probe(cands, a.workers)
                rec[kind] = ({'url': url, 'status': 'verified_public_pdf', 'method': 'name_probe', 'probes': tried}
                             if url else {'status': 'not_found', 'probes': tried, 'window': windows(year, series, kind)})
                if url:
                    d = re.search(r'(\d{8})\.pdf$', url).group(1)
                    found.setdefault((comp[0], kind), []).append(d); found.setdefault(('*', kind), []).append(d)
                print(key, kind, rec[kind].get('url') or rec[kind]['status'], flush=True)
                a.output.write_text(json.dumps(out, indent=1) + '\n')


if __name__ == '__main__':
    main()
