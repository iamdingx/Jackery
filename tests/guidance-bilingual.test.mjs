import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdir,mkdtemp} from 'node:fs/promises';
import path from 'node:path';
import {chromium} from 'playwright';
import {startServer} from '../server.js';

const original='输出检查 <img src=x onerror=alert(1)>';
const checkItems=[{code:'translated',labelEn:'',labelZh:original},{code:'existing',labelEn:'Existing inspection English',labelZh:'原始检查'},...Array.from({length:10},(_,i)=>({code:'long'+i,labelEn:'',labelZh:'较长检查项目 '+i}))];
const sourceTranslations={
 [original]:'Inspect the output <img src=x onerror=alert(1)>','原始检查':'Replacement must not win',
 ...Object.fromEntries(Array.from({length:10},(_,i)=>['较长检查项目 '+i,'Inspect the supply, connector and operation of the device '+i])),
 '充电异常':'Charging fault','错误说明':'Fault description','检查连接':'Inspect the connection',
 '通用表格':'Common fault table','故障码\t原因\t解决方案\nF1\t连接\t检查连接':'Code\tCause\tSolution\nF1\tConnection\tInspect connection',
 '旧版异常':'Legacy fault title','旧版说明':'Legacy fault description','公告标题':'Notice title','安全提示':'Safety notice','维修指引.xlsx':'Repair guidance.xlsx','故障表':'Fault sheet'
};
const knowledge={faultCodes:[{code:'F1',titleEn:'',titleZh:'充电异常',descriptionEn:'',descriptionZh:'错误说明',solutionEn:'',solutionZh:'',source:{file:'维修指引.xlsx',sheet:'故障表',row:7}},{code:'F2',titleEn:'Existing fault title',titleZh:'充电异常',descriptionZh:'错误说明',solutionZh:'检查连接'}],repairGuides:[{id:'g1',titleZh:'通用表格',symptomsZh:'',stepsZh:['故障码\t原因\t解决方案\nF1\t连接\t检查连接'],source:{file:'维修指引.xlsx',sheet:'故障表',row:12}}],notices:['安全提示',{titleZh:'公告标题',descriptionZh:'安全提示',source:{file:'维修指引.xlsx',slide:1,row:12}},{descriptionZh:'',descriptionEn:''}]};

async function fixture(t,{checks=checkItems,translations=sourceTranslations,knowledgeData=knowledge}={}){
 await mkdir('tests/.tmp',{recursive:true});const app=await startServer({dataDir:await mkdtemp(path.resolve('tests/.tmp/guidance-bilingual-')),demo:true});let browser;
 t.after(async()=>{await browser?.close();await app.close();});
 browser=await chromium.launch({headless:true,executablePath:'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'});
 const page=await browser.newPage({viewport:{width:1366,height:768}}),errors=[];page.setDefaultTimeout(5000);page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
 await page.route('**/api/catalog*',async route=>{const response=await route.fetch(),catalog=await response.json();catalog.sourceTranslations=translations;catalog.models[0].checkItems=checks;await route.fulfill({json:catalog});});
 await page.route('**/api/models/*/knowledge',route=>route.fulfill({json:knowledgeData}));
 await page.goto(app.baseUrl);await page.locator('#username').fill('alex');await page.locator('#password').fill('JackeryAlex!2026');await page.locator('#login-form button').click();await page.locator('#new-record').waitFor();
 return {app,page,errors};
}

async function bilingual(scope,english,chinese){
 assert.equal(await scope.locator('.guidance-en').first().textContent(),english);
 assert.equal(await scope.locator('.guidance-zh').first().textContent(),chinese);
 const boxes=await scope.locator('.guidance-en,.guidance-zh').evaluateAll(items=>items.slice(0,2).map(x=>{const b=x.getBoundingClientRect();return {top:b.top,bottom:b.bottom};}));
 assert.ok(boxes[0].bottom<=boxes[1].top+1,'English is visibly above the exact Chinese original');
}

