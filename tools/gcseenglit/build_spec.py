#!/usr/bin/env python3
"""Build data/specs/EDUQAS_GCSE_ENGLIT_C720QS.json from the official Eduqas specification.

Usage: build_spec.py SPEC_PDF ANTHOLOGY_PDF
  eduqas-gcse-english-lit-spec-from-2015-e.pdf (Version 4, August 2024) and the Poetry
  Anthology for first assessment from 2027. Other revisions are refused.

Eduqas's content is a prescribed-text list. The leaves are the owner's route through it
(16 November 2026: Macbeth, An Inspector Calls, A Christmas Carol and the poetry
anthology), plus unseen poetry, which every candidate sits:
- Component 1 Section A: Macbeth (extract question and whole-play essay).
- Component 1 Section B: each poem of the anthology for assessment from 2027 (Version 4
  appendix order). The previous 18-poem anthology was examined for the last time in
  2026; no poem appears in both, so its questions are not current content.
- Component 2 Section A: An Inspector Calls. Section B: A Christmas Carol.
- Component 2 Section C: unseen poetry, single poem (C.1) and comparison (C.2).
Eduqas prints no codes; codes are positional (P.3 = the third anthology poem). Ids of
the earlier generated leaves are kept where the meaning is the same; the anthology skill
leaves migrate to the 15 poems.
"""
import hashlib
import json
import re
import subprocess
import sys
from pathlib import Path

SPEC_SHA = '4ffb7a979f4d16ac4bb8e5ad35c6be74742636ef19cf7ffa220f13db07cf543f'
ANTH_SHA = 'd1fd0b9a783f34f1d8d79706a03ad74e124f8daaba96d56c42fd00fa046171da'
SPEC_URL = 'https://www.eduqas.co.uk/media/x2zpzwgt/eduqas-gcse-english-lit-spec-from-2015-e.pdf'
ANTH_URL = 'https://www.eduqas.co.uk/media/zd1b4ii5/new-poetry-anthology-for-first-examination.pdf'
PAGE = 'https://www.eduqas.co.uk/qualifications/english-literature-gcse/'
REPO = Path(__file__).resolve().parents[2]
SUBJECT = 'EDUQAS_GCSE_ENGLIT_C720QS'
P = 'EDUQAS_GCSE_ENGLIT'
ANTHOLOGY = [('The Schoolboy', 'William Blake', 4), ('I Wandered Lonely as a Cloud', 'William Wordsworth', 5),
             ('Sonnet 29', 'Elizabeth Barrett Browning', 8), ('Cousin Kate', 'Christina Rossetti', 6),
             ('Drummer Hodge', 'Thomas Hardy', 9), ('I Shall Return', 'Claude McKay', 12), ('Disabled', 'Wilfred Owen', 10),
             ('Decomposition', 'Zulfikar Ghose', 13), ('Catrin', 'Gillian Clarke', 14), ('Blackberry Picking', 'Seamus Heaney', 15),
             ('War Photographer', 'Carol Ann Duffy', 18), ('Dusting the Phone', 'Jackie Kay', 19), ('Kamikaze', 'Beatrice Garland', 16),
             ('Remains', 'Simon Armitage', 20), ('Origin Story', 'Eve L Ewing', 21)]
OLD_ANTHOLOGY = ['The Manhunt', 'Sonnet 43', 'London', 'The Soldier', 'She Walks in Beauty', 'Living Space', 'As Imperceptibly as Grief',
                 'Cozy Apologia', 'Valentine', 'A Wife in London', 'Death of a Naturalist', 'Hawk Roosting', 'To Autumn', 'Afternoons',
                 'Dulce et Decorum Est', 'Ozymandias', 'Mametz Wood', 'Excerpt from The Prelude']
NOT_IN_SCOPE = {
    'Component 1 Section A': 'Romeo and Juliet, Othello, Much Ado About Nothing, Twelfth Night, The Merchant of Venice (Henry V in earlier papers)',
    'Component 2 Section A': 'Lord of the Flies, Anita and Me, Boys Don’t Cry, The Woman in Black, Oranges are not the Only Fruit, '
                             'The Curious Incident of the Dog in the Night-Time, Leave Taking, The History Boys, Blood Brothers '
                             '(Never Let Me Go and A Taste of Honey in earlier papers)',
    'Component 2 Section B': 'Silas Marner, War of the Worlds, Pride and Prejudice, Jane Eyre, The Strange Case of Dr Jekyll and Mr Hyde',
    'Poetry anthology examined until 2026': ', '.join(OLD_ANTHOLOGY),
}


def pages_text(pdf):
    return subprocess.run(['pdftotext', '-layout', str(pdf), '-'], check=True, capture_output=True, text=True).stdout.split('\f')


def flat(text):
    return re.sub(r'[^a-z0-9]+', '', text.lower().replace('’', "'"))


