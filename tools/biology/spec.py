#!/usr/bin/env python3
"""Transcribe the official Pearson Biology A (Salters-Nuffield) specification.

Reads the public A level specification (Issue 4, November 2018) and the AS
specification, and writes data/specs/EDX_ALEVEL_BIOL_9BN0.json with:
  * one leaf per printed statement (codes kept as strings: 2.10 is not 2.1),
  * the 18 core practicals as their own section (CP1..CP18),
  * Appendix 6 mathematical skills (A.0.1 ...) as their own section, so a maths
    prerequisite is tagged separately from the biology statement assessed,
  * the 62 historical seed points in a `legacy` section that resolves for old
    saved records but is never shown or offered for tagging.

Usage:
  python3 tools/biology/spec.py --a-level SPEC_A.pdf --as-level SPEC_AS.pdf --repo .
"""
import argparse
import hashlib
import json
import pathlib
import re
import subprocess

A_URL = 'https://qualifications.pearson.com/content/dam/pdf/A%20Level/biology-a/2015/specification-and-sample-assessment-materials/9781446930885-gce2015-a-bioa-spec.pdf'
AS_URL = 'https://qualifications.pearson.com/content/dam/pdf/A%20Level/biology-a/2015/specification-and-sample-assessment-materials/9781446930908_GCE2015_AS_BioA_spec.pdf'
SUBJECT = 'EDX_ALEVEL_BIOL_9BN0'
PREFIX = 'EDX_BIOL_OFF'
TOPICS = {
    1: 'Lifestyle, Health and Risk', 2: 'Genes and Health', 3: 'Voice of the Genome',
    4: 'Biodiversity and Natural Resources', 5: 'On the Wild Side',
    6: 'Immunity, Infection and Forensics', 7: 'Run for your Life', 8: 'Grey Matter',
}
COMPONENTS = {  # From the specification's assessment overview.
    1: ['9BN0/01', '9BN0/02', '9BN0/03', '8BN0/01'], 2: ['9BN0/01', '9BN0/02', '9BN0/03', '8BN0/01'],
    3: ['9BN0/01', '9BN0/02', '9BN0/03', '8BN0/02'], 4: ['9BN0/01', '9BN0/02', '9BN0/03', '8BN0/02'],
    5: ['9BN0/01', '9BN0/03'], 6: ['9BN0/01', '9BN0/03'], 7: ['9BN0/02', '9BN0/03'], 8: ['9BN0/02', '9BN0/03'],
}
NOISE = re.compile(r'^(Pearson Edexcel Level 3|Specification – Issue|Students should:|\d+\s+Pearson Edexcel|\s*\d+\s*$)')
STATEMENT = re.compile(r'^(\d)\.(\d{1,2})\s+(.*)$')
CORE = re.compile(r'^CORE PRACTICAL (\d+):\s*(.*)$')


def layout_text(pdf):
    return subprocess.run(['pdftotext', '-layout', str(pdf), '-'], capture_output=True, text=True, check=True).stdout


def page_of(text, needle_index):
    return text.count('\f', 0, needle_index) + 1


def topic_blocks(text):
    """Return {topic: (start, end)} for the main content (first occurrence after the overview)."""
    starts = {}
    for n in TOPICS:
        for m in re.finditer(rf'^\f?Topic {n}: ', text, re.M):
            # The content heading is followed by an intro paragraph then "Students should:".
            if 'Students should:' in text[m.start():m.start() + 4000] and n not in starts:
                starts[n] = m.start()
    end = text.find('Science Practical Endorsement', starts[8])
    if end < 0:
        end = text.find('Appendix', starts[8])
    order = sorted(starts.items())
    return {n: (s, order[i + 1][1] if i + 1 < len(order) else end) for i, (n, s) in enumerate(order)}


def parse_topics(text):
    statements, practicals = [], []
    for n, (start, end) in topic_blocks(text).items():
        block = text[start:end]
        body = block[block.find('Students should:'):]
        current = None
        offset = start + block.find('Students should:')
        for line in body.splitlines(keepends=True):
            raw = line.rstrip('\n')
            stripped = raw.strip()
            pos = offset
            offset += len(line)
            if not stripped or NOISE.match(stripped):
                continue
            m = STATEMENT.match(stripped)
            c = CORE.match(stripped)
            if m and int(m.group(1)) == n:
                current = {'kind': 'statement', 'topic': n, 'code': f'{m.group(1)}.{m.group(2)}',
                           'text': m.group(3), 'page': page_of(text, pos)}
                statements.append(current)
            elif c:
                current = {'kind': 'practical', 'topic': n, 'code': f'CP{c.group(1)}', 'text': c.group(2),
                           'page': page_of(text, pos), 'after': statements[-1]['code'] if statements else None}
                practicals.append(current)
            elif current:
                current['text'] += ' ' + stripped
    for s in statements + practicals:
        s['text'] = re.sub(r'\s+', ' ', s['text']).strip()
    return statements, practicals


