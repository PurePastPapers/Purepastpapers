#!/usr/bin/env python3
"""Resolve every figure/table a Geography unit cites to a source-pixel region.

Order: printed in the unit's own crop; printed in its question's shared stem; in the
paper's insert; printed inline elsewhere in the question paper. A cited figure that
AQA removed (copyright notice) makes the unit incomplete. A citation that resolves
nowhere is reported for review rather than guessed.
"""
from collections import Counter


def resolve(candidate, insert_index):
    stems = candidate.get('stems', {})
    inline = candidate.get('inline_figures', {})
    results = {}
    for u in candidate['units']:
        own = set(u.get('figures_printed', []))
        stem = stems.get(u.get('shared_stem'), {}) if u.get('shared_stem') else {}
        cited = list(u['figures']) + [f for f in stem.get('figures', []) if f not in u['figures']]
        entries, removed, missing = [], [], []
        for f in cited:
            if f in own:
                src = ('own', None)
                gone = candidate['inline_figures'].get(f, {}).get('removed', False)
            elif f in set(stem.get('figures_printed', [])):
                src, gone = ('stem', None), inline.get(f, {}).get('removed', False)
            elif insert_index and f in insert_index['figures']:
                src, gone = ('insert', insert_index['figures'][f]['regions']), insert_index['figures'][f]['removed']
            elif f in inline:
                src, gone = ('inline', inline[f]['regions']), inline[f]['removed']
            else:
                missing.append(f)
                continue
            entries.append({'figure': f, 'source': src[0], 'regions': src[1], 'removed': gone})
            if gone:
                removed.append(f)
        results[u['label']] = {'figures': entries, 'removed': removed, 'unresolved': missing,
                               'text_removed': bool(u.get('copyright_removed_content') or stem.get('copyright_removed_content'))}
    return results


def summary(all_results):
    c = Counter()
    for res in all_results.values():
        for r in res.values():
            for e in r['figures']:
                c[e['source']] += 1
            c['units_removed'] += bool(r['removed'] or r['text_removed'])
            c['units_unresolved'] += bool(r['unresolved'])
    return c
