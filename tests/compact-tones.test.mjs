// compact.py must keep black text black (audit 2026-11-19). Its median-cut quantize()
// averaged black text with light graph grids and stored it at grey 160-175, so 2,601 crops
// looked washed out. The full-data check is `python3 tools/assets/restore-tones.py
// --dry-run` (restored: 0). Needs python3 with Pillow and NumPy; skipped without them.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const tools = fileURLToPath(new URL('../tools/assets/', import.meta.url));
const script = `
import sys; sys.path.insert(0, ${JSON.stringify(tools)})
import numpy as np
from PIL import Image
import compact as C
# The failing profile (AS Physics 2022 Q12): mostly white, many anti-aliased light greys
# from a graph grid, under 1% black text, so compact chooses 8 levels.
rng = np.random.default_rng(1)
a = np.full((400, 600), 255, np.uint8)
m = rng.random(a.shape) < 0.15
a[m] = rng.integers(150, 250, m.sum())
a[300:306, 50:200] = 25
grey = Image.fromarray(a, 'L')
target = C.levels(grey)
old = np.asarray(grey.quantize(target, dither=Image.Dither.NONE).convert('L'))
out = np.asarray(C.grey_levels(grey, target))
print(int(out.min()), len(np.unique(out)), target, int(old.min()))
`;

test('compact.grey_levels keeps a near-black level on grid-heavy crops', (t) => {
  const run = spawnSync('python3', ['-c', script], { encoding: 'utf8' });
  if (run.error || /ModuleNotFoundError/.test(run.stderr)) return t.skip('python3 with Pillow and NumPy not available');
  assert.equal(run.status, 0, run.stderr);
  const [darkest, levels, target, oldDarkest] = run.stdout.trim().split(' ').map(Number);
  assert.ok(oldDarkest >= 120, `the fixture no longer reproduces the median-cut washout (${oldDarkest})`);
  assert.ok(darkest <= 40, `darkest grey ${darkest}`);
  assert.ok(levels <= target, `${levels} levels for a target of ${target}`);
});
