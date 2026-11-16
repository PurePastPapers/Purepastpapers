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
