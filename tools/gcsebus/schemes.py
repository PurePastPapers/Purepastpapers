"""Find exact scored mark-scheme tables in Pearson Edexcel GCSE Business PDFs."""
import re

import fitz


LABEL = re.compile(r"([1-7])\s*\(([a-z])\)\s*(?:\(([ivx]+)\))?$")
TARIFF = re.compile(r"\((\d{1,2})\)")


def spans(page):
    return [
        (s["text"].strip(), fitz.Rect(s["bbox"]))
        for block in page.get_text("dict", flags=fitz.TEXTFLAGS_TEXT)["blocks"]
        for line in block["lines"]
        for s in line["spans"]
        if s["text"].strip()
    ]


def table_bands(page):
    drawings = [item["rect"] for item in page.get_drawings()]
    sides = sorted(
        (r for r in drawings if 25 < r.x0 < 100 and r.width < 2 and r.height > 4),
        key=lambda r: r.y0,
    )
    bands = []
    for side in sides:
        if bands and side.y0 <= bands[-1].y1 + 3:
            bands[-1] |= side
        else:
            bands.append(fitz.Rect(side))
    for band in bands:
        edges = [
            r for r in drawings
            if r.height < 1.5 and r.width > 35 and band.y0 - 1 <= r.y0 <= band.y1 + 1
            and r.x0 >= band.x0 - 2
        ]
        if not edges or max(r.x1 for r in edges) - band.x0 < 350:
            continue
        yield fitz.Rect(band.x0 - 2, band.y0 - 2, max(r.x1 for r in edges) + 2, band.y1 + 2)


def collect_scheme(document, pages, expected_marks):
    """Map each printed label to its complete guidance and optional level rubric."""
    records = {}
    active = None
    for index in pages:
        page = document[index]
        entries = spans(page)
        for rect in table_bands(page):
            inside = [(text, box) for text, box in entries if rect.contains(box.tl + (1, 2))]
            terms = [text for text, _ in inside]
            anchors = []
            for text, box in inside:
                match = LABEL.fullmatch(text)
                if match and box.x0 < rect.x0 + 40:
                    label = "".join(part for part in match.groups() if part)
                    anchors.append((label, box.y0))
            if len(anchors) > 1:
                raise ValueError(f"Multiple question labels in one scheme table on page {index + 1}: {anchors}")
            rubric = any(text.lower() == "level" or re.fullmatch(r"Level\s*[123]", text) for text in terms)
            if anchors:
                label, label_y = anchors[0]
                if label in records:
                    raise ValueError(f"Repeated scheme label {label} on page {index + 1}")
                right_tariffs = [
                    int(match[1]) for text, box in inside
                    if box.x0 > rect.x0 + rect.width * .80 and abs(box.y0 - label_y) < 8
                    if (match := TARIFF.fullmatch(text))
                ]
                if right_tariffs != [expected_marks.get(label)]:
                    raise ValueError(f"Scheme tariff mismatch for {label} on page {index + 1}: {right_tariffs}")
                active = label
                records[active] = {"regions": [], "levels": set(), "bands": set()}
            elif not active or not terms:
                continue
            elif not rubric and not (
                active == "3d" and "maximum of 1 mark." in terms and rect.y0 < 75
            ):
                # The June 2019 Paper 2 point scheme above ends on the next page.
                # Otherwise skip unrelated tables, such as paper-wide AO grids.
                continue
            record = records[active]
            record["regions"].append({"page": index, "rect": list(rect)})
            if rubric:
                record["levels"].update(int(m[1]) for text in terms if (m := re.fullmatch(r"Level\s*([123])", text)))
                record["bands"].update(
                    (int(m[1]), int(m[2]))
                    for text, box in inside
                    if box.x0 < rect.x0 + 145 and (m := re.fullmatch(r"(\d+)\s*[-–−]\s*(\d+)", text))
                )
    if records.keys() != expected_marks.keys():
        raise ValueError(f"Missing schemes: {sorted(expected_marks.keys() - records.keys())}")
    for label, item in records.items():
        maximum = expected_marks[label]
        bands = {(1, maximum // 3), (maximum // 3 + 1, 2 * maximum // 3), (2 * maximum // 3 + 1, maximum)}
        item["rubric"] = maximum >= 6
        if item.pop("levels") != ({1, 2, 3} if item["rubric"] else set()):
            raise ValueError(f"Incomplete level descriptors for {label}")
        if item.pop("bands") != (bands if item["rubric"] else set()):
            raise ValueError(f"Incomplete or unexpected mark bands for {label}")
    return records
