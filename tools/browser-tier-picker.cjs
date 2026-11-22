// Tier picker browser check (GCSE Maths, option A cards, 2026-11-17; GCSE sciences, 2026-11-19).
// Server on :5173 (`npm start`). Screenshots go to AUDIT_SCREENSHOT_DIR (default /tmp).
//   Maths: add on Foundation, practice and past papers start on Foundation, Reset keeps it.
//   Sciences (1SC0, 1BI0, 1CH0, 1PH0): Foundation/Higher is required when adding; the saved
//   tier sets the subject page's spec tree and counts, practice/tests and the paper list; the
//   other tier only appears when switched to or searched for; an account with no tier is asked
//   to choose one without losing its ticks; changing tier keeps every tick.
const {chromium} = require('playwright');
const assert = require('node:assert/strict');
const base = 'http://localhost:5173';
const shots = process.env.AUDIT_SCREENSHOT_DIR || '/tmp';
const MATHS = 'EDX_GCSE_MATH_1MA1';
const SCIENCES = [
  {id: 'EDX_GCSE_COMBSCI_1SC0', name: 'Combined Science (Double Award)', code: '1SC0'},
  {id: 'EDX_GCSE_BIOL_1BI0', name: 'Biology (Triple / Separate Science)', code: '1BI0'},
  {id: 'EDX_GCSE_CHEM_1CH0', name: 'Chemistry (Triple / Separate Science)', code: '1CH0'},
  {id: 'EDX_GCSE_PHYS_1PH0', name: 'Physics (Triple / Separate Science)', code: '1PH0'},
];
const statusCount = async (p) => {
  await p.waitForSelector('[data-output] [role="status"]');
  return Number((await p.locator('[data-output] [role="status"]').first().textContent()).match(/\d+/)[0]);
};
const noOverflow = async (p, w, where) => assert.equal(await p.evaluate(() => document.documentElement.scrollWidth), w, `horizontal overflow on ${where} at ${w}px`);
const freshDemo = (p, ids) => p.evaluate(async (ids) => {
  await (await import('/js/data/demo.js')).enterDemoAccount();
  const api = await import('/js/data/api.js');
  for (const id of ids) await api.setEnrolled(id, false);
  const tiers = {...(api.getProgress().preferences.tiers || {})};
  for (const id of ids) delete tiers[id];
  await api.setPreference('tiers', tiers);
}, ids);
const pageFacts = (p, id) => p.evaluate(async (id) => {
  const api = await import('/js/data/api.js');
  const repo = await import('/js/data/content-repository.js');
  const tiers = await import('/js/engine/tiers.js');
  const bundle = await repo.getBundle(id);
  const learned = api.learnedSet();
  const leaves = (tier) => tiers.tierLeaves(repo.specIndex, id, tier);
  const papers = (tier) => bundle.papers.filter((paper) => paper.tier === tier).length;
  return {
    pref: api.getProgress().preferences.tiers?.[id] ?? null,
    enrolled: api.getProgress().enrolled_subjects.includes(id),
    learnedAll: leaves(null).filter((leaf) => learned.has(leaf)).length,
    F: leaves('Foundation').length, H: leaves('Higher').length,
    papersF: papers('Foundation'), papersH: papers('Higher'),
  };
}, id);

async function addFromCatalogue(p, subject, tier, learned) {
  await p.goto(base + '/#/subjects?level=gcse');
  await p.waitForSelector('[data-search]');
  await p.locator('[data-search]').fill(subject.code);
  await p.waitForTimeout(300);
  await p.locator(`[data-enrol="${subject.id}"]`).first().click();
  const d = p.locator('dialog[open]');
  await d.waitFor();
  return d;
}

