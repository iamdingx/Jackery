import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdir,mkdtemp,readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {chromium} from 'playwright';
import {startServer} from '../server.js';

test('BOM English over exact Chinese in drawer, pending, usage and admin for both account languages; unknown original is explicit',{timeout:60000},async()=>{
 await mkdir('tests/.tmp',{recursive:true});const dataDir=await mkdtemp(path.resolve('tests/.tmp/bom-bilingual-'));
 const source=JSON.parse(await readFile('catalogs/jackery-eu-20261030.json','utf8')),sourceModel=source.models.find(m=>m.catalogKey==='e1000v2-costdown'),known=sourceModel.bom.find(b=>b.active),unknown=sourceModel.bom.find(b=>b.active&&b.descriptionZh!==known.descriptionZh);
 const expected='Verified test translation · '+known.sku,translationsPath=path.join(dataDir,'translations.json');
 await writeFile(translationsPath,JSON.stringify({schemaVersion:1,entries:[{descriptionZh:known.descriptionZh,descriptionEn:expected}]}));
 const app=await startServer({dataDir,demo:true,catalogPath:path.resolve('catalogs/jackery-eu-20261030.json'),translationsPath});let browser;
 try{
  browser=await chromium.launch({headless:true,executablePath:'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'});const page=await browser.newPage({viewport:{width:1366,height:768}});page.setDefaultTimeout(5000);page.on('dialog',d=>d.accept());const errors=[];page.on('pageerror',e=>errors.push(e.message));
  const login=async name=>{await page.locator('#username').fill(name);await page.locator('#password').fill(name==='admin'?'JackeryAdmin!2026':'JackeryAlex!2026');await page.locator('#login-form button').click();await page.locator('#new-record').waitFor();};
  const bilingual=async(scope,english,original)=>{
   assert.equal(await scope.locator('.part-description-en').first().innerText(),english);assert.equal(await scope.locator('.part-description-zh').first().textContent(),original);
   const positions=await scope.locator('.part-description-en,.part-description-zh').evaluateAll(items=>items.map(x=>({className:x.className,top:x.getBoundingClientRect().top,bottom:x.getBoundingClientRect().bottom})));
   assert.match(positions[0].className,/part-description-en/);assert.match(positions[1].className,/part-description-zh/);assert.ok(positions[0].bottom<=positions[1].top+1,'English is physically above Chinese');
  };
  await page.goto(app.baseUrl);await login('alex');const cat=await(await page.request.get(app.baseUrl+'/api/catalog')).json(),model=cat.models.find(m=>m.catalogKey===sourceModel.catalogKey);
  await page.locator('#new-record').click();await page.locator('#sn').fill('BOM-BILINGUAL-INDEPENDENT');await page.locator('#sn').press('Enter');await page.locator('#modelId').selectOption(String(model.id));
  await page.locator('#open-bom').click();const search=async sku=>{await page.locator('#bom-search').fill(sku);const response=page.waitForResponse(r=>r.url().includes('/bom?')&&r.url().includes(sku));await page.locator('#bom-search-form button').click();await response;return page.locator('#bom-results tr').filter({hasText:sku});};
  let row=await search(known.sku);await bilingual(row,expected,known.descriptionZh);await row.locator('[data-bom-select]').check();await bilingual(page.locator('.pending-item').filter({hasText:known.sku}),expected,known.descriptionZh);
  await page.locator('#bom-language').click();await page.waitForFunction(()=>document.documentElement.lang==='zh');row=await search(known.sku);await bilingual(row,expected,known.descriptionZh);await bilingual(page.locator('.pending-item').filter({hasText:known.sku}),expected,known.descriptionZh);
  row=await search(unknown.sku);assert.match(await row.locator('.part-description-en').innerText(),/缺少英文描述/);assert.equal(await row.locator('.part-description-zh').textContent(),unknown.descriptionZh);await page.locator('#bom-language').click();await page.waitForFunction(()=>document.documentElement.lang==='en');row=await search(unknown.sku);assert.match(await row.locator('.part-description-en').innerText(),/English description missing/);assert.equal(await row.locator('.part-description-zh').textContent(),unknown.descriptionZh);
  await row.locator('[data-bom-select]').check();await page.locator('#bom-add').click();await bilingual(page.locator('#material-rows tr').filter({hasText:known.sku}),expected,known.descriptionZh);
  await page.locator('[name=outcome][value=awp]').check();const save=page.waitForResponse(r=>r.request().method()==='PUT'&&/\/api\/records\/\d+$/.test(r.url()));await page.locator('#save-record').click();const saved=(await(await save).json()).record;assert.equal(saved.materials.find(m=>m.sku===known.sku).descriptionEn,expected);assert.equal(saved.materials.find(m=>m.sku===known.sku).descriptionZh,known.descriptionZh);assert.equal(saved.materials.find(m=>m.sku===unknown.sku).descriptionEn,'');
  await page.locator('#language').click();await bilingual(page.locator('#material-rows tr').filter({hasText:known.sku}),expected,known.descriptionZh);assert.match(await page.locator('#material-rows tr').filter({hasText:unknown.sku}).locator('.part-description-en').innerText(),/缺少英文描述/);
  await page.locator('#logout').click();await login('admin');await page.locator('#admin-nav').click();await page.locator('#admin-section').selectOption('bom');await page.locator('#admin-model-filter').selectOption(String(model.id));
  const adminSearch=async sku=>{await page.locator('#admin-bom-search').fill(sku);const response=page.waitForResponse(r=>r.url().includes('/bom?')&&r.url().includes(sku));await page.locator('#admin-bom-search-form button').click();await response;return page.locator('.admin-table tr').filter({hasText:sku});};
  await bilingual(await adminSearch(known.sku),expected,known.descriptionZh);await page.locator('#language').click();await bilingual(await adminSearch(known.sku),expected,known.descriptionZh);
  const unknownRow=await adminSearch(unknown.sku);assert.equal(await unknownRow.locator('.part-description-zh').textContent(),unknown.descriptionZh);assert.match(await unknownRow.locator('.part-description-en').innerText(),/缺少英文描述/);
  assert.deepEqual(errors,[]);await mkdir('artifacts/bom-bilingual',{recursive:true});await page.screenshot({path:'artifacts/bom-bilingual/admin-bilingual.png',fullPage:true});
 }finally{await browser?.close();await app.close();}
});
