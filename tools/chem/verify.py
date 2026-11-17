#!/usr/bin/env python3
"""Programmatic ink check of every built Chemistry crop (question, context, scheme).

Usage: verify.py [PAPER ...]   (default: every pack in data/packs/chem)
A crop passes when it decodes and carries real ink: at least 0.15% dark pixels and at least
8 px tall. Prints the thinnest crops so they can be looked at; exits 1 if any fails.
"""
import json
import sys
from pathlib import Path
from PIL import Image
import numpy as np

REPO = Path(__file__).resolve().parents[2]


def ink(path):
    im = Image.open(path).convert('L')
    a = np.asarray(im)
    return (a < 160).mean(), im.size


def main():
    only = set(sys.argv[1:])
    bad, thin, n = [], [], 0
    for f in sorted((REPO / 'data/packs/chem').glob('*.json')):
        if only and f.stem not in only:
            continue
        pack = json.loads(f.read_text())
        for q in pack['questions']:
            paths = [('question', q['content']['question_image_url']), ('scheme', q['content']['mark_scheme_image_url'])]
            paths += [('context', i['image_url']) for i in q.get('context', {}).get('intros', [])]
            for kind, p in paths:
                n += 1
                full = REPO / p
                if not full.exists():
                    bad.append((q['question_id'], kind, 'missing')); continue
                frac, size = ink(full)
                if frac < 0.0015 or size[1] < 8:
                    bad.append((q['question_id'], kind, f'ink {frac:.4f} size {size}'))
                elif frac < 0.004:
                    thin.append((frac, q['question_id'], kind))
    print(n, 'crops checked;', len(bad), 'failures;', len(thin), 'thin (<0.4% ink)')
    for b in bad[:40]:
        print('FAIL', *b)
    for t in sorted(thin)[:10]:
        print('thin', t)
    sys.exit(1 if bad else 0)


if __name__ == '__main__':
    main()
