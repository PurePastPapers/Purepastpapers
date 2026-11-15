#!/usr/bin/env python3
"""Split Pearson's official Physics SAM collations into private per-component caches.

Adapted from tools/maths/prepare_samples.py. These are pipeline intermediates, not
new or rewritten assessment documents: each cache is the inventory's page range of
the original collation. Landscape mark-scheme tables are set sideways on portrait
pages, so scheme ranges may carry rotate_degrees; only the page /Rotate entry is
changed, never content. The manifest keeps original checksums and page ranges.

Example: prepare_samples.py data/imports/physics/inventory/9ph0-samples-inventory.json \
    --originals ../physics-research/sam-originals --output ../physics-research/sources
"""
import argparse
import hashlib
import json
from pathlib import Path
from urllib.parse import unquote
from pypdf import PdfReader, PdfWriter


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def prepare(inventory, originals, output):
    output.mkdir(parents=True, exist_ok=True)
    manifest = output / 'source-page-provenance.json'
    records = json.loads(manifest.read_text())['records'] if manifest.exists() else []
    for paper in inventory['papers']:
        for kind in ['question_paper', 'mark_scheme']:
            doc = paper['documents'][kind]
            source = originals / unquote(doc['url'].rsplit('/', 1)[1])
            if sha(source) != doc['sha256']:
                raise ValueError(f'Original source checksum changed: {source.name}')
            first, last = doc['source_pages_inclusive']
            reader = PdfReader(source)
            if first < 1 or last < first or last > len(reader.pages):
                raise ValueError(f'Invalid source page range: {paper["paper_id"]}')
            path = output / f'{paper["paper_id"]}__{kind}.pdf'
            writer = PdfWriter()
            for page in reader.pages[first - 1:last]:
                writer.add_page(page)
                if doc.get('rotate_degrees'):
                    writer.pages[-1].rotate(doc['rotate_degrees'])
            writer.add_metadata({'/Title': f'Private source page extraction: {paper["paper_id"]} {kind}',
                                 '/Subject': f'Original source PDF pages {first}-{last}; no content rewritten'})
            # A fixed file identifier keeps the cache byte-stable, so published
            # question identities (which record its checksum) survive a rebuild.
            ident = hashlib.md5(f'{doc["sha256"]}:{first}:{last}:{kind}'.encode()).digest()
            from pypdf.generic import ArrayObject, ByteStringObject
            writer._ID = ArrayObject([ByteStringObject(ident), ByteStringObject(ident)])
            with path.open('wb') as stream:
                writer.write(stream)
            records = [r for r in records if not (r['paper_id'] == paper['paper_id'] and r['kind'] == kind)]
            records.append({'paper_id': paper['paper_id'], 'kind': kind, 'cache_sha256': sha(path),
                            'original_source_sha256': doc['sha256'], 'original_source_url': doc['url'],
                            'source_pages_inclusive': [first, last], 'original_page_offset': first - 1,
                            'rotate_degrees': doc.get('rotate_degrees', 0),
                            'operation': 'faithful source page extraction; no question rewriting'})
    manifest.write_text(json.dumps({'records': records}, indent=2) + '\n')
    return records


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('inventory', type=Path)
    parser.add_argument('--originals', required=True, type=Path)
    parser.add_argument('--output', required=True, type=Path)
    args = parser.parse_args()
    for row in prepare(json.loads(args.inventory.read_text()), args.originals, args.output):
        print(row['paper_id'], row['kind'], row['source_pages_inclusive'], row['cache_sha256'][:12])
