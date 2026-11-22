#!/usr/bin/env python3
"""Rebuild four Pearson feedback sections whose PDFs contain off-page spread content."""
import argparse
import hashlib
import json
import sys
from pathlib import Path


PAPERS = {
    'EDX_8PH0_2016_JUNE_02': [
        ('Question 10 (a)(i)', ('s3', 's4'), [8, 9], [('10', '(a)(i)')]),
    ],
    'EDX_8PH0_2017_JUNE_01': [
        ('Question 13 (a)', ('s17', 's18'), [30, 31, 32], [('13', '(a)')]),
        ('Question 14 (a) (b)', ('s20', 's21'), [36, 37, 38, 39], [('14', '(a)'), ('14', '(b)')]),
    ],
    'EDX_9PH0_2017_JUNE_02': [
        ('Question 20 (a)', ('s20', 's21'), [38, 39], [('20', '(a)')]),
    ],
}
# Transcribed from the side-by-side examiner comment and tip boxes on the cited pages.
BOXES = {
    ('EDX_8PH0_2016_JUNE_02', 's3'): [
        ('ex', 'This candidate has used the shrilk line to determine the stress but has misread the scale as 48. Their value is then used correctly in the equation so although the incorrect answer is given they will score one method mark.'),
        ('tip', 'Always show your working clearly. If this candidate had not shown their working they would have scored 0.'),
        ('ex', 'A clear correct answer. This candidate has remembered to convert MPa to Pa.'),
        ('tip', 'You need to be able to recognise and use prefixes to units.'),
    ],
    ('EDX_9PH0_2017_JUNE_02', 's20'): [
        ('ex', 'A correct method has been applied but the wrong time has been substituted, possibly by reading 0.35 from the graph and not noticing that the lowest given value is not 0.00. While a calculation based on s = vt would not be accepted, here it is clear that T refers to the period as it follows from 1/f. 2'),
        ('tip', 'When using graphs, read the scale values on either side of the point of interest to ensure you are using the scale correctly.'),
        ('ex', 'This is a fully correct response. 3'),
    ],
}


def visible_section_pages(extract, pdf):
    pages = extract.read_layout(pdf)
    for page in pages:
        width, height = page['width'], page['height']
        page['lines'] = [l for l in page['lines'] if
                         0 <= l['left'] < l['right'] <= width + 2 and
                         0 <= l['top'] and l['top'] + l['height'] <= height + 2]
        page['images'] = [im for im in page['images'] if
                          0 <= im['left'] and im['left'] + im['width'] <= width + 2 and
                          0 <= im['top'] and im['top'] + im['height'] <= height + 2]
    return extract.split_report(pages)['sections']


def repair_report(extract, from_repo, pdf_dir, output, paper_id, fixes):
    relpath = Path('data/reports/physics') / f'{paper_id}.json'
    report = json.loads((from_repo / relpath).read_text())
    pdf = pdf_dir / f'{paper_id}.pdf'
    if hashlib.sha256(pdf.read_bytes()).hexdigest() != report['source_sha256']:
        raise ValueError(f'{paper_id}: source checksum changed')
    source_sections = visible_section_pages(extract, pdf)
    by_heading = {s['heading']: s for s in source_sections}
    for heading, ids, pages, targets in fixes:
        source = by_heading[heading]
        existing = [i for i, section in enumerate(report['sections']) if section['id'] in ids]
        first = existing[0]
        section = {
            'id': ids[0],
            'heading': heading,
            'targets': [{'q': q, 'part': part} for q, part in targets],
            'pages': pages,
            'paras': [{key: para[key] for key in ('k', 't')} for para in source['paras']],
            'figures': source['figures'],
        }
        if (paper_id, ids[0]) in BOXES:
            section['paras'] = [p for p in section['paras'] if p['k'] == 'p']
            section['paras'].extend({'k': kind, 't': text} for kind, text in BOXES[paper_id, ids[0]])
        report['sections'] = [s for s in report['sections'] if s['id'] not in ids]
        report['sections'].insert(first, section)
    target = output / relpath
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(json.dumps(report, ensure_ascii=False, indent=1) + '\n')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('pdf_dir', type=Path, help='directory of original <paper_id>.pdf files')
    parser.add_argument('--repo', type=Path, default=Path(__file__).resolve().parents[2])
    parser.add_argument('--output', type=Path, help='write report data here (defaults to repository)')
    args = parser.parse_args()
    repo = args.repo.resolve()
    output = args.output.resolve() if args.output else repo
    sys.path.insert(0, str(repo / 'tools/reports'))
    import extract

    for paper_id, fixes in PAPERS.items():
        repair_report(extract, repo, args.pdf_dir, output, paper_id, fixes)


if __name__ == '__main__':
    main()
