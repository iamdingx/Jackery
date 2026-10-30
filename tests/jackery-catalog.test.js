import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdir,mkdtemp,readFile} from 'node:fs/promises';
import path from 'node:path';
import {inflateRawSync} from 'node:zlib';
import {openStore} from '../src/store.js';
import {importJackeryCatalog} from '../src/catalog-import.js';
import {validateBom,validateRecord} from '../src/domain.js';
import {exportRecords} from '../src/export.js';

const dataset=JSON.parse(await readFile(new URL('../catalogs/jackery-eu-20261030.json',import.meta.url),'utf8'));
async function fixture(t){await mkdir('tests/.tmp',{recursive:true});const s=openStore(await mkdtemp(path.resolve('tests/.tmp/jackery-source-')),true);t.after(()=>s.db.close());return s;}
function unzip(bytes){const files=new Map();for(let o=0;bytes.readUInt32LE(o)===0x04034b50;){const size=bytes.readUInt32LE(o+18),len=bytes.readUInt16LE(o+26),start=o+30+len+bytes.readUInt16LE(o+28);files.set(bytes.toString('utf8',o+30,o+30+len),inflateRawSync(bytes.subarray(start,start+size)).toString());o=start+size;}return files;}

test('Actual Jackery source batch reconciles all rows and isolates versions, caps, held rows and model knowledge',async t=>{
 const s=await fixture(t),before=s.db.prepare('SELECT id,data FROM records ORDER BY id').all();
 const report=importJackeryCatalog(s,dataset,{deactivateSamples:true});
 for(const [key,value] of Object.entries({models:9,activeModels:7,materials:404,activeMaterials:261,heldMaterials:143,excludedRows:10,sourceFiles:27}))assert.equal(report[key],value,key);
 const model=key=>s.all('models').find(m=>m.catalogKey===key),part=(key,sku)=>s.all('bom').find(b=>b.modelId===model(key).id&&b.sku===sku);
 assert.equal(part('e1000v2-costdown','08-1000-100253').standardQty,17);
 assert.equal(part('e2000plus-b','08-1000-100253').standardQty,25);
 for(const key of ['e1000v2-original','e2000plus-a']){assert.equal(model(key).active,false);assert.equal(s.all('bom').filter(b=>b.modelId===model(key).id&&b.active).length,0);}
 const empty=s.all('bom').filter(b=>b.modelId===model('e1000-default').id);assert.equal(empty.length,25);assert.ok(empty.every(b=>b.standardQty===null&&!b.active));
 for(const m of s.all('models').filter(m=>m.catalogKey)){const k=s.get('model_knowledge',m.id);assert.deepEqual(k.faultCodes.map(f=>f.code),Array.from({length:10},(_,i)=>'F'+i));assert.equal(k.repairGuides.length,5);assert.ok(k.faultCodes.every(f=>f.source.sha256&&f.source.slide));}
 assert.ok(s.all('bom').filter(b=>[1,2].includes(b.modelId)).every(b=>!b.active),'Deactivate fictitious BOM alongside sample models');
 assert.deepEqual(s.db.prepare('SELECT id,data FROM records ORDER BY id').all(),before);
 assert.equal(importJackeryCatalog(s,dataset,{deactivateSamples:true}).alreadyImported,true);assert.equal(s.all('bom').length,821+404);
});

test('Imported-model manual entry cannot create uncapped active BOM; original English gaps need not be fabricated for maintenance',async t=>{
 const s=await fixture(t);importJackeryCatalog(s,dataset);const models=s.all('models'),m=models.find(m=>m.catalogKey==='e1000v2-costdown');
 assert.throws(()=>validateBom({modelId:m.id,sku:'NEW',descriptionEn:'New part',unit:'pcs'},9999,models),/standard|quantity/i);
 const p=s.all('bom').find(b=>b.modelId===m.id&&b.active);assert.equal(validateBom(p,p.id,models).descriptionEn,'');
 assert.throws(()=>validateBom({...p,standardQty:0.5},p.id,models),/whole|integer/i);
});

test('Four-sheet export retains selected source faults and standard usage cap in EN and ZH without final tests',async t=>{
 const s=await fixture(t);importJackeryCatalog(s,dataset);const model=s.all('models').find(m=>m.catalogKey==='e1000v2-costdown'),p=s.all('bom').find(b=>b.modelId===model.id&&b.active);
 const prev={id:99,workOrder:'JACKERY-TEST',sn:'CATALOG-TEST',modelId:model.id,modelSnapshot:model,checks:{initial:{}},appearanceCodes:[],appearanceSnapshot:[],materials:[],photos:[],status:'draft'};
 const r=validateRecord({faultCodes:['F0','F8'],materials:[{bomId:p.id,quantity:1}],outcome:'awp'},prev,s.catalog());
 for(const language of ['en','zh']){const zip=unzip(exportRecords([r],'',language)),summary=zip.get('xl/worksheets/sheet1.xml'),usage=zip.get('xl/worksheets/sheet3.xml'),checks=zip.get('xl/worksheets/sheet2.xml');assert.ok(summary.includes('F0; F8'));assert.ok(summary.includes(r.faultSnapshot[0].titleZh));assert.ok(usage.includes('standard_hard_cap'));assert.ok(summary.includes(language==='en'?'Fault Codes':'故障代码'));assert.ok(usage.includes(language==='en'?'BOM Standard Qty':'BOM 标准用量上限'));assert.equal((checks.match(/>inspection</g)||[]).length,8);assert.ok(checks.includes('Bluetooth'));assert.equal(checks.includes('>final<'),false);assert.equal([...zip.keys()].filter(k=>/^xl\/worksheets\/sheet\d+\.xml$/.test(k)).length,4);}
});
