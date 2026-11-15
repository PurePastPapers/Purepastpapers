#!/usr/bin/env python3
"""Discover public Pearson 9PH0/8PH0 exam-material PDF URLs by their published names.

Pearson's public catalogue is a third-party search service; this tool instead checks
candidate file names on qualifications.pearson.com itself (HEAD only, no redirects
followed, nothing under /secure/). Known URLs from public web-search evidence are
tried first; otherwise date windows around the series are probed in likelihood
order and the first PDF response wins. The output records every hit and every
explicit miss, so absence is evidence rather than an assumption.
"""
import argparse, concurrent.futures, datetime as dt, json, re, subprocess, sys
from pathlib import Path

BASE = 'https://qualifications.pearson.com/content/dam/pdf/A-Level/Physics/2015/Exam-materials/'
SERIES = {  # year: series label, QP window, results window
    2016: ('June', ('05-10', '06-30'), ('08-08', '08-31')),
    2017: ('June', ('05-10', '06-30'), ('08-08', '08-31')),
    2018: ('June', ('05-10', '06-30'), ('08-08', '08-31')),
    2019: ('June', ('05-10', '06-30'), ('08-08', '08-31')),
    2020: ('October', ('10-01', '10-31'), ('12-01', '12-31')),
    2021: ('October', ('10-01', '10-31'), ('12-01', '12-31')),
    2022: ('June', ('05-10', '06-30'), ('08-08', '08-31')),
    2023: ('June', ('05-10', '06-30'), ('08-08', '08-31')),
    2024: ('June', ('05-10', '06-30'), ('08-08', '08-31')),
    2025: ('June', ('05-10', '06-30'), ('08-08', '08-31')),
    2026: ('June', ('05-10', '06-30'), ('08-08', '09-30')),
}
COMPONENTS = {'9PH0': ['01', '02', '03'], '8PH0': ['01', '02']}
KINDS = {'question_paper': ['que'], 'mark_scheme': ['rms', 'msc', 'ms'], 'examiner_report': ['pef']}


def dates(year, window, centre=None):
    a = dt.date.fromisoformat(f'{year}-{window[0]}'); b = dt.date.fromisoformat(f'{year}-{window[1]}')
    days = [a + dt.timedelta(n) for n in range((b - a).days + 1)]
    if centre:
        days.sort(key=lambda d: abs((d - centre).days))
    return [d.strftime('%Y%m%d') for d in days]


# Results days (scheme/report publication) and a mid-window QP guess; refined by hits.
HINTS = {(y, False): d for y, d in {2016: '2016-08-18', 2017: '2017-08-16', 2018: '2018-08-15', 2019: '2019-08-15',
         2020: '2020-12-17', 2021: '2021-12-16', 2022: '2022-08-18', 2023: '2023-08-17', 2024: '2024-08-15',
         2025: '2025-08-14', 2026: '2026-08-13'}.items()}
HINTS.update({(y, True): f'{y}-10-12' if y in (2020, 2021) else f'{y}-06-05' for y in SERIES})


def date_of(url):
    d = re.search(r'(\d{8})\.pdf$', url).group(1)
    return f'{d[:4]}-{d[4:6]}-{d[6:]}'


def names(code, comp, kind, date):
    return [f'{code}_{comp}_{kind}_{date}.pdf', f'{code.lower()}-{comp}-{kind}-{date}.pdf']


def head(url):
    r = subprocess.run(['curl', '-sS', '-I', '-m', '25', '-o', '/dev/null', '-w', '%{http_code} %{content_type}', url],
                       capture_output=True, text=True)
    return r.stdout.strip()


def probe(candidates, workers):
    """Return the first candidate (in given order) answering 200 application/pdf."""
    chunk = workers * 4
    for i in range(0, len(candidates), chunk):
        batch = candidates[i:i + chunk]
        with concurrent.futures.ThreadPoolExecutor(workers) as pool:
            results = list(pool.map(head, batch))
        for url, res in zip(batch, results):
            if res.startswith('200') and 'pdf' in res:
                return url, i + batch.index(url) + 1
    return None, len(candidates)


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--known', type=Path, help='JSON list of known public URLs')
    p.add_argument('--output', type=Path, required=True)
    p.add_argument('--workers', type=int, default=6)
    a = p.parse_args()
    known = json.loads(a.known.read_text()) if a.known else []
    out = json.loads(a.output.read_text()) if a.output.exists() else {}
    for year, (series, qwin, rwin) in SERIES.items():
        for code, comps in COMPONENTS.items():
            if code == '9PH0' and year == 2016:
                continue  # first A-level certification is 2017
            for comp in comps:
                key = f'{code}_{comp}_{year}'
                rec = out.setdefault(key, {})
                qp_date = None
                for kind, prefixes in KINDS.items():
                    if rec.get(kind, {}).get('url') or rec.get(kind, {}).get('status') == 'not_found':
                        continue
                    stems = [f'{code}_{comp}_{px}_{year}'.lower() for px in prefixes] + [f'{code}-{comp}-{px}-{year}'.lower() for px in prefixes]
                    hit = next((u for u in known if any(u.lower().rsplit('/', 1)[-1].startswith(s) for s in stems)
                                and ((year in (2020, 2021)) == (u.rsplit('/', 1)[-1][-8:-6] in ('10', '11', '12', '01', '02')))), None)
                    if hit and head(hit).startswith('200'):
                        HINTS.setdefault((year, kind == 'question_paper'), date_of(hit))
                        rec[kind] = {'url': hit, 'status': 'verified_public_pdf', 'method': 'known_url'}
                    else:
                        win = qwin if kind == 'question_paper' else rwin
                        hint = HINTS.get((year, kind == 'question_paper'))
                        cands = []
                        for d in dates(year, win, dt.date.fromisoformat(hint) if hint else None):
                            for px in prefixes:
                                cands += [BASE + n for n in names(code, comp, px, d)]
                        url, tried = probe(cands, a.workers)
                        rec[kind] = ({'url': url, 'status': 'verified_public_pdf', 'method': 'name_probe', 'probes': tried}
                                     if url else {'status': 'not_found', 'probes': tried, 'window': win})
                    if rec[kind].get('url'):
                        HINTS[(year, kind == 'question_paper')] = date_of(rec[kind]['url'])
                    print(key, kind, rec[kind].get('url') or rec[kind]['status'], flush=True)
                    a.output.write_text(json.dumps(out, indent=1) + '\n')


if __name__ == '__main__':
    main()
