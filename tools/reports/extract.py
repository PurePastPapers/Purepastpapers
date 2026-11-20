#!/usr/bin/env python3
"""Split official examiner reports into per-question sections for the question bank.

For every published paper of a subject that has an `examiner_report_url`, this reads the
report PDF and writes `data/reports/<slug>/<PAPER_ID>.json`: the report's own words, cut at
its question headings ("Question 3", "Question 3(b)(ii)", "Questions 4 and 5", "Q3a"),
with the page each comment is printed on and a count of example scripts (images) that the
text version cannot show. `js/engine/examiner-report.js` matches those sections to each
question or part at run time, so packs are not rebuilt and no question records change.

The wording is kept as printed (line breaks joined, running headers and footers dropped).
Nothing is summarised or rewritten. Text instead of image crops keeps the site under the
GitHub Pages size limit (docs/SITE-SIZE.md); every section links to its page in the
official PDF for maths notation and example scripts.

Usage
  python3 tools/reports/extract.py --subject maths --fetch            # download, then split
  python3 tools/reports/extract.py --subject physics --pdf-dir ~/pefs # PDFs already saved
  python3 tools/reports/extract.py --subject biology --paper EDX_9BN0_2019_JUNE_01 --show
  python3 tools/reports/extract.py --self-test

PDFs are looked up in --pdf-dir (and the cache) by the file name at the end of the
report URL, e.g. 9PH0_01_pef_20190815.pdf. Needs poppler (pdftohtml, pdfinfo).
"""
import argparse
import hashlib
import json
import os
import re
import subprocess
import sys
import tempfile
import urllib.request
import xml.etree.ElementTree as ET
from collections import Counter, defaultdict
from datetime import date
from pathlib import Path

EXTRACTOR_VERSION = 1
FORMAT = 'examiner-report-text-v1'
REPO = Path(__file__).resolve().parents[2]
CACHE = Path(os.environ.get('PPP_REPORT_CACHE', Path.home() / '.cache' / 'ppp-reports'))

# Subject slug -> pack folder and subject id. A-level History and Geography are planned
# (docs/EXAMINER-REPORTS.md); they need their own heading rules before they are added.
SUBJECTS = {
    'maths': 'EDX_ALEVEL_MATH_9MA0',
    'physics': 'EDX_ALEVEL_PHYS_9PH0',
    'biology': 'EDX_ALEVEL_BIOL_9BN0',
}

ROMAN = r'(?:i{1,3}|iv|vi{0,3}|ix|x)'
PART = rf'\(\s*(?:[a-z]|{ROMAN})\s*\)'
# "(a)(ii)", "(a) (ii)", "(a)ii", "a(ii)", "aii", "(a)(ii)(b)" in one token.
PART_RUN = rf'(?:\s*{PART}|\s*\(\s*[a-z]\s*\)\s*{ROMAN}\b|(?<=\d)[a-z](?:\s*\(\s*{ROMAN}\s*\)|{ROMAN}\b)?)+'
QWORD = r'(?:Questions?|Qu\.?|Q\.?)'
# A heading line: "Question 3", "Question 3 (a)(i)", "Q3ai", "Question 3(a) and (b)",
# "Questions 4 and 5", "Question 6 – Vectors", "Question 1(a)(i) & (ii)".
HEADING = re.compile(
    rf'^{QWORD}\s*(?P<num>\d{{1,2}})(?P<parts>{PART_RUN})?'
    rf'(?P<more>(?:\s*(?:,|&|and|to|–|-)\s*(?:\d{{1,2}}(?:{PART_RUN})?|{PART_RUN}))*)'
    rf'\s*(?P<title>(?:[:–—-]\s*.{{0,60}})?)\s*$',
    re.I,
)
SUBPART = re.compile(rf'^(?P<parts>(?:{PART}\s*)+)\s*$', re.I)
GENERAL_START = re.compile(r'^(Introduction|General [Cc]omments?|Overview|General [Ii]ntroduction)\b')
SUMMARY_START = re.compile(r'^(Paper [Ss]ummary|Summary|Based on (their|the) performance on this paper)')
STOP = re.compile(r'(Grade [Bb]oundaries|Pearson Education Limited\. Registered|Registered company number)')
BULLET = re.compile(r'^\s*(?:[•●▪◦‣·\-–]||)\s+')


def norm_part(text):
    """'(a) (ii)' / 'aii' / 'a(ii)' -> '(a)(ii)'; '' for none."""
    text = re.sub(r'\s+', '', (text or '').lower())
    out = []
    for paren, bare in re.findall(r'\(([a-z]+)\)|([a-z]+)', text):
        if paren:
            out.append(f'({paren})')
        elif not out and len(bare) > 1 and not re.fullmatch(ROMAN, bare) and re.fullmatch(ROMAN, bare[1:]):
            out += [f'({bare[0]})', f'({bare[1:]})']  # "aii" -> (a)(ii)
        else:
            out.append(f'({bare})')
    return ''.join(out)


