#!/usr/bin/env python3
"""Build the official physics statement trees for 1PH0 and the physics part of 1SC0.

Sources (the build refuses any other revision):
  1PH0 Issue 4 (March 2024), content pages 15-50: 296 numbered statements.
  1SC0 Issue 6 (March 2024), physics content pages 58-84: 205 statements.

Pearson prints Higher-only content in bold; a "P" suffix (5.9P) marks a statement that is
in separate Physics only (all of Topics 7 and 11). Every 1SC0 physics statement has the
same code as its 1PH0 statement. Codes are strings (2.1, 2.10 and 2.11 are distinct).

Runtime leaves: EDX_GCSE_PHYS_OFF_<code> (1PH0) and EDX_GCSE_COMBSCI_PHYS_<code> (1SC0).
Topics keep their earlier runtime ids (EDX_GCSE_PHYS_P1..P15, EDX_GCSE_COMBSCI_P1..P15).
The earlier unverified leaves (EDX_GCSE_PHYS_P2_2.1 ...) were topic clusters; they become
legacy_ids that expand to the official statements of their cluster (LEGACY below, checked
against each old title), so saved ticks keep their meaning. The 1SC0 biology and chemistry
sections are left exactly as they are.

    python3 tools/gcsephys/build_spec.py <research>/spec
"""
import hashlib, json, re, sys
from pathlib import Path
from spec_parse import parse
from textfix import TEXT_FIX

ROOT = Path(__file__).resolve().parents[2]
BASE = 'https://qualifications.pearson.com/content/dam/pdf/GCSE/Science/2016/Specification/'
SOURCES = {
    '1PH0': {'file': 'gcse-physics-spec.pdf', 'sha': 'd0d1c1764ace4274434fda2bbcb269d0792e6b1fd1108f480e687f76ea8441d9',
             'pages': (15, 50), 'issue': 'Issue 4', 'issue_date': 'March 2024'},
    '1SC0': {'file': 'gcse-combinedscience-spec.pdf', 'sha': '0ededb98f1aa079e2fa0f4eb9e5b6a8dacd5eb0807aaaaf9936ac3773bd5583c',
             'pages': (58, 84), 'issue': 'Issue 6', 'issue_date': 'March 2024'},
}
TOPICS = {1: 'Key concepts of physics', 2: 'Motion and forces', 3: 'Conservation of energy', 4: 'Waves',
          5: 'Light and the electromagnetic spectrum', 6: 'Radioactivity', 7: 'Astronomy',
          8: 'Energy – forces doing work', 9: 'Forces and their effects', 10: 'Electricity and circuits',
          11: 'Static electricity', 12: 'Magnetism and the motor effect', 13: 'Electromagnetic induction',
          14: 'Particle model', 15: 'Forces and matter'}
PAPER1 = [2, 3, 4, 5, 6, 7]
PAPER2 = [8, 9, 10, 11, 12, 13, 14, 15]
# Old cluster leaf -> statement number ranges (inclusive, by number within the topic).
LEGACY = {
    '1_1.1': [(1, 4)],
    '2_2.1': [(1, 7)], '2_2.2': [(8, 13)], '2_2.3': [(14, 23)], '2_2.4': [(24, 26)], '2_2.5': [(27, 33)],
    '3_3.1': [(1, 6)], '3_3.2': [(7, 12)], '3_3.3': [(13, 14)],
    '4_4.1': [(1, 7)], '4_4.2': [(8, 11)], '4_4.3': [(12, 17)],
    '5_5.1': [(7, 14), (20, 24)], '5_5.2': [(1, 6)], '5_5.3': [(15, 19)],
    '6_6.1': [(1, 9), (17, 17)], '6_6.2': [(10, 16), (18, 22)], '6_6.3': [(23, 27)], '6_6.4': [(29, 32)],
    '6_6.5': [(28, 28), (33, 46)],
    '7_7.1': [(1, 7)], '7_7.2': [(16, 18)], '7_7.3': [(8, 15), (19, 19)],
    '8_8.1': [(1, 15)],
    '9_9.1': [(1, 5), (10, 10)], '9_9.2': [(6, 9)],
    '10_10.1': [(1, 11)], '10_10.2': [(12, 21)], '10_10.3': [(22, 32)], '10_10.4': [(33, 42)],
    '11_11.1': [(1, 10)],
    '12_12.1': [(1, 9)], '12_12.2': [(10, 14)],
    '13_13.1': [(5, 11)], '13_13.2': [(1, 4)],
    '14_14.1': [(1, 5)], '14_14.2': [(6, 11)], '14_14.3': [(12, 20)],
    '15_15.1': [(1, 6)], '15_15.2': [(7, 17)],
}


