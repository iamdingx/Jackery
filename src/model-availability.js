const referenceId='e2000plus-a-user-20261030',metaKey='availability:'+referenceId;

export function applyE2000PlusAAvailability(store){
 return store.tx(()=>{
  const previous=store.db.prepare('SELECT value FROM meta WHERE key=?').get(metaKey);
  if(previous)return {...JSON.parse(previous.value),alreadyApplied:true};
  const model=store.all('models').find(m=>m.catalogKey==='e2000plus-a');
  if(!model)return {referenceId,alreadyApplied:false,notConfigured:true};
  const parts=store.all('bom').filter(p=>p.modelId===model.id);
  if(parts.length!==57)throw new Error('Unexpected E2000plus A source BOM; review before activation');
  const eligible=parts.filter(p=>p.reviewReasons?.length===1&&p.reviewReasons[0]==='parent_model_requires_review');
  if(eligible.length!==54)throw new Error('Unexpected E2000plus A lifecycle review; refusing automatic activation');
  for(const p of eligible)if(!(Number.isFinite(p.standardQty)&&p.standardQty>0&&Number.isInteger(p.standardQty)))throw new Error('A material requires a confirmed standard quantity');
  const held=parts.filter(p=>!eligible.includes(p));
  if(held.some(p=>p.active))throw new Error('Review held sample/preproduction material before activation');
  const report={referenceId,modelId:model.id,catalogKey:model.catalogKey,enabledMaterials:eligible.length,heldMaterials:held.length,materialIds:eligible.map(p=>p.id),appliedAt:new Date().toISOString(),alreadyApplied:false};
  store.put('models',{...model,active:true});
  for(const part of eligible)store.put('bom',{...part,active:true});
  store.db.prepare('INSERT INTO meta(key,value) VALUES(?,?)').run(metaKey,JSON.stringify(report));
  return report;
 });
}
