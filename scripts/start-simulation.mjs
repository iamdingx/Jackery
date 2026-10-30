import path from 'node:path';
import {mkdir,mkdtemp,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {readFileSync} from 'node:fs';
import {openStore} from '../src/store.js';
import {importJackeryCatalog} from '../src/catalog-import.js';
import {startServer} from '../server.js';

// This helper can only create a fresh, isolated local test database.
const root=fileURLToPath(new URL('..',import.meta.url));
await mkdir(path.join(root,'tests','.tmp'),{recursive:true});
const dataDir=await mkdtemp(path.join(root,'tests','.tmp','batch-simulation-'));
const catalogPath=path.join(root,'catalogs','jackery-eu-20261030.json'),s=openStore(dataDir,true);
const report=importJackeryCatalog(s,JSON.parse(readFileSync(catalogPath,'utf8')),{deactivateSamples:true});
const model=s.all('models').find(m=>m.catalogKey==='e2000v2-costdown'),knowledge=s.get('model_knowledge',model.id);
const sentinel='原文 <tag>& "quote" | \\ line\n第二行';
knowledge.faultCodes.find(f=>f.code==='F0').descriptionZh+='\n'+sentinel;s.put('model_knowledge',knowledge);s.db.close();
const app=await startServer({dataDir,demo:true,port:0,host:'127.0.0.1',catalogPath});
const info={baseUrl:app.baseUrl,dataDir,fixtureOnly:true,realWorkDatabaseUntouched:true,faultFixture:{catalogKey:model.catalogKey,code:'F0',sentinel},sourceCounts:{models:report.models,activeMaterials:report.activeMaterials,heldMaterials:report.heldMaterials}};
await mkdir(path.join(root,'artifacts','batch-simulation'),{recursive:true});
await writeFile(path.join(root,'artifacts','batch-simulation','environment.json'),JSON.stringify(info,null,2)+'\n');
console.log(JSON.stringify(info));
process.once('SIGINT',async()=>{await app.close();process.exit(0);});
process.once('SIGTERM',async()=>{await app.close();process.exit(0);});
