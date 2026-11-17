// Tier picker (owner choice 2026-11-17, option A): add GCSE Maths on Foundation, then practice and
// past papers start on that tier. Server on :5173; screenshots go to the mock-up folder when it exists.
const {chromium}=require('playwright'); const assert=require('node:assert/strict');
const base='http://localhost:5173', S='EDX_GCSE_MATH_1MA1';
(async()=>{const b=await chromium.launch(); const errors=[];
for (const w of [1280,390]){
const p=await b.newPage({viewport:{width:w,height:1000},deviceScaleFactor:2});
p.on('pageerror',e=>errors.push(e.message)); p.on('console',m=>{if(m.type()==='error')errors.push(m.text())});
await p.goto(base);await p.evaluate(async id=>{await (await import('/js/data/demo.js')).enterDemoAccount();await (await import('/js/data/api.js')).setEnrolled(id,false);},S);
await p.goto(base+'/#/subjects');await p.waitForTimeout(1200);
const lv=p.locator('[data-level]',{hasText:'GCSE'}); if(await lv.count()) await lv.first().click();
await p.locator('[data-search]').fill('Mathematics');await p.waitForTimeout(400);
await p.locator(`[data-enrol="${S}"]`).click();await p.waitForTimeout(800);
const d=p.locator('dialog[open]');
assert.equal(await d.locator('input[name=tier]').count(),3);
await d.locator('.tier-pick',{hasText:'Foundation'}).click();
await d.locator('input[name=target][value="5"]').check({force:true});
await d.locator('input[name=learned][value=skip]').check({force:true});
await d.locator('.tier-picks').scrollIntoViewIfNeeded();
await d.locator('.modal__box').screenshot({path:(process.env.AUDIT_SCREENSHOT_DIR||'/tmp')+`/tier-picker-${w}.png`});
await d.getByRole('button',{name:'Add Mathematics'}).click();await p.waitForTimeout(800);
assert.equal(await p.evaluate(async()=>(await import('/js/data/api.js')).getProgress().preferences.tiers?.EDX_GCSE_MATH_1MA1),'Foundation');
await p.goto(base+'/#/practice?subject='+S);await p.waitForSelector('[data-output] [role="status"]');
const n=Number((await p.locator('[data-output] [role="status"]').first().textContent()).match(/\d+/)[0]);
console.log(w,'practice count',n);
assert.equal(n,1217);
await p.locator('[data-reset-filters]').first().click(); await p.waitForTimeout(300);
assert.equal(Number((await p.locator('[data-output] [role="status"]').first().textContent()).match(/\d+/)[0]),1217);
await p.goto(base+'/#/papers?subject='+S);await p.waitForSelector('[data-list]');await p.waitForTimeout(500);
if(w===1280) await p.screenshot({path:(process.env.AUDIT_SCREENSHOT_DIR||'/tmp')+'/tier-papers-1280.png'});
const txt=await p.locator('[data-list]').innerText().catch(()=> '');
console.log(w,'papers H mentions',(txt.match(/Higher/g)||[]).length,'F mentions',(txt.match(/Foundation/g)||[]).length);
assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth),w);
await p.close();}
assert.deepEqual(errors,[]); console.log('PASS'); await b.close();})().catch(e=>{console.error(e);process.exit(1)});
