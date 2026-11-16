#!/usr/bin/env python3
"""Discover public Pearson 9HI0 Route H exam-material PDFs (1H, 2H, 33) by published name.

Reuses tools/physics/discover.py (HEAD only, nothing under /secure/, first PDF wins,
misses recorded as evidence) with History's folder, components and series. The Paper
2 booklet 9HI0/2H holds both 2H.1 and 2H.2; only 2H.2 is imported.
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'physics'))
import discover  # noqa: E402

discover.BASE = 'https://qualifications.pearson.com/content/dam/pdf/A-Level/History/2015/Exam-materials/'
discover.SERIES = {y: v for y, v in discover.SERIES.items() if y >= 2017}
discover.COMPONENTS = {'9HI0': ['1H', '2H', '33']}
# Pearson History papers have dated QPs within the series window; schemes and reports on results day.
discover.HINTS.update({(y, True): {2017: '2017-06-07', 2018: '2018-06-08', 2019: '2019-06-07', 2020: '2020-10-09',
                                   2021: '2021-10-08', 2022: '2022-06-07', 2023: '2023-05-25', 2024: '2024-05-24',
                                   2025: '2025-05-23', 2026: '2026-05-22'}[y] for y in discover.SERIES})

# Lower-case names (2022 on) lower-case the option letter too: 9hi0-1h-que-YYYYMMDD.pdf.
discover.names = lambda code, comp, kind, date: [f'{code}_{comp}_{kind}_{date}.pdf', f'{code.lower()}-{comp.lower()}-{kind}-{date}.pdf']

if __name__ == '__main__':
    discover.main()
