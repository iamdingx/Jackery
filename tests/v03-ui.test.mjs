import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdir,mkdtemp} from 'node:fs/promises';
import path from 'node:path';
import {chromium} from 'playwright';
import {startServer} from '../server.js';

async function fixture(t){
  await mkdir('tests/.tmp',{recursive:true});const app=await startServer({dataDir:await mkdtemp(path.resolve('tests/.tmp/v03-ui-')),demo:true});
  const browser=await chromium.launch({headless:true,executablePath:'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'});const page=await browser.newPage({viewport:{width:1680,height:1100}});
  const errors=[];page.on('pageerror',err=>errors.push(err.message));
  t.after(async()=>{await browser.close();await app.close();assert.deepEqual(errors,[]);});
  const login=async(name='alex',password='JackeryAlex!2026')=>{await page.locator('#username').fill(name);await page.locator('#password').fill(password);await page.locator('#login-form button').click();await page.locator('#new-record').waitFor();};
  await page.goto(app.baseUrl);await login();return {app,page,login};
}

test('v03 exact English fields, separate translations, inspection gate and draft language retention',{timeout:60000},async t=>{
  const {page}=await fixture(t);await page.locator('#new-record').click();
  assert.equal(await page.getByRole('columnheader',{name:'Inspection Result',exact:true}).count(),1);
  for(const name of ['Initial Test','Final Test'])assert.equal(await page.getByRole('columnheader',{name,exact:true}).count(),0);
  assert.equal(await page.locator('.checks input[type=radio]').count(),9);
  assert.equal(await page.locator('.checks select').count(),0);
  for(const [id,name] of Object.entries({translatedAppearanceNotes:'Translated Appearance Notes',translatedIssueNotes:'Translated Issue Notes'})){
    assert.equal(await page.getByLabel(name,{exact:true}).count(),1,id);assert.equal(await page.locator('#'+id).isDisabled(),true,id);
  }
  assert.equal(await page.locator('#productSku').isDisabled(),true);
  for(const id of ['receivingSku','postSortSku','receivingOrderNo','receivingStatus','productNameVerification','skuVerification','parentRecord','unspecifiedTextField'])assert.equal(await page.locator('#'+id).count(),0);
  assert.match(await page.locator('.evidence-section summary').textContent(),/Evidence Photos/);assert.ok(await page.getByText('Optional',{exact:true}).count());
  await page.locator('.evidence-section summary').click();
  assert.equal(await page.locator('#language').textContent(),'ZH');assert.equal(await page.locator('#language').getAttribute('aria-label'),'Switch to Chinese');
  assert.equal(await page.getByRole('button',{name:'Choose Photo',exact:true}).count(),1);assert.equal(await page.locator('#photo-file').getAttribute('class'),'sr-only');
  const fileBounds=await page.locator('#photo-file').boundingBox();assert.ok(fileBounds.width<=1&&fileBounds.height<=1,'The native OS-language file control must be visually hidden');
  await page.locator('#sn').fill('V03-DRAFT');await page.locator('#appearanceNotes').fill('原外观');await page.locator('#issueNotes').fill('Original issue');
  await page.locator('.translations summary').click();await page.locator('#translatedAppearanceNotes').fill('Manual appearance');await page.locator('#translatedIssueNotes').fill('Manual issue');
  await page.locator('[data-check-phase=initial][data-check-code=ac_output][value=fail]').check();await page.locator('[name=outcome][value=rok]').check();await page.locator('#complete-record').click();
  assert.equal(await page.locator('#form-error').textContent(),'Complete all inspection items. Refurbishment requires all results to pass.');
  await page.locator('#language').click();await page.locator('#language').click();
  assert.equal(await page.locator('#translatedAppearanceNotes').inputValue(),'Manual appearance');assert.equal(await page.locator('#issueNotes').inputValue(),'Original issue');
  assert.equal(await page.locator('[data-check-phase=initial][data-check-code=ac_output][value=fail]').isChecked(),true);
  await page.locator('[name=outcome][value=scrap]').check();await page.locator('#complete-record').click();
  assert.equal(await page.locator('#form-error').textContent(),'Enter a scrap reason before completing this record.');
  for(const code of ['dc_output','charging'])await page.locator(`[data-check-phase=initial][data-check-code=${code}][value=pass]`).check();
  await page.locator('[name=outcome][value=awp]').check();await page.locator('#save-record').click();await page.getByText('Saved successfully',{exact:true}).waitFor();
  const loaded=page.waitForResponse(r=>r.request().method()==='GET'&&/\/api\/records\/\d+$/.test(r.url()));await page.locator('#reload-record').click();await loaded;
  assert.equal(await page.locator('#translatedIssueNotes').inputValue(),'Manual issue');assert.equal(await page.locator('#appearanceNotes').inputValue(),'原外观');
  await page.locator('[name=outcome][value=like_new]').check();assert.equal(await page.locator('[data-check-phase=final]').count(),0);
  assert.equal(await page.locator('[data-check-phase=initial][data-check-code=ac_output][value=fail]').isChecked(),true);
  await page.locator('[name=outcome][value=awp]').check();assert.equal(await page.locator('[data-check-phase=final]').count(),0);assert.equal(await page.locator('[data-check-phase=initial][value=pass]:checked').count(),2);
  await page.locator('#appearanceNotes').fill('');assert.equal(await page.locator('#translatedAppearanceNotes').inputValue(),'');assert.equal(await page.locator('#translatedAppearanceNotes').isDisabled(),true);
});

