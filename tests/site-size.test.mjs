// GitHub Pages publishes reliably only up to 1 GB ("Uploaded artifact size ... exceeds the
// allowed size of 1 GB. Deployment might fail."). Past that, booklet image catalogues can
// go missing from the live site and questions show blank. Keep the image catalogues well
// under it; if this fails after an import, run: python3 tools/assets/compact.py
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createReadStream, existsSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { Readable, Writable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';
import { createGzip } from 'node:zlib';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const CATALOGUE_LIMIT = 1_150_000_000; // fast estimate using base64-equivalent image bytes
const PAGES_BUDGET = 1_000_000_000;
const SITE_PATHS = ['assets', 'css', 'data', 'fonts', 'js', 'index.html', 'auth-callback.html', 'CNAME', '.nojekyll'];

function gitFiles(args) {
  return execFileSync('git', ['ls-files', '-z', ...args], { cwd: root, encoding: 'utf8' })
    .split('\0').filter(Boolean);
}

function filesUnder(relativePath) {
  const absolutePath = path.join(root, relativePath);
  if (!existsSync(absolutePath)) return [];
  if (!statSync(absolutePath).isDirectory()) return [relativePath];
  return readdirSync(absolutePath).flatMap((name) => filesUnder(path.join(relativePath, name)));
}

async function compressedSiteBytes() {
  // Include tracked files and additions staged for Pages, plus new web assets
  // so the check also works before staging. Ignored source and scratch files stay out.
  const candidates = existsSync(path.join(root, '.git'))
    ? [...gitFiles(['--cached']), ...gitFiles(['--others', '--exclude-standard', '--', ...SITE_PATHS])]
    : SITE_PATHS.flatMap(filesUnder);
  const files = [...new Set(candidates)].filter((name) =>
    !name.startsWith('.github/') && existsSync(path.join(root, name)));
  async function* contents() {
    for (const name of files) {
      try {
        yield* createReadStream(path.join(root, name));
      } catch (error) {
        if (error.code !== 'ENOENT') throw error;
      }
    }
  }
  // Allow 2 KiB per file for tar headers, padding and long filenames. The files
  // stream through gzip so the deployed tree never has to fit in memory.
  let bytes = 2048 * files.length + 4096;
  await pipeline(Readable.from(contents()), createGzip({ level: 1 }), new Writable({
    write(chunk, _encoding, done) {
      bytes += chunk.length;
      done();
    },
  }));
  return bytes;
}

test('site stays under the GitHub Pages size limit', async (t) => {
  const data = path.join(root, 'data');
  let total = 0;
  for (const dir of readdirSync(data).filter((name) => name.endsWith('-assets'))) {
    for (const file of readdirSync(path.join(data, dir))) total += statSync(path.join(data, dir, file)).size;
  }
  // Examiner report crops (docs/EXAMINER-REPORTS.md) are binary WebP; count them at base64
  // size so the limit keeps the same meaning.
  const reports = path.join(data, 'reports');
  for (const subject of existsSync(reports) ? readdirSync(reports) : []) {
    const img = path.join(reports, subject, 'img');
    if (!existsSync(img)) continue;
    for (const file of readdirSync(img)) total += Math.ceil(statSync(path.join(img, file)).size * 4 / 3);
  }
  if (total < CATALOGUE_LIMIT && process.env.MEASURE_SITE_SIZE !== '1') return;
  const bytes = await compressedSiteBytes();
  t.diagnostic(`Estimated Pages archive size ${bytes.toLocaleString('en-GB')} bytes`);
  assert.ok(bytes < PAGES_BUDGET, `estimated Pages archive is ${(bytes / 1e9).toFixed(2)} GB; run tools/assets/compact.py or host images elsewhere`);
});
