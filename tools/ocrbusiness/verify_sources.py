#!/usr/bin/env python3
"""Verify the immutable OCR Business cache against recorded publisher identities."""
import argparse
from collections import Counter
from hashlib import sha256
import json
from pathlib import Path
import fitz

ROOT = Path(__file__).resolve().parents[2]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--sources', type=Path, required=True)
    args = parser.parse_args()
    rows = json.loads((ROOT / 'data/imports/ocrbusiness/sources.json').read_text())
    for source in rows:
        path = args.sources / (source['source_id'] + '.pdf')
        if not path.exists():
            path = args.sources / source['official_url'].rsplit('/', 1)[-1]
        data = path.read_bytes()
        assert data.startswith(b'%PDF-'), path
        assert sha256(data).hexdigest() == source['sha256'], path
        doc = fitz.open(stream=data, filetype='pdf')
        assert len(doc) == source['pages'], path
        assert doc[0].get_text() == source['printed_cover'], path
    by_id = {s['source_id']: s for s in rows}
    assert by_id['752991']['sha256'] == by_id['758296']['sha256']
    assert by_id['752992']['sha256'] == by_id['727262']['sha256']
    assert by_id['752992']['rejected']
    assert '14 May 2024' in by_id['752992']['printed_cover']
    assert '13 May 2025' in by_id['752991']['printed_cover']
    print(f'{len(rows)} source revisions verified; wrong 2024 insert rejected; duplicate 2025 QP confirmed.')
    print(dict(Counter(s['role'] for s in rows)))


if __name__ == '__main__':
    main()
