"""Build the AQA 7692 Papers catalogue from a verified official source manifest."""
import argparse
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SUBJECT = "AQA_ALEVEL_SPAN_7692"
SOURCE = "https://www.aqa.org.uk/subjects/spanish/a-level/spanish-7692/assessment-resources"
PAPERS = ROOT / "data" / "papers" / f"{SUBJECT}.json"
MANIFEST = ROOT / "data" / "imports" / "spanish" / "official-sources.json"

COMPONENTS = {
    1: ("Listening, reading and writing", 100, 150),
    2: ("Writing", 80, 120),
    3: ("Speaking", 60, 23),
}
SERIES = [("Sample set 1", None, "Sample set 1", "SAMPLE_1")] + [
    (f"{'November' if year in (2020, 2021) else 'June'} {year}", year,
     "Autumn" if year in (2020, 2021) else "June",
     f"{year}_{'AUTUMN' if year in (2020, 2021) else 'JUNE'}")
    for year in range(2018, 2026)
]


def resource(record):
    name = record["name"].upper()
    title = record["title"].lower()
    if title.startswith("insert:"):
        return "reading_insert", "Reading insert (PDF)"
    if title.startswith("transcript:"):
        return "transcript", "Listening transcript (PDF)"
    if title.startswith("sound file:") and name.endswith(".MP3") and "IRPS" not in name:
        return "listening_audio", "Listening audio (MP3)"
    if title.startswith("sound file: tracked:"):
        return "listening_tracks", "Listening tracks (ZIP)"
    if "candidate material:" in title:
        letter = re.search(r"-CARD([A-L])-", name)
        label = f"Speaking card {letter[1]} (PDF)" if letter else "Speaking stimulus cards (PDF)"
        return f"speaking_card_{letter[1]}" if letter else "speaking_cards", label
    return None


def build(records):
    demo = next(row for row in json.loads(PAPERS.read_text()) if row.get("is_sample"))
    rows = [demo]
    for listing_suffix, year, series, key in reversed(SERIES):
        for component, (title, marks, minutes) in COMPONENTS.items():
            sources = [
                record for record in records
                if record["title"].endswith(f" - {listing_suffix}")
                and re.search(rf"\bPaper {component}\b", record["title"], re.IGNORECASE)
            ]
            if component == 3 and not sources:
                continue
            main_urls = {}
            supplementary = []
            for record in sources:
                kind = record["title"].split(":", 1)[0].lower()
                field = {
                    "question paper": "full_paper_pdf_url",
                    "mark scheme": "full_mark_scheme_pdf_url",
                    "examiner report": "examiner_report_url",
                    "examiners report": "examiner_report_url",
                }.get(kind)
                if field:
                    if field in main_urls:
                        raise ValueError(f"Duplicate {key} paper {component} {field}")
                    main_urls[field] = record["url"]
                extra = resource(record)
                if extra:
                    supplementary.append(dict(kind=extra[0], label=extra[1], url=record["url"]))

            speaking = component == 3
            has_paper = "full_paper_pdf_url" in main_urls
            code = "3T/3V" if speaking else "2R" if key == "2020_AUTUMN" and component == 2 else str(component)
            name = f"{series} {year}" if year else series
            paper = {
                "paper_id": f"AQA_7692_{key}_P{component}",
                "paper_type": "real_past_paper",
                "subject_id": SUBJECT,
                "board": "AQA",
                "level": "A-Level",
                "subject": "Spanish",
                "spec_code": "7692",
                "qualification_code": "7692",
                "year": year,
                "series": series,
                "paper_code": f"P{component}",
                "official_paper_code": f"7692/{code}",
                "tier": None,
                "title": f"{name} Paper {component}: {title}",
                "total_marks": marks,
                "duration_minutes": minutes,
                "question_ids": [],
                "official_source_url": SOURCE,
                "catalogue_generated": not sources,
                "catalogue_verified": bool(sources),
                "full_paper_pdf_url": None,
                "full_mark_scheme_pdf_url": None,
                **main_urls,
            }
            if supplementary:
                paper["assessment_resources"] = sorted(supplementary, key=lambda item: item["kind"])
            if speaking:
                paper["resources_only"] = True
                paper["duration_label"] = "21–23 min"
                paper["duration_note"] = "The assessment includes five minutes of supervised preparation."
                paper["assessment_note"] = (
                    "Practise the stimulus discussion with a partner and use the rubric to review it. "
                    "The second part is a presentation and discussion of your own research project."
                    if has_paper or supplementary else "AQA’s public listing includes the marking rubric and examiner’s "
                    "report for this series. For stimulus discussion practice, use a series with published cards."
                )
            elif not has_paper:
                paper["resources_only"] = True
                paper["assessment_note"] = "AQA’s current public listing does not include this question paper."
            elif component == 2:
                paper["choice_note"] = "Answer two essays on different works. Choose two texts or one text and one film."
            rows.append(paper)
    return rows


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--manifest", type=Path, default=MANIFEST)
    args = parser.parse_args()
    records = json.loads(args.manifest.read_text())
    rows = build(records)
    lines = [json.dumps(row, ensure_ascii=False, separators=(",", ":")) for row in rows]
    PAPERS.write_text("[\n  " + ",\n  ".join(lines) + "\n]\n")


if __name__ == "__main__":
    main()
