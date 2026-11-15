// Isolated browser profiles; never changes a real student's account.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert=require('node:assert/strict');
const base=process.env.AUDIT_URL || 'http://localhost:5173';
const subject='EDX_ALEVEL_MATH_9MA0';
const section='TB_MATH_P1_6.2';

(async()=>{
  const browser=await chromium.launch({headless:true,...(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{})});
  try {
    const page=await browser.newPage({viewport:{width:1440,height:1000}});
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.goto(base);
    await page.evaluate(async()=>(await import('/js/data/demo.js')).enterDemoAccount());
    const practice=async()=>{await page.goto(base+'/#/practice?subject='+subject);await page.waitForSelector('[data-reset-filters]')};
    await practice();await page.locator('[data-reset-filters]').click();
    assert(await page.locator('[data-topic-organisation="textbook"]').isChecked());
    assert.equal(await page.locator('[data-point]').count(),251);
    assert.equal(await page.locator('.tree__section--filter').count(),4);
    assert.equal(await page.locator('[data-scheme]').count(),30);
    assert.equal(await page.locator('[data-filter="sampleMode"]').count(),0);
    assert.equal(await page.locator('[data-topic-coverage]').count(),2);
    const snapshot=await page.evaluate(async()=>JSON.stringify((await import('/js/data/api.js')).getProgress().learned_spec_points));
    const search=page.locator('[data-tree-search]');
    await search.fill('6.2 pure1');
    assert.deepEqual(await page.locator('[data-point-row]:visible').evaluateAll(es=>es.map(e=>e.dataset.pointRow)),[section]);
    assert((await page.locator('[data-point-row]:visible').innerText()).includes('Equation of a circle'));
    await page.locator('[data-tree-bulk="none"]').click();
    await page.locator(`[data-point="${section}"]`).check();
    const count=async()=>Number((await page.locator('[data-output] [role="status"]').first().textContent()).match(/\d+/)[0]);
    await page.locator('[data-topic-coverage="crossover"]').check();
    const crossover=await count();assert(crossover>0);
    await page.locator('[data-topic-coverage="strict"]').check();
    const strict=await count();assert(strict<=crossover);
    await page.locator('[data-topic-coverage="crossover"]').check();
    const reference=page.locator('[data-question-references]').first();
    await reference.locator('summary').click();
    assert((await reference.innerText()).includes('Pure 1 · 6.2 Equation of a circle'));
    assert((await reference.innerText()).includes('Circles: equation, tangents and chord properties'));
    const qid=await reference.getAttribute('data-question-references');
    await page.locator('[data-multi="difficulties"][data-value="easy"]').click();
    if(await page.locator(`[data-question-references="${qid}"]`).count())
      assert(await page.locator(`[data-question-references="${qid}"]`).evaluate(e=>e.open));
    await page.locator('[data-topic-organisation="official"]').check();
    assert.equal(await page.locator('[data-point]').count(),90);
    await page.locator('[data-topic-organisation="textbook"]').check();
    assert(await page.locator(`[data-point="${section}"]`).isChecked());
    assert.equal(await page.evaluate(async()=>JSON.stringify((await import('/js/data/api.js')).getProgress().learned_spec_points)),snapshot);

    await page.goto(base+'/#/subject/'+subject);
    await page.waitForSelector('[data-topic-organisation="textbook"]');
    assert(await page.locator('[data-topic-organisation="textbook"]').isChecked());
    await page.locator('[data-tree-search]').fill('6.2 pure1');
    await page.locator(`[data-point="${section}"]`).check();
    await page.waitForFunction(async section=>(await import('/js/data/api.js')).getProgress().learned_textbook_sections.includes(section),section);
    assert.equal(await page.evaluate(async()=>JSON.stringify((await import('/js/data/api.js')).getProgress().learned_spec_points)),snapshot);
    await page.reload();await page.waitForSelector('[data-tree-search]');
    await page.locator('[data-tree-search]').fill('6.2 pure1');
    assert(await page.locator(`[data-point="${section}"]`).isChecked());
    await practice();await page.locator('[data-reset-filters]').click();
    await page.locator('[data-flag="learnedOnly"]').check();
    assert((await count())>0);
    const proof=await page.evaluate(async subject=>{
      const {getBundle,specIndex}=await import('/js/data/content-repository.js');
      const api=await import('/js/data/api.js');
      const {filterQuestions}=await import('/js/engine/filter-engine.js');
      const bundle=await getBundle(subject);
      const matches=filterQuestions(bundle.questions,{learnedNamespace:'textbook'},{specIndex,learned:api.learnedSet()}).matches;
      return {count:matches.length,all:matches.every(q=>Object.values(q.textbook_requirements).every(group=>group.ids.every(id=>id==='TB_MATH_P1_6.2'))),demos:bundle.questions.some(q=>q.is_sample),historical:bundle.questionsById.has('EDX_9MA0_DEMO_PURE_Q01'),samples:bundle.questions.filter(q=>q.is_official_sample).length};
    },subject);
    assert.equal(await count(),proof.count);assert(proof.all&&!proof.demos&&proof.historical&&proof.samples===119);
    await page.locator('[data-flag="learnedOnly"]').uncheck();
    for(const width of [320,390,768,1440]){
      await page.setViewportSize({width,height:1000});
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth),width);
    }
    if(process.env.AUDIT_DIR){
      await page.locator('.question-filters').screenshot({path:process.env.AUDIT_DIR+'/textbook-filters.png'});
      await page.locator('[data-question-references]').first().locator('summary').click();
      await page.locator('[data-question-references]').first().screenshot({path:process.env.AUDIT_DIR+'/textbook-references.png'});
      await page.setViewportSize({width:390,height:1000});
      await page.locator('.question-filters').screenshot({path:process.env.AUDIT_DIR+'/textbook-filters-mobile.png'});
    }
    const guest=await browser.newPage();
    await guest.goto(base);
    await guest.evaluate(async subject=>{const api=await import('/js/data/api.js');await api.setEnrolled(subject,true)},subject);
    await guest.goto(base+'/#/practice?subject='+subject);await guest.waitForSelector('[data-reset-filters]');
    assert.equal(await guest.getByText('Edit learned topics',{exact:true}).count(),0);
    assert.equal(await guest.locator('[data-flag="learnedOnly"]').count(),0);
    assert.equal(await guest.locator('[data-point]').count(),251);
    assert.deepEqual(errors,[]);
    console.log('4 books / 45 chapters / 251 points; Pure1 6.2 search; strict/crossover; expandable names; independent persisted textbook learning; guests select freely; demos hidden/history retained; 4 widths: PASS');
  } finally {await browser.close()}
})().catch(e=>{console.error(e);process.exit(1)});
