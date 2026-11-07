import {createHash} from 'node:crypto';
import {ApiError,invalid,textValue} from './domain.js';
import {parseCsvRecords} from './csv.js';
import {translateBom} from './bom-translations.js';
import {buildWorkbook} from './xlsx.js';

export function materialIndex(store){
  const parts=new Map();
  for(const sku of store.db.prepare('SELECT sku FROM inventory').all().map(row=>row.sku)){
    parts.set(sku,{sku,descriptionZh:'',descriptionEn:'',unit:'',active:true,source:'inventory'});
  }
  const activeBom=new Set();
  for(const item of store.all('bom')){
    if(parts.get(item.sku)?.source!=='bom'||item.active&&!activeBom.has(item.sku)){
      parts.set(item.sku,{...item,active:true,source:'bom'});
    }
    if(item.active)activeBom.add(item.sku);
  }
  for(const row of store.db.prepare('SELECT * FROM materials').all()){
    const existing=parts.get(row.sku);
    parts.set(row.sku,{
      ...existing,sku:row.sku,descriptionZh:row.description_zh??existing?.descriptionZh??'',
      descriptionEn:row.description_en??existing?.descriptionEn??'',unit:row.unit??existing?.unit??'',
      active:Boolean(row.active),source:row.description_zh===null?(existing?.source??'inventory'):'registered',
    });
  }
  return parts;
}

export function disabledMaterials(store){
  return new Set(store.db.prepare('SELECT sku FROM materials WHERE active=0').all().map(row=>row.sku));
}

export function materialList(store,{q='',status='all'}={},translations={}){
  const search=textValue(q,'Search',200).trim().toLowerCase();
  if(!['all','active','inactive'].includes(status))invalid('Invalid material status');
  return [...materialIndex(store).values()].map(item=>translateBom(item,translations))
    .filter(item=>(status==='all'||item.active===(status==='active'))
      &&[item.sku,item.descriptionZh,item.descriptionEn].some(value=>(value??'').toLowerCase().includes(search)))
    .sort((a,b)=>a.sku.localeCompare(b.sku))
    .map(({sku,descriptionZh,descriptionEn,unit,active,source})=>({sku,descriptionZh,descriptionEn,unit,active,source}));
}

const columns=[
  {key:'sku',width:26},{key:'descriptionZh',width:38},{key:'descriptionEn',width:38},{key:'unit',width:14},
];

export function materialTemplate(){
  return buildWorkbook([{name:'Materials',columns,rows:[]}]);
}

export function previewMaterialImport(store,csv){
  let records;
  try{records=parseCsvRecords(csv);}catch(error){throw new ApiError(422,error.code??'CSV_INVALID',error.message,error.details);}
  const headers=records.shift()?.fields.map(x=>x.trim().toLowerCase())??[];
  const aliases=[
    ['sku','物料料号','料号'],
    ['descriptionzh','product name/产品名称','product name','产品名称','物料名称'],
    ['descriptionen','english name','英文名称'],
    ['unit','单位'],
  ];
  const indices=aliases.map(names=>headers.flatMap((name,i)=>names.includes(name)?[i]:[]));
  if(!indices[0].length||!indices[1].length||indices.some(matches=>matches.length>1)){
    invalid('Material list needs SKU and product name columns. Use the material template or an OMS export.');
  }
  if(!records.length)invalid('The material list is empty');
  const [skuColumn,nameColumn,enColumn,unitColumn]=indices.map(matches=>matches[0]);
  const parts=materialIndex(store),products=new Set(store.all('models').map(m=>m.productSku)),seen=new Set();
  const rows=[],errors=[];
  for(const {fields,row} of records){
    const sku=(fields[skuColumn]??'').trim();
    try{
      if(!/^[a-z0-9][a-z0-9._/-]{0,199}$/i.test(sku))invalid('Invalid material SKU');
      if(seen.has(sku))invalid('Duplicate Part SKU');
      seen.add(sku);
      const existing=parts.get(sku);
      const status=products.has(sku)?'product':existing?'existing':'new';
      const descriptionZh=textValue(fields[nameColumn]??'','Part Name',1000,status==='new').trim();
      const descriptionEn=textValue(fields[enColumn]??'','English name',1000).trim();
      const unit=textValue((fields[unitColumn]??'').trim()||'pcs','Unit',40,true);
      rows.push({row,sku,descriptionZh,descriptionEn,unit,status});
    }catch(error){errors.push({row,sku,message:error.message});}
  }
  if(errors.length)throw new ApiError(422,'MATERIAL_IMPORT_INVALID','Material list rejected',errors);
  return {rows,previewHash:createHash('sha256').update(JSON.stringify(rows)).digest('hex')};
}

export function commitMaterialImport(store,{csv,previewHash}){
  return store.tx(()=>{
    const plan=previewMaterialImport(store,csv);
    if(plan.previewHash!==previewHash)throw new ApiError(409,'MATERIAL_PREVIEW_STALE','Material list changed. Preview the file again.');
    const insert=store.db.prepare('INSERT INTO materials(sku,description_zh,description_en,unit,active) VALUES(?,?,?,?,1)');
    const pending=plan.rows.filter(item=>item.status==='new');
    for(const item of pending)insert.run(item.sku,item.descriptionZh,item.descriptionEn,item.unit);
    return {created:pending.length,skipped:plan.rows.length-pending.length};
  });
}

export function setMaterialActive(store,{sku,active}){
  sku=textValue(sku,'Part SKU',200,true).trim();
  if(typeof active!=='boolean')invalid('Invalid material status');
  return store.tx(()=>{
    if(!materialIndex(store).has(sku))throw new ApiError(404,'NOT_FOUND','Unknown Part SKU');
    store.db.prepare('INSERT INTO materials(sku,active) VALUES(?,?) ON CONFLICT(sku) DO UPDATE SET active=excluded.active').run(sku,Number(active));
    return {sku,active};
  });
}
