#!/usr/bin/env python3
"""Discover public Pearson 1HI0 (GCSE History 2016) exam-material PDFs by published name.

Pearson's exam-materials listing is script-driven, so (as tools/history/discover.py does for
A level) candidate file names are probed with HEAD requests on qualifications.pearson.com
itself: nothing under /secure/, no redirects followed, first PDF answer wins, every miss is
recorded as evidence. 1HI0 files are one PDF per booklet code: Paper 1 '10', Paper 2 British
depth study 'b1' (the period-study booklets 'p1'..'p5' are not imported), Paper 3 '31'. The
folder name differs in case between files (Exam-materials / exam-materials), so both are tried.
"""
import argparse
import concurrent.futures
import datetime as dt
import json
import subprocess
from pathlib import Path

BASES = ['https://qualifications.pearson.com/content/dam/pdf/GCSE/History/2016/Exam-materials/',
         'https://qualifications.pearson.com/content/dam/pdf/GCSE/History/2016/exam-materials/']
CODES = ['10', 'b1', '31']
YEARS = [2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025, 2026]
KINDS = {'question_paper': ['que'], 'mark_scheme': ['rms', 'msc', 'ms'], 'examiner_report': ['pef']}
# 2020/2021 had no June GCSE series; they are probed only so the absence is evidence.
WINDOW = {'question_paper': ('05-01', '06-30'), 'mark_scheme': ('05-01', '09-20'), 'examiner_report': ('08-01', '09-20')}


def dates(year, window):
    a, b = dt.date.fromisoformat(f'{year}-{window[0]}'), dt.date.fromisoformat(f'{year}-{window[1]}')
    return [(a + dt.timedelta(n)).strftime('%Y%m%d') for n in range((b - a).days + 1)]


def head(url):
    r = subprocess.run(['curl', '-sS', '-I', '-m', '25', '-A', 'Mozilla/5.0', '-o', '/dev/null', '-w', '%{http_code} %{content_type}', url],
                       capture_output=True, text=True)
    return r.stdout.strip()


def candidates(code, kind, year):
    out = []
    for d in dates(year, WINDOW[kind]):
        for px in KINDS[kind]:
            for base in BASES:
                out += [f'{base}1hi0-{code}-{px}-{d}.pdf', f'{base}1HI0_{code.upper()}_{px}_{d}.pdf']
    return out


def probe(cands, workers):
    for i in range(0, len(cands), workers * 4):
        batch = cands[i:i + workers * 4]
        with concurrent.futures.ThreadPoolExecutor(workers) as pool:
            res = list(pool.map(head, batch))
        for url, r in zip(batch, res):
            if r.startswith('200') and 'pdf' in r:
                return url, i + batch.index(url) + 1
    return None, len(cands)


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--output', type=Path, required=True)
    p.add_argument('--workers', type=int, default=24)
    p.add_argument('--years', type=int, nargs='*', default=YEARS)
    p.add_argument('--wide', action='store_true', help='widen every window to 1 April - 31 December (used for a series whose files were not found)')
    p.add_argument('--codes', nargs='*', default=CODES)
    a = p.parse_args()
    if a.wide:
        WINDOW.update({k: ('04-01', '12-31') for k in WINDOW})
    out = json.loads(a.output.read_text()) if a.output.exists() else {}
    for year in a.years:
        for code in a.codes:
            rec = out.setdefault(f'1HI0_{code.upper()}_{year}', {})
            for kind in KINDS:
                if rec.get(kind):
                    continue
                url, tried = probe(candidates(code, kind, year), a.workers)
                rec[kind] = {'url': url, 'method': 'name_probe', 'probes': tried} if url else {'url': None, 'status': 'not_found', 'probes': tried, 'window': WINDOW[kind]}
                print(year, code, kind, url or 'not_found', flush=True)
                a.output.write_text(json.dumps(out, indent=1) + '\n')


if __name__ == '__main__':
    main()
