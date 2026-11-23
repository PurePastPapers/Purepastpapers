#!/usr/bin/env python3
"""GCSE Geography 8035 model review: write work packets and compile reviewers' line sheets.

  reviews.py prepare RESEARCH   -> RESEARCH/review-in/<PAPER>.md and spec-leaves.md
  reviews.py compile RESEARCH [GLOB] -> RESEARCH/reviews/<PAPER>.json

One line per publishable unit in RESEARCH/review-src/<PAPER>.txt (# starts a comment):

    label | primary codes [; prerequisite codes] | e/m/h | summary | difficulty basis [| FLAG: reason]

Codes are leaf ids without the AQA_GCSE_GEOG_ prefix: HAZ_1.2.k1, LIVING_2.2.k3, UKLAND_3.2.k1,
URBAN_4.k2, ECON_5.k3, RES_6.4.k2, APP_7.1.k1, APP_7.2.k1, APP_7.3.3. Rules checked here, not left
to the reviewer (ROUTES below, from the specification's paper structure):
- every primary code is in the unit's own route: Paper 1 Section A natural hazards, Section B living
  world, Section C by question (3 coasts, 4 rivers, 5 glacial; UKLAND_3.1 overview in any); Paper 2
  Section A urban, Section B economic world, Section C question 3 resource management overview and
  questions 4/5/6 food/water/energy; Paper 3 Section A issue evaluation (APP_7.1), Section B fieldwork
  (APP_7.2). The skills leaves APP_7.3.x are allowed as primary anywhere. Options therefore never mix;
- prerequisites (crossover, synoptic links) may be any valid code; Paper 3 issue-evaluation units
  usually need physical or human leaves as prerequisites;
- units excluded for copyright-removed material are not reviewed.
A FLAG column marks a line for lead review; compile refuses unresolved flags unless the lead has
replaced FLAG with LEAD: decision.
"""
import json
import re
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
REPO = HERE.parents[1]
PREFIX = 'AQA_GCSE_GEOG_'
DIFF = {'e': 'easy', 'm': 'medium', 'h': 'hard'}
CODE = re.compile(r'(?:HAZ|LIVING|UKLAND|URBAN|ECON|RES|APP)_\d(?:\.\d+)*(?:\.k\d+)?')
# Paper 1 Section C and Paper 2 Section C are keyed by question number; other sections by section letter.
ROUTES = {('01', 'Section A'): ('HAZ', 'HAZ_1.', 'Natural hazards'),
          ('01', 'Section B'): ('LIVING', 'LIVING_2.', 'The living world'),
          ('01', 'Section C', '3'): ('UKLAND_3.2', ('UKLAND_3.2.', 'UKLAND_3.1.'), 'Coastal landscapes in the UK'),
          ('01', 'Section C', '4'): ('UKLAND_3.3', ('UKLAND_3.3.', 'UKLAND_3.1.'), 'River landscapes in the UK'),
          ('01', 'Section C', '5'): ('UKLAND_3.4', ('UKLAND_3.4.', 'UKLAND_3.1.'), 'Glacial landscapes in the UK'),
          ('02', 'Section A'): ('URBAN', 'URBAN_4.', 'Urban issues and challenges'),
          ('02', 'Section B'): ('ECON', 'ECON_5.', 'The changing economic world'),
          ('02', 'Section C', '3'): ('RES_6.1', 'RES_6.1.', 'Resource management'),
          ('02', 'Section C', '4'): ('RES_6.2', 'RES_6.2.', 'Resource management: food'),
          ('02', 'Section C', '5'): ('RES_6.3', 'RES_6.3.', 'Resource management: water'),
          ('02', 'Section C', '6'): ('RES_6.4', 'RES_6.4.', 'Resource management: energy'),
          ('03', 'Section A'): ('APP_7.1', 'APP_7.1.', 'Issue evaluation'),
          ('03', 'Section B'): ('APP_7.2', 'APP_7.2.', 'Fieldwork')}
SKILLS = 'APP_7.3.'
# AQA_8035_2022_JUNE_02 (adapted sitting, "Answer either Section B or Section C") is imported since 23 November 2026:
# its choice group has whole-section options and Question 3 plus one of 4, 5, 6 (see extract.section_choice).
NOT_IMPORTED = {}


def route_of(paper, unit):
    key = (paper['component'], unit['section'])
    if key in ROUTES:
        return ROUTES[key]
    return ROUTES[(paper['component'], unit['section'], unit['question'])]


def leaf_id(code):
    return PREFIX + code


def spec():
    return json.loads((REPO / 'data/specs/AQA_GCSE_GEOG_8035.json').read_text())


def papers():
    inv = json.loads((REPO / 'data/imports/gcsegeog/inventory/8035-inventory.json').read_text())
    return {p['paper_id']: p for p in inv['papers'] if p['paper_id'] not in NOT_IMPORTED}


def excluded_labels(research, paper):
    from resolve import resolve, paper_index
    cand = json.loads((research / 'candidates' / f"{paper['paper_id']}.json").read_text())
    idx, roles, _ = paper_index(paper, research / 'sources')
    res = resolve(cand, idx, roles)
    return cand, res, {l for l, r in res.items() if r['removed'] or r['text_removed']}


