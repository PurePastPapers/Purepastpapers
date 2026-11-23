// School catalogue check for the Flashcards beta (local QA stack only).
// Run with tools/flashcards/local-stack/run-browser-check.mjs tools/flashcards/check-catalogue.mjs
// Publishes a small catalogue release in the disposable database, then checks school
// access in the browser, topic unsuspension and progress across a catalogue update.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const { sql, literal } = await import('./local-stack/server.mjs');
const { trackBackend } = await import('./local-stack/idle.mjs');
const accounts = JSON.parse(await readFile(process.env.PPP_FLASHCARD_QA_ACCOUNTS, 'utf8'));
const base = 'http://localhost:5173/';
const server = spawn(process.execPath, ['tools/serve.mjs'], { stdio: ['ignore', 'pipe', 'inherit'] });
await once(server.stdout, 'data');
const bridge = await import(resolve(process.env.PPP_FLASHCARD_QA_NETWORK_MODULE));
const browser = await chromium.launch({ executablePath: process.env.PPP_CHROMIUM_EXECUTABLE });
const rows = async (query) => JSON.parse((await sql(`select coalesce(jsonb_agg(r),'[]') from (${query}) r`)).trim());
const issues = [];
const catalogue = 'EDX_ALEVEL_BIOL_9BN0_ATOMIC';

