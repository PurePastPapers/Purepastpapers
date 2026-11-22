#!/usr/bin/env python3
"""Extract Edexcel AS Further Maths with the Maths geometry and scheme indexers."""
import argparse
from concurrent.futures import ProcessPoolExecutor
import fnmatch
import json
from pathlib import Path

from as_sources import restore_as_lead_ins, reviewed_scheme_regions, scan_candidate
from options import answer_book_start, digest, extract, scheme_regions

# These original Pearson answer-book covers predate the modern cover wording.
EARLY_ANSWER_BOOK_STARTS = {
    'EDX_8FM0_2018_JUNE_27': 9,
    'EDX_8FM0_2018_JUNE_28': 9,
    'EDX_8FM0_2019_JUNE_27': 9,
    'EDX_8FM0_2019_JUNE_28': 5,
}


def extract_as(paper, sources):
    paper_id = paper['paper_id']
    qp = sources / paper_id / 'question_paper.pdf'
    ms = sources / paper_id / 'mark_scheme.pdf'
    for kind, path in [('question_paper', qp), ('mark_scheme', ms)]:
        source = paper['documents'][kind]
        if source['availability'] != 'verified_public' or digest(path) != source.get('cache_sha256', source['sha256']):
            raise ValueError(f'Unexpected Pearson {kind} revision for {paper_id}')
    book_start = None
    if not paper.get('is_sample') and paper['module_ids'][0] in ('D1', 'D2'):
        book_start = EARLY_ANSWER_BOOK_STARTS.get(paper_id) or answer_book_start(qp, '8FM0', paper['official_paper_code'].split('/')[1])
        if book_start is None:
            raise ValueError(f'Answer-book cover missing for {paper_id}')
    candidate = scan_candidate(paper_id, qp)
    if candidate is None:
        candidate = extract(qp, page_limit=book_start - 1 if book_start else None,
                            strict_labels=True, use_printed_total_as_tariff=True)
        candidate['extraction_version'] += '-fmaths-as-v1'
        restore_as_lead_ins(paper_id, qp, candidate)
    if book_start:
        candidate['answer_book_start_page'] = book_start
    count = len(candidate['questions'])
    candidate['scheme_regions'] = reviewed_scheme_regions(paper_id, ms, count) or scheme_regions(ms, count)
    return candidate


def run(job):
    paper, sources, output = job
    paper_id = paper['paper_id']
    try:
        candidate = extract_as(paper, sources)
        target = output / (paper_id + '.json')
        target.write_text(json.dumps(candidate, ensure_ascii=False, indent=2) + '\n')
        questions = candidate['questions']
        counts = (len(questions), sum(len(question['parts']) for question in questions), candidate['total_marks'])
        return paper_id, counts, candidate['exceptions']
    except Exception as exc:
        return paper_id, None, [str(exc)]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('inventory', type=Path)
    parser.add_argument('sources', type=Path)
    parser.add_argument('output', type=Path)
    parser.add_argument('--paper', default='EDX_8FM0_*')
    parser.add_argument('--workers', type=int, default=2)
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=True)
    papers = json.loads(args.inventory.read_text())['papers']
    jobs = [(paper, args.sources, args.output) for paper in papers
            if paper['qualification_code'] == '8FM0' and fnmatch.fnmatchcase(paper['paper_id'], args.paper)]
    if not jobs:
        parser.error('No AS Further Maths papers matched')
    with ProcessPoolExecutor(max_workers=args.workers) as pool:
        failures = 0
        for paper_id, counts, exceptions in pool.map(run, jobs):
            print(paper_id, counts, exceptions, flush=True)
            failures += bool(exceptions)
    return int(bool(failures))


if __name__ == '__main__':
    raise SystemExit(main())