def code_ok(code, route):
    prefixes = route[1] if isinstance(route[1], tuple) else (route[1],)
    return code.startswith(prefixes) or code.startswith(SKILLS)


def prepare(research):
    sp = spec()
    lines = ['# AQA GCSE Geography 8035 specification leaves (code | title: specification wording)', '',
             'Write codes without the AQA_GCSE_GEOG_ prefix, e.g. HAZ_1.2.k1.', '']
    for s in sp['sections']:
        lines.append(f"# {s['title']}")
        for t in s['topics']:
            lines.append(f"## {t['code']} {t['title']}")
            for p in t['points']:
                lines.append(f"- {p['id'][len(PREFIX):]} | {p['title']}: {' '.join(p['content'])[:600]}")
            lines.append('')
    (research / 'review-in').mkdir(parents=True, exist_ok=True)
    (research / 'review-in' / 'spec-leaves.md').write_text('\n'.join(lines))
    import pdfplumber
    from schemes import scheme_regions
    for pid, paper in papers().items():
        cand, res, excluded = excluded_labels(research, paper)
        ms_path = research / 'sources' / paper['documents']['mark_scheme']['file_name']
        regions = scheme_regions(ms_path, [u['label'] for u in cand['units']])
        scheme_text = {}
        with pdfplumber.open(ms_path) as ms:
            for label, regs in regions.items():
                parts = []
                for r in regs:
                    page = ms.pages[r['page'] - 1]
                    l, t, rr, b = r['bbox']
                    parts.append(page.crop((l * page.width, t * page.height, rr * page.width, b * page.height)).extract_text() or '')
                scheme_text[label] = re.sub(r'\s+', ' ', ' '.join(parts))[:900]
        out = [f"# {pid} · GCSE 8035 Paper {paper['assessment_paper']}: {paper['component_title']}",
               f"# {paper['series']} {paper['year'] or ''} · {paper['max_marks']} marks", '']
        for number, stem in cand.get('stems', {}).items():
            out.append(f"## Shared stem for question {number} (context, not scored)\n{stem['text']}\n")
        for u in cand['units']:
            route = route_of(paper, u)
            if u['label'] in excluded:
                out.append(f"## {u['label']} EXCLUDED (copyright-removed source) - do not review\n")
                continue
            figs = ', '.join(f"{e['figure']} ({e['source']})" for e in res[u['label']]['figures']) or 'none'
            spag = f" (includes {u['spag_marks']} SPaG marks)" if u.get('spag_marks') else ''
            out.append(f"## {u['label']} · {u['marks']} marks{spag} · {u['section']} · route {route[0]} {route[2]} · figures: {figs}")
            out.append(u['text'])
            out.append(f"[Official scheme excerpt] {scheme_text.get(u['label'], '')}")
            out.append('')
        (research / 'review-in' / f'{pid}.md').write_text('\n'.join(out))
        print(pid, len(cand['units']) - len(excluded), 'to review,', len(excluded), 'excluded')


def compile_sheet(sheet, paper, cand, excluded, valid):
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
        unit = units.get(label)
        if unit is None or label in excluded:
            raise ValueError(f'{sheet.name}:{n}: {label} is not a publishable unit')
        main, _, pre = tags.partition(';')
        primary, prereq = CODE.findall(main), CODE.findall(pre)
        route = route_of(paper, unit)
        if not primary or any(leaf_id(c) not in valid for c in primary + prereq):
            raise ValueError(f'{sheet.name}:{n}: unknown or missing codes in "{tags}"')
        bad = [c for c in primary if not code_ok(c, route)]
        if bad:
            raise ValueError(f'{sheet.name}:{n}: {label} primary {bad} outside route {route[0]}')
        if diff not in DIFF or not summary or not basis:
            raise ValueError(f'{sheet.name}:{n}: difficulty must be e/m/h with summary and basis')
        if label in out:
            raise ValueError(f'{sheet.name}:{n}: {label} reviewed twice')
        out[label] = {'label': label, 'sections': primary, 'prerequisites': [c for c in prereq if c not in primary],
                      'difficulty': DIFF[diff], 'summary': summary, 'difficulty_basis': basis,
                      'review_status': 'model_reviewed', **({'lead_note': note} if note else {})}
    publishable = [u['label'] for u in cand['units'] if u['label'] not in excluded]
    if set(out) != set(publishable):
        raise ValueError(f'{sheet.name}: missing {sorted(set(publishable) - set(out))}, extra {sorted(set(out) - set(publishable))}')
    return [out[l] for l in publishable]


def compile_all(research, pattern='*.txt'):
    sp = spec()
    valid = {p['id'] for s in sp['sections'] for t in s['topics'] for p in t['points']}
    allp = papers()
    for sheet in sorted((research / 'review-src').glob(pattern)):
        paper = allp[sheet.stem]
        cand, _, excluded = excluded_labels(research, paper)
        review = {'paper_id': sheet.stem, 'reviewer_type': 'model', 'review_status': 'model_reviewed',
                  'source_sha256': cand['source_sha256'],
                  'tagging_basis': 'AQA GCSE Geography 8035 specification key ideas (one primary leaf per unit)',
                  'units': compile_sheet(sheet, paper, cand, excluded, valid)}
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
