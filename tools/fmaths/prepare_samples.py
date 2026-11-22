"""Split verified Further Mathematics SAMs at Pearson's printed boundaries.

Page ranges below are inclusive physical PDF pages, numbered from 1.
"""
import argparse
import hashlib
import json
import re
import shutil
import zipfile
from pathlib import Path

import fitz

ZIP_SHA256 = 'c158f17ba92edd515d4fd2454756473ad1ecd98fe42318cab748446f5da7a40d'
A_LEVEL = {
    '01': ('CP', (9, 33), (35, 45), None, 9),
    '02': ('CP', (47, 63), (65, 75), None, 7),
    '3A': ('FP1', (77, 94), (95, 108), None, 8),
    '4A': ('FP2', (109, 137), (139, 148), None, 8),
    '3B/4B': ('FS1', (149, 171), (173, 182), None, 7),
    '4E': ('FS2', (183, 207), (209, 217), None, 7),
    '3C/4C': ('FM1', (219, 243), (245, 254), None, 8),
    '4F': ('FM2', (255, 277), (279, 289), None, 7),
    '3D/4D': ('D1', (291, 300), (317, 328), (301, 316), 7),
    '4G': ('D2', (329, 336), (353, 363), (337, 352), 7),
}
AS_PAPERS = {
    '01': ((9, 27), (29, 43), None, None),
    '2A': ((45, 68), (69, 84), None, None),
    '2B': ((85, 113), (115, 129), None, None),
    '2C': ((131, 152), (153, 168), None, None),
    '2D': ((169, 187), (195, 210), (189, 194), None),
    '2E': ((211, 237), (239, 248), None, None),
    '2F': ((249, 272), (279, 289), (273, 278), None),
    '2G': ((291, 320), (321, 330), None, None),
    '2H': ((331, 348), (355, 365), (349, 354), None),
    '2J': ((367, 386), (387, 396), None, None),
    '2K': ((397, 407), (425, 436), None, (409, 423)),
}
AS_SECTIONS = {
    '01': ('CP', '01', None, (9, 27), (29, 43), None, 1, 9),
    '21': ('FP1', '2A', 'A', (46, 56), (69, 78), None, 1, 5),
    '22': ('FP2', '2A', 'B', (57, 68), (79, 84), None, 6, 10),
    '23': ('FS1', '2G', 'A', (292, 307), (321, 325), None, 1, 4),
    '24': ('FS2', '2G', 'B', (308, 320), (326, 330), None, 5, 8),
    '25': ('FM1', '2J', 'A', (368, 377), (387, 391), None, 1, 4),
    '26': ('FM2', '2J', 'B', (378, 386), (392, 396), None, 5, 7),
    '27': ('D1', '2K', 'A', (398, 402), (425, 430), (410, 416), 1, 5),
    '28': ('D2', '2K', 'B', (403, 407), (431, 436), (417, 423), 6, 9),
}
# Target rectangles use PDF points. Correction rectangles come from the erratum;
# these small clips replace only the wrong text or glyph, retaining the source layout.
CORRECTIONS = {
    107: [('0.167inclusive', (360, 111, 440, 130), 0, (317.5, 373.5, 395, 392))],
    177: [('0.09632…', (364, 228, 414, 245.5), 0, (320, 500, 363.5, 514)),
          ('0.0963', (137, 389, 171, 400), 0, (130.3, 606.5, 161.9, 618.5))],
    297: [('s', (112, 151, 126, 170), 1, (95.5, 400, 110, 418))],
}
AS_ROUTES = {
    '2A': ('FP1', 'FP2'), '2B': ('FP1', 'FS1'), '2C': ('FP1', 'FM1'),
    '2D': ('FP1', 'D1'), '2E': ('FS1', 'FM1'), '2F': ('FS1', 'D1'),
    '2G': ('FS1', 'FS2'), '2H': ('FM1', 'D1'), '2J': ('FM1', 'FM2'),
    '2K': ('D1', 'D2'),
}


def sha256(blob):
    return hashlib.sha256(blob).hexdigest()


def split(doc, out, ranges):
    out.mkdir(parents=True, exist_ok=True)
    result = {}
    for kind, (start, end) in ranges.items():
        path = out / f'{kind}.pdf'
        with fitz.open() as piece:
            piece.insert_pdf(doc, from_page=start - 1, to_page=end - 1)
            piece.save(path, garbage=4, deflate=True, no_new_id=True)
        result[kind] = {'pages': [start, end], 'sha256': sha256(path.read_bytes()), 'bytes': path.stat().st_size}
    return result


def apply_erratum(doc, errata):
    with fitz.open(stream=errata, filetype='pdf') as corrections:
        for number, replacements in CORRECTIONS.items():
            target = doc[number - 1]
            for expected, bbox, _, _ in replacements:
                probe = fitz.Rect(bbox[0] - 1, bbox[1] - 6, bbox[2] + 1, bbox[3] + 3)
                if expected not in target.get_textbox(probe):
                    raise ValueError(f'Expected original erratum text on page {number}: {expected}')
                target.add_redact_annot(fitz.Rect(bbox), fill=(1, 1, 1), cross_out=False)
            target.apply_redactions(images=0, graphics=0)
            for _, bbox, source_page, source_box in replacements:
                source = corrections[source_page]
                clip = source.get_pixmap(matrix=fitz.Matrix(4, 4), clip=fitz.Rect(source_box))
                target.insert_image(fitz.Rect(bbox), pixmap=clip, keep_proportion=False)


