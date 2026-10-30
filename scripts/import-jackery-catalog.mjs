import {readFile,writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {openStore} from '../src/store.js';
import {importJackeryCatalog} from '../src/catalog-import.js';
import {applyModelSkuMapping} from '../src/model-sku.js';
import {applyE2000PlusAAvailability} from '../src/model-availability.js';
const root=fileURLToPath(new URL('..',import.meta.url));
const arg=name=>{const i=process.argv.indexOf(name);return i<0?undefined:process.argv[i+1];};
const dataDir=path.resolve(arg('--data-dir')??path.join(root,process.argv.includes('--demo')?'data-demo':'data'));
const source=path.resolve(arg('--source')??path.join(root,'catalogs','jackery-eu-20261030.json'));
const dataset=JSON.parse(await readFile(source,'utf8')),store=openStore(dataDir,process.argv.includes('--demo'));
try{
  const report=importJackeryCatalog(store,dataset,{deactivateSamples:true});
  const modelSkuUpdate=applyModelSkuMapping(store,JSON.parse(await readFile(path.join(root,'catalogs','jackery-model-sku-20261030.json'),'utf8')));
  const availabilityUpdate=applyE2000PlusAAvailability(store);
  if(arg('--report')){const target=path.resolve(arg('--report'));await mkdir(path.dirname(target),{recursive:true});await writeFile(target,JSON.stringify(report,null,2)+'\n');}
  console.log(JSON.stringify({...report,modelSkuUpdate,availabilityUpdate},null,2));
}finally{store.db.close();}
