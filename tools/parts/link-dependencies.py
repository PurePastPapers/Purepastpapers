#!/usr/bin/env python3
"""Link parts whose printed wording uses an earlier part (owner rule, 2026-11-20).

A part that needs an earlier part's answer or result is offered together with it as one
linked question (js/engine/linked-parts.js): one card, the marks added together, and the
topic filter requires every part's spec point under "Only these points" while "Include
crossover questions" offers it from any of them. The link is `depends_on_question_ids`.

Few banks recorded these links (A-level Biology 1, Chemistry 3, Computer Science 0), so this
tool reads each part's own printed crop with tesseract and adds a link when the wording
names an earlier part of the same question:

* "your answer to (b)(i)", "in part (a)", "the value you calculated in (c)", and AQA's
  "your answer to 01.2" / "Question 02.3": the named part;
* "the value you calculated" / "your answer above" with no label: the part just before;
* an earlier "Show that ..." part whose value refine.py found used (provenance reason
  'earlier "show that" result'), even when the wording does not name it.

It never removes a link, never adds one listed in drop-false-dependencies.py, and never
links a part to itself or to a later part. "Give your answer to two decimal places", "State
the unit with your answer" and "to help with your answer" are instructions, not links.

    python3 tools/parts/link-dependencies.py [--dry-run] [--slug physics ...] [--report out.json]
"""
import argparse, base64, importlib.util, io, json, re, subprocess
from collections import defaultdict
from concurrent.futures import ProcessPoolExecutor
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
TODAY = '2026-11-20'

FALSE = set(re.findall(r"'([A-Z0-9_a-z]+)'", (ROOT / 'tools/parts/drop-false-dependencies.py').read_text().split('changed = 0')[0]))
MATHS_REVIEW = ROOT / 'data/imports/maths/part-display-overrides.json'
REVIEWED_NON_DEPENDENCIES = {
    qid: set(entry.get('remove_dependencies', []))
    for qid, entry in json.loads(MATHS_REVIEW.read_text()).items()
} if MATHS_REVIEW.exists() else {}
REVIEWED_NON_DEPENDENCIES.update({
    # The Big O explanation does not use the earlier calculation.
    'OCR_H446_SAMPLE_02_Q10_d_ii': {'OCR_H446_SAMPLE_02_Q10_d_i'},
    # The later part needs the printed signature of countRow, not the student's implementation.
    'OCR_H446_2021_NOVEMBER_02_Q08_b_iv': {'OCR_H446_2021_NOVEMBER_02_Q08_b_i'},
})


LABEL = r"(\([a-h]\)(?:\s*\([ivx]+\))?|\([ivx]+\)|0?\d\s?\.\s?\d)"
NAMED = re.compile(
    r"(?:your |the )?answers? (?:to|from|in|for) (?:part |question )?" + LABEL + "|"
    r"(?:in |from |of |to )?(?:part|question)s? " + LABEL + "|"
    r"(?:value|result|answer|calculation|figure|equation|expression|graph)s? (?:you |that you )?"
    r"(?:calculated|found|worked out|gave|obtained|derived|wrote|drew|plotted|showed) (?:in|for) (?:part |question )?" + LABEL + "|"
    r"(?:use|using) (?:the |your )?(?:value|result|answer|calculation|data)s? (?:from|in|of|to) (?:part |question )?" + LABEL,
    re.I)
# Only second-person wording: "the value you calculated", "your answer above". "Explain the
# results obtained" names data printed in the question, not an earlier answer.
GENERIC = re.compile(
    r"(?:value|result|answer|number|expression|equation)s? (?:that )?you (?:calculated|found|worked out|obtained|derived|gave)"
    r"(?! (?:in|for) (?:part|question))|your (?:previous )?answer above|from your previous answer", re.I)
INSTRUCTION = re.compile(r"(give|state|write|show) (?:your |the )?(?:answer|unit|working)|to help (?:you )?with your answer|"
                         r"explain your answer|justify your answer|answer to \d+ (?:significant|decimal)", re.I)
SHOW_THAT = re.compile(r"(?:^|[.)]\s+|\s{2,})Show that\b[^.]{0,160}?\d", re.M)
SAME_PART = re.compile(r"\b(plot|draw|sketch|complete)\b[^.]{0,60}\b(graph|diagram|table|line|curve)", re.I)


def ocr(asset):
    image = Image.open(io.BytesIO(base64.b64decode(asset['base64']))).convert('L')
    big = image.resize((image.width * 2, image.height * 2))
    buf = io.BytesIO()
    big.save(buf, 'PNG')
    text = subprocess.run(['tesseract', '-', '-', '--psm', '4'], input=buf.getvalue(),
                          capture_output=True).stdout.decode(errors='ignore')
    return ' '.join(text.split())


def norm(label):
    """'(b)(i)' → '(b)(i)'; AQA '0 1 . 2' / '1.2' → '1.2'."""
    label = re.sub(r'\s+', '', (label or '').lower())
    m = re.fullmatch(r'0?(\d)\.(\d)', label)
    return f'{m.group(1)}.{m.group(2)}' if m else label


def letter(label):
    m = re.match(r'\(([a-h])\)', norm(label))
    return m.group(1) if m else None


def matches(sibling_label, named, own_label):
    """'(b)(i)' names (b)(i); '(b)' names (b) or its sub-parts; a bare '(i)' names (i) of
    the reader's own letter ("part (i)" in (b)(ii) is (b)(i), not (a)(i))."""
    s = norm(sibling_label)
    if s == named:
        return True
    if re.fullmatch(r'\([ivx]+\)', named):
        return s.endswith(named) and letter(sibling_label) == letter(own_label)
    return named.startswith('(') and s.startswith(named)


