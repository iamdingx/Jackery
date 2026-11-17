import test from 'node:test';
import assert from 'node:assert/strict';
import {validateRecord} from '../src/domain.js';
test('model correction carries equivalent checks by bilingual labels, never by reused code',()=>{
 const item=(code,labelEn,labelZh)=>({code,labelEn,labelZh});
 const from={...previous.modelSnapshot,checkItems:[
   item('CHECK_01','1. DC Input','1、DC输入'),
   item('CHECK_02','AC Output','AC输出'),
   item('CHECK_03','Display','显示屏'),
 ]};
 const to={...models[1],checkItems:[
   item('CHECK_08','DC Input','DC输入'),
   item('CHECK_02','AC Output\nAC Frequency','AC输出\nAC频率'),
   item('CHECK_05','Display','显示屏'),
 ]};
 const existing={...previous,modelSnapshot:from,checks:{initial:{CHECK_01:'pass',CHECK_02:'pass',CHECK_03:'fail'}}};
 const options={...catalog,models:[from,to]};
 const r=validateRecord({modelId:2},existing,options);
 assert.deepEqual(r.checks.initial,{CHECK_08:'pass',CHECK_02:'not_tested',CHECK_05:'fail'});
 const override=validateRecord({modelId:2,checks:{initial:{CHECK_08:'not_tested'}}},existing,options);
 assert.equal(override.checks.initial.CHECK_08,'not_tested');
});

const models=[1,2].map(id=>({id,nameEn:'Model '+id,nameZh:'型号'+id,active:true,checkItems:[{code:'check'+id,labelEn:'Check '+id,labelZh:'检查'+id}]}));
const bom=models.map(m=>({id:m.id,modelId:m.id,sku:'PART-'+m.id,descriptionEn:'Part '+m.id,descriptionZh:'原物料'+m.id,unit:'pcs',standardQty:m.id===1?17:25,quantityControl:'standard_hard_cap',active:true}));
const knowledge=models.map(m=>({id:m.id,faultCodes:[{code:'F0',titleZh:'型号'+m.id+'故障原文'}]}));
const catalog={models,bom,knowledge,appearanceOptions:[]};
const previous={sn:'CHANGE-MODEL',modelId:1,modelSnapshot:models[0],workDate:'2026-10-30',checks:{initial:{check1:'fail'}},appearanceCodes:[],appearanceSnapshot:[],materials:[{...bom[0],bomId:1,quantity:1}],faultCodes:['F0'],faultSnapshot:[knowledge[0].faultCodes[0]],status:'wfr',outcome:'awp'};
test('Changing model can select a valid new-model material and never reuses old material snapshot',()=>{
 const r=validateRecord({modelId:2,materials:[{bomId:2,quantity:25}]},previous,catalog);assert.equal(r.modelId,2);assert.equal(r.materials[0].sku,'PART-2');assert.equal(r.materials[0].standardQty,25);assert.deepEqual(r.checks.initial,{check2:'not_tested'});assert.deepEqual(r.faultCodes,[]);
 assert.throws(()=>validateRecord({modelId:2,materials:[{bomId:1,quantity:1}]},previous,catalog),/outside the model BOM/);
 assert.throws(()=>validateRecord({modelId:2,materials:[{bomId:2,quantity:26}]},previous,catalog),/standard usage limit/);
});
test('Changing model resolves fault codes from its own knowledge, retaining neither old source nor old checks',()=>{
 const r=validateRecord({modelId:2,faultCodes:['F0']},previous,catalog);assert.equal(r.faultSnapshot[0].titleZh,'型号2故障原文');assert.deepEqual(r.materials,[]);assert.deepEqual(r.checks.initial,{check2:'not_tested'});
 assert.throws(()=>validateRecord({modelId:2,faultCodes:['F10']},previous,catalog),/outside the selected model/);
});
