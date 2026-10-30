import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdir,mkdtemp,readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {loadSourceTranslations,translateSourceFields,translateModel,translateKnowledge} from '../src/source-translations.js';
import {startServer} from '../server.js';
const entries=[{textZh:'BMS通讯故障',textEn:'BMS Communication Fault'},{textZh:'BMS与主板之间通讯故障',textEn:'Communication fault between the BMS and the mainboard'},{textZh:'DC输入',textEn:'DC Input'}];
async function fixture(){await mkdir('tests/.tmp',{recursive:true});const dir=await mkdtemp(path.resolve('tests/.tmp/source-translations-')),file=path.join(dir,'guidance.json');await writeFile(file,JSON.stringify({schemaVersion:1,entries}));return {dir,file};}
test('Source translations preserve original strings, existing English, blank fields, identity and provenance',async()=>{
 const {file}=await fixture(),map=await loadSourceTranslations(file),raw={code:'F0',titleEn:'',titleZh:entries[0].textZh,descriptionZh:entries[1].textZh,solutionZh:'',solutionEn:'',source:{file:'故障代码.pptx',slide:1,row:2}};
 const before=structuredClone(raw),translated=translateSourceFields(raw,map);assert.equal(translated.titleEn,entries[0].textEn);assert.equal(translated.descriptionEn,entries[1].textEn);assert.equal(translated.solutionEn,'');assert.deepEqual(raw,before);assert.deepEqual(translated.source,raw.source);assert.equal(translateSourceFields({...raw,titleEn:'Reviewed original English'},map).titleEn,'Reviewed original English');assert.equal(translateSourceFields({titleZh:'constructor',titleEn:''},map).titleEn,'');assert.equal(translateSourceFields({titleZh:'__proto__',titleEn:''},map).titleEn,'');
 const m=translateModel({id:1,checkItems:[{code:'dc',labelZh:'DC输入',labelEn:'',source:{row:3}}]},map);assert.equal(m.checkItems[0].labelEn,'DC Input');assert.deepEqual(m.checkItems[0].source,{row:3});assert.equal(translateKnowledge({faultCodes:[raw],repairGuides:[],notices:['原始字符串']},map).notices[0],'原始字符串');
});
test('Source dictionary rejects duplicate/invalid entries and never invents a missing source',async()=>{
 const {file}=await fixture();assert.deepEqual(await loadSourceTranslations(),{});await writeFile(file,JSON.stringify({schemaVersion:1,entries:[...entries,entries[0]]}));await assert.rejects(loadSourceTranslations(file),/duplicate/i);assert.equal(translateSourceFields({solutionZh:'',solutionEn:''},{'':'Invented'}).solutionEn,'');
});
test('Bundled source dictionary translates all real guide/check/notice fields while blank solutions stay blank',async()=>{
 const map=await loadSourceTranslations('catalogs/jackery-guidance-translations.json'),data=JSON.parse(await readFile('catalogs/jackery-eu-20261030.json','utf8'));let filled=0,blank=0;
 for(const model of data.models){const m=translateModel(model,map),k=translateKnowledge(model.knowledge,map);for(const x of [...m.checkItems,...k.faultCodes,...k.repairGuides,...k.notices])for(const [key,value] of Object.entries(x))if(key.endsWith('Zh')&&typeof value==='string'){const en=x[key.slice(0,-2)+'En'];if(value.trim()){assert.ok(en?.trim(),key+' '+value);assert.equal(/[\u3400-\u9fff]/u.test(en),false);filled++;}else{assert.ok(!en?.trim());if(key==='solutionZh')blank++;}}}
 assert.equal(filled,371);assert.equal(blank,90);
});
test('Real API provides translated catalog and guidance, new snapshots bilingual and old snapshots remain immutable',{timeout:60000},async t=>{
 const {dir,file}=await fixture(),app=await startServer({dataDir:dir,demo:true,catalogPath:path.resolve('catalogs/jackery-eu-20261030.json'),sourceTranslationsPath:file});t.after(()=>app.close());
 const res=await fetch(app.baseUrl+'/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:'alex',password:'JackeryAlex!2026'})}),session=await res.json(),headers={Cookie:res.headers.get('set-cookie').split(';')[0],'X-CSRF-Token':session.csrfToken,'Content-Type':'application/json'};
 const cat=await(await fetch(app.baseUrl+'/api/catalog',{headers})).json();assert.equal(cat.sourceTranslations['DC输入'],'DC Input');const model=cat.models.find(x=>x.catalogKey==='e1000v2-costdown');assert.equal(model.checkItems[0].labelEn,'DC Input');
 const knowledge=await(await fetch(app.baseUrl+'/api/models/'+model.id+'/knowledge',{headers})).json();assert.equal(knowledge.faultCodes[0].titleEn,entries[0].textEn);assert.equal(knowledge.faultCodes[0].titleZh,entries[0].textZh);assert.equal(knowledge.faultCodes[0].solutionEn,'');
 const created=await fetch(app.baseUrl+'/api/records',{method:'POST',headers,body:JSON.stringify({sn:'BILINGUAL-SOURCE',modelId:model.id})});let r=(await created.json()).record;assert.equal(r.modelSnapshot.checkItems[0].labelEn,'DC Input');
 const saved=await fetch(app.baseUrl+'/api/records/'+r.id,{method:'PUT',headers,body:JSON.stringify({version:r.version,faultCodes:['F0'],outcome:'awp'})});assert.equal(saved.status,200);r=(await saved.json()).record;assert.equal(r.faultSnapshot[0].titleEn,entries[0].textEn);assert.equal(r.faultSnapshot[0].titleZh,entries[0].textZh);assert.equal(Object.hasOwn(r.checks,'final'),false);
 const old=await(await fetch(app.baseUrl+'/api/records/2',{headers})).json();assert.equal(old.record.modelSnapshot.checkItems[0].labelEn,'AC Output');
});