def process(job):
    path, dry = job
    pack = json.loads(Path(path).read_text())
    slug = Path(path).parent.name
    catalogue = None
    groups = defaultdict(list)
    for q in pack['questions']:
        groups[q.get('parent_question_id')].append(q)
    out = defaultdict(list)
    changed = False
    for parent, units in groups.items():
        if not parent or len(units) < 2:
            continue
        units.sort(key=lambda q: q['question_id'])
        texts = {}

        def text_of(u):
            if u['question_id'] not in texts:
                nonlocal catalogue
                if catalogue is None:
                    catalogue = json.loads((ROOT / 'data' / f'{slug}-assets' / f"{pack['papers'][0]['paper_id']}.json").read_text())['assets']
                name = ((u.get('content') or {}).get('question_image_url') or '').rsplit('/', 1)[-1]
                texts[u['question_id']] = ocr(catalogue[name]) if name in catalogue else ''
            return texts[u['question_id']]

        for i, u in enumerate(units):
            if i == 0 or u['question_id'] in FALSE:
                continue
            text = text_of(u)
            found = {}
            clean = INSTRUCTION.sub(' ', text)
            for m in NAMED.finditer(clean):
                label = norm(next(g for g in m.groups() if g))
                for earlier in units[:i]:
                    if matches(earlier.get('part_label'), label, u.get('part_label')):
                        found[earlier['question_id']] = f'wording names {earlier.get("part_label")}: "{m.group(0)}"'
            if not found and GENERIC.search(clean) and not SAME_PART.search(clean):
                m = GENERIC.search(clean)
                found[units[i - 1]['question_id']] = f'wording uses the answer before it: "{m.group(0)}"'
            reasons = (u.get('provenance') or {}).get('context_reasons') or []
            if any(r.lower().startswith('earlier "show that" result') for r in reasons):
                for j, earlier in enumerate(units[:i]):
                    # The command itself ("Show that the resistance ... is about 50 ohms"): a
                    # sentence starting "Show that" and giving a value. "Describe the test to
                    # show that a gas is oxygen" is not one. The part using it is in the same
                    # lettered part or straight after it.
                    near = j == i - 1 or (letter(earlier.get('part_label')) and letter(earlier.get('part_label')) == letter(u.get('part_label')))
                    m = SHOW_THAT.search(text_of(earlier))
                    value = re.search(r'(?:about|approximately|is|are|be)\s+(\d+(?:\.\d+)?)', m.group(0)) if m else None
                    # a later part that prints the value itself does not need the earlier one
                    # (9PH0 June 2019 Q11(c): "a horizontal velocity of 3.0 m s-1")
                    restated = value and re.search(r'(?<![\d.])' + re.escape(value.group(1).rstrip('0').rstrip('.')) + r'(?:\.0+)?(?![\d])', text)
                    if near and m and not restated:
                        found.setdefault(earlier['question_id'], 'uses the value of an earlier "Show that" part')
            # links this tool added before are re-derived, so a corrected rule also removes them
            pv0 = u.get('provenance') or {}
            mine = set(pv0.get('dependency_detected') or {}) if pv0.get('dependency_detected_on') == TODAY else set()
            current = [qid for qid in (u.get('depends_on_question_ids') or []) if qid not in mine]
            if mine and not dry:
                if current:
                    u['depends_on_question_ids'] = current
                else:
                    u.pop('depends_on_question_ids', None)
                pv0.pop('dependency_detected', None)
                pv0.pop('dependency_detected_on', None)
                if pv0.pop('context_from_linked_part', None):
                    (u.get('context') or {}).pop('stem_image_url', None)
                changed = True
            denied = REVIEWED_NON_DEPENDENCIES.get(u['question_id'], set())
            new = [qid for qid in found if qid not in current and qid not in denied]
            if not new:
                continue
            for qid in new:
                out['added'].append(f"{u['question_id']} -> {qid}: {found[qid]}")
            if not dry:
                u['depends_on_question_ids'] = current + new
                pv = u.setdefault('provenance', {})
                ctx = u.setdefault('context', {})
                if not ctx.get('stem_image_url') and not ctx.get('shared_stem_html'):
                    # A dependent part carries the earlier information it uses (validate rule);
                    # in practice it is shown inside its linked question with that part.
                    earlier = next(x for x in units if x['question_id'] == new[0])
                    ctx['stem_image_url'] = earlier['content']['question_image_url']
                    pv['context_from_linked_part'] = new[0]
                pv['dependency_detected'] = {qid: found[qid] for qid in new}
                pv['dependency_detected_on'] = TODAY
                changed = True
    if changed:
        Path(path).write_text(json.dumps(pack, ensure_ascii=False, indent=2) + '\n')
    return dict(out)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--dry-run', action='store_true')
    ap.add_argument('--slug', action='append')
    ap.add_argument('--report', type=Path)
    a = ap.parse_args()
    slugs = a.slug or sorted(p.name for p in (ROOT / 'data/packs').iterdir() if p.is_dir())
    jobs = [(str(p), a.dry_run) for s in slugs for p in sorted((ROOT / 'data/packs' / s).glob('*.json'))]
    report = defaultdict(list)
    with ProcessPoolExecutor() as ex:
        for r in ex.map(process, jobs):
            for k, v in r.items():
                report[k] += v
    per = defaultdict(int)
    for line in report['added']:
        per[line.split('_')[1]] += 1
    print(f"{len(report['added'])} links {'would be ' if a.dry_run else ''}added", dict(sorted(per.items())))
    if a.report:
        a.report.write_text(json.dumps(report, indent=1))


if __name__ == '__main__':
    main()
