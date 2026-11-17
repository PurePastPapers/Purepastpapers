#!/usr/bin/env python3
"""List the file records embedded in AQA's public assessment-resources page.

Usage: resources.py PAGE_HTML [PAGE_HTML ...] > records.json
Each record: title, originalFilename, sha1, size, cdn url, publicationDate. Records
are deduplicated by sha1. This reads only the public page; nothing behind a login.
"""
import json
import re
import sys

REC = re.compile(r'"asset":\{[^{}]*?"originalFilename":"([^"]+)"[^{}]*?"sha1hash":"([0-9a-f]{40})","size":(\d+)[^{}]*?"url":"([^"]+)"\}\},"publicationDate":"([^"]*)"[^{}]*?"title":"([^"]*)"')

out = {}
for path in sys.argv[1:]:
    html = open(path, encoding='utf-8').read().replace('\\"', '"')
    for name, sha1, size, url, date, title in REC.findall(html):
        out[sha1] = {'file_name': name, 'publisher_sha1': sha1, 'bytes': int(size), 'url': url,
                     'publication_date': date, 'title': title, 'page': path.split('/')[-1]}
json.dump(sorted(out.values(), key=lambda r: r['file_name']), sys.stdout, indent=1)