(async () => {
  const b = await chromium.launch();
  const errors = [];
  for (const w of [1280, 768, 390]) {
    const p = await b.newPage({viewport: {width: w, height: 1000}, deviceScaleFactor: 1});
    p.on('pageerror', (e) => errors.push(`${w}: ${e.message}`));
    // Fonts and other outside hosts may be unreachable in a sandbox; local files must all load.
    p.on('console', (m) => { if (m.type() === 'error' && !/net::ERR_(TUNNEL_CONNECTION_FAILED|NAME_NOT_RESOLVED|INTERNET_DISCONNECTED)/.test(m.text())) errors.push(`${w}: ${m.text()}`); });
    await p.goto(base);

    // ── GCSE Maths (unchanged behaviour: optional tier, "Not decided yet" available) ──
    if (w !== 768) {
      await freshDemo(p, [MATHS]);
      await p.goto(base + '/#/subjects?level=gcse');
      await p.locator('[data-search]').fill('Mathematics'); await p.waitForTimeout(300);
      await p.locator(`[data-enrol="${MATHS}"]`).click();
      const d = p.locator('dialog[open]'); await d.waitFor();
      assert.equal(await d.locator('input[name=tier]').count(), 3);
      await d.locator('.tier-pick', {hasText: 'Foundation'}).click();
      await d.locator('input[name=learned][value=skip]').check({force: true});
      await d.getByRole('button', {name: 'Add Mathematics'}).click(); await p.waitForTimeout(600);
      assert.equal((await pageFacts(p, MATHS)).pref, 'Foundation');
      await p.goto(base + '/#/practice?subject=' + MATHS + '&mode=individual');
      const n = await statusCount(p);
      assert(n > 0);
      assert.equal(await p.locator('[data-tier-bar] [aria-checked="true"]').innerText(), 'Foundation');
      await p.locator('[data-reset-filters]').first().click(); await p.waitForTimeout(300);
      assert.equal(await statusCount(p), n, 'Reset keeps the saved tier');
      await p.goto(base + '/#/papers?subject=' + MATHS); await p.waitForSelector('[data-list]'); await p.waitForTimeout(300);
      const txt = await p.locator('[data-list]').innerText();
      assert(/Foundation/.test(txt) && !/Higher/.test(txt), 'Maths papers start on Foundation');
      console.log(w, 'maths ok', n);
    }

    // ── GCSE sciences ──
    const plan = w === 1280 ? SCIENCES.flatMap((s) => [[s, 'Foundation'], [s, 'Higher']]) : [[SCIENCES[0], 'Foundation'], [SCIENCES[2], 'Higher']];
    for (const [subject, tier] of plan) {
      const other = tier === 'Foundation' ? 'Higher' : 'Foundation';
      await freshDemo(p, SCIENCES.map((s) => s.id));
      const d = await addFromCatalogue(p, subject, tier);
      assert.equal(await d.locator('input[name=tier]').count(), 2, 'no "Not decided yet" for a science');
      assert.equal(await d.locator('input[name=tier]:checked').count(), 0, 'no tier preselected');
      await d.locator('input[name=learned][value=all]').check({force: true});
      await d.getByRole('button', {name: `Add ${subject.name}`}).click(); await p.waitForTimeout(300);
      assert(await d.isVisible(), 'saving without a tier is refused');
      assert(/Choose Foundation or Higher/.test(await d.locator('.modal__error').innerText()));
      await d.locator('.tier-pick', {hasText: tier}).click();
      const facts0 = await pageFacts(p, subject.id);
      assert.equal(await d.locator('[data-all-count]').innerText(), String(facts0[tier[0]]), '"covered everything" counts the chosen tier');
      if (w !== 1280 || subject.code === '1SC0') await d.locator('.modal__box').screenshot({path: `${shots}/science-tier-dialog-${subject.code}-${w}.png`});
      await d.getByRole('button', {name: `Add ${subject.name}`}).click(); await p.waitForTimeout(800);
      let facts = await pageFacts(p, subject.id);
      assert.equal(facts.pref, tier, `${subject.id} saved as ${tier}`);
      assert.equal(facts.learnedAll, facts[tier[0]], '"covered everything" ticks only the chosen tier');
      // Other sciences keep their own (unset) tier.
      for (const s of SCIENCES.filter((s) => s.id !== subject.id)) assert.equal((await pageFacts(p, s.id)).pref, null);

      // My subjects card shows the tier.
      assert(new RegExp(`${tier} tier`).test(await p.locator(`[data-subject-card="${subject.id}"]`).innerText()));

      // Subject page: tier control, tier-only tree and counts.
      await p.goto(base + '/#/subject/' + subject.id); await p.waitForSelector('[data-tier-switch]'); await p.waitForTimeout(400);
      assert.equal(await p.locator('[data-tier-switch] [aria-checked="true"]').innerText(), tier);
      const stat = await p.locator('[data-stats] .stat').first().innerText();
      assert(stat.includes(`/ ${facts[tier[0]]}`), `learned denominator is the ${tier} count: ${stat}`);
      const tags = await p.$$eval('[data-tree] .tree__point .tag', (nodes) => nodes.map((node) => node.textContent.trim()));
      assert.equal(await p.locator('[data-tree] .tree__point').count(), facts[tier[0]], 'tree rows are the tier\'s points');
      if (tier === 'Foundation') assert(!tags.includes('Higher'), 'no Higher-only points at Foundation');
      else assert(tags.includes('Higher'), 'Higher-only points shown at Higher');
      await noOverflow(p, w, `subject ${subject.code}`);
      if (subject.code === '1SC0') await p.screenshot({path: `${shots}/science-subject-${subject.code}-${tier}-${w}.png`});

      // Practice: saved tier by default; the other tier and both tiers only on purpose.
      await p.goto(base + '/#/practice?subject=' + subject.id + '&mode=individual'); await p.waitForSelector('[data-tier-bar]');
      assert.equal(await p.locator('[data-tier-bar] [aria-checked="true"]').innerText(), tier);
      const covered = p.locator('[data-covered]').first();
      if (await covered.isChecked()) { await covered.click({force: true}); await p.waitForTimeout(400); }
      const nTier = await statusCount(p);
      const options = await p.$$eval('select[data-filter="paper"] option', (nodes) => nodes.map((node) => node.textContent));
      assert(options.length > 1 && options.slice(1).every((text) => text.includes(`(${tier})`)), 'paper list holds only the saved tier');
      await p.locator('[data-search]').fill('the'); await p.waitForTimeout(700);
      const nSearch = await statusCount(p);
      assert(nSearch > 0 && nSearch <= nTier, 'a plain search keeps the tier');
      await p.locator('[data-search]').fill(other.toLowerCase()); await p.waitForTimeout(700);
      assert(await p.locator('.tier-search-note').count(), 'a search naming the other tier selects it');
      await p.locator('[data-search]').fill(''); await p.waitForTimeout(700);
      if (w === 390 && subject.code === '1SC0') await p.screenshot({path: `${shots}/science-practice-${subject.code}-${w}.png`});
      await noOverflow(p, w, `practice ${subject.code}`);
      await p.locator('[data-practice-tier=""]').click(); await p.waitForSelector('[data-tier-bar] [data-practice-tier=""][aria-checked="true"]');
      await p.waitForTimeout(300);
      const covered2 = p.locator('[data-covered]').first();
      if (await covered2.isChecked()) { await covered2.click({force: true}); await p.waitForTimeout(400); }
      const nBoth = await statusCount(p);
      assert(nBoth > nTier, `both tiers (${nBoth}) shows more than ${tier} (${nTier})`);
      assert.equal((await pageFacts(p, subject.id)).pref, tier, 'the switch does not change the saved tier');
      await p.locator(`[data-practice-tier="${tier}"]`).click(); await p.waitForTimeout(500);

      // Timed test builder: tier control visible, test drawn from the tier.
      await p.goto(base + '/#/practice?subject=' + subject.id + '&mode=timed_test'); await p.waitForSelector('[data-tier-bar]');
      assert.equal(await p.locator('[data-tier-bar] [aria-checked="true"]').innerText(), tier);
      const testPapers = await p.$$eval('select[data-filter="paper"] option', (nodes) => nodes.map((node) => node.textContent));
      assert(testPapers.length > 1 && testPapers.slice(1).every((text) => text.includes(`(${tier})`)), 'test papers hold only the saved tier');
      await p.waitForSelector('[data-start-test]');
      await noOverflow(p, w, `test builder ${subject.code}`);

      // Past papers: saved tier only, other tier on purpose.
      await p.goto(base + '/#/papers?subject=' + subject.id); await p.waitForSelector('[data-tier-bar]'); await p.waitForTimeout(300);
      const list = await p.locator('[data-list]').textContent();
      assert.equal((list.match(new RegExp(`· ${tier}`, 'g')) || []).length, facts[`papers${tier[0]}`], `${tier} papers listed`);
      assert(!new RegExp(`· ${other}`).test(list), `no ${other} papers by default`);
      await p.locator('[data-tier-bar] [data-value="all"]').click(); await p.waitForTimeout(300);
      const listBoth = await p.locator('[data-list]').textContent();
      assert.equal((listBoth.match(/· (Foundation|Higher)/g) || []).length, facts.papersF + facts.papersH, 'both tiers list every paper');
      if (subject.code === '1SC0' && w === 1280) {
        for (const code of ['1BF', '1CF', '1PF', '2BF', '2CF', '2PF', '1BH', '1CH', '1PH', '2BH', '2CH', '2PH']) assert(listBoth.includes(`1SC0 · ${code}`), code);
      }
      await noOverflow(p, w, `papers ${subject.code}`);
      if (subject.code === '1SC0') await p.screenshot({path: `${shots}/science-papers-${subject.code}-${w}.png`});
      // A paper opens directly.
      await p.locator('[data-list] .paper-card h3 a').first().click(); await p.waitForTimeout(600);
      assert(/#\/paper\//.test(p.url()));

      // Change tier on the subject page: ticks are kept, defaults follow.
      await p.goto(base + '/#/subject/' + subject.id); await p.waitForSelector('[data-tier-switch]');
      const before = (await pageFacts(p, subject.id)).learnedAll;
      await p.locator(`[data-tier-switch] [data-set-tier="${other}"]`).click(); await p.waitForTimeout(800);
      facts = await pageFacts(p, subject.id);
      assert.equal(facts.pref, other);
      assert.equal(facts.learnedAll, before, 'changing tier keeps every tick');
      await p.goto(base + '/#/practice?subject=' + subject.id + '&mode=individual'); await p.waitForSelector('[data-tier-bar]');
      assert.equal(await p.locator('[data-tier-bar] [aria-checked="true"]').innerText(), other, 'practice follows the new saved tier');

      // An account with the subject but no tier is asked to choose; nothing is lost.
      await p.evaluate(async (id) => {
        const api = await import('/js/data/api.js');
        const tiers = {...api.getProgress().preferences.tiers}; delete tiers[id];
        await api.setPreference('tiers', tiers);
      }, subject.id);
      for (const route of [`/#/practice?subject=${subject.id}`, `/#/papers?subject=${subject.id}`, `/#/subject/${subject.id}`]) {
        await p.goto(base + route); await p.waitForSelector('[data-tier-prompt]');
      }
      await p.goto(base + '/#/subjects'); await p.waitForSelector(`[data-subject-card="${subject.id}"]`);
      assert(/Tier not chosen/.test(await p.locator(`[data-subject-card="${subject.id}"]`).innerText()));
      assert.equal((await pageFacts(p, subject.id)).learnedAll, before, 'no ticks lost without a tier');
      await p.goto(base + '/#/practice?subject=' + subject.id); await p.waitForSelector('[data-tier-prompt]');
      await p.locator(`[data-tier-prompt] [data-save-tier="${tier}"]`).click(); await p.waitForSelector('[data-tier-bar]');
      assert.equal((await pageFacts(p, subject.id)).pref, tier);
      console.log(w, subject.code, tier, 'ok', {nTier, nBoth});
    }

    // A visitor (subject not added) chooses a tier on the subject page and carries it into Add.
    await freshDemo(p, SCIENCES.map((s) => s.id));
    await p.goto(base + '/#/subject/EDX_GCSE_COMBSCI_1SC0'); await p.waitForSelector('[data-tier-prompt]');
    assert(/Choose a tier/.test(await p.locator('[data-tier-switch]').innerText()));
    await p.locator('[data-tier-switch] [data-set-tier="Higher"]').click(); await p.waitForSelector('[data-stats]');
    assert.equal(await p.locator('[data-tier-switch] [aria-checked="true"]').innerText(), 'Higher');
    await p.locator('[data-enrol]').click();
    const d = p.locator('dialog[open]'); await d.waitFor();
    assert.equal(await d.locator('input[name=tier]:checked').inputValue(), 'Higher', 'the page tier is preselected');
    await d.locator('input[name=learned][value=skip]').check({force: true});
    await d.getByRole('button', {name: /^Add /}).click(); await p.waitForTimeout(800);
    assert.equal((await pageFacts(p, 'EDX_GCSE_COMBSCI_1SC0')).pref, 'Higher');
    await p.close();
  }
  assert.deepEqual(errors, []);
  console.log('PASS');
  await b.close();
})().catch((e) => { console.error(e); process.exit(1); });
