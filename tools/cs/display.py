"""Reviewed OCR Computer Science crop, context and answer dependencies.

Question references are the stable suffixes of their published unit IDs.
The coordinates below refer to the official PDF CropBox, in points.
"""

DEPENDENCIES = {
    'OCR_H046_SAMPLE_01': {'Q05_a_ii': ['Q05_a_i']},
    'OCR_H446_2021_NOVEMBER_01': {'Q02_b_ii': ['Q02_b_i'], 'Q07_b_ii': ['Q07_b_i']},
    'OCR_H446_SAMPLE_01': {'Q07_b': ['Q07_a'], 'Q10_a_iii': ['Q10_a_i', 'Q10_a_ii']},
}

# The specimen watermark inflated the text extraction's row heights. Clip to
# the actual printed task and tariff, preserving the watermark as source pixels.
QUESTION_BOUNDS = {
    'OCR_H446_SAMPLE_02': {
        'Q07_b': (12, 374, 533),
        'Q09_a': (14, 185, 367),
        'Q09_b': (14, 407, 488),
        'Q09_c': (14, 532, 614),
    },
}

# The programming prompts refer to code supplied by OCR. The dotted gaps that
# pupils fill in for part (i) are left outside these context crops.
CODE = {
    'Q08_b_ii': ('countRow_initialisation', 'Printed countRow initialisation', [
        (113, 399, 508, 463),
    ]),
    'Q08_b_iii': ('countRow_control_flow', 'Printed countRow control flow', [
        (113, 399, 508, 462),
        (113, 462, 235, 482),
        (113, 482, 321, 504),
        (113, 504, 508, 545),
        (113, 545, 322, 565),
        (113, 565, 508, 691),
        (113, 691, 239, 711),
        (113, 711, 508, 731),
        (113, 731, 195, 752),
        (113, 752, 508, 775),
    ]),
    'Q08_b_iv': ('countRow_signature', 'Printed countRow function signature', [
        (113, 399, 508, 420),
    ]),
}


def region(page, size, box):
    width, height = size
    left, top, right, bottom = box
    return {'page': page, 'bbox': [round(left / width, 6), round(top / height, 6),
                                   round(right / width, 6), round(bottom / height, 6)]}


def question_regions(paper_id, unit, regions):
    bounds = QUESTION_BOUNDS.get(paper_id, {}).get(unit)
    if not bounds:
        return regions
    page, top, bottom = bounds
    return [region(page, (596.04, 842.04), (25, top, 571.04, bottom))]


def apply_display(paper_id, record, render_context):
    """Apply reviewed evidence and attach any supplemental source crops."""
    unit = record['question_id'].removeprefix(f'{paper_id}_')
    requires = DEPENDENCIES.get(paper_id, {}).get(unit, [])
    if requires:
        record['depends_on_question_ids'] = [f'{paper_id}_{part}' for part in requires]
    elif paper_id == 'OCR_H446_SAMPLE_02' and unit == 'Q10_d_ii':
        record.pop('depends_on_question_ids', None)

    context = record['context']
    if requires or (paper_id == 'OCR_H446_SAMPLE_02' and unit == 'Q10_d_ii'):
        # Legacy CS links also injected the entire earlier scored part as a
        # stem. Linked cards already show it, and Q10(d)(ii) uses the intro.
        context.pop('stem_image_url', None)
        record['provenance'].pop('dependency_link_review', None)

    source = None
    if paper_id == 'OCR_H446_2021_NOVEMBER_02' and unit in CODE:
        name, label, boxes = CODE[unit]
        source = (name, label, [region(22, (595.276, 841.89), box) for box in boxes])
    elif paper_id == 'OCR_H446_SAMPLE_02' and unit == 'Q10_d_iii':
        name = 'hanoi_printed_timing'
        source = (name, 'Printed timing for three discs', [
            region(22, (596.04, 842.04), (115, 112, 460, 130)),
        ])
    if source:
        name, label, regions = source
        url = render_context(name, regions)
        figures = [f for f in context.get('figures', []) if f['image_url'] != url]
        context['figures'] = [*figures, {'label': label, 'source': 'question_paper', 'image_url': url}]
        record['provenance']['display_context_regions'] = regions
        record['provenance']['context_basis'] = 'printed introductions and reviewed unscored source excerpt'
