// wrangler.jsonc deploys this checkout as Cloudflare Workers static assets.
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const STATIC_FILE_LIMIT = 20_000;
const STATIC_FILE_BYTES = 25 * 1024 * 1024;

function listing(output) {
  return output.split('\0').filter(Boolean);
}

test('published files fit Cloudflare Workers static asset limits', (t) => {
  const git = (args, options = {}) => execFileSync('git', args, {cwd: root, encoding: 'utf8', ...options});
  const candidates = new Set(listing(git(['ls-files', '-z', '--cached', '--others', '--exclude-standard'])));
  const ignored = new Set(listing(git(
    ['-c', 'core.excludesFile=.assetsignore', 'check-ignore', '--no-index', '-z', '--stdin'],
    {input: [...candidates].join('\0') + '\0'},
  )));
  let count = 0;
  let largest = {name: '', size: 0};
  for (const name of candidates) {
    if (ignored.has(name)) continue;
    const file = statSync(path.join(root, name), {throwIfNoEntry: false});
    if (!file?.isFile()) continue;
    count++;
    if (file.size > largest.size) largest = {name, size: file.size};
  }
  assert(count > 0, 'No deployable assets were measured');
  assert(count <= STATIC_FILE_LIMIT, `${count} files exceed the Cloudflare static asset limit`);
  assert(largest.size <= STATIC_FILE_BYTES, `${largest.name} exceeds the Cloudflare per-asset limit`);
  t.diagnostic(`${count.toLocaleString('en-GB')} assets, largest ${largest.name} at ${largest.size.toLocaleString('en-GB')} bytes`);
});
