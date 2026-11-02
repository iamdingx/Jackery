import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import path from 'node:path';
import {startServer} from '../server.js';
import {categoryData} from './bom-category-fixture.js';

async function fixture(t){
 const data=await categoryData(),app=await startServer({dataDir:data.dataDir,demo:true});t.after(()=>app.close());
 const response=await fetch(app.baseUrl+'/api/login',{method:'POST',headers:{'Content-Type':'application/json',Origin:app.baseUrl},body:JSON.stringify({username:'alex',password:'JackeryAlex!2026'})}),cookie=response.headers.get('set-cookie').split(';')[0];
 const get=async query=>{const r=await fetch(app.baseUrl+'/api/models/1/bom'+query,{headers:{Cookie:cookie}});return {status:r.status,body:await r.json()};};return {...data,app,get};
}
test('category GET preserves legacy defaults and returns model-wide counts without changing any BOM JSON',async t=>{
 const {get,rows,dataDir,original}=await fixture(t),{status,body}=await get('');assert.equal(status,200);assert.equal(body.total,64);assert.equal(body.items.length,50);assert.equal(body.page,1);assert.equal(body.pageSize,50);
 assert.deepEqual(body.categoryCounts,{all:64,core:56,non_core:3,packaging:3,uncategorized:2});
 const all=await get('?pageSize=100');assert.deepEqual(all.body.items.map(x=>x.sku).sort(),rows.map(x=>x.sku).sort());
 const db=new DatabaseSync(path.join(dataDir,'huabao.sqlite'));try{assert.deepEqual(db.prepare('SELECT data FROM bom ORDER BY id').all().map(x=>x.data),original);}finally{db.close();}
});
test('category filtering happens before pagination and search; counts span the full active model',async t=>{
 const {get}=await fixture(t);let {body}=await get('?category=core&page=2&pageSize=50');assert.equal(body.total,56);assert.equal(body.items.length,6);assert.ok(body.items.every(x=>x.category==='core'));
 ({body}=await get('?category=packaging&q=PACK-002'));assert.equal(body.total,1);assert.equal(body.items[0].sku,'TEST-PACK-002');assert.equal(body.categoryCounts.core,56);
 ({body}=await get('?category=non_core&q=测试'));assert.equal(body.total,3);assert.ok(body.items.every(x=>x.category==='non_core'));
 ({body}=await get('?category=core&q=TEST-PACK'));assert.equal(body.total,0);assert.equal(body.categoryCounts.packaging,3);
});
test('category filters preserve authentication, inactive and model isolation, and reject invalid categories',async t=>{
 const {get,app}=await fixture(t);assert.equal((await get('?category=made_up')).status,422);assert.equal((await get('?category=core&includeInactive=1')).status,403);
 const body=(await get('?category=core&pageSize=100')).body;assert.ok(body.items.every(x=>x.modelId===1&&x.active));assert.equal(body.items.some(x=>['TEST-HELD','TEST-OTHER-MODEL'].includes(x.sku)),false);
 assert.equal((await fetch(app.baseUrl+'/api/models/1/bom?category=core')).status,401);
});
