#!/usr/bin/env python3
"""Model review sheets for AQA GCSE English Language 8700 units: draft, then compile.

Usage:
  reviews.py draft DIR     write DIR/review-src/<PAPER>.txt drafts from the candidates
  reviews.py compile DIR   check the sheets and write DIR/reviews/<PAPER>.json

One line per publishable unit (lines starting with # are comments):

    label | codes [; prerequisite codes] | e/m/h | summary | difficulty basis

Codes are the spec skill leaves of data/specs/AQA_GCSE_ENGLANG_8700.json (P1 A.1 to A.4, B.1;
P2 A.1 to A.4, B.1). English Language has no topic content: AQA assesses each question type
against fixed assessment objectives, so the primary skill is the question's printed type
(Paper 1: Q1 retrieval, Q2 language, Q3 structure, Q4 evaluation, Q5 writing; Paper 2: Q1 true
statements, Q2 summary, Q3 language, Q4 comparison, Q5 viewpoint writing). The reviewer (a
model, reviewer_type "model", NOT a teacher) reads the printed task and edits the summary;
difficulty follows the tariff and the skill demand:
easy = the 4 mark retrieval/true-false questions; medium = the 8 and 12 mark single-skill
analysis and summary questions; hard = the 16 and 20 mark evaluation and comparison questions
and the 40 mark extended writing. Extra hard is not used.
"""
import json
import re
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
SPEC = REPO / 'data/specs/AQA_GCSE_ENGLANG_8700.json'
DIFF = {'e': 'easy', 'm': 'medium', 'h': 'hard'}
# paper -> question -> (primary code, prerequisite codes, difficulty, basis)
RULE = {
    '1': {'1': ('A.1', [], 'e', '4 marks, retrieve four explicit facts from a short extract (AO1)'),
          '2': ('A.2', [], 'm', '8 marks, analyse the writer\'s language in a printed extract (AO2)'),
          '3': ('A.3', [], 'm', '8 marks, analyse structure across the whole source (AO2)'),
          '4': ('A.4', ['A.2', 'A.3'], 'h', '20 mark critical evaluation of a statement, using language and structure as evidence (AO4)'),
          '5': ('B.1', [], 'h', '40 marks, extended descriptive or narrative writing (24 content and organisation, 16 technical accuracy; AO5, AO6)')},
    '2': {'1': ('A.1', [], 'e', '4 marks, choose true statements from both sources (AO1)'),
          '2': ('A.2', ['A.1'], 'm', '8 marks, write a summary of differences or similarities drawing on both sources (AO1)'),
          '3': ('A.3', [], 'm', '12 marks, analyse how a writer uses language (AO2)'),
          '4': ('A.4', ['A.3'], 'h', '16 marks, compare the writers\' viewpoints and the methods used across both sources (AO3)'),
          '5': ('B.1', [], 'h', '40 marks, extended writing presenting a viewpoint (24 content and organisation, 16 technical accuracy; AO5, AO6)')},
}
SAMPLE_Q1 = ('A.1', [], 'e', '1 mark multiple choice question on one explicit detail of the source (AO1)')


def leaves():
    spec = json.loads(SPEC.read_text())
    out = {}
    for s in spec['sections']:
        for t in s['topics']:
            for p in t['points']:
                out[(s['id'][-2:], p['code'])] = p['id']
    return out


def one(t):
    return ' '.join(t.split())


