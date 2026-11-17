#!/usr/bin/env python3
"""Build the official biology statement trees for 1BI0 and the biology part of 1SC0.

Sources (the build refuses any other revision):
  1BI0 Issue 4 (March 2024), content pages 14-36: 165 numbered statements.
  1SC0 Issue 6, biology content pages 17-36: 112 statements.

Pearson prints Higher-only content in bold; a "B" suffix (1.13B) marks a statement
that is in separate Biology only. Every 1SC0 biology statement has the same code and
wording as its 1BI0 statement. Codes are strings (2.1, 2.10 and 2.11 are distinct).

Runtime leaves: EDX_GCSE_BIOL_OFF_<code> (1BI0) and EDX_GCSE_COMBSCI_BIO_<code> (1SC0).
Topics keep their earlier runtime ids (EDX_GCSE_BIOL_B1..B9, EDX_GCSE_COMBSCI_B1..B9).
The earlier unverified leaves (EDX_GCSE_BIOL_B1_1.1 ...) become legacy_ids that expand
to the official statements they covered, so saved ticks keep their meaning. The 1SC0
chemistry and physics sections are left exactly as they were for their own imports.

    python3 tools/gcsebio/build_spec.py <research>/spec
"""
import hashlib, json, re, sys
from pathlib import Path
from spec_parse import parse

ROOT = Path(__file__).resolve().parents[2]
BASE = 'https://qualifications.pearson.com/content/dam/pdf/GCSE/Science/2016/Specification/'
SOURCES = {
    '1BI0': {'file': 'gcse-biology-spec.pdf', 'sha': 'd43eeb70253c58d51ea4920f7af5aa360ada2dab85799c855f29316c4e683aad',
             'pages': (14, 36), 'issue': 'Issue 4', 'issue_date': 'March 2024'},
    '1SC0': {'file': 'gcse-combinedscience-spec.pdf', 'sha': '0ededb98f1aa079e2fa0f4eb9e5b6a8dacd5eb0807aaaaf9936ac3773bd5583c',
             'pages': (17, 36), 'issue': 'Issue 6', 'issue_date': None},
}
TOPICS = {1: 'Key concepts in biology', 2: 'Cells and control', 3: 'Genetics',
          4: 'Natural selection and genetic modification', 5: 'Health, disease and the development of medicines',
          6: 'Plant structures and their functions', 7: 'Animal coordination, control and homeostasis',
          8: 'Exchange and transport in animals', 9: 'Ecosystems and material cycles'}
# Earlier unverified runtime leaves -> the official statements they covered (both quals).
LEGACY = {
    '1_1.1': ['1.1', '1.2'], '1_1.2': ['1.3', '1.4', '1.5', '1.6'], '1_1.3': ['1.7', '1.8', '1.9', '1.10', '1.11', '1.12'],
    '1_1.4': ['1.15', '1.16', '1.17'], '1_1.5': ['1.13B', '1.14B'],
    '2_2.1': ['2.1', '2.2', '2.3', '2.4', '2.5', '2.7'], '2_2.2': ['2.6', '2.8', '2.9'], '2_2.3': ['2.13', '2.14'],
    '2_2.4': ['2.10B', '2.11B', '2.12B', '2.15B', '2.16B', '2.17B'],
    '3_3.1': ['3.3', '3.4', '3.5', '3.6'], '3_3.2': ['3.12', '3.13', '3.14', '3.15', '3.16'],
    '3_3.3': ['3.19', '3.20', '3.21', '3.22', '3.23'], '3_3.4': ['3.1B', '3.2B', '3.7B', '3.8B', '3.9B', '3.10B'],
    '3_3.5': ['3.11B', '3.17B', '3.18B'],
    '4_4.1': ['4.1B', '4.2', '4.3', '4.4', '4.5', '4.6B'], '4_4.2': ['4.7'], '4_4.3': ['4.8', '4.10', '4.11', '4.14'],
    '4_4.4': ['4.9B', '4.12B', '4.13B'],
    '5_5.1': ['5.1', '5.2', '5.3'], '5_5.2': ['5.4', '5.5', '5.6', '5.7B', '5.8'], '5_5.3': ['5.12', '5.13', '5.14', '5.15B'],
    '5_5.4': ['5.16', '5.17B', '5.18B', '5.19B', '5.20'], '5_5.5': ['5.23', '5.24', '5.25'],
    '5_5.6': ['5.9B', '5.10B', '5.11B', '5.21B', '5.22B'],
    '6_6.1': ['6.1', '6.2', '6.3', '6.4', '6.5', '6.6'], '6_6.2': ['6.7', '6.8', '6.9', '6.10', '6.12', '6.13'],
    '6_6.3': ['6.11B', '6.14B', '6.15B', '6.16B'],
    '7_7.1': ['7.1', '7.2', '7.3'], '7_7.2': ['7.4', '7.5', '7.6', '7.7', '7.8'],
    '7_7.3': ['7.9', '7.13', '7.14', '7.15', '7.16', '7.17'],
    '7_7.4': ['7.10B', '7.11B', '7.12B', '7.18B', '7.19B', '7.20B', '7.21B', '7.22B'],
    '8_8.1': ['8.1', '8.2', '8.3', '8.4B', '8.5B'], '8_8.2': ['8.6', '8.7', '8.8', '8.12'], '8_8.3': ['8.9', '8.10', '8.11'],
    '9_9.1': ['9.1', '9.2', '9.3', '9.4'], '9_9.2': ['9.5', '9.6'], '9_9.3': ['9.9', '9.10', '9.16B'],
    '9_9.4': ['9.12', '9.13', '9.14', '9.15'], '9_9.5': ['9.7B', '9.8B', '9.11B', '9.17B', '9.18B', '9.19B'],
}


