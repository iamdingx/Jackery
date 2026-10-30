import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {inflateRawSync} from 'node:zlib';
import {DatabaseSync} from 'node:sqlite';
import {validateRecord} from '../src/domain.js';
import {openStore} from '../src/store.js';
import {exportRecords} from '../src/export.js';
import {startServer} from '../server.js';

const model={id:1,nameEn:'Model',nameZh:'型号',active:true,checkItems:[{code:'ac',labelEn:'AC',labelZh:'交流'}]};
const catalog={models:[model],appearanceOptions:[],bom:[]};
const previous={id:1,sn:'SN',workOrder:'HB-1',modelId:1,modelSnapshot:model,checks:{initial:{ac:'fail'},final:{ac:'not_tested'}},workDate:'2026-10-30',appearanceCodes:[],appearanceSnapshot:[],materials:[],photos:[],status:'draft'};
const refs={receivingSku:'原-SKU(1-like new)',postSortSku:'Post-Sort !',receivingOrderNo:'R-123',receivingStatus:'待入库',productNameVerification:'客户原值',skuVerification:'未确认',parentRecord:'parent-17',unspecifiedTextField:'文本 9 原值'};
const rokError='Complete all inspection items. Refurbishment requires all results to pass.';

test('v0.3 ROK requires assessed inspection and preserves failing evidence and legacy archive',()=>{
  assert.throws(()=>validateRecord({outcome:'rok',action:'complete',checks:{initial:{ac:'not_tested'},final:{ac:'pass'}}},previous,catalog),{message:rokError});
  const complete=validateRecord({outcome:'rok',action:'complete',checks:{initial:{ac:'fail'},final:{ac:'pass'}}},previous,catalog);
  assert.equal(complete.status,'completed');assert.deepEqual(complete.checks,{initial:{ac:'fail'},final:{ac:'not_tested'}});
  assert.throws(()=>validateRecord({action:'complete',checks:{initial:{ac:'not_tested'}}},{...complete},catalog),{message:rokError});
  assert.throws(()=>validateRecord({outcome:'scrap',action:'complete'},previous,catalog),{message:'Enter a scrap reason before completing this record.'});
});

test('v0.3 edits preserve legacy archive, new inspections have no final, refurb requires pass',()=>{
  const withFinal={...previous,checks:{initial:{ac:'fail'},final:{ac:'pass'}}};
  assert.deepEqual(validateRecord({checks:{initial:{ac:'pass'}}},withFinal,catalog).checks.final,{ac:'pass'});
  assert.deepEqual(validateRecord({checks:{final:{ac:'pass'}}},previous,catalog).checks,previous.checks);
  assert.equal(Object.hasOwn(validateRecord({}, {...previous,checks:{initial:{ac:'pass'}}},catalog).checks,'final'),false);
  assert.equal(validateRecord({outcome:'good',action:'complete',checks:{initial:{ac:'pass'},final:{ac:'fail'}}},previous,catalog).status,'completed');
  assert.equal(validateRecord({outcome:'awp',checks:{initial:{ac:'fail'},final:{ac:'not_tested'}}},previous,catalog).status,'wfr');
  assert.deepEqual(validateRecord({checks:{final:{unknown:'pass'}}},previous,catalog).checks,previous.checks);
  assert.throws(()=>validateRecord({checks:{initial:{unknown:'pass'}}},previous,catalog),/check/i);
});

