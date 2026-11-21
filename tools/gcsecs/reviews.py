#!/usr/bin/env python3
"""OCR GCSE Computer Science J277 model review: write work packets and compile reviewers' line sheets.

  reviews.py prepare RESEARCH        -> RESEARCH/review-in/<PAPER>.md and spec-leaves.md
  reviews.py compile RESEARCH [GLOB] -> RESEARCH/reviews/<PAPER>.json

One line per unit in RESEARCH/review-src/<PAPER>.txt (# starts a comment):

    label | primary codes [; prerequisite codes] | e/m/h | summary | difficulty basis [| FLAG: reason]

Codes are OCR's printed sub-topic numbers: "1.2.4", "2.1.3". Checked here, not left to the reviewer:
- Paper 1 (Computer systems) primary codes are section 1 content; Paper 2 may also use section 1
  content, so either section is allowed there.
A FLAG column needs lead review: compile refuses it until replaced by "LEAD: decision".
"""
import json
import re
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
DIFF = {'e': 'easy', 'm': 'medium', 'h': 'hard'}
CODE = re.compile(r'\d\.\d\.\d')


def leaf_id(code):
    m = re.fullmatch(r'(\d\.\d\.\d)', code.replace(' ', ''))
    return f'OCR_GCSE_CS_{m.group(1)}' if m else None


def spec():
    return json.loads((REPO / 'data/specs/OCR_GCSE_CS_J277.json').read_text())


def papers():
    return {p['paper_id']: p for p in json.loads((REPO / 'data/imports/gcsecs/inventory/J277-inventory.json').read_text())['papers']}


def prepare(research):
    import pdfplumber
    sys.path.insert(0, str(Path(__file__).parent))
    from schemes import scheme_regions
    sp = spec()
    lines = ['# OCR J277 specification leaves: code | title | content', '']
    for s in sp['sections']:
        lines.append(f"## {s['title']}")
        for t in s['topics']:
            lines.append(f"### {t['code']} {t['title']}")
            for p in t['points']:
                lines.append(f"- {p['code']} {p['title']}: " + ' | '.join(p['content'])[:500])
        lines.append('')
    (research / 'review-in').mkdir(parents=True, exist_ok=True)
    (research / 'review-in' / 'spec-leaves.md').write_text('\n'.join(lines))
    for pid, paper in papers().items():
        cand_path = research / 'candidates' / f'{pid}.json'
        if not cand_path.exists():
            continue
        cand = json.loads(cand_path.read_text())
        ms = research / 'sources' / paper['documents']['mark_scheme']['file_name']
        start = max(u['tariff']['page'] for u in cand['units']) if paper['is_sample'] else 0
        regions, _ = scheme_regions(ms, [u['label'] for u in cand['units']], start_page=start)
        texts = {}
        with pdfplumber.open(ms) as pdf:
            for label, r in regions.items():
                parts = []
                for g in r['regions']:
                    page = pdf.pages[g['page'] - 1]
                    l, t, rr, b = g['bbox']
                    parts.append(page.crop((l * page.width, t * page.height, rr * page.width, b * page.height)).extract_text() or '')
                texts[label] = re.sub(r'\s+', ' ', ' '.join(parts))[:900]
        out = [f"# {pid} · GCSE J277 Paper {int(paper['component'])}: {paper['component_title']} · {paper['series']} {paper['year'] or ''}",
               '# Rules: code each unit to the J277 sub-topic(s) it assesses (e.g. 1.2.4). Paper 1 is Computer systems (section 1); Paper 2 is Computational thinking, algorithms and programming (section 2) and may use section 1 content.', '']
        for key, ctx in cand['context'].items():
            out.append(f"## Context {key} (shared, unscored)\n{ctx['text'][:1500]}\n")
        for u in cand['units']:
            star = ' · extended response (*)' if u['extended_response'] else ''
            ctx = ', '.join(u.get('context', [])) or 'none'
            out.append(f"## {u['label']} · {u['marks']} marks{star} · context: {ctx}")
            out.append(u['text'][:1500])
            out.append(f"[Official scheme excerpt] {texts.get(u['label'], '')}")
            out.append('')
        (research / 'review-in' / f'{pid}.md').write_text('\n'.join(out))
        print(pid, len(cand['units']), 'units')


def compile_sheet(sheet, paper, cand, valid):
    out = {}
    units = {u['label']: u for u in cand['units']}
    for n, raw in enumerate(sheet.read_text().splitlines(), 1):
        line = raw.strip()
        if not line or line.startswith('#'):
            continue
        cells = [c.strip() for c in line.split('|')]
        if len(cells) not in (5, 6):
            raise ValueError(f'{sheet.name}:{n}: expected 5 or 6 fields, got {len(cells)}')
        label, tags, diff, summary, basis = cells[:5]
        note = cells[5] if len(cells) == 6 else ''
        if note.startswith('FLAG'):
            raise ValueError(f'{sheet.name}:{n}: unresolved lead-review flag: {note}')
        if label not in units:
            raise ValueError(f'{sheet.name}:{n}: {label} is not a unit of this paper')
        main, _, pre = tags.partition(';')
        primary = [leaf_id(c) for c in CODE.findall(main)]
        prereq = [leaf_id(c) for c in CODE.findall(pre)]
        if not primary or any(t not in valid for t in primary + prereq):
            raise ValueError(f'{sheet.name}:{n}: unknown or missing codes in "{tags}"')
        if paper['component'] == '01' and any(not t.startswith('OCR_GCSE_CS_1.') for t in primary):
            raise ValueError(f'{sheet.name}:{n}: {label}: Paper 1 primary codes must be section 1 (Computer systems)')
        if diff not in DIFF or not summary or not basis:
            raise ValueError(f'{sheet.name}:{n}: difficulty must be e/m/h with summary and basis')
        if label in out:
            raise ValueError(f'{sheet.name}:{n}: {label} reviewed twice')
        out[label] = {'label': label, 'sections': primary, 'prerequisites': [t for t in prereq if t not in primary],
                      'codes': CODE.findall(main), 'prerequisite_codes': CODE.findall(pre),
                      'difficulty': DIFF[diff], 'summary': summary, 'difficulty_basis': basis,
                      'review_status': 'model_reviewed', **({'lead_note': note} if note else {})}
    want = [u['label'] for u in cand['units']]
    if set(out) != set(want):
        raise ValueError(f'{sheet.name}: missing {sorted(set(want) - set(out))}, extra {sorted(set(out) - set(want))}')
    return [out[l] for l in want]


def compile_all(research, pattern='*.txt'):
    sp = spec()
    valid = {p['id'] for s in sp['sections'] for t in s['topics'] for p in t['points']}
    allp = papers()
    for sheet in sorted((research / 'review-src').glob(pattern)):
        paper = allp[sheet.stem]
        cand = json.loads((research / 'candidates' / f'{sheet.stem}.json').read_text())
        review = {'paper_id': sheet.stem, 'reviewer_type': 'model', 'review_status': 'model_reviewed',
                  'source_sha256': cand['source_sha256'], 'tagging_basis': 'OCR J277 specification sub-topics',
                  'units': compile_sheet(sheet, paper, cand, valid)}
        target = research / 'reviews' / f'{sheet.stem}.json'
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(json.dumps(review, ensure_ascii=False, indent=1) + '\n')
        print(sheet.stem, len(review['units']), 'units reviewed')


if __name__ == '__main__':
    research = Path(sys.argv[2])
    if sys.argv[1] == 'prepare':
        prepare(research)
    else:
        compile_all(research, sys.argv[3] if len(sys.argv) > 3 else '*.txt')
