import pdfplumber, re, json, sys
CODE = re.compile(r'^(\d{1,2})\.(\d{1,2})(B?)$')
def parse(path, pages=None):
    pages = pages or (1, 10000)
    out = []; cur = None; topic = None
    with pdfplumber.open(path) as p:
        for i, pg in enumerate(p.pages):
            if not pages[0] <= i + 1 <= pages[1]: continue
            ws = [w for w in pg.extract_words(extra_attrs=['fontname']) if w['x0'] < 440 and 40 < w['top'] < pg.height - 60]
            lines = {}
            for w in ws: lines.setdefault(round(w['top']), []).append(w)
            for t in sorted(lines):
                l = sorted(lines[t], key=lambda w: w['x0'])
                text = ' '.join(w['text'] for w in l)
                m = re.match(r'Topic (\d+) [–-] (.+)', text)
                if m and l[0]['x0'] < 95 and 'Bold' in l[0]['fontname']:
                    topic = (int(m.group(1)), m.group(2).strip()); cur = None; continue
                if re.match(r'(Use of mathematics|Suggested practicals|Topics? (common|for))', text):
                    cur = None; continue
                if topic is None: continue
                lead = [w for w in l if w['x0'] < 120]
                code = ''.join(w['text'] for w in lead)
                c = CODE.match(code)
                if c and lead and 85 <= l[0]['x0'] <= 96 and int(c.group(1)) == topic[0]:
                    cur = {'code': code, 'topic': topic[0], 'topic_title': topic[1], 'biology_only': bool(c.group(3)),
                           'page': i + 1, 'lines': [], 'bold_words': 0, 'words': 0}
                    out.append(cur); l = l[len(lead):]
                    if not l: continue
                if cur and l and l[0]['x0'] >= 120:
                    cur['lines'].append(' '.join(w['text'] for w in l if not re.fullmatch(r'\d[a-h],?', w['text'])))
                    cur['words'] += len(l); cur['bold_words'] += sum('Bold' in w['fontname'] for w in l)
    for s in out:
        s['text'] = re.sub(r'\s+', ' ', ' '.join(s.pop('lines'))).strip()
        s['higher_only'] = s['words'] > 0 and s['bold_words'] / s['words'] > 0.9
        s['higher_extension'] = (not s['higher_only']) and s['bold_words'] > 0
    return out
if __name__ == '__main__':
    r = parse(sys.argv[1], tuple(map(int, sys.argv[3].split('-'))) if len(sys.argv) > 3 else None); json.dump(r, open(sys.argv[2], 'w'), indent=1)
    print(len(r), sum(s['higher_only'] for s in r), 'higher', sum(s['biology_only'] for s in r), 'B', sum(s['higher_extension'] for s in r),'ext')
    from collections import Counter; print(Counter(s['topic'] for s in r))
