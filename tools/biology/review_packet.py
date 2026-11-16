#!/usr/bin/env python3
"""Prepare model-review packets for Biology candidates (development only).

For each paper writes RESEARCH/packets/<paper_id>/:
  worksheet.md  question text (positioning text layer, for tagging only), the
                ordered original tariffs with labels and marks, and the matching
                mark-scheme text;
  Qnn.png       the full source question rendering for figures, micrographs,
                graphs and tables (inspect when the text layer is insufficient);
and RESEARCH/packets/spec-reference.md listing every official runtime ID.
Published questions are always source pixels; this text is never published.
"""
import argparse
import importlib.util
import json
import sys
from pathlib import Path

import pdfplumber

sys.path.insert(0, str(Path(__file__).resolve().parent))
from schemes import scheme_regions  # noqa: E402

_spec = importlib.util.spec_from_file_location('qbank_render', Path(__file__).resolve().parents[1] / 'maths' / 'render.py')
_render = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_render)


def spec_reference(repo, out):
    spec = json.loads((repo / 'data/specs/EDX_ALEVEL_BIOL_9BN0.json').read_text())
    lines = ['# Biology A official runtime IDs (tag only with these)', '',
             'Year 12 = Topics 1-4 and CP1-CP10 region; Year 13 = Topics 5-8. Maths skills are prerequisites unless the',
             'maths itself is what the marks assess. Never use EDX_BIOL_T* legacy IDs.', '']
    for section in spec['sections']:
        if section.get('legacy'):
            continue
        lines.append(f"## {section['title']}")
        for topic in section['topics']:
            lines.append(f"### {topic['title']}")
            for point in topic['points']:
                lines.append(f"- `{point['id']}` ({point['code']}): {point.get('full_text') or point['title']}")
        lines.append('')
    (out / 'spec-reference.md').write_text('\n'.join(lines) + '\n')


def scheme_text(ms_path, regions):
    chunks = []
    with pdfplumber.open(ms_path) as doc:
        for region in regions:
            page = doc.pages[region['page'] - 1]
            x0, top, x1, bottom = region['bbox']
            crop = page.crop((x0 * page.width, top * page.height, x1 * page.width, bottom * page.height))
            chunks.append(crop.extract_text(layout=False) or '')
    return '\n'.join(chunks).strip()


def packet(paper, candidate_path, sources, out, render_scale):
    candidate = json.loads(candidate_path.read_text())
    pid = paper['paper_id']
    target = out / pid
    target.mkdir(parents=True, exist_ok=True)
    ms = sources / f'{pid}__mark_scheme.pdf'
    schemes = scheme_regions(ms, len(candidate['questions']))
    renderer = _render.SourceRenderer(sources / f'{pid}__question_paper.pdf', scale=render_scale)
    article = paper['documents'].get('pre_release_article') or {}
    lines = [f"# {pid}: {paper['qualification_code']} {paper['series']} {paper['year']} Paper {int(paper['component'])} "
             f"({paper['component_title']})", '',
             f"Source SHA256: {candidate['source_sha256']}  ", f"Total: {candidate['total_marks']} marks; "
             f"{len(candidate['questions'])} questions. {'AS paper: every unit is Year 12 content.' if paper['is_as'] else ''}",
             f"Pre-release article: {article.get('availability', 'n/a')}" if paper['component'] == '03' and not paper['is_as'] else '',
             f"OCR-positioned pages (image-only source; check crops): {candidate['ocr_pages']}" if candidate.get('ocr_pages') else '',
             f"Official erratum pages: {candidate['erratum_pages']}" if candidate.get('erratum_pages') else '', '']
    for question in candidate['questions']:
        number = question['number']
        image = target / f"Q{int(number):02}.png"
        if not image.exists():
            renderer.render(question['regions'], image)
        lines += [f"## Question {number} ({question['marks']} marks){' [starred extended response]' if question.get('extended_response_marker') else ''}",
                  f"Image: {image.name}", '', 'Original tariffs (each must appear in exactly one unit, by label):']
        for i, part in enumerate(question['parts']):
            lines.append(f"  {i}. `{part['part_label'] or '(whole question)'}` = {part['marks']} mark(s)"
                         f"{' — extended response (levels-marked)' if part.get('extended_response') else ''}")
        lines += ['', '### Question text (text layer; figures not shown)', '```', question['text'], '```', '',
                  '### Mark scheme text', '```', scheme_text(ms, schemes[number]), '```', '']
    (target / 'worksheet.md').write_text('\n'.join(l for l in lines if l is not None) + '\n')
    return target


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--inventory', type=Path, action='append', required=True)
    parser.add_argument('--candidates', type=Path, required=True)
    parser.add_argument('--sources', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--repo', type=Path, default=Path.cwd())
    parser.add_argument('--paper', action='append')
    parser.add_argument('--scale', type=float, default=1.0)
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=True)
    spec_reference(args.repo.resolve(), args.output)
    for inventory in args.inventory:
        for paper in json.loads(inventory.read_text())['papers']:
            if args.paper and paper['paper_id'] not in args.paper:
                continue
            candidate = args.candidates / f"{paper['paper_id']}.json"
            if candidate.exists():
                print(packet(paper, candidate, args.sources, args.output, args.scale), flush=True)


if __name__ == '__main__':
    main()