def parse_heading(text):
    """Return the question/part targets a heading line covers, or None if it is not one."""
    match = HEADING.match(text.strip())
    if not match:
        return None
    number = str(int(match['num']))
    targets = [{'q': number, 'part': norm_part(match['parts'])}]
    more = match['more'] or ''
    for piece in re.split(r'\s*(?:,|&|\band\b|\bto\b|–|-)\s*', more):
        piece = piece.strip()
        if not piece:
            continue
        lead = re.match(r'^(\d{1,2})(.*)$', piece)
        if lead:
            targets.append({'q': str(int(lead[1])), 'part': norm_part(lead[2])})
        else:
            # "Question 3(a) and (b)": a sibling part of the same question. "(a)(i) & (ii)"
            # keeps the parent letter.
            part = norm_part(piece)
            base = targets[-1]['part']
            if re.fullmatch(rf'\({ROMAN}\)', part) and re.match(r'^\([a-z]\)', base) and not re.fullmatch(rf'\({ROMAN}\)', base):
                part = base[:3] + part
            targets.append({'q': targets[-1]['q'], 'part': part})
    # "Questions 4 to 6"
    if re.search(r'\bto\b', more) and len(targets) == 2 and not any(t['part'] for t in targets):
        first, last = int(targets[0]['q']), int(targets[1]['q'])
        if 0 < last - first < 6:
            targets = [{'q': str(n), 'part': ''} for n in range(first, last + 1)]
    return targets


# ---------------------------------------------------------------------------------------
# PDF reading


def run(*args):
    return subprocess.run(args, check=True, capture_output=True, text=True).stdout


def read_layout(pdf):
    """Lines and images per page from pdftohtml -xml (positions in points)."""
    with tempfile.TemporaryDirectory() as tmp:
        out = Path(tmp) / 'r'
        subprocess.run(['pdftohtml', '-xml', '-nodrm', '-hidden', '-q', str(pdf), str(out)], check=True,
                       capture_output=True)
        xml = (Path(tmp) / 'r.xml').read_text(errors='replace')
    xml = re.sub(r'<!DOCTYPE[^>]*>', '', xml)
    root = ET.fromstring(xml)
    fonts, pages = {}, []
    for page in root.iter('page'):
        for spec in page.iter('fontspec'):
            fonts[spec.get('id')] = {'size': float(spec.get('size')), 'family': spec.get('family', '')}
        height, width = float(page.get('height')), float(page.get('width'))
        fragments, images = [], []
        for node in page:
            if node.tag == 'text':
                text = ''.join(node.itertext())
                if not text.strip():
                    continue
                bold = node.find('b') is not None and len(''.join(node.find('b').itertext()).strip()) >= len(text.strip()) * 0.6
                font = fonts.get(node.get('font'), {})
                bold = bold or bool(re.search(r'bold|black|heavy', font.get('family', ''), re.I))
                fragments.append({'top': float(node.get('top')), 'left': float(node.get('left')),
                                  'width': float(node.get('width')), 'height': float(node.get('height')),
                                  'text': text, 'bold': bold, 'size': font.get('size', 0)})
            elif node.tag == 'image':
                images.append({'top': float(node.get('top')), 'left': float(node.get('left')),
                               'width': float(node.get('width')), 'height': float(node.get('height'))})
        pages.append({'number': int(page.get('number')), 'height': height, 'width': width,
                      'lines': merge_lines(fragments), 'images': images})
    return pages


def merge_lines(fragments):
    """Fragments on one baseline (±3 pt) become one line, read left to right."""
    fragments.sort(key=lambda f: (round(f['top']), f['left']))
    lines = []
    for frag in fragments:
        line = lines[-1] if lines else None
        if line and abs(line['top'] - frag['top']) <= 3 and frag['left'] >= line['right'] - 2:
            gap = frag['left'] - line['right']
            line['text'] += ('' if gap < 1.5 or line['text'].endswith(' ') else ' ') + frag['text']
            line['right'] = frag['left'] + frag['width']
            line['bold'] = line['bold'] and frag['bold']
            line['height'] = max(line['height'], frag['height'])
        else:
            lines.append({'top': frag['top'], 'left': frag['left'], 'right': frag['left'] + frag['width'],
                          'height': frag['height'], 'text': frag['text'], 'bold': frag['bold'], 'size': frag['size']})
    for line in lines:
        line['text'] = re.sub(r'\s+', ' ', line['text']).strip()
    return [line for line in lines if line['text']]


