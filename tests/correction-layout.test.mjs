import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdir,mkdtemp,rm} from 'node:fs/promises';
import path from 'node:path';
import {chromium} from 'playwright';
import {startServer} from '../server.js';

test('admin can see, save and cancel corrections on a compact WFR work record', {timeout:60000},async()=>{
  await mkdir('tests/.tmp',{recursive:true});
  const dir=await mkdtemp(path.resolve('tests/.tmp/correction-ui-'));
  const app=await startServer({dataDir:dir,demo:true});
  const browser=await chromium.launch({headless:true,executablePath:'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'});
  try{
    const page=await browser.newPage({viewport:{width:1280,height:650}});
    const el=id=>page.locator('#'+id);
    await page.goto(app.baseUrl);
    await el('username').fill('admin');
    await el('password').fill('JackeryAdmin!2026');
    await page.getByRole('button',{name:'Sign in',exact:true}).click();
    await page.locator('tr').filter({hasText:'DEMO-WFR-001'}).locator('[data-open-record]').click();
    assert.equal(await el('modelId').isDisabled(),true);
    await el('start-correction').click();
    assert.equal(await el('modelId').isDisabled(),false);
    for(const viewport of [{width:1280,height:650},{width:1366,height:768},{width:1536,height:864}]){
      await page.setViewportSize(viewport);
      for(const id of ['correctionReason','cancel-correction','save-correction']){
        const box=await el(id).boundingBox();
        const hit=await page.evaluate(({x,y})=>document.elementFromPoint(x,y)?.closest('button,textarea')?.id,{x:box.x+box.width/2,y:box.y+box.height/2});
        assert.equal(hit,id,`${id} must be reachable without auto-scrolling at ${viewport.width}×${viewport.height} (y=${box.y})`);
      }
    }
    await page.setViewportSize({width:1280,height:650});
    await el('save-correction').click();
    await page.getByText('Correction reason is required.',{exact:true}).waitFor();
    await el('correctionReason').fill('Correcting inspected WFR notes');
    await el('issueNotes').fill('Updated WFR note');
    const oldCheck=page.locator('[data-functional-check][value=pass]').first();
    await oldCheck.check();
    await el('modelId').selectOption('2');
    assert.equal(await el('productSku').inputValue(),'DEMO-PRODUCT-2');
    assert.equal(await page.locator('[data-functional-check][value=pass]:checked').count(),1);
    await el('open-bom').click();
    await page.getByText('DEMO-B-0001',{exact:true}).waitFor();
    await el('bom-cancel').click();
    await mkdir('artifacts/verification',{recursive:true});
    await page.screenshot({path:'artifacts/verification/admin-correction-local.png'});
    const request=page.waitForResponse(r=>r.url().includes('/corrections')&&r.request().method()==='POST');
    await el('save-correction').click();
    const result=await request;
    assert.equal(result.status(),200);
    const {record}=await result.json();
    assert.equal(record.status,'wfr');
    assert.equal(record.modelId,2);
    assert.equal(record.productSku,'DEMO-PRODUCT-2');
    assert.equal(record.checks.initial.ac_output,'pass');
    assert.equal(await el('modelId').isDisabled(),true);
    await el('start-correction').click();
    assert.equal(await el('issueNotes').inputValue(),'Updated WFR note');
    await el('cancel-correction').click();
    await el('start-correction').waitFor();
    await el('view-audit').click();
    await el('audit-dialog').locator('.audit-entry p').filter({hasText:'Correcting inspected WFR notes'}).waitFor();
  }finally{
    await browser.close();
    await app.close();
    await rm(dir,{recursive:true,force:true});
  }
});
