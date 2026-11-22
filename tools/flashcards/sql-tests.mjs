// Run the Supabase regression SQL against a throwaway local PostgreSQL database.
//
//   PGHOST=/tmp PGPORT=54329 PGUSER=postgres node tools/flashcards/sql-tests.mjs [test.sql ...]
//
// A fresh database is created for each test file, the platform shim and every
// migration are applied in order, and the database is dropped afterwards. Never
// point this at a hosted project: it creates and drops databases.
import { execFileSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const host = process.env.PGHOST || '';
if (/supabase\.(co|com)|pooler/i.test(host)) throw new Error('Refusing to run against a hosted database.');

const migrations = readdirSync(join(root, 'supabase/migrations')).filter((name) => name.endsWith('.sql')).sort()
  .map((name) => join(root, 'supabase/migrations', name));
const requested = process.argv.slice(2).map((file) => resolve(file));
const tests = requested.length ? requested : readdirSync(join(root, 'supabase/tests')).filter((name) => name.endsWith('.sql')).sort()
  .map((name) => join(root, 'supabase/tests', name));

const psql = (database, args, options = {}) => execFileSync('psql', ['-X', '-q', '-v', 'ON_ERROR_STOP=1', '-d', database, ...args], {
  encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], ...options,
});

let failures = 0;
for (const test of tests) {
  const database = `ppp_fc_${process.pid}_${Date.now()}`;
  psql('postgres', ['-c', `create database ${database}`]);
  try {
    psql(database, ['-f', join(root, 'supabase/tests/local/supabase-shim.sql')]);
    for (const migration of migrations) psql(database, ['-f', migration]);
    psql(database, ['-f', test]);
    console.log(`ok - ${basename(test)}`);
  } catch (error) {
    failures++;
    console.log(`not ok - ${basename(test)}\n${String(error.stderr || error.message).trim().split('\n').map((line) => `  ${line}`).join('\n')}`);
  } finally {
    psql('postgres', ['-c', `drop database if exists ${database} with (force)`]);
  }
}
console.log(`# ${tests.length - failures}/${tests.length} passed`);
process.exitCode = failures ? 1 : 0;
