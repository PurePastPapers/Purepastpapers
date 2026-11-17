import sys; import os; sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import kit, concurrent.futures, glob, os
pids=[os.path.basename(f)[:-5] for f in glob.glob(os.path.join(os.environ.get('GCSEBIO_RESEARCH', '../gcsebio-research'), 'candidates/*.json'))]
with concurrent.futures.ProcessPoolExecutor(6) as p: list(p.map(kit.texts, pids))
