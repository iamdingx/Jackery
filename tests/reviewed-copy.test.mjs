import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdir,mkdtemp} from 'node:fs/promises';
import path from 'node:path';
import {inflateRawSync} from 'node:zlib';
import {chromium} from 'playwright';
import {startServer} from '../server.js';

function summaryXml(bytes){
 for(let offset=0;bytes.readUInt32LE(offset)===0x04034b50;){
  const size=bytes.readUInt32LE(offset+18),len=bytes.readUInt16LE(offset+26),start=offset+30+len+bytes.readUInt16LE(offset+28),name=bytes.toString('utf8',offset+30,offset+30+len);
  if(name==='xl/worksheets/sheet1.xml')return inflateRawSync(bytes.subarray(start,start+size)).toString();
  offset=start+size;
 }
 throw new Error('Summary worksheet missing');
}

test('reviewed Chinese copy applies to admin, operator, WFR and export while English and stored codes stay intact',{timeout:60000},async t=>{
 await mkdir('tests/.tmp',{recursive:true});await mkdir('artifacts/reviewed-copy',{recursive:true});
 const app=await startServer({dataDir:await mkdtemp(path.resolve('tests/.tmp/reviewed-copy-')),demo:true});
 const browser=await chromium.launch({headless:true,executablePath:'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'}),page=await browser.newPage({viewport:{width:1536,height:864}}),errors=[];
 page.setDefaultTimeout(5000);page.on('pageerror',e=>errors.push(e.message));
 t.after(async()=>{await browser.close();app.server.closeAllConnections();await app.close();assert.deepEqual(errors,[]);});
 async function login(name,password){await page.goto(app.baseUrl);await page.locator('#username').fill(name);await page.locator('#password').fill(password);await page.locator('#login-form button').click();await page.locator('#new-record').waitFor();}
 await login('admin','JackeryAdmin!2026');assert.equal(await page.locator('#records-nav').textContent(),'All Records');
 await page.locator('#language').click();assert.equal(await page.locator('#records-nav').textContent(),'所有记录');
 await page.locator('#admin-nav').click();await page.locator('#admin-section').selectOption('bom');
 await page.getByText('全部通过才导入，拒绝已有或重复 SKU。',{exact:true}).waitFor();
 await page.locator('#language').click();await page.getByText('Atomic import: all rows must be valid; existing or duplicate SKUs are rejected.',{exact:true}).waitFor();
 await page.locator('#logout').click();await login('alex','JackeryAlex!2026');assert.equal(await page.locator('#records-nav').textContent(),'My Records');
 await page.locator('#new-record').click();await page.locator('#sn').fill('REVIEWED-COPY-AWP');await page.locator('#modelId').selectOption('1');
 await page.locator('#issueNotes').fill('Original user text / 原始备注不翻译');await page.locator('[name=outcome][value=awp]').check();
 await page.locator('[data-check-code][value=fail]').first().check();
 await page.locator('#language').click();
 assert.equal(await page.locator('#records-nav').textContent(),'我的记录');assert.equal(await page.locator('main h1').textContent(),'工单记录');
 assert.ok((await page.locator('label').filter({has:page.locator('#workOrder')}).textContent()).includes('工单号'));
 assert.equal((await page.locator('label').filter({has:page.locator('[name=outcome][value=awp]')}).textContent()).trim(),'待料');
 assert.equal(await page.locator('#issueNotes').inputValue(),'Original user text / 原始备注不翻译');
 await page.screenshot({path:'artifacts/reviewed-copy/zh-editor.png'});
 await page.locator('#save-record').click();await page.getByText('保存成功',{exact:true}).waitFor();
 const record=(await(await page.request.get(app.baseUrl+'/api/records?q=REVIEWED-COPY-AWP')).json()).items[0];
 assert.equal(record.outcome,'awp');assert.equal(record.status,'wfr');assert.equal(record.issueNotes,'Original user text / 原始备注不翻译');assert.ok(Object.values(record.checks.initial).includes('fail'));
 const catalog=await(await page.request.get(app.baseUrl+'/api/catalog')).json();assert.deepEqual(catalog.outcomes.find(x=>x.code==='awp'),{code:'awp',group:'wfr',labelEn:'AWP',labelZh:'待料'});
 const exported=await page.request.get(app.baseUrl+'/api/export?language=zh');assert.equal(exported.status(),200);const xml=summaryXml(await exported.body());
 assert.match(xml,/>待料</);assert.match(xml,/>AWP</);assert.match(xml,/>awp</);assert.match(xml,/>作业单号</,'Unedited export header retains its reviewed baseline');
 await page.locator('#language').click();assert.equal(await page.locator('main h1').textContent(),'Work Record');assert.equal((await page.locator('label').filter({has:page.locator('[name=outcome][value=awp]')}).textContent()).trim(),'AWP');
 assert.equal(await page.locator('[name=outcome][value=awp]').isChecked(),true);assert.equal(await page.locator('#issueNotes').inputValue(),record.issueNotes);
 await page.locator('#records-nav').click();assert.equal(await page.locator('#records-nav').textContent(),'My Records');
 await page.locator('#language').click();await page.locator('#filter-q').fill(record.sn);await page.locator('#filters button').click();await page.locator('tr').filter({hasText:record.sn}).getByRole('cell',{name:'待料',exact:true}).waitFor();
});
