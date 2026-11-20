// Isolated browser profile: verify test-only topic selection never edits mastery.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert=require('node:assert/strict');
const base=process.env.AUDIT_URL || 'http://localhost:5173';
const subject='EDX_ALEVEL_MATH_9MA0';
const learnedCircle='TB_MATH_P1_6.2';
const learnedExtra='TB_MATH_P1_6.1';
const testOnly='TB_MATH_P1_2.1';

(async()=>{
  const browser=await chromium.launch({headless:true,...(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{})});
  try {
    const page=await browser.newPage({viewport:{width:1440,height:1000}});
    const errors=[];page.on('pageerror',error=>errors.push(error.message));
    await page.goto(base);
    await page.evaluate(async({subject,learnedCircle,learnedExtra})=>{
      await (await import('/js/data/demo.js')).enterDemoAccount();
      const api=await import('/js/data/api.js');
      await api.setEnrolled(subject,true);
      await api.setPreference(`coveredView:${subject}`,'textbook');
      const prior=api.getProgress().learned_textbook_sections;
      if(prior.length) await api.setTextbookLearned(prior,false);
      await api.setTextbookLearned([learnedCircle,learnedExtra],true);
    },{subject,learnedCircle,learnedExtra});
    const saved=await page.evaluate(async()=>{
      const p=(await import('/js/data/api.js')).getProgress();
      return {official:[...p.learned_spec_points].sort(),textbook:[...p.learned_textbook_sections].sort()};
    });
    await page.goto(`${base}/#/practice?subject=${subject}&mode=timed_test`);
    await page.locator('[data-toggle-tree]').waitFor();
    const tree=()=>page.locator('[data-tree]');
    assert(await tree().isVisible(),'topic checklist opens by default');
    assert(await page.locator('[data-topic-organisation="textbook"]').isChecked());
    // "Topics I've covered" is on by default (97a9048): the checklist holds the learned
    // subsections, all chosen.
    assert(await page.locator('[data-covered]').isChecked(),'covered topics by default');
    assert.equal(await page.locator('[data-point]').count(),2);
    assert(await page.locator(`[data-point="${learnedCircle}"]`).isChecked());
    assert(await page.locator(`[data-point="${learnedExtra}"]`).isChecked());
    assert.equal(await page.locator('[data-tree-count]').innerText(),'2 of 2 chosen');

    await page.locator('[data-toggle-tree]').click();
    assert(await tree().isHidden(),'the checklist can be closed');
    await page.locator('[data-toggle-tree]').click();
    assert(await tree().isVisible(),'the checklist can be reopened');

    // Switched off, every subsection is offered (and chosen); the test can then be narrowed
    // to a learned subsection plus one not yet learned.
    await page.locator('[data-covered]').uncheck({force:true});
    await page.waitForFunction(()=>document.querySelectorAll('[data-point]').length===251);
    assert.equal(await page.locator('[data-tree-count]').innerText(),'251 of 251 chosen');
    await page.locator('[data-tree-bulk="none"]').click();
    assert.equal(await page.locator('[data-tree-count]').innerText(),'0 of 251 chosen');
    await page.locator('[data-tree-search]').fill('6.2 pure1');
    await page.locator(`[data-point="${learnedCircle}"]`).check();
    await page.locator('[data-tree-search]').fill('2.1 pure1');
    await page.locator(`[data-point="${testOnly}"]`).check();
    assert.equal(await page.locator('[data-tree-count]').innerText(),'2 of 251 chosen');
    assert.deepEqual(await page.evaluate(async()=>{
      const key=Object.keys(localStorage).find(item=>item.includes(':practice:'));
      const state=JSON.parse(localStorage.getItem(key));
      return [...state.testTextbookFocus].sort();
    }),[learnedCircle,testOnly].sort(),'test scope stores the chosen learned subsection plus a test-only one');

    const after=await page.evaluate(async()=>{
      const p=(await import('/js/data/api.js')).getProgress();
      return {official:[...p.learned_spec_points].sort(),textbook:[...p.learned_textbook_sections].sort()};
    });
    assert.deepEqual(after,saved,'test checklist edits leave saved learning unchanged');

    await page.locator('[data-mode="individual"]').click();
    assert.equal(await page.evaluate(async()=>{
      const key=Object.keys(localStorage).find(item=>item.includes(':practice:'));
      return JSON.parse(localStorage.getItem(key)).focus;
    }),null,'test scope does not overwrite the individual-practice focus');
    await page.locator('[data-mode="timed_test"]').click();
    assert.deepEqual(await page.evaluate(async()=>{
      const key=Object.keys(localStorage).find(item=>item.includes(':practice:'));
      return [...JSON.parse(localStorage.getItem(key)).testTextbookFocus].sort();
    }),[learnedCircle,testOnly].sort(),'switching modes keeps the test scope separate');
    await page.reload();
    await page.locator('[data-toggle-tree]').waitFor();
    assert.deepEqual(await page.evaluate(async()=>{
      const key=Object.keys(localStorage).find(item=>item.includes(':practice:'));
      return [...JSON.parse(localStorage.getItem(key)).testTextbookFocus].sort();
    }),[learnedCircle,testOnly].sort(),'test-only choices survive reload');
    assert.equal(await page.locator('[data-tree-count]').innerText(),'2 of 251 chosen');
    assert.equal(await page.locator(`[data-point="${learnedExtra}"]`).isChecked(),false);
    for(const width of [320,390,768,1440]) {
      await page.setViewportSize({width,height:1000});
      // layout settles after a resize (js/ui/question-fit.js re-places the answer box)
      await page.waitForFunction((w) => document.documentElement.scrollWidth <= w, width, {timeout: 2000}).catch(() => {});
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth),width,`no horizontal overflow at ${width}px`);
    }
    assert.deepEqual(errors,[]);
    console.log('Test builder: covered subsections by default, all on switch-off; open/close checklist; per-test edits persist; saved learning unchanged: PASS');
  } finally {await browser.close()}
})().catch(error=>{console.error(error);process.exit(1)});
