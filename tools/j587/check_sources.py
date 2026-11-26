#!/usr/bin/env python3
"""Cache the verified J587 PDFs outside Git and print their byte provenance."""

import argparse
from hashlib import sha256
import json
from pathlib import Path
import re
import sys
from urllib.request import urlopen

import fitz


ROOT = Path(__file__).resolve().parents[2]
INVENTORY = ROOT / "data/imports/j587/source-inventory.json"


def source_jobs(inventory):
    for sitting in inventory["sittings"]:
        for paper in sitting["components"]:
            for role in ("question_paper", "mark_scheme", "examiner_report"):
                source = paper[role]
                if source and "url" in source:
                    yield paper["paper_id"], paper["component"], role, source

    for paper in inventory["specimens"]:
        component = paper["component"]
        yield f"OCR_J587_SPECIMEN_{component[-2:]}", component, "combined_source", paper["combined_source"]


def page_text(pdf, page_number):
    return re.sub(r"\s+", " ", pdf[page_number - 1].get_text()).upper()


def inspect_pdf(data, component, role, source):
    if not data.startswith(b"%PDF-"):
        raise ValueError("response does not have a PDF header")

    with fitz.open(stream=data, filetype="pdf") as pdf:
        if pdf.page_count != source["pdf_pages"]:
            raise ValueError(f"expected {source['pdf_pages']} pages, found {pdf.page_count}")

        cover = page_text(pdf, source.get("identity_pdf_page", 1))
        if component not in cover:
            raise ValueError(f"cover does not identify {component}")

        if role == "combined_source":
            revision = source["question_paper_version"]
            scheme_page = source["mark_scheme_pdf_pages"][0]
            scheme = page_text(pdf, scheme_page)
            if not re.search(rf"SAMPLE QUESTION PAPER VERSION {re.escape(revision)}(?![\d.])", cover):
                raise ValueError(f"specimen cover does not match version {revision}")
            if component not in scheme or "SAMPLE MARK SCHEME" not in scheme:
                raise ValueError(f"specimen mark scheme cover did not match on PDF page {scheme_page}")
        elif source["printed_identity"].upper() not in cover:
            raise ValueError(f"cover is missing {source['printed_identity']!r}")

        if role in {"question_paper", "combined_source"} and "THE TOTAL MARK FOR THIS PAPER IS 60" not in cover:
            raise ValueError("booklet cover does not verify the 60-mark tariff")


def check_source(cache, paper_id, component, role, source):
    path = cache / f"{paper_id}-{role}.pdf"
    cached = path.is_file()
    if cached:
        data = path.read_bytes()
    else:
        with urlopen(source["url"], timeout=45) as response:
            data = response.read()
    inspect_pdf(data, component, role, source)
    if not cached:
        temporary = path.with_suffix(".pdf.part")
        temporary.write_bytes(data)
        temporary.replace(path)
    return {
        "paper_id": paper_id,
        "component": component,
        "role": role,
        "url": source["url"],
        "cache_file": path.name,
        "pdf_pages": source["pdf_pages"],
        "bytes": len(data),
        "sha256": sha256(data).hexdigest(),
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--cache-dir", type=Path, required=True)
    parser.add_argument("--paper", help="Limit the check to one paper ID")
    args = parser.parse_args()
    cache = args.cache_dir.expanduser().resolve()
    if cache == ROOT or ROOT in cache.parents:
        parser.error("--cache-dir must be outside the repository")

    inventory = json.loads(INVENTORY.read_text(encoding="utf-8"))
    jobs = [job for job in source_jobs(inventory) if not args.paper or job[0] == args.paper]
    if not jobs:
        parser.error(f"unknown paper ID {args.paper!r}")
    cache.mkdir(parents=True, exist_ok=True)

    verified = []
    failed = []
    for paper_id, component, role, source in jobs:
        try:
            verified.append(check_source(cache, paper_id, component, role, source))
        except (OSError, RuntimeError, ValueError) as exc:
            failed.append({"paper_id": paper_id, "role": role, "url": source["url"], "error": str(exc)})
    json.dump({"verified": verified, "failed": failed}, sys.stdout, indent=2)
    print()
    return int(bool(failed))


if __name__ == "__main__":
    sys.exit(main())
