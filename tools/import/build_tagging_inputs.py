"""Build per-paper tagging inputs from the extraction JSON and mark scheme text.
usage: python3 -I tools/import/build_tagging_inputs.py [work_dir]   (default .import-cache/9MA0/work)"""
import sys, json, glob, os, re
import pdfplumber
W = sys.argv[1] if len(sys.argv) > 1 else '.import-cache/9MA0/work'
os.makedirs(f'{W}/tagging', exist_ok=True)
for f in sorted(glob.glob(f'{W}/qp/*.qp.json')):
    pid = os.path.basename(f)[:-8]
    qp = json.load(open(f)); ms = json.load(open(f'{W}/ms/{pid}.ms.json'))
    pdf = pdfplumber.open(f'.import-cache/9MA0/{pid}.mark_scheme.pdf')
    mstext = {}
    for q in ms['questions']:
        t = '\n'.join((pdf.pages[p - 1].extract_text() or '') for p in q['pages'][:3])
        mstext[q['number']] = re.sub(r'[ \t]+', ' ', t)[:3500]
    section = 'Statistics' if pid.endswith('P3S') else 'Mechanics' if pid.endswith('P3M') else 'Statistics then Mechanics' if pid.endswith('P3') else 'Pure'
    out = {'paper_id': pid, 'section': section, 'image_dir': f'assets/questions/9MA0/{pid}', 'questions': [
        {'number': q['number'], 'key': q['key'], 'total_marks': q['total'], 'image': q['image'], 'question_text': q['text'],
         'units': [{'label': u['label'], 'marks': u['marks']} for u in q['units']],
         'mark_scheme_text': mstext.get(q['number'], '')} for q in qp['questions']]}
    json.dump(out, open(f'{W}/tagging/{pid}.in.json', 'w'), indent=1, ensure_ascii=False)
print('built', len(glob.glob(f'{W}/tagging/*.in.json')), 'tagging inputs')