test('v03 BOM keeps pending quantities across languages, warns missing English and locates duplicate',{timeout:60000},async t=>{
  const {page}=await fixture(t);await page.route('**/api/models/1/bom?*',async route=>{const q=new URL(route.request().url()).searchParams.get('q');await route.fulfill({json:{items:q==='absent'?[]:[{id:909,sku:'原-SKU-909',descriptionEn:'',descriptionZh:'原中文规格',unit:'pcs'}],total:q==='absent'?0:1}});});
  await page.locator('#new-record').click();await page.locator('#open-bom').click();
  await page.locator('#bom-results .translation-warning').waitFor();assert.ok((await page.locator('#bom-results').textContent()).includes('English description missing'));assert.ok((await page.locator('#bom-results').textContent()).includes('Original: 原中文规格'));
  await page.locator('[data-bom-select="909"]').check();await page.locator('[data-pending-qty="909"]').fill('3.25');
  await page.locator('#bom-language').click();await page.locator('#bom-language').click();assert.equal(await page.locator('[data-pending-qty="909"]').inputValue(),'3.25');
  for(const dismiss of [()=>page.locator('#bom-cancel').click(),()=>page.locator('#dialog-x').click(),()=>page.keyboard.press('Escape')]){page.once('dialog',d=>d.dismiss());await dismiss();assert.equal(await page.locator('#bom-dialog').count(),1);assert.equal(await page.locator('[data-pending-qty="909"]').inputValue(),'3.25');}
  await page.locator('#bom-add').click();assert.equal(await page.locator('[data-material-qty]').inputValue(),'3.25');await page.locator('#open-bom').click();
  await page.locator('#bom-results .duplicate-hint').waitFor();assert.ok((await page.locator('#bom-results').textContent()).includes('This item is already on the usage list. Update its quantity in the existing row.'));
  await page.locator('[data-locate-material="909"]').click();assert.equal(await page.locator('#bom-dialog').count(),0);assert.equal(await page.locator('[data-material-qty]').inputValue(),'3.25');
  assert.equal(await page.locator('[data-material-qty]').evaluate(el=>el===document.activeElement),true);
  await page.locator('#open-bom').click();await page.locator('#bom-search').fill('absent');await page.locator('#bom-search-form button').click();
  await page.getByText('No matching items in this model BOM. Check the part SKU or try another word.',{exact:true}).waitFor();
});

test('v03 SN automatic found hint and account language preferences isolate users',{timeout:60000},async t=>{
  const {page,login}=await fixture(t);await page.locator('#new-record').click();await page.locator('#sn').fill('DEMO-HISTORY-001');
  await page.getByText('Previous records found for this SN. Records owned by others are view-only.',{exact:true}).waitFor();
  assert.equal(await page.locator('#sn').isEnabled(),true);const preference=page.waitForResponse(r=>r.url().endsWith('/api/account/language')&&r.request().method()==='PUT');await page.locator('#language').click();await preference;
  page.on('dialog',d=>d.accept());await page.locator('#logout').click();await login('blair','JackeryBlair!2026');assert.equal(await page.locator('html').getAttribute('lang'),'en');
  await page.locator('#logout').click();await login();assert.equal(await page.locator('html').getAttribute('lang'),'zh');
  await page.reload();await page.locator('#new-record').waitFor();assert.equal(await page.locator('html').getAttribute('lang'),'zh');
});