test('v0.3 optional reference and translation strings survive independently without rewriting',()=>{
  const input={...refs,sourcePallet:'SOURCE',storagePallet:'STORE',appearanceNotes:'壳体划伤',issueNotes:'无法充电',translatedAppearanceNotes:'Scratched casing',translatedIssueNotes:'Cannot charge'};
  const saved=validateRecord(input,previous,catalog);
  for(const [key,value] of Object.entries(input))assert.equal(saved[key],value,key);
  assert.equal(validateRecord({},saved,catalog).translatedIssueNotes,'Cannot charge');
  for(const [original,translation] of [['appearanceNotes','translatedAppearanceNotes'],['issueNotes','translatedIssueNotes']]){
    assert.throws(()=>validateRecord({[original]:' ',[translation]:'empty content, no output'},previous,catalog),/original|source|empty/i);
    assert.throws(()=>validateRecord({[original]:'x',[translation]:'x'.repeat(10001)},previous,catalog),/long|invalid/i);
  }
  for(const key of Object.keys(refs)){
    assert.throws(()=>validateRecord({[key]:12},previous,catalog),/text/i);
    assert.throws(()=>validateRecord({[key]:'x'.repeat(2001)},previous,catalog),/long|invalid/i);
  }
});

function unzip(bytes){const result=new Map();for(let offset=0;bytes.readUInt32LE(offset)===0x04034b50;){const size=bytes.readUInt32LE(offset+18),len=bytes.readUInt16LE(offset+26),start=offset+30+len+bytes.readUInt16LE(offset+28);result.set(bytes.toString('utf8',offset+30,offset+30+len),inflateRawSync(bytes.subarray(start,start+size)).toString());offset=start+size;}return result;}
const sheet=(zip,n)=>zip.get(`xl/worksheets/sheet${n}.xml`);
function exportedRows(xml){const rows=[...xml.matchAll(/<row\b[^>]*>(.*?)<\/row>/g)].map(row=>[...row[1].matchAll(/<c\b[^>]*>.*?<(?:t\b[^>]*|v)>(.*?)<\/(?:t|v)>.*?<\/c>/g)].map(cell=>cell[1]));return rows.slice(1).map(row=>Object.fromEntries(rows[0].map((header,i)=>[header,row[i]])));}

test('v0.3 export uses Part SKU and readable states alongside exact stored codes',()=>{
  const records=['draft','wfr','completed'].map((status,i)=>({...previous,id:i+1,workOrder:`HB-${i+1}`,status,outcome:i===1?'awp':'rok',materials:[{bomId:1,sku:'原-Part-SKU',descriptionEn:'Provided Part',descriptionZh:'原物料',unit:'pc',quantity:2}],checks:{initial:{ac:i===0?'not_tested':'fail'},final:{ac:'pass'}}}));
  const en=unzip(exportRecords(records,'','en')),zh=unzip(exportRecords(records,'','zh'));
  assert.match(sheet(en,3),/>Part SKU</);assert.match(sheet(en,1),/>Product SKU</);
  const summary=exportedRows(sheet(en,1)),checks=exportedRows(sheet(en,2)),materials=exportedRows(sheet(en,3));
  assert.deepEqual(summary.map(row=>[row.Status,row['Status Code']]),[['In Progress','draft'],['In Progress','wfr'],['Completed','completed']]);
  assert.equal(checks.length,3);
  assert.deepEqual(checks.slice(0,2).map(row=>[row.Stage,row['Stage Code'],row.Result,row['Result Code']]),[['Inspection Result','inspection','Not Tested','not_tested'],['Inspection Result','inspection','Fail','fail']]);
  assert.equal(checks[2].Result,'Fail');assert.equal(checks[2]['Result Code'],'fail');assert.equal(materials[0]['Part SKU'],'原-Part-SKU');
  const zhSummary=exportedRows(sheet(zh,1)),zhChecks=exportedRows(sheet(zh,2));
  assert.deepEqual(zhSummary.map(row=>[row['完成状态'],row['完成状态代码']]),[['未完成','draft'],['未完成','wfr'],['已完成','completed']]);
  assert.deepEqual(zhChecks.slice(0,2).map(row=>[row['检查阶段'],row['检查阶段代码'],row['检查结果'],row['检查结果代码']]),[['检验结果','inspection','未检查','not_tested'],['检验结果','inspection','异常','fail']]);
  assert.equal(zhChecks[2]['检查结果'],'异常');
});

