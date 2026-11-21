#!/usr/bin/env python3
"""Build data/specs/AQA_GCSE_GEOG_8035.json from AQA's official GCSE Geography specification.

Usage: build_spec.py SPEC_PDF
  AQA-8035-SP-2016.PDF (Version 1.1, 12 September 2023). Other files are refused.

AQA prints each section as a two-column table: a numbered "Key idea" on the left and its
"Specification content" on the right. Leaves are the key ideas (id <section id>.k<n>),
carrying AQA's content verbatim and source page. Sections without sub-numbers (3.2.1 urban,
3.2.2 economic) are one theme; the issue evaluation (3.3.1), fieldwork (3.3.2) and each
geographical skills heading (3.4.x) are one leaf each, because AQA prints them as prose.
The earlier unverified tree's leaf ids (AQA_GCSE_GEOG_HAZ_1.2 ...) migrate to the key ideas
they covered (legacy_ids), so saved ticks keep their meaning.
"""
import hashlib
import json
import re
import sys
from pathlib import Path

SHA = '4563d2e6674402b6967055c393ad5d966e705cf8ab20ef7ec023f7bfbbf230b4'
URL = 'https://filestore.aqa.org.uk/resources/geography/specifications/AQA-8035-SP-2016.PDF'
REPO = Path(__file__).resolve().parents[2]
HEAD = re.compile(r'^3(\.\d){1,3}$')
# spec section -> (paper, theme id/title, old leaf id the earlier tree used)
SECTION = {
    '3.1.1.1': ('P1', 'HAZ', 'The challenge of natural hazards', 'AQA_GCSE_GEOG_HAZ_1.1'),
    '3.1.1.2': ('P1', 'HAZ', None, 'AQA_GCSE_GEOG_HAZ_1.2'), '3.1.1.3': ('P1', 'HAZ', None, 'AQA_GCSE_GEOG_HAZ_1.3'),
    '3.1.1.4': ('P1', 'HAZ', None, 'AQA_GCSE_GEOG_HAZ_1.4'),
    '3.1.2.1': ('P1', 'LIVING', 'The living world', 'AQA_GCSE_GEOG_LIVING_2.1'), '3.1.2.2': ('P1', 'LIVING', None, 'AQA_GCSE_GEOG_LIVING_2.2'),
    '3.1.2.3': ('P1', 'LIVING', None, 'AQA_GCSE_GEOG_LIVING_2.3'), '3.1.2.4': ('P1', 'LIVING', None, 'AQA_GCSE_GEOG_LIVING_2.4'),
    '3.1.3.1': ('P1', 'UKLAND', 'Physical landscapes in the UK', 'AQA_GCSE_GEOG_UKLAND_3.1'),
    '3.1.3.2': ('P1', 'UKLAND', None, 'AQA_GCSE_GEOG_UKLAND_3.2'), '3.1.3.3': ('P1', 'UKLAND', None, 'AQA_GCSE_GEOG_UKLAND_3.3'),
    '3.1.3.4': ('P1', 'UKLAND', None, 'AQA_GCSE_GEOG_UKLAND_3.4'),
    '3.2.1': ('P2', 'URBAN', 'Urban issues and challenges', 'AQA_GCSE_GEOG_URBAN_4'),
    '3.2.2': ('P2', 'ECON', 'The changing economic world', 'AQA_GCSE_GEOG_ECON_5'),
    '3.2.3.1': ('P2', 'RES', 'The challenge of resource management', 'AQA_GCSE_GEOG_RES_6.1'),
    '3.2.3.2': ('P2', 'RES', None, 'AQA_GCSE_GEOG_RES_6.2'), '3.2.3.3': ('P2', 'RES', None, 'AQA_GCSE_GEOG_RES_6.3'),
    '3.2.3.4': ('P2', 'RES', None, 'AQA_GCSE_GEOG_RES_6.4'),
    '3.3.1': ('P3', 'APP', 'Geographical applications and skills', 'AQA_GCSE_GEOG_APP_7.1'),
    '3.3.2': ('P3', 'APP', None, 'AQA_GCSE_GEOG_APP_7.2'),
}
PAPERS = {'P1': ('AQA_GCSE_GEOG_SEC_P1', 'Paper 1: Living with the physical environment'),
          'P2': ('AQA_GCSE_GEOG_SEC_P2', 'Paper 2: Challenges in the human environment'),
          'P3': ('AQA_GCSE_GEOG_SEC_P3', 'Paper 3: Geographical applications')}
PROSE = {'3.3.1', '3.3.2'}   # printed as prose / mixed layouts: one leaf each


def clean(text):
    return re.sub(r'\s+', ' ', text).strip()