test('source translations display new checks and guidance in both languages without replacing source text or fault selections',{timeout:60000},async t=>{
 const {page,errors}=await fixture(t);await page.locator('#new-record').click();await page.locator('#modelId').selectOption('1');
 const row=page.locator('.checks tbody tr').filter({has:page.locator('[data-check-code="translated"]')});
 await bilingual(row,sourceTranslations[original],original);assert.equal(await row.locator('[role=radiogroup]').getAttribute('aria-label'),sourceTranslations[original]+' · '+original);
 await bilingual(page.locator('.checks tbody tr').filter({has:page.locator('[data-check-code="existing"]')}),'Existing inspection English','原始检查');
 assert.equal(await page.locator('.check-language-warning').count(),0);assert.equal(await page.locator('.checks img').count(),0);assert.equal(await page.locator('[data-check-phase=final]').count(),0);
 await page.locator('[data-check-code=translated][value=pass]').check();await page.locator('#fault-codes').click();
 const fault=page.locator('.fault-option').filter({has:page.locator('[data-fault-select=F1]')});await bilingual(fault.locator('label>span'),'Charging fault','充电异常');
 await fault.locator('summary').click();assert.match(await fault.locator('summary').textContent(),/Details/);assert.equal(await fault.locator('h4').count(),0);await bilingual(fault.locator('.guidance-copy'),'Fault description','错误说明');
 const source=fault.locator('.knowledge-source');assert.match(await source.textContent(),/Repair guidance\.xlsx.*Fault sheet.*row 7/s);assert.match(await source.textContent(),/维修指引.xlsx.*故障表.*row 7/s);
 const available=page.locator('.fault-option').filter({has:page.locator('[data-fault-select=F2]')});await bilingual(available.locator('label>span'),'Existing fault title','充电异常');await available.locator('summary').click();await bilingual(available.locator('.guidance-copy').last(),'Inspect the connection','检查连接');assert.equal(await available.locator('h4').count(),1);await fault.locator('[data-fault-select]').check();await page.locator('#fault-close').click();
 for(const viewport of [{width:1366,height:768},{width:1536,height:864}]){
  await page.setViewportSize(viewport);for(const selector of ['.outcomes','.actions','#complete-record']){const box=await page.locator(selector).first().boundingBox();assert.ok(box.y+box.height<=viewport.height,JSON.stringify({selector,viewport,box}));}
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 }
 await page.locator('#language').click();await bilingual(row,sourceTranslations[original],original);assert.equal(await page.locator('[data-check-code=translated][value=pass]').isChecked(),true);assert.equal(await page.locator('[data-fault-detail=F1]').count(),1);
 await page.locator('#fault-codes').click();assert.equal(await page.locator('[data-fault-select=F1]').isChecked(),true);await page.locator('#fault-close').click();
 await page.locator('#open-guides').click();const guide=page.locator('#guides-dialog .knowledge-entry');await bilingual(guide.locator('summary'),'Common fault table','通用表格');await guide.locator('summary').click();
 await bilingual(guide.locator('.guidance-copy').last(),'Code\tCause\tSolution\nF1\tConnection\tInspect connection','故障码\t原因\t解决方案\nF1\t连接\t检查连接');
 await bilingual(page.locator('#guides-dialog p.guidance-copy').first(),'Safety notice','安全提示');await bilingual(page.locator('#guides-dialog p.guidance-copy').nth(1),'Notice title','公告标题');assert.equal(await page.locator('#guides-dialog img').count(),0);assert.match(await page.locator('#guides-dialog p.guidance-copy .knowledge-source').textContent(),/Repair guidance.xlsx.*slide 1.*row 12.*维修指引.xlsx/s);assert.equal(await page.locator('#guides-dialog .translation-warning').count(),0);assert.deepEqual(errors,[]);
});

