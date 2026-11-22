#!/usr/bin/env python3
"""Correct the nine bare labels in Pearson AS Biology Paper 1, June 2025."""
import argparse
import hashlib
import json
from pathlib import Path
import shutil
import sys
import tempfile

PAPER_ID = 'EDX_8BN0_2025_JUNE_01'
SOURCE_SHA = '76395f1d23ad536fb16f766b16ac2eccccca6e0fc2c0f1168dd3da83f9bff309'
BARE_LABELS = {
    6: {'4c', '5ai', '5aii', '5aiv', '5bi'},
    8: {'6bi', '6bii', '6c', '6di'},
}
HEADINGS = ['Q04b', '4c', '5ai', '5aii', '5aiv', '5bi', 'Q05bii',
            'Q06aii', '6bi', '6bii', '6c', '6di', 'Q06dii']


def repair(extract, repo, pdf, output):
    if hashlib.sha256(pdf.read_bytes()).hexdigest() != SOURCE_SHA:
        raise ValueError('Checksum differs from the verified Pearson PDF')
    relpath = Path('data/reports/biology') / f'{PAPER_ID}.json'
    report = json.loads((repo / relpath).read_text())
    if report['source_sha256'] != SOURCE_SHA:
        raise ValueError('Existing report does not match the verified PDF')

    pages = extract.read_layout(pdf)
    for page_no, labels in BARE_LABELS.items():
        page = pages[page_no - 1]
        found = set()
        for line in page['lines']:
            if line['left'] == 128 and line['text'] in labels:
                found.add(line['text'])
                line['text'] = 'Q' + line['text']
                line['bold'] = True
                line['math'] = False
        if found != labels:
            raise ValueError(f'Verified bare headings changed on PDF page {page_no}')
    sections = extract.split_report(pages)['sections']
    start = next(i for i, s in enumerate(sections) if s['heading'] == 'Q04b')
    end = next(i for i, s in enumerate(sections) if s['heading'] == 'Q06dii')
    replacement = sections[start:end + 1]
    for index, section in enumerate(replacement, 1):
        if section['heading'][1:] in BARE_LABELS[6] | BARE_LABELS[8]:
            section['heading'] = section['heading'][1:]
        section['id'] = f's11v{index}'
    if [s['heading'] for s in replacement] != HEADINGS:
        raise ValueError('Report headings differ from the verified source sequence')

    with tempfile.TemporaryDirectory() as tmp:
        scratch = Path(tmp)
        extract.REPO = scratch
        extract.PAGE_WIDTHS.clear()
        extract.PAGE_WIDTHS.update({p['number']: p['width'] for p in pages})
        extract.crop_maths({'sections': replacement}, pdf, 'biology', PAPER_ID)
        for crop in (scratch / 'data/reports/biology/img').glob('*.webp'):
            target = output / crop.relative_to(scratch)
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(crop, target)

    current = report['sections']
    start = next(i for i, s in enumerate(current) if s['heading'] == 'Q04b')
    end = next(i for i, s in enumerate(current) if s['heading'] == 'Q06dii')
    current[start:end + 1] = replacement
    target = output / relpath
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(json.dumps(report, ensure_ascii=False, indent=1) + '\n')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('pdf', type=Path, help='verified original Pearson PDF')
    parser.add_argument('--repo', type=Path, default=Path(__file__).resolve().parents[2])
    parser.add_argument('--output', type=Path, help='write report data here (defaults to repository)')
    args = parser.parse_args()
    repo = args.repo.resolve()
    sys.path.insert(0, str(repo / 'tools/reports'))
    import extract
    repair(extract, repo, args.pdf, args.output.resolve() if args.output else repo)


if __name__ == '__main__':
    main()
