import {createHash} from 'node:crypto';

export function applyModelSkuMapping(store,dataset){
 if(dataset?.schemaVersion!==1||!Array.isArray(dataset.models)||!dataset.models.length||!/^[a-zA-Z0-9_-]+$/.test(dataset.referenceId??''))throw new Error('Invalid reviewed model SKU mapping');
 const keys=new Set();
 for(const entry of dataset.models){
  if(typeof entry.catalogKey!=='string'||!entry.catalogKey||keys.has(entry.catalogKey)||typeof entry.productSku!=='string'||!entry.productSku||entry.productSku.length>200||entry.productSku.trim()!==entry.productSku)throw new Error('Invalid or duplicate reviewed model SKU entry');
  if(entry.expectedProductSkus!==undefined&&(!Array.isArray(entry.expectedProductSkus)||entry.expectedProductSkus.some(s=>typeof s!=='string')))throw new Error('Invalid expected Product SKU list');
  keys.add(entry.catalogKey);
 }
 const digest=createHash('sha256').update(JSON.stringify(dataset)).digest('hex'),metaKey='model-sku:'+dataset.referenceId;
 return store.tx(()=>{
  const previous=store.db.prepare('SELECT value FROM meta WHERE key=?').get(metaKey);
  if(previous){const report=JSON.parse(previous.value);if(report.digest!==digest)throw new Error('Model SKU reference already applied with different content');return {...report,alreadyApplied:true};}
  const models=store.all('models'),changes=[],pendingModels=[];let matchedModels=0;
  for(const entry of dataset.models){
   const matches=models.filter(m=>m.catalogKey===entry.catalogKey);
   if(matches.length>1)throw new Error('Duplicate master catalog key: '+entry.catalogKey);
   if(!matches.length){pendingModels.push({catalogKey:entry.catalogKey,model:entry.model,productSku:entry.productSku,reason:'Model checklist and BOM sources not configured'});continue;}
   const model=matches[0];matchedModels++;
   if(!(entry.expectedProductSkus??[entry.productSku]).includes(model.productSku??''))throw new Error('Unexpected Product SKU for '+entry.catalogKey+'; review administrator changes before applying');
   if(model.productSku!==entry.productSku)changes.push({model,catalogKey:entry.catalogKey,modelId:model.id,before:model.productSku??'',after:entry.productSku});
  }
  const report={referenceId:dataset.referenceId,digest,matchedModels,updatedModels:changes.length,changes:changes.map(({model,...change})=>change),pendingModels,appliedAt:new Date().toISOString(),alreadyApplied:false};
  for(const {model,after} of changes)store.put('models',{...model,productSku:after});
  if(matchedModels)store.db.prepare('INSERT INTO meta(key,value) VALUES(?,?)').run(metaKey,JSON.stringify(report));
  return report;
 });
}
