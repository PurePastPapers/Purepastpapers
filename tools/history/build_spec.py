#!/usr/bin/env python3
"""Build data/specs/EDX_ALEVEL_HIST_9HI0.json (Route H scope) from Pearson's 9HI0 specification.

Usage: build_spec.py SPEC_PDF   (9781446914366-gce-2015-a-hist.pdf, Issue 4, June 2026)

Scope, as the owner chose: Paper 1 option 1H, Paper 2 option 2H.2 (not 2H.1) and
Paper 3 option 33. Pearson numbers themes and key topics but not the content bullets
beneath them; each runtime leaf is one official bullet, coded by its printed position
(theme.bullet), with Pearson's wording verbatim and its source page. Existing runtime
ids are kept wherever they already were one bullet; ids that grouped several bullets
migrate to all of them.
"""
import hashlib
import json
import re
import sys
from pathlib import Path

SPEC_SHA = 'fdb12503123b24101ba7b47c25d1199c39c17493e0aaee98740b03af17a17735'
SPEC_URL = 'https://qualifications.pearson.com/content/dam/pdf/A%20Level/History/2015/Specification%20and%20sample%20assessments/9781446914366-gce-2015-a-hist.pdf'
REPO = Path(__file__).resolve().parents[2]
# (paper section, option code, pages, [(topic id, topic code, title, bullet count, leaf code prefix, legacy)])
LAYOUT = [
    ('EDX_HIST_SEC_P1', '1H', 'Paper 1, Option 1H: Britain transformed, 1918–97', (86, 87), [
        ('EDX_HIST_1H_T1', 'Theme 1', 'A changing political and economic environment, 1918–79', 3, '1', 'keep'),
        ('EDX_HIST_1H_T2', 'Theme 2', 'Creating a welfare state, 1918–79', 3, '2', 'keep'),
        ('EDX_HIST_1H_T3', 'Theme 3', 'Society in transition, 1918–79', 3, '3', 'keep'),
        ('EDX_HIST_1H_T4', 'Theme 4', 'The changing quality of life, 1918–79', 3, '4', 'keep'),
        ('EDX_HIST_1H_INT', 'Historical interpretations', 'What impact did Thatcher’s governments (1979–90) have on Britain, 1979–97?', 4, 'INT', ['EDX_HIST_1H_INT_5.1'])]),
    ('EDX_HIST_SEC_P2', '2H.2', 'Paper 2, Option 2H.2: The USA, 1955–92: conformity and challenge', (90, 91), [
        ('EDX_HIST_2H2_K1', 'Key topic 1', 'Affluence and conformity, 1955–63', 4, '1', 'keep'),
        ('EDX_HIST_2H2_K2', 'Key topic 2', 'Protest and reaction, 1963–72', 4, '2', 'keep'),
        ('EDX_HIST_2H2_K3', 'Key topic 3', 'Social and political change, 1973–80', 4, '3', 'keep'),
        ('EDX_HIST_2H2_K4', 'Key topic 4', 'Republican dominance and its opponents, 1981–92', 4, '4', 'keep')]),
    ('EDX_HIST_SEC_P3', '33', 'Paper 3, Option 33: The witch craze in Britain, Europe and North America, c1580–c1750', (100, 101), [
        ('EDX_HIST_33_B1', 'Breadth theme 1', 'Changing attitudes to witchcraft in Britain', 2, 'B.1', ['EDX_HIST_33_B_B.1']),
        ('EDX_HIST_33_B2', 'Breadth theme 2', 'The wider intellectual context: the coming of the age of science and reason', 2, 'B.2', ['EDX_HIST_33_B_B.2']),
        ('EDX_HIST_33_D1', 'Depth topic 1', 'The North Berwick witches in Scotland, 1590–91, and the aftermath to 1597', 3, 'D.1', ['EDX_HIST_33_D_D.1']),
        ('EDX_HIST_33_D2', 'Depth topic 2', 'The Lancashire witches of 1604–13', 3, 'D.2', ['EDX_HIST_33_D_D.2']),
        ('EDX_HIST_33_D3', 'Depth topic 3', 'The Great Witch Hunt in Bamberg, Germany, 1623–32', 3, 'D.3', ['EDX_HIST_33_D_D.3']),
        ('EDX_HIST_33_D4', 'Depth topic 4', 'Matthew Hopkins and the East Anglian witch craze, 1645–47', 3, 'D.4', ['EDX_HIST_33_D_D.4']),
        ('EDX_HIST_33_D5', 'Depth topic 5', 'Cotton Mather and the Salem witch hunt, 1692–93', 3, 'D.5', ['EDX_HIST_33_D_D.5'])]),
]
COMPONENTS = {'9HI0/1H': {'title': 'Paper 1: Breadth study with interpretations', 'marks': 60, 'minutes': 135},
              '9HI0/2H': {'title': 'Paper 2: Depth study (option 2H.2 only)', 'marks': 40, 'minutes': 90},
              '9HI0/33': {'title': 'Paper 3: Themes in breadth with aspects in depth', 'marks': 60, 'minutes': 135}}


