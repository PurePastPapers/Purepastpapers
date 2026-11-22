"""Reviewed GCSE Biology display regions from official Pearson question papers."""


# Each vertical range is relative to the CropBox of the numbered PDF page.
FOSSILS_SOURCE = '7d692657608dda031ebbd1c3a54c3f713229e6457837298dbd4cc77efa9ec853'
DOMESTICATION_CONTEXT = [(7, .069042, .123)]

REVIEWS = {
    'EDX_1BI0_2020_NOVEMBER_1F_Q05_U01': (
        'e3e8f7bca50898a4101675046a91b705260b983ec64f7a120c56c779ede06a84',
        (14, .474975, .518929), [(14, .069323, .474975)]),
    'EDX_1BI0_2021_NOVEMBER_1H_Q01_U01': (
        'f61562bf9fb59e4b36f714e79210de7d9a5338dc9781690b511e9d5f9f90deb9',
        (2, .481979, .752358), [(2, .142071, .481979)]),
    'EDX_1BI0_2022_JUNE_2F_Q06_U01': (
        'ec965a38cc5d5b2d656a36b010ee6084cdd9a2a0379127c3b9282c69123e2c2d',
        (15, .407663, .567278), [(15, .069323, .403)]),
    'EDX_1SC0_2020_NOVEMBER_1BF_Q03_U01': (
        '25d4bcc508ad8977246803f18fd52a3d773bbf8f320a083b1549f12e26da48ed',
        (8, .474975, .518929), [(8, .069323, .474975)]),
    'EDX_1SC0_2022_JUNE_2BF_Q04_U01': (
        '5e1e8b89d187f86c08c31345e856839f9b346cd662b51d192c4c87ceb8f68ea7',
        (11, .407663, .567278), [(11, .069323, .403)]),
    'EDX_1SC0_2022_JUNE_2BH_Q06_U01': (
        'e29afaca498c6295ba5b63b9a44de4102a2cb9a20793f8bbe09d676b2d3196ad',
        (16, .563099, .80867), [(16, .069323, .559)]),
    'EDX_1BI0_2020_NOVEMBER_1F_Q01_U05': (
        'e3e8f7bca50898a4101675046a91b705260b983ec64f7a120c56c779ede06a84',
        None, [(4, .069042, .359), (4, .477, .686)]),
    'EDX_1BI0_2021_NOVEMBER_2H_Q08_U03': (
        'ac10f36267dbeb0be7d9e4d074752a474670fb1bf1689a814c71d84d0a26ed6e',
        None, [(19, .067, .094), (19, .278396, .402)]),
    # The Q2 page break puts Figure 5 before (a)(ii), independently of Figure 4.
    'EDX_1BI0_2023_JUNE_1F_Q02_U01': (FOSSILS_SOURCE, (5, .363229, .510264), [(5, .069323, .353)]),
    'EDX_1BI0_2023_JUNE_1F_Q02_U02': (FOSSILS_SOURCE, None, [(6, .069042, .415739)]),
    'EDX_1BI0_2023_JUNE_1F_Q02_U03': (FOSSILS_SOURCE, None, DOMESTICATION_CONTEXT),
    'EDX_1BI0_2023_JUNE_1F_Q02_U04': (FOSSILS_SOURCE, None, DOMESTICATION_CONTEXT),
    'EDX_1BI0_2023_JUNE_1F_Q02_U05': (FOSSILS_SOURCE, None, DOMESTICATION_CONTEXT),
    'EDX_1BI0_2025_JUNE_1H_Q01_U04': (
        '8a8180657b9af6ddd42a55d71363c2942fcede98be8ec33daf1f1e4f263593df',
        None, [(3, .330364, .357)]),
    'EDX_1SC0_2023_JUNE_1BF_Q04_U03': (
        'a04bcc2c334028fb1c0c86540478279a1eeb5f37a3b1bc58e5c2f9680f1650a9',
        None, [(11, .447661, .492947)]),
}


def region(span):
    page, top, bottom = span
    return {'page': page, 'bbox': [.041997, top, .958003, bottom]}


