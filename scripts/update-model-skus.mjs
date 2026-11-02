import {readFile,writeFile} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {openStore} from '../src/store.js';
import {applyModelSkuMapping} from '../src/model-sku.js';
const root=fileURLToPath(new URL('..',import.meta.url));
const arg=name=>{const i=process.argv.indexOf(name);return i<0?undefined:process.argv[i+1];};
if(!arg('--data-dir'))throw new Error('Explicit existing --data-dir is required');
const dataDir=path.resolve(arg('--data-dir'));
if(!existsSync(path.join(dataDir,'huabao.sqlite')))throw new Error('Existing database required; refusing to initialize a new directory');
const source=path.resolve(arg('--source')??path.join(root,'catalogs','jackery-model-sku-20261102.json'));
const dataset=JSON.parse(await readFile(source,'utf8')),store=openStore(dataDir,process.argv.includes('--demo'));
try{const report=applyModelSkuMapping(store,dataset);if(arg('--report'))await writeFile(path.resolve(arg('--report')),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));}finally{store.db.close();}