test('legacy blank English snapshot uses exact source fallback and preserves historical original',{timeout:60000},async t=>{
 const {page,errors}=await fixture(t);
 await page.route('**/api/records/90001',async route=>route.fulfill({json:{record:{id:90001,sn:'LEGACY-GUIDANCE',modelId:1,modelSnapshot:{id:1,nameEn:'Historical model',checkItems:[{code:'historic',labelEn:'',labelZh:original}]},productSku:'OLD',workOrder:'HISTORICAL-90001',ownerId:2,status:'draft',version:1,checks:{initial:{historic:'fail'}},faultCodes:['F1'],faultSnapshot:[{code:'F1',titleZh:'旧版异常',descriptionZh:'旧版说明',solutionZh:''}],appearanceCodes:[],appearanceSnapshot:[],materials:[],photos:[],appearanceNotes:'',issueNotes:'',scrapReason:''}}}));
 await page.route('**/api/records?*',route=>route.fulfill({json:{items:[{id:90001,sn:'LEGACY-GUIDANCE',workOrder:'HISTORICAL-90001',modelSnapshot:{nameEn:'Historical model'},ownerName:'Alex',status:'draft'}],total:1}}));
 await page.locator('#filters button').click();await page.locator('[data-open-record="90001"]').click();
 await bilingual(page.locator('.checks tbody tr'),sourceTranslations[original],original);assert.equal(await page.locator('[data-check-code=historic][value=fail]').isChecked(),true);
 assert.match(await page.locator('[data-fault-detail=F1]').getAttribute('aria-label'),/Legacy fault title.*旧版异常/);await page.locator('[data-fault-detail=F1]').click();await bilingual(page.locator('#fault-detail-dialog h3'),'Legacy fault title','旧版异常');await bilingual(page.locator('#fault-detail-dialog .guidance-copy'),'Legacy fault description','旧版说明');assert.doesNotMatch(await page.locator('#fault-detail-dialog').textContent(),/Charging fault|充电异常/);assert.equal(await page.locator('#fault-detail-dialog h4').count(),0);await page.locator('#fault-detail-close').click();
 await page.locator('#language').click();await bilingual(page.locator('.checks tbody tr'),sourceTranslations[original],original);assert.equal(await page.locator('[data-check-code=historic][value=fail]').isChecked(),true);assert.deepEqual(errors,[]);
});

test('empty guidance stays empty and unknown originals use explicit fallback without inherited translations',{timeout:60000},async t=>{
 const {page,errors}=await fixture(t,{checks:[{code:'empty',labelEn:'',labelZh:''},{code:'unknown',labelEn:'',labelZh:'未提供翻译'},{code:'prototype',labelEn:'',labelZh:'constructor'}],translations:{},knowledgeData:{faultCodes:[{code:'EMPTY',titleEn:'',titleZh:'',descriptionEn:'',descriptionZh:'',solutionEn:'',solutionZh:''}],repairGuides:[{id:'EMPTY-GUIDE',titleEn:'',titleZh:'',symptomsEn:'',symptomsZh:'',stepsEn:[],stepsZh:[]}],notices:[{descriptionZh:''}]}});await page.locator('#new-record').click();await page.locator('#modelId').selectOption('1');
 const empty=page.locator('.checks tbody tr').filter({has:page.locator('[data-check-code=empty]')});assert.equal(await empty.locator('.translation-warning').count(),0);assert.equal(await empty.locator('.guidance-en').count(),0);
 for(const code of ['unknown','prototype']){const row=page.locator('.checks tbody tr').filter({has:page.locator(`[data-check-code=${code}]`)});assert.equal(await row.locator('.translation-warning').count(),1);assert.doesNotMatch(await row.textContent(),/function Object|native code/);}
 assert.equal(await page.locator('.check-language-warning').count(),1);await page.locator('#fault-codes').click();await page.locator('.fault-option summary').click();assert.equal(await page.locator('#fault-dialog .translation-warning').count(),0);assert.equal(await page.locator('#fault-dialog h4').count(),0);await page.locator('#fault-close').click();await page.locator('#open-guides').click();assert.equal(await page.locator('#guides-dialog .translation-warning').count(),0);assert.equal(await page.locator('#guides-dialog .guidance-en').count(),0);assert.deepEqual(errors,[]);
});
