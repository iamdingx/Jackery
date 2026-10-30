// One editable inspection; legacy post-work results remain immutable archive data.
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
const error='Complete all inspection items. Refurbishment requires all results to pass.';
test('v0.3 inspection contract: ROK requires assessed inspection and preserves failed evidence',()=>{
  assert.throws(()=>validateRecord({outcome:'rok',action:'complete'},record,catalog),{message:error});
  const saved=validateRecord({outcome:'rok',action:'complete',checks:{initial:{ac:'fail'},final:{ac:'pass'}}},record,catalog);
  assert.equal(saved.status,'completed');assert.deepEqual(saved.checks,{initial:{ac:'fail'}});
});
test('v0.3 inspection contract: legacy passed post-work archive cannot satisfy an untested inspection',()=>{
  const old={...record,checks:{initial:{ac:'not_tested'},final:{ac:'pass'}}};
  assert.throws(()=>validateRecord({outcome:'rok',action:'complete'},old,catalog),{message:error});
});
test('v0.3 inspection contract: frontend repair requires assessed inspection and refurbishment requires pass',()=>{
  const failed={...record,checks:{initial:{ac:'fail'},final:{ac:'pass'}}};
  assert.equal(completionError({...failed,outcome:'rok'}),null);
  assert.equal(completionError({...failed,outcome:'good'}),'inspection');
  assert.equal(completionError({...record,outcome:'rok'}),'inspection');
});
test('v0.3 inspection contract: editor payload only submits the editable inspection',()=>{
  const checks={initial:{ac:'fail'},final:{ac:'pass'}};
  assert.deepEqual(recordInput({...record,checks,materials:[]},'save').checks,{initial:checks.initial});
});
test('v0.3 inspection contract: legacy post-work archive is immutable on edits',()=>{
  const old={...record,checks:{initial:{ac:'fail'},final:{ac:'pass'}}};
  const saved=validateRecord({checks:{final:{ac:'fail'}},issueNotes:'Retesting'},old,catalog);
  assert.deepEqual(saved.checks,old.checks);assert.equal(saved.issueNotes,'Retesting');assert.equal(old.checks.final.ac,'pass');
});
test('v0.3 inspection contract: old completed ROK permits notes correction only with unchanged inspection',()=>{
  const old={...record,status:'completed',outcome:'rok',checks:{initial:{ac:'not_tested'},final:{ac:'pass'}}};
  const saved=validateRecord({action:'complete',issueNotes:'Historical correction'},old,catalog);
  assert.deepEqual(saved.checks,old.checks);
  assert.deepEqual(validateRecord({action:'complete',checks:{final:{ac:'fail'}}},old,catalog).checks,old.checks);
  assert.throws(()=>validateRecord({action:'complete',checks:{initial:{ac:'not_tested'}}},{...old,checks:{initial:{ac:'pass'},final:{ac:'pass'}}},catalog),{message:error});
});
test('v0.3 inspection contract: exports one inspection row and preserves legacy archive in summary',()=>{
  const base={...record,workOrder:'STAGE-EXPORT-001',outcome:'rok',outcomeGroup:'repair',photos:[],ownerId:1,ownerName:'Operator'};
  const old={...base,id:2,workOrder:'STAGE-EXPORT-002',checks:{initial:{ac:'fail'},final:{ac:'pass'}}};
  const workbook=exportRecords([base,old]),files=new Map();let offset=0;
  while(workbook.readUInt32LE(offset)===0x04034b50){const size=workbook.readUInt32LE(offset+18),length=workbook.readUInt16LE(offset+26),start=offset+30+length+workbook.readUInt16LE(offset+28);files.set(workbook.toString('utf8',offset+30,offset+30+length),inflateRawSync(workbook.subarray(start,start+size)).toString('utf8'));offset=start+size;}
  const sheet=files.get('xl/worksheets/sheet2.xml');assert.equal((sheet.match(/<row /g)||[]).length,3);
  assert.equal((sheet.match(/>inspection</g)||[]).length,2);assert.doesNotMatch(sheet,/>final</);assert.match(sheet,/>not_tested</);assert.equal(old.checks.final.ac,'pass');
  assert.match(files.get('xl/worksheets/sheet1.xml'),/>Legacy Post-work Checks JSON</);assert.match(files.get('xl/worksheets/sheet1.xml'),/\{&quot;ac&quot;:&quot;pass&quot;\}/);
  mkdirSync('artifacts/acceptance',{recursive:true});writeFileSync('artifacts/acceptance/v03-stage-export.xlsx',workbook);
});
