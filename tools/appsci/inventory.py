#!/usr/bin/env python3
"""Validate OCR Applied Science source provenance and bundled-document boundaries."""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import shutil
import subprocess
import sys
from pathlib import Path
from urllib.parse import urlparse


ROOT = Path(__file__).resolve().parents[2]
DEFAULT_INVENTORY = ROOT / "data/imports/appsci/source-inventory.json"


def fail(message: str) -> None:
    print(f"ERROR: {message}", file=sys.stderr)
    raise SystemExit(1)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--inventory", type=Path, default=DEFAULT_INVENTORY)
    parser.add_argument(
        "--pdf-dir",
        type=Path,
        help="optional directory of locally downloaded source PDFs; files are matched by URL basename",
    )
    args = parser.parse_args()

    try:
        inventory = json.loads(args.inventory.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        fail(f"cannot read inventory: {exc}")

    sources = inventory.get("sources")
    if not isinstance(sources, list) or not sources:
        fail("inventory must contain a non-empty sources array")

    seen: set[str] = set()
    for source in sources:
        source_id = source.get("id", "<missing-id>")
        if source_id in seen:
            fail(f"duplicate source id {source_id}")
        seen.add(source_id)
        url = source.get("url")
        digest = source.get("sha256", "")
        pages = source.get("pdf_pages")
        if not isinstance(url, str) or not url.startswith("https://www.ocr.org.uk/"):
            fail(f"{source_id}: expected an exact OCR-hosted HTTPS source URL")
        if not re.fullmatch(r"[0-9a-f]{64}", digest):
            fail(f"{source_id}: sha256 must be 64 lowercase hexadecimal characters")
        if not isinstance(pages, int) or pages < 1:
            fail(f"{source_id}: pdf_pages must be a positive integer")

        ranges = source.get("pages", [])
        cursor = 1
        for page_range in ranges:
            start, end = page_range.get("from"), page_range.get("to")
            if start != cursor or not isinstance(end, int) or end < start:
                fail(f"{source_id}: page boundaries must be ordered, contiguous, and start at page 1")
            cursor = end + 1
        if ranges and cursor - 1 != pages:
            fail(f"{source_id}: page boundaries end at {cursor - 1}, PDF has {pages} pages")

        if args.pdf_dir:
            pdf_path = args.pdf_dir / Path(urlparse(url).path).name
            if not pdf_path.is_file():
                fail(f"{source_id}: local PDF not found at {pdf_path}")
            actual = hashlib.sha256(pdf_path.read_bytes()).hexdigest()
            if actual != digest:
                fail(f"{source_id}: SHA-256 mismatch for {pdf_path.name}: {actual}")
            pdfinfo = shutil.which("pdfinfo")
            if pdfinfo:
                result = subprocess.run([pdfinfo, str(pdf_path)], check=True, capture_output=True, text=True)
                match = re.search(r"^Pages:\s+(\d+)$", result.stdout, flags=re.MULTILINE)
                if match and int(match.group(1)) != pages:
                    fail(f"{source_id}: recorded page count {pages}, actual {match.group(1)}")

    jan = next((s for s in sources if s.get("id") == "F181-PRERELEASE-JAN2026"), None)
    if jan is None:
        fail("missing F181 January 2026 pre-release guard record")
    for key in ("matching_live_question_paper", "matching_live_mark_scheme"):
        companion = jan.get(key, {})
        if companion.get("status") != "not_publicly_listed" or companion.get("url") is not None:
            fail(f"F181 January 2026 insert guard invalid: {key}")
    if jan.get("scoreable") is not False or jan.get("coverage_kind") != "series_insert_identity_only":
        fail("F181 January 2026 insert must remain identity-only and non-scoreable")

    for source_id, expected in (("F180-SAM", 39), ("F181-SAM", 27)):
        source = next((s for s in sources if s.get("id") == source_id), None)
        if source is None or sum(p["to"] - p["from"] + 1 for p in source.get("pages", [])) != expected:
            fail(f"{source_id}: bundled document page splits missing or incomplete")

    boundary_source = next((s for s in sources if s.get("id") == "H151-GRADE-BOUNDARIES-JAN2026"), None)
    boundary_path = ROOT / "data/imports/appsci/series-boundaries.json"
    try:
        boundary_data = json.loads(boundary_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        fail(f"cannot read separate series boundary data: {exc}")
    if not boundary_source or boundary_data.get("source_id") != boundary_source["id"]:
        fail("January 2026 grade-boundary PDF must have its own inventory source record")
    if boundary_data.get("source_sha256") != boundary_source.get("sha256") or boundary_data.get("source_pdf_pages") != boundary_source.get("pdf_pages"):
        fail("series boundary data provenance does not match the source inventory")
    if boundary_data.get("series") != "January 2026" or boundary_data.get("qualification_code") != "H151":
        fail("series boundary data must remain scoped to H151 January 2026")
    guard = boundary_data.get("use_guard", "").lower()
    if "sample" not in guard or not any(phrase in guard for phrase in ("another series", "other series")):
        fail("series boundary data must explicitly prohibit sample and cross-series grade inference")
    if {"F180", "F181"} - boundary_data.get("units", {}).keys():
        fail("January 2026 series boundary data must include F180 and F181")
    print(f"Source inventory valid: {len(sources)} official OCR source records")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
