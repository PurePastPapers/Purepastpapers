#!/usr/bin/env python3
"""Discover public Pearson 9ET0/8ET0 English Literature exam-material PDFs by published name.

Reuses tools/physics/discover.py (HEAD only, nothing under /secure/, first PDF wins,
misses recorded as evidence) with English Literature's folder, components and series.
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'physics'))
import discover  # noqa: E402

discover.BASE = 'https://qualifications.pearson.com/content/dam/pdf/A-Level/English-Literature/2015/Exam-materials/'
discover.COMPONENTS = {'9ET0': ['01', '02', '03'], '8ET0': ['01', '02']}

if __name__ == '__main__':
    discover.main()
