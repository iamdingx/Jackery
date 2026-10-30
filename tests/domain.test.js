import test from 'node:test';
import assert from 'node:assert/strict';

// These tests catch completion gates, client-owned labels and catalog drift.
const load = () => import('../src/domain.js').catch(() => ({}));
const model = { id: 1, nameEn: 'A', nameZh: '甲', productSku: '', active: true, checkItems: [{code:'ac',labelEn:'AC',labelZh:'交流'}] };
const catalog = { models:[model], appearanceOptions:[{code:'no_defect',labelEn:'None',active:true},{code:'scratches',labelEn:'Scratches',active:true}], bom:[{id:1,modelId:1,sku:'P1',descriptionEn:'Part',descriptionZh:'配件',unit:'pc',active:true}] };
const previous = { modelId:1, modelSnapshot:model, sn:' SN ', productSku:'', sourcePallet:'',storagePallet:'',workDate:'2026-10-29',outcome:null,appearanceCodes:[],appearanceSnapshot:[],appearanceNotes:'',issueNotes:'',scrapReason:'',checks:{initial:{ac:'not_tested'},final:{ac:'not_tested'}},materials:[],status:'draft'};

test('refurbishment completion rejects failed initial checks and waiting outcomes cannot complete', async () => {
  const {validateRecord} = await load(); assert.equal(typeof validateRecord,'function');
  assert.throws(() => validateRecord({outcome:'like_new',action:'complete',checks:{initial:{ac:'fail'},final:{ac:'pass'}}},previous,catalog), /inspection/i);
  assert.throws(() => validateRecord({outcome:'awp',action:'complete'},previous,catalog), /outcome|waiting/i);
  const saved = validateRecord({outcome:'awp',action:'save'},previous,catalog);
  assert.equal(saved.status,'wfr'); assert.equal(saved.sn,'SN');
});
test('repair requires assessed inspection, scrap a reason and no_defect is exclusive', async () => {
  const {validateRecord} = await load(); assert.equal(typeof validateRecord,'function');
  assert.throws(() => validateRecord({outcome:'rok',action:'complete'},previous,catalog), /inspection/i);
  assert.equal(validateRecord({outcome:'rok',action:'complete',checks:{initial:{ac:'fail'}}},previous,catalog).status,'completed');
  assert.throws(() => validateRecord({outcome:'scrap',action:'complete'},previous,catalog), /reason/i);
  assert.throws(() => validateRecord({appearanceCodes:['no_defect','scratches']},previous,catalog), /appearance|exclusive/i);
  assert.equal(validateRecord({outcome:'scrap',scrapReason:'Unsafe',action:'complete'},previous,catalog).status,'completed');
});
test('materials use server labels, reject duplicates, foreign BOM and invalid quantities', async () => {
  const {validateRecord} = await load(); assert.equal(typeof validateRecord,'function');
  for (const quantity of [0,-1,Infinity,1.1234,1.00000000001,1000001,'2']) assert.throws(() => validateRecord({materials:[{bomId:1,quantity}]},previous,catalog), /quantity/i);
  assert.throws(() => validateRecord({materials:[{bomId:9,quantity:1}]},previous,catalog), /BOM/i);
  assert.throws(() => validateRecord({materials:[{bomId:1,quantity:1},{bomId:1,quantity:2}]},previous,catalog), /duplicate/i);
  const v = validateRecord({materials:[{bomId:1,quantity:1,descriptionEn:'FAKE'}]},previous,catalog);
  assert.equal(v.materials[0].descriptionEn,'Part');
});
test('existing model and material snapshots survive catalog edits', async () => {
  const {validateRecord} = await load(); assert.equal(typeof validateRecord,'function');
  const old = {...previous,materials:[{bomId:1,sku:'OLD',descriptionEn:'Old label',descriptionZh:'旧',unit:'pc',quantity:1}]};
  const changed = {...catalog,models:[{...model,checkItems:[{code:'new',labelEn:'New'}]}],bom:[{...catalog.bom[0],active:false,descriptionEn:'Changed'}]};
  const v = validateRecord({materials:[{bomId:1,quantity:2}]},old,changed);
  assert.equal(v.modelSnapshot.checkItems[0].code,'ac'); assert.equal(v.materials[0].descriptionEn,'Old label');
  assert.throws(() => validateRecord({checks:{initial:{intruder:'pass'}}},previous,catalog), /check/i);
});
