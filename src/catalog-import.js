import {createHash} from 'node:crypto';
import {validateModel,textValue} from './domain.js';
import {passwordHash,passwordMatches} from './store.js';

const check=(condition,message)=>{if(!condition)throw new Error(message);};
export function importJackeryCatalog(store,dataset,{deactivateSamples=false}={}){
  check(dataset?.schemaVersion===1&&Array.isArray(dataset.models)&&dataset.models.length>0,'Unsupported or empty Jackery catalog');
  const batchKey=textValue(dataset.batchKey,'Catalog batch key',120,true);
  check(/^[a-zA-Z0-9_-]+$/.test(batchKey),'Invalid catalog batch key');
  const digest=createHash('sha256').update(JSON.stringify({models:dataset.models,sources:dataset.sources??[],excluded:dataset.excluded??[]})).digest('hex');
  const metaKey='catalog:'+batchKey,prior=store.db.prepare('SELECT value FROM meta WHERE key=?').get(metaKey);
  if(prior){const report=JSON.parse(prior.value);check(report.digest===digest,'Catalog batch already imported with different content; use a new reviewed batch key');return {...report,alreadyImported:true};}
  const keys=new Set();
  const prepared=dataset.models.map(source=>{
    const key=textValue(source.catalogKey,'Catalog model key',200,true);check(!keys.has(key),'Duplicate catalog model key');keys.add(key);
    const model=validateModel(source,1),seen=new Set();check(Array.isArray(source.bom),'Model BOM must be an array');
    const bom=source.bom.map(raw=>{
      const sku=textValue(raw.sku,'Part SKU',200,true);check(!seen.has(sku),'Duplicate SKU within catalog model');seen.add(sku);
      const standardQty=raw.standardQty??null;
      check(standardQty===null||(typeof standardQty==='number'&&Number.isFinite(standardQty)&&standardQty>0&&standardQty<=1000000),'Invalid source standard quantity');
      check(raw.active!==true||standardQty!==null,'Enabled source material requires a confirmed standard quantity');
      check(typeof raw.active==='boolean','Source material active flag is required');
      const unit=textValue(raw.unit,'Unit',40,true);
      if(/^pcs?$/i.test(unit)&&standardQty!==null)check(Number.isInteger(standardQty),'Source piece standard quantity must be whole');
      return {...structuredClone(raw),sku,descriptionEn:textValue(raw.descriptionEn??'','English description',2000),descriptionZh:textValue(raw.descriptionZh??'','Original description',4000,true),unit,standardQty,quantityControl:'standard_hard_cap',active:model.active&&raw.active};
    });
    const knowledge=structuredClone(source.knowledge??{faultCodes:[],repairGuides:[],notices:[]});
    check(Array.isArray(knowledge.faultCodes)&&Array.isArray(knowledge.repairGuides),'Invalid model knowledge');const faultSet=new Set();
    for(const fault of knowledge.faultCodes){check(typeof fault.code==='string'&&fault.code.length>0&&!faultSet.has(fault.code),'Duplicate or invalid source fault code');faultSet.add(fault.code);}
    return {model,bom,knowledge};
  });
  return store.tx(()=>{
    const existing=store.all('models'),report={batchKey,digest,models:0,activeModels:0,materials:0,activeMaterials:0,heldMaterials:0,faultCodes:0,repairGuides:0,excludedRows:dataset.excluded?.length??0,sourceFiles:dataset.sources?.length??0,modelMappings:[],importedAt:new Date().toISOString(),alreadyImported:false};
    for(const source of prepared){
      const found=existing.find(m=>m.catalogKey===source.model.catalogKey);check(!found,'Catalog key belongs to an existing import; do not overwrite it implicitly');
      const id=store.next('models'),model={...source.model,id};store.put('models',model);store.put('model_knowledge',{...source.knowledge,id});
      report.models++;if(model.active)report.activeModels++;report.faultCodes+=source.knowledge.faultCodes.length;report.repairGuides+=source.knowledge.repairGuides.length;
      for(const part of source.bom){store.put('bom',{...part,id:store.next('bom'),modelId:id});report.materials++;if(part.active)report.activeMaterials++;else report.heldMaterials++;}
      report.modelMappings.push({catalogKey:model.catalogKey,modelId:id,baseModelCode:model.baseModelCode,bomVersion:model.bomVersion,productSku:model.productSku,active:model.active,reviewReasons:model.reviewReasons??[]});
    }
    if(deactivateSamples)for(const model of existing)if(/^DEMO-PRODUCT-/.test(model.productSku??'')&&/^Sample Model [AB]$/.test(model.nameEn??'')){
      store.put('models',{...model,active:false});
      for(const part of store.all('bom').filter(p=>p.modelId===model.id))store.put('bom',{...part,active:false});
    }
    // Rename only unchanged, known demo credentials; never reset a user's custom password.
    if(store.db.prepare("SELECT value FROM meta WHERE key='mode'").get()?.value==='demo'){
      for(const [username,suffix] of [['admin','Admin'],['alex','Alex'],['blair','Blair']]){
        const row=store.db.prepare('SELECT id,password_hash FROM users WHERE username=?').get(username);
        if(row&&passwordMatches('Huabao'+suffix+'!2026',row.password_hash))store.db.prepare('UPDATE users SET password_hash=? WHERE id=?').run(passwordHash('Jackery'+suffix+'!2026'),row.id);
      }
    }
    store.db.prepare('INSERT INTO meta(key,value) VALUES(?,?)').run(metaKey,JSON.stringify(report));return report;
  });
}
