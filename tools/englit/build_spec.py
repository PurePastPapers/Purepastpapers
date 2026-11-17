#!/usr/bin/env python3
"""Build data/specs/EDX_ALEVEL_ENGLIT_9ET0.json from Pearson's official specifications.

Usage: build_spec.py ALEVEL_SPEC_PDF AS_SPEC_PDF
  gce2015-a-level-eng-lit-spec.pdf (9ET0 Issue 11, August 2025) and
  as-literature-spec.pdf (8ET0 Issue 8, September 2023). Other revisions are refused.

Pearson's English Literature content is a list of set texts, not numbered bullets. The
leaves are the owner's route through it (The Reach Free School prospectus, 16 November
2026), in the specification's printed order:
- Component 1 Drama: Othello (Shakespeare tragedy) and its critical reading (Shakespeare:
  A Critical Anthology - Tragedy, assessed by AO5 in every Section A question), and
  A Streetcar Named Desire (other drama).
- Component 2 Prose, theme Science and Society: The Handmaid's Tale and Frankenstein.
- Component 3 Poetry: each prescribed poem of Poems of the Decade (Appendix 5, printed
  order), unseen poetry comparison, and each prescribed poem of The Romantics (English
  Romantic Verse, Appendix 5, printed order).
Pearson prints no codes, so a code is a positional identity (PD.3 = the third prescribed
Poems of the Decade poem). Exam questions name the set poem they ask about, so poem leaves
carry positive evidence.

AS 8ET0 (Issue 8) sets Poems of the Decade (the same 20 poems), A Streetcar Named Desire
and the Science and Society prose texts; those leaves are AS-shared (the Year 12
co-teaching basis). Othello, the critical anthology, unseen poetry and The Romantics are
A-level only.
"""
import hashlib
import json
import re
import subprocess
import sys
from pathlib import Path

A_SHA = '2f27dbd3c208726149c2ed237160a04bda1784f8eec28d3e70d6043ce856fd83'
AS_SHA = 'bad1e11d316398a6f332dc6362ff9836f0e9fd9696a1e8c1ee67378201cb9fe2'
A_URL = 'https://qualifications.pearson.com/content/dam/pdf/A%20Level/English%20Literature/2015/Specification%20and%20sample%20assessments/gce2015-a-level-eng-lit-spec.pdf'
AS_URL = 'https://qualifications.pearson.com/content/dam/pdf/A%20Level/English%20Literature/2015/Specification%20and%20sample%20assessments/as-literature-spec.pdf'
PAGE = 'https://qualifications.pearson.com/en/qualifications/edexcel-a-levels/english-literature-2015.html'
REPO = Path(__file__).resolve().parents[2]
SUBJECT = 'EDX_ALEVEL_ENGLIT_9ET0'

POTD = [('Eat Me', 'Patience Agbabi', 3), ('Chainsaw Versus the Pampas Grass', 'Simon Armitage', 6),
        ('Material', 'Ros Barber', 10), ('History', 'John Burnside', 25), ('An Easy Passage', 'Julia Copus', 37),
        ('The Deliverer', 'Tishani Doshi', 43), ('The Lammas Hireling', 'Ian Duhig', 51),
        ('To My Nine-Year-Old Self', 'Helen Dunmore', 52), ('A Minor Role', 'U A Fanthorpe', 57),
        ('The Gun', 'Vicki Feaver', 62), ('The Furthest Distances I’ve Travelled', 'Leontia Flynn', 64),
        ('Giuseppe', 'Roderick Ford', 66), ('Out of the Bag', 'Seamus Heaney', 81), ('Effects', 'Alan Jenkins', 92),
        ('Genetics', 'Sinéad Morrissey', 125), ('From the Journal of a Disappointed Man', 'Andrew Motion', 127),
        ('Look We Have Coming to Dover!', 'Daljit Nagra', 129), ('Please Hold', 'Ciaran O’Driscoll', 132),
        ('On Her Blindness', 'Adam Thorpe', 170), ('Ode on a Grayson Perry Urn', 'Tim Turnbull', 172)]
