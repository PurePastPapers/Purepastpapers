#!/usr/bin/env python3
"""Download AQA Psychology source PDFs into an immutable cache and verify them.

Usage: fetch.py RECORDS_JSON --dest DIR
Keeps question papers, mark schemes, inserts (all variants, because some standard
inserts are copyright-removed or not listed), examiner reports and sample answers.
Skips modified question papers (same questions) and NEA forms. Every file must start
with %PDF and match AQA's published sha1; existing verified files are not refetched.
"""
import argparse
import hashlib
import json
import re
import time
import urllib.request
from pathlib import Path

KEEP = re.compile(r'^AQA-7181[12]|^AQA-7182[123]')
SKIP_MODIFIED_QP = re.compile(r'-(S?QP)-.*MQP|-MQP.*-QP-|QP-MQP|QP-JUN\d\d-MQP')


def sha(path, algo):
    return hashlib.new(algo, Path(path).read_bytes()).hexdigest()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('records')
    ap.add_argument('--dest', required=True)
    a = ap.parse_args()
    dest = Path(a.dest)
    dest.mkdir(parents=True, exist_ok=True)
    for r in json.load(open(a.records)):
        name = r['file_name']
        if not KEEP.match(name) or not name.upper().endswith('.PDF') or SKIP_MODIFIED_QP.search(name):
            continue
        out = dest / name
        if out.exists() and sha(out, 'sha1') == r['publisher_sha1']:
            continue
        for attempt in range(4):
            try:
                req = urllib.request.Request(r['url'], headers={'User-Agent': 'Mozilla/5.0'})
                out.write_bytes(urllib.request.urlopen(req, timeout=120).read())
                break
            except Exception as e:  # network retry with backoff
                print('retry', name, e)
                time.sleep(2 ** attempt)
        data = out.read_bytes()
        assert data[:5] == b'%PDF-', name
        assert hashlib.sha1(data).hexdigest() == r['publisher_sha1'], name
        print('ok', name, len(data))


main()
