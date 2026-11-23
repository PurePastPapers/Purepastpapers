#!/usr/bin/env python3
"""Read Pearson 1BS0 question, figure and case crop coordinates from public PDFs."""

import argparse
import hashlib
import json
import re
from collections import defaultdict
from dataclasses import dataclass
from pathlib import Path

import fitz

STANDARD_PARTS = (4, 5, 5, 2, 3, 3, 5)
SECTION_TOTALS = {"A": 35, "B": 30, "C": 25}
TARIFF = re.compile(r"^\((\d{1,2})\)$")
REFERENCE = re.compile(r"\b(Table|Figure)\s+(\d+)\b", re.I)
SELECT = re.compile(r"^Select (one|two) answers?[.:]", re.I)
OPTION = re.compile(r"^[A-E](?:\s|$)")
BLANK = re.compile(r"[.·…_]{5,}")
BOOKLET_INSTRUCTIONS = re.compile(r"^(In the Source Booklet|Look at Figures? \d.*read Extract)", re.I)


@dataclass
class Line:
    text: str
    rect: fitz.Rect

    @property
    def x(self):
        return self.rect.x0

    @property
    def top(self):
        return self.rect.y0

    @property
    def bottom(self):
        return self.rect.y1


def lines_of(page):
    lines = []
    for block in page.get_text("dict", flags=fitz.TEXTFLAGS_TEXT)["blocks"]:
        for line in block["lines"]:
            text = "".join(span["text"] for span in line["spans"]).strip()
            if line["dir"] != (1.0, 0.0) or not text:
                continue
            rect = fitz.Rect(line["bbox"])
            lines.append(Line(text, rect))
    return sorted(lines, key=lambda line: (round(line.top), line.x))


def question_frame(page):
    border = [
        drawing["rect"] for drawing in page.get_drawings()
        if drawing["rect"].y0 >= 0 and page.rect.contains(drawing["rect"])
        and drawing["rect"].height > 0.8 * page.rect.height
        and 510 < drawing["rect"].width < 540
    ]
    if border:
        frame = min(border, key=lambda rect: rect.get_area())
        return frame + (2, 2, -2, -2)
    return fitz.Rect(37, 37, page.rect.width - 37, page.rect.height - 44)


def region(page, left, top, right, bottom):
    return {"page": page, "rect": [round(value, 2) for value in (left, top, right, bottom)]}


def band(page, frame, top, bottom):
    return region(page, frame.x0, max(top, frame.y0), frame.x1, min(bottom, frame.y1))


def section_of(question):
    return "A" if question < 4 else "B" if question < 7 else "C"


def as_text(lines):
    return " ".join(" ".join(line.text.split()) for line in lines)


def irrelevant(text):
    return (text.startswith(("SECTION ", "Answer ALL", "Some questions must be",
                             "answer, put a line", "and then mark your", "TOTAL FOR ",
                             "(Total for ", "BLANK PAGE", "Turn over", "then answer Question",
                             "Questions 4, 5 and 6."))
            or text.endswith("BEGINS ON THE NEXT PAGE.")
            or BOOKLET_INSTRUCTIONS.match(text)
            or re.fullmatch(r"[\W\d]+", text)
            or re.fullmatch(r"[1-7]", text))


def subsequent_marks(lines, label_top, next_label_top, margin):
    return [
        (index, line, int(match[1]))
        for index, line in enumerate(lines)
        if label_top - 2 <= line.top < next_label_top
        and line.x > margin + 425 and (match := TARIFF.fullmatch(line.text))
    ]


def label_words(page, margin):
    return sorted(
        [word for word in page.get_text("words")
         if abs(word[0] - margin - 18) < 5 and re.fullmatch(r"\([a-h]\)", word[4])],
        key=lambda word: word[1]
    )


