#!/usr/bin/env python3
"""Build data/specs/AQA_GCSE_RS_8062.json from AQA's GCSE Religious Studies A specification.

Usage: build_spec.py SPEC_PDF
  AQA-8062-SP-2025.pdf (Version 1.3, 1 September 2025). Other files are refused.

Component 1 (3.1.1 to 3.1.7): seven religions, each with Beliefs and teachings (3.1.n.1) and
Practices (3.1.n.2). Component 2 (3.2.1 Religious, philosophical and ethical studies, Themes A to F;
3.2.2 Textual studies, Themes G and H). A leaf is one of AQA's printed sub-headings (for example
"Key beliefs", "Jesus Christ and salvation", "Sex, marriage and divorce"), carrying AQA's bullet
content verbatim and the printed page. Printed codes are strings and are scoped by religion or theme
(the same sub-heading text recurs, e.g. "Festivals", across religions). Earlier stub ids (CHR_1.1,
CHR_1.2, ISL_2.1, ISL_2.2, THEMES_A..F) migrate to the leaves they covered (legacy_ids).
"""
import hashlib
import json
import re
import subprocess
import sys
from pathlib import Path

SHA = '883998765252db817bfcfee4c74d692886fa9ff456ca546b825a64c7b359b41c'
REPO = Path(__file__).resolve().parents[2]
REL = {'3.1.1': ('BUD', 'Buddhism'), '3.1.2': ('CHR', 'Christianity'), '3.1.3': ('CATH', 'Catholic Christianity'), '3.1.4': ('HIN', 'Hinduism'),
       '3.1.5': ('ISL', 'Islam'), '3.1.6': ('JUD', 'Judaism'), '3.1.7': ('SIK', 'Sikhism')}
THEME = re.compile(r'^(3\.2\.[12]\.\d)\s+Theme ([A-H]):\s*(.+)$')
STRAND = re.compile(r'^(3\.1\.\d)\.(\d)\s+([A-Z][A-Za-z ]+)$')
RELHEAD = re.compile(r'^(3\.1\.\d)\s+([A-Z][A-Za-z ]+)$')
NOISE = re.compile(r'^(Visit aqa|AQA GCSE Religious|\d{1,2} Visit aqa|\d{1,2}$)')
BULLET = re.compile(r'^\s*[•–-]\s|^\s{2,}\S')