test('v03 exact SN allows a new visit and history resumes only own unfinished record',{timeout:60000},async t=>{
  const {page}=await fixture(t);await page.locator('#new-record').click();await page.locator('#sn').fill('DEMO-HISTORY-001');await page.locator('[name=outcome][value=awp]').check();
  await page.locator('#save-record').click();await page.getByText('Saved successfully',{exact:true}).waitFor();const order=await page.locator('#workOrder').inputValue();
  await page.locator('#view-history').click();await page.locator('#history-results [data-history-record]').first().waitFor();
  const own=page.locator('#history-results tr').filter({hasText:order});await own.locator('[data-history-record]').click();
  assert.equal(await page.locator('#issueNotes').isDisabled(),true);assert.equal(await page.locator('#resume-record').count(),1);await page.locator('#resume-record').click();await page.locator('#resume-record').waitFor({state:'detached'});assert.equal(await page.locator('#issueNotes').isEnabled(),true);
  await page.locator('#view-history').click();await page.locator('#history-results [data-history-record]').first().waitFor();
  await page.locator('#history-results tbody tr').filter({hasNotText:order}).first().locator('[data-history-record]').click();assert.equal(await page.locator('#resume-record').count(),0);assert.equal(await page.locator('#issueNotes').isDisabled(),true);
});

test('v03 rapid SN input and logout cancel history lookup and finish the final language save',{timeout:60000},async t=>{
  const {page,login}=await fixture(t);const lateHistory=[],consoleErrors=[];let signingOut=false;
  page.on('request',request=>{if(request.url().endsWith('/api/logout'))signingOut=true;if(signingOut&&request.url().includes('/api/sn-history?'))lateHistory.push(request.url());});
  page.on('console',message=>{if(message.type()==='error')consoleErrors.push(message.text());});
  await page.locator('#new-record').click();await page.locator('#sn').fill('RAPID-LOGOUT-SN');page.once('dialog',d=>d.accept());await page.locator('#logout').click();await page.locator('#username').waitFor();
  await new Promise(resolve=>setTimeout(resolve,500));
  assert.deepEqual(lateHistory,[],'No history lookup may start after sign-out begins');assert.deepEqual(consoleErrors,[]);
  signingOut=false;await login();
  await page.route('**/api/account/language',async route=>{await new Promise(resolve=>setTimeout(resolve,150));await route.continue();});
  await page.locator('#language').click();await page.locator('#language').click();await page.locator('#language').click();await page.locator('#logout').click();await page.locator('#username').waitFor();
  await login('blair','JackeryBlair!2026');assert.equal(await page.locator('html').getAttribute('lang'),'en');await page.locator('#logout').click();await page.locator('#username').waitFor();
  await login();assert.equal(await page.locator('html').getAttribute('lang'),'zh','Sign-out must finish the last queued preference save');
  assert.deepEqual(consoleErrors,[]);
});

test('v03 sign-out aborts an in-flight SN lookup before another account starts work',{timeout:60000},async t=>{
  const {page,login}=await fixture(t);const consoleErrors=[];page.on('console',message=>{if(message.type()==='error')consoleErrors.push(message.text());});
  await page.route('**/api/sn-history?*',async route=>{await new Promise(resolve=>setTimeout(resolve,700));await route.fulfill({json:{items:[{id:999}]}}).catch(()=>{});});
  await page.locator('#new-record').click();const started=page.waitForRequest(r=>r.url().includes('/api/sn-history?'));await page.locator('#sn').fill('IN-FLIGHT-LOOKUP');await started;
  const aborted=page.waitForEvent('requestfailed',r=>r.url().includes('/api/sn-history?'));page.once('dialog',d=>d.accept());await page.locator('#logout').click();await page.locator('#username').waitFor();
  assert.match((await aborted).failure().errorText,/ABORTED|CANCELLED/i);await login('blair','JackeryBlair!2026');await page.locator('#new-record').click();
  assert.equal(await page.locator('#sn').inputValue(),'');assert.equal(await page.getByText('Previous records found for this SN. Records owned by others are view-only.',{exact:true}).count(),0);assert.deepEqual(consoleErrors,[]);
});