def parse_maths_skills(text):
    start = [m.start() for m in re.finditer(r'^\f?Appendix 6: Mathematical skills and\s*$', text, re.M)][-1]
    end = text.find('Appendix 7', start)
    skills, current, group = [], None, None
    for line in text[start:end].splitlines():
        if NOISE.match(line.strip()):
            continue
        g = re.match(r'^\(([ivx]+)\)\s+(A\.\d)\s*[-–]\s*(.*?)(\s*\(continued\))?$', line.strip())
        if g:
            group = {'code': g.group(2), 'title': g.group(3).strip()}
            current = None
            continue
        if line.strip().startswith(('Mathematical skills', 'the context of', '(assessment is', 'examples given')):
            continue
        indent = len(line) - len(line.lstrip(' '))
        if indent > 20:
            continue  # right-hand exemplification column only
        left = re.split(r'\s{3,}', line.strip())
        m = re.match(r'^(A\.\d\.\d+)$', left[0])
        if m and len(left) > 1:
            current = {'code': m.group(1), 'text': left[1], 'group': group}
            skills.append(current)
        elif current and left[0] and not left[0].startswith(('Candidates', '●')):
            current['text'] += ' ' + left[0]
    for s in skills:
        s['text'] = re.sub(r'\s+', ' ', s['text']).strip()
    return skills


def compare_as(a_statements, as_text):
    as_statements, _ = parse_topics_limited(as_text)
    a_map = {s['code']: s['text'] for s in a_statements if s['topic'] <= 4}
    as_map = {s['code']: s['text'] for s in as_statements}
    norm = lambda t: re.sub(r'[^a-z0-9]', '', t.lower())
    diffs = sorted(code for code in set(a_map) | set(as_map) if norm(a_map.get(code, '')) != norm(as_map.get(code, '')))
    return {'a_level_topic_1_4_statements': len(a_map), 'as_statements': len(as_map),
            'codes_with_different_wording': diffs,
            'as_only_codes': sorted(set(as_map) - set(a_map)), 'a_level_only_codes': sorted(set(a_map) - set(as_map))}


def parse_topics_limited(text):
    global TOPICS
    saved = TOPICS
    TOPICS = {k: v for k, v in saved.items() if k <= 4}
    try:
        starts = {}
        for n in TOPICS:
            for m in re.finditer(rf'^\f?Topic {n}: ', text, re.M):
                if 'Students should:' in text[m.start():m.start() + 4000] and n not in starts:
                    starts[n] = m.start()
        statements, practicals = [], []
        order = sorted(starts.items())
        last = order[-1][1]
        body = text.find('Students should:', last)
        heading = re.compile(r'^\f?\S.*(Appendix|Assessment|Practical|Endorsement)', re.M).search(text, body)
        end4 = heading.start() if heading else len(text)
        # Guard: stop at the first line-start heading that is not a numbered statement.
        nxt = re.compile(r'^\f?(Appendix \d|Assessment\s*$|Assessment information|Science Practical)', re.M).search(text, body)
        end4 = nxt.start() if nxt else end4
        blocks = {n: (s, order[i + 1][1] if i + 1 < len(order) else end4) for i, (n, s) in enumerate(order)}
        for n, (start, end) in blocks.items():
            current = None
            for line in text[start:end][text[start:end].find('Students should:'):].splitlines():
                stripped = line.strip()
                if not stripped or NOISE.match(stripped):
                    continue
                m, c = STATEMENT.match(stripped), CORE.match(stripped)
                if m and int(m.group(1)) == n:
                    current = {'topic': n, 'code': f'{m.group(1)}.{m.group(2)}', 'text': m.group(3)}
                    statements.append(current)
                elif c:
                    current = {'code': f'CP{c.group(1)}', 'text': c.group(2)}
                    practicals.append(current)
                elif current:
                    current['text'] += ' ' + stripped
        return statements, practicals
    finally:
        TOPICS = saved


