// Historical filename retained; latest explicit v0.3 contract supersedes the single-inspection revision.
import test from 'node:test';
import assert from 'node:assert/strict';
import {validateRecord} from '../src/domain.js';
import {completionError,recordInput} from '../public/state.js';
import {exportRecords} from '../src/export.js';
import {inflateRawSync} from 'node:zlib';
import {mkdirSync,writeFileSync} from 'node:fs';
const model={id:1,nameEn:'Sample',nameZh:'示例',active:true,checkItems:[{code:'ac',labelEn:'AC Output',labelZh:'交流输出'}]};
const catalog={models:[model],appearanceOptions:[],bom:[]};
const record={id:1,modelId:1,modelSnapshot:model,sn:'INSPECTION-001',workDate:'2026-10-30',status:'draft',outcome:null,appearanceCodes:[],appearanceSnapshot:[],checks:{initial:{ac:'not_tested'}},materials:[]};
const error='Complete all final tests with a Pass result before selecting ROK for completion.';
test('v0.3 inspection contract: ROK requires final pass while preserving failed initial evidence',()=>{
  assert.throws(()=>validateRecord({outcome:'rok',action:'complete',checks:{initial:{ac:'fail'}}},record,catalog),{message:error});
  const saved=validateRecord({outcome:'rok',action:'complete',checks:{initial:{ac:'fail'},final:{ac:'pass'}}},record,catalog);
  assert.equal(saved.status,'completed');assert.deepEqual(saved.checks,{initial:{ac:'fail'},final:{ac:'pass'}});
});
test('v0.3 inspection contract: untested initial does not overwrite a separately passed final test',()=>{
  const saved=validateRecord({outcome:'rok',action:'complete',checks:{initial:{ac:'not_tested'},final:{ac:'pass'}}},record,catalog);
  assert.equal(saved.checks.initial.ac,'not_tested');assert.equal(saved.checks.final.ac,'pass');
});
test('v0.3 inspection contract: frontend gates repair final, refurbishment initial',()=>{
  const failed={...record,checks:{initial:{ac:'fail'},final:{ac:'pass'}}};
  assert.equal(completionError({...failed,outcome:'rok'}),null);
  assert.equal(completionError({...failed,outcome:'good'}),'initial');
  assert.equal(completionError({...record,outcome:'rok'}),'final');
});
test('v0.3 inspection contract: editor payload preserves both independent stages',()=>{
  const checks={initial:{ac:'fail'},final:{ac:'pass'}};
  assert.deepEqual(recordInput({...record,checks,materials:[]},'save').checks,checks);
});
test('v0.3 inspection contract: unfinished post-work tests may change without overwriting initial evidence',()=>{
  const old={...record,checks:{initial:{ac:'fail'},final:{ac:'pass'}}};
  const saved=validateRecord({checks:{final:{ac:'fail'}},issueNotes:'Retesting'},old,catalog);
  assert.deepEqual(saved.checks,{initial:{ac:'fail'},final:{ac:'fail'}});assert.equal(old.checks.final.ac,'pass');
});
test('v0.3 inspection contract: old completed ROK permits valid notes correction but no failed-final bypass',()=>{
  const old={...record,status:'completed',outcome:'rok',checks:{initial:{ac:'not_tested'},final:{ac:'pass'}}};
  const saved=validateRecord({action:'complete',issueNotes:'Historical correction'},old,catalog);
  assert.deepEqual(saved.checks,old.checks);
  assert.throws(()=>validateRecord({action:'complete',checks:{final:{ac:'fail'}}},old,catalog),{message:error});
});
test('v0.3 inspection contract: repair exports initial and final separately without fabricated legacy results',()=>{
  const base={...record,workOrder:'STAGE-EXPORT-001',outcome:'rok',outcomeGroup:'repair',photos:[],ownerId:1,ownerName:'Operator'};
  const old={...base,id:2,workOrder:'STAGE-EXPORT-002',checks:{initial:{ac:'fail'},final:{ac:'pass'}}};
  const workbook=exportRecords([base,old]),files=new Map();let offset=0;
  while(workbook.readUInt32LE(offset)===0x04034b50){const size=workbook.readUInt32LE(offset+18),length=workbook.readUInt16LE(offset+26),start=offset+30+length+workbook.readUInt16LE(offset+28);files.set(workbook.toString('utf8',offset+30,offset+30+length),inflateRawSync(workbook.subarray(start,start+size)).toString('utf8'));offset=start+size;}
  const sheet=files.get('xl/worksheets/sheet2.xml');assert.equal((sheet.match(/<row /g)||[]).length,5);
  assert.equal((sheet.match(/>initial</g)||[]).length,2);assert.equal((sheet.match(/>final</g)||[]).length,2);assert.match(sheet,/>not_tested</);assert.equal(old.checks.final.ac,'pass');
  mkdirSync('artifacts/acceptance',{recursive:true});writeFileSync('artifacts/acceptance/v03-stage-export.xlsx',workbook);
});
