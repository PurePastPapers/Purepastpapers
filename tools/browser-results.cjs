// Expected practice result counts for browser checks. Parts that build on each other's
// answers are offered as ONE result (js/engine/linked-parts.js, 2026-11), so a list of
// units shows fewer results than it has units. Uses the site's own grouping.
//   const {results, allTopics} = require('./browser-results.cjs');
//   await allTopics(page); assert.equal(await count(), results(units, (q) => q.is_as));
const {collapseLinked, linkGroups} = require('../js/engine/linked-parts.js'); // require(esm), Node 22.12+

// With a filter, groups are formed over the whole list (as the site forms them over the
// subject) and a group is one result when any of its parts passes the filter.
function results(units, keep = () => true) {
  const byId = new Map(units.map((q) => [q.question_id, {...q}]));
  linkGroups(byId);
  return collapseLinked([...byId.values()].filter(keep), byId).length;
}
// Practice opens on "Topics I've covered" when the account has learned topics (97a9048).
// Bank checks count every unit, so switch it off.
async function allTopics(page) {
  const covered = page.locator('[data-covered]').first();
  if (await covered.count() && await covered.isChecked()) {
    await covered.uncheck({force: true});
    await page.waitForTimeout(400);
  }
}
// Some filters sit in a collapsed "More filters" panel: open the panels around a control.
async function reveal(page, selector) {
  await page.evaluate((sel) => {
    for (let node = document.querySelector(sel); node; node = node.parentElement) if (node.tagName === 'DETAILS' && !node.open) node.open = true;
  }, selector);
  return page.locator(selector).first();
}
// Self-marking is a picker (js/ui/mark-picker.js): one button per mark up to 6, a slider
// above. Either way the value lands in the hidden [data-mark] input.
async function pickMark(page, value, scope = page) {
  const picker = scope.locator('[data-markpick]').first();
  const button = picker.locator(`[data-pick="${value}"]`);
  if (await button.count()) await button.click();
  else await picker.locator('[data-pick-range]').fill(String(value));
}
module.exports = {results, allTopics, reveal, pickMark};
