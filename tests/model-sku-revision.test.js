import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,mkdtempSync,mkdirSync} from 'node:fs';
import path from 'node:path';
import {openStore} from '../src/store.js';
import {importJackeryCatalog} from '../src/catalog-import.js';
import {applyModelSkuMapping} from '../src/model-sku.js';
import {applyE2000PlusAAvailability} from '../src/model-availability.js';
const load=name=>JSON.parse(readFileSync('catalogs/'+name,'utf8'));
const source=load('jackery-eu-20261030.json'),old=load('jackery-model-sku-20261030.json'),latest=load('jackery-model-sku-20261102.json');
function fixture(t){mkdirSync('tests/.tmp',{recursive:true});const s=openStore(mkdtempSync(path.resolve('tests/.tmp/sku-revision-')),true);t.after(()=>s.db.close());importJackeryCatalog(s,source,{deactivateSamples:true});applyModelSkuMapping(s,old);applyE2000PlusAAvailability(s);return s;}

test('latest workbook SKU supersedes the filename SKU without changing active state, BOM, prior references or historical work',t=>{
 const s=fixture(t),a=s.all('models').find(m=>m.catalogKey==='e2000plus-a');s.put('records',{...s.get('records',1),id:99,modelId:a.id,modelSnapshot:structuredClone(a),productSku:a.productSku});
 const before=s.all('models'),preserved=Object.fromEntries(['records','bom','model_knowledge','audits'].map(t=>[t,JSON.stringify(s.all(t))])),oldMeta=s.db.prepare('SELECT value FROM meta WHERE key=?').get('model-sku:'+old.referenceId).value;
 const r=applyModelSkuMapping(s,latest);assert.equal(r.updatedModels,1);assert.deepEqual(r.changes,[{catalogKey:a.catalogKey,modelId:a.id,before:'21-0001-00037',after:'21-0001-000037'}]);
 for(const m of before)assert.deepEqual(s.get('models',m.id),m.id===a.id?{...m,productSku:'21-0001-000037'}:m);
 for(const [t,b] of Object.entries(preserved))assert.equal(JSON.stringify(s.all(t)),b,t);
 assert.equal(s.db.prepare('SELECT value FROM meta WHERE key=?').get('model-sku:'+old.referenceId).value,oldMeta);
 assert.equal(s.all('models').find(m=>m.catalogKey==='e1000v2-original').active,false);assert.equal(applyModelSkuMapping(s,latest).alreadyApplied,true);
});

test('E1000 association is explicitly filename-backed and A revision requires a new reference identity',()=>{
 const e=latest.models.find(m=>m.catalogKey==='e1000-default');assert.equal(e.associationBasis,'filename');assert.equal(e.sourceFile,'欧盟-E1000-70-1000-EUO001黑橙色BOM.xlsx');assert.equal(e.productSku,'70-1000-EUO001');
 const a=latest.models.find(m=>m.catalogKey==='e2000plus-a');assert.equal(a.associationBasis,'workbook_product_sku');assert.equal(a.sourceCell,'B2');assert.equal(a.productSku,'21-0001-000037');assert.notEqual(latest.referenceId,old.referenceId);
});
