#!/usr/bin/env python3
"""Build data/specs/EDX_GCSE_HIST_1HI0.json from Pearson's GCSE (9-1) History specification.

Usage: build_spec.py SPEC_PDF   (gcse-9-1-history-specification.pdf, Issue 6, June 2024)

Scope, as the owner chose (21 November 2026), checked against the specification's own option
and entry-code tables (Appendix 1): Paper 1 option 10 (Crime and punishment in Britain,
c1000-present with Whitechapel, c1870-c1900), Paper 2 British depth study B1 (Anglo-Saxon and
Norman England, c1060-88; the period-study booklets are not imported) and Paper 3 option 31
(Weimar and Nazi Germany, 1918-39). Pearson prints three-column tables: strand number and
title, then one or more bullets. Each runtime leaf is one official bullet with Pearson's
wording verbatim, coded <topic>.<strand>.<bullet> by printed position, with its printed page.
The earlier unverified tree had one id per period or key topic; each such id migrates to all
the bullets it covered (legacy_ids). Ids of options outside the scope are dropped.
"""
import hashlib
import json
import re
import sys
from pathlib import Path

SPEC_SHA = 'a5d760fd3856bf16cc724ca33794d7b57b0e1c5d41c9d792a3001629c0fe9c09'
SPEC_URL = 'https://qualifications.pearson.com/content/dam/pdf/GCSE/History/2016/specification-and-sample-assessments/gcse-9-1-history-specification.pdf'
REPO = Path(__file__).resolve().parents[2]
PRINTED_OFFSET = 4  # printed page = PDF page - 4 (cover and contents)
# (section id, section code, section title, option id stem, option code, PDF pages, first heading regexp, leaf-id stem, legacy group stem)
OPTIONS = [
    ('EDX_GCSE_HIST_SEC_P1', '10', 'Paper 1, Option 10: Crime and punishment in Britain, c1000–present and Whitechapel, c1870–c1900: crime, policing and the inner city',
     (12, 13, 14), 'CRIME'),
    ('EDX_GCSE_HIST_SEC_P2', 'B1', 'Paper 2, Booklet B, Option B1: Anglo-Saxon and Norman England, c1060–88', (26, 27), 'NORMAN'),
    ('EDX_GCSE_HIST_SEC_P3', '31', 'Paper 3, Option 31: Weimar and Nazi Germany, 1918–39', (48, 49), 'GERMANY'),
]
HEADING = re.compile(r'^(c\d{4}[–-]c?\w+:\s.*|Key topic \d: .*|The historic environment)$')
COMPONENTS = {'1HI0/10': {'title': 'Paper 1: Thematic study and historic environment (option 10)', 'marks': 52, 'minutes': 80},
              '1HI0/B1': {'title': 'Paper 2, Booklet B: British depth study (option B1)', 'marks': 32, 'minutes': 55},
              '1HI0/31': {'title': 'Paper 3: Modern depth study (option 31)', 'marks': 52, 'minutes': 90}}


def lines(page):
    words = [w for w in page.extract_words() if 60 < w['top'] < 770]
    return words