test('v0.3 exports one inspection for all outcomes, legacy archive, references and language-specific headers',()=>{
  const records=['rok','awp','good'].map((outcome,i)=>({...previous,...refs,id:i+1,outcome,workOrder:`HB-${i+1}`,appearanceNotes:'壳体划伤',translatedAppearanceNotes:'Scratched casing',issueNotes:'无法充电',translatedIssueNotes:'Cannot charge',checks:{initial:{ac:'fail'},final:{ac:'pass'}}}));
  const en=unzip(exportRecords(records,'','en')),zh=unzip(exportRecords(records,'','zh'));
  assert.equal((sheet(en,2).match(/<row /g)||[]).length,4);
  assert.doesNotMatch(sheet(en,2),/>initial</);assert.doesNotMatch(sheet(en,2),/>final</);assert.match(sheet(en,2),/>inspection</);
  assert.match(sheet(en,1),/>Legacy Post-work Checks JSON</);assert.match(sheet(zh,1),/>旧版复测存档 JSON</);
  for(const row of exportedRows(sheet(en,1)))assert.equal(row['Legacy Post-work Checks JSON'],'{&quot;ac&quot;:&quot;pass&quot;}');
  assert.match(sheet(en,1),/>Receiving SKU</);assert.match(sheet(en,1),/>Translated Issue Notes</);
  assert.match(sheet(zh,1),/>作业单号</);assert.match(sheet(zh,1),/>问题描述-翻译</);
  assert.match(sheet(zh,2),/>检查阶段</);assert.match(sheet(zh,3),/>实际耗用数量</);assert.match(sheet(zh,4),/>原始文件名</);
  for(const value of [...Object.values(refs),'Scratched casing','Cannot charge'])assert.ok(sheet(en,1).includes(value),value);
  assert.match(zh.get('xl/workbook.xml'),/Work Summary.*Functional Checks.*Material Usage.*Photo Index/);
});

async function harness(t){const dir=await mkdtemp(path.join(tmpdir(),'hb-v03-'));let app=await startServer({dataDir:dir,demo:true});t.after(async()=>{await app.close();await rm(dir,{recursive:true,force:true});});function client(){let cookie='',csrf='';return {async req(route,method='GET',body,headers={}){const response=await fetch(app.baseUrl+route,{method,headers:{Cookie:cookie,'X-CSRF-Token':csrf,...(body?{'Content-Type':'application/json'}:{}),...headers},body:body?JSON.stringify(body):undefined});if(response.headers.get('set-cookie'))cookie=response.headers.get('set-cookie').split(';')[0];const bytes=Buffer.from(await response.arrayBuffer());let data;try{data=JSON.parse(bytes);}catch{}if(data?.csrfToken)csrf=data.csrfToken;return {status:response.status,data,bytes};},login(username='alex',password='JackeryAlex!2026'){return this.req('/api/login','POST',{username,password});}};}return {dir,client,restart:async()=>{await app.close();app=await startServer({dataDir:dir,demo:true});}};}

test('v0.3 account language is authenticated, CSRF checked, persistent per-account across sessions/restarts',async t=>{
  const h=await harness(t),a=h.client(),b=h.client(),other=h.client(),anon=h.client();
  assert.equal((await anon.req('/api/account/language','PUT',{language:'zh'})).status,401);
  assert.equal((await a.login()).data.user.language,'en');await b.login();await other.login('blair','JackeryBlair!2026');
  assert.equal((await a.req('/api/account/language','PUT',{language:'zh'},{'X-CSRF-Token':'wrong'})).status,403);
  assert.equal((await a.req('/api/account/language','PUT',{language:'fr'})).status,422);
  const changed=await a.req('/api/account/language','PUT',{language:'zh'});assert.equal(changed.status,200);assert.equal(changed.data.user.language,'zh');
  assert.equal((await b.req('/api/session')).data.user.language,'zh');assert.equal((await other.req('/api/session')).data.user.language,'en');
  await h.restart();assert.equal((await a.login()).data.user.language,'zh');
  const admin=h.client();await admin.login('admin','JackeryAdmin!2026');
  assert.equal((await admin.req('/api/admin/users','POST',{username:'new-account',displayName:'New',role:'operator',password:'LongPassword!2026'})).data.user.language,'en');
});

