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
    # 2023 P3C Q7 starts after a diagram that pushes 7(a) down the page.
    # The usual anchor finder first sees 7(c) alt, two pages later.
    '36f876efe283c1408857792d7e910a5a987c5ecf19ee54606fe50f0c7e4806e4':
        [(6, 56.79), (8, 55.35), (9, 56.79), (11, 56.79), (14, 56.79), (17, 55.35), (20, 56.79)],
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


# Bounds below use one-based PDF pages and y coordinates in PDF points.
# Keep each correct method and its relevant notes while omitting sibling solutions.
PART_SCHEME_REGIONS = {
    'ba1e55b70c1a45bf864998e23a4f718a291d77c98fca61dd89dd799accdef110': {
        # The (ii) label is aligned with the (i) subtotal, above its own marks.
        ('2', '(b)(i)', 3): [(7, 168, 228), (7, 588, 622)],
        ('2', '(b)(ii)', 1): [(7, 227, 290), (7, 622, 639)],
    },
    'ff5817615a54aeb2ad4da7e366a657c52777db91ed305d4c26b840679b89491a': {
        ('1', '(b)', 3): [(5, 262, 643), (6, 53, 207)],
    },
    '8434ecf039ed75a1530d5b82d9a7bd314f0918cd31c2fb694230f2ea35cbf7bd': {
        ('1', '(a)', 6): [(5, 81, 329), (5, 456, 612)],
    },
    'abb2b9bb35e40a29641a40b4618303d964d283b95fcee4208368e87366dab147': {
        ('3', '(c)', 4): [(8, 222, 345), (8, 594, 688)],
        ('6', '(b)(i)', 2): [(11, 168, 245), (12, 116, 190), (12, 540, 641)],
        ('6', '(b)(ii)', 4): [(11, 245, 411), (12, 190, 327),
                               (12, 540, 590), (12, 647, 773)],
    },
    '316ff572ad81d1bb24224afde051b010f6bda4c58a75aed7e07790394a5a97ed': {
        ('1', '(a)', 4): [(6, 41, 217), (6, 377, 608)],
        # The (b) label is below its own scoring rows in Pearson's source.
        ('1', '(b)', 2): [(6, 217, 356), (6, 608, 698)],
        # The unlabelled (7) underneath the (3) is the combined question total.
        ('2', '(b)', 3): [(7, 237, 381), (7, 670, 780), (8, 40, 123)],
    },
    '36f876efe283c1408857792d7e910a5a987c5ecf19ee54606fe50f0c7e4806e4': {
        ('1', '(b)', 2): [(6, 208, 550), (6, 742, 772), (7, 54, 338)],
        ('5', '(a)', 8): [(14, 54, 761), (15, 54, 183),
                          (15, 382, 773), (16, 54, 383)],
        ('7', '(a)', 4): [(20, 54, 386), (21, 214, 443)],
    },
    'e8ddf04df9f65aaa4c9601687590e2da9acd794e707bd23f507c76df9645a4fa': {
        # The (c) label appears beside the final (b) method row.
        ('8', '(b)', 7): [(20, 155, 519), (20, 685, 803), (21, 54, 253)],
        ('8', '(c)', 1): [(20, 519, 589), (21, 253, 374)],
    },
}


def reviewed_option_part_scheme(checksum, number, labels, marks, page_size):
    """Return visually checked crops only for the exact reviewed source revision."""
    if len(labels) != 1:
        return None
    boxes = PART_SCHEME_REGIONS.get(checksum, {}).get((str(number), labels[0], marks))
    if not boxes:
        return None
    regions = []
    for page, top, bottom in boxes:
        width, height = page_size(page)
        regions.append({'page': page, 'bbox': [25 / width, top / height,
                                               1 - 25 / width, bottom / height]})
    return regions


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
    # The long inline (i) and its indented (ii) have one shared tariff.
    joint_tariff = {
        '726c9c9655a8b0de3f44245b461b87de0b49273697b23b538d98d8ead984de5e': 0,
        '3ba9fb408ebeb3f2e3a925b82ced9a37cd3acc1dc3cbfa2b1a9ecc47a9fa8315': 6,
    }.get(qp_sha)
    if joint_tariff is not None:
        tariff = candidate['questions'][joint_tariff]['parts'][0]
        tariff.update(part_label='(a)', joint_labels=['a', 'i', 'ii'],
                      printed_labels=['(a)(i)', '(a)(ii)'])
    # 2025 P4A Q1 prints a spare copy of the already-present Cayley grid.
    # Its redundant answer-space page is unnecessary in full and part crops.
    if pid == 'EDX_9FM0_2025_JUNE_P4A' and 'Only use this grid' in candidate['questions'][0]['text']:
        question = candidate['questions'][0]
        question['regions'] = [r for r in question['regions'] if r['page'] != 5]
        question['text'] = question['text'].split('Only use this grid', 1)[0].strip()
    # 2020 P4A Q6(d) alone needs the unshaded diagram on page 23. Its
    # reviewed answer-book insert excludes the spare copy and writing lines.
    if pid == 'EDX_9FM0_2020_AUTUMN_P4A':
        question = candidate['questions'][5]
        if 'Spare copy of Diagram 1' in question['text']:
            question['regions'] = [r for r in question['regions'] if r['page'] != 23]
            question['text'] = question['text'].rsplit('\nDiagram 1\nSpare copy of Diagram 1', 1)[0]
    scheme_starts = SCHEME_STARTS.get(ms_sha)
    scheme_last_page = 22 if ms_sha == '36f876efe283c1408857792d7e910a5a987c5ecf19ee54606fe50f0c7e4806e4' else None
    candidate['scheme_regions'] = scheme_regions(ms, len(candidate['questions']), question_starts=scheme_starts,
                                                 page_limit=scheme_last_page)
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