def display_review(question_id, source_sha256):
    reviewed = REVIEWS.get(question_id)
    if reviewed is None:
        return None
    expected_sha256, own, context = reviewed
    if source_sha256 != expected_sha256:
        raise ValueError(f'{question_id}: reviewed display source revision mismatch')
    result = {'context': [region(span) for span in context]}
    if own:
        result['own'] = [region(own)]
    return result


# The scheme sometimes splits a labelled row or level descriptors over pages.
# Keep the preceding row continuation with (b), and the descriptors with (c).
SCHEME_REVIEWS = {
    'EDX_1BI0_2024_JUNE_1H_Q10_U03': (
        [(35, .405371, .914167), (36, .083, .174)], .03268),
    'EDX_1BI0_2024_JUNE_1H_Q10_U04': (
        [(36, .195, .880), (37, .085, .793)], .03268),
    'EDX_1BI0_2024_JUNE_2H_Q10_U04': (
        [(26, .078, .905), (27, .077, .313)], .033595),
    'EDX_1BI0_2025_JUNE_2F_Q10_U04': (
        [(28, .035, .214)], .033589),
    'EDX_1BI0_2025_JUNE_2F_Q10_U05': (
        [(28, .234, .428)], .033589),
    'EDX_1BI0_2025_JUNE_2F_Q10_U06': (
        [(28, .444, .649)], .033589),
    'EDX_1BI0_2023_JUNE_1F_Q07_U04': (
        [(21, .079, .331)], .033589),
}

SCHEME_SOURCE_HASHES = {
    'EDX_1BI0_2023_JUNE_1F': '1f15c53c7950b9ab40b03d9141215d5e98e10288f9c9a37d3b91dabb685fda06',
    'EDX_1BI0_2024_JUNE_1H': '4973062afb3d537c1bec9a413ad00bd33d3707edc999eb4ccc0a872a65e22d30',
    'EDX_1BI0_2024_JUNE_2H': '04899e93a4b13f0b8704fb94f13c1980e65d13e463502d1dedbafdd3f604555e',
    'EDX_1BI0_2025_JUNE_2F': '56a62198f61e0934370c385fd5ed9eccc0f0b89e99d5362ef6f093d07cb8c6de',
}


def part_scheme_review(question_id, source_sha256):
    reviewed = SCHEME_REVIEWS.get(question_id)
    if reviewed is None:
        return None
    paper_id = question_id.rsplit('_Q', 1)[0]
    if source_sha256 != SCHEME_SOURCE_HASHES[paper_id]:
        raise ValueError(f'{question_id}: reviewed scheme source revision mismatch')
    spans, inset = reviewed
    return [{'page': page, 'bbox': [inset, top, 1 - inset, bottom]} for page, top, bottom in spans]


# Q7 includes a landscape guidance page with a Pearson subtotal typo (13 for 12).
# The three final Q10s continue beyond the first page of their scheme rows.
WHOLE_SCHEME_TAILS = {
    ('EDX_1BI0_2023_JUNE_1F', '7'): [
        (21, .033589, .079, .331), (22, .033589, .023762, .847288),
        (23, .033589, .023762, .508133), (25, .023762, .033589, .86994),
    ],
    ('EDX_1BI0_2024_JUNE_1H', '10'): [
        (35, .03268, .085, .914167), (36, .03268, .083, .88), (37, .03268, .085, .793),
    ],
    ('EDX_1BI0_2024_JUNE_2H', '10'): [
        (25, .033595, .079, .822881), (26, .033595, .078, .905), (27, .033595, .077, .361),
    ],
    ('EDX_1BI0_2025_JUNE_2F', '10'): [
        (27, .033589, .068, .823), (28, .033589, .034, .694),
    ],
}


def whole_scheme_review(paper_id, source_sha256, question_number, generated):
    spans = WHOLE_SCHEME_TAILS.get((paper_id, str(question_number)))
    if not spans:
        return generated
    if source_sha256 != SCHEME_SOURCE_HASHES[paper_id]:
        raise ValueError(f'{paper_id} Q{question_number}: reviewed scheme source revision mismatch')
    earlier_pages = [item for item in generated if item['page'] < spans[0][0]]
    corrected_tail = [{'page': page, 'bbox': [inset, top, 1 - inset, bottom]}
                      for page, inset, top, bottom in spans]
    return earlier_pages + corrected_tail
