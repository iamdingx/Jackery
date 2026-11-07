import {createHash} from 'node:crypto';
import {validateBom,validateModel} from './domain.js';

const digest=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const requireThat=(ok,message)=>{if(!ok)throw new Error(message);};

export function planClassifiedBom(store,batch){
  const hash=digest(batch),key='catalog:'+batch.batchKey;
  const receipt=store.db.prepare('SELECT value FROM meta WHERE key=?').get(key);
  if(receipt){
    const prior=JSON.parse(receipt.value);
    requireThat(prior.batchHash===hash,'The same BOM batch has different contents');
    return {report:{...prior,alreadyApplied:true}};
  }
  const models=store.all('models').sort((a,b)=>a.id-b.id),parts=store.all('bom').sort((a,b)=>a.id-b.id);
  const knowledge=store.all('model_knowledge');
  const existingModels=new Map(models.filter(m=>m.catalogKey).map(m=>[m.catalogKey,m]));
  requireThat(existingModels.size===models.filter(m=>m.catalogKey).length,'Duplicate catalog keys');
  const source=existingModels.get('e1000-default');
  const sourceKnowledge=knowledge.find(k=>k.id===source?.id);
  requireThat(source?.checkItems.length&&sourceKnowledge?.faultCodes?.length,'E1000 reference configuration is missing');
  let modelId=Math.max(0,...models.map(m=>m.id))+1,bomId=Math.max(0,...parts.map(p=>p.id))+1;
  const modelWrites=[],knowledgeWrites=[],bomWrites=[],archive=[],summary=[];
  const report={batchHash:hash,previewHash:digest({hash,models,parts,knowledge}),addedModels:0,updated:0,inserted:0,retired:0,otherRowsRetained:0,models:summary};
  requireThat(new Set(batch.models.map(m=>m.catalogKey)).size===batch.models.length,'Duplicate batch model');
  for(const entry of batch.models){
    let model=existingModels.get(entry.catalogKey);
    if(!model){
      requireThat(['e1000plus-a','e1000plus-b'].includes(entry.catalogKey),'Unexpected missing model: '+entry.catalogKey);
      model=validateModel({nameEn:'E1000plus',nameZh:'E1000plus',baseModelCode:'E1000plus',market:'EU',bomVersion:entry.catalogKey.endsWith('-a')?'A版':'B版',catalogKey:entry.catalogKey,productSku:entry.productSku,active:true,checkItems:source.checkItems},modelId++);
      modelWrites.push(model);knowledgeWrites.push({...structuredClone(sourceKnowledge),id:model.id});report.addedModels++;
    }else{
      requireThat(model.productSku===entry.productSku,'Product SKU mismatch: '+entry.catalogKey);
      if(entry.catalogKey==='e1000v2-original'){
        model={...model,active:true,reviewReasons:(model.reviewReasons??[]).filter(r=>!r.startsWith('filename_model_conflicts_'))};modelWrites.push(model);
      }
    }
    const oldParts=new Map(parts.filter(p=>p.modelId===model.id).map(p=>[p.sku,p]));
    const seen=new Set(),counts={core:0,non_core:0,packaging:0,allOnly:0};let active=0;
    for(const item of entry.bom){
      requireThat(!seen.has(item.sku),'Duplicate Part SKU: '+entry.catalogKey+' '+item.sku);seen.add(item.sku);
      const category=item.category;
      requireThat(['core','non_core','packaging'].includes(category)||category===null&&item.allOnly,'Invalid BOM category');
      counts[category??'allOnly']++;
      const old=oldParts.get(item.sku);
      const reasons=(old?.reviewReasons??[]).filter(r=>r!=='standard_quantity_missing'&&r!=='parent_model_requires_review');
      const canUnhold=old?.reviewReasons?.length&&reasons.length===0&&['e1000-default','e1000v2-original'].includes(entry.catalogKey);
      const reviewReasons=[...new Set([...item.reviewReasons,...reasons])];
      const enabled=model.active&&!reviewReasons.length&&(!old||old.active||canUnhold);
      const part=validateBom({...item,modelId:model.id,active:Boolean(enabled),reviewReasons},old?.id??bomId++,[model]);
      bomWrites.push({...part,category,allOnly:item.allOnly,categoryBasis:item.categoryBasis,...(old?.original&&old.descriptionZh===part.descriptionZh?{original:old.original}:{})});
      if(enabled)active++;
      if(old)report.updated++;else report.inserted++;
    }
    const retired=new Set(entry.retireSkus);
    for(const sku of retired){
      requireThat(!seen.has(sku),'A current SKU cannot also be retired');
      const part=oldParts.get(sku);
      if(part){archive.push({...part,active:false,reviewReasons:[...new Set([...(part.reviewReasons??[]),'superseded_source_bom'])]});report.retired++;}
    }
    report.otherRowsRetained+=[...oldParts.keys()].filter(sku=>!seen.has(sku)&&!retired.has(sku)).length;
    summary.push({catalogKey:entry.catalogKey,modelId:model.id,active:model.active,rows:seen.size,enabled:active,...counts});
  }
  return {key,report,modelWrites,knowledgeWrites,bomWrites,archive};
}

export function applyClassifiedBom(store,batch,expectedPreviewHash){
  return store.tx(()=>{
    const plan=planClassifiedBom(store,batch);
    if(plan.report.alreadyApplied)return plan.report;
    requireThat(plan.report.previewHash===expectedPreviewHash,'BOM changed after preview; generate a fresh plan');
    for(const model of plan.modelWrites)store.put('models',model);
    for(const item of plan.knowledgeWrites)store.put('model_knowledge',item);
    for(const item of [...plan.bomWrites,...plan.archive])store.put('bom',item);
    store.db.prepare('INSERT INTO meta(key,value) VALUES(?,?)').run(plan.key,JSON.stringify(plan.report));
    return plan.report;
  });
}
