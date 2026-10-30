import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdir,mkdtemp} from 'node:fs/promises';
import path from 'node:path';
import {openStore} from '../src/store.js';
import {importJackeryCatalog} from '../src/catalog-import.js';
const sample={schemaVersion:1,batchKey:'jackery-test-1',sources:[],excluded:[],models:[{catalogKey:'test-model',baseModelCode:'TEST',bomVersion:'A',market:'EU',productSku:'PRODUCT-001',nameEn:'Jackery Test A',nameZh:'测试A',active:true,reviewReasons:[],checkItems:[{code:'power',labelEn:'Power',labelZh:'开机'}],bom:[{sku:'PART-001',descriptionEn:'',descriptionZh:'原物料',unit:'pcs',standardQty:2,active:true,source:{file:'source.xlsx',sheet:'BOM',row:2}}],knowledge:{faultCodes:[{code:'F0',titleZh:'原故障',descriptionZh:'原文',source:{file:'source.pptx',slide:1}}],repairGuides:[{id:'g1',titleZh:'原方案',stepsZh:'原步骤',source:{file:'source.pptx',slide:2}}],notices:[]}}]};
async function fixture(t){await mkdir('tests/.tmp',{recursive:true});const store=openStore(await mkdtemp(path.resolve('tests/.tmp/jackery-import-')),true);t.after(()=>store.db.close());return store;}
test('Jackery source import is atomic, per-model, source-backed and idempotent without changing existing records',async t=>{
 const s=await fixture(t),original=s.db.prepare('SELECT id,data FROM records ORDER BY id').all();const report=importJackeryCatalog(s,sample,{deactivateSamples:true});
 assert.equal(report.models,1);assert.equal(report.materials,1);assert.equal(report.activeMaterials,1);const model=s.all('models').find(x=>x.catalogKey==='test-model');assert.ok(model);assert.equal(s.get('model_knowledge',model.id).faultCodes[0].code,'F0');
 const part=s.all('bom').find(x=>x.modelId===model.id);assert.equal(part.standardQty,2);assert.equal(part.quantityControl,'standard_hard_cap');assert.equal(part.descriptionEn,'');assert.equal(part.descriptionZh,'原物料');assert.equal(part.source.row,2);
 assert.equal(s.get('models',1).active,false);assert.deepEqual(s.db.prepare('SELECT id,data FROM records ORDER BY id').all(),original);
 const before=[s.all('models').length,s.all('bom').length],again=importJackeryCatalog(s,sample,{deactivateSamples:true});assert.equal(again.alreadyImported,true);assert.deepEqual([s.all('models').length,s.all('bom').length],before);
});
test('Jackery import rejects enabled missing quantities, duplicate SKU and changed batch payload before any partial write',async t=>{
 const s=await fixture(t),count=s.all('models').length;
 for(const kind of ['missing','duplicate']){const d=structuredClone(sample);if(kind==='missing')d.models[0].bom[0].standardQty=null;else d.models[0].bom.push(structuredClone(d.models[0].bom[0]));assert.throws(()=>importJackeryCatalog(s,d),/standard|duplicate/i);assert.equal(s.all('models').length,count);}
 importJackeryCatalog(s,sample);const changed=structuredClone(sample);changed.models[0].bom[0].standardQty=3;assert.throws(()=>importJackeryCatalog(s,changed),/batch|different|changed/i);
});
test('Jackery import preserves held source rows without inventing quantities or fault codes',async t=>{
 const s=await fixture(t),d=structuredClone(sample);d.models[0].bom[0].active=false;d.models[0].bom[0].standardQty=null;d.models[0].bom[0].reviewReasons=['Source quantity missing'];const report=importJackeryCatalog(s,d);assert.equal(report.activeMaterials,0);assert.equal(report.heldMaterials,1);const m=s.all('models').find(x=>x.catalogKey==='test-model'),p=s.all('bom').find(x=>x.modelId===m.id);assert.equal(p.standardQty,null);assert.equal(p.active,false);assert.deepEqual(s.get('model_knowledge',m.id).faultCodes.map(x=>x.code),['F0']);
});
