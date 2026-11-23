import test from 'node:test';
import assert from 'node:assert/strict';
import {auditChanges} from '../public/audit-summary.js';

const display={t:s=>s,lang:'en',modelLabel:m=>m?.nameEn||''};
test('correction compares part identities and check codes independently of ordering',()=>{
 const p={sku:'PART-1',bomId:1,quantity:2,unit:'pcs'};
 const q={...p,bomId:2,quantity:1};
 const before={materials:[p,q],faultCodes:['F1','F2'],checks:{initial:{usb:'fail'}}};
 const reorder={...before,materials:[q,p],faultCodes:['F2','F1']};
 assert.deepEqual(auditChanges(before,reorder,display),[]);
 const after={...reorder,checks:{initial:{usb:'pass'}},materials:[{...q,quantity:3},{...p,sku:'PART-2',bomId:3}]};
 const rows=auditChanges(before,after,display);
 assert.deepEqual(rows,[
  ['Functional Checks · usb','Fail','Pass'],
  ['Material Usage · PART-1 · BOM #1','2 pcs','—'],
  ['Material Usage · PART-1 · BOM #2','1 pcs','3 pcs'],
  ['Material Usage · PART-2 · BOM #3','—','2 pcs'],
 ]);
});
test('historical missing data is distinguished from an explicitly cleared field',()=>{
 const rows=auditChanges({issueNotes:'原文'},{issueNotes:'',storagePallet:'P-01'},display);
 assert.deepEqual(rows,[['Completion Pallet No.','Not recorded','P-01'],['Defect remark','原文','Empty']]);
});

test('first correction of a legacy remark omits empty defaults from the summary',()=>{
 const before={issueNotes:'USB fault',receivingStatus:null};
 const after={
  issueNotes:'USB-C fault',translatedAppearanceNotes:'',translatedIssueNotes:'',
  receivingSku:'',postSortSku:'',receivingOrderNo:'',receivingStatus:'',
  productNameVerification:'',skuVerification:'',parentRecord:'',unspecifiedTextField:'',
  faultCodes:[],appearanceCodes:[],photos:[],materials:[]
 };
 const snapshots=structuredClone([before,after]);
 assert.deepEqual(auditChanges(before,after,display),[['Defect remark','USB fault','USB-C fault']]);
 assert.deepEqual([before,after],snapshots);
});

test('legacy lists still report the first recorded values and explicit removals',()=>{
 const before={appearanceCodes:['dent'],photos:[{id:3}]};
 const after={appearanceCodes:[],faultCodes:['F1'],photos:[]};
 assert.deepEqual(auditChanges(before,after,display),[
  ['Appearance condition','dent','Empty'],
  ['Fault Codes','Not recorded','F1'],
  ['Evidence Photos','3','Empty']
 ]);
});
