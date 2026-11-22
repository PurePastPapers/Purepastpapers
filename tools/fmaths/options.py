#!/usr/bin/env python3
"""Pearson Further Maths option-paper adjustments for the Maths extractor."""
import argparse
import gc
import json
import re
import subprocess
import sys
from concurrent.futures import ProcessPoolExecutor
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'maths'))
from extract import digest, extract
from schemes import scheme_regions

# The late tariffs are printed at y=773 on otherwise standard 842-point pages.
LOW_TARIFFS = {
    '3ba9fb408ebeb3f2e3a925b82ced9a37cd3acc1dc3cbfa2b1a9ecc47a9fa8315',
    '520349c68f4bb475cda1e78ed5de0c7148db9910cf00001a9153be6858b2ea2f',
}
SUBSET_CID = 'efdc2bd8dfb2f3b0e85a76f323107af239aa18d75eee5f9a1320422fece6d92c'

# One-based PDF page and top in points, immediately before the printed table.
SCHEME_STARTS = {
    # 2025 P4C prints the final first-row number outside the usual header column.
    '7ea10f6831c6f34b2daa9c45fbfb22d27083ab0b767257ec1570ec8cd3d67ca8':
        [(7, 58.38), (8, 58.38), (9, 58.38), (10, 58.38), (12, 58.38),
         (14, 58.38), (17, 58.38), (19, 58.38)],
    # 2023 P3B prints Qu6 and Qu7 without the intervening space.
    'e6850dcf0d36301fe929708a1aec9197a7bc72e73c45816a6ffa4babc0e923c0':
        [(6, 66.23), (7, 66.23), (8, 66.23), (9, 91.55), (10, 66.23), (11, 66.23), (12, 94)],
    # 2024 P3C begins several first rows with a diagram rather than the question number.
    'a97478ba162c51ecf161fa51f90f50a1e8f1e83829e7cc555ddbd4d993c1c7e3':
        [(6, 56.99), (8, 56.99), (9, 56.99), (11, 56.99), (13, 56.99), (14, 56.99), (17, 56.99)],
    # 2024 P3D abbreviates Qn or wraps Question and Marks over two rows.
    '84cde1c2552ffde16c47bc121cb0cbdeeb8ce3749cbfa844d701c90740ad82e3':
        [(6, 71), (8, 57), (10, 57), (13, 57), (15, 57), (17, 99), (21, 57)],
}


def answer_book_start(path, qualification, component):
    """Find the printed cover of a separately paginated bundled answer book."""
    output = subprocess.run(['pdftotext', '-layout', str(path), '-'], check=True, capture_output=True, text=True)
    cover = re.compile(r'\bAnswer Book\s+Total Marks\b', re.I)
    code = re.compile(rf'\b{qualification}\s*/\s*{component}\b', re.I)
    pages = [index for index, page in enumerate(output.stdout.split('\f'), 1)
             if index > 1 and cover.search(page) and code.search(page)]
    if len(pages) > 1:
        raise ValueError(f'Multiple answer book covers found in {path}: {pages}')
    return pages[0] if pages else None


def extract_option(paper, sources):
    pid = paper['paper_id']
    qp = sources / pid / 'question_paper.pdf'
    ms = sources / pid / 'mark_scheme.pdf'
    qp_sha = digest(qp)
    ms_sha = digest(ms)
    docs = paper['documents']
    if qp_sha != docs['question_paper']['sha256'] or ms_sha != docs['mark_scheme']['sha256']:
        raise ValueError(f'Source checksum mismatch: {pid}')
    qualification, component = paper['official_paper_code'].split('/')
    book_start = answer_book_start(qp, qualification, component) if component.endswith('D') else None
    if component.endswith('D') and book_start is None:
        raise ValueError(f'Decision answer-book cover missing: {pid}')
    candidate = extract(qp, page_limit=book_start - 1 if book_start else None,
                        footer_margin=50 if qp_sha in LOW_TARIFFS else 72,
                        cid_question_numbers=qp_sha == SUBSET_CID,
                        strict_labels=True, use_printed_total_as_tariff=True)
    scheme_starts = SCHEME_STARTS.get(ms_sha)
    candidate['scheme_regions'] = scheme_regions(ms, len(candidate['questions']), question_starts=scheme_starts)
    if book_start:
        candidate['answer_book_start_page'] = book_start
    candidate['extraction_version'] += '-fmaths-options-v1'
    return candidate


def run(job):
    paper, sources, output = job
    pid = paper['paper_id']
    try:
        candidate = extract_option(paper, sources)
    except Exception as exc:
        return pid, str(exc)
    target = output / (pid + '.json')
    target.write_text(json.dumps(candidate, ensure_ascii=False, indent=2) + '\n')
    questions = candidate['questions']
    counts = len(questions), sum(len(question['parts']) for question in questions), candidate['total_marks']
    return pid, counts, candidate['exceptions']


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('inventory', type=Path)
    parser.add_argument('sources', type=Path)
    parser.add_argument('output', type=Path)
    parser.add_argument('--paper', default='*')
    parser.add_argument('--workers', type=int, default=2)
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=True)
    inventory = json.loads(args.inventory.read_text())
    jobs = [(paper, args.sources, args.output) for paper in inventory['papers']
            if re.fullmatch(r'9FM0/[34][A-D]', paper['official_paper_code'])
            and Path(paper['paper_id']).match(args.paper)]
    if args.workers == 1:
        for job in jobs:
            print(*run(job), flush=True)
            gc.collect()
    else:
        with ProcessPoolExecutor(max_workers=args.workers, max_tasks_per_child=4) as pool:
            for result in pool.map(run, jobs):
                print(*result, flush=True)


if __name__ == '__main__':
    main()
