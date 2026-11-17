import json, sys, subprocess, concurrent.futures
from pathlib import Path
cache = Path(sys.argv[1]); cache.mkdir(parents=True, exist_ok=True)
jobs = []
for f in sys.argv[2:]:
    for key, docs in json.load(open(f)).items():
        qual, comp, year, series = key.split('_')
        pid = f'EDX_{qual}_{year}_{series}_{comp}'
        for kind, rec in docs.items():
            if rec.get('url'):
                t = cache / f'{pid}__{kind}.pdf'
                if not (t.exists() and t.read_bytes()[:4] == b'%PDF'):
                    jobs.append((rec['url'], t))
def get(j):
    u, t = j
    for _ in range(4):
        subprocess.run(['curl', '-sSL', '-m', '120', '-o', str(t), u])
        if t.exists() and t.read_bytes()[:4] == b'%PDF': return t.name, 'ok'
    return t.name, 'FAILED'
with concurrent.futures.ThreadPoolExecutor(6) as p:
    for r in p.map(get, jobs): print(*r)