def parse_option(pdf, pages, stem, code):
    """Return [(topic title, [(strand number, strand title, bullet text, pdf page)])] for one option."""
    topics = []
    started = False
    for number in pages:
        page = pdf.pages[number - 1]
        words = lines(page)
        markers = sorted([w for w in words if w['text'] == '●'], key=lambda w: w['top'])
        # Group words into visual lines for headings (x0 near the left margin).
        rows = {}
        for w in sorted(words, key=lambda w: (round(w['top']), w['x0'])):
            for key in rows:
                if abs(key - w['top']) < 3:
                    rows[key].append(w)
                    break
            else:
                rows[w['top']] = [w]
        heads = []
        for top, ws in sorted(rows.items()):
            ws.sort(key=lambda w: w['x0'])
            text = ' '.join(w['text'] for w in ws)
            if ws[0]['x0'] < 90 and HEADING.match(text):
                heads.append((top, text))
        # Table markers start at the first heading; the intro bullets before it sit at x about 85.
        # Rows led by a non-digit word at the left margin are headings, wrapped heading lines or
        # intro bullets, never table cells: remove them so they do not bleed into the cell above.
        drop = {id(w) for ws in rows.values() for w in ([] if (ws[0]['x0'] >= 90 or re.fullmatch(r'\d', ws[0]['text'])) else ws)}
        words = [w for w in words if id(w) not in drop]
        markers = [m for m in markers if id(m) not in drop]
        table = [m for m in markers if m['x0'] > 100]
        if not table:
            continue
        col = min(m['x0'] for m in table) - 3
        strands = sorted([w for w in words if w['x0'] < 90 and re.fullmatch(r'\d', w['text']) and w['top'] > (heads[0][0] if heads else 0) - 2], key=lambda w: w['top'])
        # strand title words: left of the bullet column, right of the number
        for h_top, h_text in heads:
            if h_text.startswith('The historic environment') and not any(t[0].startswith('The historic') for t in topics):
                topics.append((h_text, []))
            elif not h_text.startswith('The historic'):
                if h_text not in [t[0] for t in topics]:
                    topics.append((h_text, []))
        for i, m in enumerate(table):
            nxt = table[i + 1]['top'] if i + 1 < len(table) else 10 ** 6
            body = [w for w in words if w['x0'] > m['x0'] + 3 and m['top'] - 2 <= w['top'] < nxt - 2 and w['text'] != '●']
            body.sort(key=lambda w: (round(w['top']), w['x0']))
            # words right of THIS marker's column only (a neighbouring column marker sits at the same x)
            text = re.sub(r'\s+', ' ', ' '.join(w['text'] for w in body)).strip()
            strand = [s for s in strands if s['top'] <= m['top'] + 2][-1]
            sw = [w for w in words if w['x0'] < col and strand['top'] - 2 <= w['top'] and w['x0'] >= strand['x0'] - 1]
            # title words: left column lines from this strand's number down to the next strand number
            nxt_s = next((s['top'] for s in strands if s['top'] > strand['top'] + 2), 10 ** 6)
            tw = sorted([w for w in words if w['x0'] < col and strand['top'] - 2 <= w['top'] < nxt_s - 2 and w is not strand],
                        key=lambda w: (round(w['top']), w['x0']))
            title = re.sub(r'\s+', ' ', ' '.join(w['text'] for w in tw)).strip()
            topic = [t for t in topics if True]
            head = [h for h in heads if h[0] <= m['top'] + 2]
            name = head[-1][1] if head else topics[-1][0]
            [bucket] = [t for t in topics if t[0] == name]
            bucket[1].append((int(strand['text']), title, text, number))
    return topics