def case_resource(doc, section, indexes, booklet):
    heading = "SECTION " + section
    regions = []
    credits = []
    images = []
    for index in indexes:
        page = doc[index]
        frame = question_frame(page)
        left = frame.x0
        right = frame.x1
        bottom_limit = min(frame.y1, page.rect.height - 55)
        rows = [
            line for line in lines_of(page)
            if left - 3 <= line.x < right and 37 <= line.top < bottom_limit
            and not re.fullmatch(r"[\W\d]+|\*?[PS]\d{5}[A-Z]{1,3}\d*\*?|BLANK PAGE", line.text)
        ]
        if not rows:
            raise ValueError(f"empty Section {section} case page {index + 1}")
        start = next((line.top for line in rows if line.text == heading), rows[0].top)
        image_rects = [
            fitz.Rect(info["bbox"]) for info in page.get_image_info()
            if fitz.Rect(info["bbox"]).height > 18 and fitz.Rect(info["bbox"]).width > 18
            and info["bbox"][1] >= start and info["bbox"][3] < bottom_limit
        ]
        last = max([line.bottom for line in rows] + [rect.y1 for rect in image_rects])
        regions.append(region(index, left, start - 5, right, last + 5))
        credits.extend(line.text for line in rows if re.search(
            r"©|shutterstock|alamy|https?://|\(source|source:", line.text, re.I))
        images.extend(region(index, *rect) for rect in image_rects)
    return {
        "label": f"Section {section} case study",
        "kind": "case",
        "regions": regions,
        "credits": credits,
        "thirdParty": True,
        "images": images,
    }


def case_indexes(doc, start, stop, booklet_pages):
    result = defaultdict(list)
    section = None
    indexes = booklet_pages or range(start + 1, stop)
    for index in indexes:
        text = doc[index].get_text()
        if booklet_pages:
            if re.search(r"Source Booklet\s+Do not return|^\s*BLANK PAGE\s*$", text, re.M):
                continue
            match = re.search(r"^SECTION ([BC])\s*$", text, re.M)
            if match:
                section = match[1]
            if section:
                result[section].append(index)
        else:
            match = re.search(r"^SECTION ([BC])\s*$", text, re.M)
            if match and re.search(r"Read the following extract", text, re.I):
                result[match[1]].append(index)
    return dict(result)


def paper_slices(doc, specimen):
    if specimen:
        yield "01", 10, 30, list(range(30, 33)), list(range(34, 48))
        yield "02", 48, 68, list(range(68, 72)), list(range(72, 84))
        return

    for index in range(min(3, len(doc))):
        cover = doc[index].get_text()
        component = re.search(r"1BS0/(0[12])", cover)
        if component and "Instructions" in cover and "Total Marks" in cover:
            break
    else:
        raise ValueError("question paper cover not found")

    booklet = []
    for page in doc[index + 1:]:
        if re.search(r"Source Booklet\s+Do not return", page.get_text()):
            booklet = list(range(page.number, len(doc)))
            break
    yield component[1], index, (booklet[0] if booklet else len(doc)), booklet, []


