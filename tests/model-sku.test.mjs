import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdir,mkdtemp} from 'node:fs/promises';
import path from 'node:path';
import {chromium} from 'playwright';
import {startServer} from '../server.js';

test('reviewed model SKU reaches new work records and keeps model versions, held BOM and missing sources separate',{timeout:60000},async t=>{
 await mkdir('tests/.tmp',{recursive:true});await mkdir('artifacts/model-sku',{recursive:true});
 const app=await startServer({dataDir:await mkdtemp(path.resolve('tests/.tmp/model-sku-browser-')),demo:true,catalogPath:path.resolve('catalogs/jackery-eu-20261030.json')});
 const browser=await chromium.launch({headless:true,executablePath:'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'}),page=await browser.newPage({viewport:{width:1536,height:864}}),errors=[];
 page.setDefaultTimeout(5000);page.on('pageerror',e=>errors.push(e.message));t.after(async()=>{await browser.close();app.server.closeAllConnections();await app.close();assert.deepEqual(errors,[]);});
 await page.goto(app.baseUrl);await page.locator('#username').fill('admin');await page.locator('#password').fill('JackeryAdmin!2026');await page.locator('#login-form button').click();await page.locator('#new-record').waitFor();
 const all=await(await page.request.get(app.baseUrl+'/api/catalog?includeInactive=1')).json(),a=all.models.find(m=>m.catalogKey==='e2000plus-a');assert.equal(a.productSku,'21-0001-00037');assert.equal(a.active,false);
 assert.equal(all.models.filter(m=>m.catalogKey).length,9);assert.ok(!all.models.some(m=>m.catalogKey?.startsWith('e1000plus-')));
 const original=all.models.find(m=>m.catalogKey==='e2000v2-original'),costdown=all.models.find(m=>m.catalogKey==='e2000v2-costdown'),e1000=all.models.find(m=>m.catalogKey==='e1000-default');
 assert.notEqual(original.id,costdown.id);assert.equal(original.productSku,'21-0001-000267');assert.equal(original.productSku,costdown.productSku);
 await page.locator('#new-record').click();assert.equal(await page.locator('#modelId').inputValue(),'');await page.locator('#sn').fill('REVIEWED-E1000-SKU');await page.locator('#modelId').selectOption(String(e1000.id));assert.equal(await page.locator('#productSku').inputValue(),'70-1000-EUO001');
 await page.locator('#language').click();assert.equal(await page.locator('#productSku').inputValue(),'70-1000-EUO001');await page.locator('#language').click();
 await page.locator('#open-bom').click();await page.getByText('No matching items in this model BOM. Check the part SKU or try another word.',{exact:true}).waitFor();await page.locator('#bom-cancel').click();
 await page.locator('[name=outcome][value=awp]').check();await page.locator('#save-record').click();await page.getByText('Saved successfully',{exact:true}).waitFor();
 const r=(await(await page.request.get(app.baseUrl+'/api/records?q=REVIEWED-E1000-SKU')).json()).items[0];assert.equal(r.productSku,'70-1000-EUO001');assert.equal(r.modelSnapshot.productSku,r.productSku);assert.deepEqual(r.materials,[]);assert.equal(r.status,'wfr');
 await page.screenshot({path:'artifacts/model-sku/e1000-new-sku.png'});
 await page.locator('#records-nav').click();await page.locator('#new-record').click();await page.locator('#modelId').selectOption(String(original.id));assert.equal(await page.locator('#productSku').inputValue(),'21-0001-000267');await page.locator('#modelId').selectOption(String(costdown.id));assert.equal(await page.locator('#modelId').inputValue(),String(costdown.id));assert.equal(await page.locator('#productSku').inputValue(),'21-0001-000267');
});
