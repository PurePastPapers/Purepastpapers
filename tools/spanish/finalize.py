"""Validate and activate the two Spanish staging outputs in the current checkout."""
import argparse
import base64
from hashlib import sha256
from io import BytesIO
import json
from pathlib import Path
import re

from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
SUBJECT = "AQA_ALEVEL_SPAN_7692"
SLUG = "spanish"
PATTERN = re.compile(r"assets/spanish/([A-Z0-9_]+)/([A-Za-z0-9_]+\.webp)")


def read(path):
    return json.loads(path.read_text(encoding="utf-8"))


def write(path, document, *, compact=False):
    path.parent.mkdir(parents=True, exist_ok=True)
    text = json.dumps(document, ensure_ascii=False, separators=(",", ":")) if compact else json.dumps(
        document, ensure_ascii=False, indent=2)
    path.write_text(text + "\n", encoding="utf-8")


def validate_catalogue(paper, pack, stage, shipped):
    paper_id = paper["paper_id"]
    asset_path = Path(f"data/spanish-assets/{paper_id}.json")
    if shipped:
        catalogue = read(ROOT / asset_path)
    elif (stage / asset_path).is_file():
        catalogue = read(stage / asset_path)
    else:
        raw = stage / f"assets/spanish/{paper_id}"
        catalogue = {
            "paper_id": paper_id,
            "format": "lossless-webp-catalogue-v1",
            "assets": {
                image.name: describe_image(image.read_bytes())
                for image in sorted(raw.glob("*.webp"))
            },
        }
    assert catalogue["paper_id"] == paper_id
    names = set()
    for linked_paper, name in PATTERN.findall(json.dumps(pack, ensure_ascii=False)):
        assert linked_paper == paper_id, (paper_id, linked_paper)
        names.add(name)
    assert catalogue["assets"].keys() == names, (paper_id, names ^ catalogue["assets"].keys())
    for name, data in catalogue["assets"].items():
        actual = describe_image(base64.b64decode(data["base64"], validate=True))
        assert all(data[key] == actual[key] for key in ("width", "height", "sha256")), (paper_id, name)
    return catalogue


def describe_image(data):
    with Image.open(BytesIO(data)) as image:
        image.load()
        assert image.format == "WEBP"
        darkest, lightest = image.convert("L").getextrema()
        assert darkest < 160 < lightest
        return dict(base64=base64.b64encode(data).decode(), sha256=sha256(data).hexdigest(),
                    width=image.width, height=image.height)


def add_spec_section(section):
    path = ROOT / f"data/specs/{SUBJECT}.json"
    text = path.read_text(encoding="utf-8")
    sections = json.loads(text)["sections"]
    current = next((item for item in sections if item["id"] == section["id"]), None)
    if current == section:
        return

    def format_section(item):
        return "\n".join("    " + line for line in json.dumps(item, ensure_ascii=False, indent=2).splitlines())

    addition = format_section(section)
    if current:
        previous = format_section(current)
        assert text.count(previous) == 1
        updated = text.replace(previous, addition, 1)
    else:
        prefix, close = text.rsplit("\n  ]", 1)
        updated = f"{prefix},\n{addition}\n  ]{close}"
    assert json.loads(updated)["sections"][-1] == section
    path.write_text(updated, encoding="utf-8")


def validate_records(pack, base, sources):
    papers = pack["papers"]
    assert len(papers) == 1
    paper = papers[0]
    paper_id = paper["paper_id"]
    original = base[paper_id]
    for key in ("subject_id", "qualification_code", "paper_code", "total_marks", "duration_minutes",
                "full_paper_pdf_url", "full_mark_scheme_pdf_url"):
        assert paper[key] == original[key], (paper_id, key)
    questions = pack["questions"]
    ids = [q["question_id"] for q in questions]
    assert len(set(ids)) == len(ids) and ids == paper["question_ids"], paper_id
    essay = paper["paper_code"] == "P2"
    if essay:
        assert paper["choice_rule"] == "two_distinct_works" and paper["choice_choose"] == [2]
        assert paper["choice_groups"] == [ids]
        assert len(ids) == 32 and all(q["marks"] == 40 and q["work"]["id"] for q in questions)
    else:
        assert sum(q["marks"] for q in questions) == 100, paper_id
    for question in questions:
        provenance = question["provenance"]
        for kind in ("question", "scheme"):
            source = provenance[f"{kind}_source_url"].split("#", 1)[0]
            assert sources[source]["sha256"] == provenance[f"{kind}_source_sha256"], (paper_id, kind)
        context = question.get("context", {})
        assert not context.get("required_stimulus_unavailable"), question["question_id"]
        for resource in context.get("official_resources", ()):
            assert resource["url"].split("#", 1)[0] in sources and resource["kind"] != "transcript"
        assert bool(provenance.get("transcript_source_url")) == any(
            res["kind"] == "audio" for res in context.get("official_resources", ()))
    return paper


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--paper-one", type=Path)
    parser.add_argument("--paper-two", type=Path)
    parser.add_argument("--verify", action="store_true", help="Check the integrated checkout without editing it")
    args = parser.parse_args()
    if not args.verify and not (args.paper_one and args.paper_two):
        parser.error("provide both staging paths when activating the bank")
    base = {item["paper_id"]: item for item in read(ROOT / f"data/papers/{SUBJECT}.json")}
    sources = {item["url"]: item for item in read(ROOT / "data/imports/spanish/official-sources.json")}
    roots = [ROOT] if args.verify else [args.paper_one, args.paper_two]
    index_path = ROOT / "data/packs/index.json"
    index = read(index_path)
    existing = {item["file"]: item for item in index["packs"]}
    releases = {}
    for stage in roots:
        for source in sorted((stage / "data/packs/spanish").glob("*.json")):
            pack = read(source)
            paper = validate_records(pack, base, sources)
            paper_id = paper["paper_id"]
            assert paper_id == source.stem and paper_id not in releases, paper_id
            catalogue = validate_catalogue(paper, pack, stage, args.verify)
            releases[paper_id] = (pack, catalogue)
    assert len(releases) == 14
    print(f"Verified {len(releases)} papers, {sum(len(pack['questions']) for pack, _ in releases.values())} units"
          f" and {sum(len(c['assets']) for _, c in releases.values())} assets.")
    if args.verify:
        assert all(existing[f"{SLUG}/{paper_id}.json"]["subject_id"] == SUBJECT for paper_id in releases)
        return
    for paper_id, (pack, catalogue) in releases.items():
        relative = f"{SLUG}/{paper_id}.json"
        write(ROOT / f"data/packs/{relative}", pack, compact=True)
        write(ROOT / f"data/{SLUG}-assets/{paper_id}.json", catalogue, compact=True)
        if relative not in existing:
            index["packs"].append(dict(file=relative, subject_id=SUBJECT))
    section = read(args.paper_one / "paper-one-spec-section.json")
    add_spec_section(section)
    write(index_path, index)


if __name__ == "__main__":
    main()
