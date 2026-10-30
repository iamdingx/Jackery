import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdir,mkdtemp,readFile,readdir} from 'node:fs/promises';
import path from 'node:path';
import {chromium} from 'playwright';
import {startServer} from '../server.js';

test('JPEG with source trailer uploads, renders, retains every byte, remains private and never executes trailer text',{timeout:60000},async t=>{
 await mkdir('tests/.tmp',{recursive:true});const dir=await mkdtemp(path.resolve('tests/.tmp/jpeg-upload-')),app=await startServer({dataDir:dir,demo:true});
 const browser=await chromium.launch({headless:true,executablePath:'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'}),page=await browser.newPage({viewport:{width:1366,height:768}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));t.after(async()=>{await browser.close();await app.close();assert.deepEqual(errors,[]);});
 const jpeg=await readFile(new URL('fixtures/evidence-2x3.jpg',import.meta.url));const original=Buffer.concat([jpeg,Buffer.from('\0Camera original metadata\n<script>globalThis.JACKERY_TRAILER_EXECUTED=true</script>')]);
 await page.goto(app.baseUrl);await page.locator('#username').fill('alex');await page.locator('#password').fill('JackeryAlex!2026');await page.locator('#login-form button').click();await page.locator('#new-record').click();await page.locator('#sn').fill('JPEG-SOURCE-TRAILER');await page.locator('#modelId').selectOption('1');await page.locator('.evidence-section summary').click();
 await page.locator('#photo-file').setInputFiles({name:'camera-original.jpg',mimeType:'image/jpeg',buffer:original});const response=page.waitForResponse(r=>r.url().endsWith('/photos')&&r.request().method()==='POST');await page.locator('#upload-photo').click();const uploaded=await response;assert.equal(uploaded.status(),201,await uploaded.text());const {photo,record}=await uploaded.json();
 await page.waitForFunction(()=>document.querySelector('#photos img')?.naturalWidth===2);assert.equal(await page.locator('#photos img').evaluate(i=>i.naturalHeight),3);assert.equal(record.photos.length,1);assert.equal(photo.filename,'camera-original.jpg');assert.equal(photo.size,original.length);
 const downloaded=await page.request.get(app.baseUrl+photo.url);assert.equal(downloaded.status(),200);assert.equal(downloaded.headers()['content-type'],'image/jpeg');assert.equal(downloaded.headers()['x-content-type-options'],'nosniff');assert.match(downloaded.headers()['cache-control'],/private.*no-store/);assert.deepEqual(await downloaded.body(),original);
 const physical=(await readdir(path.join(dir,'photos')))[0];assert.deepEqual(await readFile(path.join(dir,'photos',physical)),original);assert.equal((await fetch(app.baseUrl+photo.url)).status,401);
 const other=await browser.newContext();const login=await other.request.post(app.baseUrl+'/api/login',{data:{username:'blair',password:'JackeryBlair!2026'}});assert.equal(login.status(),200);assert.equal((await other.request.get(app.baseUrl+photo.url)).status(),403);assert.equal((await other.request.get(app.baseUrl+photo.url+'?sn=JPEG-SOURCE-TRAILER')).status(),200);await other.close();
 await page.goto(app.baseUrl+photo.url);assert.equal(await page.evaluate(()=>globalThis.JACKERY_TRAILER_EXECUTED===true),false);await page.locator('img').waitFor();assert.equal(await page.locator('img').evaluate(i=>i.naturalWidth),2);
});