def bullets(pdf, pages):
    """Official content bullets in printed order, with the page each starts on."""
    out = []
    for number in pages:
        page = pdf.pages[number - 1]
        words = page.extract_words()
        marks = [w for w in words if w['text'] == '●']
        column = min(w['x0'] for w in marks) - 1
        first = min(w['top'] for w in marks) - 2
        body = page.crop((column, first, page.width, page.height - 60)).extract_text()
        for chunk in body.split('●')[1:]:
            text = re.sub(r'\s+', ' ', chunk).strip()
            text = re.sub(r'\s*Historical Content interpretations\s*$|\s*Content\s*$', '', text)
            out.append((text, number))
    return out


def main():
    import pdfplumber
    pdf_path = Path(sys.argv[1])
    if hashlib.sha256(pdf_path.read_bytes()).hexdigest() != SPEC_SHA:
        raise SystemExit('Not the verified 9HI0 specification (Issue 4, June 2026)')
    old = json.loads((REPO / 'data/specs/EDX_ALEVEL_HIST_9HI0.json').read_text())
    old_ids = {p['id'] for s in old['sections'] for t in s['topics'] for p in t['points']}
    sections, order, legacy = [], [], {}
    with pdfplumber.open(pdf_path) as pdf:
        for sid, option, stitle, pages, topics in LAYOUT:
            found = bullets(pdf, pages)
            if len(found) != sum(t[3] for t in topics):
                raise SystemExit(f'{option}: expected {sum(t[3] for t in topics)} bullets, found {len(found)}')
            out_topics = []
            for tid, tcode, ttitle, count, prefix, migrate in topics:
                points = []
                for n in range(1, count + 1):
                    text, page = found.pop(0)
                    code = f'{prefix}.{n}'
                    pid = f'{tid}_{code}'
                    title = re.split(r'\s*\(key developments|:|;', text)[0].strip().rstrip('.')
                    if len(title) > 90:
                        title = re.split(r', including|, the ', title)[0]
                    points.append({'id': pid, 'code': code, 'title': title, 'content': text,
                                   'official_reference': {'option': option, 'topic': tcode, 'bullet': n, 'source_pages': [page],
                                                          'numbering': 'Pearson prints bullets unnumbered; code is the printed position'}})
                    order.append(pid)
                if migrate != 'keep':
                    for legacy_id in migrate:
                        legacy[legacy_id] = [p['id'] for p in points]
                for group in {'B': 'EDX_HIST_33_B', 'D': 'EDX_HIST_33_D'}.items():
                    if prefix.startswith(group[0] + '.'):
                        legacy.setdefault(group[1], []).extend(p['id'] for p in points)
                out_topics.append({'id': tid, 'code': tcode, 'title': ttitle, 'points': points})
            sections.append({'id': sid, 'code': option, 'title': stitle, 'topics': out_topics})
    new_ids = set(order)
    missing = old_ids - new_ids - set(legacy)
    if missing:
        raise SystemExit(f'Earlier ids would be lost: {sorted(missing)}')
    spec = {'subject_id': 'EDX_ALEVEL_HIST_9HI0', 'specification_version': 'pearson-9hi0-issue4-2026-06',
            'official_source_url': SPEC_URL, 'order_status': 'verified',
            'official_source': {'title': 'Pearson Edexcel Level 3 Advanced GCE in History (9HI0) specification', 'issue': 'Issue 4',
                                'issue_date': 'June 2026', 'first_teaching': 2015, 'first_exams': 2017, 'url': SPEC_URL,
                                'sha256': SPEC_SHA, 'verified_at': '2026-11-16', 'as_qualification': None},
            'approach': 'Official Pearson content order for Route H as studied here: 1H, 2H.2 and option 33. No textbook organisation has been supplied.',
            'scope': {'route': 'H', 'included_options': ['1H', '2H.2', '33'], 'excluded_options': ['2H.1 (owner excluded)'],
                      'coursework': 'Non-examined assessment (Coursework) has no exam questions and is out of scope.'},
            'components': COMPONENTS,
            'notes': 'Runtime leaves are the official content bullets, with Pearson wording verbatim. Linear A level: Pearson gives no Year 12/13 split, so none is recorded.',
            'legacy_ids': legacy, 'point_order': order, 'sections': sections}
    target = REPO / 'data/specs/EDX_ALEVEL_HIST_9HI0.json'
    target.write_text(json.dumps(spec, ensure_ascii=False, indent=2) + '\n')
    sys.path.insert(0, str(REPO / 'tools'))
    from write_spec_migrations import write_migrations
    write_migrations(REPO)
    print('wrote', target, len(order), 'official bullets;', len(legacy), 'legacy ids')


if __name__ == '__main__':
    main()
