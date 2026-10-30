import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,mkdtempSync,mkdirSync} from 'node:fs';
import path from 'node:path';
import {openStore} from '../src/store.js';
import {importJackeryCatalog} from '../src/catalog-import.js';
import {applyModelSkuMapping} from '../src/model-sku.js';
const source=JSON.parse(readFileSync('catalogs/jackery-eu-20261030.json','utf8'));
const mapping=JSON.parse(readFileSync('catalogs/jackery-model-sku-20261030.json','utf8'));
function fixture(t){mkdirSync('tests/.tmp',{recursive:true});const store=openStore(mkdtempSync(path.resolve('tests/.tmp/model-sku-')),true);t.after(()=>store.db.close());importJackeryCatalog(store,source,{deactivateSamples:true});return store;}

test('reviewed SKU mapping updates only known model Product SKU, preserves history and leaves missing E1000plus pending',t=>{
 const store=fixture(t),before=store.all('models'),old=before.find(m=>m.catalogKey==='e1000-default');
 store.put('records',{...store.get('records',1),id:99,modelId:old.id,modelSnapshot:structuredClone(old),productSku:''});
 const preserved=Object.fromEntries(['records','bom','model_knowledge','audits','appearance'].map(k=>[k,JSON.stringify(store.all(k))]));
 const report=applyModelSkuMapping(store,mapping);
 assert.equal(report.matchedModels,9);assert.equal(report.updatedModels,2);assert.deepEqual(report.pendingModels.map(x=>x.catalogKey),['e1000plus-a','e1000plus-b']);
 assert.equal(store.all('models').length,before.length);
 for(const model of before){const next=store.get('models',model.id),entry=mapping.models.find(x=>x.catalogKey===model.catalogKey);assert.deepEqual(next,{...model,...(entry?{productSku:entry.productSku}:{})});}
 for(const [table,value] of Object.entries(preserved))assert.equal(JSON.stringify(store.all(table)),value,table+' must stay intact');
 assert.equal(store.all('models').find(m=>m.catalogKey==='e2000plus-a').productSku,'21-0001-00037');
 assert.equal(store.all('bom').filter(p=>p.modelId===store.all('models').find(m=>m.catalogKey==='e1000-default').id&&p.active).length,0);
});

test('reviewed SKU mapping is idempotent and never merges equal-SKU model versions',t=>{
 const store=fixture(t);applyModelSkuMapping(store,mapping);const before=JSON.stringify(store.all('models')),meta=JSON.stringify(store.db.prepare('SELECT * FROM meta ORDER BY key').all());
 assert.equal(applyModelSkuMapping(store,mapping).alreadyApplied,true);assert.equal(JSON.stringify(store.all('models')),before);assert.equal(JSON.stringify(store.db.prepare('SELECT * FROM meta ORDER BY key').all()),meta);
 for(const base of ['e1000v2','e2000v2']){const a=store.all('models').find(m=>m.catalogKey===base+'-original'),b=store.all('models').find(m=>m.catalogKey===base+'-costdown');assert.notEqual(a.id,b.id);assert.equal(a.productSku,b.productSku);}
 const changed=structuredClone(mapping);changed.models[0].productSku='UNREVIEWED';assert.throws(()=>applyModelSkuMapping(store,changed),/different content/);
});

test('unexpected master SKU blocks the entire correction instead of overwriting administrator data',t=>{
 const store=fixture(t),m=store.all('models').find(m=>m.catalogKey==='e2000plus-a');store.put('models',{...m,productSku:'ADMIN-CUSTOM'});const before=JSON.stringify(store.all('models'));
 assert.throws(()=>applyModelSkuMapping(store,mapping),/Unexpected Product SKU/);assert.equal(JSON.stringify(store.all('models')),before);assert.equal(store.db.prepare('SELECT value FROM meta WHERE key=?').get('model-sku:'+mapping.referenceId),undefined);
});