def page_of(pages, *needles, after=0):
    for i, page in enumerate(pages[after:], start=after + 1):
        f = flat(page)
        if all(flat(n) in f for n in needles):
            return i
    raise SystemExit(f'Not found in specification: {needles}')


def main():
    spec_pdf, anth_pdf = Path(sys.argv[1]), Path(sys.argv[2])
    if hashlib.sha256(spec_pdf.read_bytes()).hexdigest() != SPEC_SHA:
        raise SystemExit('Not the verified C720QS specification (Version 4, August 2024)')
    if hashlib.sha256(anth_pdf.read_bytes()).hexdigest() != ANTH_SHA:
        raise SystemExit('Not the verified Poetry Anthology for assessment from 2027')
    S, A = pages_text(spec_pdf), pages_text(anth_pdf)
    p_c1 = page_of(S, 'Section A (20%) Shakespeare', 'Macbeth')
    p_c2 = page_of(S, 'Post 1914 Prose/Drama', 'An Inspector Calls', 'A Christmas Carol')
    p_unseen = page_of(S, 'Section C (20%) Unseen Poetry')
    p_list = page_of(S, 'prescribed texts list', 'Macbeth', 'An Inspector Calls', 'A Christmas Carol')
    p_anth = page_of(S, 'Poetry Anthology for assessment from', 'Origin Story')
    anth_list = S[p_anth - 1].split('for assessment from\n2027')[-1] if 'for assessment from\n2027' in S[p_anth - 1] else S[p_anth - 1]
    anth_contents = ''.join(A[:4])
    for title, poet, pg in ANTHOLOGY:
        if flat(title) not in flat(anth_list) or flat(poet.split()[-1]) not in flat(anth_list):
            raise SystemExit(f'Specification anthology list mismatch: {title}')
        if not re.search(re.escape(title.split()[0]) + r'.*\s' + str(pg) + r'\b', anth_contents):
            raise SystemExit(f'Anthology contents page mismatch: {title}')
    for title in OLD_ANTHOLOGY:
        if flat(title) not in flat(S[p_anth - 1]):
            raise SystemExit(f'Earlier anthology list mismatch: {title}')
    order = []

    def leaf(pid, code, title, content, comp, pages, extra=None):
        order.append(pid)
        return {'id': pid, 'code': code, 'title': title, 'content': content,
                'official_reference': {'component': comp, 'source_pages': pages, **(extra or {})}}

    shakes = {'id': f'{P}_SHAKES', 'code': 'A', 'title': 'Section A: Shakespeare: Macbeth', 'kind': 'set_text',
              'route': 'Component 1 Section A (one play from the prescribed list)',
              'points': [leaf(f'{P}_SHAKES_A.2', 'A.2', 'Macbeth',
                              ['Macbeth, William Shakespeare.',
                               'One extract-based question (15 marks) and one essay on the play as a whole (25 marks, including 5 for spelling, '
                               'punctuation and the use of vocabulary and sentence structures). Assesses AO1, AO2 and AO4.'],
                              'C720U10-1 Section A', [p_c1, p_list])]}
    anth = {'id': f'{P}_ANTH', 'code': 'P', 'title': 'Section B: Poetry Anthology (for assessment from 2027)', 'kind': 'set_text',
            'route': 'Component 1 Section B (one named anthology poem, then a comparison with a second anthology poem)',
            'points': [leaf(f'{P}_ANTH_P.{i}', f'P.{i}', f'{t} ({poet})', [f'{t}, {poet} (Eduqas Poetry Anthology for assessment from 2027, page {pg}).'],
                            'C720U10-1 Section B', [p_anth], {'anthology_page': pg})
                       for i, (t, poet, pg) in enumerate(ANTHOLOGY, 1)]}
    post = {'id': f'{P}_POST1914', 'code': 'A', 'title': 'Section A: Post-1914 drama: An Inspector Calls', 'kind': 'set_text',
            'route': 'Component 2 Section A (one prose or drama text from the prescribed list)',
            'points': [leaf(f'{P}_POST1914_A.1', 'A.1', 'An Inspector Calls',
                            ['An Inspector Calls, J B Priestley.',
                             'One source-based question using an extract and the play as a whole (40 marks, including 5 for spelling, punctuation '
                             'and the use of vocabulary and sentence structures). Assesses AO1, AO2 and AO4.'],
                            'C720U20-1 Section A', [p_c2, p_list])]}
    c19 = {'id': f'{P}_C19', 'code': 'B', 'title': 'Section B: 19th century prose: A Christmas Carol', 'kind': 'set_text',
           'route': 'Component 2 Section B (one novel from the prescribed list)',
           'points': [leaf(f'{P}_C19_B.1', 'B.1', 'A Christmas Carol',
                           ['A Christmas Carol, Charles Dickens.',
                            'One source-based question using an extract and the novel as a whole (40 marks). Assesses AO1, AO2 and AO3.'],
                           'C720U20-1 Section B', [p_c2, p_list])]}
    unseen = {'id': f'{P}_UNSEEN', 'code': 'C', 'title': 'Section C: Unseen poetry', 'kind': 'skill',
              'route': 'Component 2 Section C (compulsory: two unseen 20th or 21st century poems)',
              'points': [leaf(f'{P}_UNSEEN_C.1', 'C.1', 'Unseen poem: single poem response',
                              ['Write about a previously unseen poem from the 20th or 21st century and its effect (15 marks; AO1, AO2).'],
                              'C720U20-1 Section C', [p_unseen]),
                         leaf(f'{P}_UNSEEN_C.2', 'C.2', 'Unseen poems: comparison',
                              ['Write about a second unseen poem and compare it with the first (25 marks; AO1, AO2).'],
                              'C720U20-1 Section C', [p_unseen])]}
    sections = [{'id': f'{P}_SEC_C1', 'code': 'Component 1', 'title': 'Component 1: Shakespeare and Poetry',
                 'official_reference': {'component': 'C720U10-1', 'marks': 80, 'minutes': 120}, 'topics': [shakes, anth]},
                {'id': f'{P}_SEC_C2', 'code': 'Component 2', 'title': 'Component 2: Post-1914 Prose/Drama, 19th Century Prose and Unseen Poetry',
                 'official_reference': {'component': 'C720U20-1', 'marks': 120, 'minutes': 150}, 'topics': [post, c19, unseen]}]
    poems = [p['id'] for p in anth['points']]
    legacy = {f'{P}_ANTH_B.1': poems, f'{P}_ANTH_B.2': poems}
    spec = {'subject_id': SUBJECT, 'specification_version': 'eduqas-c720qs-version-4-2024-08', 'official_source_url': PAGE,
            'order_status': 'verified',
            'official_source': {'title': 'WJEC Eduqas GCSE (9-1) in English Literature specification (teaching from 2015)', 'version': 'Version 4',
                                'issue_date': 'August 2024', 'first_teaching': 2015, 'first_assessment': 2017, 'url': SPEC_URL, 'page': PAGE,
                                'sha256': SPEC_SHA, 'verified_at': '2026-11-17',
                                'note': 'Version 4 replaces the Component 1 Section B poetry anthology with a new anthology assessed for the first time in 2027.'},
            'anthology_source': {'title': 'WJEC Eduqas GCSE (9-1) English Literature Poetry Anthology (C720) for first assessment from 2027',
                                 'url': ANTH_URL, 'sha256': ANTH_SHA, 'verified_at': '2026-11-17'},
            'approach': 'Official Eduqas prescribed texts, scoped to the owner’s route. No textbook organisation has been supplied.',
            'route': {'component_1': 'Macbeth (Section A) and the Poetry Anthology for assessment from 2027 (Section B)',
                      'component_2': 'An Inspector Calls (Section A), A Christmas Carol (Section B) and unseen poetry (Section C)',
                      'evidence': 'Owner’s answers, 16 November 2026 (recorded in project memory)'},
            'options_not_in_scope': NOT_IN_SCOPE,
            'components': {'C720U10-1': {'title': 'Shakespeare and Poetry', 'marks': 80, 'minutes': 120,
                                         'structure': 'A Shakespeare: extract question (15) and essay (25) on one play; B anthology poetry: one poem (15) and a comparison (25)'},
                           'C720U20-1': {'title': 'Post-1914 Prose/Drama, 19th Century Prose and Unseen Poetry', 'marks': 120, 'minutes': 150,
                                         'structure': 'A post-1914 text (40), B 19th century novel (40), C unseen poem (15) and comparison (25)'}},
            'notes': 'Leaves are the route’s set texts and the 2027 anthology poems in Eduqas’s printed order. Eduqas prints no codes; codes are positional.',
            'legacy_ids': legacy, 'point_order': order, 'sections': sections}
    target = REPO / f'data/specs/{SUBJECT}.json'
    target.write_text(json.dumps(spec, ensure_ascii=False, indent=2) + '\n')
    # Hidden demo rows: retag any that name an out-of-route text to the route leaf of the same section.
    demo_path = REPO / f'data/questions/{SUBJECT}.json'
    retag = {f'{P}_SHAKES_A.1': [f'{P}_SHAKES_A.2'], f'{P}_C19_B.2': [f'{P}_C19_B.1']}
    demo = json.loads(demo_path.read_text())
    for q in demo:
        for key in ('primary_spec_points', 'crossover_spec_points'):
            q[key] = [x for old in q.get(key, []) for x in (retag.get(old) or legacy.get(old) or [old])]
    demo_path.write_text(json.dumps(demo, ensure_ascii=False, indent=2) + '\n')
    sys.path.insert(0, str(REPO / 'tools'))
    from write_spec_migrations import write_migrations
    write_migrations(REPO)
    print('wrote', target, len(order), 'leaves')


if __name__ == '__main__':
    main()