ROMANTICS = [('Songs of Innocence: Holy Thursday', 'William Blake', 69), ('Songs of Experience: Holy Thursday', 'William Blake', 73),
             ('Songs of Experience: The Sick Rose', 'William Blake', 73), ('Songs of Experience: The Tyger', 'William Blake', 74),
             ('Songs of Experience: London', 'William Blake', 75), ('Lines Written in Early Spring', 'William Wordsworth', 108),
             ('Lines Composed a Few Miles above Tintern Abbey', 'William Wordsworth', 109),
             ('Ode: Intimations of Immortality', 'William Wordsworth', 133),
             ('Lines Inscribed upon a Cup Formed from a Skull', 'George Gordon, Lord Byron', 211),
             ('So We’ll Go no more A Roving', 'George Gordon, Lord Byron', 213),
             ('On This Day I Complete My Thirty-Sixth Year', 'George Gordon, Lord Byron', 232),
             ('‘The cold earth slept below’', 'Percy Bysshe Shelley', 242),
             ('Stanzas Written in Dejection, near Naples', 'Percy Bysshe Shelley', 243),
             ('Ode to the West Wind', 'Percy Bysshe Shelley', 246), ('The Question', 'Percy Bysshe Shelley', 249),
             ('Ode to a Nightingale', 'John Keats', 276), ('Ode on a Grecian Urn', 'John Keats', 279),
             ('Ode on Melancholy', 'John Keats', 283), ('Sonnet on the Sea', 'John Keats', 287)]
