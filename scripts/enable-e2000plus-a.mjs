import {existsSync} from 'node:fs';
import {writeFile} from 'node:fs/promises';
import path from 'node:path';
import {openStore} from '../src/store.js';
import {applyE2000PlusAAvailability} from '../src/model-availability.js';
const arg=name=>{const i=process.argv.indexOf(name);return i<0?undefined:process.argv[i+1];};
if(!arg('--data-dir'))throw new Error('Explicit existing --data-dir required');
const dataDir=path.resolve(arg('--data-dir'));
if(!existsSync(path.join(dataDir,'huabao.sqlite')))throw new Error('Existing database required');
const store=openStore(dataDir,process.argv.includes('--demo'));
try{const report=applyE2000PlusAAvailability(store);if(arg('--report'))await writeFile(path.resolve(arg('--report')),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));}finally{store.db.close();}
