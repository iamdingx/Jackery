import test from 'node:test';
import assert from 'node:assert/strict';
import {validateRecord} from '../src/domain.js';
import {completionError,recordInput} from '../public/state.js';
import {exportRecords} from '../src/export.js';
import {inflateRawSync} from 'node:zlib';
import {mkdirSync,writeFileSync} from 'node:fs';

const model={id:1,nameEn:'Sample',nameZh:'示例',active:true,checkItems:[{code:'ac',labelEn:'AC Output',labelZh:'交流输出'}]};
const catalog={models:[model],appearanceOptions:[],bom:[]};
const record={id:1,modelId:1,modelSnapshot:model,sn:'SINGLE-001',workDate:'2026-10-29',status:'draft',outcome:null,appearanceCodes:[],appearanceSnapshot:[],checks:{initial:{ac:'not_tested'}},materials:[]};

test('single inspection: ROK keeps a failed inspection without requiring post-work tests',()=>{
  const saved=validateRecord({outcome:'rok',action:'complete',checks:{initial:{ac:'fail'}}},record,catalog);
  assert.equal(saved.status,'completed');assert.equal(saved.checks.initial.ac,'fail');
  assert.equal(Object.hasOwn(saved.checks,'final'),false,'New records have no post-work inspection');
});
test('single inspection: untested ROK is incomplete even when legacy final tests passed',()=>{
  assert.throws(()=>validateRecord({outcome:'rok',action:'complete',checks:{initial:{ac:'not_tested'},final:{ac:'pass'}}},record,catalog),/inspection/i);
});
test('single inspection: client accepts assessed failures for repair but not refurbishment',()=>{
  const failed={...record,checks:{initial:{ac:'fail'}}};
  assert.equal(completionError({...failed,outcome:'rok'}),null);
  assert.equal(completionError({...failed,outcome:'good'}),'inspection');
  assert.equal(completionError({...record,outcome:'rok'}),'inspection');
});
test('single inspection: editor payload never resubmits archived final tests',()=>{
  const input=recordInput({...record,checks:{initial:{ac:'fail'},final:{ac:'pass'}},materials:[]},'save');
  assert.deepEqual(input.checks,{initial:{ac:'fail'}});
});
test('single inspection: existing post-work evidence is unchanged on later edits',()=>{
  const old={...record,checks:{initial:{ac:'fail'},final:{ac:'pass'}}};
  const saved=validateRecord({checks:{initial:{ac:'pass'},final:{ac:'fail'}},issueNotes:'Corrected note'},old,catalog);
  assert.deepEqual(saved.checks.final,{ac:'pass'},'Legacy evidence cannot be edited as a new inspection');
});
test('single inspection: old completed ROK can receive a notes-only correction without fabricating an inspection',()=>{
  const old={...record,status:'completed',outcome:'rok',checks:{initial:{ac:'not_tested'},final:{ac:'pass'}}};
  const saved=validateRecord({action:'complete',issueNotes:'Historical correction'},old,catalog);
  assert.equal(saved.status,'completed');assert.equal(saved.checks.initial.ac,'not_tested');assert.equal(saved.checks.final.ac,'pass');
});

test('single inspection: export has one row per function and preserves legacy evidence separately',()=>{
  const base={...record,workOrder:'SINGLE-EXPORT-001',outcome:'rok',outcomeGroup:'repair',photos:[],ownerId:1,ownerName:'Operator'};
  const old={...base,id:2,workOrder:'LEGACY-EXPORT-002',checks:{initial:{ac:'fail'},final:{ac:'pass'}}};
  const workbook=exportRecords([base,old]),files=new Map();let offset=0;
  while(workbook.readUInt32LE(offset)===0x04034b50){
    const size=workbook.readUInt32LE(offset+18),length=workbook.readUInt16LE(offset+26),start=offset+30+length+workbook.readUInt16LE(offset+28);
    files.set(workbook.toString('utf8',offset+30,offset+30+length),inflateRawSync(workbook.subarray(start,start+size)).toString('utf8'));offset=start+size;
  }
  const sheet=files.get('xl/worksheets/sheet2.xml'),summary=files.get('xl/worksheets/sheet1.xml');
  assert.equal((sheet.match(/<row /g)||[]).length,3,'Header plus one inspection per record');
  assert.equal((sheet.match(/>inspection</g)||[]).length,2);assert.doesNotMatch(sheet,/>final</);
  assert.match(summary,/Legacy Post-work Checks JSON/);assert.match(summary,/\{&quot;ac&quot;:&quot;pass&quot;\}/);
  assert.equal(old.checks.final.ac,'pass');
  mkdirSync('artifacts/acceptance',{recursive:true});writeFileSync('artifacts/acceptance/single-inspection-export.xlsx',workbook);
});
