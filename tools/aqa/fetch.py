#!/usr/bin/env python3
"""Download AQA public source PDFs into an immutable, resumable cache and verify them.

Usage: fetch.py RECORDS_JSON --dest DIR --keep REGEX [--skip REGEX]
RECORDS_JSON comes from tools/aqa/resources.py (AQA's public assessment-resources page).
A file is kept when its name matches --keep and not --skip. Every file must start with
%PDF and match AQA's published sha1; verified files already in DIR are not refetched.
Modified question papers and inserts (large print / A3, same questions) are skipped by default.
"""
import argparse
import hashlib
import json
import re
import time
import urllib.request
from pathlib import Path

MODIFIED = re.compile(r'MQP', re.I)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('records')
    ap.add_argument('--dest', required=True)
    ap.add_argument('--keep', required=True)
    ap.add_argument('--skip', default=None)
    a = ap.parse_args()
    dest = Path(a.dest)
    dest.mkdir(parents=True, exist_ok=True)
    keep, skip = re.compile(a.keep), re.compile(a.skip) if a.skip else None
    n = bad = 0
    for r in json.load(open(a.records)):
        name = r['file_name']
        if not keep.search(name) or not name.upper().endswith('.PDF') or MODIFIED.search(name) or (skip and skip.search(name)):
            continue
        out = dest / name
        if out.exists() and hashlib.sha1(out.read_bytes()).hexdigest() == r['publisher_sha1']:
            n += 1
            continue
        for attempt in range(4):
            try:
                req = urllib.request.Request(r['url'], headers={'User-Agent': 'Mozilla/5.0'})
                out.write_bytes(urllib.request.urlopen(req, timeout=120).read())
                break
            except Exception as e:
                print('retry', name, e)
                time.sleep(2 ** attempt)
        data = out.read_bytes()
        if data[:5] != b'%PDF-' or hashlib.sha1(data).hexdigest() != r['publisher_sha1']:
            print('BAD', name)
            bad += 1
            continue
        n += 1
    print('verified', n, 'bad', bad)


main()