def short(text):
    t = re.split(r',? including:|:\s+a\s|, including\b| \(| – ', text)[0].strip().rstrip('.,;')
    return t if len(t) <= 96 else t[:93].rsplit(' ', 1)[0] + '…'


def point(qual, prefix, s):
    tiers = ['Higher'] if s['higher_only'] else ['Foundation', 'Higher']
    p = {'id': prefix + s['code'], 'code': s['code'], 'title': short(s['text']), 'full_text': s['text'],
         'official_reference': {'reference_id': f"{qual}-{SOURCES[qual]['issue'].upper().replace(' ', '')}-{s['code']}",
                                'code': s['code'], 'topic': s['topic'], 'source_pages': [s['page']], 'tiers': tiers,
                                'papers': ['1', '2'] if s['topic'] == 1 else (['1'] if s['topic'] <= 5 else ['2']),
                                'biology_only': s['biology_only'],
                                **({'higher_extension': True} if s['higher_extension'] else {})}}
    if s['higher_only']:
        p['tier'] = 'Higher'
    return p


def official(qual, spec_dir):
    src = SOURCES[qual]
    path = spec_dir / src['file']
    if hashlib.sha256(path.read_bytes()).hexdigest() != src['sha']:
        raise SystemExit(f'{path} is not the recorded {qual} specification revision')
    return parse(str(path), src['pages'])


def source_record(qual, extra):
    src = SOURCES[qual]
    return {'url': BASE + src['file'], 'sha256': src['sha'], 'issue': src['issue'], 'issue_date': src['issue_date'],
            'content_pages': list(src['pages']), 'verified_at': '2026-11-17', **extra}