def prepare_samples(archive_path, output):
    out = output / 'samples'
    if sha256(archive_path.read_bytes()) != ZIP_SHA256:
        raise ValueError('Unexpected Pearson SAMs ZIP revision')
    with zipfile.ZipFile(archive_path) as archive:
        names = {'9FM0': '9FM0 A level Further Mathematics SAMs.pdf', '8FM0': '8FM0 AS Further Mathematics SAMs.pdf'}
        docs = {code: archive.read(name) for code, name in names.items()}
        errata = archive.read('9FM0 Further Mathematics Sample Assessment Materials Notification of corrections to Issue 1.pdf')
    manifest = {
        'zip_sha256': ZIP_SHA256,
        'zip_url': 'https://qualifications.pearson.com/content/dam/pdf/A%20Level/Mathematics/2017/specification-and-sample-assesment/as-al-maths-further-sams.zip',
        'sources': {code: {'zip_entry': names[code], 'sha256': sha256(data), 'bytes': len(data)} for code, data in docs.items()},
        'as_route_modules': AS_ROUTES,
        'printed_papers': {}, 'practice_units': {},
        'errata': {
            'title': '9FM0 Further Mathematics Sample Assessment Materials Notification of corrections to Issue 1',
            'sha256': sha256(errata),
            'affected': {'9FM0/3A': ['Q8(b)(i) mark scheme'], '9FM0/3B/4B': ['Q4 mark scheme'], '9FM0/3D/4D': ['Q5(e) question paper']},
        },
    }
    with fitz.open(stream=docs['9FM0'], filetype='pdf') as doc:
        apply_erratum(doc, errata)
        for printed_code, (module, qp, ms, insert, count) in A_LEVEL.items():
            code = printed_code.split('/')[0]
            # Use the printed code as the stable sample identity; the module has
            # a separate independent ID for current qualification filtering.
            paper_id = f'EDX_9FM0_SAMPLE_{code}'
            ranges = {'question_paper': qp, 'mark_scheme': ms}
            if insert:
                ranges['answer_book'] = insert
            if not re.search(f'9FM0/{code}', doc[qp[0] - 1].get_text()):
                raise ValueError(f'Unexpected 9FM0 sample cover on page {qp[0]}')
            assets = split(doc, out / paper_id, ranges)
            row = {'qualification_code': '9FM0', 'module_id': module,
                   'official_paper_code': ' / '.join(f'9FM0/{part}' for part in printed_code.split('/')),
                   'max_marks': 75, 'duration_minutes': 90, 'first_question': 1,
                   'last_question': count, 'documents': assets}
            manifest['printed_papers'][paper_id] = row
            manifest['practice_units'][paper_id] = row
    with fitz.open(stream=docs['8FM0'], filetype='pdf') as doc:
        for code, (qp, ms, insert, answer) in AS_PAPERS.items():
            paper_id = f'EDX_8FM0_SAMPLE_PAPER_{code}'
            ranges = {'question_paper': qp, 'mark_scheme': ms}
            if insert:
                ranges['question_insert'] = insert
            if answer:
                ranges['answer_book'] = answer
            if not re.search(f'8FM0/{code}', doc[qp[0] - 1].get_text()):
                raise ValueError(f'Unexpected 8FM0 sample cover on page {qp[0]}')
            manifest['printed_papers'][paper_id] = {'qualification_code': '8FM0',
                'official_paper_code': f'8FM0/{code}', 'module_ids': AS_ROUTES.get(code, ('CP',)),
                'max_marks': 80, 'duration_minutes': 100, 'documents': split(doc, out / paper_id, ranges)}
        for code, (module, printed_code, section, qp, ms, answer, first, last) in AS_SECTIONS.items():
            paper_id = f'EDX_8FM0_SAMPLE_{code}'
            ranges = {'question_paper': qp, 'mark_scheme': ms}
            if answer:
                ranges['answer_book'] = answer
            manifest['practice_units'][paper_id] = {'qualification_code': '8FM0', 'module_id': module,
                'official_paper_code': f'8FM0/{printed_code}', 'section': section,
                'max_marks': 40 if section else 80, 'duration_minutes': None if section else 100,
                'first_question': first, 'last_question': last,
                'printed_paper_id': f'EDX_8FM0_SAMPLE_PAPER_{printed_code}', 'documents': split(doc, out / paper_id, ranges)}
    manifest['errata']['applied_to_sample_derivatives'] = {
        'EDX_9FM0_SAMPLE_3A': {'mark_scheme': [107]},
        'EDX_9FM0_SAMPLE_3B': {'mark_scheme': [177]},
        'EDX_9FM0_SAMPLE_3D': {'question_paper': [297]},
    }
    for paper_id, paper in manifest['practice_units'].items():
        source = out / paper_id
        render = output / 'sample-render-sources' / paper_id
        render.mkdir(parents=True, exist_ok=True)
        qp = source / 'question_paper.pdf'
        render_qp = render / 'question_paper.pdf'
        if 'answer_book' in paper['documents']:
            with fitz.open(qp) as question_paper, fitz.open(source / 'answer_book.pdf') as answer_book:
                question_paper.insert_pdf(answer_book)
                question_paper.save(render_qp, garbage=4, deflate=True, no_new_id=True)
        else:
            shutil.copyfile(qp, render_qp)
        shutil.copyfile(source / 'mark_scheme.pdf', render / 'mark_scheme.pdf')
    (out / 'sample-manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')
    print(len(manifest['printed_papers']), 'printed sample papers,', len(manifest['practice_units']), 'unique practice units')

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('archive', type=Path)
    parser.add_argument('output', type=Path)
    args = parser.parse_args()
    prepare_samples(args.archive, args.output)


if __name__ == '__main__':
    main()
