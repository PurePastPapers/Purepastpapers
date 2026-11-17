#!/usr/bin/env python3
"""OCR Chemistry A (H432 / AS H032) model review: write work packets and compile reviewers' line sheets.

  reviews.py prepare RESEARCH        -> RESEARCH/review-in/<PAPER>.md and spec-leaves.md
  reviews.py compile RESEARCH [GLOB] -> RESEARCH/reviews/<PAPER>.json

One line per unit in RESEARCH/review-src/<PAPER>.txt (# starts a comment):

    label | primary codes [; prerequisite codes] | e/m/h | summary | difficulty basis [| FLAG: reason]

Codes are OCR's printed section codes, e.g. "2.1.3" or "5.1.1" (Module 1.1.x practical skills
may be used as a primary code for practical-skills questions). Checked here, not left to the
reviewer:
- H432/01 primary codes are Modules 1, 2, 3 or 5; H432/02 Modules 1, 2, 4 or 6; H432/03 any
  module (OCR specification, assessment overview);
- AS H032 units use only Modules 1 to 4 (the content AS shares with A level);
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
    return f'OCR_CHEM_{code}' if re.fullmatch(r'\d\.\d\.\d', code.strip()) else None


def spec():
    return json.loads((REPO / 'data/specs/OCR_ALEVEL_CHEM_H432.json').read_text())


def papers():
    out = {}
    for q in ('H432', 'H032'):
        for p in json.loads((REPO / f'data/imports/chem/inventory/{q}-inventory.json').read_text())['papers']:
            out[p['paper_id']] = p
    return out


def prepare(research):
    import pdfplumber
    sys.path.insert(0, str(Path(__file__).parent))
    from schemes import scheme_regions
    sp = spec()
    lines = ['# OCR Chemistry A specification sections: code title [AS = also in AS H032; A ONLY = H432 only] then OCR learning outcomes', '']
    for s_ in sp['sections']:
        lines.append(f"## {s_['title']}")
        for t in s_['topics']:
            for p in t['points']:
                tag = ' [AS]' if p.get('as_reference') else ' [A ONLY]'
                lines.append(f"### {p['code']} {p['title']}{tag}")
                for c in p['content'][:30]:
                    lines.append('  - ' + c[:330])
        lines.append('')
    (research / 'review-in').mkdir(parents=True, exist_ok=True)
    (research / 'review-in' / 'spec-leaves.md').write_text('\n'.join(lines))
    for pid, paper in papers().items():
        cand = json.loads((research / 'candidates' / f'{pid}.json').read_text())
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
        kind = 'AS H032' if paper['is_as'] else 'A level H432'
        rule = ('AS units: only [AS] sections (Modules 1 to 4).' if paper['is_as'] else
                {'01': 'H432/01: primary codes from Modules 1, 2, 3 or 5.', '02': 'H432/02: primary codes from Modules 1, 2, 4 or 6.',
                 '03': 'H432/03 is synoptic: any module.'}[paper['component']])
        out = [f"# {pid} · {kind} Paper {paper['component']}: {paper['component_title']} · {paper['series']} {paper['year'] or ''}", '# Rules: ' + rule, '']
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


def compile_sheet(sheet, paper, cand, valid, as_ok):
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
        if paper['is_as']:
            bad = [t for t in primary + prereq if t not in as_ok]
            if bad:
                raise ValueError(f'{sheet.name}:{n}: {label} uses content outside AS H032: {bad}')
        else:
            allowed = {'01': '1235', '02': '1246', '03': '123456'}[paper['component']]
            if any(t.split('_')[-1][0] not in allowed for t in primary):
                raise ValueError(f'{sheet.name}:{n}: {label}: primary code outside the modules of H432/{paper["component"]}')
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
    as_ok = {v['leaf'] for v in sp['as_section_map'].values()}
    allp = papers()
    for sheet in sorted((research / 'review-src').glob(pattern)):
        paper = allp[sheet.stem]
        cand = json.loads((research / 'candidates' / f'{sheet.stem}.json').read_text())
        review = {'paper_id': sheet.stem, 'reviewer_type': 'model', 'review_status': 'model_reviewed',
                  'source_sha256': cand['source_sha256'], 'tagging_basis': 'OCR H432 numbered specification sections (lettered learning outcomes as evidence)',
                  'units': compile_sheet(sheet, paper, cand, valid, as_ok)}
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
