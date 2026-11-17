#!/usr/bin/env python3
"""Verify and enrich data/specs/OCR_ALEVEL_CHEM_H432.json against OCR's official specifications.

Usage: build_spec.py H432_SPEC_PDF H032_SPEC_PDF
  171720-specification-accredited-a-level-gce-chemistry-a-h432.pdf (Version 3.1, May 2026)
  171750-specification-accredited-as-level-gce-chemistry-a-h032.pdf

The earlier skill tree (41 numbered sections, ids OCR_CHEM_<n.n.n>) is kept as it is, so saved
learning keeps its meaning. This script:
- checks every section code and title against the H432 specification text (printed codes are
  strings; "2.2.1" and "6.2.2" are not decimals);
- records the specification version and SHA-256 of both PDFs;
- reads the left column ("Learning outcomes") of each section: the lettered outcomes are stored
  as `content` (OCR wording, one line per outcome) so reviewers and learners can see what a
  section covers. Tagging granularity stays at the numbered section;
- maps AS H032 sections to the identical A-level sections (Modules 1 to 4);
- marks Module 5 and 6 sections as A-level only.
The practical endorsement (section 1.2) is not written-exam content and is not a leaf.
"""
import hashlib
import json
import re
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
TARGET = REPO / 'data/specs/OCR_ALEVEL_CHEM_H432.json'
HEAD = re.compile(r'^\s*(\d\.\d\.\d)\s+([A-Z][^\n]*?)\s*$')


def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def left_column_lines(path):
    """Text of the 'Learning outcomes' column per page: words left of the guidance column."""
    import pdfplumber
    out = []
    with pdfplumber.open(path) as pdf:
        for pi, page in enumerate(pdf.pages):
            words = [w for w in page.extract_words() if 55 < w['top'] < page.height - 45]
            rows = {}
            for w in sorted(words, key=lambda w: (round(w['top']), w['x0'])):
                key = next((k for k in rows if abs(k - w['top']) < 3), None)
                rows.setdefault(w['top'] if key is None else key, []).append(w)
            for top in sorted(rows):
                ws = sorted(rows[top], key=lambda w: w['x0'])
                out.append((pi + 1, top, ws))
    return out


def section_texts(path):
    """{code: [outcome lines]} reading each section from its heading to the next."""
    rows = left_column_lines(path)
    codes, current, texts, heads = [], None, {}, {}
    for page, top, ws in rows:
        if len(ws) > 1 and re.fullmatch(r'\d', ws[0]['text']) and ws[0]['x0'] < 45:
            ws = ws[1:]   # chapter-tab digit printed in the margin
        line = ' '.join(w['text'] for w in ws if w['x0'] < 330)
        m = HEAD.match(line)
        if m and ws[0]['x0'] < 100 and not re.search(r'\.{3,}', line):
            current = m.group(1)
            heads.setdefault(current, {'title': m.group(2), 'page': page})
            texts.setdefault(current, [])
            continue
        if current is None:
            continue
        # keep the left (outcome) column only; guidance starts around x = 300
        left = ' '.join(w['text'] for w in ws if w['x0'] < 300)
        if left and not re.match(r'^(Version \d|Cambridge OCR|Learning outcomes|Learners should|apply their knowledge|\d{1,3}$)', left):
            texts[current].append(left)
    return heads, texts


def outcomes(lines):
    """Join wrapped lines into one string per lettered outcome ("(a) ...")."""
    items = []
    for line in lines:
        if re.match(r'^\(?[a-z]\)\s', line) or re.match(r'^\([a-z]\)', line):
            items.append(line)
        elif items:
            items[-1] += ' ' + line
        else:
            items.append(line)
    return [re.sub(r'\s+', ' ', i).strip() for i in items]


