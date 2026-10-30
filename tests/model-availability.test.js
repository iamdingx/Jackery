import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,mkdtempSync,mkdirSync} from 'node:fs';
import path from 'node:path';
import {openStore} from '../src/store.js';
import {importJackeryCatalog} from '../src/catalog-import.js';
import {applyModelSkuMapping} from '../src/model-sku.js';
import {applyE2000PlusAAvailability} from '../src/model-availability.js';
function fixture(t){mkdirSync('tests/.tmp',{recursive:true});const s=openStore(mkdtempSync(path.resolve('tests/.tmp/plus-a-')),true);t.after(()=>s.db.close());importJackeryCatalog(s,JSON.parse(readFileSync('catalogs/jackery-eu-20261030.json','utf8')),{deactivateSamples:true});applyModelSkuMapping(s,JSON.parse(readFileSync('catalogs/jackery-model-sku-20261030.json','utf8')));return s;}
test('confirmed E2000plus A restores model selection and only parent-held production parts without changing caps or history',t=>{
 const s=fixture(t),models=s.all('models'),bom=s.all('bom'),records=JSON.stringify(s.all('records')),knowledge=JSON.stringify(s.all('model_knowledge')),a=models.find(m=>m.catalogKey==='e2000plus-a');
 const r=applyE2000PlusAAvailability(s);assert.equal(r.modelId,a.id);assert.equal(r.enabledMaterials,54);assert.equal(r.heldMaterials,3);assert.equal(s.get('models',a.id).active,true);assert.equal(s.get('models',a.id).productSku,'21-0001-00037');
 for(const m of models)assert.deepEqual(s.get('models',m.id),m.id===a.id?{...m,active:true}:m);
 for(const b of bom){const shouldEnable=b.modelId===a.id&&b.reviewReasons?.length===1&&b.reviewReasons[0]==='parent_model_requires_review';assert.deepEqual(s.get('bom',b.id),shouldEnable?{...b,active:true}:b);}
 assert.equal(JSON.stringify(s.all('records')),records);assert.equal(JSON.stringify(s.all('model_knowledge')),knowledge);
 const before=JSON.stringify([s.all('models'),s.all('bom'),s.db.prepare('SELECT * FROM meta ORDER BY key').all()]);assert.equal(applyE2000PlusAAvailability(s).alreadyApplied,true);assert.equal(JSON.stringify([s.all('models'),s.all('bom'),s.db.prepare('SELECT * FROM meta ORDER BY key').all()]),before);
});
test('missing or unexpected A BOM data is never guessed or partly activated',t=>{
 const s=fixture(t),a=s.all('models').find(m=>m.catalogKey==='e2000plus-a'),part=s.all('bom').find(b=>b.modelId===a.id);s.put('bom',{...part,standardQty:null});const before=JSON.stringify([s.all('models'),s.all('bom')]);
 assert.throws(()=>applyE2000PlusAAvailability(s),/confirmed standard quantity/);assert.equal(JSON.stringify([s.all('models'),s.all('bom')]),before);
});