def title_of(text, limit=140):
    text = re.sub(r'\s+', ' ', text).strip()
    return text if len(text) <= limit else text[:limit].rsplit(' ', 1)[0] + '…'


def write_year_mapping(repo, spec, sections):
    """Year 12 = Topics 1–4 (+ their core practicals); Year 13 = Topics 5–8 (+ theirs).
    Mathematical skills span both years, so each year covers them only partially."""
    years = {12: [], 13: []}
    for section in sections:
        if section.get('legacy'):
            continue
        for topic in section['topics']:
            for point in topic['points']:
                year = point.get('introduced_year')
                if year in years:
                    years[year].append({'point_id': point['id'], 'extent': 'full'})
                elif topic.get('kind') == 'maths':
                    note = ('Mathematical skills are developed across both years; Appendix 6 marks some '
                            'exemplifications as full A level only.')
                    for y in years:
                        years[y].append({'point_id': point['id'], 'extent': 'partial', 'note': note})
    mapping = {
        'subject_id': SUBJECT, 'id': 'pearson-9bn0-8bn0-topic-years', 'type': 'year', 'status': 'verified',
        'source_url': AS_URL, 'reviewed_at': spec['verified_at'], 'review_status': 'model_reviewed',
        'specification_version': spec['specification_version'], 'source_sha256': spec['as_source_document_sha256'],
        'evidence_note': spec['year_basis'] + ' Core practicals follow the topic they are printed in.',
        'years': [
            {'id': 'pearson-9bn0-year-12', 'title': 'Year 12 (Topics 1–4, AS content)', 'year': 12, 'coverage': years[12]},
            {'id': 'pearson-9bn0-year-13', 'title': 'Year 13 (Topics 5–8)', 'year': 13, 'coverage': years[13]},
        ],
    }
    path = repo / 'data/curriculum/index.json'
    index = json.load(open(path))
    index['mappings'] = [m for m in index['mappings'] if m.get('subject_id') != SUBJECT] + [mapping]
    path.write_text(json.dumps(index, ensure_ascii=False, indent=2) + '\n')


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--a-level', required=True)
    ap.add_argument('--as-level', required=True)
    ap.add_argument('--repo', default='.')
    a = ap.parse_args()
    repo = pathlib.Path(a.repo)
    a_pdf, as_pdf = pathlib.Path(a.a_level), pathlib.Path(a.as_level)
    text = layout_text(a_pdf)
    statements, practicals = parse_topics(text)
    skills = parse_maths_skills(text)
    as_report = compare_as(statements, layout_text(as_pdf))
    counts = {n: sum(1 for s in statements if s['topic'] == n) for n in TOPICS}
    if any(v == 0 for v in counts.values()) or len(practicals) != 18 or not skills:
        raise SystemExit(f'Unexpected parse: {counts}, practicals={len(practicals)}, skills={len(skills)}')
    seen = set()
    for s in statements:
        if (s['topic'], s['code']) in seen:
            raise SystemExit(f'Duplicate statement {s["code"]}')
        seen.add((s['topic'], s['code']))

    existing = json.load(open(repo / f'data/specs/{SUBJECT}.json'))
    legacy_topics = [t for sec in existing['sections'] if not sec.get('legacy') for t in sec['topics']] \
        or [t for sec in existing['sections'] for t in sec['topics']]
    if existing.get('specification_version'):
        legacy_topics = [t for sec in existing['sections'] if sec.get('legacy') for t in sec['topics']]

    def statement_point(s):
        sid = f'{PREFIX}_T{s["topic"]}_{s["code"]}'
        return {
            'id': sid, 'code': s['code'], 'title': title_of(s['text']), 'full_text': s['text'],
            'introduced_year': 12 if s['topic'] <= 4 else 13,
            'official_reference': {
                'reference_id': f'9BN0-ISSUE4-{s["code"]}', 'code': s['code'], 'topic': s['topic'],
                'source_pages': [s['page']], 'component_codes': COMPONENTS[s['topic']],
                'also_in_as_specification': s['topic'] <= 4,
            },
        }

    sections = []
    for year, topics in ((12, range(1, 5)), (13, range(5, 9))):
        sec_topics = []
        for n in topics:
            sec_topics.append({
                'id': f'{PREFIX}_T{n}', 'code': str(n), 'title': f'Topic {n}: {TOPICS[n]}', 'kind': 'topic',
                'introduced_year': year,
                'points': [statement_point(s) for s in statements if s['topic'] == n],
            })
        sections.append({
            'id': f'{PREFIX}_SEC_Y{year}',
            'title': 'Topics 1–4 (AS and Year 12 content)' if year == 12 else 'Topics 5–8 (Year 13 content)',
            'note': ('Assessed on AS 8BN0 Papers 1–2 and on every A level 9BN0 paper'
                     if year == 12 else 'Topics 5–6 on 9BN0 Paper 1, Topics 7–8 on Paper 2; all topics on Paper 3'),
            'topics': sec_topics,
        })
    sections.append({
        'id': f'{PREFIX}_SEC_CP', 'title': 'Core practicals',
        'note': 'Required core practicals as printed in the topic content; practical skills are assessed in written papers.',
        'topics': [{
            'id': f'{PREFIX}_CP', 'code': 'CP', 'title': 'Core practicals 1–18', 'kind': 'practical',
            'points': [{
                'id': f'{PREFIX}_{p["code"]}', 'code': p['code'], 'title': title_of(p['text']),
                'full_text': p['text'], 'introduced_year': 12 if p['topic'] <= 4 else 13,
                'official_reference': {'reference_id': f'9BN0-ISSUE4-{p["code"]}', 'code': p['code'],
                                       'topic': p['topic'], 'printed_after_statement': p['after'],
                                       'source_pages': [p['page']]},
            } for p in practicals],
        }],
    })
    groups = []
    for skill in skills:
        g = skill['group']['code']
        if not groups or groups[-1]['code'] != g:
            groups.append({'id': f'{PREFIX}_MS_{g}', 'code': g, 'title': skill['group']['title'].capitalize(),
                           'kind': 'maths', 'points': []})
        groups[-1]['points'].append({
            'id': f'{PREFIX}_MS_{skill["code"]}', 'code': skill['code'], 'title': title_of(skill['text']),
            'full_text': skill['text'],
            'official_reference': {'reference_id': f'9BN0-ISSUE4-APP6-{skill["code"]}', 'code': skill['code'],
                                   'appendix': 'Appendix 6: Mathematical skills and exemplifications'},
        })
    sections.append({'id': f'{PREFIX}_SEC_MS', 'title': 'Mathematical skills (Appendix 6)',
                     'note': 'Tag as a prerequisite unless the mathematical skill itself is what the marks assess.',
                     'topics': groups})
    sections.append({
        'id': 'EDX_BIOL_SEC_LEGACY', 'title': 'Historical summary points (not official)', 'legacy': True,
        'note': ('Summary headings from the original seed build. Kept only so saved learning records still '
                 'resolve; never shown, never used for tagging and never converted to official coverage.'),
        'topics': legacy_topics,
    })
    point_order = [p['id'] for sec in sections if not sec.get('legacy') for t in sec['topics'] for p in t['points']]
    spec = {
        'subject_id': SUBJECT,
        'specification_version': 'pearson-9bn0-issue4-2018-11',
        'official_source_url': A_URL,
        'source_document_sha256': hashlib.sha256(a_pdf.read_bytes()).hexdigest(),
        'as_source_url': AS_URL,
        'as_source_document_sha256': hashlib.sha256(as_pdf.read_bytes()).hexdigest(),
        'as_comparison': as_report,
        'verified_at': __import__('datetime').date.today().isoformat(),
        'review_status': 'model_transcribed_from_official_pdf',
        'order_status': 'verified',
        'point_order': point_order,
        'order_note': ('Official printed order: Topics 1–8 statements, then core practicals and Appendix 6 '
                       'mathematical skills. Legacy seed points are excluded from the order and from the tree.'),
        'year_basis': ('AS specification, "Progression from Advanced Subsidiary GCE to Advanced GCE": students '
                       '"would have covered Topics 1-4 which are common to both qualifications but the additional '
                       'topics 5-8 will need to be covered". Topics 1–4 are therefore Year 12 content and 5–8 Year 13.'),
        'sections': sections,
    }
    out = repo / f'data/specs/{SUBJECT}.json'
    out.write_text(json.dumps(spec, ensure_ascii=False, indent=1) + '\n')
    write_year_mapping(repo, spec, sections)
    print('statements', counts, 'total', len(statements), 'practicals', len(practicals), 'skills', len(skills))
    print('AS comparison', json.dumps(as_report))


if __name__ == '__main__':
    main()