def main():
    a_pdf, as_pdf = Path(sys.argv[1]), Path(sys.argv[2])
    spec = json.loads(TARGET.read_text())
    heads, texts = section_texts(a_pdf)
    as_heads, _ = section_texts(as_pdf)
    problems, leaves = [], {}
    for s in spec['sections']:
        for t in s['topics']:
            for p in t['points']:
                leaves[p['code']] = p
    for code, p in leaves.items():
        h = heads.get(code)
        if not h:
            problems.append(f'{code} not found in the H432 specification')
            continue
        # headings are printed in full; the seed title may add a gloss, so require the printed title to be a prefix
        base = re.sub(r'\s*\(.*?\)$', '', p['title'])
        if not (p['title'].startswith(h['title'].rstrip('?')) or base.startswith(h['title'].rstrip('?')) or h['title'].startswith(base)):
            problems.append(f"{code}: title '{p['title']}' vs printed '{h['title']}'")
        lines = outcomes(texts.get(code, []))
        p['content'] = lines or [p['title']]
        p['official_reference'] = {'section': code, 'component': 'H432', 'source_page': h['page']}
        module = int(code[0])
        p['as_reference'] = bool(code in as_heads and module <= 4)
        p['a_level_only'] = module >= 5
    if problems:
        raise SystemExit('Spec check failed:\n' + '\n'.join(problems))
    as_map = {f'AS {c}': {'leaf': p['id'], 'similarity': 1.0} for c, p in leaves.items() if p['as_reference']}
    a_only = sorted(c for c, p in leaves.items() if p['a_level_only'])
    spec.update({
        'specification_version': 'ocr-h432-v3.1-2026-05',
        'official_source_url': 'https://www.ocr.org.uk/Images/171720-specification-accredited-a-level-gce-chemistry-a-h432.pdf',
        'order_status': 'verified',
        'official_source': {
            'title': 'OCR A Level Chemistry A (H432) specification', 'version': 'Version 3.1', 'issue_date': 'May 2026',
            'first_teaching': 2015, 'first_exams': 2017,
            'url': 'https://www.ocr.org.uk/Images/171720-specification-accredited-a-level-gce-chemistry-a-h432.pdf', 'sha256': sha(a_pdf),
            'as_qualification': {
                'code': 'H032', 'title': 'OCR AS Level Chemistry A (H032) specification',
                'url': 'https://www.ocr.org.uk/Images/171750-specification-accredited-as-level-gce-chemistry-a-h032.pdf', 'sha256': sha(as_pdf)}},
        'approach': 'Official OCR content order (numbered sections). No textbook organisation has been supplied.',
        'components': {
            'H432/01': {'title': 'Periodic table, elements and physical chemistry', 'marks': 100, 'minutes': 135, 'sections': ['1.1', '2.1', '2.2', '3.1', '3.2', '5.1', '5.2'],
                        'note': 'Modules 1, 2, 3 and 5 (OCR also allows Module 1 skills and earlier content throughout).'},
            'H432/02': {'title': 'Synthesis and analytical techniques', 'marks': 100, 'minutes': 135, 'sections': ['1.1', '2.1', '2.2', '4.1', '4.2', '6.1', '6.2', '6.3'],
                        'note': 'Modules 1, 2, 4 and 6; synoptic.'},
            'H432/03': {'title': 'Unified chemistry', 'marks': 70, 'minutes': 90, 'sections': ['all'], 'note': 'All modules; synoptic.'},
            'H032/01': {'title': 'Breadth in chemistry', 'marks': 70, 'minutes': 90, 'sections': ['1.1', '2.1', '2.2', '3.1', '3.2', '4.1', '4.2']},
            'H032/02': {'title': 'Depth in chemistry', 'marks': 70, 'minutes': 90, 'sections': ['1.1', '2.1', '2.2', '3.1', '3.2', '4.1', '4.2']}},
        'as_section_map': as_map,
        'a_level_only_sections': a_only,
        'notes': ('Leaves are OCR numbered sections (OCR_CHEM_2.1.3, printed 2.1.3) with their lettered learning outcomes as content. '
                  'AS H032 Modules 1 to 4 use the same section numbers and titles as H432, so AS sections map one to one. '
                  'Modules 5 and 6 are A-level only. Practical endorsement (1.2, H432/04) is not written-exam content.'),
        'point_order': [p['id'] for s in spec['sections'] for t in s['topics'] for p in t['points']],
    })
    TARGET.write_text(json.dumps(spec, ensure_ascii=False, indent=1) + '\n')
    print(len(leaves), 'sections verified;', len(as_map), 'AS-shared;', len(a_only), 'A-level only')
    for c, p in leaves.items():
        print(c, len(p['content']), 'outcomes')


if __name__ == '__main__':
    main()
