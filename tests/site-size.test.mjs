// GitHub Pages publishes reliably only up to 1 GB ("Uploaded artifact size ... exceeds the
// allowed size of 1 GB. Deployment might fail."). Past that, booklet image catalogues can
// go missing from the live site and questions show blank. Keep the image catalogues well
// under it; if this fails after an import, run: python3 tools/assets/compact.py
import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const LIMIT = 1_150_000_000; // bytes of catalogue JSON (base64), about 0.9 GB once gzipped by Pages

test('image catalogues stay under the GitHub Pages size limit', () => {
  const data = path.join(root, 'data');
  let total = 0;
  for (const dir of readdirSync(data).filter((name) => name.endsWith('-assets'))) {
    for (const file of readdirSync(path.join(data, dir))) total += statSync(path.join(data, dir, file)).size;
  }
  assert.ok(total < LIMIT, `image catalogues are ${(total / 1e9).toFixed(2)} GB; run tools/assets/compact.py or host images elsewhere`);
});