def printed_units(doc, cover, stop, specimen, component):
    parts = list(STANDARD_PARTS)
    if specimen:
        parts[5 if component == "01" else 4] = 4
    expected = [
        f"{question}{chr(97 + part)}"
        for question, count in enumerate(parts, 1)
        for part in range(count)
    ]
    margin = 71 if doc[cover].rect.width > 630 else 43
    units = []
    resources = {}
    reference_ids = {}
    audits = []
    for index in range(cover + 1, stop):
        page = doc[index]
        frame = question_frame(page)
        labels = label_words(page, margin)
        if specimen and component == "02" and index == 59:
            # Paper 2 Q5(b) separates its indentation from the other part labels.
            labels.extend(word for word in page.get_text("words")
                          if word[4] == "(b)" and 75 < word[0] < 82)
            labels.sort(key=lambda word: word[1])
        if not labels:
            continue
        rows = [
            line for line in lines_of(page)
            if frame.x0 - 1 <= line.x < frame.x1 and frame.y0 < line.top < frame.y1
        ]
        metadata = []
        for label_index, word in enumerate(labels):
            next_top = labels[label_index + 1][1] if label_index + 1 < len(labels) else frame.y1
            top = word[1]
            label = expected[len(units) + len(metadata)]
            if word[4] != f"({label[1]})":
                raise ValueError(f"page {index + 1}: expected {label}, found {word[4]}")
            same_line = next(
                (row for row in rows
                 if abs(row.top - top) < 2 and row.x <= word[0] + 1
                 and re.match(rf"^(?:{label[0]}\s+)?\({label[1]}\)(?:\s|$)", row.text)),
                None
            )
            if same_line:
                top = same_line.top
            marks = subsequent_marks(rows, top, next_top, margin)
            if len(marks) != 1:
                raise ValueError(f"page {index + 1} part {label}: found tariffs {marks}")
            tariff_index, tariff, score = marks[0]
            metadata.append((label, top, tariff_index, tariff, score))
        previous_end = frame.y0
        for ordinal, (label, top, tariff_index, tariff, marks) in enumerate(metadata):
            next_top = metadata[ordinal + 1][1] if ordinal + 1 < len(metadata) else frame.y1
            question = int(label[0])
            section = section_of(question)
            prefix = [
                row for row in rows if previous_end + 0.5 < row.top < top - 2
                and not (irrelevant(row.text) or BLANK.search(row.text))
            ]
            body = [row for row in rows if top - 1 <= row.top < next_top - 1]
            prompt = [row for row in rows[:tariff_index + 1] if row.top >= top - 1]
            selection = next((SELECT.match(row.text) for row in body if SELECT.match(row.text)), None)
            select_count = {"one": 1, "two": 2}[selection[1].lower()] if selection else None
            tail = [row for row in rows[tariff_index + 1:] if row.top < next_top - 1]
            end = tariff.bottom
            has_options = any(row.text.startswith("Option 1:") for row in prefix)
            if has_options and not any(row.text.startswith("Option 2:") for row in prefix):
                raise ValueError(f"page {index + 1} part {label}: missing second decision")

            if select_count:
                answers = [
                    row for row in tail if margin + 55 <= row.x <= margin + 76
                    and OPTION.match(row.text)
                ]
                choices = [row.text[0] for row in answers]
                if choices not in (list("ABCD"), list("ABCDE")) or select_count != marks:
                    raise ValueError(f"page {index + 1} part {label}: invalid choices {choices}")
                end = max(tariff.bottom, answers[-1].bottom)
                # The option letter and text can be separate source spans.
                end = max(row.bottom for row in body if row.top < end - 1)
                prompt = [row for row in body if row.top < end - 1]
            completion_cells = [row for row in tail
                                if re.match(r"^\((?:i|ii)\)(?:\s|$)", row.text)]
            if len(completion_cells) == 2 and any("Complete the table" in row.text for row in prompt):
                # These cells have one printed tariff. Preserve both cell locations and labels.
                table_bottom = max(row.bottom for row in tail if not irrelevant(row.text))
                ruling = [
                    drawing["rect"].y1 for drawing in page.get_drawings()
                    if table_bottom <= drawing["rect"].y1 <= table_bottom + 13
                    and drawing["rect"].width > 55 and drawing["rect"].height < 1
                ]
                end = max([end, table_bottom, *ruling])
            answer_units = [
                row for row in tail if BLANK.search(row.text)
                and re.search(r"[A-Za-z£€$%]", BLANK.sub("", row.text))
                and row not in completion_cells and row.top >= end - 1
            ]
            answer_unit = answer_units[0] if not select_count and answer_units else None

            ids = [] if section == "A" else [f"case-{section.lower()}"]
            if prefix and not has_options:
                preamble = as_text(prefix)
                names = [f"{kind.title()} {number}" for kind, number in REFERENCE.findall(preamble)]
                captions = [
                    row.text for row in prefix if REFERENCE.fullmatch(row.text)
                ]
                # A figure introduced above the label may be printed below its tariff.
                supplemental = [
                    row.text for row in prompt if REFERENCE.fullmatch(row.text)
                ]
                title = (captions or names or [f"Question {label[0]}({label[1]}) context"])[-1]
                if supplemental and title in supplemental:
                    title += " introduction"
                resource_id = re.sub(r"[^a-z0-9]+", "-", title.lower()).strip("-")
                if resource_id in resources:
                    resource_id += f"-{label}"
                resources[resource_id] = {
                    "label": title,
                    "kind": "figure" if captions else "context",
                    "regions": [band(index, frame, prefix[0].top - 3, top - 3)],
                    "text": preamble,
                    "thirdParty": bool(re.search(r"©|shutterstock|alamy|\bsource\b", preamble, re.I)),
                }
                if captions:
                    reference_ids[title.lower()] = resource_id
                ids.append(resource_id)

            prompt_text = as_text(prefix + prompt if has_options else prompt)
            for kind, number in REFERENCE.findall(prompt_text):
                resource = reference_ids.get(f"{kind} {number}".lower())
                if resource is not None and resource not in ids:
                    ids.append(resource)
            if not select_count and any(re.search(
                    r"\buse (?:your answer|the answer) (?:to|from)\b|\banswer (?:to|in) part\b",
                    row.text, re.I) for row in prompt):
                audits.append({"label": label, "reason": "possible preceding answer dependency"})
            start = prefix[0].top - 3 if has_options else top - 3
            unit = {
                "label": label,
                "section": section,
                "marks": marks,
                "regions": [band(index, frame, start, min(end + 3, next_top - 3))],
                "resources": ids,
                "text": prompt_text,
            }
            if select_count:
                unit["selectCount"] = select_count
            if answer_unit:
                unit["unitText"] = " ".join(BLANK.sub(" ", answer_unit.text).split())
                unit["regions"].append(band(index, frame, answer_unit.top - 2,
                                            answer_unit.bottom + 2))
            if completion_cells:
                unit["completionCells"] = ["i", "ii"]
            if has_options:
                unit["decisionJustification"] = True
            units.append(unit)
            previous_end = answer_unit.bottom if answer_unit else end
    if [unit["label"] for unit in units] != expected:
        raise ValueError("question inventory incomplete")
    return units, resources, audits