def running_lines(pages):
    """Running headers/footers: text (digits ignored) repeated in the top or bottom margin."""
    counts = Counter()
    for page in pages:
        seen = set()
        for line in page['lines']:
            if line['top'] < page['height'] * 0.09 or line['top'] > page['height'] * 0.9:
                seen.add(re.sub(r'\d+', '#', line['text']))
        counts.update(seen)
    floor = max(2, len(pages) * 0.3)
    return {text for text, count in counts.items() if count >= floor}


def is_margin_noise(line, page, running):
    in_margin = line['top'] < page['height'] * 0.09 or line['top'] > page['height'] * 0.9
    if not in_margin:
        return False
    key = re.sub(r'\d+', '#', line['text'])
    return key in running or re.fullmatch(r'(Page\s*)?\d{1,3}(\s*of\s*\d{1,3})?', line['text'], re.I) is not None


def repeated_images(pages):
    """Logos: images at the same place on many pages."""
    counts = Counter()
    for page in pages:
        counts.update({(round(i['top'] / 5), round(i['left'] / 5), round(i['width'] / 5)) for i in page['images']})
    return {key for key, count in counts.items() if count >= max(2, len(pages) * 0.3)}


# ---------------------------------------------------------------------------------------
# Splitting


def split_report(pages):
    running = running_lines(pages)
    logos = repeated_images(pages)
    body_size = Counter(round(l['size']) for p in pages for l in p['lines']).most_common(1)
    body_size = body_size[0][0] if body_size else 11
    blocks = {'general': None, 'summary': None}
    sections, current, stopped = [], None, False

    def start(kind, heading=None, targets=None, page=None):
        nonlocal current
        current = {'kind': kind, 'heading': heading, 'targets': targets or [], 'pages': [], 'lines': [], 'figures': Counter()}
        if kind == 'section':
            sections.append(current)
        else:
            blocks[kind] = current
        return current

    for page in pages:
        if stopped:
            break
        items = [('line', l) for l in page['lines'] if not is_margin_noise(l, page, running)]
        items += [('image', i) for i in page['images']
                  if i['width'] > 60 and i['height'] > 30
                  and (round(i['top'] / 5), round(i['left'] / 5), round(i['width'] / 5)) not in logos]
        items.sort(key=lambda item: item[1]['top'])
        for kind, item in items:
            if kind == 'image':
                if current:
                    current['figures'][page['number']] += 1
                continue
            text = item['text']
            if STOP.search(text):
                stopped = True
                break
            headingish = item['bold'] or item['size'] > body_size + 0.5
            targets = parse_heading(text) if (headingish or len(text) < 30) else None
            if targets and (headingish or not current or current['kind'] != 'section' or text.lower().startswith('q')):
                start('section', heading=text, targets=targets)
            elif headingish and SUMMARY_START.match(text) and sections:
                start('summary', heading=text)
            elif headingish and GENERAL_START.match(text) and not sections:
                start('general', heading=text)
            elif headingish and current and current['kind'] == 'section' and SUBPART.match(text) and len(current['targets']) == 1:
                # A bold "(b)" under "Question 3" starts the comment on 3(b).
                parent = current['targets'][0]
                part = norm_part(text)
                start('section', heading=f"Question {parent['q']}{part}", targets=[{'q': parent['q'], 'part': part}])
            elif current:
                current['lines'].append({**item, 'page': page['number']})

    out = {'sections': []}
    for name in ('general', 'summary'):
        if blocks[name] and blocks[name]['lines']:
            out[name] = finish(blocks[name])
    for index, section in enumerate(sections, 1):
        done = finish(section)
        if not done['paras'] and not done['figures']:
            continue
        out['sections'].append({'id': f's{index}', 'heading': section['heading'], 'targets': section['targets'], **done})
    return out


def finish(block):
    lines = block['lines']
    paras = []
    previous = None
    for line in lines:
        text = line['text']
        bullet = BULLET.match(text)
        gap = (line['top'] - previous['top']) if previous and previous['page'] == line['page'] else None
        new = (previous is None or bullet or (gap is not None and gap > max(previous['height'], line['height']) * 1.6)
               or (gap is not None and gap < 0) or line['bold'] != previous['bold']
               or (previous and previous['page'] != line['page'] and previous['text'].rstrip().endswith(('.', ':', '?'))))
        if new:
            kind = 'li' if bullet else 'h' if line['bold'] and len(text) < 90 else 'p'
            paras.append({'k': kind, 't': BULLET.sub('', text) if bullet else text})
        else:
            last = paras[-1]
            joiner = '' if last['t'].endswith('-') and text[:1].islower() else ' '
            last['t'] = (last['t'] + joiner + text).strip()
        previous = line
    pages = sorted({line['page'] for line in lines} | set(block['figures']))
    return {'pages': pages, 'paras': paras,
            'figures': [{'page': page, 'count': count} for page, count in sorted(block['figures'].items())]}


