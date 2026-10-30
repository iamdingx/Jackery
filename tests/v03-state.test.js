import test from 'node:test';
import assert from 'node:assert/strict';
import { completionError, recordInput } from '../public/state.js';

test('v03 ROK requires every final test to pass and refurbishment uses initial only',()=>{
  const r={modelSnapshot:{checkItems:[{code:'ac'},{code:'dc'}]},checks:{initial:{ac:'fail',dc:'not_tested'},final:{ac:'pass',dc:'pass'}}};
  assert.equal(completionError({...r,outcome:'rok'}),null);
  assert.equal(completionError({...r,outcome:'rok',checks:{...r.checks,final:{ac:'pass',dc:'fail'}}}),'final');
  assert.equal(completionError({...r,status:'completed',outcome:'rok',checks:{...r.checks,final:{ac:'not_tested',dc:'pass'}}}),'final');
  assert.equal(completionError({...r,outcome:'like_new'}),'initial');
  assert.equal(completionError({...r,outcome:'good',checks:{initial:{ac:'pass',dc:'pass'},final:{ac:'fail'}}}),null);
  assert.equal(completionError({...r,outcome:'scrap',scrapReason:'broken'}),null);
  assert.equal(completionError({...r,outcome:'scrap',scrapReason:' '}),'scrap');
  assert.equal(completionError({...r,outcome:'awp'}),'wfr');
});

test('v03 record input preserves original and manual translation plus all separate references',()=>{
  const fields={translatedAppearanceNotes:'Manual appearance',translatedIssueNotes:'Manual issue',receivingSku:'RX',postSortSku:'SORT',receivingOrderNo:'IN1',receivingStatus:'Legacy status',productNameVerification:'Verified name',skuVerification:'Verified SKU',parentRecord:'original relation text',unspecifiedTextField:'original text'};
  const r={...fields,appearanceNotes:'原外观',issueNotes:'原问题',checks:{initial:{ac:'fail'},final:{ac:'pass'}},materials:[]};
  const input=recordInput(r,'save');
  for(const [key,value] of Object.entries(fields))assert.equal(input[key],value,key);
  assert.equal(input.appearanceNotes,'原外观');assert.equal(input.issueNotes,'原问题');
  assert.deepEqual(input.checks,r.checks);
});
