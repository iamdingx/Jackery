export class ApiError extends Error {
  constructor(status,code,message,details){super(message);this.status=status;this.code=code;this.details=details;}
}
export const invalid = (message,details) => {throw new ApiError(422,'VALIDATION',message,details);};
export const outcomes = [
  {code:'like_new',group:'refurbishment',labelEn:'Like New',labelZh:'近新'},
  {code:'good',group:'refurbishment',labelEn:'Good',labelZh:'良好'},
  {code:'acceptable',group:'refurbishment',labelEn:'Acceptable',labelZh:'可接受'},
  {code:'rok',group:'repair',labelEn:'ROK',labelZh:'维修完成 ROK'},
  {code:'scrap',group:'repair',labelEn:'SCRAP',labelZh:'报废'},
  {code:'awp',group:'wfr',labelEn:'AWP',labelZh:'AWP'},
  {code:'needs_analysis',group:'wfr',labelEn:'Needs Analysis',labelZh:'待分析'}
];
export function textValue(value,name,max=2000,required=false){
  if(typeof value!=='string')invalid(`${name} must be text`);
  if(value.length>max||/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value))invalid(`${name} is invalid or too long`);
  if(required&&!value.trim())invalid(`${name} is required`);
  return value;
}
export function isoDate(value){
  if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value)||!Number.isFinite(Date.parse(value+'T00:00:00Z'))||new Date(value+'T00:00:00Z').toISOString().slice(0,10)!==value)invalid('Work date must be a valid ISO date');
  return value;
}
export function positiveId(value,name='ID') {if(!Number.isSafeInteger(value)||value<1)invalid(`${name} must be a positive integer`);return value;}
export function validateModel(input,id){
  if(!input||typeof input!=='object')invalid('Model is required');
  const items=input.checkItems;
  if(!Array.isArray(items)||!items.length||items.length>200)invalid('Model requires 1–200 check items');
  const codes=new Set();
  const checkItems=items.map(item=>{
    if(!item||typeof item!=='object')invalid('Check item is invalid');
    const code=textValue(item.code,'Check code',80,true).trim();
    if(!/^[a-zA-Z0-9_-]+$/.test(code)||codes.has(code)||['__proto__','constructor','prototype'].includes(code))invalid('Check codes must be unique safe keys');codes.add(code);
    return {code,labelEn:textValue(item.labelEn,'English check label',300,true).trim(),labelZh:textValue(item.labelZh??'','Chinese check label',300).trim()};
  });
  if(input.active!==undefined&&typeof input.active!=='boolean')invalid('Active must be boolean');
  return {id,nameEn:textValue(input.nameEn,'English model name',200,true).trim(),nameZh:textValue(input.nameZh??'','Chinese model name',200).trim(),productSku:textValue(input.productSku??'','Product SKU',200).trim(),active:input.active??true,checkItems};
}
export function validateAppearance(input,code){
  code=textValue(code??input.code,'Appearance code',80,true).trim();
  if(!/^[a-zA-Z0-9_-]+$/.test(code))invalid('Appearance code is invalid');
  if(input.active!==undefined&&typeof input.active!=='boolean')invalid('Active must be boolean');
  return {code,labelEn:textValue(input.labelEn,'English appearance label',200,true).trim(),labelZh:textValue(input.labelZh??'','Chinese appearance label',200).trim(),active:input.active??true};
}
export function validateBom(input,id,models){
  const modelId=positiveId(input.modelId,'Model ID');if(!models.some(m=>m.id===modelId))invalid('Model does not exist');
  if(input.active!==undefined&&typeof input.active!=='boolean')invalid('Active must be boolean');
  return {id,modelId,sku:textValue(input.sku,'SKU',200,true).trim(),descriptionEn:textValue(input.descriptionEn,'English description',1000,true).trim(),descriptionZh:textValue(input.descriptionZh??'','Chinese description',1000).trim(),unit:textValue(input.unit??'pc','Unit',40,true).trim(),active:input.active??true};
}
export function validateRecord(input,previous,catalog){
  if(!input||typeof input!=='object'||Array.isArray(input))invalid('Record input must be an object');
  const v={...previous};
  const modelId=input.modelId===undefined?previous.modelId:positiveId(input.modelId,'Model ID');
  if(modelId!==previous.modelId||!previous.modelSnapshot){
    const model=catalog.models.find(m=>m.id===modelId&&m.active);if(!model||!model.checkItems?.length)invalid('Select an active model with a check list');
    v.modelId=model.id;v.modelSnapshot=structuredClone(model);
  }
  const modelChanged=modelId!==previous.modelId;
  v.sn=textValue(input.sn??previous.sn??'','SN',200,true).trim();
  for(const [field,max] of [['productSku',200],['sourcePallet',200],['storagePallet',200],['appearanceNotes',10000],['issueNotes',10000],['scrapReason',3000]])v[field]=textValue(input[field]??previous[field]??'',field,max);
  v.workDate=isoDate(input.workDate??previous.workDate??new Date().toISOString().slice(0,10));
  const outcome=input.outcome===undefined?previous.outcome:input.outcome;
  const definition=outcomes.find(o=>o.code===outcome);
  if(outcome!==null&&outcome!==undefined&&!definition)invalid('Invalid outcome');v.outcome=outcome??null;v.outcomeGroup=definition?.group??null;
  const codes=input.appearanceCodes??previous.appearanceCodes??[];
  if(!Array.isArray(codes)||codes.length>100||codes.some(c=>typeof c!=='string')||new Set(codes).size!==codes.length)invalid('Appearance selections are invalid');
  if(codes.includes('no_defect')&&codes.length>1)invalid('Appearance no_defect is exclusive');
  v.appearanceSnapshot=codes.map(code=>{
    const old=previous.appearanceSnapshot?.find(a=>a.code===code);
    const option=old??catalog.appearanceOptions.find(a=>a.code===code&&a.active);if(!option)invalid('Invalid appearance option');return structuredClone(option);
  });v.appearanceCodes=[...codes];
  const known=new Set(v.modelSnapshot.checkItems.map(i=>i.code));
  const supplied=input.checks??(modelChanged?{}:previous.checks)??{};
  if(!supplied||typeof supplied!=='object'||Array.isArray(supplied)||Object.keys(supplied).some(k=>!['initial','final'].includes(k)))invalid('Invalid check stages');
  v.checks={initial:{}};
  // Older post-work results are archival evidence, never a second editable inspection.
  if(previous.checks?.final)v.checks.final=structuredClone(previous.checks.final);
  for(const stage of ['initial']){
    const stageInput=supplied[stage]??{};
    if(typeof stageInput!=='object'||!stageInput||Array.isArray(stageInput)||Object.keys(stageInput).some(k=>!known.has(k)))invalid('Unknown check code');
    for(const code of known){const state=stageInput[code]??'not_tested';if(!['not_tested','pass','fail'].includes(state))invalid('Invalid check state');v.checks[stage][code]=state;}
  }
  const materials=input.materials??(modelChanged?[]:previous.materials)??[];
  if(!Array.isArray(materials)||materials.length>5000)invalid('Materials are invalid');
  const used=new Set();
  v.materials=materials.map(item=>{
    if(!item||typeof item!=='object')invalid('BOM item is invalid');const id=positiveId(item.bomId,'BOM ID');
    if(used.has(id))invalid('Duplicate BOM material');used.add(id);
    const old=!modelChanged&&previous.materials?.find(m=>m.bomId===id);
    const bom=old??catalog.bom.find(b=>b.id===id&&b.modelId===v.modelId&&b.active);if(!bom)invalid('Material is outside the model BOM');
    const quantity=item.quantity===undefined?1:item.quantity;
    if(typeof quantity!=='number'||!Number.isFinite(quantity)||quantity<=0||quantity>1000000||!/^\d+(?:\.\d{1,3})?$/.test(String(quantity)))invalid('Material quantity must be > 0, at most 1,000,000 and have at most three decimals');
    return {bomId:id,sku:bom.sku,descriptionEn:bom.descriptionEn,descriptionZh:bom.descriptionZh,unit:bom.unit,quantity};
  });
  const action=input.action??'save';if(!['save','complete'].includes(action))invalid('Invalid action');
  if(action==='complete'){
    if(!definition||definition.group==='wfr')invalid('A final eligible outcome is required; waiting outcomes cannot complete');
    if(definition.group==='refurbishment'&&!Object.values(v.checks.initial).every(s=>s==='pass'))invalid('All inspection results must pass for refurbishment');
    const unchangedLegacyRepair=previous.status==='completed'&&previous.outcome==='rok'&&previous.checks?.final&&!modelChanged&&[...known].every(code=>v.checks.initial[code]===previous.checks?.initial?.[code]);
    if(v.outcome==='rok'&&!unchangedLegacyRepair&&!Object.values(v.checks.initial).every(s=>s==='pass'||s==='fail'))invalid('Complete the inspection for every function before ROK');
    if(v.outcome==='scrap'&&!v.scrapReason.trim())invalid('A scrap reason is required');
    v.status='completed';
  }else v.status=definition?.group==='wfr'?'wfr':'draft';
  return v;
}
