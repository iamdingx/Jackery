import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdir,mkdtemp} from 'node:fs/promises';
import path from 'node:path';
import {chromium} from 'playwright';
import {startServer} from '../server.js';

test('v0.3 dual inspection radios persist initial failures and final Pass for ROK', {timeout:60000},async()=>{
  await mkdir('tests/.tmp',{recursive:true});const app=await startServer({dataDir:await mkdtemp(path.resolve('tests/.tmp/single-inspection-')),demo:true});let browser;
  try{
    browser=await chromium.launch({headless:true,executablePath:'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'});
    const page=await browser.newPage({viewport:{width:1680,height:1100}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.goto(app.baseUrl);await page.locator('#username').fill('alex');await page.locator('#password').fill('HuabaoAlex!2026');await page.getByRole('button',{name:'Sign in',exact:true}).click();
    await page.locator('#new-record').click();await page.locator('#sn').fill('SINGLE-RADIO-001');
    assert.equal(await page.locator('.checks select').count(),0,'Functional checks must not use dropdowns');
    assert.equal(await page.locator('.checks input[type=radio]').count(),18,'Three radio choices in both independent stages');
    assert.equal(await page.getByRole('columnheader',{name:'Final Test',exact:true}).count(),1);
    assert.equal(await page.getByRole('columnheader',{name:'Initial Test',exact:true}).count(),1);
    await page.locator('[data-check-phase="initial"][data-check-code="ac_output"][value="fail"]').check();
    await page.locator('[data-check-phase="initial"][data-check-code="ac_output"][value="pass"]').check();
    assert.equal(await page.locator('[data-check-phase="initial"][data-check-code="ac_output"]:checked').count(),1);
    await page.locator('[data-check-phase="initial"][data-check-code="ac_output"][value="fail"]').check();
    await page.locator('[data-check-phase="initial"][data-check-code="dc_output"][value="pass"]').check();await page.locator('[data-check-phase="initial"][data-check-code="charging"][value="pass"]').check();
    await page.locator('#language').click();assert.equal(await page.locator('[data-check-phase="initial"][data-check-code="ac_output"][value="fail"]').isChecked(),true);await page.locator('#language').click();
    await page.locator('input[name=outcome][value=rok]').check();
    await page.locator('#complete-record').click();assert.equal(await page.locator('#form-error').textContent(),'Complete all final tests with a Pass result before selecting ROK for completion.');
    for(const radio of await page.locator('[data-check-phase=final][value=pass]').all())await radio.check();
    const saved=page.waitForResponse(r=>r.request().method()==='PUT'&&/\/api\/records\/\d+$/.test(r.url()));await page.locator('#complete-record').click();const response=await saved;assert.equal(response.status(),200);const r=(await response.json()).record;
    assert.deepEqual(r.checks.initial,{ac_output:'fail',dc_output:'pass',charging:'pass'});assert.deepEqual(r.checks.final,{ac_output:'pass',dc_output:'pass',charging:'pass'});
    await page.waitForFunction(()=>document.querySelector('#issueNotes')?.disabled&&document.querySelector('.heading')?.textContent.includes('Completed'));assert.equal(await page.locator('.checks input[type=radio]:enabled').count(),0);
    await mkdir('artifacts/e2e',{recursive:true});await page.screenshot({path:'artifacts/e2e/v03-dual-inspection-radios.png',fullPage:true});assert.deepEqual(errors,[]);
  }finally{if(browser)await browser.close();await app.close();}
});