def clarification(doc, units):
    for index in range(2):
        notice = lines_of(doc[index])
        if not any(line.text == "Clarification Notice" for line in notice):
            continue
        if not any("question 1(b)" in line.text for line in notice):
            raise ValueError("unknown Pearson clarification notice")
        correction = next(line for line in notice if "is the latest date" in line.text)
        continuation = notice[notice.index(correction) + 1]
        if not continuation.text.startswith("Figure 1?"):
            raise ValueError("incomplete Pearson clarification replacement")
        unit = next(unit for unit in units if unit["label"] == "1b")
        original = unit["regions"][0]
        page = doc[original["page"]]
        frame = question_frame(page)
        label = next(word for word in label_words(page, 43) if word[4] == "(b)")
        tariff = next(line for line in lines_of(page) if line.x > 450 and line.text == "(1)")
        unit["regions"] = [
            region(original["page"], label[0] - 3, label[1] - 3, label[2] + 3, label[3] + 3),
            region(index, correction.x - 3, correction.top + 2, correction.rect.x1 + 3,
                   continuation.bottom + 2),
            band(original["page"], frame, tariff.top + 2, original["rect"][3]),
        ]
        unit["text"] = unit["text"].replace("earliest date", "latest date")
        unit["clarification"] = "Pearson clarification notice E78782A, physical PDF page 1"
        return


def extract(path):
    with fitz.open(path) as doc:
        specimen = "business-sams" in path.name.lower() or path.name.lower() == "sam.pdf"
        sha256 = hashlib.sha256(path.read_bytes()).hexdigest()
        for component, start, stop, booklet, scheme in paper_slices(doc, specimen):
            cover = " ".join(doc[start].get_text().split())
            time = re.search(r"1 hour (30|45) minutes", cover)
            log = re.search(r"\b([PS]\d{5}[A-Z]{1,3})\b", cover)
            if not time or not log or "90" not in cover:
                raise ValueError(f"unrecognisable cover: {path.name} p{start + 1}")
            units, resources, audits = printed_units(doc, start, stop, specimen, component)
            for section, pages in case_indexes(doc, start, stop, booklet).items():
                resources[f"case-{section.lower()}"] = case_resource(doc, section, pages, bool(booklet))
            for unit in units:
                missing = set(unit["resources"]) - set(resources)
                if missing:
                    raise ValueError(f'{unit["label"]} references missing resources {missing}')
            totals = {section: sum(unit["marks"] for unit in units if unit["section"] == section)
                      for section in SECTION_TOTALS}
            if totals != SECTION_TOTALS:
                if specimen:
                    audits.append({"reason": "published specimen tariffs disagree with the cover", "totals": totals})
                else:
                    raise ValueError(f"unexpected section tariffs {totals}")
            if start > 0 and not specimen:
                clarification(doc, units)
            if specimen and component == "02":
                for unit in units:
                    if unit["label"] in {"5b", "5c"}:
                        unit["resources"].append("figure-3")
                audits.append({"label": "5a", "reason":
                    "question tariff 1 mark differs from official scheme tariff 2 marks"})
            if log[1] == "P75525A":
                # Pearson's Q7(e) indicative content refers to regional gym membership.
                unit = next(unit for unit in units if unit["label"] == "7e")
                unit["resources"].append("table-3")
            yield {
                "file": path.name,
                "sha256": sha256,
                "component": component,
                "minutes": 60 + int(time[1]),
                "log": log[1],
                "sourceCoverPage": start,
                "sourceBookletPages": booklet,
                "sampleSchemePages": scheme,
                "specimen": specimen,
                "sectionTotals": totals,
                "units": units,
                "resources": resources,
                "review": audits,
            }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("pdfs", type=Path, nargs="+")
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    result = []
    for pdf in args.pdfs:
        try:
            result.extend(extract(pdf))
        except ValueError as error:
            raise SystemExit(f"{pdf.name}: {error}") from error
    args.output.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n")


if __name__ == "__main__":
    main()
