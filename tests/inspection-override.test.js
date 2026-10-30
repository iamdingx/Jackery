import test from 'node:test';
import assert from 'node:assert/strict';
import {validateRecord} from '../src/domain.js';
import {completionError,recordInput} from '../public/state.js';
const model={id:1,active:true,nameEn:'Test Model',checkItems:[{code:'ac',labelEn:'AC Output'}]},catalog={models:[model],bom:[],appearanceOptions:[]};
const record={id:1,modelId:1,modelSnapshot:model,sn:'ONLY-ONE-INSPECTION',workDate:'2026-10-30',status:'draft',checks:{initial:{ac:'not_tested'}},appearanceCodes:[],appearanceSnapshot:[],materials:[]};
test('latest user override: new ROK keeps observed failure and has no post-work test',()=>{
 const saved=validateRecord({action:'complete',outcome:'rok',checks:{initial:{ac:'fail'},final:{ac:'pass'}}},record,catalog);
 assert.equal(saved.status,'completed');assert.deepEqual(saved.checks,{initial:{ac:'fail'}});
});
test('latest user override: final pass cannot substitute for the single untested inspection',()=>{
 assert.throws(()=>validateRecord({action:'complete',outcome:'rok',checks:{initial:{ac:'not_tested'},final:{ac:'pass'}}},record,catalog),/inspection/i);
});
test('latest user override: archived final evidence cannot be changed or replace the inspection',()=>{
 const old={...record,checks:{initial:{ac:'fail'},final:{ac:'pass'}}};
 assert.deepEqual(validateRecord({checks:{initial:{ac:'pass'},final:{ac:'fail'}}},old,catalog).checks,{initial:{ac:'pass'},final:{ac:'pass'}});
});
test('latest user override: valid historical completion permits notes-only admin correction',()=>{
 const old={...record,status:'completed',outcome:'rok',checks:{initial:{ac:'not_tested'},final:{ac:'pass'}}};
 const saved=validateRecord({action:'complete',issueNotes:'Correct original note'},old,catalog);assert.deepEqual(saved.checks,old.checks);assert.equal(saved.status,'completed');
 const assessed={...old,checks:{initial:{ac:'fail'},final:{ac:'pass'}}};
 assert.throws(()=>validateRecord({action:'complete',checks:{initial:{ac:'not_tested'}}},assessed,catalog),/inspection/i);
});
test('latest user override: frontend sends one inspection and independently validates refurbishment',()=>{
 const r={...record,outcome:'rok',checks:{initial:{ac:'fail'},final:{ac:'not_tested'}}};
 assert.equal(completionError(r),null);assert.equal(completionError({...r,outcome:'good'}),'inspection');
 assert.deepEqual(recordInput(r,'save').checks,{initial:{ac:'fail'}});
});
