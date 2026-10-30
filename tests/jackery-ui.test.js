import test from 'node:test';
import assert from 'node:assert/strict';
import * as state from '../public/state.js';

test('Jackery materials retain standard cap metadata while payload includes optional selected fault codes only',()=>{
 const items=state.mergeMaterials([],[{id:8,sku:'PART',unit:'pcs',standardQty:2,quantityControl:'standard_hard_cap'}]);
 assert.equal(items[0].standardQty,2);
 assert.equal(items[0].quantity,1,'Standard BOM quantity never becomes default consumption');
 const payload=state.recordInput({faultCodes:['F0','F8'],faultSnapshot:[{code:'F0'}],materials:items},'save');
 assert.deepEqual(payload.faultCodes,['F0','F8']);assert.equal(payload.faultSnapshot,undefined);
 assert.equal(payload.materials[0].standardQty,undefined);
});
test('standard quantity validation applies before every save and uses imported pieces as integer quantities',()=>{
 assert.equal(typeof state.materialQuantityError,'function');
 assert.equal(state.materialQuantityError([{quantity:3,standardQty:2,unit:'pcs'}]),'cap');
 assert.equal(state.materialQuantityError([{quantity:1.5,standardQty:2,unit:'pcs'}]),'quantity');
 assert.equal(state.materialQuantityError([{quantity:2,standardQty:2,unit:'pcs'}]),null);
 assert.equal(state.materialQuantityError([{quantity:0.5,unit:'kg'}]),null);
});