NOT_IN_SCOPE = {
    'Component 1 Shakespeare': 'Antony and Cleopatra, Hamlet, King Lear (tragedy); A Midsummer Night’s Dream, Measure for Measure, The Taming of the Shrew, Twelfth Night (comedy)',
    'Component 1 Other drama': 'Doctor Faustus, The Duchess of Malfi, The Importance of Being Earnest, The Rover, Les Blancs, Sweat, Waiting for Godot',
    'Component 2 Prose themes': 'Childhood; Colonisation and its Aftermath; Crime and Detection; The Supernatural; Women and Society. '
                                'Science and Society alternatives The War of the Worlds and Never Let Me Go are not studied.',
    'Component 3 Section B': 'Medieval Poetic Drama, Chaucer, The Metaphysical Poets, Donne, Keats (named poet), The Victorians, Rossetti, '
                             'Modernism, T S Eliot, The Movement, Larkin',
    'Component 4': 'Non-examination assessment (coursework) has no exam questions.',
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
    a_pdf, as_pdf = Path(sys.argv[1]), Path(sys.argv[2])
    if hashlib.sha256(a_pdf.read_bytes()).hexdigest() != A_SHA:
        raise SystemExit('Not the verified 9ET0 specification (Issue 11, August 2025)')
    if hashlib.sha256(as_pdf.read_bytes()).hexdigest() != AS_SHA:
        raise SystemExit('Not the verified 8ET0 specification (Issue 8, September 2023)')
    A, S = pages_text(a_pdf), pages_text(as_pdf)
    appendix = page_of(A, 'Appendix 5: Prescribed texts', 'Component 3: Poetry – poems to be studied')
    potd_page, rom_page = page_of(A, 'Post-2000 Specified Poetry', 'Eat Me', after=appendix - 1), page_of(A, 'English Romantic Verse', 'Tintern', after=appendix - 1)
    as_potd = page_of(S, 'Post-2000 Specified Poetry', 'Eat Me', after=page_of(S, 'Appendix 4: Prescribed texts', 'Component 1: Poetry – poems to be studied') - 1)
    for title, poet, _ in POTD:
        for pages, p in ((A, potd_page), (S, as_potd)):
            if flat(title.split(' ')[0]) not in flat(pages[p - 1] + pages[p]) or flat(poet) not in flat(pages[p - 1] + pages[p]):
                raise SystemExit(f'Poems of the Decade list mismatch: {title}')
    for title, poet, _ in ROMANTICS:
        if not all(flat(w) in flat(A[rom_page - 1]) for w in title.split(':')[-1].split()[:2]):
            raise SystemExit(f'Romantics list mismatch: {title}')
    p_drama, p_prose, p_poetry = page_of(A, 'WILLIAM SHAKESPEARE', 'Othello'), page_of(A, 'Science and Society', 'Frankenstein', 'Handmaid'), page_of(A, 'Post-2000 poetry', 'Specified text')
    as_drama, as_prose = page_of(S, 'Drama', 'A Streetcar Named Desire', 'Select one play'), page_of(S, 'Science and Society', 'Frankenstein', 'Handmaid')
    order, as_map = [], {}

    def leaf(pid, code, title, content, comp, pages, as_ref=None, extra=None):
        p = {'id': pid, 'code': code, 'title': title, 'content': content,
             'official_reference': {'component': comp, 'source_pages': pages, **(extra or {})}}
        if as_ref:
            p['as_reference'] = {'qualification': '8ET0', **as_ref}
            as_map[f"8ET0 {as_ref['component']} {code}"] = pid
        order.append(pid)
        return p

    drama = [
        {'id': 'EDX_ENGLIT_SHAKES', 'code': 'A', 'title': 'Section A: Shakespeare (tragedy): Othello', 'kind': 'set_text',
         'route': 'Paper 1 Section A (one play from the tragedy or comedy list)',
         'points': [leaf('EDX_ENGLIT_SHAKES_A.1', 'A.1', 'Othello',
                         ['Othello, William Shakespeare (Tragedy).', 'One essay question incorporating ideas from wider critical reading (AO1, AO2, AO3, AO5).'],
                         '9ET0/01', [p_drama]),
                    leaf('EDX_ENGLIT_SHAKES_A.2', 'A.2', 'Critical reading: Shakespeare: A Critical Anthology – Tragedy',
                         ['Students engage with different interpretations of their Shakespeare play, supported by Shakespeare: A Critical Anthology – Tragedy '
                          '(four generic essays and three essays on each set text). The anthology must not be taken into the examination.'],
                         '9ET0/01', [p_drama])]},
        {'id': 'EDX_ENGLIT_DRAMA', 'code': 'B', 'title': 'Section B: Other drama: A Streetcar Named Desire', 'kind': 'set_text',
         'route': 'Paper 1 Section B (one post-1900 or pre-1900 play); AS Paper 1 Section B',
         'points': [leaf('EDX_ENGLIT_DRAMA_B.1', 'B.1', 'A Streetcar Named Desire',
                         ['A Streetcar Named Desire, Tennessee Williams (post-1900 other drama).', 'One essay question (AO1, AO2, AO3).'],
                         '9ET0/01', [p_drama], {'component': '8ET0/01 Section B', 'source_pages': [as_drama]})]}]
    prose = [{'id': 'EDX_ENGLIT_PROSE', 'code': 'P', 'title': 'Science and Society: comparative prose', 'kind': 'set_text',
              'route': 'Paper 2 (one theme, two texts, at least one pre-1900); AS Paper 2',
              'points': [leaf('EDX_ENGLIT_PROSE_P.1', 'P.1', 'The Handmaid’s Tale',
                              ['The Handmaid’s Tale, Margaret Atwood (Science and Society, post-1900).', 'One comparative essay question on the theme (AO1-AO4).'],
                              '9ET0/02', [p_prose], {'component': '8ET0/02', 'source_pages': [as_prose]}),
                         leaf('EDX_ENGLIT_PROSE_P.2', 'P.2', 'Frankenstein',
                              ['Frankenstein, Mary Shelley (Science and Society, pre-1900).', 'One comparative essay question on the theme (AO1-AO4).'],
                              '9ET0/02', [p_prose], {'component': '8ET0/02', 'source_pages': [as_prose]})]}]
    potd = [leaf(f'EDX_ENGLIT_MODERN_PD.{i}', f'PD.{i}', f'{t} ({poet})', [f'{t}, {poet} (Poems of the Decade, page {pg}).'],
                 '9ET0/03', [potd_page], {'component': '8ET0/01 Section A', 'source_pages': [as_potd]}, {'anthology_page': pg})
            for i, (t, poet, pg) in enumerate(POTD, 1)]
    potd.append(leaf('EDX_ENGLIT_MODERN_UNSEEN', 'PD.U', 'Unseen poetry: comparing an unseen post-2000 poem',
                     ['Students respond to an unseen poem in comparison with a studied poem from their contemporary text (AO1, AO2, AO4).'],
                     '9ET0/03', [page_of(A, 'Unseen poetry', 'unseen poem in comparison')]))
    rom = [leaf(f'EDX_ENGLIT_POET_R.{i}', f'R.{i}', f'{t} ({poet})', [f'{t}, {poet} (English Romantic Verse, ed. David Wright, page {pg}).'],
                '9ET0/03', [rom_page], extra={'anthology_page': pg})
           for i, (t, poet, pg) in enumerate(ROMANTICS, 1)]
    poetry = [{'id': 'EDX_ENGLIT_MODERN', 'code': 'PD', 'title': 'Section A: Post-2000 specified poetry: Poems of the Decade', 'kind': 'set_text',
               'route': 'Paper 3 Section A (unseen comparison); AS Paper 1 Section A', 'points': potd},
              {'id': 'EDX_ENGLIT_POET', 'code': 'R', 'title': 'Section B: The Romantics (English Romantic Verse)', 'kind': 'set_text',
               'route': 'Paper 3 Section B (one period or named poet)', 'points': rom}]
    sections = [{'id': 'EDX_ENGLIT_SEC_P1', 'code': 'Paper 1', 'title': 'Paper 1: Drama', 'official_reference': {'component': '9ET0/01'}, 'topics': drama},
                {'id': 'EDX_ENGLIT_SEC_P2', 'code': 'Paper 2', 'title': 'Paper 2: Prose', 'note': 'Theme: Science and Society',
                 'official_reference': {'component': '9ET0/02'}, 'topics': prose},
                {'id': 'EDX_ENGLIT_SEC_P3', 'code': 'Paper 3', 'title': 'Paper 3: Poetry', 'official_reference': {'component': '9ET0/03'}, 'topics': poetry}]
    pd_ids = [p['id'] for p in potd]
    keats = [p['id'] for p, (_, poet, _) in zip(rom, ROMANTICS) if poet == 'John Keats']
    legacy = {'EDX_ENGLIT_MODERN_A.1': pd_ids, 'EDX_ENGLIT_POET_B.1': [p['id'] for p in rom], 'EDX_ENGLIT_POET_B.2': keats}
    spec = {'subject_id': SUBJECT, 'specification_version': 'pearson-9et0-issue-11-2025-08', 'official_source_url': PAGE, 'order_status': 'verified',
            'official_source': {'title': 'Pearson Edexcel Level 3 Advanced GCE in English Literature (9ET0) specification', 'version': 'Issue 11',
                                'issue_date': 'August 2025', 'first_teaching': 2015, 'url': A_URL, 'page': PAGE, 'sha256': A_SHA, 'verified_at': '2026-11-16',
                                'note': 'Reissue with no content changes affecting the exams (NEA authentication sheet only); all public papers were set on this content.'},
            'as_source': {'title': 'Pearson Edexcel Level 3 Advanced Subsidiary GCE in English Literature (8ET0) specification', 'version': 'Issue 8',
                          'issue_date': 'September 2023', 'url': AS_URL, 'sha256': AS_SHA, 'verified_at': '2026-11-16'},
            'approach': 'Official Pearson set-text order, scoped to the owner’s route. No textbook organisation has been supplied.',
            'route': {'paper_1': 'Othello (Section A, tragedy) and A Streetcar Named Desire (Section B)',
                      'paper_2': 'Science and Society: Frankenstein and The Handmaid’s Tale',
                      'paper_3': 'Poems of the Decade (Section A) and The Romantics (Section B)',
                      'as': 'AS Paper 1: Poems of the Decade and A Streetcar Named Desire; AS Paper 2: Science and Society',
                      'evidence': 'The Reach Free School Sixth Form Prospectus 2025/26 (owner-supplied source); The Romantics chosen by the owner, 16 Nov 2026'},
            'options_not_in_scope': NOT_IN_SCOPE,
            'components': {'9ET0/01': {'title': 'Drama', 'marks': 60, 'minutes': 135, 'structure': 'A Shakespeare (35), B other drama (25); one of two questions on the studied text in each'},
                           '9ET0/02': {'title': 'Prose', 'marks': 40, 'minutes': 75, 'structure': 'one of two comparative questions on the studied theme'},
                           '9ET0/03': {'title': 'Poetry', 'marks': 60, 'minutes': 135, 'structure': 'A post-2000 poetry with an unseen poem (30), B pre- or post-1900 poetry (30)'},
                           '8ET0/01': {'title': 'AS Poetry and Drama', 'marks': 72, 'minutes': 120, 'structure': 'A post-2000 poetry (24), B drama (48)'},
                           '8ET0/02': {'title': 'AS Prose', 'marks': 44, 'minutes': 75, 'structure': 'one of two comparative questions on the studied theme'}},
            'as_section_map': as_map, 'year_12_points': list(as_map.values()),
            'notes': 'Leaves are the route’s set texts and prescribed poems in Pearson’s printed order. Pearson prints no codes; codes are positional. '
                     'Linear A level: Pearson prints no Year 12/13 order; the AS 8ET0 set texts give the co-teaching Year 12 subset.',
            'legacy_ids': legacy, 'point_order': order, 'sections': sections}
    target = REPO / f'data/specs/{SUBJECT}.json'
    target.write_text(json.dumps(spec, ensure_ascii=False, indent=2) + '\n')
    sys.path.insert(0, str(REPO / 'tools'))
    from write_spec_migrations import write_migrations
    write_migrations(REPO)
    print('wrote', target, len(order), 'leaves;', len(as_map), 'AS-shared leaves')


if __name__ == '__main__':
    main()