def main():
    spec_dir = Path(sys.argv[1])
    bio, comb = official('1BI0', spec_dir), official('1SC0', spec_dir)
    assert len(bio) == 165 and len(comb) == 112, (len(bio), len(comb))
    bcodes = {s['code']: s for s in bio}
    for s in comb:
        b = bcodes[s['code']]
        assert not b['biology_only'] and b['higher_only'] == s['higher_only'], s['code']
    assert {s['code'] for s in comb} == {c for c, s in bcodes.items() if not s['biology_only']}

    # 1BI0
    path = ROOT / 'data/specs/EDX_GCSE_BIOL_1BI0.json'
    old = json.loads(path.read_text())
    old_leaves = set(old.get('legacy_ids') or {}) or {p['id'] for sec in old['sections'] for t in sec['topics'] for p in t['points']}
    groups = [('EDX_GCSE_BIOL_SEC_KEY', 'Both papers', [1]), ('EDX_GCSE_BIOL_SEC_P1', 'Paper 1', [2, 3, 4, 5]),
              ('EDX_GCSE_BIOL_SEC_P2', 'Paper 2', [6, 7, 8, 9])]
    pre = 'EDX_GCSE_BIOL_OFF_'
    sections = [{'id': sid, 'title': title, 'topics': [
        {'id': f'EDX_GCSE_BIOL_B{n}', 'code': str(n), 'title': f'Topic {n} – {TOPICS[n]}',
         'points': [point('1BI0', pre, s) for s in bio if s['topic'] == n]} for n in nums]} for sid, title, nums in groups]
    legacy = {f'EDX_GCSE_BIOL_B{k.split("_")[0]}_{k.split("_")[1]}': [pre + c for c in v] for k, v in LEGACY.items()}
    assert set(legacy) == old_leaves or set(legacy) >= old_leaves, old_leaves - set(legacy)
    legacy = {k: v for k, v in legacy.items() if k in old_leaves}
    assert all(c.removeprefix(pre) in bcodes for v in legacy.values() for c in v)
    out = {'subject_id': 'EDX_GCSE_BIOL_1BI0', 'specification_version': 'pearson-1bi0-issue4-2024-03',
           'official_source_url': BASE + SOURCES['1BI0']['file'], 'order_status': 'verified',
           'official_source': source_record('1BI0', {
               'title': 'Pearson Edexcel Level 1/Level 2 GCSE (9-1) in Biology (1BI0) specification', 'first_certification': 2018,
               'tiers': {'Foundation': 'Grades 1-5', 'Higher': 'Grades 4-9 (Higher-only content printed in bold)'},
               'components': {c: {'title': f"Paper {c[0]} {'Foundation' if c[1] == 'F' else 'Higher'}", 'marks': 100, 'minutes': 105,
                                  'topics': [1, 2, 3, 4, 5] if c[0] == '1' else [1, 6, 7, 8, 9]} for c in ('1F', '1H', '2F', '2H')},
               'notes': f"{len(bio)} statements; {sum(s['higher_only'] for s in bio)} Higher-only (tier \"Higher\"); "
                        f"{sum(s['biology_only'] for s in bio)} separate-Biology only (code suffix B)."}),
           'legacy_ids': legacy, 'point_order': [p['id'] for sec in sections for t in sec['topics'] for p in t['points']],
           'sections': sections}
    path.write_text(json.dumps(out, ensure_ascii=False, indent=2) + '\n')

    # 1SC0: replace the biology section only.
    path = ROOT / 'data/specs/EDX_GCSE_COMBSCI_1SC0.json'
    spec = json.loads(path.read_text())
    bsec = next(s for s in spec['sections'] if s['id'] == 'EDX_GCSE_COMBSCI_SEC_BIO')
    old_leaves = {k for k in (spec.get('legacy_ids') or {}) if k.startswith('EDX_GCSE_COMBSCI_B')} or {p['id'] for t in bsec['topics'] for p in t['points']}
    pre = 'EDX_GCSE_COMBSCI_BIO_'
    bsec['title'] = 'Biology'
    bsec['topics'] = [{'id': f'EDX_GCSE_COMBSCI_B{n}', 'code': f'B{n}', 'title': f'Biology Topic {n} – {TOPICS[n]}',
                       'points': [point('1SC0', pre, s) for s in comb if s['topic'] == n]} for n in range(1, 10)]
    comb_codes = {s['code'] for s in comb}
    legacy = {}
    for k, v in LEGACY.items():
        old_id = f'EDX_GCSE_COMBSCI_B{k.split("_")[0]}_{k.split("_")[1]}'
        if old_id in old_leaves:
            legacy[old_id] = [pre + c for c in v if c in comb_codes]
            assert legacy[old_id], old_id
    assert set(legacy) == old_leaves, old_leaves - set(legacy)
    spec['legacy_ids'] = {**{k: v for k, v in (spec.get('legacy_ids') or {}).items() if not k.startswith('EDX_GCSE_COMBSCI_B')}, **legacy}
    srcs = spec.setdefault('official_sources', {})
    srcs['biology'] = source_record('1SC0', {
        'title': 'Pearson Edexcel Level 1/Level 2 GCSE (9-1) in Combined Science (1SC0) specification, biology content',
        'first_certification': 2018,
        'components': {c: {'title': f"Biology Paper {c[0]} {'Foundation' if c[2] == 'F' else 'Higher'}", 'marks': 60, 'minutes': 70,
                           'topics': [1, 2, 3, 4, 5] if c[0] == '1' else [1, 6, 7, 8, 9]} for c in ('1BF', '1BH', '2BF', '2BH')},
        'notes': f"{len(comb)} biology statements, numbered as in 1BI0; {sum(s['higher_only'] for s in comb)} Higher-only."})
    spec['biology_order_status'] = 'verified'
    path.write_text(json.dumps(spec, ensure_ascii=False, indent=2) + '\n')
    # Hidden demo questions move to the official leaves their old tags covered.
    for sid, legacy_map in (('EDX_GCSE_BIOL_1BI0', out['legacy_ids']), ('EDX_GCSE_COMBSCI_1SC0', spec['legacy_ids'])):
        qpath = ROOT / 'data/questions' / f'{sid}.json'
        data = json.loads(qpath.read_text())
        for q in (data if isinstance(data, list) else data['questions']):
            for key in ('primary_spec_points', 'crossover_spec_points'):
                q[key] = list(dict.fromkeys(x for t in q.get(key, []) for x in legacy_map.get(t, [t])))
            q['crossover_spec_points'] = [t for t in q['crossover_spec_points'] if t not in q['primary_spec_points']]
        qpath.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n')
    print('1BI0', len(bio), '1SC0 biology', len(comb))


if __name__ == '__main__':
    main()
