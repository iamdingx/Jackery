import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {startServer} from '../server.js';
import {openStore} from '../src/store.js';
import {planClassifiedBom,applyClassifiedBom} from '../src/classified-bom.js';

test('classified migration verifies the preview, preserves work records and BOM IDs, and is idempotent',async t=>{
  const dir=await mkdtemp(path.join(tmpdir(),'jackery-classified-'));
  t.after(()=>rm(dir,{recursive:true,force:true}));
  const app=await startServer({dataDir:dir,demo:true,catalogPath:'catalogs/jackery-eu-20261030.json'});
  await app.close();
  const store=openStore(dir,true);
  try{
    const oldModels=store.all('models'),oldParts=store.all('bom'),oldRecords=store.all('records'),oldAudits=store.all('audits');
    const batch=JSON.parse(await readFile('catalogs/jackery-classified-bom-20261107.json','utf8'));
    const {report}=planClassifiedBom(store,batch);
    assert.equal(report.models.length,11);assert.equal(report.addedModels,2);
    assert.deepEqual(Object.fromEntries(['rows','core','non_core','packaging','allOnly'].map(key=>[key,report.models.reduce((sum,m)=>sum+m[key],0)])),{rows:496,core:90,non_core:197,packaging:208,allOnly:1});
    assert.throws(()=>applyClassifiedBom(store,batch,'wrong-hash'),/changed after preview/);
    assert.deepEqual(store.all('bom'),oldParts);
    assert.deepEqual(applyClassifiedBom(store,batch,report.previewHash),report);
    const models=new Map(store.all('models').filter(m=>m.catalogKey).map(m=>[m.catalogKey,m]));
    assert.equal(models.size,11);
    assert.ok([...models.values()].every(m=>m.active));
    const e1000=models.get('e1000-default');
    for(const suffix of ['a','b']){
      const model=models.get('e1000plus-'+suffix);
      assert.deepEqual(model.checkItems,e1000.checkItems);
      assert.deepEqual(store.get('model_knowledge',model.id).faultCodes,store.get('model_knowledge',e1000.id).faultCodes);
    }
    const parts=store.all('bom'),byId=new Map(parts.map(p=>[p.id,p]));
    for(const old of oldParts)assert.equal(byId.get(old.id).sku,old.sku);
    assert.ok(oldModels.every(m=>store.get('models',m.id).catalogKey===m.catalogKey));
    for(const item of parts.filter(p=>p.active&&p.modelId===e1000.id))assert.equal(item.standardQty,1);
    assert.equal(parts.filter(p=>p.active&&p.modelId===e1000.id).length,25);
    const firmware=parts.find(p=>p.sku==='36-0002-000048'&&p.allOnly);
    assert.equal(firmware.category,null);assert.equal(firmware.active,true);
    assert.deepEqual(store.all('records'),oldRecords);assert.deepEqual(store.all('audits'),oldAudits);
    assert.equal(applyClassifiedBom(store,batch,report.previewHash).alreadyApplied,true);
    assert.deepEqual(store.all('bom'),parts);
  }finally{store.db.close();}
});
