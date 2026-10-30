import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdir,mkdtemp} from 'node:fs/promises';
import path from 'node:path';
import {chromium} from 'playwright';
import {startServer} from '../server.js';

test('Jackery compact editor uses model knowledge in place and keeps optional fault selections and caps', {timeout:60000},async t=>{
 await mkdir('tests/.tmp',{recursive:true});const app=await startServer({dataDir:await mkdtemp(path.resolve('tests/.tmp/jackery-ui-')),demo:true});let browser;
 t.after(async()=>{if(browser)await browser.close();await app.close();});
 browser=await chromium.launch({headless:true,executablePath:'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'});
 const page=await browser.newPage({viewport:{width:1366,height:768}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/api/models/*/knowledge',route=>route.fulfill({json:{faultCodes:[{code:'F0',titleEn:'Charging fault',descriptionZh:'充电故障 <img src=x onerror=alert(1)>',solutionZh:'检查连接',source:{file:'Service Guide.pptx',slide:4}},{code:'F8',titleEn:'Output fault',descriptionEn:'Output protection',solutionEn:'Inspect the output connector',source:{file:'Guide.pptx',slide:5}}],repairGuides:[{id:'g1',titleEn:'Charging repair',stepsZh:['检查电源'],source:{file:'Guide.pptx',slide:6}}],notices:[]}}));
 await page.route('**/api/models/*/bom?*',route=>route.fulfill({json:{items:[{id:999,sku:'CAPPED-PART',descriptionEn:'Connector',unit:'pcs',standardQty:2,quantityControl:'standard_hard_cap',active:true}],total:1}}));
 await page.goto(app.baseUrl);await page.locator('#username').fill('alex');await page.locator('#password').fill('JackeryAlex!2026');await page.getByRole('button',{name:'Sign in',exact:true}).click();await page.locator('#new-record').click();await page.locator('#modelId').selectOption('1');
 assert.equal(await page.title(),'Jackery Service Records');assert.equal(await page.getByText('Reference Details',{exact:true}).count(),0);
 await page.locator('#sn').fill('SCAN-ENTER');await page.locator('#sn').press('Enter');assert.equal(await page.locator('#sn').inputValue(),'SCAN-ENTER');
 await page.locator('#fault-codes').click();await page.locator('[data-fault-select="F0"]').check();await page.locator('[data-fault-select="F8"]').check();await page.locator('#fault-close').click();
 assert.equal(await page.locator('[data-fault-detail]').count(),2);await page.locator('[data-fault-detail="F0"]').click();
 assert.match(await page.locator('#fault-detail-dialog').textContent(),/English guidance not supplied\. Original source shown\./);assert.equal(await page.locator('#fault-detail-dialog img').count(),0);await page.locator('#fault-detail-close').click();
 await page.locator('#issueNotes').fill('retain notes');await page.locator('#language').click();await page.locator('#language').click();assert.equal(await page.locator('#issueNotes').inputValue(),'retain notes');assert.equal(await page.locator('[data-fault-detail]').count(),2);
 await page.locator('#open-guides').click();assert.match(await page.locator('#guides-dialog').textContent(),/Charging repair/);await page.locator('#guides-close').click();
 await page.locator('#open-bom').click();await page.locator('[data-bom-select="999"]').check();assert.equal(await page.locator('[data-pending-qty]').getAttribute('max'),'2');assert.equal(await page.locator('[data-pending-qty]').getAttribute('step'),'1');await page.locator('#bom-add').click();assert.equal(await page.locator('[data-material-qty]').getAttribute('max'),'2');
 await page.locator('[data-material-qty]').fill('3');await page.locator('#save-record').click();assert.match(await page.locator('#form-error').textContent(),/standard/i);
 await mkdir('artifacts/e2e',{recursive:true});for(const viewport of [{width:1366,height:768},{width:1536,height:864}]){await page.setViewportSize(viewport);await page.locator('[data-material-qty]').fill('1');await page.evaluate(()=>{document.querySelector('#form-error').hidden=true;});const bounds=await page.locator('.outcomes').first().boundingBox(),actions=await page.locator('.actions').boundingBox();assert.ok(bounds.y+bounds.height<=viewport.height,JSON.stringify({viewport,bounds}));assert.ok(actions.y+actions.height<=viewport.height);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);t.diagnostic(JSON.stringify({viewport,outcomes:bounds,actions}));await page.screenshot({path:`artifacts/e2e/jackery-compact-${viewport.width}.png`,fullPage:true});}
 assert.deepEqual(errors,[]);await mkdir('artifacts/e2e',{recursive:true});await page.screenshot({path:'artifacts/e2e/jackery-compact-editor.png',fullPage:true});
});

test('model change clears cross-model selections, preserves scanned SN and notes, and ignores stale knowledge', {timeout:60000},async t=>{
 await mkdir('tests/.tmp',{recursive:true});const app=await startServer({dataDir:await mkdtemp(path.resolve('tests/.tmp/jackery-model-')),demo:true});let browser,release;
 t.after(async()=>{release?.();if(browser)await browser.close();await app.close();});
 browser=await chromium.launch({headless:true,executablePath:'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'});const page=await browser.newPage({viewport:{width:1366,height:768}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 const delayed=new Promise(resolve=>release=resolve);let secondStarted;
 const started=new Promise(resolve=>secondStarted=resolve);
 await page.route('**/api/models/*/knowledge',async route=>{const id=new URL(route.request().url()).pathname.split('/')[3];if(id==='2'){secondStarted();await delayed;}await route.fulfill({json:{faultCodes:[{code:id==='1'?'MODEL-1':'MODEL-2',titleEn:'Model '+id+' fault'}],repairGuides:[],notices:[]}});});
 await page.route('**/api/catalog*',async route=>{const response=await route.fetch(),catalog=await response.json();catalog.models[0].checkItems=Array.from({length:10},(_,i)=>({code:'check'+i,labelEn:'Check '+i,labelZh:'检查'+i}));await route.fulfill({json:catalog});});
 await page.goto(app.baseUrl);await page.locator('#username').fill('alex');await page.locator('#password').fill('JackeryAlex!2026');await page.locator('#login-form button').click();await page.locator('#new-record').click();await page.locator('#modelId').selectOption('1');await page.locator('#sn').fill('SCANNED-MODEL-SN');await page.locator('#issueNotes').fill('Keep issue note');await page.locator('[data-check-code="check0"][value="pass"]').check();
 await page.locator('#fault-codes').click();await page.locator('[data-fault-select="MODEL-1"]').check();await page.locator('#fault-close').click();
 await page.locator('.translations summary').click();await page.locator('#translatedIssueNotes').fill('保留问题');await page.locator('#language').click();await page.locator('#language').click();assert.equal(await page.locator('.translations').getAttribute('open'),'');assert.equal(await page.locator('#translatedIssueNotes').inputValue(),'保留问题');
 const bounds=await page.locator('.outcomes').first().boundingBox();assert.ok(bounds.y+bounds.height<=768);assert.equal(await page.locator('.check-table-wrap').evaluate(el=>el.scrollHeight>el.clientHeight),true);
 page.once('dialog',d=>d.accept());await page.locator('#modelId').selectOption('2');await started;assert.equal(await page.locator('#sn').inputValue(),'SCANNED-MODEL-SN');assert.equal(await page.locator('#issueNotes').inputValue(),'Keep issue note');assert.equal(await page.locator('[data-fault-detail]').count(),0);assert.equal(await page.locator('[data-check-phase=initial][value=pass]:checked').count(),0);
 page.once('dialog',d=>d.accept());await page.locator('#modelId').selectOption('1');await page.locator('#fault-codes').click();assert.equal(await page.locator('[data-fault-select="MODEL-1"]').isChecked(),false);release();await page.locator('#fault-close').click();await page.locator('#fault-codes').click();assert.equal(await page.locator('[data-fault-select="MODEL-2"]').count(),0);assert.equal(await page.locator('[data-fault-select="MODEL-1"]').count(),1);await page.locator('#fault-close').click();assert.deepEqual(errors,[]);
});
