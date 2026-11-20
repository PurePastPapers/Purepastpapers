"""Self test for tools/reports/extract.py on a generated report laid out like a Pearson PEF.

Run: python3 tools/reports/extract.py --self-test
The generated PDF is invented test text, never published; it only exercises the splitter.
"""
import tempfile
from pathlib import Path

HEADINGS = [
    ('Question 3(a) and (b)', [{'q': '3', 'part': '(a)'}, {'q': '3', 'part': '(b)'}]),
    ('Questions 4 and 5', [{'q': '4', 'part': ''}, {'q': '5', 'part': ''}]),
    ('Question 1 (a)(i) & (ii)', [{'q': '1', 'part': '(a)(i)'}, {'q': '1', 'part': '(a)(ii)'}]),
    ('Q7bii', [{'q': '7', 'part': '(b)(ii)'}]),
    ('Question 10(b)(ii)', [{'q': '10', 'part': '(b)(ii)'}]),
    ('Question 6 – Vectors', [{'q': '6', 'part': ''}]),
    ('Question 2 (c) (iii)', [{'q': '2', 'part': '(c)(iii)'}]),
    ('Questions 8 to 10', [{'q': '8', 'part': ''}, {'q': '9', 'part': ''}, {'q': '10', 'part': ''}]),
]
NOT_HEADINGS = ['Question 3 was answered well by most candidates.', 'Questions were generally well attempted',
                'Q. How many marks', 'Question 4.']


def make_pdf(path):
    from reportlab.lib.pagesizes import A4
    from reportlab.pdfgen import canvas
    from PIL import Image
    width, height = A4
    pdf = canvas.Canvas(str(path), pagesize=A4)
    page_no = [0]

    def chrome():
        page_no[0] += 1
        pdf.setFont('Helvetica', 8)
        pdf.drawString(50, height - 30, 'Pearson Edexcel GCE A Level Physics 9PH0 01')
        pdf.drawString(width / 2, 25, str(page_no[0]))

    def para(y, text, bold=False, size=10):
        pdf.setFont('Helvetica-Bold' if bold else 'Helvetica', size)
        for line in text:
            pdf.drawString(60, y, line)
            y -= 13
        return y - 9

    chrome()
    para(700, ['Examiners\' Report', 'Principal Examiner Feedback', 'Summer 2019'], bold=True, size=16)
    para(560, ['Edexcel and BTEC Qualifications are awarded by Pearson.'])
    pdf.showPage()

    chrome()
    y = para(780, ['Introduction'], bold=True, size=12)
    y = para(y, ['This paper was accessible to most candidates and the', 'full range of marks was seen.'])
    y = para(y, ['Question 1'], bold=True, size=12)
    y = para(y, ['Most candidates recalled the unit correctly.'])
    y = para(y, ['Question 2 (a)'], bold=True, size=12)
    y = para(y, ['Candidates needed to state that the resultant force is', 'zero. Many omitted the word resultant.'])
    y = para(y, ['Question 2 (b)(i)'], bold=True, size=12)
    y = para(y, ['Weaker responses did not convert grams to kilograms.'])
    img = Path(path).with_suffix('.png')
    Image.new('L', (400, 160), 200).save(img)
    pdf.drawImage(str(img), 60, y - 170, width=300, height=160)
    y = para(y - 185, ['This response scored 2 marks.'])
    pdf.showPage()

    chrome()
    y = para(780, ['Question 2 (b)(i) continued text runs onto this page and', 'should join the same section.'])
    y = para(y, ['Questions 3 and 4'], bold=True, size=12)
    y = para(y, ['Both questions tested graph skills.', '• Axes were often unlabelled.', '• Units were missing.'])
    y = para(y, ['Question 5'], bold=True, size=12)
    y = para(y, ['A multi-part question on fields.'])
    y = para(y, ['(a)'], bold=True)
    y = para(y, ['Part (a) was well answered.'])
    y = para(y, ['(b)'], bold=True)
    y = para(y, ['Part (b) needed the inverse square law.'])
    y = para(y, ['Paper Summary'], bold=True, size=12)
    y = para(y, ['Based on their performance on this paper, candidates are offered the following advice:',
                 '• show all working'])
    pdf.showPage()

    chrome()
    para(780, ['Grade boundaries for this, and all other papers, can be found on the website.'])
    pdf.showPage()
    pdf.save()


def run_self_test(extract):
    failures = []
    for text, expected in HEADINGS:
        got = extract.parse_heading(text)
        if got != expected:
            failures.append(f'heading {text!r}: {got} != {expected}')
    for text in NOT_HEADINGS:
        if extract.parse_heading(text):
            failures.append(f'not a heading but matched: {text!r}')
    for raw, want in [('(a) (ii)', '(a)(ii)'), ('aii', '(a)(ii)'), ('a(ii)', '(a)(ii)'), ('(ii)', '(ii)'), ('ii', '(ii)'), ('', '')]:
        if extract.norm_part(raw) != want:
            failures.append(f'norm_part {raw!r} -> {extract.norm_part(raw)!r}, want {want!r}')

    with tempfile.TemporaryDirectory() as tmp:
        pdf = Path(tmp) / 'report.pdf'
        make_pdf(pdf)
        split = extract.split_report(extract.read_layout(pdf))
    heads = [s['heading'] for s in split['sections']]
    want = ['Question 1', 'Question 2 (a)', 'Question 2 (b)(i)', 'Questions 3 and 4', 'Question 5', 'Question 5(a)', 'Question 5(b)']
    if heads != want:
        failures.append(f'sections {heads} != {want}')
    by = {s['heading']: s for s in split['sections']}
    text = lambda s: ' '.join(p['t'] for p in s['paras'])
    general = ' '.join(p['t'] for p in split.get('general', {}).get('paras', []))
    checks = [
        ('general keeps the introduction', 'accessible to most candidates' in general),
        ('cover boilerplate dropped', 'Edexcel and BTEC' not in general),
        ('lines joined into one paragraph', 'stated' not in text(by['Question 2 (a)']) and
         'resultant force is zero. Many omitted' in text(by['Question 2 (a)'])),
        ('section continues across a page', 'should join the same section' in text(by.get('Question 2 (b)(i)', {'paras': []}))),
        ('page list spans both pages', by.get('Question 2 (b)(i)', {}).get('pages') == [2, 3]),
        ('example script counted', by.get('Question 2 (b)(i)', {}).get('figures') == [{'page': 2, 'count': 1}]),
        ('running header dropped', 'Pearson Edexcel GCE' not in text(by.get('Question 2 (b)(i)', {'paras': []}))),
        ('bullets kept as list items', [p['k'] for p in by['Questions 3 and 4']['paras']] == ['p', 'li', 'li']),
        ('bold sub-part starts its own section', by.get('Question 5(b)', {}).get('targets') == [{'q': '5', 'part': '(b)'}]),
        ('summary separated', 'show all working' in ' '.join(p['t'] for p in split.get('summary', {}).get('paras', []))),
        ('summary not in last section', 'show all working' not in text(by['Question 5(b)'])),
        ('stops at grade boundaries', 'Grade boundaries' not in str(split)),
    ]
    failures += [name for name, ok in checks if not ok]
    if failures:
        print('FAILED'); [print(' -', f) for f in failures]
        return 1
    print(f'examiner report extractor self test passed ({len(HEADINGS) + len(NOT_HEADINGS)} headings, {len(checks)} layout checks)')
    return 0