test('v03 custom photo picker exposes English controls and preserves original filename across languages',{timeout:60000},async t=>{
  const {page}=await fixture(t);await page.locator('#new-record').click();await page.locator('.evidence-section summary').click();assert.equal(await page.locator('#photo-selection').textContent(),'No photo selected');
  const chooser=page.waitForEvent('filechooser');await page.getByRole('button',{name:'Choose Photo',exact:true}).click();await (await chooser).setFiles({name:'原始 Evidence.png',mimeType:'image/png',buffer:Buffer.from('source bytes')});
  assert.equal(await page.locator('#photo-selection').textContent(),'Selected: 原始 Evidence.png');await page.locator('#language').click();assert.equal(await page.locator('#language').textContent(),'EN');await page.locator('#language').click();assert.equal(await page.locator('#photo-selection').textContent(),'Selected: 原始 Evidence.png');
});

test('v03 delayed broad BOM response cannot replace a newer target search',{timeout:60000},async t=>{
  const {page}=await fixture(t);let finishBroad;const broadDone=new Promise(resolve=>finishBroad=resolve);
  await page.route('**/api/models/1/bom?*',async route=>{const q=new URL(route.request().url()).searchParams.get('q');if(!q){await new Promise(resolve=>setTimeout(resolve,300));await route.fulfill({json:{items:[{id:901,sku:'STALE-BROAD-SKU',descriptionEn:'Stale broad result'}],total:1}});finishBroad();}else await route.fulfill({json:{items:[{id:902,sku:'LATEST-TARGET-SKU',descriptionEn:'Latest target result'}],total:1}});});
  await page.locator('#new-record').click();await page.locator('#open-bom').click();await page.locator('#bom-search').fill('target');await page.locator('#bom-search-form button').click();await page.getByText('LATEST-TARGET-SKU',{exact:true}).waitFor();
  await broadDone;await new Promise(resolve=>setTimeout(resolve,100));assert.ok((await page.locator('#bom-results').textContent()).includes('LATEST-TARGET-SKU'));assert.equal(await page.getByText('STALE-BROAD-SKU',{exact:true}).count(),0);
});

test('v03 closing an in-flight BOM request cannot mutate a newly opened drawer or throw after close',{timeout:60000},async t=>{
  const {page}=await fixture(t);const errors=[];page.on('pageerror',err=>errors.push(err.message));let mode='success',slow=true,finishSlow,slowDone;
  await page.route('**/api/models/1/bom?*',async route=>{if(slow){slow=false;const responseMode=mode;await new Promise(resolve=>setTimeout(resolve,300));await route.fulfill(responseMode==='error'?{status:503,json:{error:{message:'Stale BOM failure'}}}:{json:{items:[{id:903,sku:'CLOSED-DRAWER-SKU',descriptionEn:'Closed drawer result'}],total:1}});finishSlow();}else await route.fulfill({json:{items:[{id:904,sku:'CURRENT-DRAWER-SKU',descriptionEn:'Current drawer result'}],total:1}});});
  await page.locator('#new-record').click();
  for(const nextMode of ['success','error']){mode=nextMode;slow=true;slowDone=new Promise(resolve=>finishSlow=resolve);await page.locator('#open-bom').click();await page.locator('#bom-cancel').click();await page.locator('#open-bom').click();await page.getByText('CURRENT-DRAWER-SKU',{exact:true}).waitFor();await slowDone;await new Promise(resolve=>setTimeout(resolve,100));assert.ok((await page.locator('#bom-results').textContent()).includes('CURRENT-DRAWER-SKU'));assert.equal(await page.locator('#bom-error').isHidden(),true);await page.locator('#bom-cancel').click();}
  mode='error';slow=true;slowDone=new Promise(resolve=>finishSlow=resolve);await page.locator('#open-bom').click();await page.locator('#bom-cancel').click();await slowDone;await new Promise(resolve=>setTimeout(resolve,100));assert.deepEqual(errors,[]);
});
