import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {chromium} from 'playwright';
import {startServer} from '../server.js';
import {categoryData} from './bom-category-fixture.js';

async function fixture(t,classified=true){
 const {dataDir}=await categoryData(classified),app=await startServer({dataDir,demo:true});let browser;t.after(async()=>{await browser?.close();await app.close();});
 browser=await chromium.launch({headless:true,executablePath:'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'});const page=await browser.newPage({viewport:{width:1366,height:768}});page.setDefaultTimeout(5000);const errors=[];page.on('pageerror',e=>errors.push(e.message));t.after(()=>assert.deepEqual(errors,[]));
 await page.goto(app.baseUrl);await page.locator('#username').fill('alex');await page.locator('#password').fill('JackeryAlex!2026');await page.locator('#login-form button').click();await page.locator('#new-record').click();await page.locator('#sn').fill('CATEGORY-TABS-TEST');await page.locator('#modelId').selectOption('1');await page.locator('#open-bom').click();await page.waitForFunction(()=>document.querySelector('#bom-count')?.textContent);
 const category=async id=>{const r=page.waitForResponse(r=>r.url().includes('/bom?')&&new URL(r.url()).searchParams.get('category')===id);await page.locator(`[data-bom-category="${id}"]`).click();await r;await page.waitForFunction(()=>document.querySelector('#bom-count')?.textContent);};
 return {app,page,category};
}
test('top category tabs preserve pending quantities across category, search, pagination and language; no duplicate rows',{timeout:60000},async t=>{
 const {page,category}=await fixture(t);assert.equal(await page.locator('[data-bom-category]').count(),4);assert.equal(await page.locator('[data-bom-category=all]').getAttribute('aria-pressed'),'true');assert.match(await page.locator('#bom-category-note').innerText(),/2/);
 await category('core');await page.locator('[data-bom-select="1"]').check();await page.locator('[data-pending-qty="1"]').fill('3');await page.locator('#bom-next').click();await page.locator('[data-bom-select="51"]').waitFor();assert.match(await page.locator('#bom-page').innerText(),/2 \/ 2/);
 await page.locator('[data-bom-select="51"]').check();await category('packaging');assert.match(await page.locator('#bom-page').innerText(),/1 \/ 1/);await page.locator('[data-bom-select="60"]').check();assert.equal(await page.locator('[data-pending-qty="1"]').inputValue(),'3');
 await page.locator('#bom-search').fill('PACK-002');await page.locator('#bom-search-form button').click();await page.waitForFunction(()=>document.querySelectorAll('#bom-results [data-bom-select]').length===1);assert.equal(await page.locator('[data-pending-sku]').count(),3);
 await page.locator('#bom-language').click();await page.waitForFunction(()=>document.documentElement.lang==='zh');assert.equal(await page.locator('[data-bom-category=packaging]').getAttribute('aria-pressed'),'true');assert.match(await page.locator('[data-bom-category=packaging]').textContent(),/包材/);assert.equal(await page.locator('#bom-search').inputValue(),'PACK-002');assert.equal(await page.locator('[data-pending-qty="1"]').inputValue(),'3');
 await page.locator('#bom-add').click();assert.equal(await page.locator('#material-rows tr').count(),3);assert.equal(await page.locator('[data-material-row="1"] [data-material-qty]').inputValue(),'3');
 await page.locator('#open-bom').click();await category('core');assert.equal(await page.locator('[data-bom-select="1"]').isDisabled(),true);assert.equal(await page.locator('[data-bom-select="1"]').isChecked(),true);
});
test('category layout fits desktop viewports; caps and same-model scope remain enforced',{timeout:60000},async t=>{
 const {page,category}=await fixture(t);await category('packaging');await page.locator('[data-bom-select="60"]').check();await page.locator('[data-pending-qty="60"]').fill('5');await page.locator('#bom-add').click();await page.locator('#bom-dialog').waitFor();assert.equal(await page.locator('#material-rows tr [data-material-qty]').count(),0);await page.locator('[data-pending-qty="60"]').fill('4');
 await mkdir('artifacts/bom-categories',{recursive:true});for(const viewport of [{width:1366,height:768},{width:1536,height:864}]){await page.setViewportSize(viewport);const tabs=await page.locator('#bom-categories').boundingBox(),pending=await page.locator('#bom-pending').boundingBox(),footer=await page.locator('#bom-dialog .dialog-footer').boundingBox();assert.ok(tabs.y+tabs.height<footer.y);assert.ok(pending.x>tabs.x);assert.ok(footer.y+footer.height<=viewport.height);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);assert.equal(await page.locator('#bom-dialog').evaluate(e=>e.scrollWidth>e.clientWidth),false);await page.screenshot({path:`artifacts/bom-categories/drawer-${viewport.width}.png`});}
 await page.locator('#bom-add').click();assert.equal(await page.locator('[data-material-row="60"] [data-material-qty]').inputValue(),'4');
});
test('unclassified legacy BOM stays selectable in All; empty categories explain that source classification is pending',{timeout:60000},async t=>{
 const {page,category}=await fixture(t,false);assert.match(await page.locator('#bom-category-note').innerText(),/64/);assert.ok(await page.locator('[data-bom-select]').count()>0);
 await category('core');assert.equal(await page.locator('[data-bom-select]').count(),0);assert.match(await page.locator('#bom-results').innerText(),/Category labels are pending/);
 await page.locator('#bom-language').click();await page.waitForFunction(()=>document.documentElement.lang==='zh');assert.match(await page.locator('#bom-results').innerText(),/分类标注待补充/);await category('all');assert.ok(await page.locator('[data-bom-select]').count()>0);
});
