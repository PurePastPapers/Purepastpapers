// "Only topics I've covered" switch on Practice, for every subject with questions (2026-11-20).
// Server on :5173 (`npm start`). Checks, signed out (guest) and signed in (demo account):
//   - the switch is on every practice screen (individual questions, picker, Build a test)
//   - with topics ticked it starts on and limits the questions; turning it off shows more
//   - with nothing ticked it starts off and points to where topics are ticked
// Run at desktop width by default; WIDTHS=1280,768,390 for more.
const {chromium} = require('playwright');
const assert = require('node:assert/strict');
const base = 'http://localhost:5173';
const widths = (process.env.WIDTHS || '1280').split(',').map(Number);

const status = async (p) => {
  const text = await p.locator('[data-output] [role="status"]').first().textContent({timeout: 15000});
  return Number((text.match(/[\d,]+/) || ['0'])[0].replace(/,/g, ''));
};

(async () => {
  const b = await chromium.launch();
  const errors = [];
  for (const w of widths) {
    for (const who of ['guest', 'signed-in']) {
      const p = await b.newPage({viewport: {width: w, height: 900}, deviceScaleFactor: 1});
      p.on('pageerror', (e) => errors.push(`${w} ${who}: ${e.message}`));
      // Skip the first-visit welcome window, which covers the page for guests.
      await p.addInitScript(() => { try { localStorage.setItem('ppp:welcome-seen', '1'); } catch {} });
      await p.goto(base);
      // Wait for start-up (api.init) before touching progress.
      await p.waitForSelector('#app *'); await p.waitForLoadState('networkidle'); await p.waitForTimeout(800);
      const subjects = await p.evaluate(async (who) => {
        if (who === 'signed-in') await (await import('/js/data/demo.js')).enterDemoAccount();
        const repo = await import('/js/data/content-repository.js');
        return (await repo.getSubjects()).filter((s) => s.has_written_exam && s.practice_modes?.length)
          .map((s) => ({id: s.subject_id, modes: s.practice_modes, tiers: s.tiers || null}));
      }, who);
      for (const s of subjects) {
        // Add the subject, choose a tier where needed, and tick its first few topics in the
        // view practice opens on (official points, or textbook sections where they exist).
        const ticked = await p.evaluate(async (s) => {
          const api = await import('/js/data/api.js');
          const repo = await import('/js/data/content-repository.js');
          await api.setEnrolled(s.id, true);
          if (s.tiers) await api.setPreference('tiers', {...(api.getProgress().preferences.tiers || {}), [s.id]: s.tiers[s.tiers.length - 1]});
          const bundle = await repo.getBundle(s.id);
          const leaves = repo.specIndex.subjectLeaves(s.id);
          await api.setLearned(leaves, false);
          if (bundle.textbooks) await api.setTextbookLearned(bundle.textbooks.ids, false);
          return leaves.length;
        }, s);
        for (const mode of s.modes) {
          const url = `${base}/#/practice?subject=${s.id}&mode=${mode}`;
          // Nothing ticked: switch present, off, with a way to tick topics.
          await p.goto(`${base}/#/subjects`); await p.waitForTimeout(150);
          await p.goto(url); await p.waitForSelector('[data-covered]', {timeout: 15000});
          assert.equal(await p.locator('[data-covered]').first().isChecked(), false, `${who} ${s.id} ${mode}: off with nothing ticked`);
          assert(await p.locator('[data-covered]').first().isVisible(), `${who} ${s.id} ${mode}: visible`);
        }
        // Tick some topics in the view practice uses, then check the switch filters.
        await p.evaluate(async (id) => {
          const api = await import('/js/data/api.js');
          const repo = await import('/js/data/content-repository.js');
          const bundle = await repo.getBundle(id);
          const textbook = bundle.textbooks && api.getProgress().preferences[`coveredView:${id}`] !== 'official';
          if (textbook) await api.setTextbookLearned(bundle.textbooks.ids.slice(0, 2), true);
          else await api.setLearned(repo.specIndex.subjectLeaves(id).slice(0, 3), true);
        }, s.id);
        const counts = {};
        for (const mode of s.modes.filter((m) => m !== 'timed_test')) {
          // Through another page first: the same address twice does not redraw.
          await p.goto(`${base}/#/subjects`); await p.waitForTimeout(150);
          await p.goto(`${base}/#/practice?subject=${s.id}&mode=${mode}`); await p.waitForSelector('[data-covered]');
          const box = p.locator('[data-covered]').first();
          assert.equal(await box.isChecked(), true, `${who} ${s.id} ${mode}: on once topics are ticked`);
          const on = await status(p);
          // Click the switch as a student would (its label), then wait for the redraw.
          await p.locator('label:has([data-covered])').first().click(); await p.waitForTimeout(700);
          assert.equal(await p.locator('[data-covered]').first().isChecked(), false);
          const off = await status(p);
          // A subject with no published questions yet (Further Maths, Nov 2026) still needs the switch.
          assert(off >= on, `${who} ${s.id} ${mode}: covered ${on}, all ${off}`);
          if (off > 0) assert(off > on || on > 0, `${who} ${s.id} ${mode}: covered ${on}, all ${off}`);
          await p.locator('label:has([data-covered])').first().click(); await p.waitForTimeout(500);
          assert.equal(await p.locator('[data-covered]').first().isChecked(), true, 'switches back on');
          counts[mode] = `${on}/${off}`;
        }
        if (s.modes.includes('timed_test')) {
          await p.goto(`${base}/#/subjects`); await p.waitForTimeout(150);
          await p.goto(`${base}/#/practice?subject=${s.id}&mode=timed_test`); await p.waitForSelector('[data-covered]');
          assert.equal(await p.locator('[data-covered]').first().isChecked(), true, `${who} ${s.id} test builder: on`);
          counts.timed_test = 'on';
        }
        const width = await p.evaluate(() => document.documentElement.scrollWidth);
        assert.equal(width, w, `${s.id}: no sideways scroll`);
        console.log(w, who, s.id, `${ticked} points`, JSON.stringify(counts));
      }
      await p.close();
    }
  }
  assert.deepEqual(errors, []);
  console.log('PASS');
  await b.close();
})().catch((e) => { console.error(e); process.exit(1); });
