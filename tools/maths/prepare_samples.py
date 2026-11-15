#!/usr/bin/env python3
"""Create private, faithful page-extraction caches from official combined SAMs PDFs.

These are pipeline intermediates, not new or rewritten assessment documents.
The manifest retains original source SHA256, ZIP entry, PDF page ranges and offsets.
Requires pypdf. Example: prepare_samples.py INVENTORY --output ../sam-sources
"""
import argparse
import hashlib
import json
from pathlib import Path
from pypdf import PdfReader, PdfWriter


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def prepare(inventory, output):
    output.mkdir(parents=True, exist_ok=True)
    records = []
    for paper in inventory['papers']:
        for kind in ['question_paper', 'mark_scheme']:
            doc = paper['documents'][kind]
            source = Path(doc['local_path'])
            if sha(source) != doc['sha256']:
                raise ValueError(f'Original source checksum changed: {source}')
            first, last = doc['source_pages_inclusive']
            reader = PdfReader(source)
            if first < 1 or last < first or last > len(reader.pages):
                raise ValueError(f'Invalid source page range: {paper["paper_id"]}')
            path = output / f'{paper["paper_id"]}__{kind}.pdf'
            writer = PdfWriter()
            for page in reader.pages[first - 1:last]:
                writer.add_page(page)
            writer.add_metadata({'/Title': f'Private source page extraction: {paper["paper_id"]} {kind}',
                                 '/Subject': f'Original source PDF pages {first}-{last}; no content rewritten'})
            with path.open('wb') as stream:
                writer.write(stream)
            records.append({'paper_id': paper['paper_id'], 'kind': kind,
                            'cache_file': str(path.resolve()), 'cache_sha256': sha(path),
                            'original_source_file': str(source.resolve()),
                            'original_source_sha256': doc['sha256'],
                            'original_source_url': doc['url'],
                            'source_zip_entry': doc.get('source_zip_entry'),
                            'source_pages_inclusive': [first, last],
                            'original_page_offset': first - 1,
                            'operation': 'faithful source page extraction; no question rewriting'})
    manifest = output / 'source-page-provenance.json'
    manifest.write_text(json.dumps({'records': records}, indent=2) + '\n')
    return records


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('inventory', type=Path)
    parser.add_argument('--output', required=True, type=Path)
    args = parser.parse_args()
    records = prepare(json.loads(args.inventory.read_text()), args.output)
    for row in records:
        print(row['paper_id'], row['kind'], row['source_pages_inclusive'])
