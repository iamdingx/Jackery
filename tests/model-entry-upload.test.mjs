import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdir,mkdtemp,readFile} from 'node:fs/promises';
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
 await page.locator('#photo-file').setInputFiles({name:'truncated.jpg',mimeType:'image/jpeg',buffer:Buffer.from([255,216,255,217])});const rejected=page.waitForResponse(r=>r.url().endsWith('/photos')&&r.request().method()==='POST');await page.locator('#upload-photo').click();assert.equal((await rejected).status(),422);await page.waitForFunction(()=>document.querySelector('#photo-error')?.hidden===false);
 assert.match(await page.locator('#photo-error').textContent(),/Upload failed\. Your photo has not been saved\. Please try again\./);assert.match(await page.locator('#photo-error').textContent(),/IMAGE_INVALID/);assert.match(await page.locator('#photo-error').textContent(),/Invalid JPEG ending/);assert.equal(await page.locator('#photos img').count(),0);
 await page.locator('#language').click();await page.locator('#language').click();assert.equal(await page.locator('#photo-selection').textContent(),'Photo selected');await page.locator('#photo-file').setInputFiles({name:'valid.png',mimeType:'image/png',buffer:png});const uploaded=page.waitForResponse(r=>r.url().endsWith('/photos')&&r.request().method()==='POST');await page.locator('#upload-photo').click();assert.equal((await uploaded).status(),201);await page.waitForFunction(()=>document.querySelector('#photos img')?.naturalWidth===2);const result=await (await page.request.get(app.baseUrl+'/api/records?q=PHOTO-DIAGNOSTICS')).json();assert.equal(result.items[0].photos.length,1);
});
test('photo upload validates SN, waits for server confirmation and retries a lost response only once',{timeout:60000},async t=>{
 const {page,app,login}=await fixture(t);
 await login();
 await page.locator('#new-record').click();
 await page.locator('#modelId').selectOption('1');
 await page.locator('#photo-file').setInputFiles({name:'evidence.png',mimeType:'image/png',buffer:png});
 let writes=0;
 page.on('request',r=>{if(r.method()!=='GET'&&new URL(r.url()).pathname.startsWith('/api/records'))writes++;});
 await page.locator('#upload-photo').click();
 assert.match(await page.locator('#photo-error').textContent(),/Enter or scan a serial number/);
 assert.equal(await page.locator('#sn').evaluate(input=>input===document.activeElement),true);
 assert.equal(writes,0);
 await page.locator('#sn').fill('PHOTO-RETRY-001');
 await page.locator('input[name=outcome][value=scrap]').check();
 await page.locator('#scrapReason').fill('Unrepairable test unit');
 const network=await page.context().newCDPSession(page);
 await network.send('Fetch.enable',{patterns:[{urlPattern:'*/api/records/*/photos',requestStage:'Response'}]});
 const responsePaused=new Promise(resolve=>network.once('Fetch.requestPaused',resolve));
 await page.locator('#upload-photo').click();
 const paused=await responsePaused;
 assert.equal(paused.responseStatusCode,201);
 await page.waitForFunction(()=>document.querySelector('#photo-progress-status')?.textContent.includes('Confirming'));
 assert.equal(await page.locator('#complete-record').isDisabled(),true);
 assert.equal(await page.locator('#upload-photo').isDisabled(),true);
 assert.equal(await page.locator('#photos img').count(),0);
 assert.doesNotMatch(await page.locator('#notice').textContent(),/Saved successfully|Photo uploaded/);
 await network.send('Fetch.failRequest',{requestId:paused.requestId,errorReason:'ConnectionReset'});
 await network.send('Fetch.disable');
 await page.waitForFunction(()=>document.querySelector('#photo-error')?.textContent.includes('connection'));
 assert.equal(await page.locator('#complete-record').isDisabled(),true);
 assert.equal(await page.locator('#discard-photo').isVisible(),true);
 await page.locator('#upload-photo').click();
 await page.waitForFunction(()=>document.querySelector('#photos img')?.naturalWidth===2);
 await page.locator('#complete-record').click();
 await page.waitForFunction(()=>!document.querySelector('#complete-record'));
 const reopened=page.waitForResponse(response=>/\/api\/records\/\d+$/.test(response.url())&&response.request().method()==='GET');
 await page.locator('#reload-record').click();
 assert.equal((await reopened).status(),200);
 await page.waitForFunction(()=>document.querySelector('#photos img')?.naturalWidth===2);
 assert.equal(await page.locator('#photos img').count(),1);
 const {items}=await (await page.request.get(app.baseUrl+'/api/records?q=PHOTO-RETRY-001')).json();
 const {record}=await (await page.request.get(app.baseUrl+'/api/records/'+items[0].id)).json();
 assert.equal(record.status,'completed');
 assert.equal(record.photos.length,1);
});
test('desktop photo upload stays inside its panel when the pending status wraps',{timeout:60000},async t=>{
 const {page,login}=await fixture(t);
 await page.setViewportSize({width:2048,height:1139});
 await login();
 await page.locator('#new-record').click();
 await page.locator('#modelId').selectOption('1');
 await page.locator('#photo-file').setInputFiles({name:'evidence.png',mimeType:'image/png',buffer:png});
 for(const viewport of [{width:2048,height:1139},{width:1366,height:768},{width:1101,height:650}]){
  await page.setViewportSize(viewport);
  const panel=await page.locator('.evidence-section').boundingBox();
  const upload=await page.locator('#upload-photo').boundingBox();
  assert.ok(upload.x>=panel.x&&upload.x+upload.width<=panel.x+panel.width,`Upload button clipped horizontally at ${viewport.width}`);
  assert.ok(upload.y>=panel.y&&upload.y+upload.height<=panel.y+panel.height,`Upload button clipped vertically at ${viewport.width}`);
  await page.locator('#upload-photo').click({trial:true});
 }
 await page.locator('#upload-photo').click();
 assert.match(await page.locator('#photo-error').textContent(),/Enter or scan a serial number/);
});
test('mobile viewport reports actual intermediate upload progress on a limited connection',{timeout:60000},async t=>{
 const {page,login}=await fixture(t);
 await page.setViewportSize({width:390,height:844});
 await login();
 await page.locator('#new-record').click();
 await page.locator('#sn').fill('PHOTO-SLOW-MOBILE-001');
 await page.locator('#modelId').selectOption('1');
 await page.locator('#save-record').click();
 await page.waitForFunction(()=>!document.querySelector('#reload-record')?.disabled);
 const jpeg=await readFile(new URL('fixtures/evidence-2x3.jpg',import.meta.url));
 const original=Buffer.concat([jpeg,Buffer.alloc(768*1024)]);
 await page.locator('#photo-file').setInputFiles({name:'mobile.jpg',mimeType:'image/jpeg',buffer:original});
 const network=await page.context().newCDPSession(page);
 await network.send('Network.emulateNetworkConditions',{offline:false,latency:100,downloadThroughput:1024*1024,uploadThroughput:128*1024});
 await page.locator('#upload-photo').click();
 await page.waitForFunction(()=>{
   const progress=document.querySelector('#photo-progress');
   return progress&&!progress.hidden&&progress.value>0&&progress.value<100;
 },{},{timeout:15000});
 assert.equal(await page.locator('#complete-record').isDisabled(),true);
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 await page.waitForFunction(()=>document.querySelector('#photo-progress-status')?.textContent==='Photo uploaded',{},{timeout:20000});
 await page.waitForFunction(()=>document.querySelector('#photos img')?.naturalWidth===2);
});