test('v0.3 upgrades pre-language user schema idempotently without changing stored records',async t=>{
  const dir=await mkdtemp(path.join(tmpdir(),'hb-v03-migrate-'));t.after(()=>rm(dir,{recursive:true,force:true}));
  const db=new DatabaseSync(path.join(dir,'huabao.sqlite'));db.exec("CREATE TABLE users (id INTEGER PRIMARY KEY,username TEXT NOT NULL UNIQUE,display_name TEXT NOT NULL,role TEXT NOT NULL,active INTEGER NOT NULL DEFAULT 1,password_hash TEXT NOT NULL); CREATE TABLE meta(key TEXT PRIMARY KEY,value TEXT NOT NULL); INSERT INTO meta VALUES('mode','demo'); INSERT INTO users VALUES(1,'legacy','Legacy','operator',1,'legacyhash');");db.close();
  let store=openStore(dir,true);assert.ok(store.db.prepare('PRAGMA table_info(users)').all().some(c=>c.name==='language'));assert.equal(store.db.prepare('SELECT language FROM users WHERE id=1').get().language,'en');store.db.prepare("UPDATE users SET language='zh' WHERE id=1").run();
  const storedRecord=JSON.stringify({...previous,issueNotes:'原始中文记录',checks:{initial:{ac:'fail'},final:{ac:'pass'}}});store.db.prepare('INSERT INTO records(id,data) VALUES(?,?)').run(1,storedRecord);store.db.close();
  store=openStore(dir,true);assert.equal(store.db.prepare('SELECT language FROM users WHERE id=1').get().language,'zh');assert.equal(store.db.prepare('SELECT data FROM records WHERE id=1').get().data,storedRecord);store.db.close();
});

test('v0.3 API preserves references, strips client final checks, validates export language, searches legacy BOM without English',async t=>{
  const h=await harness(t),a=h.client();await a.login();
  let r=(await a.req('/api/records','POST',{modelId:1,sn:'V03',...refs})).data.record;
  assert.equal(Object.hasOwn(r.checks,'final'),false);
  for(const [key,value] of Object.entries(refs))assert.equal(r[key],value);
  const fail=await a.req(`/api/records/${r.id}`,'PUT',{version:r.version,outcome:'rok',action:'complete',checks:{initial:{ac_output:'not_tested',dc_output:'pass',charging:'pass'},final:{ac_output:'pass',dc_output:'pass',charging:'pass'}}});assert.equal(fail.status,422);assert.equal(fail.data.error.message,rokError);
  r=(await a.req(`/api/records/${r.id}`,'PUT',{version:r.version,outcome:'awp',checks:{initial:{ac_output:'fail'},final:{ac_output:'pass'}}})).data.record;
  assert.equal(r.checks.initial.ac_output,'fail');assert.equal(Object.hasOwn(r.checks,'final'),false);
  assert.equal((await a.req('/api/export?language=fr')).status,422);
  const exported=await a.req('/api/export?language=zh');assert.equal(exported.status,200);assert.match(sheet(unzip(exported.bytes),1),/>作业单号</);
  const db=new DatabaseSync(path.join(h.dir,'huabao.sqlite'));db.prepare('UPDATE bom SET data=? WHERE id=1').run(JSON.stringify({id:1,modelId:1,sku:'LEGACY-SKU',descriptionZh:'旧物料',unit:'pc',active:true}));db.close();
  const bom=await a.req('/api/models/1/bom?q='+encodeURIComponent('旧物料'));assert.equal(bom.status,200);assert.equal(bom.data.items[0].sku,'LEGACY-SKU');assert.equal(bom.data.items[0].missingEnglish,true);
});
