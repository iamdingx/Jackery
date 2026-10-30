import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdir,mkdtemp} from 'node:fs/promises';
import path from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {inflateRawSync} from 'node:zlib';
function sheets(bytes){const out=new Map();for(let o=0;bytes.readUInt32LE(o)===0x04034b50;){const size=bytes.readUInt32LE(o+18),len=bytes.readUInt16LE(o+26),start=o+30+len+bytes.readUInt16LE(o+28);out.set(bytes.toString('utf8',o+30,o+30+len),inflateRawSync(bytes.subarray(start,start+size)).toString());o=start+size;}return out;}
import {startServer} from '../server.js';

async function fixture(t){
 await mkdir('tests/.tmp',{recursive:true});const dir=await mkdtemp(path.resolve('tests/.tmp/bluetooth-')),app=await startServer({dataDir:dir,demo:true,catalogPath:path.resolve('catalogs/jackery-eu-20261030.json')});t.after(()=>app.close());
 const l=await fetch(app.baseUrl+'/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:'admin',password:'JackeryAdmin!2026'})}),session=await l.json(),headers={'Content-Type':'application/json',Cookie:l.headers.get('set-cookie').split(';')[0],'X-CSRF-Token':session.csrfToken};
 async function req(url,method='GET',body){const r=await fetch(app.baseUrl+url,{method,headers,body:body===undefined?undefined:JSON.stringify(body)});return {status:r.status,data:r.headers.get('content-type')?.includes('application/json')?await r.json():Buffer.from(await r.arrayBuffer())};}
 return {app,dir,req};
}
test('all nine real model configurations include one Bluetooth inspection and completion enforces its result',async t=>{
 const {req}=await fixture(t),catalog=(await req('/api/catalog?includeInactive=1')).data,models=catalog.models.filter(m=>m.catalogKey);assert.equal(models.length,9);
 for(const model of models){const items=model.checkItems.filter(c=>c.code==='bluetooth');assert.equal(items.length,1,model.catalogKey);assert.equal(items[0].labelEn,'Bluetooth');assert.equal(items[0].labelZh,'蓝牙');}
 const model=models.find(m=>m.catalogKey==='e1000v2-costdown'),checks=Object.fromEntries(model.checkItems.map(c=>[c.code,'pass']));
 let r=(await req('/api/records','POST',{sn:'BLUETOOTH-GATE',modelId:model.id})).data.record;assert.equal(r.checks.initial.bluetooth,'not_tested');
 assert.equal((await req('/api/records/'+r.id,'PUT',{version:r.version,outcome:'rok',checks:{initial:{...checks,bluetooth:'not_tested'}},action:'complete'})).status,422);
 assert.equal((await req('/api/records/'+r.id,'PUT',{version:r.version,outcome:'like_new',checks:{initial:{...checks,bluetooth:'fail'}},action:'complete'})).status,422);
 const done=await req('/api/records/'+r.id,'PUT',{version:r.version,outcome:'rok',checks:{initial:{...checks,bluetooth:'fail'}},action:'complete'});assert.equal(done.status,200);assert.equal(done.data.record.checks.initial.bluetooth,'fail');assert.equal(done.data.record.status,'completed');
 r=(await req('/api/records','POST',{sn:'BLUETOOTH-REFURB',modelId:model.id})).data.record;assert.equal((await req('/api/records/'+r.id,'PUT',{version:r.version,outcome:'good',checks:{initial:checks},action:'complete'})).status,200);
});
test('unfinished old source records receive an unsaved Bluetooth check while completed history and raw data remain unchanged',async t=>{
 const {req,dir}=await fixture(t),model=(await req('/api/catalog')).data.models.find(m=>m.catalogKey==='e1000v2-costdown');
 const a=(await req('/api/records','POST',{sn:'OLD-UNFINISHED-BT',modelId:model.id})).data.record,b=(await req('/api/records','POST',{sn:'OLD-COMPLETED-BT',modelId:model.id})).data.record;
 const db=new DatabaseSync(path.join(dir,'huabao.sqlite'));t.after(()=>db.close());const records=[a,b].map((r,i)=>({...r,status:i?'completed':'wfr',outcome:i?'rok':'awp',completedAt:i?new Date().toISOString():null,modelSnapshot:{...r.modelSnapshot,checkItems:r.modelSnapshot.checkItems.filter(c=>c.code!=='bluetooth')},checks:{initial:Object.fromEntries(r.modelSnapshot.checkItems.filter(c=>c.code!=='bluetooth').map(c=>[c.code,'pass']))},appearanceNotes:'历史外观',issueNotes:'历史缺陷',translatedAppearanceNotes:'Old appearance translation',translatedIssueNotes:'Old defect translation'}));
 for(const r of records)db.prepare('UPDATE records SET data=? WHERE id=?').run(JSON.stringify(r),r.id);
 const before=db.prepare('SELECT data FROM records WHERE id=?').get(a.id).data,old=(await req('/api/records/'+a.id)).data.record,completed=(await req('/api/records/'+b.id)).data.record;
 assert.equal(old.checks.initial.bluetooth,'not_tested');assert.equal(old.version,a.version);assert.equal(old.modelSnapshot.checkItems.filter(c=>c.code==='bluetooth').length,1);assert.equal(db.prepare('SELECT data FROM records WHERE id=?').get(a.id).data,before);const workbook=(await req('/api/export?q=OLD-UNFINISHED-BT&language=en')).data;const xml=sheets(workbook);assert.match(xml.get('xl/worksheets/sheet2.xml'),/>Bluetooth</,'Unfinished export must include its current not-tested Bluetooth check');assert.equal(xml.get('xl/worksheets/sheet1.xml').includes('Bluetooth'),false,'Archived snapshot stays original');assert.equal(db.prepare('SELECT data FROM records WHERE id=?').get(a.id).data,before);assert.equal(completed.modelSnapshot.checkItems.some(c=>c.code==='bluetooth'),false);assert.equal(Object.hasOwn(completed.checks.initial,'bluetooth'),false);
 const saved=await req('/api/records/'+a.id,'PUT',{version:a.version,issueNotes:'Edited defect / 缺陷',checks:{initial:{...old.checks.initial,bluetooth:'pass'}},outcome:'awp'});assert.equal(saved.status,200);assert.equal(saved.data.record.translatedAppearanceNotes,'Old appearance translation');assert.equal(saved.data.record.translatedIssueNotes,'Old defect translation');assert.equal(saved.data.record.checks.initial.bluetooth,'pass');
 const audit=(await req('/api/records/'+a.id+'/audit')).data.items[0];assert.equal(audit.before.modelSnapshot.checkItems.some(c=>c.code==='bluetooth'),false);assert.equal(audit.after.modelSnapshot.checkItems.some(c=>c.code==='bluetooth'),true);
});
