// Run tools/flashcards/check-browser.mjs end to end against the local QA stack.
//   PGHOST=/tmp PGPORT=54329 PGUSER=postgres \
//   PPP_CHROMIUM_EXECUTABLE=/usr/bin/google-chrome NODE_PATH=<dir containing playwright> \
//   node tools/flashcards/local-stack/run-browser-check.mjs [script.mjs]
// It recreates the ppp_fc_browser database, creates three disposable accounts,
// and drops the database afterwards.
import { execFileSync, spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('../../..', import.meta.url)));
const database = 'ppp_fc_browser';
execFileSync(process.execPath, [join(root, 'tools/flashcards/local-stack/setup-db.mjs'), database], { stdio: 'inherit' });
process.env.PGDATABASE = database;
const { startLocalStack, createUser } = await import('./server.mjs');
const { server, origin } = await startLocalStack();
const directory = await mkdtemp(join(tmpdir(), 'ppp-flashcards-qa-'));
let code = 1;
try {
  const stamp = Date.now();
  const accounts = [
    { role: 'main', email: `qa-main-${stamp}@example.invalid`, password: `main-${stamp}` },
    { role: 'school', email: `qa-school-${stamp}@reachfree.co.uk`, password: `school-${stamp}` },
    { role: 'lookalike', email: `qa-lookalike-${stamp}@reachfree.co.uk.example`, password: `lookalike-${stamp}` },
  ];
  for (const account of accounts) await createUser(account);
  const accountsFile = join(directory, 'accounts.json');
  await writeFile(accountsFile, JSON.stringify(accounts));
  const script = resolve(process.argv[2] || join(root, 'tools/flashcards/check-browser.mjs'));
  const child = spawn(process.execPath, [script], {
    cwd: root, stdio: 'inherit',
    env: {
      ...process.env,
      PPP_FLASHCARD_QA_ACCOUNTS: accountsFile,
      PPP_FLASHCARD_QA_APKG: process.env.PPP_FLASHCARD_QA_APKG || join(root, 'tests/fixtures/flashcards/anki-actual-modern.apkg'),
      PPP_FLASHCARD_QA_NETWORK_MODULE: join(root, 'tools/flashcards/local-stack/network.mjs'),
      PPP_LOCAL_STACK_ORIGIN: origin,
    },
  });
  [code] = await once(child, 'exit');
} finally {
  server.close();
  await rm(directory, { recursive: true, force: true });
  if (!process.env.PPP_KEEP_QA_DB) execFileSync('psql', ['-X', '-q', '-d', 'postgres', '-c', `drop database if exists ${database} with (force)`]);
}
process.exitCode = code;
