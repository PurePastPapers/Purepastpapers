"""Checksum-bound positioning fixes for specific Biology source PDFs.

An override only supplies the position of a printed label or tariff that the
automatic OCR missed on an image-only page. It never adds or changes question
wording: published questions remain the original source pixels. Each entry is
bound to the source SHA256, so a revised PDF stops matching and is re-reviewed.
"""

OVERRIDES = {
    # 9BN0 June 2019 Paper 3 (image-only scan). Tesseract skipped the line
    # "(i) Explain why the plants were placed in a box in complete darkness." and
    # its "(3)" tariff on page 16 (Question 5(b)(i)). Positions come from a
    # targeted 400 dpi OCR of the band y=400-480 pt, checked on the rendered page.
    '5354ed07a6344383b64019b3c64052f16f2d216421bb11cbd33bcaecc8700268': {
        'note': 'Q5(b)(i) label and (3) tariff positions on page 16 (missed by full-page OCR).',
        'words': [
            {'page': 16, 'text': '(i)', 'x0': 80.3, 'x1': 94.0, 'top': 438.7, 'bottom': 448.6},
            {'page': 16, 'text': '(3)', 'x0': 496.6, 'x1': 510.0, 'top': 452.9, 'bottom': 462.6},
        ],
    },
}


def overrides_for(sha256):
    """Return ({page_number: [word, ...]}, note) for a source checksum."""
    entry = OVERRIDES.get(sha256)
    if not entry:
        return {}, None
    pages = {}
    for item in entry['words']:
        word = {k: v for k, v in item.items() if k != 'page'}
        word.update(fontname='OCR', upright=True, source='checksum_bound_override')
        pages.setdefault(item['page'], []).append(word)
    return pages, entry['note']


# 8BN0/01 June 2023 Q7 omits a printed "(a)" before (i) and (ii).
# The boundaries are reviewed in top-left MediaBox points on pages 22–25.
MEMBRANE_PAPER = '3f83cf1cf6406534f0b6a7732f233fc41b6f937871f465aeabcbc8666981c946'
MEMBRANE_SCHEME = '2ddaa6783f07fbd4dcffb4f15189cacdc5a378fa460cabae294d87cb0b11f178'
MEMBRANE_DISPLAY = {
    '(a)(i)': ((22, 319, 395), [(22, 83, 107)], 'question introduction'),
    '(a)(ii)': ((22, 456, 542), [(22, 83, 314)], 'phospholipid bilayer diagram'),
    '(b)': ((23, 83, 146), [], None),
    '(c)': ((23, 403, 699), [], None),
    '(d)(i)': ((24, 541, 580), [(24, 83, 531)], 'part (d) investigation and graph'),
    '(d)(ii)': ((25, 83, 208), [(24, 83, 531)], 'part (d) investigation and graph'),
}

# Each scheme part is its own table. Bound the complete header and table.
MEMBRANE_SCHEMES = [
    (20, 61, 230), (20, 236, 396), (21, 61, 310),
    (21, 315, 457), (22, 61, 230), (22, 235, 471),
]


def display_regions_for(question_sha256, scheme_sha256, question_number, units, page_size, scheme_size):
    """Return reviewed part boundaries for the exact source, in unit order."""
    if question_sha256 != MEMBRANE_PAPER or str(question_number) != '7':
        return None
    if scheme_sha256 != MEMBRANE_SCHEME:
        raise ValueError('Unexpected mark scheme for June 2023 8BN0/01 Q7')

    def region(bounds, dimensions, left, right):
        page, top, bottom = bounds
        _, height = dimensions(page)
        return {'page': page, 'bbox': [left, round(top / height, 6), right, round(bottom / height, 6)]}

    labels = [unit['part_label'] for unit in units]
    if labels != list(MEMBRANE_DISPLAY):
        raise ValueError(f'Unexpected part order for June 2023 8BN0/01 Q7: {labels}')
    results = []
    for label, scheme in zip(labels, MEMBRANE_SCHEMES):
        own, context, reason = MEMBRANE_DISPLAY[label]
        regions = [region(bounds, page_size, 0.1, 0.895) for bounds in context]
        results.append({
            'own': [region(own, page_size, 0.1, 0.895)],
            'context': regions,
            'after_stem': regions,
            'stem_ok': True,
            'depends_units': [],
            'context_reasons': [reason] if reason else [],
            'scheme': [region(scheme, scheme_size, 0.017821, 0.982179)],
        })
    return results
