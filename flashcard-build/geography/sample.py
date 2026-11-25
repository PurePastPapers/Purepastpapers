#!/usr/bin/env python3
"""Draw the stratified review sample for Will. Usage: python3 sample.py SEED > out/sample.md"""
import csv, json, random, sys, collections
from pathlib import Path
ROOT = Path(__file__).resolve().parent
seed = int(sys.argv[1]) if len(sys.argv) > 1 else 7037
rng = random.Random(seed)
cards = json.load(open(ROOT / 'out/all-cards.json'))
src = {}
for f in (ROOT / 'sources').glob('*.tsv'):
    for row in csv.reader(open(f, encoding='utf8'), delimiter='\t'):
        if len(row) >= 2:
            src[row[0].strip()] = row[1].strip()
labels = {'content': 'Key content', 'evidence': 'Case studies and evidence'}
n = 0
print(f'_Sample seed: {seed}_\n')
for st in ('content', 'evidence'):
    print(f'## {labels[st]}\n')
    by_topic = collections.defaultdict(lambda: collections.defaultdict(list))
    for c in cards:
        if c['set'] == st:
            by_topic[(c['paper'], c['topic'])][c['point']].append(c)
    for (paper, topic) in sorted(by_topic):
        pts = sorted(by_topic[(paper, topic)])
        print(f'### {paper}: {topic}\n')
        for pt in sorted(rng.sample(pts, min(3, len(pts)))):
            c = rng.choice(by_topic[(paper, topic)][pt]); n += 1
            print(f"**{n}. {pt}**  \nFront: {c['front']}  \nBack: {c['back']}  \n_Source: {src.get(c['front'], 'standard content, checked against AQA spec and mark schemes')}_\n")
print('## Exam technique\n')
for c in rng.sample([c for c in cards if c['set'] == 'mark'], 4):
    n += 1
    back = c['back'].replace('\n', '  \n')
    print(f"**{n}. {c['paper']}**  \nFront: {c['front']}  \nBack: {back}  \n_Source: {src.get(c['front'], 'AQA mark schemes')}_\n")