def main():
    import pdfplumber
    path = Path(sys.argv[1])
    if hashlib.sha256(path.read_bytes()).hexdigest() != SHA:
        sys.exit('refusing: not AQA GCSE Geography 8035 specification Version 1.1 (12 September 2023)')
    pdf = pdfplumber.open(path)
    # 1. flatten every content page into lines (page, y, x0, size, text) ignoring headers/footers
    lines = []
    for pno, page in enumerate(pdf.pages):
        if pno < 8:
            continue
        rows = {}
        for w in page.extract_words(extra_attrs=['size']):
            if not (50 < w['top'] < page.height - 48):
                continue
            rows.setdefault(round(w['top'] / 2.5), []).append(w)
        for k in sorted(rows):
            ws = sorted(rows[k], key=lambda w: w['x0'])
            lines.append({'page': pno + 1, 'top': ws[0]['top'], 'words': ws, 'size': ws[0]['size']})
    # 2. split into sections at headings (size >= 12.5, first word like 3.1.1.2)
    sections, cur = {}, None
    for ln in lines:
        first = ln['words'][0]
        if ln['size'] >= 12.5 and first['x0'] < 70 and HEAD.match(first['text']):
            cur = first['text']
            sections[cur] = {'title': clean(' '.join(w['text'] for w in ln['words'][1:])), 'page': ln['page'], 'lines': []}
            continue
        if cur and ln['size'] < 12.5:
            sections[cur]['lines'].append(ln)
    leaves_by_sec = {}
    for code, (paper, theme, ttitle, old) in SECTION.items():
        s = sections.get(code)
        assert s, f'missing section {code}'
        ls = s['lines']
        hdr = next((l for l in ls if any(w['text'] == 'Specification' for w in l['words'])), None)
        if code in PROSE or not hdr:
            body = clean(' '.join(' '.join(w['text'] for w in l['words']) for l in ls if 'Visit for the most' not in ' '.join(w['text'] for w in l['words'])))
            leaves_by_sec[code] = [{'title': s['title'], 'content': [body[:3000]], 'page': s['page']}]
            continue
        keyideas, content = [], []
        ls = ls[ls.index(hdr) + 1:]   # skip the section's introductory sentence above the table
        cut = hdr['words'][[w['text'] for w in hdr['words']].index('Specification')]['x0'] - 4
        for l in ls:
            text = ' '.join(w['text'] for w in l['words'])
            if 'Visit for the most' in text or text.startswith('AQA GCSE') or re.fullmatch(r'\d+', text):
                continue
            hx = [w for w in l['words'] if w['text'] == 'Specification']
            colx = (hx[0]['x0'] - 4) if hx else None
            if colx:
                cut = colx
            left = ' '.join(w['text'] for w in l['words'] if w['x0'] < cut)
            right = ' '.join(w['text'] for w in l['words'] if w['x0'] >= cut)
            if hx or text.startswith('Key idea'):
                continue
            if left:
                if not keyideas or keyideas[-1]['done']:
                    keyideas.append({'text': left, 'done': left.rstrip().endswith('.'), 'page': l['page'], 'content': []})
                else:
                    keyideas[-1]['text'] += ' ' + left
                    keyideas[-1]['done'] = left.rstrip().endswith('.')
            if right and keyideas:
                keyideas[-1]['content'].append(right)
        leaves_by_sec[code] = [{'title': clean(k['text']), 'content': [clean(c) for c in k['content']], 'page': k['page']} for k in keyideas]
    # 3. geographical skills (3.4.x headings), one leaf each
    skills = []
    for code in sorted(c for c in sections if re.fullmatch(r'3\.4\.\d', c)):
        s = sections[code]
        body = clean(' '.join(' '.join(w['text'] for w in l['words']) for l in s['lines'] if 'Visit for the most' not in ' '.join(w['text'] for w in l['words']) and 'AQA GCSE Geography' not in ' '.join(w['text'] for w in l['words'])))
        skills.append((code, s['title'], body[:3000], s['page']))
    TITLE = {'3.2.1': 'Urban issues and challenges', '3.2.2': 'The changing economic world', '3.3.1': 'Issue evaluation', '3.3.2': 'Fieldwork'}
    for code, name in TITLE.items():
        sections[code]['title'] = name
        if code in PROSE:
            leaves_by_sec[code][0]['title'] = name
    # 4. assemble the tree
    order, legacy = [], {}
    themes = {}
    for code, (paper, theme, ttitle, old) in SECTION.items():
        group_id = old if code not in ('3.2.1', '3.2.2') else old
        points = []
        for n, leaf in enumerate(leaves_by_sec[code], 1):
            pid = f'{group_id}.k{n}'
            points.append({'id': pid, 'code': f'{code} ({n})' if len(leaves_by_sec[code]) > 1 else code, 'title': leaf['title'][:160],
                           'official_reference': {'section': code, 'key_idea': n if len(leaves_by_sec[code]) > 1 else None, 'source_pages': [leaf['page']]},
                           'content': leaf['content'] or [leaf['title']]})
            order.append(pid)
        themes.setdefault((paper, theme), {'title': ttitle, 'groups': []})
        if ttitle:
            themes[(paper, theme)]['title'] = ttitle
        themes[(paper, theme)]['groups'].append((code, sections[code]['title'], group_id, points))
        if code not in ('3.2.1', '3.2.2'):
            legacy[old] = [p['id'] for p in points]
    # urban / economic legacy ids covered several key ideas each: filled in by hand below once the key ideas are known
    sp_urban = [p['id'] for p in themes[('P2', 'URBAN')]['groups'][0][3]]
    sp_econ = [p['id'] for p in themes[('P2', 'ECON')]['groups'][0][3]]
    print('urban key ideas', len(sp_urban), [p['title'][:50] for p in themes[('P2', 'URBAN')]['groups'][0][3]])
    print('econ key ideas', len(sp_econ), [p['title'][:50] for p in themes[('P2', 'ECON')]['groups'][0][3]])
    legacy['AQA_GCSE_GEOG_URBAN_4.1'] = sp_urban[:2]
    legacy['AQA_GCSE_GEOG_URBAN_4.2'] = sp_urban[2:3]
    legacy['AQA_GCSE_GEOG_URBAN_4.3'] = sp_urban[3:]
    legacy['AQA_GCSE_GEOG_ECON_5.1'] = sp_econ[:1]
    legacy['AQA_GCSE_GEOG_ECON_5.2'] = sp_econ[1:2]
    legacy['AQA_GCSE_GEOG_ECON_5.3'] = sp_econ[2:3]
    legacy['AQA_GCSE_GEOG_ECON_5.4'] = sp_econ[3:]
    skill_points = []
    for code, title, body, page in skills:
        pid = f'AQA_GCSE_GEOG_APP_7.3.{code.split(".")[-1]}'
        skill_points.append({'id': pid, 'code': code, 'title': title, 'official_reference': {'section': code, 'source_pages': [page]}, 'content': [body]})
        order.append(pid)
    legacy['AQA_GCSE_GEOG_APP_7.3'] = [p['id'] for p in skill_points]
    sections_out = []
    for pkey, (sid, stitle) in PAPERS.items():
        topics = []
        for (paper, theme), t in themes.items():
            if paper != pkey:
                continue
            for code, gtitle, gid, points in t['groups']:
                topics.append({'id': gid, 'code': code, 'title': gtitle, 'kind': 'topic', 'points': points})
        if pkey == 'P3':
            topics.append({'id': 'AQA_GCSE_GEOG_APP_7.3', 'code': '3.4', 'title': 'Geographical skills', 'kind': 'skills', 'points': skill_points})
        sections_out.append({'id': sid, 'title': stitle, 'topics': topics})
    spec = {'subject_id': 'AQA_GCSE_GEOG_8035', 'specification_version': 'aqa-8035-v1.1-2023-09', 'official_source_url': URL, 'order_status': 'verified',
            'official_source': {'title': 'AQA GCSE Geography (8035) specification', 'version': 'Version 1.1', 'issue_date': '12 September 2023',
                                'first_teaching': 2016, 'first_exams': 2018, 'url': URL, 'sha256': SHA, 'verified_at': '2026-11-21'},
            'approach': 'Official AQA content order. No textbook organisation has been supplied.',
            'components': {'8035/1': {'title': 'Living with the physical environment', 'marks': 88, 'minutes': 90},
                           '8035/2': {'title': 'Challenges in the human environment', 'marks': 88, 'minutes': 90},
                           '8035/3': {'title': 'Geographical applications', 'marks': 76, 'minutes': 75}},
            'notes': 'Leaves are AQA key ideas (id <section>.k<n>) with AQA content verbatim; issue evaluation, fieldwork and each skills heading are one leaf each. Earlier unverified leaf ids migrate to the key ideas they covered.',
            'legacy_ids': legacy, 'point_order': order, 'sections': sections_out}
    (REPO / 'data/specs/AQA_GCSE_GEOG_8035.json').write_text(json.dumps(spec, ensure_ascii=False, indent=2) + '\n')
    sys.path.insert(0, str(REPO / 'tools'))
    from write_spec_migrations import write_migrations
    write_migrations(REPO)
    print('wrote', len(order), 'leaves')


if __name__ == '__main__':
    main()