def main():
    path = Path(sys.argv[1])
    if hashlib.sha256(path.read_bytes()).hexdigest() != SHA:
        sys.exit('refusing: not AQA GCSE Religious Studies A 8062 specification Version 1.3 (1 September 2025)')
    text = subprocess.run(['pdftotext', '-layout', str(path), '-'], capture_output=True, text=True, check=True).stdout
    lines = text.splitlines()
    # printed page number from the footer that follows each page's lines
    page_of, pending = {}, []
    for i, ln in enumerate(lines):
        pending.append(i)
        m = re.search(r'Visit aqa\.org\.uk/8062.*?(\d{1,2})\s*$', ln) or re.match(r'^\s*(\d{1,2}) Visit aqa\.org\.uk/8062', ln)
        if m:
            for j in pending:
                page_of[j] = int(m.group(1))
            pending = []
    start = next(i for i, l in enumerate(lines) if l.startswith('3.1 Component 1') and i > 100)
    end = next(i for i, l in enumerate(lines) if re.match(r'^4 Scheme of assessment', l) and i > start)
    sections = {'P1': {'id': 'AQA_GCSE_RS_SEC_P1', 'title': 'Component 1: The study of religions: beliefs, teachings and practices', 'topics': []},
                'P2': {'id': 'AQA_GCSE_RS_SEC_P2', 'title': 'Component 2: Thematic studies', 'topics': []}}
    cur, strand, prev_blank, leaf = None, None, True, None
    for i in range(start, end):
        raw = lines[i]
        raw = raw.replace('\f', '')
        s = raw.strip()
        if NOISE.match(s):
            continue
        m = THEME.match(s)
        if m:
            code, letter, title = m.groups()
            cur = {'id': f'AQA_GCSE_RS_THEME_{letter}', 'code': code, 'title': f'Theme {letter}: {title}', 'kind': 'topic', 'route': 'textual' if letter in 'GH' else 'non_textual', 'points': []}
            sections['P2']['topics'].append(cur); strand, leaf, prev_blank = None, None, True
            continue
        m = STRAND.match(s)
        if m and cur and cur.get('religion'):
            strand, leaf, prev_blank = (m.group(1) + '.' + m.group(2), m.group(3), int(m.group(2))), None, True
            continue
        m = RELHEAD.match(s)
        if m and m.group(1) in REL and not s.endswith('.'):
            key, name = REL[m.group(1)]
            cur = {'id': f'AQA_GCSE_RS_{key}', 'code': m.group(1), 'title': name, 'kind': 'topic', 'religion': key, 'points': []}
            sections['P1']['topics'].append(cur); strand, leaf, prev_blank = None, None, True
            continue
        if cur is None:
            continue
        is_bullet = bool(re.match(r'^[•]', s)) or raw.startswith('    ')
        if not s:
            prev_blank = True
            continue
        in_content = (cur.get('religion') and strand) or (cur['id'].startswith('AQA_GCSE_RS_THEME_'))
        if in_content and not is_bullet and prev_blank and len(s) < 80 and not s.endswith(('.', ',', ':')) and not re.match(r'^(Students|They must|Common|Some texts|These|AQA)', s) and (strand or cur['id'].startswith('AQA_GCSE_RS_THEME_')):
            nxt = next((lines[j].strip() for j in range(i + 1, min(i + 4, end)) if lines[j].strip()), '')
            if nxt.startswith('•'):
                n = len(cur['points']) + 1
                code = f'{strand[0]}' if strand else cur['code']
                leaf = {'id': f"{cur['id']}_{(strand[0].split('.')[-1] + '.' ) if strand else ''}k{n}".replace('._k', '_k'), 'code': f'{code}.{n}', 'title': s,
                        'official_reference': {'section': code, **({'strand': strand[1]} if strand else {}), 'source_pages': [page_of.get(i)]}, 'content': []}
                if strand:
                    leaf['strand'] = strand[1]
                    leaf['strand_number'] = strand[2]
                cur['points'].append(leaf)
                prev_blank = False
                continue
        if leaf is not None and is_bullet:
            leaf['content'].append(re.sub(r'\s+', ' ', s.lstrip('•').strip()))
        elif leaf is not None and s and not is_bullet and leaf['content']:
            leaf['content'][-1] += ' ' + re.sub(r'\s+', ' ', s)
        prev_blank = False
    order = [p['id'] for sec in sections.values() for t in sec['topics'] for p in t['points']]
    legacy = {}
    for sec in sections.values():
        for t in sec['topics']:
            if t['id'] in ('AQA_GCSE_RS_CHR', 'AQA_GCSE_RS_ISL'):
                k = t['id'].split('_')[-1]
                num = {'CHR': '1', 'ISL': '2'}[k]
                for n in (1, 2):
                    legacy[f'{t["id"]}_{num}.{n}'] = [p['id'] for p in t['points'] if p.get('strand_number') == n]
            if t['id'].startswith('AQA_GCSE_RS_THEME_') and t['id'][-1] in 'ABCDEF':
                legacy[f'AQA_GCSE_RS_THEMES_{t["id"][-1]}'] = [p['id'] for p in t['points']]
    d = {'subject_id': 'AQA_GCSE_RS_8062', 'specification_version': 'aqa-8062-v1.3-2025-09',
         'official_source_url': 'https://www.aqa.org.uk/subjects/religious-studies/gcse/religious-studies-a-8062/specification',
         'order_status': 'verified',
         'official_source': {'title': 'AQA GCSE Religious Studies A 8062 specification', 'version': 'Version 1.3', 'issue_date': '1 September 2025',
                             'url': 'https://cdn.sanity.io/files/p28bar15/green/ab272d86486eb6b391a2c33de9072a5031e0f584.pdf', 'file_name': 'AQA-8062-SP-2025.pdf',
                             'sha256': SHA, 'verified_at': '2026-11-22',
                             'note': 'Exam format revised from June 2026 (AQA-8061-8062-SOC v1.0, March 2025): 1-mark short response replaces the 2-mark question and the 5-mark question becomes 6 marks.'},
         'approach': 'Official AQA content order. Students study two religions (Component 1) and four themes (Component 2, Themes A to F, or the textual route Themes G and H with Christianity or Catholic Christianity). No textbook organisation has been supplied.',
         'notes': 'Leaves are AQA printed sub-headings (id <topic>_<strand>.k<n> for religions, <theme>_k<n> for themes) with AQA bullet content verbatim. The earlier stub covered only Christianity and Islam and "four themes".',
         'legacy_ids': legacy, 'point_order': order, 'sections': list(sections.values())}
    (REPO / 'data/specs/AQA_GCSE_RS_8062.json').write_text(json.dumps(d, ensure_ascii=False, indent=2) + '\n')
    for sec in sections.values():
        for t in sec['topics']:
            print(t['code'], t['title'], len(t['points']), [p['title'][:28] for p in t['points']])


if __name__ == '__main__':
    main()
