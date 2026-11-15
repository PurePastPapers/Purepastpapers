#!/usr/bin/env python3
"""Acquire public inventory PDFs with resumable checksums; never fetch secure paths."""
import argparse
import concurrent.futures
import hashlib
import json
import subprocess
from pathlib import Path
from urllib.parse import quote, urlparse


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('inventory', type=Path)
    parser.add_argument('--cache', type=Path, required=True)
    parser.add_argument('--workers', type=int, default=6)
    args = parser.parse_args()
    args.cache.mkdir(parents=True, exist_ok=True)
    inventory = json.loads(args.inventory.read_text())
    jobs = []
    for paper in inventory.get('papers', []):
        for kind, doc in paper.get('documents', {}).items():
            url = doc.get('url', '')
            if not url or '/secure/' in url or doc.get('availability') in ['restricted', 'not_found']:
                continue
            jobs.append((paper['paper_id'] + '__' + kind, doc))
    for i, doc in enumerate(inventory.get('specification_mapping_documents', [])):
        jobs.append(('mapping_' + str(i + 1), doc))
    for doc in inventory.get('specification_and_sample_candidates', []):
        if doc.get('title') == 'A level Mathematics Specification':
            jobs.append(('9ma0_specification_issue4', doc))

    def acquire(job):
        key, doc = job
        url = quote(doc['url'], safe=':/%?=&')
        parsed = urlparse(url)
        if parsed.scheme != 'https' or parsed.username or parsed.password or '/secure/' in parsed.path:
            return key, {'status': 'rejected_source', 'url': url}
        target = args.cache / (key + '.pdf')
        expected = doc.get('sha256')
        if target.exists():
            data = target.read_bytes()
            if data[:4] == b'%PDF' and (not expected or hashlib.sha256(data).hexdigest() == expected):
                return key, {'status': 'verified', 'sha256': hashlib.sha256(data).hexdigest(), 'bytes': len(data), 'url': url}
        temp = target.with_suffix('.download')
        result = subprocess.run(['curl', '-fLsS', '--retry', '2', '--connect-timeout', '15', '--max-time', '90', url, '-o', str(temp)], capture_output=True, text=True)
        if result.returncode:
            return key, {'status': 'download_error', 'url': url, 'error': result.stderr.strip()[:300]}
        data = temp.read_bytes()
        checksum = hashlib.sha256(data).hexdigest()
        if data[:4] != b'%PDF' or (expected and checksum != expected):
            temp.unlink(missing_ok=True)
            return key, {'status': 'source_revision_or_non_pdf', 'url': url, 'actual_sha256': checksum}
        temp.replace(target)
        return key, {'status': 'verified', 'sha256': checksum, 'bytes': len(data), 'url': url}

    ledger = {}
    with concurrent.futures.ThreadPoolExecutor(max_workers=args.workers) as pool:
        for key, result in pool.map(acquire, jobs):
            ledger[key] = result
            temp = args.cache / 'acquisition.tmp'
            temp.write_text(json.dumps(ledger, indent=2) + '\n')
            temp.replace(args.cache / 'acquisition.json')
            print(key, result['status'], flush=True)
    failures = [key for key, value in ledger.items() if value['status'] != 'verified']
    print(json.dumps({'verified': len(ledger) - len(failures), 'failed': failures}))
    raise SystemExit(bool(failures))


if __name__ == '__main__':
    main()
