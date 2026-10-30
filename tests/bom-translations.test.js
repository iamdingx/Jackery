import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdir,mkdtemp,readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {loadBomTranslations,translateBom} from '../src/bom-translations.js';
import {startServer} from '../server.js';
import {validateRecord} from '../src/domain.js';
const zh='车充板-PCBA | HTE078-C-A3（欧韩英澳） RoHS REACH',en='Car Charging PCBA | HTE078-C-A3 (EU/KR/UK/AU) RoHS REACH';
async function fixture(t){await mkdir('tests/.tmp',{recursive:true});const dir=await mkdtemp(path.resolve('tests/.tmp/bom-translations-'));const file=path.join(dir,'translations.json');await writeFile(file,JSON.stringify({schemaVersion:1,version:'test-source',entries:[{descriptionZh:zh,descriptionEn:en}]}));return {dir,file};}
test('Authored BOM translation is exact-source matched, additive and never replaces Chinese or supplied English',async t=>{
 const {file}=await fixture(t),map=await loadBomTranslations(file),part={sku:'UNMODIFIED-SKU',descriptionZh:zh,descriptionEn:'',standardQty:1,active:false};
 const translated=translateBom(part,map);assert.equal(translated.descriptionEn,en);assert.equal(translated.descriptionZh,zh);assert.equal(translated.sku,part.sku);assert.equal(translated.active,false);assert.equal(part.descriptionEn,'');assert.equal(translateBom({...part,descriptionEn:'Reviewed custom English'},map).descriptionEn,'Reviewed custom English');assert.equal(translateBom({...part,descriptionZh:zh+' changed'},map).descriptionEn,'');
 assert.equal(translateBom({...part,descriptionZh:'constructor'},map).descriptionEn,'');
});
test('Invalid or contradictory translation source is rejected and absent translation file has explicit empty fallback',async t=>{
 const {file}=await fixture(t);assert.deepEqual(await loadBomTranslations(undefined),{});
 await writeFile(file,JSON.stringify({schemaVersion:1,version:'x',entries:[{descriptionZh:zh,descriptionEn:en},{descriptionZh:zh,descriptionEn:'Conflicting'}]}));await assert.rejects(loadBomTranslations(file),/duplicate|conflict/i);
});
test('Complete source catalog has 404 bilingual rows without altering source, SKU, standard quantity or activation',async()=>{
 const dataset=JSON.parse(await readFile('catalogs/jackery-eu-20261030.json','utf8')),map=await loadBomTranslations('catalogs/jackery-bom-translations.json');let rows=0;
 assert.equal(Object.keys(map).length,242);
 for(const model of dataset.models)for(const b of model.bom){const translated=translateBom(b,map);assert.ok(translated.descriptionEn?.trim());assert.equal(/[\u3400-\u9fff]/u.test(translated.descriptionEn),false);assert.deepEqual({...translated,descriptionEn:b.descriptionEn},b);rows++;}
 assert.equal(rows,404);
 assert.equal(map['车充板-PCBA | HTE078-C-A3（欧韩英澳） RoHS REACH'],'Car Charging PCBA | HTE078-C-A3 (EU/KR/UK/AU) RoHS REACH');
});
test('Translation enrichment and subsequent notes save preserve old material/fault snapshots and legacy evidence',()=>{
 const model={id:1,active:true,nameEn:'Source Model',checkItems:[{code:'power',labelEn:'Power',labelZh:'开机'}]},material={bomId:1,sku:'SOURCE-PART',descriptionEn:'',descriptionZh:zh,unit:'pcs',quantity:1,standardQty:1,quantityControl:'standard_hard_cap'};
 const previous={modelId:1,modelSnapshot:model,sn:'HISTORICAL-SOURCE',workDate:'2026-10-30',checks:{initial:{power:'fail'},final:{power:'pass'}},appearanceCodes:[],appearanceSnapshot:[],materials:[material],faultCodes:['F0'],faultSnapshot:[{code:'F0',titleZh:'旧故障原文'}],outcome:'awp',status:'wfr'};
 const before=structuredClone(previous),current=translateBom({...material,id:1,modelId:1,active:true},{[zh]:en});
 const after=validateRecord({issueNotes:'Notes only'},previous,{models:[model],bom:[current],appearanceOptions:[],knowledge:[{id:1,faultCodes:[{code:'F0',titleZh:'新字典故障'}]}]});
 assert.deepEqual(previous,before);assert.deepEqual(after.materials,previous.materials);assert.deepEqual(after.faultSnapshot,previous.faultSnapshot);assert.deepEqual(after.checks.final,previous.checks.final);assert.equal(current.descriptionEn,en);assert.equal(after.materials[0].descriptionEn,'');
});
test('BOM API and new material snapshots receive source translation without rewriting old work records',{timeout:60000},async t=>{
 const {dir,file}=await fixture(t);const app=await startServer({dataDir:dir,demo:true,translationsPath:file});t.after(()=>app.close());
 const login=await fetch(app.baseUrl+'/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:'admin',password:'JackeryAdmin!2026'})}),session=await login.json(),headers={'Content-Type':'application/json',Cookie:login.headers.get('set-cookie').split(';')[0],'X-CSRF-Token':session.csrfToken};
 const catalog=await (await fetch(app.baseUrl+'/api/catalog',{headers})).json();assert.equal(catalog.bomTranslations[zh],en);
 const created=await fetch(app.baseUrl+'/api/admin/bom',{method:'POST',headers,body:JSON.stringify({modelId:1,sku:'SOURCE-PART',descriptionEn:'',descriptionZh:zh,source:{file:'original.xlsx',row:9},standardQty:1,unit:'pcs'})});assert.equal(created.status,201);const part=(await created.json()).item;
 const found=await (await fetch(app.baseUrl+'/api/models/1/bom?q=Car%20Charging',{headers})).json();assert.equal(found.items.find(p=>p.id===part.id).descriptionEn,en);
 const newRecord=await fetch(app.baseUrl+'/api/records',{method:'POST',headers,body:JSON.stringify({sn:'TRANSLATION-NEW',modelId:1})});let r=(await newRecord.json()).record;
 const saved=await fetch(app.baseUrl+'/api/records/'+r.id,{method:'PUT',headers,body:JSON.stringify({version:r.version,materials:[{bomId:part.id,quantity:1}],outcome:'awp'})});assert.equal(saved.status,200);r=(await saved.json()).record;assert.equal(r.materials[0].descriptionEn,en);assert.equal(r.materials[0].descriptionZh,zh);
});
