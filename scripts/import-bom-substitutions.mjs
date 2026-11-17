import {readFileSync} from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {openStore} from '../src/store.js';
import {groupMembers,substitutionKey} from '../src/bom-substitutions.js';

const translatedName={
  '逆变器':'Inverter','双向逆变器':'Bidirectional Inverter','主板-PCBA':'Mainboard PCBA',
  '车充线':'Car Charging Cable','UN箱':'UN Box','彩盒':'Color Box',
  '泡棉内托上':'Upper Foam Insert','泡棉内托下':'Lower Foam Insert',
  '纸内托上':'Upper Paper Insert','纸内托下':'Lower Paper Insert',
  '彩盒信息标贴':'Color Box Information Label','后标贴':'Rear Label',
};

export function planBomSubstitutions(store,source){
  const catalog=store.catalog();
  const rowsBySku=new Map();
  for(const row of catalog.bom){
    if(!rowsBySku.has(row.sku))rowsBySku.set(row.sku,[]);
    rowsBySku.get(row.sku).push(row);
  }
  const master=new Map(store.db.prepare('SELECT * FROM materials').all().map(x=>[x.sku,x]));
  const create=[],rename=[],insert=[],completeNames=[];
  for(const item of source.createMaterials){
    if(master.has(item.sku))continue;
    create.push(item);
    master.set(item.sku,{description_zh:item.descriptionZh,description_en:item.descriptionEn,unit:item.unit});
  }
  for(const item of source.renameMaterials){
    const row=master.get(item.sku);
    assert.ok(row,`Expected existing material ${item.sku}`);
    if(row.description_zh==='#N/A'||!row.description_zh){
      rename.push(item);
      master.set(item.sku,{...row,description_zh:item.descriptionZh,description_en:row.description_en||item.descriptionEn});
    }
  }
  const baseCount=new Set();
  for(const entry of source.models){
    const model=catalog.models.find(x=>x.catalogKey===entry.catalogKey);
    assert.ok(model?.productSku===entry.productSku,`Model or version mismatch: ${entry.sheet}`);
    const owned=new Map(catalog.bom.filter(b=>b.modelId===model.id).map(b=>[b.sku,b]));
    for(const group of entry.groups){
      for(const sku of group.originals){
        assert.ok(owned.has(sku)&&!owned.get(sku).substituteOnly,`Missing original ${entry.sheet} / ${sku}`);
        baseCount.add(model.id+':'+sku);
      }
      for(const sku of groupMembers(group)){
        const existing=owned.get(sku);
        if(existing){
          const name=translatedName[existing.descriptionZh];
          if(existing.substituteOnly&&!existing.descriptionEn&&name)completeNames.push({...existing,descriptionEn:name});
          continue;
        }
        const match=rowsBySku.get(sku)?.find(x=>!x.substituteOnly);
        const item=master.get(sku);
        assert.ok(match||item,`Missing substitute ${entry.sheet} / ${sku}`);
        const descriptionZh=item?.description_zh&&item.description_zh!=='#N/A'?item.description_zh:match?.descriptionZh;
        assert.ok(descriptionZh,`Missing substitute name ${sku}`);
        const row={modelId:model.id,sku,active:true,substituteOnly:true,descriptionZh,
          descriptionEn:item?.description_en||match?.descriptionEn||translatedName[descriptionZh]||'',unit:item?.unit||match?.unit||'Pcs',
          standardQty:group.kits?1:group.cap,quantityControl:'standard_hard_cap',category:owned.get(group.id).category};
        insert.push(row);
        owned.set(sku,row);
      }
    }
    for(const option of entry.relationships)assert.ok(owned.has(option.originalSku)&&owned.has(option.sku),`Unresolved relationship ${entry.sheet} / ${option.sourceRow}`);
  }
  return {create,rename,insert,completeNames,summary:{batch:source.batchId,models:source.models.length,originalRows:baseCount.size,
    level1:source.models.flatMap(m=>m.relationships).filter(r=>r.level===1).length,
    level2:source.models.flatMap(m=>m.relationships).filter(r=>r.level===2).length,
    createMaterials:create.length,renameMaterials:rename.length,addBomOptions:insert.length,completeBomNames:completeNames.length}};
}

export function applyBomSubstitutions(store,source,apply=false){
  const run=()=>{
    const {create,rename,insert,completeNames,summary}=planBomSubstitutions(store,source);
    if(apply){
      const newMaterial=store.db.prepare('INSERT INTO materials(sku,description_zh,description_en,unit,active) VALUES(?,?,?,?,1)');
      const name=store.db.prepare("UPDATE materials SET description_zh=?,description_en=CASE WHEN description_en IS NULL OR description_en='' THEN ? ELSE description_en END WHERE sku=?");
      for(const item of create)newMaterial.run(item.sku,item.descriptionZh,item.descriptionEn,item.unit);
      for(const item of rename)name.run(item.descriptionZh,item.descriptionEn,item.sku);
      for(const item of insert)store.put('bom',{id:store.next('bom'),...item});
      for(const item of completeNames)store.put('bom',item);
      const json=JSON.stringify(source);
      if(store.db.prepare('SELECT value FROM meta WHERE key=?').get(substitutionKey)?.value!==json)
        store.db.prepare('INSERT INTO meta(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(substitutionKey,json);
    }
    return {...summary,applied:apply};
  };
  return apply?store.tx(run):run();
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const [dataDir,mode]=process.argv.slice(2);
  if(!dataDir||!['--preview','--apply'].includes(mode))throw new Error('Usage: node scripts/import-bom-substitutions.mjs LOCAL_DEMO_DATA_DIR --preview|--apply');
  const store=openStore(path.resolve(dataDir),true);
  try{
    const source=JSON.parse(readFileSync(new URL('../catalogs/jackery-bom-substitutions.json',import.meta.url),'utf8'));
    console.log(JSON.stringify(applyBomSubstitutions(store,source,mode==='--apply'),null,2));
  }finally{store.db.close();}
}

