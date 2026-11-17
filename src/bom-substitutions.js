import {ApiError} from './domain.js';

export const substitutionKey='approved-bom-substitutions';
const fail=(code,message,details)=>{throw new ApiError(422,code,message,details);};

export function modelSubstitutionGroups(store,modelId){
  const config=store.get('models',modelId)?.catalogKey;
  const entry=store.db.prepare('SELECT value FROM meta WHERE key=?').get(substitutionKey);
  return entry?JSON.parse(entry.value).models.find(m=>m.catalogKey===config)?.groups??[]:[];
}

export function groupMembers(group){
  return new Set([...group.originals,...group.options.map(x=>x.sku),...(group.kits??[]).flatMap(x=>x.skus)]);
}

export function validateSubstitutionUsage(materials,previous,{groups,stock,blocked=new Set()}){
  const groupBySku=new Map(groups.flatMap(group=>[...groupMembers(group)].map(sku=>[sku,group])));
  const before=new Map(previous.map(row=>[row.sku,row]));
  const used=new Map(materials.map(row=>[row.sku,row]));
  const changedGroups=new Set();
  for(const [sku,group] of groupBySku){
    const old=before.get(sku),next=used.get(sku);
    if((old?.quantity??0)!==(next?.quantity??0)||
      (next?.substitution?.kitId??old?.substitution?.kitId)!==old?.substitution?.kitId)
      changedGroups.add(group.id);
  }
  for(const group of groups){
    if(!changedGroups.has(group.id))continue;
    const rows=[...groupMembers(group)].flatMap(sku=>used.has(sku)?[used.get(sku)]:[]);
    const total=rows.reduce((sum,row)=>sum+row.quantity,0);
    if(rows.some(row=>!Number.isInteger(row.quantity)))fail('BOM_GROUP_LIMIT','Enter a whole-piece quantity.',{groupId:group.id});
    if(group.cap!=null&&total>group.cap)
      fail('BOM_GROUP_LIMIT','Quantity exceeds the shared BOM group maximum.',{groupId:group.id,maximum:group.cap,quantity:total});
    for(const row of rows){
      const cap=group.individualCaps?.[row.sku];
      if(cap!=null&&row.quantity>cap)fail('BOM_GROUP_LIMIT','Quantity exceeds the BOM item maximum.',{sku:row.sku,maximum:cap,quantity:row.quantity});
    }
    const kitRows=group.kits?rows.filter(row=>!group.originals.includes(row.sku)):[];
    if(kitRows.length){
      const requested=kitRows[0].substitution?.kitId??before.get(kitRows[0].sku)?.substitution?.kitId;
      const kit=group.kits.find(x=>x.id===requested);
      const valid=kit&&rows.length===kit.skus.length&&rows.every(row=>
        kit.skus.includes(row.sku)&&row.quantity===1&&(row.substitution?.kitId??before.get(row.sku)?.substitution?.kitId)===kit.id);
      if(!valid)fail('BOM_SUBSTITUTE_KIT','Select every part of the same packaging kit.',{groupId:group.id});
    }
  }
  return materials.map(row=>{
    const {substitution:request,substituteOnly,...item}=row;
    const old=before.get(row.sku);
    const group=groupBySku.get(row.sku);
    if(!group){
      if(request&&!old?.substitution||substituteOnly&&row.quantity>(old?.quantity??0))
        fail('BOM_SUBSTITUTE_INVALID','This substitute is outside the model BOM rules.',{sku:row.sku});
      return old?.substitution?{...item,substitution:old.substitution}:item;
    }
    if(request?.groupId&&request.groupId!==group.id)
      fail('BOM_SUBSTITUTE_INVALID','This substitute is outside the selected BOM group.',{sku:row.sku});
    if(row.quantity>(old?.quantity??0)&&blocked.has(row.sku))
      fail('MATERIAL_INACTIVE','Part SKU is inactive.',{sku:row.sku});
    const option=group.options.find(x=>x.sku===row.sku);
    if(option?.gateSku&&(stock.get(option.gateSku)??0)>0&&row.quantity>(old?.quantity??0))
      fail('BOM_SUBSTITUTE_STOCK','Second-level substitute requires first-level stock of zero or below.',{sku:row.sku,gateSku:option.gateSku,stock:stock.get(option.gateSku)});
    if(!changedGroups.has(group.id))return old?.substitution?{...item,substitution:old.substitution}:item;
    const kit=group.kits?.find(x=>x.id===(request?.kitId??old?.substitution?.kitId)&&x.skus.includes(row.sku));
    const kitPart=kit?.parts?.find(x=>x.sku===row.sku);
    const limits=group.cap==null?{}:{groupCap:group.cap};
    const substitution=kit
      ?{groupId:group.id,level:1,originalSku:kitPart?.originalSku??group.id,kitId:kit.id}
      :{groupId:group.id,level:option?.level??0,originalSku:option?.originalSku??row.sku,...limits};
    return {...item,substitution};
  });
}

export function substitutionSelection(bom,groups,stock,disabled){
  const bySku=new Map(bom.map(item=>[item.sku,item]));
  function part(sku,fields={}){
    const row=bySku.get(sku);
    return {...row,...fields,stockQuantity:stock.get(sku)??0,selectable:row.active&&!disabled.has(sku)};
  }
  const nested=new Map();
  const hidden=new Set();
  for(const group of groups){
    const anchor=bySku.get(group.id);
    if(!anchor)continue;
    const alternatives=new Set(group.options.map(x=>x.sku));
    const primary=group.originals.filter(sku=>!alternatives.has(sku)).map(sku=>part(sku,{level:0,originalSku:sku}));
    const options=group.options.map(option=>{
      const result=part(option.sku,option);
      if(option.gateSku&&(stock.get(option.gateSku)??0)>0){
        result.blockedByStock=true;
        result.selectable=false;
      }
      return result;
    });
    const kits=group.kits?.map(kit=>({...kit,items:kit.parts.map(x=>part(x.sku,{...x,level:1,kitId:kit.id}))}));
    for(const sku of groupMembers(group))if(sku!==anchor.sku)hidden.add(sku);
    nested.set(anchor.sku,{...anchor,substitutionGroup:{id:group.id,cap:group.cap,label:group.label,individualCaps:group.individualCaps,items:[...primary,...options],kits}});
  }
  return bom.filter(row=>nested.has(row.sku)||(!hidden.has(row.sku)&&row.active&&!row.substituteOnly&&!disabled.has(row.sku)))
    .map(row=>nested.get(row.sku)??part(row.sku));
}

