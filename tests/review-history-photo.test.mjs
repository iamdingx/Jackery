import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
import { startServer } from '../server.js';

test('review regression: other-owner exact-SN history photos render with one authorized SN parameter', {timeout:60000}, async () => {
  await mkdir('tests/.tmp', {recursive:true});
  const app = await startServer({dataDir:await mkdtemp(path.resolve('tests/.tmp/history-photo-')),demo:true});
  let browser;
  try {
    const post = async (route, body, headers={}) => {
      const r = await fetch(app.baseUrl+route,{method:'POST',headers:{Origin:app.baseUrl,'Content-Type':'application/json',...headers},body:JSON.stringify(body)});
      return {response:r, data:await r.json()};
    };
    const login=await post('/api/login',{username:'blair',password:'HuabaoBlair!2026'});
    const headers={Cookie:login.response.headers.get('set-cookie').split(';')[0],'X-CSRF-Token':login.data.csrfToken};
    const created=await post('/api/records',{sn:'OTHER-OWNER-PHOTO-001',modelId:1},headers);
    assert.equal(created.response.status,201);
    const uploaded=await post(`/api/records/${created.data.record.id}/photos`,{version:created.data.record.version,filename:'history.png',contentBase64:'iVBORw0KGgoAAAANSUhEUgAAAAIAAAADCAIAAAA2iEnWAAAAEUlEQVR4nGP8zwACTGASRgEAFEABBVDVLjgAAAAASUVORK5CYII='},headers);
    assert.equal(uploaded.response.status,201);
    browser=await chromium.launch({headless:true,executablePath:'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'});
    const page=await browser.newPage();
    await page.goto(app.baseUrl);
    await page.locator('#username').fill('alex');await page.locator('#password').fill('HuabaoAlex!2026');
    await page.getByRole('button',{name:'Sign in',exact:true}).click();await page.locator('#new-record').waitFor();
    await page.locator('#history-nav').click();await page.locator('#history-sn').fill('OTHER-OWNER-PHOTO-001');
    await page.locator('#history-form').getByRole('button',{name:'Search',exact:true}).click();
    await page.locator('[data-history-record]').first().click();
    const image=page.locator('#photos img').first();await image.waitFor();
    const src=await image.getAttribute('src'),url=new URL(src,app.baseUrl);
    assert.equal(url.searchParams.get('sn'),'OTHER-OWNER-PHOTO-001','History image has exactly the requested SN');
    assert.equal(url.searchParams.getAll('sn').length,1);
    const response=await page.request.get(url.href);assert.equal(response.status(),200,'History photo is authorized');
    await page.waitForFunction(()=>document.querySelector('#photos img')?.naturalWidth===2);
    assert.equal(await page.locator('#issueNotes').isDisabled(),true,'Other-owner history stays read-only');
  } finally { if(browser)await browser.close();await app.close(); }
});
