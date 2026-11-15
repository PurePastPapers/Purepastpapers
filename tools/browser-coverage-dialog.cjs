// Real subject setup, isolated demo profile: no existing student data is used.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert=require('node:assert/strict');
const base=process.env.AUDIT_URL || 'http://localhost:5173';
const subject='EDX_ALEVEL_MATH_9MA0';
const circle='TB_MATH_P1_6.2', retained='TB_MATH_P2_8.1';
const official='EDX_MATH_PURE_ALG_2.1';

(async()=>{
  const browser=await chromium.launch({headless:true,...(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{})});
  try {
    const page=await browser.newPage({viewport:{width:1440,height:1000}});
    const errors=[];page.on('pageerror',error=>errors.push(error.message));
    await page.goto(base);
    await page.evaluate(async retained=>{
      await (await import('/js/data/demo.js')).enterDemoAccount();
      const api=await import('/js/data/api.js');
      await api.setTextbookLearned([retained],true);
    },retained);
    const progress=()=>page.evaluate(async()=>{
      const p=(await import('/js/data/api.js')).getProgress();
      return {official:[...p.learned_spec_points].sort(),textbook:[...p.learned_textbook_sections].sort()};
    });
    const before=await progress();assert(before.official.includes(official));
    async function openSetup(learning='tick',id=subject) {
      await page.evaluate(async id=>(await import('/js/data/api.js')).setEnrolled(id,false),id);
      const url=base+'/#/subjects';
      if(page.url()===url) await page.reload(); else await page.goto(url);
      await page.locator(`[data-enrol="${id}"]`).first().click();
      const first=page.locator('dialog[open]');
      await first.waitFor();
      if(id===subject) {
        const bookMode=await page.evaluate(async id=>(await import('/js/data/api.js')).getProgress().preferences[`coveredView:${id}`]!=='official',id);
        assert.equal(await first.getByText(bookMode?'ticks all 251 textbook sections':'ticks all 90 spec points',{exact:true}).count(),1);
      }
      await first.locator(`input[name="learned"][value="${learning}"]`).check();
      await first.locator('button[type="submit"]').click();
      if(learning==='tick') await page.locator('dialog.modal--coverage[open]').waitFor();
    }
    const dialog=()=>page.locator('dialog.modal--coverage[open]');
    const search=()=>dialog().locator('[data-tree-search]');
    await openSetup();
    assert(await dialog().locator('[data-topic-organisation="textbook"]').isChecked());
    assert.equal(await dialog().locator('[data-point]').count(),251);
    assert.equal(await dialog().locator('.tree__section--filter').count(),4);
    assert.equal(await dialog().locator('[data-curriculum-book]').count(),0);
    if(process.env.AUDIT_DIR) await dialog().screenshot({path:process.env.AUDIT_DIR+'/covered-topics-textbooks.png'});
    await search().fill('6.2 pure1');
    assert.deepEqual(await dialog().locator('[data-point-row]:visible').evaluateAll(es=>es.map(e=>e.dataset.pointRow)),[circle]);
    await dialog().locator(`[data-point="${circle}"]`).check();
    await dialog().locator('[data-topic-organisation="official"]').check();
    assert.equal(await dialog().locator('[data-point]').count(),90);
    await search().fill('2.1');
    await dialog().locator(`[data-point="${official}"]`).uncheck();
    await dialog().locator('[data-topic-organisation="textbook"]').check();
    assert(await dialog().locator(`[data-point="${circle}"]`).isChecked());
    await dialog().locator('[data-curriculum-year]').selectOption('12');
    assert.equal(await dialog().locator('[data-point]').count(),138);
    await dialog().locator('[data-curriculum-year]').selectOption('13');
    assert.equal(await dialog().locator('[data-point]').count(),251);
    await dialog().locator('[data-year13-only]').check();
    assert.equal(await dialog().locator('[data-point]').count(),113);
    assert(await dialog().locator(`[data-point="${retained}"]`).isChecked());
    await dialog().locator('[data-curriculum-year]').selectOption('');
    assert(await dialog().locator(`[data-point="${circle}"]`).isChecked());
    assert.deepEqual(await progress(),before,'draft edits are not saved while switching views');
    for(const width of [320,390,768,1440]) {
      await page.setViewportSize({width,height:1000});
      const bounds=await dialog().evaluate(d=>({left:d.getBoundingClientRect().left,right:d.getBoundingClientRect().right,width:window.innerWidth,overflow:d.scrollWidth>d.clientWidth}));
      assert(bounds.left>=0 && bounds.right<=bounds.width && !bounds.overflow,JSON.stringify(bounds));
    }
    if(process.env.AUDIT_DIR){
      await page.setViewportSize({width:390,height:1000});
      await dialog().screenshot({path:process.env.AUDIT_DIR+'/covered-topics-textbooks-mobile.png'});
      await page.setViewportSize({width:1440,height:1000});
    }
    await dialog().getByRole('button',{name:'Cancel',exact:true}).click();
    assert.deepEqual(await progress(),before,'Cancel leaves both learned namespaces unchanged');

    await openSetup();
    await search().fill('6.2 pure1');
    await dialog().locator(`[data-point="${circle}"]`).check();
    await dialog().locator('[data-topic-organisation="official"]').check();
    await search().fill('2.1');
    await dialog().locator(`[data-point="${official}"]`).uncheck();
    await dialog().locator('[data-topic-organisation="textbook"]').check();
    await dialog().getByRole('button',{name:'Save and continue adding subjects',exact:true}).click();
    await page.waitForFunction(async({circle,official})=>{
      const p=(await import('/js/data/api.js')).getProgress();
      return p.learned_textbook_sections.includes(circle) && !p.learned_spec_points.includes(official);
    },{circle,official});
    assert.deepEqual(await progress(),{official:before.official.filter(id=>id!==official),textbook:[...before.textbook,circle].sort()});
    await page.reload();await page.waitForSelector('[data-level]');
    await openSetup();
    assert(await dialog().locator(`[data-point="${circle}"]`).isChecked());
    assert(await dialog().locator(`[data-point="${retained}"]`).isChecked());
    await dialog().getByRole('button',{name:'Cancel',exact:true}).click();

    const saved=await progress();
    await openSetup('all');
    await page.waitForFunction(async()=>((await import('/js/data/api.js')).getProgress().learned_textbook_sections.length===251));
    assert.equal(await page.locator('dialog[open]').count(),0);
    assert.deepEqual((await progress()).official,saved.official);
    assert.equal((await progress()).textbook.length,251);
    const mathCard=page.locator('[data-subject-card="'+subject+'"]');
    await mathCard.getByText('251/251 textbook sections learned',{exact:true}).waitFor();
    const allBooks=(await progress()).textbook;
    await page.evaluate(async subject=>(await import('/js/data/api.js')).setPreference(`coveredView:${subject}`,'official'),subject);
    await openSetup('all');
    await page.waitForFunction(async official=>(await import('/js/data/api.js')).getProgress().learned_spec_points.includes(official),official);
    assert.deepEqual((await progress()).textbook,allBooks,'cover-all honours the explicit official namespace without editing textbook coverage');

    await openSetup('tick','EDX_ALEVEL_PHYS_9PH0');
    assert.equal(await dialog().locator('[data-topic-organisation]').count(),0);
    assert((await dialog().locator('[data-point]').count())>0);
    await dialog().getByRole('button',{name:'Cancel',exact:true}).click();
    assert.deepEqual(errors,[]);
    console.log('Covered popup: 4 books/251 sections; scoped search; separate drafts; Year12 138/Year13 cumulative251/additional113; Cancel and Save; reload; cover-all251; non-textbook fallback; 4 widths: PASS');
  } finally {await browser.close()}
})().catch(error=>{console.error(error);process.exit(1)});
