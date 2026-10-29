import test from 'node:test';
import assert from 'node:assert/strict';
import { mergeMaterials, toggleAppearance, completionError, recordInput, escapeHtml } from '../public/state.js';

test('BOM add preserves original quantities, deduplicates selected IDs, and defaults to one', () => {
  const old = [{bomId:1,sku:'A',quantity:4}];
  assert.deepEqual(mergeMaterials(old,[{id:1,sku:'A',quantity:2},{id:2,sku:'B'},{id:2,sku:'B'}]), [{bomId:1,sku:'A',quantity:4},{bomId:2,sku:'B',descriptionEn:undefined,descriptionZh:undefined,unit:undefined,quantity:1}]);
  assert.equal(old.length,1);
});
test('appearance no defect is mutually exclusive in both selection directions', () => {
  assert.deepEqual(toggleAppearance(['scratches','cracks'],'no_defect',true),['no_defect']);
  assert.deepEqual(toggleAppearance(['no_defect'],'scratches',true),['scratches']);
  assert.deepEqual(toggleAppearance(['scratches'],'scratches',false),[]);
});
test('completion validation separates single inspection, scrap reason and WFR', () => {
  const r={modelSnapshot:{checkItems:[{code:'a'}]},checks:{initial:{a:'pass'},final:{a:'fail'}},materials:[]};
  assert.equal(completionError({...r,outcome:'like_new'}),null);
  assert.equal(completionError({...r,outcome:'rok'}),null);
  assert.equal(completionError({...r,outcome:'rok',checks:{initial:{a:'not_tested'}}}),'inspection');
  assert.equal(completionError({...r,outcome:'scrap',scrapReason:' '}),'scrap');
  assert.equal(completionError({...r,outcome:'awp'}),'wfr');
  assert.equal(completionError({...r,outcome:null}),'outcome');
  assert.equal(completionError({...r,outcome:'scrap',scrapReason:'broken'}),null);
});
test('record payload strips server-owned labels and identity', () => {
  const payload=recordInput({id:22,ownerId:8,version:2,sn:'SN',modelId:1,materials:[{bomId:3,quantity:2,sku:'UNTRUSTED'}]},'save');
  assert.equal(payload.ownerId,undefined);assert.equal(payload.id,undefined);
  assert.deepEqual(payload.materials,[{bomId:3,quantity:2}]);assert.equal(payload.action,'save');
});
test('user supplied text is escaped for HTML and quoted attribute contexts', () => {
  assert.equal(escapeHtml('<img src=x onerror="x"> & \'x\''),'&lt;img src=x onerror=&quot;x&quot;&gt; &amp; &#39;x&#39;');
});
