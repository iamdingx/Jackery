import {existsSync,readFileSync} from 'node:fs';
import path from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {openStore} from '../src/store.js';
import {planClassifiedBom,applyClassifiedBom} from '../src/classified-bom.js';

const arg=name=>process.argv.includes(name)?process.argv[process.argv.indexOf(name)+1]:undefined;
const directory=arg('--data-dir'),file=arg('--batch'),expected=arg('--apply');
if(!directory||!file||!existsSync(path.join(directory,'huabao.sqlite'))||(process.argv.includes('--apply')&&!/^[a-f0-9]{64}$/.test(expected??'')))throw new Error('Supply an existing --data-dir, --batch and, to write, --apply PREVIEW_HASH');
const batch=JSON.parse(readFileSync(file,'utf8'));
const store=expected?openStore(directory,process.argv.includes('--demo')):{db:new DatabaseSync(path.join(directory,'huabao.sqlite'),{readOnly:true}),all(table){return this.db.prepare(`SELECT data FROM ${table}`).all().map(row=>JSON.parse(row.data));}};
try{
 const result=expected?applyClassifiedBom(store,batch,expected):planClassifiedBom(store,batch).report;
 console.log(JSON.stringify(result));
}finally{store.db.close()}
