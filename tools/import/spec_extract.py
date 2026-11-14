"""Extract printed codes and Content-column text from the 9MA0 specification PDF.
usage: python3 -I tools/import/spec_extract.py <spec.pdf> <out.json>
Output: ordered list of {paper, code, page, text}. Formulae in the text are approximate
(PDF text extraction); the codes and their order are exact."""
import sys, json, re, pdfplumber
out, paper = [], None
with pdfplumber.open(sys.argv[1]) as pdf:
    for pno, page in enumerate(pdf.pages, 1):
        words = page.extract_words(keep_blank_chars=False, x_tolerance=1.5, y_tolerance=2)
        head = [w for w in words if w['text'] == 'Guidance']
        cont = [w for w in words if w['text'] == 'Content' and head and abs(w['top'] - head[0]['top']) < 3]
        if not head or not cont:
            continue
        txt = page.extract_text() or ''
        gx, cx = head[0]['x0'], cont[0]['x0']
        codes = [w for w in words if re.fullmatch(r'\d{1,2}\.\d{1,2}', w['text']) and abs(w['x0'] - cx) < 6 and w['top'] > head[0]['bottom']]
        if codes and codes[0]['text'] == '1.1':
            paper = 'pure' if paper is None else 'applied'
        body = [w for w in words if w['top'] > head[0]['bottom'] and w['bottom'] < page.height - 45 and cx + 22 < w['x0'] and w['x1'] < gx - 2]
        for i, c in enumerate(codes):
            top = c['top'] - 3
            bot = codes[i + 1]['top'] - 3 if i + 1 < len(codes) else 1e9
            ws = sorted((w for w in body if top <= w['top'] < bot), key=lambda w: (round(w['top'] / 3), w['x0']))
            out.append({'paper': paper, 'code': c['text'], 'page': pno, 'text': ' '.join(w['text'] for w in ws)})
        # continuation text before the first code on a page belongs to the previous point
        if out and codes:
            pre = sorted((w for w in body if w['top'] < codes[0]['top'] - 3), key=lambda w: (round(w['top'] / 3), w['x0']))
            if pre and out[-len(codes) - 1:-len(codes)]:
                out[-len(codes) - 1]['text'] += ' ' + ' '.join(w['text'] for w in pre)
        elif out and not codes:
            out[-1]['text'] += ' ' + ' '.join(w['text'] for w in sorted(body, key=lambda w: (round(w['top'] / 3), w['x0'])))
json.dump(out, open(sys.argv[2], 'w'), indent=1, ensure_ascii=False)
print(len(out), 'points')