# ---------------------------------------------------------------------------------------
# Papers and files


def load_papers(slug):
    subject_id = SUBJECTS[slug]
    papers = []
    for path in sorted((REPO / 'data/packs' / slug).glob('*.json')):
        pack = json.loads(path.read_text())
        for paper in pack.get('papers', []):
            if paper.get('subject_id') == subject_id and paper.get('examiner_report_url'):
                papers.append(paper)
    return papers


def locate_pdf(url, pdf_dirs, fetch):
    name = url.rsplit('/', 1)[-1]
    for folder in [*pdf_dirs, CACHE]:
        candidate = Path(folder).expanduser() / name
        if candidate.exists() and candidate.stat().st_size > 1000:
            return candidate
    if not fetch:
        return None
    CACHE.mkdir(parents=True, exist_ok=True)
    target = CACHE / name
    request = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0 (PurePastPapers report import)'})
    with urllib.request.urlopen(request, timeout=180) as response:
        data = response.read()
    if not data.startswith(b'%PDF'):
        raise RuntimeError(f'{url} did not return a PDF')
    target.write_bytes(data)
    return target


def build_paper(paper, pdf, slug):
    pages = read_layout(pdf)
    split = split_report(pages)
    return {
        'format': FORMAT,
        'extractor_version': EXTRACTOR_VERSION,
        'paper_id': paper['paper_id'],
        'subject_id': paper['subject_id'],
        'source_url': paper['examiner_report_url'],
        'source_sha256': hashlib.sha256(pdf.read_bytes()).hexdigest(),
        'source_pages': len(pages),
        'extracted_on': date.today().isoformat(),
        'review_status': 'unreviewed',
        'note': 'Official examiner report text, split at the report\'s own question headings. Not rewritten.',
        **split,
    }


def write_index():
    index = {'format': 'examiner-report-index-v1', 'papers': {}}
    for path in sorted((REPO / 'data/reports').glob('*/*.json')):
        report = json.loads(path.read_text())
        index['papers'][report['paper_id']] = {
            'file': str(path.relative_to(REPO / 'data/reports')),
            'sections': len(report['sections']),
        }
    target = REPO / 'data/reports/index.json'
    target.write_text(json.dumps(index, ensure_ascii=False, indent=1) + '\n')
    return index


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('--subject', choices=sorted(SUBJECTS))
    parser.add_argument('--paper', action='append', default=[], help='only these paper IDs')
    parser.add_argument('--pdf-dir', action='append', default=[], type=Path)
    parser.add_argument('--fetch', action='store_true', help='download reports missing from --pdf-dir and the cache')
    parser.add_argument('--show', action='store_true', help='print the headings found')
    parser.add_argument('--self-test', action='store_true')
    args = parser.parse_args()
    if args.self_test:
        from selftest import run_self_test  # noqa: E402  (tools/reports/selftest.py)
        return run_self_test(sys.modules[__name__])
    if not args.subject:
        parser.error('--subject is required')
    papers = [p for p in load_papers(args.subject) if not args.paper or p['paper_id'] in args.paper]
    missing, failed, written = [], [], 0
    for paper in papers:
        try:
            pdf = locate_pdf(paper['examiner_report_url'], args.pdf_dir, args.fetch)
        except Exception as error:  # network refused, not a PDF, 404
            failed.append((paper['paper_id'], str(error)))
            continue
        if not pdf:
            missing.append(paper['paper_id'])
            continue
        report = build_paper(paper, pdf, args.subject)
        target = REPO / 'data/reports' / args.subject / f"{paper['paper_id']}.json"
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(json.dumps(report, ensure_ascii=False, indent=1) + '\n')
        written += 1
        if args.show:
            print(paper['paper_id'], [s['heading'] for s in report['sections']])
    index = write_index()
    print(f'{args.subject}: {written} reports written, {len(missing)} PDFs not found, {len(failed)} failed; '
          f'{len(index["papers"])} papers in data/reports/index.json')
    for pid, error in failed[:10]:
        print('  failed', pid, error[:120])
    if missing:
        print('  not found (save as the URL\'s file name in --pdf-dir, or use --fetch):', ', '.join(missing[:8]),
              '…' if len(missing) > 8 else '')
    print('Next: node tools/reports/coverage.mjs', args.subject)
    return 0


if __name__ == '__main__':
    sys.path.insert(0, str(Path(__file__).parent))
    sys.exit(main())
