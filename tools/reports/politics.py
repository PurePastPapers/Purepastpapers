"""Split AQA 7152 Politics reports using their printed headings."""

import re
import subprocess


QUESTION = re.compile(r'Question\s+(\d{1,2})\s*\.?', re.I)
SECTION = re.compile(r'Section\s+([ABC])', re.I)
GENERAL = re.compile(r'General(?:\s+comments?)?', re.I)
STOP = re.compile(r'Mark Ranges and Award of Grades|Grade Boundaries', re.I)
PAGE_FURNITURE = re.compile(r'Report on the examination\b|©|\d+ of \d+$', re.I)


def split_politics_report(pdf, paper):
    """Preserve separately headed question, section and paper-wide comments."""
    # The report is single-column. Poppler's line ordering keeps superscripts
    # and changes of italic font in place within their sentences.
    text = subprocess.run(
        ['pdftotext', '-layout', str(pdf), '-'], check=True, capture_output=True, text=True
    ).stdout
    pages = text.rstrip('\f').split('\f')
    component = int(paper['paper_code'])
    cover = [line.strip() for line in pages[0].splitlines()]
    if component not in (1, 2, 3) or not (
        any(re.match(rf'7152/{component}\b', line) for line in cover)
        and any(line.casefold() == 'report on the examination' for line in cover)
        and any(line.casefold() == f"{paper['series']} {paper['year']}".casefold() for line in cover)
    ):
        raise ValueError(f"{paper['paper_id']}: Politics report cover does not match")

    sections = []
    general = active = None
    last_question = 0
    section_letter = None
    max_question = 9 if component == 3 else 6
    section_for_question = {**dict.fromkeys((1, 2, 3), 'A'), 4: 'B',
                            **dict.fromkeys(range(5, max_question + 1), 'C')}

    def block(heading, targets):
        return {'heading': heading, 'targets': targets, 'pages': [], 'paras': [], 'figures': []}

    # The first two pages are the cover and publication notice.
    for number, page in enumerate(pages[2:], 3):
        paragraph_break = False
        has_body = False
        lines = [line.strip() for line in page.splitlines()]
        for line in lines:
            if PAGE_FURNITURE.match(line):
                continue
            if not line:
                paragraph_break = has_body
                continue
            has_body = True
            line = re.sub(r'\s+', ' ', line)
            if STOP.fullmatch(line):
                return finish_politics(sections, general)
            if match := QUESTION.fullmatch(line):
                question = int(match[1])
                if not last_question < question <= max_question or (
                    section_letter and section_letter != section_for_question[question]
                ):
                    raise ValueError(f"{paper['paper_id']}: unexpected question heading {line!r}")
                last_question = question
                active = block(line, [{'q': str(question), 'part': ''}])
                sections.append(active)
            elif match := SECTION.fullmatch(line):
                section_letter = match[1].upper()
                active = block(line, [{'section': section_letter}])
                sections.append(active)
            elif GENERAL.fullmatch(line) and not sections:
                general = active = block(line, [])
            elif active:
                append_line(active, line, number, paragraph_break)
            else:
                raise ValueError(f"{paper['paper_id']}: text before a recognised report heading")
            paragraph_break = False

    return finish_politics(sections, general)


def append_line(block, line, page, paragraph_break):
    paras = block['paras']
    last = paras[-1] if paras else None
    next_page = block['pages'][-1:] != [page]
    if next_page:
        block['pages'].append(page)
    if not last or paragraph_break or (next_page and last['t'].endswith(('.', ':', '?', '!'))):
        paras.append({'k': 'p', 't': line})
    else:
        joiner = '' if last['t'].endswith('-') and line[0].islower() else ' '
        last['t'] += joiner + line


def finish_politics(sections, general):
    sections = [section for section in sections if section['paras']]
    result = {'sections': [{'id': f's{i}', **section} for i, section in enumerate(sections, 1)]}
    if general and general['paras']:
        result['general'] = {key: general[key] for key in ('pages', 'paras', 'figures')}
    return result
