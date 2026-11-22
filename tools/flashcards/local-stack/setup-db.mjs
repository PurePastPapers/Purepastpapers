// Recreate a disposable local QA database with the platform shim and every migration.
//   PGHOST=/tmp PGPORT=54329 PGUSER=postgres node tools/flashcards/local-stack/setup-db.mjs ppp_fc_qa
import { execFileSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('../../..', import.meta.url)));
const database = process.argv[2] || 'ppp_fc_qa';
if (!/^ppp_fc_[a-z0-9_]+$/.test(database)) throw new Error('QA database names must start with ppp_fc_.');
if (/supabase\.(co|com)|pooler/i.test(process.env.PGHOST || '')) throw new Error('Refusing to run against a hosted database.');
const psql = (db, args) => execFileSync('psql', ['-X', '-q', '-v', 'ON_ERROR_STOP=1', '-d', db, ...args], { stdio: ['ignore', 'ignore', 'inherit'] });
psql('postgres', ['-c', `drop database if exists ${database} with (force)`]);
psql('postgres', ['-c', `create database ${database}`]);
psql(database, ['-f', join(root, 'supabase/tests/local/supabase-shim.sql')]);
for (const name of readdirSync(join(root, 'supabase/migrations')).filter((file) => file.endsWith('.sql')).sort()) {
  psql(database, ['-f', join(root, 'supabase/migrations', name)]);
}
console.log(`Prepared ${database}`);
