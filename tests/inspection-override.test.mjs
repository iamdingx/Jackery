import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdir,mkdtemp} from 'node:fs/promises';
import path from 'node:path';
import {chromium} from 'playwright';
import {startServer} from '../server.js';
test('latest user override: every outcome has one inspection of radio choices and ROK needs no retest',{timeout:60000},async()=>{
 await mkdir('tests/.tmp',{recursive:true});const app=await startServer({dataDir:await mkdtemp(path.resolve('tests/.tmp/inspection-override-')),demo:true});let browser;
 try{
  browser=await chromium.launch({headless:true,executablePath:'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'});const page=await browser.newPage({viewport:{width:1680,height:1100}});await page.goto(app.baseUrl);
  await page.locator('#username').fill('alex');await page.locator('#password').fill('JackeryAlex!2026');await page.locator('#login-form button').click();await page.locator('#new-record').click();await page.locator('#modelId').selectOption('1');await page.locator('#sn').fill('LATEST-SINGLE-001');
  for(const outcome of ['awp','like_new','good','acceptable','scrap','needs_analysis','rok']){
   await page.locator(`[name=outcome][value=${outcome}]`).check();assert.equal(await page.locator('.checks input[type=radio]').count(),9,outcome);assert.equal(await page.locator('.checks select').count(),0);assert.equal(await page.locator('[data-check-phase=final]').count(),0);
   assert.equal(await page.getByRole('columnheader',{name:'Inspection Result',exact:true}).count(),1);assert.equal(await page.getByRole('columnheader',{name:'Initial Test',exact:true}).count(),0);assert.equal(await page.getByRole('columnheader',{name:'Final Test',exact:true}).count(),0);
  }
  await page.locator('[data-check-code=ac_output][value=fail]').check();for(const code of ['dc_output','charging'])await page.locator(`[data-check-code=${code}][value=pass]`).check();
  await page.locator('#language').click();await page.locator('#language').click();assert.equal(await page.locator('[data-check-code=ac_output][value=fail]').isChecked(),true);
  const saved=page.waitForResponse(res=>res.request().method()==='PUT'&&/\/api\/records\/\d+$/.test(res.url()));await page.locator('#complete-record').click();const response=await saved;assert.equal(response.status(),200);const r=(await response.json()).record;
  assert.deepEqual(r.checks,{initial:{ac_output:'fail',dc_output:'pass',charging:'pass'}});await page.waitForFunction(()=>document.querySelector('#issueNotes')?.disabled===true);
  await mkdir('artifacts/inspection-override',{recursive:true});await page.screenshot({path:'artifacts/inspection-override/verified-en.png',fullPage:true});
 }finally{await browser?.close();await app.close();}
});