def num(code):
    return int(re.match(r'\d+\.(\d+)', code).group(1))


def legacy_map(statements, available):
    """Old leaf key -> codes. A code whose cluster leaf is not in `available` (1SC0 never had
    it) joins the last available leaf of its topic, so every statement is covered once."""
    out = {k: [] for k in LEGACY if k in available}
    for s in statements:
        home = next(k for k, rs in LEGACY.items() if int(k.split('_')[0]) == s['topic'] and any(a <= num(s['code']) <= b for a, b in rs))
        if home not in out:
            home = [k for k in out if int(k.split('_')[0]) == s['topic']][-1]
        out[home].append(s['code'])
    return out


def short(text):
    t = re.split(r',? including:|:\s+a\s|, including\b| \(|; | – ', text)[0].strip().rstrip('.,;:')
    return t if len(t) <= 96 else t[:93].rsplit(' ', 1)[0] + '…'


def point(qual, prefix, s):
    tiers = ['Higher'] if s['higher_only'] else ['Foundation', 'Higher']
    text = TEXT_FIX.get(s['code'], s['text'])
    p = {'id': prefix + s['code'], 'code': s['code'], 'title': short(text), 'full_text': text,
         'official_reference': {'reference_id': f"{qual}-{SOURCES[qual]['issue'].upper().replace(' ', '')}-{s['code']}",
                                'code': s['code'], 'topic': s['topic'], 'source_pages': [s['page']], 'tiers': tiers,
                                'papers': ['1', '2'] if s['topic'] == 1 else (['1'] if s['topic'] in PAPER1 else ['2']),
                                'physics_only': s['physics_only'],
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
    phys, comb = official('1PH0', spec_dir), official('1SC0', spec_dir)
    assert len(phys) == 296 and len(comb) == 205, (len(phys), len(comb))
    pcodes = {s['code']: s for s in phys}
    for s in comb:
        c = pcodes[s['code']]
        assert not c['physics_only'] and c['higher_only'] == s['higher_only'], s['code']
    assert {s['code'] for s in comb} == {c for c, s in pcodes.items() if not s['physics_only']}
    assert all(s['physics_only'] for s in phys if s['topic'] in (7, 11))

    # 1PH0
    path = ROOT / 'data/specs/EDX_GCSE_PHYS_1PH0.json'
    old = json.loads(path.read_text())
    old_leaves = set(old.get('legacy_ids') or {}) or {p['id'] for sec in old['sections'] for t in sec['topics'] for p in t['points']}
    key = lambda k, base: f'{base}{k.split("_")[0]}_{k.split("_")[1]}'
    legacy_codes = legacy_map(phys, set(LEGACY))
    assert sum(len(v) for v in legacy_codes.values()) == len(phys)
    groups = [('EDX_GCSE_PHYS_SEC_KEY', 'Both papers', [1]), ('EDX_GCSE_PHYS_SEC_P1', 'Paper 1', PAPER1),
              ('EDX_GCSE_PHYS_SEC_P2', 'Paper 2', PAPER2)]
    pre = 'EDX_GCSE_PHYS_OFF_'
    sections = [{'id': sid, 'title': title, 'topics': [
        {'id': f'EDX_GCSE_PHYS_P{n}', 'code': str(n), 'title': f'Topic {n} – {TOPICS[n]}',
         'points': [point('1PH0', pre, s) for s in phys if s['topic'] == n]} for n in nums]} for sid, title, nums in groups]
    legacy = {key(k, 'EDX_GCSE_PHYS_P'): [pre + c for c in v] for k, v in legacy_codes.items()}
    assert set(legacy) == old_leaves, old_leaves ^ set(legacy)
    out = {'subject_id': 'EDX_GCSE_PHYS_1PH0', 'specification_version': 'pearson-1ph0-issue4-2024-03',
           'official_source_url': BASE + SOURCES['1PH0']['file'], 'order_status': 'verified',
           'official_source': source_record('1PH0', {
               'title': 'Pearson Edexcel Level 1/Level 2 GCSE (9-1) in Physics (1PH0) specification', 'first_certification': 2018,
               'tiers': {'Foundation': 'Grades 1-5', 'Higher': 'Grades 4-9 (Higher-only content printed in bold)'},
               'components': {c: {'title': f"Paper {c[0]} {'Foundation' if c[1] == 'F' else 'Higher'}", 'marks': 100, 'minutes': 105,
                                  'topics': [1] + (PAPER1 if c[0] == '1' else PAPER2)} for c in ('1F', '1H', '2F', '2H')},
               'notes': f"{len(phys)} statements; {sum(s['higher_only'] for s in phys)} Higher-only (tier \"Higher\"); "
                        f"{sum(s['physics_only'] for s in phys)} separate-Physics only (code suffix P); "
                        f"{sum(s['higher_extension'] for s in phys)} with a Higher-only bold extension (higher_extension)."}),
           'legacy_ids': legacy, 'point_order': [p['id'] for sec in sections for t in sec['topics'] for p in t['points']],
           'sections': sections}
    path.write_text(json.dumps(out, ensure_ascii=False, indent=2) + '\n')

    # 1SC0: replace the physics section only.
    path = ROOT / 'data/specs/EDX_GCSE_COMBSCI_1SC0.json'
    spec = json.loads(path.read_text())
    psec = next(s for s in spec['sections'] if s['id'] == 'EDX_GCSE_COMBSCI_SEC_PHYS')
    is_old = lambda k: re.match(r'EDX_GCSE_COMBSCI_P\d+_', k)
    old_leaves = {k for k in (spec.get('legacy_ids') or {}) if is_old(k)} or {p['id'] for t in psec['topics'] for p in t['points']}
    pre = 'EDX_GCSE_COMBSCI_PHYS_'
    psec['title'] = 'Physics'
    nums = sorted({s['topic'] for s in comb})
    assert nums == [1, 2, 3, 4, 5, 6, 8, 9, 10, 12, 13, 14, 15], nums
    psec['topics'] = [{'id': f'EDX_GCSE_COMBSCI_P{n}', 'code': f'P{n}', 'title': f'Physics Topic {n} – {TOPICS[n]}',
                       'points': [point('1SC0', pre, s) for s in comb if s['topic'] == n]} for n in nums]
    available = {k for k in LEGACY if key(k, 'EDX_GCSE_COMBSCI_P') in old_leaves}
    legacy = {key(k, 'EDX_GCSE_COMBSCI_P'): [pre + c for c in v] for k, v in legacy_map(comb, available).items()}
    assert all(legacy.values()) and set(legacy) == old_leaves, old_leaves ^ set(legacy)
    spec['legacy_ids'] = {**{k: v for k, v in (spec.get('legacy_ids') or {}).items() if not is_old(k)}, **legacy}
    srcs = spec.setdefault('official_sources', {})
    srcs['physics'] = source_record('1SC0', {
        'title': 'Pearson Edexcel Level 1/Level 2 GCSE (9-1) in Combined Science (1SC0) specification, physics content',
        'first_certification': 2018,
        'components': {c: {'title': f"Physics Paper {c[0]} {'Foundation' if c[2] == 'F' else 'Higher'}", 'marks': 60, 'minutes': 70,
                           'topics': [1, 2, 3, 4, 5, 6] if c[0] == '1' else [1, 8, 9, 10, 12, 13, 14, 15]}
                       for c in ('1PF', '1PH', '2PF', '2PH')},
        'notes': f"{len(comb)} physics statements, numbered as in 1PH0; {sum(s['higher_only'] for s in comb)} Higher-only."})
    spec['physics_order_status'] = 'verified'
    path.write_text(json.dumps(spec, ensure_ascii=False, indent=2) + '\n')
    # Hidden demo questions move to the official leaves their old tags covered.
    for sid, legacy_map_ in (('EDX_GCSE_PHYS_1PH0', out['legacy_ids']), ('EDX_GCSE_COMBSCI_1SC0', spec['legacy_ids'])):
        qpath = ROOT / 'data/questions' / f'{sid}.json'
        data = json.loads(qpath.read_text())
        for q in (data if isinstance(data, list) else data['questions']):
            for k in ('primary_spec_points', 'crossover_spec_points'):
                q[k] = list(dict.fromkeys(x for t in q.get(k, []) for x in legacy_map_.get(t, [t])))
            q['crossover_spec_points'] = [t for t in q['crossover_spec_points'] if t not in q['primary_spec_points']]
        qpath.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n')
    print('1PH0', len(phys), '1SC0 physics', len(comb))


if __name__ == '__main__':
    main()
