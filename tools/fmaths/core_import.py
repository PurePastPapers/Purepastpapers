#!/usr/bin/env python3
"""Extract the source geometry and printed allocations for Edexcel 9FM0 Core Pure exams.

This wrapper uses the 9MA0 pipeline and restores the few Core Pure labels that
the shared extractor cannot infer from the PDFs' text layers. Its output still
requires per-part review annotations and a rendered-crop audit before activation.
"""
import argparse
import json
import re
import sys
from pathlib import Path

import pdfplumber

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'tools/maths'))
from extract import digest, extract
from schemes import scheme_regions

PILOT = 'EDX_9FM0_2024_JUNE_P1'
PILOT_SOURCE = '74e1b1d4c256802c0817fdc942d7293197795f91beaa433a19b5a5f932d17f63'
PILOT_SCHEME = 'f984b6b819d773127055fcc52857f8668b298f271d81aea842ba76278890f17e'
TYPE3 = 'EDX_9FM0_2019_JUNE_P1'
TYPE3_LABEL = re.compile(r'^\(cid:11\)\(cid:(6[89]|7[0-4])\)\(cid:12\)')
ROMAN = ('i', 'ii', 'iii', 'iv', 'v', 'vi')

# Pearson occasionally nests letters below a Roman numeral. A shared tariff
# covering all of (i)(a)-(i)(b) is labelled (i), with both printed paths retained.
LABELS = {
    ('EDX_9FM0_2021_AUTUMN_P1', '4'): ('(i)', '(ii)', '(iii)'),
    ('EDX_9FM0_2021_AUTUMN_P1', '5'): ('(i)', '(ii)(a)', '(ii)(b)'),
    ('EDX_9FM0_2021_AUTUMN_P2', '8'): ('(i)', '(ii)(a)', '(ii)(b)'),
    ('EDX_9FM0_2022_JUNE_P1', '9'): ('(i)(a)', '(i)(b)', '(ii)'),
    ('EDX_9FM0_2025_JUNE_P1', '9'): ('(i)(a)', '(i)(b)', '(i)(c)', '(ii)'),
    ('EDX_9FM0_2025_JUNE_P2', '4'): ('(i)', '(ii)(a)', '(ii)(b)'),
}


def recover_type3_starts(candidate, question_pdf):
    """Identify the original (a), (b), … at x≈65 in the June 2019 CID font."""
    with pdfplumber.open(question_pdf) as pdf:
        for question in candidate['questions']:
            parts = question['parts']
            if len(parts) == 1:
                continue
            page_number = question['regions'][0]['page']
            words = pdf.pages[page_number - 1].extract_words(extra_attrs=['fontname'])
            starts = []
            for word in words:
                if 60 < word['x0'] < 72 and (match := TYPE3_LABEL.match(word['text'])):
                    starts.append((word, chr(int(match[1]) + 29)))
            expected = [chr(ord('a') + index) for index in range(len(parts))]
            if [label for _, label in starts] != expected:
                raise ValueError(f"{TYPE3} Q{question['number']}: CID labels differ from printed order")
            for part, (word, label) in zip(parts, starts):
                part.update(part_label=f'({label})', joint_labels=[label],
                            start={'label': label, 'page': page_number, 'top': word['top'],
                                   'x': word['x0'], 'fragment': 0})


def normalize_parts(paper_id, question):
    overrides = LABELS.get((paper_id, question['number']))
    parts = question['parts']
    if overrides and len(overrides) != len(parts):
        raise ValueError(f"{paper_id} Q{question['number']}: allocation count changed")
    for index, part in enumerate(parts):
        label = part['part_label']
        joint = part.get('joint_labels', [])
        printed = [label] if label else []
        if len(joint) > 2 and joint[0] in 'abcdefgh' and all(leaf in ROMAN for leaf in joint[1:]):
            label = f'({joint[0]})'
            printed = [f'{label}({leaf})' for leaf in joint[1:]]
        elif len(joint) > 1 and all(leaf in ROMAN for leaf in joint):
            printed = [f'({leaf})' for leaf in joint]
            label = f'{printed[0]}–{printed[-1]}'
        if overrides:
            label = overrides[index]
            printed = [label]
            if len(joint) > 2 and joint[0] in ROMAN and all(leaf in 'abcdefgh' for leaf in joint[1:]):
                printed = [f'{label}({leaf})' for leaf in joint[1:]]
        part.update(part_label=label, printed_labels=printed)