def summary(u):
    t = one(u['text'])
    t = re.sub(r'^0 \d(?: \. \d)?\s*', '', t)
    t = re.sub(r'\[\s*\d+\s*marks?\s*\]', '', t).strip()
    t = re.sub(r'\s*\(24 marks.*$', '', t)
    t = re.sub(r'^You need to refer to (?:Source A and Source B|both sources|Source [AB]) for this question\.\s*', '', t)
    t = re.sub(r'^For this question focus (?:this part of your answer )?on [^.]*\.\s*', '', t)
    quote = re.search(r'(?:A student said|One student said|A reader said|A student wrote)[^“"]*[“"](.+?)[”"]', t)
    if quote:
        return one('Evaluate the statement: “' + quote.group(1) + '”')[:170]
    for pat in (r'(List \w+ things? about .+?\.)', r'(How does the writer use language[^?]*\?)', r'(How has the writer structured[^?]*\?)',
                r'(To what extent do you agree\?)', r'(Write a summary of the [^.]*\.)', r'(Choose four statements[^.]*\.)',
                r'(You need to refer to (?:Source|the whole)[^.]*\.[^.]*\.)', r'(Compare how[^.]*\.)', r'(Write (?:a|an|the) [^:]{10,160})'):
        m = re.search(pat, t)
        if m:
            return one(m.group(1))[:170]
    return t[:170]


def publishable(cand):
    return [u for u in cand['units'] if not u.get('question_page_removed')]


PREFIX = {('1', '1'): 'Retrieval: ', ('1', '2'): 'Language: ', ('1', '3'): 'Structure: ', ('1', '4'): 'Evaluation: ', ('1', '5'): 'Writing: ',
          ('2', '1'): 'True statements: ', ('2', '2'): 'Summary: ', ('2', '3'): 'Language: ', ('2', '4'): 'Comparison: ', ('2', '5'): 'Viewpoint writing: '}


def draft(research):
    (research / 'review-src').mkdir(parents=True, exist_ok=True)
    for f in sorted((research / 'candidates').glob('*.json')):
        cand = json.loads(f.read_text())
        paper = f.stem
        comp = paper.rsplit('_', 1)[1].lstrip('0')
        lines = [f'# {paper}: label | codes ; prerequisites | e/m/h | summary | basis']
        for u in publishable(cand):
            code, pre, d, basis = SAMPLE_Q1 if '.' in u['label'] else RULE[comp][u['question']]
            lines.append(f"{u['label']} | {code}{' ; ' + ' '.join(pre) if pre else ''} | {d} | {PREFIX.get((comp, u['question']), '') if '.' not in u['label'] else 'Retrieval (multiple choice): '}{summary(u)} | {basis}")
        (research / 'review-src' / f'{paper}.txt').write_text('\n'.join(lines) + '\n')
    print('drafted')


def compile_(research):
    ids = leaves()
    (research / 'reviews').mkdir(parents=True, exist_ok=True)
    for f in sorted((research / 'candidates').glob('*.json')):
        cand = json.loads(f.read_text())
        paper = f.stem
        comp = paper.rsplit('_', 1)[1].lstrip('0')
        pcode = 'P' + comp
        sheet = research / 'review-src' / f'{paper}.txt'
        units = []
        for ln in sheet.read_text().splitlines():
            if not ln.strip() or ln.startswith('#'):
                continue
            label, codes, d, summ, basis = [x.strip() for x in ln.split(' | ')]
            main, _, pre = codes.partition(';')
            if (pcode, main.strip()) not in ids or any((pcode, c) not in ids for c in pre.split()):
                raise SystemExit(f'{paper} {label}: unknown code')
            units.append({'label': label, 'sections': [main.strip()], 'prerequisites': pre.split(), 'difficulty': DIFF[d],
                          'summary': summ, 'difficulty_basis': basis, 'official_codes': [ids[(pcode, main.strip())]]})
        want = {u['label'] for u in publishable(cand)}
        if {u['label'] for u in units} != want:
            raise SystemExit(f'{paper}: review sheet must cover every unit: {sorted(want ^ {u["label"] for u in units})}')
        (research / 'reviews' / f'{paper}.json').write_text(json.dumps({
            'paper_id': paper, 'reviewer_type': 'model', 'source_sha256': cand['source_sha256'], 'units': units}, indent=1) + '\n')
    print('compiled')


if __name__ == '__main__':
    if len(sys.argv) != 3 or sys.argv[1] not in ('draft', 'compile'):
        sys.exit(__doc__)
    (draft if sys.argv[1] == 'draft' else compile_)(Path(sys.argv[2]))
