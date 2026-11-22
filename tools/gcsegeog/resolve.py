#!/usr/bin/env python3
"""Resolve every figure/table a GCSE Geography unit cites to a source-pixel region.

Order: printed in the unit's own crop; printed in its question's shared stem; in the paper's
resource booklet or insert (index_resources); printed inline elsewhere in the question paper.
A cited figure that AQA removed (copyright notice) makes the unit incomplete. A citation that
resolves nowhere is reported for review rather than guessed.

Two GCSE-specific rules:
- "Study either Figure 5 or Figure 6": the part's own crop prints both photographs, but the
  extractor only indexes the first heading, so a cited figure that the part's own text introduces
  with "Figure n -" or "Figure n," (a caption) counts as printed in its own crop.
- An OS map is printed in the question paper but its key is on the insert. A unit that cites an OS
  map (that figure is called an Ordnance Survey map in some part) gets the insert's "Key for Figure n" (or the
  generic "Key") attached as an extra unscored figure.
"""
import re
from collections import Counter

OS_TEXT = re.compile(r'Ordnance Survey|\bOS map|\bmap evidence|\(\d{6}\)|1\s?:\s?(?:25|50)\s?000')


def own_caption(text, figure):
    n = figure.split()[-1]
    return bool(re.search(rf'\b{figure.split()[0]}\s+{n}\s*[–—-]\s*\w', text))


def contains_figure(regions, figure):
    """Check for side-by-side figures whose shared panel is already in the part crop."""
    return bool(figure) and all(any(
        unit['page'] == panel['page']
        and unit['bbox'][0] <= panel['bbox'][0] and unit['bbox'][1] <= panel['bbox'][1]
        and unit['bbox'][2] >= panel['bbox'][2] and unit['bbox'][3] >= panel['bbox'][3]
        for unit in regions) for panel in figure['regions'])


def resolve(candidate, index, roles=None):
    roles = roles or {}
    stems = candidate.get('stems', {})
    inline = candidate.get('inline_figures', {})
    results = {}
    booklet = [n for n, f in index['figures'].items() if roles.get(f['file']) == 'resource_booklet'] if index else []
    qfigs = {}   # booklet figures named by any part of a question
    for u in candidate['units']:
        for f in u['figures']:
            if f in booklet and f not in qfigs.setdefault(u['question'], []):
                qfigs[u['question']].append(f)
    # An insert map used by parts 1 and 3 of a question is also needed by part 2, which may not name it again.
    between, spans = {}, {}
    for n, u in enumerate(candidate['units']):
        for f in u['figures']:
            if index and f in index['figures'] and roles.get(index['figures'][f]['file'], 'insert') == 'insert':
                lo, hi = spans.get((u['question'], f), (n, n))
                spans[(u['question'], f)] = (min(lo, n), max(hi, n))
    for (q, f), (lo, hi) in spans.items():
        for n in range(lo + 1, hi):
            if candidate['units'][n]['question'] == q:
                between.setdefault(n, []).append(f)
    # A figure is an OS map when any part that cites it says so ("a 1:50 000 Ordnance Survey map"); later parts only say "Figure 14".
    os_figs = {f for u in candidate['units'] if OS_TEXT.search(u['text']) for f in (u['figures'] or qfigs.get(u['question'], []))}
    for n, u in enumerate(candidate['units']):
        own = set(u.get('figures_printed', []))
        stem = stems.get(u.get('shared_stem'), {}) if u.get('shared_stem') else {}
        cited = list(u['figures']) + [f for f in stem.get('figures', []) if f not in u['figures']]
        cited += [f for f in between.get(n, []) if f not in cited]
        if booklet and u.get('section') == 'Section A':
            # Paper 3 Section A: a question is based on the booklet figure(s) some part of it names, even where a later part does not
            # name them again; "Use evidence from the resources booklet" needs every figure of the booklet.
            wanted = booklet if re.search(r'evidence from the resources? booklet', u['text'], re.I) else qfigs.get(u['question'], [])
            cited += [f for f in wanted if f in booklet and f not in cited]
        entries, removed, missing = [], [], []
        for f in cited:
            if f in own or (f in inline and contains_figure(u['regions'], inline[f])):
                src = ('own', None, None)
                gone = inline.get(f, {}).get('removed', False)
            elif f in set(stem.get('figures_printed', [])):
                src, gone = ('stem', None, None), inline.get(f, {}).get('removed', False)
            elif index and f in index['figures']:
                fig = index['figures'][f]
                src, gone = (roles.get(fig['file'], 'insert'), fig['regions'], fig['file']), fig['removed']
            elif f in inline:
                src, gone = ('inline', inline[f]['regions'], None), inline[f]['removed']
            elif own_caption(u['text'], f):
                src, gone = ('own', None, None), False
            else:
                missing.append(f)
                continue
            entries.append({'figure': f, 'source': src[0], 'regions': src[1], 'file': src[2], 'removed': gone})
            if gone:
                removed.append(f)
        if index and any(f in os_figs for f in cited):
            keys = [f'Key for {f}' for f in cited if f'Key for {f}' in index['figures']] or (['Key'] if 'Key' in index['figures'] else [])
            for k in keys:
                fig = index['figures'][k]
                entries.append({'figure': k, 'source': roles.get(fig['file'], 'insert'), 'regions': fig['regions'], 'file': fig['file'], 'removed': fig['removed']})
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


def paper_index(paper, sources):
    """The figure index of a paper's resource booklet (Paper 3) and insert (OS key, colour map), plus file roles."""
    from figures import index_resources
    docs = [d for d in (paper.get('resource_booklet'), paper.get('insert')) if d]
    index = index_resources([sources / d['file_name'] for d in docs]) if docs else None
    roles = {paper['resource_booklet']['file_name']: 'resource_booklet'} if paper.get('resource_booklet') else {}
    return index, roles, docs