def trim_scheme_footer(scheme_pdf, regions):
    """Remove the publisher's final-page registration block, preserving scheme notes."""
    with pdfplumber.open(scheme_pdf) as pdf:
        while regions:
            last = regions[-1]
            page = pdf.pages[last['page'] - 1]
            left, top, right, bottom = last['bbox']
            view = page.crop((left * page.width, top * page.height,
                              right * page.width, bottom * page.height))
            lines = view.extract_text_lines()
            footer = next((line['top'] for line in lines
                           if 'pearson education limited' in line['text'].casefold()
                           and 'registered company' in line['text'].casefold()), None)
            if footer is None:
                return
            if any(line['bottom'] < footer for line in lines):
                last['bbox'][3] = (footer - 4) / page.height
                return
            regions.pop()
    if not regions:
        raise ValueError('Missing final-question mark scheme after publisher information')


def extract_paper(paper, sources):
    paper_id = paper['paper_id']
    question_pdf = sources / paper_id / 'question_paper.pdf'
    scheme_pdf = sources / paper_id / 'mark_scheme.pdf'
    candidate = extract(question_pdf)
    scheme_checksum = digest(scheme_pdf)
    if (candidate['source_sha256'] != paper['documents']['question_paper']['sha256']
            or scheme_checksum != paper['documents']['mark_scheme']['sha256']):
        raise ValueError(f'{paper_id}: source checksum differs from verified inventory')
    if candidate['exceptions'] or candidate['total_marks'] != paper['max_marks']:
        raise ValueError(f"{paper_id}: unverified extraction {candidate['exceptions']}")
    if paper_id == TYPE3:
        recover_type3_starts(candidate, question_pdf)
    for question in candidate['questions']:
        normalize_parts(paper_id, question)
    schemes = scheme_regions(scheme_pdf, len(candidate['questions']))
    if paper_id == PILOT:
        if (candidate['source_sha256'] != PILOT_SOURCE or scheme_checksum != PILOT_SCHEME
                or [region['page'] for region in schemes['8']] != [19, 20, 21]):
            raise ValueError(f'{PILOT}: recheck the reviewed source geometry')
        for question in candidate['questions']:
            for region in question['regions']:
                # The reviewed question body excludes the page borders and barcode.
                region['bbox'][:3] = [0.09816, 0.0946, 0.84053]
    trim_scheme_footer(scheme_pdf, schemes[str(len(candidate['questions']))])
    candidate.update(paper_id=paper_id, scheme_regions=schemes)
    return candidate


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--sources', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--paper', action='append', help='Repeat for selected 9FM0 Core Pure exam IDs.')
    args = parser.parse_args()

    inventory_path = ROOT / 'data/imports/fmaths/inventory/9fm0-inventory.json'
    inventory = json.loads(inventory_path.read_text())
    papers = {p['paper_id']: p for p in inventory['papers'] if p['module_ids'] == ['CP']}
    selected = args.paper or list(papers)
    if unknown := set(selected) - papers.keys():
        parser.error(f'unknown Core Pure exam IDs: {", ".join(sorted(unknown))}')

    args.output.mkdir(parents=True, exist_ok=True)
    for paper_id in selected:
        candidate = extract_paper(papers[paper_id], args.sources)
        output = args.output / f'{paper_id}.json'
        output.write_text(json.dumps(candidate, ensure_ascii=False, indent=2) + '\n')
        allocations = sum(len(q['parts']) for q in candidate['questions'])
        print(f"{paper_id}: {len(candidate['questions'])} questions, {allocations} allocations, "
              f"{candidate['total_marks']} marks", flush=True)


if __name__ == '__main__':
    main()
