import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdir,mkdtemp,readFile} from 'node:fs/promises';
import path from 'node:path';
import {validateRecord,validateBom} from '../src/domain.js';
import {openStore} from '../src/store.js';
import {startServer} from '../server.js';
const model={id:1,active:true,nameEn:'Jackery Model',nameZh:'型号',checkItems:[{code:'power',labelEn:'Power',labelZh:'开机'}]};
const part={id:1,modelId:1,sku:'SCREW-17',descriptionEn:'Screw',descriptionZh:'螺丝',unit:'pcs',active:true,standardQty:17,quantityControl:'standard_hard_cap'};
const fault={code:'F0',titleZh:'BMS通讯故障',descriptionZh:'原始说明',solutionZh:'',source:{file:'故障代码.pptx',slide:1}};
const catalog={models:[model],appearanceOptions:[],bom:[part],knowledge:[{id:1,faultCodes:[fault],repairGuides:[]}]};
const r={modelId:1,modelSnapshot:model,sn:'JACKERY-SN',workDate:'2026-10-30',checks:{initial:{power:'fail'}},appearanceCodes:[],appearanceSnapshot:[],materials:[],status:'draft',outcome:null};
test('Jackery standard usage is a hard cap on every save and completion, with no admin input bypass',()=>{
 for(const action of ['save','complete'])for(const quantity of [18,17.001])assert.throws(()=>validateRecord({action,outcome:'rok',materials:[{bomId:1,quantity}],override:true,role:'admin'},r,catalog),/standard usage limit/i);
 const saved=validateRecord({materials:[{bomId:1,quantity:17}],action:'complete',outcome:'rok'},r,catalog);assert.equal(saved.materials[0].standardQty,17);assert.equal(saved.materials[0].quantityControl,'standard_hard_cap');assert.equal(saved.status,'completed');
 assert.throws(()=>validateRecord({materials:[{bomId:1,quantity:0.5}]},r,catalog),/whole|integer/i);
});
test('Jackery cap uses saved per-version standard and WFR edits do not accumulate saves',()=>{
 const first=validateRecord({outcome:'awp',materials:[{bomId:1,quantity:3}]},r,catalog);
 const second=validateRecord({outcome:'awp',materials:[{bomId:1,quantity:5}]},first,catalog);assert.equal(second.materials[0].quantity,5);assert.equal(second.materials[0].standardQty,17);
 assert.throws(()=>validateRecord({materials:[{bomId:1,quantity:18}]},second,{...catalog,bom:[]}),/standard usage limit/i);
});
test('Jackery standardQty input is validated and retained in admin BOM definitions',()=>{
 assert.equal(validateBom({...part,standardQty:17},1,[model]).standardQty,17);
 for(const standardQty of [0,-1,'17',NaN])assert.throws(()=>validateBom({...part,standardQty},1,[model]),/standard|quantity/i);
});
test('Jackery optional fault selections are scoped, deduplicated and server-snapshotted',()=>{
 const saved=validateRecord({faultCodes:['F0'],faultSnapshot:[{code:'F0',titleZh:'Forged'}]},r,catalog);assert.deepEqual(saved.faultCodes,['F0']);assert.equal(saved.faultSnapshot[0].titleZh,fault.titleZh);
 assert.deepEqual(validateRecord({},r,catalog).faultCodes,[]);
 for(const faultCodes of [['F0','F0'],['OTHER-MODEL-CODE'],'F0'])assert.throws(()=>validateRecord({faultCodes},r,catalog),/fault/i);
 const next=validateRecord({issueNotes:'Retain selected code'},saved,{...catalog,knowledge:[]});assert.deepEqual(next.faultSnapshot,saved.faultSnapshot);
});
test('Jackery knowledge endpoint returns only the selected model and fault choices persist on a real API',{timeout:60000},async t=>{
 await mkdir('tests/.tmp',{recursive:true});const dir=await mkdtemp(path.resolve('tests/.tmp/jackery-api-'));const store=openStore(dir,true);store.db.exec('CREATE TABLE IF NOT EXISTS model_knowledge(id INTEGER PRIMARY KEY REFERENCES models(id),data TEXT NOT NULL)');store.put('model_knowledge',{id:1,faultCodes:[fault],repairGuides:[{id:'g1',titleZh:'原始故障排查',stepsZh:'原文步骤'}],notices:[]});store.put('bom',{...part,id:900});store.db.close();
 const app=await startServer({dataDir:dir,demo:true});t.after(()=>app.close());const login=await fetch(app.baseUrl+'/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:'alex',password:'JackeryAlex!2026'})});const session=await login.json(),headers={Cookie:login.headers.get('set-cookie').split(';')[0],'X-CSRF-Token':session.csrfToken,'Content-Type':'application/json'};
 const knowledge=await fetch(app.baseUrl+'/api/models/1/knowledge',{headers});assert.equal(knowledge.status,200);assert.equal((await knowledge.json()).faultCodes[0].code,'F0');
 const other=await fetch(app.baseUrl+'/api/models/2/knowledge',{headers});assert.deepEqual((await other.json()).faultCodes,[]);
 const create=await fetch(app.baseUrl+'/api/records',{method:'POST',headers,body:JSON.stringify({sn:'JACKERY-API',modelId:1})});let record=(await create.json()).record;
 const fail=await fetch(app.baseUrl+'/api/records/'+record.id,{method:'PUT',headers,body:JSON.stringify({version:record.version,materials:[{bomId:900,quantity:18}]})});assert.equal(fail.status,422);
 const saved=await fetch(app.baseUrl+'/api/records/'+record.id,{method:'PUT',headers,body:JSON.stringify({version:record.version,faultCodes:['F0'],materials:[{bomId:900,quantity:17}]})});assert.equal(saved.status,200);record=(await saved.json()).record;assert.equal(record.faultCodes[0],'F0');assert.equal(record.materials[0].standardQty,17);
 const adminLogin=await fetch(app.baseUrl+'/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:'admin',password:'JackeryAdmin!2026'})}),adminSession=await adminLogin.json(),adminHeaders={'Content-Type':'application/json',Cookie:adminLogin.headers.get('set-cookie').split(';')[0],'X-CSRF-Token':adminSession.csrfToken};
 const corrected=await fetch(app.baseUrl+'/api/records/'+record.id+'/corrections',{method:'POST',headers:adminHeaders,body:JSON.stringify({version:record.version,reason:'Confirmed usage review',changes:{materials:[{bomId:900,quantity:18}],override:true}})});assert.equal(corrected.status,422);assert.equal((await corrected.json()).error.code,'BOM_QUANTITY_LIMIT');
 const unchanged=await fetch(app.baseUrl+'/api/records/'+record.id,{headers});const current=(await unchanged.json()).record;assert.equal(current.version,record.version);assert.equal(current.materials[0].quantity,17);
});