def main():
    import pdfplumber
    pdf_path = Path(sys.argv[1])
    if hashlib.sha256(pdf_path.read_bytes()).hexdigest() != SPEC_SHA:
        raise SystemExit('Not the verified 1HI0 specification (Issue 6, June 2024)')
    old = json.loads((REPO / 'data/specs/EDX_GCSE_HIST_1HI0.json').read_text())
    # Idempotent: ids of the earlier unverified tree survive a rebuild through the spec's own legacy_ids.
    old_ids = {p['id']: t['code'] for s in old['sections'] for t in s['topics'] for p in t['points']}
    old_ids.update({k: 'legacy' for k in old.get('legacy_ids', {})})
    old_legacy = old.get('legacy_ids', {})
    sections, order, legacy, dropped = [], [], {}, []
    with pdfplumber.open(pdf_path) as pdf:
        for sid, option, stitle, pages, stem in OPTIONS:
            topics_out = []
            for ti, (tname, found) in enumerate(parse_option(pdf, pages, stem, option), 1):
                tid = f'EDX_GCSE_HIST_{stem}_T{ti}'
                tcode = f'{option}.{ti}'
                points, counters = [], {}
                for strand, strand_title, text, page in found:
                    counters[strand] = counters.get(strand, 0) + 1
                    code = f'{option}.{ti}.{strand}.{counters[strand]}'
                    title = re.split(r'\s*[:;]|\. ', text)[0].rstrip('.')
                    if len(title) > 90:
                        title = re.split(r', including|, the ', title)[0]
                    points.append({'id': f'EDX_GCSE_HIST_{stem}_{code}', 'code': code, 'title': title, 'content': text,
                                   'official_reference': {'option': option, 'topic': tname, 'strand': strand, 'strand_title': strand_title,
                                                          'bullet': counters[strand], 'source_pages': [page - PRINTED_OFFSET],
                                                          'numbering': 'Pearson numbers strands; bullets are unnumbered and coded by printed position'}})
                    order.append(points[-1]['id'])
                legacy_id = f'EDX_GCSE_HIST_{stem}_{option}.{ti}'
                if legacy_id in old_ids and (legacy_id in old_legacy or legacy_id in {p['id'] for s in old['sections'] for t in s['topics'] for p in t['points']}):
                    legacy[legacy_id] = [p['id'] for p in points]
                topics_out.append({'id': tid, 'code': tcode, 'title': tname, 'points': points})
            sections.append({'id': sid, 'code': option, 'title': stitle, 'topics': topics_out})
    kept = set(legacy)
    dropped = sorted(set(old_ids) - kept - {i for i in order})
    dropped = sorted(set(dropped) | set(old.get('scope', {}).get('dropped_legacy_ids', [])))
    spec = {'subject_id': 'EDX_GCSE_HIST_1HI0', 'specification_version': 'pearson-1hi0-issue6-2024-06',
            'official_source_url': SPEC_URL, 'order_status': 'verified',
            'official_source': {'title': 'Pearson Edexcel Level 1/Level 2 GCSE (9-1) in History (1HI0) specification', 'issue': 'Issue 6',
                                'issue_date': 'June 2024', 'first_teaching': 2016, 'first_exams': 2018, 'url': SPEC_URL,
                                'sha256': SPEC_SHA, 'verified_at': '2026-11-21'},
            'approach': 'Official Pearson content order for the three options studied here: Paper 1 option 10, Paper 2 British depth study B1 and Paper 3 option 31. No textbook organisation has been supplied.',
            'scope': {'included_options': ['10 (Crime and punishment in Britain, c1000–present, with Whitechapel, c1870–c1900)',
                                           'B1 (Anglo-Saxon and Norman England, c1060–88)', '31 (Weimar and Nazi Germany, 1918–39)'],
                      'excluded_options': ['Paper 1 options 11, 12, 13', 'Paper 2 British depth studies B2, B3, B4', 'Paper 2 period studies P1 to P5 (the other booklet of every Paper 2 combination)',
                                           'Paper 3 options 30, 32, 33'],
                      'dropped_legacy_ids': dropped, 'not_edexcel_options': 'Vikings and a local-history site study (Verulamium) are not options in this specification; no content was invented for them.'},
            'components': COMPONENTS,
            'notes': 'Runtime leaves are the official content bullets, Pearson wording verbatim. Strand numbers are Pearson\'s; bullets are unnumbered. Linear GCSE: no Year 10/11 split is recorded. Ids of the earlier unverified tree for options outside the scope were removed: ' + ', '.join(dropped),
            'legacy_ids': legacy, 'point_order': order, 'sections': sections}
    target = REPO / 'data/specs/EDX_GCSE_HIST_1HI0.json'
    target.write_text(json.dumps(spec, ensure_ascii=False, indent=2) + '\n')
    sys.path.insert(0, str(REPO / 'tools'))
    from write_spec_migrations import write_migrations
    write_migrations(REPO)
    print('wrote', target, len(order), 'official bullets;', len(legacy), 'legacy ids; dropped', len(dropped))
    for s in sections:
        for t in s['topics']:
            print(' ', t['code'], t['title'][:70], len(t['points']))


if __name__ == '__main__':
    main()
