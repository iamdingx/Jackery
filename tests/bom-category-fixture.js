import {mkdir,mkdtemp} from 'node:fs/promises';
import path from 'node:path';
import {openStore} from '../src/store.js';

// Categories are fictional fixtures, never source-BOM classifications.
export async function categoryData(classified=true){
 await mkdir('tests/.tmp',{recursive:true});const dataDir=await mkdtemp(path.resolve('tests/.tmp/bom-category-')),store=openStore(dataDir,true);
 store.db.exec('DELETE FROM bom');
 const rows=[];let id=1;
 for(const [category,prefix,count] of [['core','CORE',56],['non_core','NON',3],['packaging','PACK',3],[null,'LEGACY',2]])for(let n=1;n<=count;n++){
  const item={id:id++,modelId:1,sku:`TEST-${prefix}-${String(n).padStart(3,'0')}`,descriptionEn:`Test ${prefix} component ${n}`,descriptionZh:`测试${prefix}物料 ${n}`,unit:'pcs',active:true,standardQty:4,quantityControl:'standard_hard_cap',...(category&&classified?{category}:{})};store.put('bom',item);rows.push(item);
 }
 store.put('bom',{...rows[0],id:id++,sku:'TEST-HELD',active:false});store.put('bom',{...rows[0],id,modelId:2,sku:'TEST-OTHER-MODEL'});
 const original=store.db.prepare('SELECT data FROM bom ORDER BY id').all().map(x=>x.data);store.db.close();return {dataDir,rows,original};
}
