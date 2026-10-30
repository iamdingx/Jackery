import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdir,mkdtemp} from 'node:fs/promises';
import path from 'node:path';
import {chromium} from 'playwright';
import {startServer} from '../server.js';
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAADCAIAAAA2iEnWAAAAEUlEQVR4nGP8zwACTGASRgEAFEABBVDVLjgAAAAASUVORK5CYII=','base64');
async function fixture(t){
 await mkdir('tests/.tmp',{recursive:true});const app=await startServer({dataDir:await mkdtemp(path.resolve('tests/.tmp/model-entry-')),demo:true});
 const browser=await chromium.launch({headless:true,executablePath:'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'}),page=await browser.newPage({viewport:{width:1366,height:768}}),errors=[];
 page.setDefaultTimeout(6000);page.on('pageerror',e=>errors.push(e.message));t.after(async()=>{await browser.close();await app.close();assert.deepEqual(errors,[]);});
 await page.goto(app.baseUrl);return {page,app,login:async()=>{await page.locator('#username').fill('alex');await page.locator('#password').fill('JackeryAlex!2026');await page.locator('#login-form button').click();await page.locator('#new-record').waitFor();}};
}
test('new work starts with no model, Jackery wordmark and disabled work inputs across language switches',{timeout:60000},async t=>{
 const {page,login}=await fixture(t);assert.equal(await page.locator('.brandmark').textContent(),'Jackery');await login();assert.equal(await page.locator('.brandmark').textContent(),'Jackery');
 const requests=[];page.on('request',r=>{if(/\/api\/models\/.*\/(knowledge|bom)/.test(r.url()))requests.push(r.url());});await page.locator('#new-record').click();await page.locator('#sn').fill('MANUAL-MODEL-001');
 for(let i=0;i<2;i++){
  assert.equal(await page.locator('#modelId').inputValue(),'');assert.equal(await page.locator('#modelId option:checked').textContent(),i===0?'Select model':'选择型号');assert.equal(await page.locator('#productSku').inputValue(),'');assert.equal(await page.locator('#sn').isEnabled(),true);assert.equal(await page.locator('#modelId').isEnabled(),true);
  for(const selector of ['#fault-codes','#open-guides','#open-bom','#appearanceNotes','#issueNotes','#choose-photo','#upload-photo','[name=outcome]','#save-record','#complete-record'])assert.equal(await page.locator(selector).first().isDisabled(),true,selector);
  assert.equal(await page.locator('.checks input[type=radio]').count(),0);await page.locator('#language').click();assert.equal(await page.locator('#sn').inputValue(),'MANUAL-MODEL-001');
 }
 assert.deepEqual(requests,[]);await page.locator('#modelId').selectOption('1');await page.waitForFunction(()=>document.querySelector('#fault-codes')?.disabled===false);for(const selector of ['#open-bom','#appearanceNotes','#issueNotes','#choose-photo','#save-record','#complete-record'])assert.equal(await page.locator(selector).isEnabled(),true,selector);assert.equal(await page.locator('.checks input[type=radio]').count(),9);
 for(const viewport of [{width:1366,height:768},{width:1536,height:864}]){await page.setViewportSize(viewport);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);const b=await page.locator('.actions').boundingBox();assert.ok(b.y+b.height<=viewport.height);}
});
test('model switch never confirms and clears model-specific checks, faults and materials while retaining SN and notes',{timeout:60000},async t=>{
 const {page,login}=await fixture(t);await page.route('**/api/models/*/knowledge',route=>route.fulfill({json:{faultCodes:[{code:'F0',titleEn:'Fault',descriptionEn:'Description'}],repairGuides:[],notices:[]}}));await login();const dialogs=[];page.on('dialog',d=>{dialogs.push(d.message());d.accept();});
 await page.locator('#new-record').click();await page.locator('#sn').fill('NO-MODEL-CONFIRM');await page.locator('#modelId').selectOption('1');await page.locator('#issueNotes').fill('Keep this original note');await page.locator('[data-check-code=ac_output][value=pass]').check();await page.locator('#fault-codes').click();await page.locator('[data-fault-select=F0]').check();await page.locator('#fault-close').click();await page.locator('#open-bom').click();await page.locator('[data-bom-select]').first().check();await page.locator('#bom-add').click();assert.equal(await page.locator('[data-material-qty]').count(),1);
 await page.locator('#modelId').selectOption('2');assert.deepEqual(dialogs,[]);assert.equal(await page.locator('#sn').inputValue(),'NO-MODEL-CONFIRM');assert.equal(await page.locator('#issueNotes').inputValue(),'Keep this original note');assert.equal(await page.locator('[data-material-qty]').count(),0);assert.equal(await page.locator('[data-fault-detail]').count(),0);assert.equal(await page.locator('.checks input[value=pass]:checked').count(),0);
 await page.locator('#modelId').selectOption('');assert.equal(await page.locator('#issueNotes').isDisabled(),true);assert.equal(await page.locator('#save-record').isDisabled(),true);assert.equal(await page.locator('#productSku').inputValue(),'');assert.deepEqual(dialogs,[]);
});
test('actual image validation rejection exposes its reason, retains the file and accepts a valid replacement',{timeout:60000},async t=>{
 const {page,app,login}=await fixture(t);await login();await page.locator('#new-record').click();await page.locator('#sn').fill('PHOTO-DIAGNOSTICS');await page.locator('#modelId').selectOption('1');
 await page.locator('#photo-file').setInputFiles({name:'truncated.jpg',mimeType:'image/jpeg',buffer:Buffer.from([255,216,255,217])});const rejected=page.waitForResponse(r=>r.url().endsWith('/photos')&&r.request().method()==='POST');await page.locator('#upload-photo').click();assert.equal((await rejected).status(),422);await page.waitForFunction(()=>document.querySelector('#form-error')?.hidden===false);
 assert.match(await page.locator('#form-error').textContent(),/Upload failed\. Your photo has not been saved\. Please try again\./);assert.match(await page.locator('#form-error').textContent(),/IMAGE_INVALID/);assert.match(await page.locator('#form-error').textContent(),/Invalid JPEG ending/);assert.equal(await page.locator('#photos img').count(),0);
 await page.locator('#language').click();await page.locator('#language').click();assert.equal(await page.locator('#photo-selection').textContent(),'Photo selected');await page.locator('#photo-file').setInputFiles({name:'valid.png',mimeType:'image/png',buffer:png});const uploaded=page.waitForResponse(r=>r.url().endsWith('/photos')&&r.request().method()==='POST');await page.locator('#upload-photo').click();assert.equal((await uploaded).status(),201);await page.waitForFunction(()=>document.querySelector('#photos img')?.naturalWidth===2);const result=await (await page.request.get(app.baseUrl+'/api/records?q=PHOTO-DIAGNOSTICS')).json();assert.equal(result.items[0].photos.length,1);
});