async function publish(version, cards) {
  const versionId = crypto.randomUUID();
  const values = cards.map(([key, front, path, tags = []]) => `(${literal(key)},${literal(front)},${literal(path)},${literal(`{${tags.join(',')}}`)}::text[])`).join(',');
  await sql(`insert into public.flashcard_catalogue_versions(id,catalogue_id,version) values (${literal(versionId)},${literal(catalogue)},${literal(version)});
    insert into public.flashcard_catalogue_items(catalogue_id,stable_key) select ${literal(catalogue)},k from (values ${values}) v(k,f,p,t) on conflict do nothing;
    insert into public.flashcard_catalogue_material(version_id,catalogue_id,catalogue_card_id,front,back,note_type,variant,tags,suspended,subdeck_path)
      select ${literal(versionId)},${literal(catalogue)},i.id,v.f,'Answer to '||v.f,'basic','forward',v.t,true,v.p from (values ${values}) v(k,f,p,t)
      join public.flashcard_catalogue_items i on i.catalogue_id=${literal(catalogue)} and i.stable_key=v.k;
    select public.flashcard_publish_catalogue(${literal(catalogue)},${literal(versionId)},'EDX_ALEVEL_BIOL_9BN0','A-level 9BN0','atomic',${cards.length});`);
}
async function session(role, viewport) {
  const account = accounts.find((entry) => entry.role === role);
  const context = await browser.newContext({ viewport, isMobile: viewport.width < 500, hasTouch: viewport.width < 500 });
  await bridge.install(context);
  const page = await context.newPage();
  page.settle = trackBackend(page);
  page.setDefaultTimeout(30_000);
  page.on('pageerror', (error) => issues.push(error.message));
  await page.goto(`${base}#/flashcards`);
  await page.waitForURL(/#\/login\?next=/);
  await page.getByLabel('Email', { exact: true }).fill(account.email);
  await page.locator('input[name="password"]').fill(account.password);
  await page.getByRole('button', { name: 'Log in', exact: true }).click();
  await page.getByRole('heading', { name: /^Flashcards(?: Beta)?$/ }).waitFor();
  await page.settle();
  return page;
}
const catalogueCard = (page) => page.locator('.flashcards__catalogue-card').filter({ has: page.getByRole('heading', { name: 'A-level Biology Atomic', exact: true }) });

try {
  await publish('v1', [
    ['cells-1', 'What is a eukaryote?', 'Cells', ['spec::1.1']],
    ['cells-2', 'Name an organelle.', 'Cells::Organelles', ['spec::1.10']],
    ['cells-3', 'Optional extension card', 'Cells', ['spec::1.1', 'optional']],
    ['cells-4', 'Archived 2019 card', 'Cells::Archive', ['spec::1.1']],
    ['genetics-1', 'What is an allele?', 'Genetics', ['spec::1.10']],
  ]);

  const lookalike = await session('lookalike', { width: 1440, height: 1000 });
  await lookalike.getByRole('button', { name: 'Official catalogue' }).click();
  assert.equal(await catalogueCard(lookalike).getByRole('button', { name: 'Access required' }).isDisabled(), true);

  const school = await session('school', { width: 390, height: 844 });
  await school.getByRole('button', { name: 'Official catalogue' }).click();
  await catalogueCard(school).getByRole('button', { name: 'Add deck' }).click();
  await school.getByText('Deck added to My decks.').waitFor();
  await school.settle();
  const deck = (await rows(`select d.id from public.flashcard_decks d join auth.users u on u.id=d.user_id where d.catalogue_id=${literal(catalogue)} and u.email like '%@reachfree.co.uk'`))[0].id;
  await catalogueCard(school).getByRole('button', { name: 'Open deck' }).click();
  await school.locator('[data-topic]').waitFor();
  await school.settle();
  await school.locator('[data-topic]').selectOption('Cells');
  await school.getByRole('button', { name: 'Unsuspend topic' }).click();
  await school.getByRole('dialog').getByRole('button', { name: 'Unsuspend' }).click();
  await school.getByText('2 cards unsuspended. 2 archived or optional cards left unchanged.').waitFor();
  await school.settle();
  const visible = async () => rows(`select n.front,c.suspended,s.revision,s.state,c.id from public.flashcard_cards c join public.flashcard_states s on s.card_id=c.id
    join public.flashcard_catalogue_items i on i.id=c.catalogue_card_id join public.flashcard_catalogue_material m on m.catalogue_card_id=i.id
    join public.flashcard_catalogue k on k.id=m.catalogue_id and k.current_version=m.version_id join public.flashcard_notes n on n.id=c.note_id
    where c.deck_id=${literal(deck)} order by i.stable_key`);
  assert.deepEqual((await rows(`select i.stable_key,c.suspended from public.flashcard_cards c join public.flashcard_catalogue_items i on i.id=c.catalogue_card_id where c.deck_id=${literal(deck)} order by i.stable_key`)).map((r) => [r.stable_key, r.suspended]),
    [['cells-1', false], ['cells-2', false], ['cells-3', true], ['cells-4', true], ['genetics-1', true]]);
  assert.ok((await visible()).every((card) => card.front === ''), 'catalogue text is never copied into student notes');

  // Study one card, then publish a revision that rewords it and adds a card.
  await school.getByRole('button', { name: /^(Study|Start studying)$/ }).click();
  await school.getByRole('button', { name: /Show answer/ }).click();
  const studied = (await school.locator('.flashcards__study .flashcards__content').first().innerText()).trim();
  await school.getByRole('button', { name: /^Easy/ }).click();
  await school.settle();
  const before = await rows(`select i.stable_key,c.id,c.suspended,s.revision,s.state from public.flashcard_cards c join public.flashcard_states s on s.card_id=c.id join public.flashcard_catalogue_items i on i.id=c.catalogue_card_id where c.deck_id=${literal(deck)} order by i.stable_key`);
  assert.equal(before.filter((card) => card.revision === 1).length, 1);
  await publish('v2', [
    ['cells-1', 'What is a eukaryotic cell?', 'Cells', ['spec::1.1']],
    ['cells-2', 'Name a membrane-bound organelle.', 'Cells::Organelles', ['spec::1.10']],
    ['cells-3', 'Optional extension card', 'Cells', ['spec::1.1', 'optional']],
    ['cells-4', 'Archived 2019 card', 'Cells::Archive', ['spec::1.1']],
    ['genetics-1', 'What is an allele?', 'Genetics', ['spec::1.10']],
    ['genetics-2', 'What is a gene?', 'Genetics', ['spec::1.1']],
  ]);
  await school.reload();
  await school.getByRole('heading', { name: /^Flashcards(?: Beta)?$/ }).waitFor();
  await school.settle();
  const after = await rows(`select i.stable_key,c.id,c.suspended,s.revision,s.state from public.flashcard_cards c join public.flashcard_states s on s.card_id=c.id join public.flashcard_catalogue_items i on i.id=c.catalogue_card_id where c.deck_id=${literal(deck)} order by i.stable_key`);
  assert.deepEqual(after.filter((card) => card.stable_key !== 'genetics-2'), before, 'existing cards keep ID, suspension and schedule');
  assert.deepEqual(after.find((card) => card.stable_key === 'genetics-2')?.suspended, true);
  await school.locator(`[data-action="open-deck"][data-id="${deck}"]`).click();
  await school.getByText(/6 cards/).waitFor();
  const studiedRow = school.locator('.flashcards__row').filter({ hasText: studied === 'What is a eukaryote?' ? 'What is a eukaryotic cell?' : 'Name a membrane-bound organelle.' });
  await studiedRow.locator('.flashcards__card-meta').getByText('Review', { exact: true }).waitFor();
  await studiedRow.getByText(/^Due /).waitFor();
  const spec = school.locator('[data-spec-point]');
  await spec.waitFor();
  const snippets = school.locator('.flashcards__row .flashcards__snippet');
  const expectCards = async (fronts) => {
    await school.waitForFunction((expected) => {
      const visible = [...document.querySelectorAll('.flashcards__row .flashcards__snippet')]
        .map((card) => card.textContent.trim()).sort();
      return JSON.stringify(visible) === JSON.stringify([...expected].sort());
    }, fronts);
    assert.equal(await snippets.count(), fronts.length);
  };
  const reviewedFront = studied === 'What is a eukaryote?' ? 'What is a eukaryotic cell?' : 'Name a membrane-bound organelle.';
  await school.locator('[data-card-status]').selectOption('reviewed');
  await expectCards([reviewedFront]);
  await school.locator('[data-card-status]').selectOption('all');
  await school.locator('[data-card-sort]').selectOption('new-first');
  await school.waitForFunction((front) => document.querySelector('.flashcards__row:last-child .flashcards__snippet')?.textContent.trim() === front,
    reviewedFront);
  await spec.selectOption('spec::1.10');
  await expectCards(['Name a membrane-bound organelle.', 'What is an allele?']);
  await spec.selectOption('spec::1.1');
  await expectCards(['What is a eukaryotic cell?', 'Optional extension card', 'Archived 2019 card', 'What is a gene?']);
  await school.locator('[data-card-status]').selectOption('new');
  await school.locator('[data-card-availability]').selectOption('suspended');
  await expectCards(['Optional extension card', 'Archived 2019 card', 'What is a gene?']);
  await school.getByText('3 matching cards · 0 active · 3 suspended', { exact: true }).waitFor();

  const bulk = async (action, confirm) => {
    await school.getByRole('button', { name: action, exact: true }).click();
    await school.getByRole('dialog').getByRole('button', { name: confirm, exact: true }).click();
    await school.settle();
  };
  const saved = async () => rows(`select i.stable_key,c.id,c.suspended,s.revision,s.state
    from public.flashcard_cards c join public.flashcard_states s on s.card_id=c.id
    join public.flashcard_catalogue_items i on i.id=c.catalogue_card_id
    where c.deck_id=${literal(deck)} order by i.stable_key`);
  await bulk('Unsuspend matching cards', 'Unsuspend');
  await expectCards(['Optional extension card', 'Archived 2019 card']);
  assert.deepEqual(await saved(), after.map((card) => card.stable_key === 'genetics-2'
    ? { ...card, suspended: false }
    : card), 'bulk unsuspension affects only the eligible card in the exact intersection');

  await school.locator('[data-card-availability]').selectOption('active');
  await school.locator('[data-search]').fill('What is a gene?');
  await expectCards(['What is a gene?']);
  await bulk('Suspend matching cards', 'Suspend');
  assert.deepEqual(await saved(), after, 'bulk suspension preserves the card state and leaves other cards unchanged');
  await school.locator('[data-action="clear-card-filters"]').click();
  await school.getByText('6 matching cards · 2 active · 4 suspended', { exact: true }).waitFor();
  assert.equal(await school.locator('[data-card-sort]').inputValue(), 'new-first', 'clearing filters preserves sort');
  assert.ok(await school.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'no horizontal scroll on a phone');
  assert.deepEqual(issues, []);
  console.log('School access, exact spec and status filters, filtered suspension with protected exclusions, and schedule preservation verified.');
} catch (error) {
  for (const context of browser.contexts()) for (const open of context.pages()) console.error(`--- ${open.url()}\n${(await open.locator('main').innerText().catch(() => '')).slice(0, 1200)}`);
  throw error;
} finally {
  await browser.close();
  server.kill();
}
