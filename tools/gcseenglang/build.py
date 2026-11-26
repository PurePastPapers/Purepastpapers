#!/usr/bin/env python3
"""Build AQA 8700 packs from reviewed public PDF editions and page scopes."""

import argparse
from hashlib import sha256
from html import escape
import json
from pathlib import Path
import re

import fitz

ROOT = Path(__file__).resolve().parents[2]
SLUG = "gcseenglang"
SUBJECT = "AQA_GCSE_ENGLANG_8700"
TITLES = {1: "Explorations in creative reading and writing", 2: "Writers' viewpoints and perspectives"}
TARIFFS = {1: (4, 8, 8, 20, 40), 2: (4, 8, 12, 16, 40)}
OBJECTIVES = {1: ("AO1", "AO2", "AO2", "AO4"), 2: ("AO1", "AO1", "AO2", "AO3")}
DIFFICULTIES = ("easy", "medium", "medium", "hard", "hard")


def read(path):
    return json.loads(path.read_text())


def write(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n")


def source(cache, review, component):
    data = (cache / review["filename"]).read_bytes()
    if not data.startswith(b"%PDF-") or sha256(data).hexdigest() != review["sha256"]:
        raise ValueError(f"{review['filename']}: PDF bytes differ from reviewed edition")
    pdf = fitz.open(stream=data, filetype="pdf")
    printed_code = re.compile(rf"8700\s*/\s*{component}$", re.M)
    first = pdf[0].get_text().strip()
    identity_text = first or pdf[1].get_text()
    if len(pdf) != review["pdf_pages"] or not printed_code.search(re.sub(r"[ \t]+$", "", identity_text, flags=re.M)):
        raise ValueError(f"{review['filename']}: unexpected component or page count")
    if not review["url"].startswith(("https://www.aqa.org.uk/files/", "https://filestore.aqa.org.uk/", "https://cdn.sanity.io/files/p28bar15/green/")):
        raise ValueError(f"{review['filename']}: expected a public AQA link")
    return pdf


def checked_pages(pdf, pages):
    if not pages or not all(0 < number <= len(pdf) for number in pages):
        raise ValueError(f"Invalid PDF pages: {pages}")
    if pages != list(range(pages[0], pages[-1] + 1)):
        raise ValueError(f"Noncontinuous PDF pages: {pages}")
    if any(pdf[number - 1].rotation or not pdf[number - 1].get_text().strip() for number in pages):
        raise ValueError(f"Unexpected rotation or empty text: {pages}")
    return "\n".join(pdf[number - 1].get_text() for number in pages)


def question_labels(page):
    words = [(x0, y0, text) for x0, y0, _, _, text, *_ in page.get_text("words") if 42 < x0 < 112]
    labels = []
    for x, y, text in words:
        if x < 85 and re.fullmatch(r"0[1-5]", text):
            labels.append(int(text))
        if x >= 85 or text != "0":
            continue
        for right_x, right_y, digit in words:
            if 8 < right_x - x < 25 and abs(y - right_y) < 2 and re.fullmatch(r"[1-5]", digit):
                # A specimen Q1 sub-item has a separately printed decimal suffix.
                if not any(abs(y - word[1]) < 2 and word[0] > right_x and word[2] == "." for word in words):
                    labels.append(int(digit))
    return labels


def assess(pdf, pages, index, tariff, *, multiple_choice=False):
    text = checked_pages(pdf, pages)
    labels = question_labels(pdf[pages[0] - 1])
    if labels != [index]:
        raise ValueError(f"Expected sole opening label Q{index} on PDF page {pages[0]}: {labels}")
    marks = [int(value) for value in re.findall(r"\[(\d+) marks?\]", text)]
    expected = [1, 1, 1, 1] if multiple_choice else [tariff]
    if marks != expected:
        raise ValueError(f"Q{index}: expected printed tariffs {expected}, found {marks}")
    return text


def page_url(document, page):
    return f"{document['url']}#page={page}"


def unit(cache_sources, paper, record, index, review):
    number = int(paper["component"][-1])
    marks = TARIFFS[number][index - 1]
    qp, ms = cache_sources["question_paper"], cache_sources["mark_scheme"]
    prompt_pages = review["question_pdf_pages"]
    scheme_pages = review["scheme_pdf_pages"]
    prompt = assess(qp, prompt_pages, index, marks, multiple_choice=number == 1 and index == 1 and paper["year"] is None)
    scheme = assess(ms, scheme_pages, index, marks)
    source_records = record["sources"]
    page_label = str(prompt_pages[0])
    if len(prompt_pages) > 1:
        page_label += f"–{prompt_pages[-1]}"
    resources = [{
        "kind": "question_pdf",
        "label": f"Open the official Question {index} (PDF page{'s' if len(prompt_pages) > 1 else ''} {page_label})",
        "url": page_url(source_records["question_paper"], prompt_pages[0]),
    }]
    for item in review.get("sources", []):
        pages = item["insert_pdf_pages"]
        text = checked_pages(cache_sources["insert"], pages)
        if not re.search(rf"^Source {item['source_label']}\s*$", text, re.M):
            raise ValueError(f"Q{index}: missing Source {item['source_label']} on insert pages {pages}")
        if item.get("printed_line_range") and item["printed_line_range"] not in re.sub(r"\s+", " ", prompt):
            raise ValueError(f"Q{index}: unexpected line range")
        if re.search(r"(?:not been|not|cannot be) reproduced here", text, re.I):
            raise ValueError(f"Q{index}: release removes the required source")
        if match := re.fullmatch(r"lines? (\d+) to (\d+|the end)", item.get("printed_line_range") or ""):
            labels = {int(word) for page in pages for x, _, _, _, word, *_ in cache_sources["insert"][page - 1].get_text("words")
                      if x < 71 and word.isdecimal()}
            if not labels or not all(min(labels) <= int(marker) <= max(labels) for marker in match.groups() if marker.isdecimal()):
                raise ValueError(f"Q{index}: required line marker absent from the verified pages")
        resources.append({
            "kind": "insert_pdf",
            "label": f"Source {item['source_label']} · {item['description']}",
            "url": page_url(source_records["insert"], pages[0]),
        })
    if index < 5 and not review.get("sources"):
        raise ValueError("Reading questions require a verified insert")
    prompt_html = ""
    scheme_html = ""
    if index == 5:
        ao5, ao6 = review["ao5_pdf_pages"], review["ao6_pdf_pages"]
        if not all(term in scheme.lower() for term in ("24 marks", "16 marks", "content and organisation", "technical accuracy")):
            raise ValueError("Question 5 must preserve both writing objectives")
        for pages, objective in ((ao5, "AO5"), (ao6, "AO6")):
            if objective not in checked_pages(ms, pages) or not set(pages) <= set(scheme_pages):
                raise ValueError(f"Unmatched {objective} marking pages")
        if number == 2:
            # The Paper 2 writing statement and instruction are self-contained
            # AQA material. Preserve those paragraphs in Practice and exports.
            normalized = re.sub(r"\s+", " ", prompt)
            writing = re.search(
                r"\b0\s+5\s+(.+?)\s+(Write .+?)\s*\(24 marks for content and organisation\s+"
                r"16 marks for technical accuracy\)\s*\[40 marks\]", normalized)
            if writing is None:
                raise ValueError(f"{paper['paper_id']}: could not isolate the exact writing statement and task")
            prompt_html = "".join(f"<p>{escape(paragraph)}</p>" for paragraph in writing.groups())
            prompt_html += "<p>24 marks for content and organisation. 16 marks for technical accuracy.</p>"
        content_pages = str(ao5[0]) if len(ao5) == 1 else f"{ao5[0]}–{ao5[-1]}"
        accuracy_pages = str(ao6[0]) if len(ao6) == 1 else f"{ao6[0]}–{ao6[-1]}"
        scheme_html = (
            '<p>Use the two levels grids in the official PDF to mark this 40-mark answer.</p><ul>'
            f'<li>AO5 content and organisation (24 marks) · PDF {content_pages}</li>'
            f'<li>AO6 technical accuracy (16 marks) · PDF {accuracy_pages}</li></ul>'
        )
        # The revised specimen uses a publisher-hosted photo. Keep the exact two
        # alternatives and their photo on the original page.
        if number == 1:
            if not qp[prompt_pages[0] - 1].get_image_info() or re.search(r"is not reproduced|removed for copyright", prompt, re.I):
                raise ValueError("Missing the official writing stimulus image")
            if paper["year"] is None and "opening of a story" not in prompt:
                raise ValueError("Missing specimen Q5 photograph or narrative opening")
            resources[0]["label"] += " · both writing options and the " + ("optional picture" if paper["year"] is None else "picture")
    identity = {key: paper[key] for key in ("subject_id", "subject", "board", "level", "spec_code",
                                             "qualification_code", "component", "year", "series")}
    if paper.get("is_official_sample"):
        identity["is_official_sample"] = True
    tag = f"P{number}WRITE_B.1" if index == 5 else f"P{number}READ_A.{index}"
    return {
        **identity,
        "question_id": f"{paper['paper_id']}_Q{index:02d}",
        "paper_id": paper["paper_id"],
        "source_type": "real_past_paper",
        "question_number": str(index),
        "section": "B" if index == 5 else "A",
        "marks": marks,
        "estimated_minutes": (5, 8, 12, 20, 45)[index - 1],
        "difficulty": DIFFICULTIES[index - 1],
        "extended_response": index != 1,
        "include_in_custom_pool": True,
        "primary_spec_points": [f"AQA_GCSE_ENGLANG_{tag}"],
        "crossover_spec_points": [],
        "assessment_objectives": ["AO5", "AO6"] if index == 5 else [OBJECTIVES[number][index - 1]],
        "preview_text": review["description"],
        "scheme_scope": "whole_question",
        "scheme_question_number": str(index),
        "context": {"official_resources": resources, "official_scheme_required": True},
        "content": {"question_html": prompt_html, "mark_scheme_html": scheme_html},
        "provenance": {
            "review_status": "source_matched",
            "question_source_url": source_records["question_paper"]["url"],
            "question_source_sha256": source_records["question_paper"]["sha256"],
            "question_pdf_pages": prompt_pages,
            "scheme_source_url": page_url(source_records["mark_scheme"], scheme_pages[0]),
            "scheme_source_sha256": source_records["mark_scheme"]["sha256"],
            "scheme_pdf_pages": scheme_pages,
            "required_source_scope": review.get("sources", []),
        },
    }


def build(cache, record):
    number = int(record["component"][-1])
    sources = record["sources"]
    cache_sources = {role: source(cache, source_record, number) for role, source_record in sources.items()}
    paper = {
        "paper_id": record["paper_id"],
        "paper_type": "real_past_paper",
        "subject_id": SUBJECT,
        "subject": "English Language",
        "board": "AQA",
        "level": "GCSE",
        "spec_code": "8700",
        "qualification_code": "8700",
        "component": record["component"],
        "year": record["year"],
        "series": record["series"],
        "title": f"{record['title_prefix']} · {TITLES[number]}",
        "paper_code": f"P{number}",
        "tier": None,
        "total_marks": 80,
        "duration_minutes": 105,
        "official_source_url": "https://www.aqa.org.uk/subjects/english/gcse/english-8700/assessment-resources",
        "full_paper_pdf_url": sources["question_paper"]["url"],
        "full_mark_scheme_pdf_url": sources["mark_scheme"]["url"],
    }
    if record["year"] is None:
        paper["is_official_sample"] = True
    questions = [unit(cache_sources, paper, record, int(index), review) for index, review in sorted(record["questions"].items())]
    covered = {q["question_number"] for q in questions}
    excluded = [{"question_number": str(i), "marks": marks, "reason": record["excluded"][str(i)]}
                for i, marks in enumerate(TARIFFS[number], 1) if str(i) not in covered]
    available = sum(q["marks"] for q in questions)
    if available + sum(q["marks"] for q in excluded) != 80:
        raise ValueError(f"{record['paper_id']}: tariffs do not reconcile")
    paper.update(question_ids=[q["question_id"] for q in questions], available_marks=available,
                 incomplete=bool(excluded), coverage_status="partial" if excluded else "complete")
    if excluded:
        paper["practice_coverage_note"] = f"{available} of 80 marks available. " + " ".join(
            f"Q{q['question_number']}: {q['reason']}" for q in excluded)
        paper["excluded_questions"] = excluded
    return {"pack_id": record["paper_id"].lower(), "papers": [paper], "questions": questions}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("public_pdf_directory", type=Path)
    args = parser.parse_args()
    manifest = read(ROOT / f"data/imports/{SLUG}/reviewed-papers.json")
    packs = [build(args.public_pdf_directory, record) for record in manifest["papers"]]
    index_path = ROOT / "data/packs/index.json"
    index = read(index_path)
    index["packs"] = [entry for entry in index["packs"] if entry.get("subject_id") != SUBJECT]
    for pack in packs:
        relative = f"{SLUG}/{pack['papers'][0]['paper_id']}.json"
        write(ROOT / "data/packs" / relative, pack)
        index["packs"].append({"file": relative, "subject_id": SUBJECT})
    write(index_path, index)
    print(f"Built {len(packs)} packs, {sum(len(pack['questions']) for pack in packs)} scored questions")


if __name__ == "__main__":
    main()
