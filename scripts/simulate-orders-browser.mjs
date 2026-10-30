import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir,mkdtemp} from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {chromium} from 'playwright';
import {startServer} from '../server.js';

// All business requests are real. Only the explicitly labelled photo retry case
// intercepts its first upload, to exercise recovery from a network failure.
const args=process.argv.slice(2),arg=(key,fallback)=>args.includes(key)?args[args.indexOf(key)+1]:fallback;
const root=path.resolve(import.meta.dirname,'..'),output=path.resolve(arg('--output-dir',path.join(root,'docs/batch-simulation')));
const prefix=arg('--prefix','BROWSER-'+new Date().toISOString().replace(/\D/g,'').slice(0,14));
const plan=JSON.parse(await readFile(path.join(root,'docs/batch-simulation/CASES.json'),'utf8'));
let cases=plan.cases;if(arg('--only'))cases=cases.filter(c=>arg('--only').split(',').includes(c.id));
if(arg('--limit'))cases=cases.slice(0,Number(arg('--limit')));
await mkdir(output,{recursive:true});await mkdir(path.join(output,'screenshots'),{recursive:true});
let priorRuns=[];try{const previous=JSON.parse(await readFile(path.join(output,'BROWSER_RESULTS.json'),'utf8'));priorRuns=[...(previous.priorRuns||[]),{...previous,priorRuns:undefined}];}catch(error){if(error.code!=='ENOENT')throw error;}
const startedAt=new Date().toISOString(),results=[],globalErrors=[],setupNetwork=[],coverage=new Set(),recordIds=new Set();
let app,browser,active=null;const actors={};
const special='<script>globalThis.__faultInjected=true</script> & "quote" \'apostrophe\' / 测试';
let dataDir,baseUrl=arg('--base-url'),fixture;
if(!baseUrl){
 await mkdir(path.join(root,'tests/.tmp'),{recursive:true});dataDir=await mkdtemp(path.join(root,'tests/.tmp/batch-browser-'));
 const catalog=JSON.parse(await readFile(path.join(root,'catalogs/jackery-eu-20261030.json'),'utf8'));
 const fault=catalog.models.find(x=>x.catalogKey==='e2000v2-costdown').knowledge.faultCodes.find(x=>x.code==='F0');fault.descriptionZh+='\n'+special;
 const catalogPath=path.join(dataDir,'simulation-catalog.json');await writeFile(catalogPath,JSON.stringify(catalog));
 fixture={type:'isolated catalog copy',catalogPath,specialFaultModel:'e2000v2-costdown',specialFaultCode:'F0',specialText:special,sha256:createHash('sha256').update(JSON.stringify(catalog)).digest('hex')};
 app=await startServer({dataDir,demo:true,catalogPath});baseUrl=app.baseUrl;
}
const ok=(condition,message)=>{assert.ok(condition,message);active?.assertions.push(message);};
const eq=(actual,expected,message)=>{assert.deepEqual(actual,expected,message);active?.assertions.push(message);};
const by=(p,id)=>p.locator('#'+id);
function logNet(entry){(active?.network??setupNetwork).push(entry);}
async function request(actor,method,url,data,expected,headers={}){
 const response=await actor.page.request.fetch(baseUrl+url,{method,...(data===undefined?{}:{data}),headers:{'X-CSRF-Token':actor.csrf,...headers}});
 let json;try{json=await response.json();}catch{}
 logNet({source:'page.request',actor:actor.name,method,path:url,status:response.status(),...(json?.error?{error:json.error}:{})});
 if(expected!==undefined)eq(response.status(),expected,`${method} ${url.split('?')[0]} returns ${expected}`);
 return {response,json};
}
async function login(name){
 const context=await browser.newContext({viewport:{width:1366,height:768}}),page=await context.newPage();page.setDefaultTimeout(5000);
 const actor={name,context,page};actors[name]=actor;
 page.on('dialog',d=>d.accept());page.on('pageerror',e=>{const item={actor:name,type:'pageerror',message:e.message};(active?.console??globalErrors).push(item);});
 page.on('console',m=>{if(['error','warning'].includes(m.type()))(active?.console??globalErrors).push({actor:name,type:m.type(),message:m.text()});});
 page.on('response',r=>{if(r.url().startsWith(baseUrl+'/api/'))logNet({source:'browser',actor:name,method:r.request().method(),path:r.url().slice(baseUrl.length),status:r.status()});});
 await page.goto(baseUrl);await by(page,'username').fill(name);await by(page,'password').fill(({alex:'JackeryAlex!2026',blair:'JackeryBlair!2026',admin:'JackeryAdmin!2026'})[name]);await page.locator('#login-form button').click();await by(page,'new-record').waitFor();
 actor.csrf=(await (await page.request.get(baseUrl+'/api/session')).json()).csrfToken;coverage.add('login:'+name);return actor;
}
async function language(p,lang){if(await p.locator('html').getAttribute('lang')!==lang){const response=p.waitForResponse(r=>r.url().endsWith('/api/account/language')&&r.request().method()==='PUT');await by(p,'language').click();await response;}eq(await p.locator('html').getAttribute('lang'),lang,'account language is '+lang);coverage.add('account language');}
async function saveUI(p,id='save-record'){
 const saved=p.waitForResponse(r=>r.request().method()==='PUT'&&/\/api\/records\/\d+$/.test(r.url()),{timeout:5000});await by(p,id).click();const response=await saved;
 eq(response.status(),200,'UI '+id+' returns 200');const record=(await response.json()).record;
 await p.waitForFunction(version=>document.querySelector('.heading')?.textContent.includes('Version '+version)||document.querySelector('.heading')?.textContent.includes('版本 '+version),record.version);
 return record;
}
async function reloadUI(p,r){const response=p.waitForResponse(x=>x.request().method()==='GET'&&x.url().endsWith('/api/records/'+r.id));await by(p,'reload-record').click();await response;await p.waitForFunction(sn=>document.querySelector('#sn')?.value===sn,r.sn);coverage.add('Current Record/reload');}
async function checksUI(p,checks){for(const [code,value] of Object.entries(checks))await p.locator(`[data-check-code="${code}"][value="${value}"]`).check();}
async function faultsUI(p,codes){
 await by(p,'fault-codes').click();for(const code of codes)await p.locator(`[data-fault-select="${code}"]`).check();await by(p,'fault-close').click();
 eq(await p.locator('[data-fault-detail]').allTextContents(),codes,'selected fault code chips preserve selection');coverage.add('fault selector');
}
async function addMaterials(p,materials){
 const existingCount=await p.locator('[data-material-qty]').count();
 await by(p,'open-bom').click();await p.waitForFunction(()=>document.querySelector('#bom-page')?.textContent.trim());coverage.add('BOM drawer');
 for(const m of materials){
  await by(p,'bom-search').fill(m.sku);const response=p.waitForResponse(r=>r.url().includes('/bom?')&&r.url().includes(encodeURIComponent(m.sku)));await p.locator('#bom-search-form button').click();await response;
  const row=p.locator('#bom-results tr').filter({hasText:m.sku});await row.locator('[data-bom-select]').check();
  const pending=p.locator('.pending-item').filter({hasText:m.sku});eq(await pending.locator('[data-pending-qty]').getAttribute('max'),String(m.standardQty),'BOM input carries confirmed hard limit');await pending.locator('[data-pending-qty]').fill(String(m.qty));
  const description=row.locator('td').nth(1);ok((await description.textContent()).trim().length>0,'BOM description is visible');
 }
 if(materials.length){await by(p,'bom-add').click();eq(await p.locator('[data-material-qty]').count(),existingCount+materials.length,'drawer adds one distinct row per requested material');}
 else{if(active?.requestedCatalogKey==='e1000-default')eq(await p.locator('[data-bom-select]').count(),0,'E1000 suspended BOM is not selectable');await by(p,'bom-cancel').click();}
}
async function modelSwitchDraft(p,c,model){
 const target=models.find(x=>x.catalogKey==='e1000-default');await by(p,'modelId').selectOption(String(target.id));
 eq(await p.locator('[data-material-qty]').count(),0,'model switch clears selected materials');eq(await p.locator('[data-fault-detail]').count(),0,'model switch clears fault codes');eq(await p.locator('[data-check-phase=initial][value=not_tested]:checked').count(),target.checkItems.length,'model switch resets initial inspection');
 await by(p,'modelId').selectOption(String(model.id));await faultsUI(p,c.faultCodes);await addMaterials(p,c.materials);await checksUI(p,c.checks.initial);
 coverage.add('model switch context reset');
}
async function baseline(c,actor,supplemental=false){
 const p=actor.page,model=models.find(x=>x.catalogKey===c.catalogKey);ok(model?.active,'case baseline selects an active model');
 await p.setViewportSize(Number(c.id.slice(1))%2?{width:1366,height:768}:{width:1536,height:864});
 if(await p.locator('dialog[open] #dialog-x').count())await by(p,'dialog-x').click();await by(p,'records-nav').click();await by(p,'new-record').click();coverage.add('My Records/new record');await language(p,c.language);
 const sn=(c.snTemplate??c.sn).replace('{prefix}',prefix);await by(p,'sn').fill(sn);await by(p,'sn').press('Enter');eq(await by(p,'sn').inputValue(),sn,'SN Enter retains exact independent scan');
 await by(p,'modelId').selectOption(String(model.id));eq(await by(p,'modelId').inputValue(),String(model.id),'model/version explicitly selected after scan');
 eq(await p.locator('.checks input[type=radio]').count(),model.checkItems.length*3,'one three-choice inspection group per function');eq(await p.locator('.checks select,[data-check-phase=final]').count(),0,'no dropdown or new final inspection');
 await faultsUI(p,c.faultCodes);await addMaterials(p,c.materials);await checksUI(p,c.checks.initial);
 if(['model_change_clears_context','fault_model_switch'].includes(c.variant))await modelSwitchDraft(p,c,model);
 await by(p,'appearanceNotes').fill(c.id+' 外观 / Appearance');await by(p,'issueNotes').fill(c.id+' 问题 / Issue');
 await p.locator(`[name=outcome][value="${c.outcome}"]`).check();if(c.outcome==='scrap')await by(p,'scrapReason').fill(c.scrapReason);
 eq(await p.locator('[name=outcome]:checked').count(),1,'exactly one outcome across seven choices');
 const created=p.waitForResponse(r=>r.request().method()==='POST'&&r.url().endsWith('/api/records'));const r=await saveUI(p);eq((await created).status(),201,'UI creates independent work record with 201');
 ok(!recordIds.has(r.id),'baseline record ID is unique across cases');if(!supplemental){recordIds.add(r.id);active.recordId=r.id;active.sn=r.sn;active.modelId=r.modelId;active.workOrder=r.workOrder;}else active.additionalRecordIds=[...(active.additionalRecordIds||[]),r.id];
 eq(r.checks.initial,c.checks.initial,'saved initial inspection equals UI choices');eq(Object.hasOwn(r.checks,'final'),false,'new record has no checks.final');eq(r.faultCodes,c.faultCodes,'saved optional faults equal UI chips');
 eq(r.materials.map(x=>({sku:x.sku,qty:x.quantity,standardQty:x.standardQty})),c.materials,'saved BOM quantities and standard caps match case');
 await reloadUI(p,r);eq(await by(p,'issueNotes').inputValue(),c.id+' 问题 / Issue','reload retains saved original notes');
 if(!coverage.has('Current Record menu')){await by(p,'records-nav').click();await by(p,'current-nav').click();eq(await by(p,'sn').inputValue(),sn,'Current Record menu returns to the saved independent work record');coverage.add('Current Record menu');}
 const overflow=await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth);eq(overflow,false,'desktop viewport has no horizontal overflow');await p.locator('.actions').scrollIntoViewIfNeeded();const actions=await p.locator('.actions').boundingBox();ok(actions.y+actions.height<=p.viewportSize().height+1,'outcome save controls fit desktop viewport');
 return r;
}
let models,boms;
async function negativeUpdate(actor,r,changes,status=422,extra={}){
 const before=(await request(actor,'GET','/api/records/'+r.id,undefined,200)).json.record;
 const result=await request(actor,'PUT','/api/records/'+r.id,{version:r.version,...changes},status,extra);
 const after=(await request(actor,'GET','/api/records/'+r.id,undefined,200)).json.record;eq(after,before,'rejected mutation is atomic; record, version and snapshots unchanged');return result;
}
async function frontError(p,button,pattern){await by(p,button).click();await p.waitForFunction(()=>document.querySelector('#form-error')?.textContent.trim());ok(pattern.test(await by(p,'form-error').textContent()),'front-end rejects invalid input with clear error');coverage.add('front-end validation');}
async function completeUI(actor,r){
 const p=actor.page;await p.locator('[name=outcome][value=rok]').check();for(const radio of await p.locator('[data-check-phase=initial][value=pass]').all())await radio.check();await p.locator('[data-check-phase=initial][value=fail]').first().check();
 const completed=await saveUI(p,'complete-record');eq(completed.status,'completed','ROK completes with every item assessed, including Fail');eq(Object.hasOwn(completed.checks,'final'),false,'ROK creates no final checks');ok(await by(p,'issueNotes').isDisabled(),'completed record locks UI');return completed;
}
async function openAdminRecord(r){
 const a=actors.admin,p=a.page;await by(p,'records-nav').click();await by(p,'filter-q').fill(r.sn);const response=p.waitForResponse(x=>x.url().includes('/api/records?'));await p.locator('#filters button').click();await response;await p.locator(`[data-open-record="${r.id}"]`).click();await by(p,'start-correction').waitFor();return a;
}
async function screenshot(p,name){const file=path.join(output,'screenshots',name+'.png');await p.screenshot({path:file,fullPage:true});active?.screenshots.push(path.relative(output,file).replaceAll('\\','/'));}
async function exportUI(actor,c,lang){
 const p=actor.page;await by(p,'records-nav').click();await language(p,lang);await by(p,'filter-q').fill(active.sn);const response=p.waitForResponse(x=>x.url().includes('/api/records?'));await p.locator('#filters button').click();await response;
 const downloadPromise=p.waitForEvent('download');await by(p,'export-records').click();const download=await downloadPromise;ok(/\.xlsx$/.test(download.suggestedFilename()),'UI downloads an Excel workbook');const filename=path.join(output,'screenshots',c.id+'-'+lang+'.xlsx');await download.saveAs(filename);active.exports=[...(active.exports||[]),path.relative(output,filename).replaceAll('\\','/')];
 const resp=await request(actor,'GET','/api/export?language='+lang+'&q='+encodeURIComponent(active.sn),undefined,200);const bytes=await resp.response.body();eq(bytes.subarray(0,2).toString(),'PK','export is a real XLSX ZIP');coverage.add('Excel export '+lang);
}
async function menuCoverage(c){
 const a=actors.admin,p=a.page;await by(p,'admin-nav').click();for(const section of ['users','models','appearance','bom']){await by(p,'admin-section').selectOption(section);await by(p,'admin-new').waitFor();coverage.add('Administration/'+section);if(section==='bom'){await by(p,'csv-content').waitFor();coverage.add('CSV import form');const downloaded=p.waitForEvent('download');await p.locator('a[href="/api/admin/bom/template"]').click();ok((await downloaded).suggestedFilename().endsWith('.csv'),'CSV template downloads from real endpoint');coverage.add('CSV template');}}
 await by(p,'account').click();await by(p,'password-dialog').waitFor();await by(p,'dialog-x').click();coverage.add('password dialog');await screenshot(p,'admin-bom-menu');
 const records=await request(a,'GET','/api/catalog?includeInactive=1',undefined,200);eq(records.json.models.filter(m=>m.catalogKey).length,9,'admin catalog includes all nine imported model versions');
}
async function runVariant(c,actor,r){
 const p=actor.page,v=c.variant,first=r.materials[0],initial={initial:Object.fromEntries(Object.keys(r.checks.initial).map(k=>[k,'pass']))};
 if(c.category==='positive'){
  if(['awp','needs_analysis'].includes(c.outcome)){eq(r.status,'wfr','WFR remains unfinished after save');eq(await by(p,'complete-record').count(),0,'WFR has Save WFR, no completion action');await by(p,'issueNotes').fill(c.id+' resumed / 续填');r=await saveUI(p);eq(r.materials.map(x=>x.quantity),c.materials.map(x=>x.qty),'WFR resume does not accumulate consumption');r=await completeUI(actor,r);}
  else{r=await saveUI(p,'complete-record');eq(r.status,'completed','eligible result completes and locks');ok(await by(p,'issueNotes').isDisabled(),'completed UI is read only');}
  active.finalStatus=r.status;return;
 }
 switch(v){
 case 'cap_save_over':case 'cap_complete_over':case 'quantity_zero':case 'quantity_negative':case 'pcs_fraction':{
  const quantity=({quantity_zero:0,quantity_negative:-1,pcs_fraction:0.5})[v]??first.standardQty+1;
  await p.locator('[data-material-qty]').first().fill(String(quantity));if(v==='cap_complete_over'){await p.locator('[name=outcome][value=rok]').check();await checksUI(p,initial.initial);}
  await frontError(p,v==='cap_complete_over'?'complete-record':'save-record',/quantity|数量|上限|用量/i);await reloadUI(p,r);
  await negativeUpdate(actor,r,{materials:[{bomId:first.bomId,quantity}],...(v==='cap_complete_over'?{action:'complete',outcome:'rok',checks:initial}:{})});break;
 }
 case 'cap_admin_over':{
  r=await completeUI(actor,r);const admin=await openAdminRecord(r);await by(admin.page,'start-correction').click();await by(admin.page,'correctionReason').fill('Over-cap negative simulation');await admin.page.locator('[data-material-qty]').first().fill(String(first.standardQty+1));await frontError(admin.page,'save-correction',/quantity|数量|上限|用量/i);
  await request(admin,'POST',`/api/records/${r.id}/corrections`,{version:r.version,reason:'Over-cap negative simulation',changes:{materials:[{bomId:first.bomId,quantity:first.standardQty+1}]}},422);await by(admin.page,'cancel-correction').click();break;
 }
 case 'quantity_string':case 'quantity_null':await negativeUpdate(actor,r,{materials:[{bomId:first.bomId,quantity:v==='quantity_string'?'1':null}]});break;
 case 'duplicate_material':await by(p,'open-bom').click();await p.waitForFunction(()=>document.querySelector('#bom-page')?.textContent.trim());await by(p,'bom-search').fill(first.sku);{const response=p.waitForResponse(x=>x.url().includes('/bom?')&&x.url().includes(first.sku));await p.locator('#bom-search-form button').click();await response;}ok(await p.locator(`[data-bom-select="${first.bomId}"]`).isDisabled(),'existing BOM checkbox disabled to prevent duplicate');await by(p,'bom-cancel').click();await negativeUpdate(actor,r,{materials:[{bomId:first.bomId,quantity:1},{bomId:first.bomId,quantity:1}]});break;
 case 'foreign_model_material':await negativeUpdate(actor,r,{materials:[{bomId:boms.find(b=>b.active&&b.modelId!==r.modelId).id,quantity:1}]});break;
 case 'suspended_material':await negativeUpdate(actor,r,{materials:[{bomId:boms.find(b=>b.modelId===r.modelId&&!b.active).id,quantity:1}]});break;
 case 'unknown_bom':await negativeUpdate(actor,r,{materials:[{bomId:9999999,quantity:1}]});break;
 case 'cap_exact_save':case 'cap_lower_save':{
  const quantity=v==='cap_exact_save'?first.standardQty:1;await p.locator('[data-material-qty]').first().fill(String(quantity));const saved=await saveUI(p);eq(saved.materials[0].quantity,quantity,'confirmed at/below hard cap saves');break;
 }
 case 'wfr_repeated_not_accumulated':for(let i=0;i<3;i++)r=await saveUI(p);eq(r.materials[0].quantity,first.quantity,'three WFR saves preserve quantity, never accumulate');break;
 case 'catalog_counts':eq(models.length,9,'nine imported model versions');eq(models.filter(m=>m.active).length,7,'seven active models');eq(boms.length,404,'404 candidate BOM rows');eq(boms.filter(x=>x.active).length,261,'261 enabled material rows');eq(boms.filter(x=>!x.active).length,143,'143 suspended rows');await menuCoverage(c);break;
 case 'suspended_original_create':case 'suspended_a_create':{
  const inactive=models.find(x=>x.catalogKey===(v==='suspended_original_create'?'e1000v2-original':'e2000plus-a'));eq(await p.locator(`#modelId option[value="${inactive.id}"]`).count(),0,'suspended model version absent from selectable UI');await request(actor,'POST','/api/records',{sn:r.sn+'-inactive',modelId:inactive.id},422);break;
 }
 case 'e1000_no_consumption':await negativeUpdate(actor,r,{materials:[{bomId:boms.find(x=>x.modelId===r.modelId).id,quantity:1}]});break;
 case 'version_independent_cap':{
  const sku='08-1000-100253',costdown=models.find(x=>x.catalogKey==='e1000v2-costdown'),plus=models.find(x=>x.catalogKey==='e2000plus-b');const one=boms.find(x=>x.modelId===costdown.id&&x.sku===sku),two=boms.find(x=>x.modelId===plus.id&&x.sku===sku);eq(one.standardQty,17,'E1000V2 Cost-down screw cap is 17');eq(two.standardQty,25,'E2000plus B screw cap is 25');ok(one.id!==two.id,'same SKU belongs to independent model/version BOM identities');
  await addMaterials(p,[{sku,qty:17,standardQty:17}]);r=await saveUI(p);eq(r.materials.find(m=>m.sku===sku).quantity,17,'first independent UI record saves the 17-piece model cap');await negativeUpdate(actor,r,{materials:[{bomId:one.id,quantity:18}]});
  const second=await baseline({...c,id:c.id+'B',snTemplate:'{prefix}-060-independent-plusB',catalogKey:plus.catalogKey,faultCodes:['F0','F9'],materials:[{sku,qty:25,standardQty:25}],checks:{initial:Object.fromEntries(plus.checkItems.map(i=>[i.code,'not_tested']))}},actor,true);eq(second.materials[0].quantity,25,'second independent UI record saves the 25-piece model cap');ok(second.id!==r.id,'17/25 caps are verified on separate actual work records');await negativeUpdate(actor,second,{materials:[{bomId:two.id,quantity:26}]});
  r=(await request(actor,'PUT','/api/records/'+r.id,{version:r.version,modelId:plus.id,materials:[{bomId:two.id,quantity:25}],faultCodes:['F0','F9'],checks:{initial:{}}},200)).json.record;
  eq(r.modelId,plus.id,'single request switches to active target model');eq(r.materials.map(m=>[m.bomId,m.quantity,m.standardQty]),[[two.id,25,25]],'model switch resolves new BOM snapshot and target cap');eq(r.faultCodes,['F0','F9'],'model switch accepts target fault codes');eq(r.faultSnapshot.map(f=>f.code),['F0','F9'],'model switch resolves new fault snapshots');ok(Object.values(r.checks.initial).every(x=>x==='not_tested'),'model switch clears old inspection states');
  await by(p,'records-nav').click();await by(p,'filter-q').fill(r.sn);const response=p.waitForResponse(x=>x.url().includes('/api/records?'));await p.locator('#filters button').click();await response;await p.locator(`[data-open-record="${r.id}"]`).click();eq(await by(p,'modelId').inputValue(),String(plus.id),'UI reload shows API-switched model snapshot');eq(await p.locator('[data-material-qty]').inputValue(),'25','UI reload shows target BOM quantity');break;
 }
 case 'blank_sn':case 'whitespace_sn':case 'overlength_sn':case 'numeric_sn':case 'control_sn':{
  const sn=({blank_sn:'',whitespace_sn:'   ',overlength_sn:'S'.repeat(201),numeric_sn:12345,control_sn:'BAD\u0001SN'})[v];if(['blank_sn','whitespace_sn'].includes(v)){await by(p,'sn').fill(sn);await frontError(p,'save-record',/required|序列|serial/i);await reloadUI(p,r);}await request(actor,'POST','/api/records',{sn,modelId:r.modelId},422);break;
 }
 case 'sn_trim':case 'sn_special_chars':case 'same_sn_second_record':{
  const sn=v==='sn_trim'?'  '+r.sn+'-trim  ':v==='sn_special_chars'?r.sn+' <tag> & " 中文':r.sn;
  const created=(await request(actor,'POST','/api/records',{sn,modelId:r.modelId},201)).json.record;eq(created.sn,sn.trim(),'new scan preserves special characters and trims outer spaces');ok(created.id!==r.id,'second work order has independent record identity');active.additionalRecordIds=[created.id];break;
 }
 case 'exact_history':case 'partial_history_empty':{
  await by(p,'history-nav').click();await by(p,'history-sn').fill(v==='exact_history'?r.sn:r.sn.slice(0,-4));const history=p.waitForResponse(x=>x.url().includes('/api/sn-history?'));await p.locator('#history-form button').click();const resp=await history;const items=(await resp.json()).items;
  if(v==='exact_history'){ok(items.some(x=>x.id===r.id),'exact SN finds baseline in history');await p.locator(`[data-history-record="${r.id}"]`).click();ok(await by(p,'issueNotes').isDisabled(),'history is read only');await by(p,'view-audit').click();await by(p,'audit-close').click();}
  else eq(items.length,0,'partial SN does not expose exact history');coverage.add('SN History');break;
 }
 case 'invalid_model':case 'string_model':await request(actor,'POST','/api/records',{sn:r.sn+'-bad-model',modelId:v==='invalid_model'?999999:String(r.modelId)},422);break;
 case 'model_change_clears_context':case 'fault_model_switch':ok(true,'real UI model switch/reset was verified before saving this independent baseline');break;
 case 'model_change_foreign_material':await negativeUpdate(actor,r,{modelId:models.find(x=>x.catalogKey==='e1000-default').id,materials:[{bomId:first.bomId,quantity:1}],checks:{initial:{}}});break;
 case 'model_change_old_checks':await negativeUpdate(actor,r,{modelId:models.find(x=>x.catalogKey==='e1000-default').id,materials:[],faultCodes:[],checks:r.checks});break;
 case 'fault_optional':await faultsUI(p,[]);r=await saveUI(p);eq(r.faultCodes,[],'optional fault selection may remain empty');break;
 case 'fault_all_f0_f9':{const codes=Array.from({length:10},(_,i)=>'F'+i);await faultsUI(p,codes);r=await saveUI(p);eq(r.faultCodes,codes,'all F0-F9 codes save without loss');break;}
 case 'fault_unknown':case 'fault_duplicate':case 'fault_nonarray':await negativeUpdate(actor,r,{faultCodes:v==='fault_unknown'?['F_UNKNOWN']:v==='fault_duplicate'?['F0','F0']:'F0'});break;
 case 'fault_snapshot_original':case 'fault_snapshot_specialchars':{
  if(!r.faultSnapshot.length){await faultsUI(p,['F0']);r=await saveUI(p);}
  const fault=r.faultSnapshot[0],knowledge=(await request(actor,'GET',`/api/models/${r.modelId}/knowledge`,undefined,200)).json;eq(fault,knowledge.faultCodes.find(x=>x.code===fault.code),'fault snapshot matches every original model knowledge field');ok(fault?.source?.file,'fault snapshot retains exact source citation');await p.locator('[data-fault-detail]').first().click();const text=await by(p,'fault-detail-dialog').textContent();ok(text.includes(fault.descriptionZh),'fault dialog displays original source text');
  if(v==='fault_snapshot_specialchars'){ok(fault.descriptionZh.includes('<')&&fault.descriptionZh.includes('&'),'special character fixture is present, not silently skipped');eq(await by(p,'fault-detail-dialog').locator('script,tag').count(),0,'fault source HTML is escaped into text');eq(await p.evaluate(()=>globalThis.__faultInjected),undefined,'source text executes no JavaScript');}
  await by(p,'fault-detail-close').click();await by(p,'open-guides').click();ok(await by(p,'guides-dialog').locator('details').count()>0,'common fault solutions remain on the page');await by(p,'guides-close').click();coverage.add('fault source detail/guides');break;
 }
 case 'fault_order_preserved':{const codes=['F9','F2','F0'];await by(p,'fault-codes').click();const selected=await p.locator('[data-fault-select]:checked').evaluateAll(items=>items.map(x=>x.dataset.faultSelect));for(const code of selected)await p.locator(`[data-fault-select="${code}"]`).uncheck();for(const code of codes)await p.locator(`[data-fault-select="${code}"]`).check();await by(p,'fault-close').click();r=await saveUI(p);eq(r.faultCodes,codes,'fault click order survives saving');break;}
 case 'fault_translation_notes':case 'notes_reference_export':{
  await p.locator('.translations summary').click();await by(p,'translatedIssueNotes').fill('Manual translation, original retained');r=await saveUI(p);eq(r.translatedIssueNotes,'Manual translation, original retained','manual note translation saves');ok(r.issueNotes.includes(c.id),'manual translation does not overwrite source note');if(v==='notes_reference_export'){r=(await request(actor,'PUT','/api/records/'+r.id,{version:r.version,receivingSku:'REF-SKU',parentRecord:'REF-PARENT'},200)).json.record;await reloadUI(p,r);eq(await p.getByText('Reference Details',{exact:true}).count(),0,'reference input block remains removed');await exportUI(actor,c,'en');}break;
 }
 case 'foreign_read':case 'foreign_write':case 'foreign_history_readonly':case 'export_other_owner':{
  const other=actors[actor.name==='alex'?'blair':'alex'];if(v==='foreign_read')await request(other,'GET','/api/records/'+r.id,undefined,403);
  if(v==='foreign_write')await request(other,'PUT','/api/records/'+r.id,{version:r.version,issueNotes:'unauthorized'},403);
  if(v==='export_other_owner')await request(other,'GET','/api/export?ownerId='+r.ownerId,undefined,403);
  if(v==='foreign_history_readonly'){const q=other.page;await by(q,'history-nav').click();await by(q,'history-sn').fill(r.sn);const history=q.waitForResponse(x=>x.url().includes('/api/sn-history?'));await q.locator('#history-form button').click();await history;await q.locator(`[data-history-record="${r.id}"]`).click();ok(await by(q,'issueNotes').isDisabled(),'another owner exact SN history is read only');await request(other,'PUT','/api/records/'+r.id,{version:r.version,issueNotes:'unauthorized history edit'},403);coverage.add('foreign SN History');}
  break;
 }
 case 'operator_admin':eq(await by(p,'admin-nav').count(),0,'operator has no administration menu');await request(actor,'GET','/api/admin/users',undefined,403);break;
 case 'csrf_invalid':await negativeUpdate(actor,r,{issueNotes:'bad csrf'},403,{'X-CSRF-Token':'invalid-simulation-token'});break;
 case 'stale_version':{const newest=(await request(actor,'PUT','/api/records/'+r.id,{version:r.version,issueNotes:'saved in second session'},200)).json.record;await by(p,'issueNotes').fill('retained unsaved edit');const response=p.waitForResponse(x=>x.request().method()==='PUT'&&x.url().endsWith('/api/records/'+r.id));await by(p,'save-record').click();eq((await response).status(),409,'stale UI save returns 409');eq(await by(p,'issueNotes').inputValue(),'retained unsaved edit','conflict retains unsaved input');await negativeUpdate(actor,r,{issueNotes:'stale API edit'},409);await reloadUI(p,newest);coverage.add('stale version recovery');break;}
 case 'completed_lock':r=await completeUI(actor,r);await negativeUpdate(actor,r,{issueNotes:'illegal completed edit'},403);break;
 case 'correction_reason_required':case 'correction_audit':{
  r=await completeUI(actor,r);const admin=await openAdminRecord(r),q=admin.page;await by(q,'start-correction').click();await by(q,'issueNotes').fill('Admin corrected '+c.id);
  if(v==='correction_reason_required'){await frontError(q,'save-correction',/reason|原因/i);await request(admin,'POST',`/api/records/${r.id}/corrections`,{version:r.version,reason:'',changes:{issueNotes:'rejected'}},422);await by(q,'cancel-correction').click();}
  else{await by(q,'correctionReason').fill('Evidence reviewed '+c.id);const response=q.waitForResponse(x=>x.url().endsWith(`/api/records/${r.id}/corrections`));await by(q,'save-correction').click();eq((await response).status(),200,'reasoned admin correction succeeds');const audit=(await request(admin,'GET',`/api/records/${r.id}/audit`,undefined,200)).json.items;ok(audit.some(x=>x.action==='correction'&&x.reason==='Evidence reviewed '+c.id&&x.before.issueNotes!==x.after.issueNotes),'audit retains correction reason and before/after');await by(q,'view-audit').click();ok((await by(q,'audit-dialog').textContent()).includes('Evidence reviewed '+c.id),'UI displays correction audit');await by(q,'audit-close').click();coverage.add('reasoned admin correction/audit');}break;
 }
 case 'language_en_export':case 'language_zh_export':{
  if(v==='language_zh_export'){
   const original='浏览器未知英文夹具 '+prefix,sku='UI-UNTRANSLATED-'+prefix;
   const part=(await request(actors.admin,'POST','/api/admin/bom',{modelId:r.modelId,sku,descriptionEn:'',descriptionZh:original,unit:'pcs',standardQty:1,active:true,source:{file:'isolated browser regression fixture; not imported source BOM'}},201)).json.item;
   active.fixtures=[{type:'isolated new BOM for unknown translation',bomId:part.id,sku,descriptionZh:original,sourceCatalogUnchanged:true}];
   await by(p,'open-bom').click();await by(p,'bom-search').fill(sku);const response=p.waitForResponse(x=>x.url().includes('/bom?')&&x.url().includes(encodeURIComponent(sku)));await p.locator('#bom-search-form button').click();await response;
   const row=p.locator('#bom-results tr').filter({hasText:sku});for(const lang of ['en','zh']){if(await p.locator('html').getAttribute('lang')!==lang){await by(p,'bom-language').click();await p.waitForFunction(target=>document.documentElement.lang===target,lang);}await p.locator('#bom-results [data-bom-select]').waitFor();eq(await row.locator('.part-description-zh').textContent(),original,'untranslated BOM preserves exact original below warning in '+lang);ok(/English description missing|缺少英文描述/.test(await row.locator('.part-description-en').textContent()),'untranslated BOM explicitly marks English missing in '+lang);}
   await row.locator('[data-bom-select]').check();await by(p,'bom-add').click();r=await saveUI(p);eq(r.materials.find(m=>m.sku===sku).descriptionEn,'','unknown translation is never fabricated in saved snapshot');
  }
  await language(p,v==='language_en_export'?'en':'zh');eq(await by(p,'issueNotes').inputValue(),c.id+' 问题 / Issue','language change preserves current saved contents');await exportUI(actor,c,v==='language_en_export'?'en':'zh');break;
 }
 case 'photo_success_export':case 'photo_failure_retry':{
  await p.locator('.evidence-section summary').click();await by(p,'photo-file').setInputFiles({name:c.id+'.png',mimeType:'image/png',buffer:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAADCAIAAAA2iEnWAAAAEUlEQVR4nGP8zwACTGASRgEAFEABBVDVLjgAAAAASUVORK5CYII=','base64')});
  if(v==='photo_failure_retry'){let intercepted=false;await p.route('**/api/records/*/photos',async route=>{if(!intercepted&&route.request().method()==='POST'){intercepted=true;await route.abort('failed');}else await route.continue();});active.injectedFailures=['First photo POST network abort; real retry uses server.'];await by(p,'upload-photo').click();await p.waitForFunction(()=>document.querySelector('#form-error')?.textContent.trim());ok((await by(p,'form-error').textContent()).match(/upload|上传/i),'failed upload reports retained retry state');await p.unroute('**/api/records/*/photos');}
  const response=p.waitForResponse(x=>x.url().endsWith('/photos')&&x.request().method()==='POST');await by(p,'upload-photo').click();eq((await response).status(),201,'actual photo upload succeeds');await p.locator('#photos img').waitFor();const persisted=(await request(actor,'GET','/api/records/'+r.id,undefined,200)).json.record;eq(persisted.photos.length,1,'one real attachment persisted without duplicate');await exportUI(actor,c,'en');coverage.add('photos upload/retry');break;
 }
 default:throw new Error('Unimplemented browser variant '+v);
 }
 active.finalStatus=(await request(actor,'GET','/api/records/'+r.id,undefined,200)).json.record.status;
}

try{
 browser=await chromium.launch({headless:true,executablePath:arg('--browser','C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe')});
 for(const name of ['alex','blair','admin'])await login(name);
 const adminCatalog=(await request(actors.admin,'GET','/api/catalog?includeInactive=1',undefined,200)).json;models=adminCatalog.models.filter(m=>m.catalogKey);boms=[];
 for(const m of models){let page=1,total=0;do{const response=(await request(actors.admin,'GET',`/api/models/${m.id}/bom?includeInactive=1&pageSize=100&page=${page++}`,undefined,200)).json;boms.push(...response.items);total=response.total;}while(boms.filter(x=>x.modelId===m.id).length<total);}
 for(const c of cases){
  const began=Date.now();active={id:c.id,category:c.category,variant:c.variant,account:c.account,language:c.language,requestedCatalogKey:c.catalogKey,status:'running',assertions:[],network:[],console:[],screenshots:[],expected:c.expected};results.push(active);
  try{const actor=actors[c.account];const r=await baseline(c,actor);await runVariant(c,actor,r);if(['C001','C002','C041','C056','C082','C093','C095','C100'].includes(c.id))await screenshot(actor.page,c.id+'-'+c.variant);
   const pageErrors=active.console.filter(x=>x.type==='pageerror');eq(pageErrors,[],'no uncaught browser page errors');const unexpectedConsole=active.console.filter(x=>x.type==='error'&&!/Failed to load resource.*(?:4\d\d|ERR_FAILED)/.test(x.message));eq(unexpectedConsole,[],'no unexpected browser console errors');
   active.status='passed';
  }catch(error){active.status='failed';active.error=error.stack;const actor=actors[c.account];active.uiErrors=await actor.page.locator('#form-error,#page-error,#bom-error').allTextContents().catch(()=>[]);await screenshot(actor.page,c.id+'-FAILED').catch(()=>{});}
  active.elapsedMs=Date.now()-began;console.log(`${c.id} ${active.status} ${active.elapsedMs}ms ${c.variant}${active.error?' '+active.error.split('\n')[0]:''}`);active=null;
 }
 // Actual logout/relogin exercises account session controls without invalidating cases.
 await by(actors.admin.page,'logout').click();await by(actors.admin.page,'username').waitFor();coverage.add('logout');
}catch(error){globalErrors.push({type:'runner',message:error.stack});console.error(error);}finally{
 const summary={schemaVersion:1,startedAt,finishedAt:new Date().toISOString(),baseUrl,prefix,dataDir:dataDir??'external isolated app supplied by --base-url',fixture,execution:'Serial independent UI baselines; real browser business requests plus explicitly logged page.request negative probes',counts:{planned:cases.length,executed:results.length,passed:results.filter(x=>x.status==='passed').length,failed:results.filter(x=>x.status==='failed').length,independentBaselineRecords:recordIds.size,additionalBoundaryRecords:results.reduce((n,r)=>n+(r.additionalRecordIds?.length??0),0)},coverage:[...coverage],setupNetwork,globalErrors,results,priorRuns};
 await writeFile(path.join(output,'BROWSER_RESULTS.json'),JSON.stringify(summary,null,2)+'\n');
 await writeFile(path.join(output,'BROWSER_LOG.md'),`# ${cases.length}-case browser simulation\n\nStarted: ${startedAt}\nFinished: ${summary.finishedAt}\nIsolated data: ${dataDir??baseUrl}\nPrefix: ${prefix}\n\n${summary.counts.passed}/${cases.length} passed; ${summary.counts.failed} failed; ${recordIds.size} independent UI-created baseline records. Cases run serially. Both 1366×768 and 1536×864 viewports are used. All baseline business APIs are real; only C100 explicitly injects one photo network failure before an actual successful retry. C082 uses a labelled special-character fault fixture in an isolated catalog copy; the base source catalog is unchanged.\n\n|Case|Variant|Record|Result|ms|Assertions|\n|---|---|---:|---|---:|---:|\n${results.map(r=>`|${r.id}|${r.variant}|${r.recordId??''}|${r.status}|${r.elapsedMs}|${r.assertions.length}|`).join('\n')}\n\nMenu/branch coverage: ${[...coverage].join(', ')}.\n\nMachine-readable per-case requests/status codes, console diagnostics, assertions and screenshots are in BROWSER_RESULTS.json. Rejected direct API probes follow a separate legal UI baseline for each case; they do not replace browser creation.\n`);
 const failed=results.filter(r=>r.status==='failed');await writeFile(path.join(output,'DEFECTS_BROWSER.md'),`# Browser simulation defects\n\n${failed.length?'Failures require triage; a runner assertion failure is not automatically a production defect.':'No browser simulation failures in this run.'}\n\n${failed.map(r=>`## ${r.id} ${r.variant}\n\nRecord ${r.recordId??'not created'}; ${r.elapsedMs} ms.\n\n\`\`\`\n${r.error}\n\`\`\`\n\nUI errors: ${JSON.stringify(r.uiErrors)}\n`).join('\n')}${globalErrors.length?'\nRunner errors: '+JSON.stringify(globalErrors,null,2):''}\n\n## Prior runs retained\n\n${priorRuns.map(run=>`- ${run.prefix}: ${run.counts.passed}/${run.counts.planned}. ${run.results.filter(r=>r.status==='failed').map(r=>r.id+': '+r.error?.split('\n')[0]).join('; ')}. Full original per-case evidence remains in BROWSER_RESULTS.json priorRuns.`).join('\n')}\n`);
 await browser?.close();await app?.close();if(failed.length||globalErrors.length||results.length!==cases.length)process.exitCode=1;console.log(JSON.stringify(summary.counts));
}
