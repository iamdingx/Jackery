import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdir,mkdtemp,rm} from 'node:fs/promises';
import path from 'node:path';
import {chromium} from 'playwright';
import {startServer} from '../server.js';

async function workspace(t,username){
  await mkdir('tests/.tmp',{recursive:true});
  const dir=await mkdtemp(path.resolve('tests/.tmp/follow-up-'));
  const app=await startServer({dataDir:dir,demo:true});
  t.after(async()=>{await app.close();await rm(dir,{recursive:true,force:true});});
  const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
  t.after(()=>browser.close());
  const page=await browser.newPage({baseURL:app.baseUrl});
  page.setDefaultTimeout(6500);
  await page.goto(app.baseUrl);
  await page.locator('#username').fill(username);
  await page.locator('#password').fill(username==='alex'?'JackeryAlex!2026':'JackeryAdmin!2026');
  await page.locator('#login-form button').click();
  await page.locator('#new-record').waitFor();
  return page;
}

test('history result, empty state and errors always belong to the latest submitted SN',async t=>{
  const page=await workspace(t,'alex');
  await page.locator('#history-nav').click();
  const field=page.locator('#history-sn'),results=page.locator('#history-results');
  const search=async sn=>{await field.fill(sn);await field.press('Enter');};
  let deliver,started;
  const pending=new Promise(resolve=>{started=resolve;});
  await page.route('**/api/sn-history?sn=SLOW',async route=>{
    started();await new Promise(resolve=>{deliver=resolve;});
    await route.fulfill({json:{items:[]}}).catch(()=>{});
  });
  await search('SLOW');await pending;
  await search('DEMO-HISTORY-001');
  await results.locator('[data-history-record]').waitFor();
  deliver();
  await page.waitForFunction(()=>document.querySelector('#history-results .history-summary')?.textContent.includes('DEMO-HISTORY-001'),null,{timeout:3000});
  assert.equal(await results.locator('[data-history-record]').count(),1);
  await field.fill('UNKNOWN');
  assert.equal(await results.locator('[data-history-record]').count(),0);
  await field.press('Enter');
  await results.getByText('No records found').waitFor();
  assert.match(await results.innerText(),/UNKNOWN/);
  await page.route('**/api/sn-history?sn=BAD',r=>r.fulfill({status:503,json:{error:{message:'Unavailable'}}}));
  await search('BAD');await results.getByRole('alert').waitFor();
  assert.match(await results.innerText(),/BAD/);
  let releaseLate,markStarted;
  const lateStarted=new Promise(resolve=>{markStarted=resolve;});
  await page.route('**/api/sn-history?sn=LEFT',async route=>{
    markStarted();await new Promise(resolve=>{releaseLate=resolve;});
    await route.fulfill({status:503,json:{error:{message:'stale error'}}}).catch(()=>{});
  });
  await search('LEFT');await lateStarted;
  await page.locator('#records-nav').click();
  await page.locator('#new-record').waitFor();
  releaseLate();
  await page.locator('#history-nav').click();
  assert.equal(await results.innerText(),'');
});

test('operator can filter WFR by reason, resume and see a changed reason on the proper list',async t=>{
  const page=await workspace(t,'alex');
  const filter=reason=>page.locator('[data-follow-up="'+reason+'"]');
  assert.equal((await page.request.get('/api/records/2/audit')).status(),403);
  assert.equal((await page.request.get('/api/records?followUp=unsupported')).status(),422);
  await filter('needs_analysis').click();
  await page.getByText('No records found',{exact:true}).waitFor();
  const response=page.waitForResponse(r=>r.url().includes('/api/records?')&&r.url().includes('followUp=awp'));
  await filter('awp').click();
  const data=await (await response).json();
  assert.ok(data.total>0&&data.items.every(r=>r.outcome==='awp'&&r.status==='wfr'));
  const row=page.locator('tr').filter({hasText:'DEMO-WFR-001'});
  await row.locator('.badge').getByText('In Progress · AWP',{exact:true}).waitFor();
  await row.locator('[data-open-record]').click();
  await page.locator('input[name=outcome][value=needs_analysis]').check();
  await page.locator('#save-record').click();
  await page.getByText('Saved successfully',{exact:true}).waitFor();
  await page.locator('#records-nav').click();
  await page.getByText('No records found',{exact:true}).waitFor();
  await filter('needs_analysis').click();
  await row.locator('[data-open-record]').waitFor();
  await page.locator('#language').click();
  assert.match(await row.locator('.badge').innerText(),/进行中.*待分析/);
});

test('admin sees the WFR reason in All Records and can filter across owners',async t=>{
  const page=await workspace(t,'admin');
  const row=page.locator('tr').filter({hasText:'DEMO-WFR-001'});
  assert.equal(await row.locator('.badge').innerText(),'In Progress · AWP');
  await page.locator('[data-follow-up="needs_analysis"]').click();
  await page.getByText('No records found',{exact:true}).waitFor();
  await page.locator('[data-follow-up="awp"]').click();
  await row.waitFor();
  assert.equal(await page.locator('[data-open-record]').count(),1);
  await page.locator('[data-follow-up=""]').click();
  await page.locator('tr').filter({hasText:'DEMO-HISTORY-001'}).waitFor();
  await page.locator('#language').click();
  assert.equal(await row.locator('.badge').innerText(),'进行中 · 待料');
});

test('admin sees field-level correction in the open summary, and original snapshots on demand',async t=>{
  const page=await workspace(t,'admin');
  await page.locator('tr').filter({hasText:'DEMO-WFR-001'}).locator('[data-open-record]').click();
  await page.locator('#start-correction').click();
  await page.locator('#correctionReason').fill('标签核对');
  await page.locator('#storagePallet').fill('PL-071');
  await page.locator('#appearanceNotes').fill('右侧轻微划痕');
  await page.locator('#save-correction').click();
  await page.getByText('Saved successfully',{exact:true}).waitFor();
  await page.locator('#view-audit').click();
  const dialog=page.locator('#audit-dialog');
  const diff=dialog.locator('.audit-entry table').first();
  await diff.getByText('PL-071',{exact:true}).waitFor();
  assert.match(await diff.innerText(),/右侧轻微划痕/);
  assert.match(await dialog.innerText(),/标签核对/);
  assert.equal(await dialog.locator('pre:visible').count(),0);
  await dialog.getByText('Full original record',{exact:true}).first().click();
  assert.ok(await dialog.locator('pre:visible').count()>0);
});
