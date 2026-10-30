import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
import { startServer } from '../server.js';

async function fixture(t,demo=true){
  await mkdir('tests/.tmp',{recursive:true});const dataDir=await mkdtemp(path.resolve('tests/.tmp/review-auth-'));
  const app=await startServer({dataDir,demo});let browser;
  t.after(async()=>{if(browser)await browser.close();await app.close();});
  browser=await chromium.launch({headless:true,executablePath:'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'});
  const page=await browser.newPage();await page.goto(app.baseUrl);
  const login=async(user,password)=>{await page.locator('#username').fill(user);await page.locator('#password').fill(password);await page.getByRole('button',{name:'Sign in',exact:true}).click();};
  return {app,page,login,dataDir};
}

test('review regression: password change is blocked while a work record is unsaved', {timeout:60000},async t=>{
  const {page,login}=await fixture(t);await login('alex','JackeryAlex!2026');await page.locator('#new-record').click();await page.locator('#modelId').selectOption('1');
  await page.locator('#sn').fill('PASSWORD-DIRTY-001');await page.locator('#issueNotes').fill('Unsaved owner work must survive');
  await page.locator('#account').click();
  assert.equal(await page.locator('#password-dialog[open]').count(),0,'Do not revoke a session needed by dirty work');
  assert.equal(await page.locator('#issueNotes').inputValue(),'Unsaved owner work must survive');
  assert.match(await page.locator('#notice').textContent(),/save|discard/i);
});

test('review regression: fresh production administrator can change password and sign in again', {timeout:60000},async t=>{
  const {page,login,dataDir,app}=await fixture(t,false);
  const initial=JSON.parse(await readFile(path.join(dataDir,'first-run-accounts.json'),'utf8')).admin;
  await login(initial.username,initial.password);await page.locator('#new-record').waitFor();
  await page.locator('#account').click();await page.locator('#currentPassword').fill(initial.password);await page.locator('#newPassword').fill('ProductionAdminNew!2026');
  const changed=page.waitForResponse(r=>r.url().endsWith('/api/account/password'));
  await page.locator('#password-form').getByRole('button',{name:'Save',exact:true}).click();assert.equal((await changed).status(),200);
  await page.locator('#username').waitFor({timeout:4000});
  const session=await page.request.get(app.baseUrl+'/api/session');assert.equal((await session.json()).user,null);
  await login('admin','ProductionAdminNew!2026');await page.locator('#admin-nav').waitFor();
  assert.equal(await page.locator('#page-error:visible').count(),0);
});

test('review regression: admin filters and cached state do not carry into another operator login', {timeout:60000},async t=>{
  const {page,login}=await fixture(t);await login('admin','JackeryAdmin!2026');await page.locator('#filter-ownerId').fill('3');
  await page.locator('#filters').getByRole('button',{name:'Search',exact:true}).click();await page.locator('[data-open-record]').first().waitFor();
  await page.locator('#logout').click();await page.locator('#username').waitFor();
  const response=page.waitForResponse(r=>r.url().includes('/api/records?'));
  await login('alex','JackeryAlex!2026');assert.equal((await response).status(),200,'Operator list must not reuse forbidden admin owner filter');
  await page.locator('#new-record').waitFor();assert.equal(await page.locator('#filter-q').inputValue(),'');
  assert.equal(await page.locator('#filter-ownerId').count(),0);
  assert.equal(await page.locator('#current-nav').isDisabled(),true,'Previous account current-record state must be cleared');
});
