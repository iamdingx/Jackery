import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
import { startServer } from '../server.js';

async function fixture(t){
  await mkdir('tests/.tmp',{recursive:true});const app=await startServer({dataDir:await mkdtemp(path.resolve('tests/.tmp/review-editor-')),demo:true});let browser;
  t.after(async()=>{if(browser)await browser.close();await app.close();});
  const client=async(username,password)=>{
    const l=await fetch(app.baseUrl+'/api/login',{method:'POST',headers:{Origin:app.baseUrl,'Content-Type':'application/json'},body:JSON.stringify({username,password})});
    const data=await l.json(),headers={Origin:app.baseUrl,'Content-Type':'application/json',Cookie:l.headers.get('set-cookie').split(';')[0],'X-CSRF-Token':data.csrfToken};
    return async(route,method='GET',body)=>{const r=await fetch(app.baseUrl+route,{method,headers,body:body===undefined?undefined:JSON.stringify(body)});assert.ok(r.ok,await r.clone().text());return r.json();};
  };
  browser=await chromium.launch({headless:true,executablePath:'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'});const page=await browser.newPage();
  const login=async()=>{await page.goto(app.baseUrl);await page.locator('#username').fill('alex');await page.locator('#password').fill('HuabaoAlex!2026');await page.getByRole('button',{name:'Sign in',exact:true}).click();await page.locator('#new-record').waitFor();};
  return {app,page,client,login};
}

test('review regression: saved model and selected appearance labels use their historical snapshots', {timeout:60000},async t=>{
  const {page,client,login}=await fixture(t),alex=await client('alex','HuabaoAlex!2026'),admin=await client('admin','HuabaoAdmin!2026');
  const created=(await alex('/api/records','POST',{sn:'SNAPSHOT-LABEL-001',modelId:1})).record;
  await alex(`/api/records/${created.id}`,'PUT',{version:created.version,appearanceCodes:['scratches'],outcome:'awp',action:'save'});
  const catalog=await admin('/api/catalog?includeInactive=1'),model=catalog.models.find(m=>m.id===1),appearance=catalog.appearanceOptions.find(a=>a.code==='scratches');
  await admin('/api/admin/models/1','PUT',{...model,nameEn:'Renamed Future Model'});
  await admin('/api/admin/appearance/scratches','PUT',{...appearance,labelEn:'Renamed Future Defect'});
  await login();await page.locator('#filter-q').fill('SNAPSHOT-LABEL-001');await page.locator('#filters').getByRole('button',{name:'Search',exact:true}).click();await page.locator('[data-open-record]').first().click();
  assert.equal(await page.locator('#modelId option:checked').textContent(),'Sample Model A','Saved model name must remain historical');
  assert.equal((await page.locator('[data-appearance=scratches]').locator('..').textContent()).trim(),'Scratches','Saved selected defect name must remain historical');
  await page.locator('#records-nav').click();await page.locator('#new-record').click();
  assert.equal(await page.locator('#modelId option:checked').textContent(),'Renamed Future Model','New work uses the current catalog');
});

test('review regression: reloading warns before discarding a selected but not uploaded photo', {timeout:60000},async t=>{
  const {page,login}=await fixture(t);await login();await page.locator('#new-record').click();await page.locator('#sn').fill('PENDING-RELOAD-001');
  await page.locator('#save-record').click();await page.getByText('Saved successfully',{exact:true}).waitFor();
  await page.locator('#photo-file').setInputFiles({name:'pending.png',mimeType:'image/png',buffer:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAADCAIAAAA2iEnWAAAAEUlEQVR4nGP8zwACTGASRgEAFEABBVDVLjgAAAAASUVORK5CYII=','base64')});
  const saved=page.waitForResponse(r=>r.request().method()==='PUT'&&/\/api\/records\/\d+$/.test(r.url()));
  await page.locator('#save-record').click();await saved;await page.waitForFunction(()=>!document.querySelector('#save-record')?.disabled);
  const dialogs=[];page.on('dialog',async d=>{dialogs.push(d.message());await d.dismiss();});
  await page.locator('#reload-record').click();
  assert.equal(dialogs.length,1,'Reload must warn even after record fields were saved if a photo is still pending');
  assert.ok((await page.locator('.photo-tools').textContent()).includes('pending.png'),'Dismissing reload keeps selected photo');
});
