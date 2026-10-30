import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdir,mkdtemp,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {chromium} from 'playwright';
import {startServer} from '../server.js';
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAADCAIAAAA2iEnWAAAAEUlEQVR4nGP8zwACTGASRgEAFEABBVDVLjgAAAAASUVORK5CYII=','base64');
async function fixture(t){
  await mkdir('tests/.tmp',{recursive:true});await mkdir('artifacts/qa-v03',{recursive:true});const app=await startServer({dataDir:await mkdtemp(path.resolve('tests/.tmp/v03-interactions-')),demo:true});
  const browser=await chromium.launch({headless:true,executablePath:'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'}),page=await browser.newPage({viewport:{width:1366,height:864}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  t.after(async()=>{await browser.close();await app.close();assert.deepEqual(errors,[]);});
  async function client(name='alex',password='JackeryAlex!2026'){const login=await fetch(app.baseUrl+'/api/login',{method:'POST',headers:{'Content-Type':'application/json',Origin:app.baseUrl},body:JSON.stringify({username:name,password})});const data=await login.json(),headers={Cookie:login.headers.get('set-cookie').split(';')[0],'X-CSRF-Token':data.csrfToken,'Content-Type':'application/json',Origin:app.baseUrl};return async(route,method='GET',body)=>{const res=await fetch(app.baseUrl+route,{method,headers,body:body===undefined?undefined:JSON.stringify(body)});assert.ok(res.ok,await res.clone().text());return res.json();};}
  async function login(name='alex',password='JackeryAlex!2026'){await page.goto(app.baseUrl);await page.locator('#username').fill(name);await page.locator('#password').fill(password);await page.locator('#login-form button').click();await page.locator('#new-record').waitFor();}
  async function open(sn){await page.locator('#filter-q').fill(sn);const loaded=page.waitForResponse(res=>res.url().includes('/api/records?')&&res.request().method()==='GET');await page.locator('#filters button').click();await loaded;await page.locator('[data-open-record]').first().click();await page.waitForFunction(value=>document.querySelector('#sn')?.value===value,sn);}
  return {app,page,client,login,open};
}

test('v03 Module4 UI: admin corrects foreign WFR without completion and owner resumes own history',{timeout:60000},async t=>{
  const {page,client,login,open}=await fixture(t),alex=await client(),admin=await client('admin','JackeryAdmin!2026');
  const refs={receivingSku:'原入库SKU',postSortSku:'SORT-original',receivingOrderNo:'原单号001',receivingStatus:'原等待状态',productNameVerification:'原名称校验',skuVerification:'原SKU校验',parentRecord:'原父记录文本',unspecifiedTextField:'文本9原值'};
  let record=(await alex('/api/records','POST',{sn:'DEEP-V03-ADMIN-WFR',modelId:1,...refs})).record;record=(await alex(`/api/records/${record.id}`,'PUT',{version:record.version,outcome:'awp',issueNotes:'Waiting note'})).record;
  await login('admin','JackeryAdmin!2026');await open(record.sn);for(const key of Object.keys(refs))assert.equal(await page.locator('#'+key).count(),0,'Removed Reference Details field: '+key);
  await page.locator('#start-correction').click();await page.locator('#issueNotes').fill('Waiting corrected / 等待中更正');await page.locator('#correctionReason').fill('核对原文 / checked source');await page.locator('#save-correction').click();await page.getByText('Saved successfully',{exact:true}).waitFor();
  const corrected=(await admin(`/api/records/${record.id}`)).record;assert.equal(corrected.status,'wfr');assert.equal(corrected.ownerId,record.ownerId);assert.equal(corrected.issueNotes,'Waiting corrected / 等待中更正');assert.ok((await admin(`/api/records/${record.id}/audit`)).items.some(a=>a.reason==='核对原文 / checked source'&&a.before&&a.after));
  await page.locator('#logout').click();await login();await page.locator('#history-nav').click();await page.locator('#history-sn').fill(record.sn);await page.locator('#history-form button').click();await page.locator('[data-history-record]').first().click();assert.equal(await page.locator('#issueNotes').isDisabled(),true);
  await page.locator('#resume-record').click();await page.waitForFunction(()=>document.querySelector('#issueNotes')?.disabled===false);assert.equal(await page.locator('#issueNotes').isEnabled(),true);assert.equal(await page.locator('#complete-record').count(),0);await page.locator('#issueNotes').fill('Resumed same record');await page.locator('#save-record').click();await page.getByText('Saved successfully',{exact:true}).waitFor();
  const resumed=(await alex(`/api/records/${record.id}`)).record;assert.equal(resumed.id,record.id);assert.equal(resumed.workOrder,record.workOrder);assert.equal(resumed.status,'wfr');for(const [key,value] of Object.entries(refs))assert.equal(resumed[key],value,'Historical source mapping is preserved: '+key);
  await writeFile('artifacts/qa-v03/admin-resume-ui.json',JSON.stringify({passed:true,adminCorrectionRetainedOwnerAndWfr:true,ownerResumeSameRecord:true},null,2));
});

test('v03 Module5 UI: failed upload precise copy, retained file retry, size/format validation',{timeout:60000},async t=>{
  const {page,client,login}=await fixture(t),alex=await client();await login();await page.locator('#new-record').click();await page.locator('#modelId').selectOption('1');await page.locator('#sn').fill('DEEP-V03-PHOTO-RETRY');await page.locator('#issueNotes').fill('Original English issue');
  await page.locator('.evidence-section summary').click();
  await page.route('**/api/records/*/photos',route=>route.fulfill({status:503,json:{error:{code:'TEST_UPLOAD_FAILURE',message:'Injected failure'}}}));
  await page.locator('#photo-file').setInputFiles({name:'evidence.png',mimeType:'image/png',buffer:png});await page.locator('#upload-photo').click();await page.getByText('Upload failed. Your photo has not been saved. Please try again.',{exact:true}).waitFor();
  let r=(await alex('/api/records?q=DEEP-V03-PHOTO-RETRY')).items[0];assert.equal(r.photos.length,0);assert.equal(r.issueNotes,'Original English issue');await page.unroute('**/api/records/*/photos');
  await page.locator('#language').click();await page.locator('#language').click();assert.ok((await page.locator('.photo-tools').textContent()).includes('evidence.png'));await page.locator('#upload-photo').click();await page.locator('#photos img').waitFor();assert.equal(await page.locator('#photos img').evaluate(i=>i.complete&&i.naturalWidth>0),true);
  r=(await alex(`/api/records/${r.id}`)).record;assert.equal(r.photos.length,1);
  await page.locator('#photo-file').setInputFiles({name:'invalid.svg',mimeType:'image/svg+xml',buffer:Buffer.from('<svg/>')});await page.locator('#upload-photo').click();await page.getByText('File must be PNG or JPEG and at most 8 MiB.',{exact:true}).waitFor();
  await page.locator('#photo-file').setInputFiles({name:'large.png',mimeType:'image/png',buffer:Buffer.alloc(8388609)});await page.locator('#upload-photo').click();assert.equal(await page.locator('#form-error').textContent(),'File must be PNG or JPEG and at most 8 MiB.');assert.equal((await alex(`/api/records/${r.id}`)).record.photos.length,1);
  await writeFile('artifacts/qa-v03/photo-ui.json',JSON.stringify({passed:true,failedUploadNotSaved:true,retryRetainedFile:true,validImageLoaded:true,invalidAndOversizeRejected:true},null,2));
});

test('v03 Module2/3 UI: long English labels, 100 consumption rows and export locale',{timeout:60000},async t=>{
  const {page,client,login,open}=await fixture(t),alex=await client(),admin=await client('admin','JackeryAdmin!2026');
  const cat=await admin('/api/catalog?includeInactive=1'),model=cat.models.find(m=>m.id===1);model.checkItems[0].labelEn='AC output voltage, frequency and protection under sustained load';await admin('/api/admin/models/1','PUT',model);
  let r=(await alex('/api/records','POST',{sn:'DEEP-V03-LONG-LIST',modelId:1})).record;const parts=(await alex('/api/models/1/bom?pageSize=100')).items;
  r=(await alex(`/api/records/${r.id}`,'PUT',{version:r.version,materials:parts.map((p,i)=>({bomId:p.id,quantity:i+1})),outcome:'needs_analysis'})).record;
  await login();await open(r.sn);assert.equal(await page.locator('#material-rows tr').count(),100);
  for(const width of [1366,1536,1680]){await page.setViewportSize({width,height:864});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'No page horizontal overflow');
    for(const value of ['acceptable','needs_analysis']){const box=await page.locator(`[name=outcome][value=${value}]`).locator('..').evaluate(el=>({width:el.clientWidth,scroll:el.scrollWidth,height:el.clientHeight,scrollHeight:el.scrollHeight}));assert.ok(box.scroll<=box.width&&box.scrollHeight<=box.height,'Outcome label not clipped');}
    const scrolling=await page.locator('.materials .table-wrap').evaluate(el=>el.scrollHeight>el.clientHeight);assert.equal(scrolling,true,'100 rows scroll inside material list');}
  assert.equal(await page.locator('#productSku').isDisabled(),true);assert.ok((await page.locator('.checks').textContent()).includes(model.checkItems[0].labelEn));
  await page.screenshot({path:'artifacts/qa-v03/long-list-en.png',fullPage:true});await page.locator('#language').click();assert.equal(await page.locator('[data-material-qty="0"]').inputValue(),'1');await page.screenshot({path:'artifacts/qa-v03/long-list-zh.png',fullPage:true});
  await page.locator('#records-nav').click();const download=page.waitForEvent('download');await page.locator('#export-records').click();assert.equal(new URL((await download).url()).searchParams.get('language'),'zh');
  await writeFile('artifacts/qa-v03/layout-ui.json',JSON.stringify({passed:true,widths:[1366,1536,1680],rows:100,innerScroll:true,exportLanguage:'zh'},null,2));
});
