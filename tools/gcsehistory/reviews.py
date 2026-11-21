#!/usr/bin/env python3
"""Pearson GCSE History 1HI0 model review: write work packets and compile reviewers' line sheets.

  reviews.py prepare RESEARCH        -> RESEARCH/review-in/<PAPER>.md and spec-leaves.md
  reviews.py compile RESEARCH [GLOB] -> RESEARCH/reviews/<PAPER>.json

One line per unit in RESEARCH/review-src/<PAPER>.txt (# starts a comment):

    label | primary codes [; prerequisite codes] | e/m/h | summary | difficulty basis [| FLAG: reason]

Codes are the leaf codes printed in the specification file: option.topic.strand.bullet, e.g. 10.2.3.1
(Crime and punishment, c1500-c1700, strand 3), 10.5.1.3 (Whitechapel policing), B1.2.1.3 (castles),
31.3.2.1 (the police state). Checked here, not left to the reviewer: every primary code belongs to
the booklet's own option (10, B1 or 31). One primary leaf per unit; a prerequisite only where the
question needs earlier knowledge. A FLAG column needs lead review: compile refuses it.
"""
import json
import re
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
DIFF = {'e': 'easy', 'm': 'medium', 'h': 'hard'}
CODE = re.compile(r'\b(?:10|B1|31)\.\d\.\d\.\d\b')


def spec():
    return json.loads((REPO / 'data/specs/EDX_GCSE_HIST_1HI0.json').read_text())


def code_map():
    return {p['code']: p['id'] for s in spec()['sections'] for t in s['topics'] for p in t['points']}


def papers():
    return {p['paper_id']: p for p in json.loads((REPO / 'data/imports/gcsehistory/inventory/1hi0-inventory.json').read_text())['papers']}


def prepare(research):
    import pdfplumber
    sys.path.insert(0, str(Path(__file__).parent))
    from schemes import scheme_regions
    sp = spec()
    lines = ['# 1HI0 specification leaves: code | strand | content', '']
    for s in sp['sections']:
        lines.append(f"## {s['title']}")
        for t in s['topics']:
            lines.append(f"### {t['code']} {t['title']}")
            for p in t['points']:
                lines.append(f"- {p['code']} [{p['official_reference']['strand_title']}] {p['content'][:420]}")
        lines.append('')
    (research / 'review-in').mkdir(parents=True, exist_ok=True)
    (research / 'review-in' / 'spec-leaves.md').write_text('\n'.join(lines))
    for pid, paper in papers().items():
        cand_path = research / 'candidates' / f'{pid}.json'
        if not cand_path.exists():
            continue
        cand = json.loads(cand_path.read_text())
        ms = research / 'sources' / paper['documents']['mark_scheme']['file_name']
        regions = scheme_regions(ms, [u['label'] for u in cand['units'] if not u.get('copyright_removed_content')])
        texts = {}
        with pdfplumber.open(ms) as pdf:
            for label, r in regions.items():
                parts = []
                for g in r['regions']:
                    page = pdf.pages[g['page'] - 1]
                    l, t, rr, b = g['bbox']
                    parts.append(page.crop((l * page.width, t * page.height, rr * page.width, b * page.height)).extract_text() or '')
                texts[label] = re.sub(r'\s+', ' ', ' '.join(parts))
        out = [f"# {pid} · {paper['component_title']} · {paper['series']} {paper['year']}",
               f"# Rules: tag each unit to ONE primary leaf of option {paper['component']} (codes like {'10.2.3.1' if paper['component'] == '10' else 'B1.2.1.3' if paper['component'] == 'B1' else '31.3.2.1'}); optional prerequisite leaves after ';'.", '']
        for key, item in cand['context_items'].items():
            out.append(f"## Booklet item {key} (unscored context)\n{item['text'][:1200]}\n")
        for u in cand['units']:
            out.append(f"## {u['label']} · {u['marks']} marks · context: {', '.join(u['context']) or 'none'}"
                       + (' · COPYRIGHT-REMOVED, excluded' if u.get('copyright_removed_content') else ''))
            out.append(u['text'][:1200])
            out.append(f"[Official scheme excerpt] {texts.get(u['label'], '')[:1400]}")
            out.append('')
        (research / 'review-in' / f'{pid}.md').write_text('\n'.join(out))
        print(pid, len(cand['units']), 'units')


def compile_sheet(sheet, paper, cand, codes):
    out = {}
    units = {u['label']: u for u in cand['units'] if not u.get('copyright_removed_content')}
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
            raise ValueError(f'{sheet.name}:{n}: {label} is not a publishable unit of this paper')
        main, _, pre = tags.partition(';')
        primary_codes, prereq_codes = CODE.findall(main), CODE.findall(pre)
        if len(primary_codes) != 1:
            raise ValueError(f'{sheet.name}:{n}: {label}: exactly one primary leaf is required, got {primary_codes}')
        for c in primary_codes + prereq_codes:
            if c not in codes:
                raise ValueError(f'{sheet.name}:{n}: unknown leaf code {c}')
        if any(not c.startswith(paper['component'] + '.') for c in primary_codes):
            raise ValueError(f'{sheet.name}:{n}: {label}: primary code outside option {paper["component"]}')
        if any(not c.startswith(paper['component'] + '.') for c in prereq_codes):
            raise ValueError(f'{sheet.name}:{n}: {label}: prerequisite code outside option {paper["component"]}')
        if diff not in DIFF or not summary or not basis:
            raise ValueError(f'{sheet.name}:{n}: difficulty must be e/m/h with summary and basis')
        if label in out:
            raise ValueError(f'{sheet.name}:{n}: {label} reviewed twice')
        primary = [codes[c] for c in primary_codes]
        prereq = [codes[c] for c in prereq_codes if codes[c] not in primary]
        out[label] = {'label': label, 'sections': primary, 'prerequisites': prereq,
                      'codes': primary_codes, 'prerequisite_codes': [c for c in prereq_codes if c not in primary_codes],
                      'difficulty': DIFF[diff], 'summary': summary, 'difficulty_basis': basis,
                      'review_status': 'model_reviewed'}
    want = list(units)
    if set(out) != set(want):
        raise ValueError(f'{sheet.name}: missing {sorted(set(want) - set(out))}, extra {sorted(set(out) - set(want))}')
    return [out[l] for l in want]


def compile_all(research, pattern='*.txt'):
    codes = code_map()
    allp = papers()
    for sheet in sorted((research / 'review-src').glob(pattern)):
        paper = allp[sheet.stem]
        cand = json.loads((research / 'candidates' / f'{sheet.stem}.json').read_text())
        review = {'paper_id': sheet.stem, 'reviewer_type': 'model', 'review_status': 'model_reviewed',
                  'source_sha256': cand['source_sha256'], 'tagging_basis': 'Pearson 1HI0 Issue 6 content bullets (options 10, B1, 31)',
                  'units': compile_sheet(sheet, paper, cand, codes)}
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
