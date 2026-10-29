import {DatabaseSync} from 'node:sqlite';
import {mkdirSync,writeFileSync,existsSync,chmodSync} from 'node:fs';
import path from 'node:path';
import {randomBytes,scryptSync,timingSafeEqual,createHash} from 'node:crypto';
import {ApiError} from './domain.js';

export const hashToken=token=>createHash('sha256').update(token).digest('hex');
export function passwordHash(password){const salt=randomBytes(16).toString('hex');return `${salt}:${scryptSync(password,salt,64).toString('hex')}`;}
export function passwordMatches(password,stored){try{const [salt,hash]=stored.split(':');const actual=scryptSync(password,salt,64);const expected=Buffer.from(hash,'hex');return expected.length===actual.length&&timingSafeEqual(actual,expected);}catch{return false;}}
export const userDto=row=>({id:row.id,username:row.username,displayName:row.display_name,role:row.role,active:Boolean(row.active)});
export function openStore(dataDir,demo){
  mkdirSync(dataDir,{recursive:true});mkdirSync(path.join(dataDir,'photos'),{recursive:true});
  const db=new DatabaseSync(path.join(dataDir,'huabao.sqlite'));
  db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;
    CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY,value TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY,username TEXT NOT NULL UNIQUE,display_name TEXT NOT NULL,role TEXT NOT NULL,active INTEGER NOT NULL DEFAULT 1,password_hash TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS sessions (token_hash TEXT PRIMARY KEY,user_id INTEGER NOT NULL REFERENCES users(id),csrf TEXT NOT NULL,expires_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS models (id INTEGER PRIMARY KEY,data TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS appearance (code TEXT PRIMARY KEY,data TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS bom (id INTEGER PRIMARY KEY,model_id INTEGER NOT NULL REFERENCES models(id),sku TEXT NOT NULL,data TEXT NOT NULL,UNIQUE(model_id,sku));
    CREATE TABLE IF NOT EXISTS records (id INTEGER PRIMARY KEY,data TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS photos (id TEXT PRIMARY KEY,record_id INTEGER NOT NULL REFERENCES records(id),data TEXT NOT NULL,physical_name TEXT NOT NULL,removed INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE IF NOT EXISTS audits (id INTEGER PRIMARY KEY,record_id INTEGER NOT NULL REFERENCES records(id),data TEXT NOT NULL);
  `);
  const mode=db.prepare("SELECT value FROM meta WHERE key='mode'").get();
  if(mode&&mode.value!==(demo?'demo':'production')){db.close();throw new Error('Data directory mode mismatch: use separate demo and production directories');}
  const tx=fn=>{db.exec('BEGIN IMMEDIATE');try{const result=fn();db.exec('COMMIT');return result;}catch(e){db.exec('ROLLBACK');throw e;}};
  const get=(table,id)=>{const row=db.prepare(`SELECT data FROM ${table} WHERE ${table==='appearance'?'code':'id'}=?`).get(id);return row?JSON.parse(row.data):null;};
  const all=table=>db.prepare(`SELECT data FROM ${table}`).all().map(r=>JSON.parse(r.data));
  const put=(table,obj)=>{if(table==='appearance')db.prepare('INSERT INTO appearance(code,data) VALUES(?,?) ON CONFLICT(code) DO UPDATE SET data=excluded.data').run(obj.code,JSON.stringify(obj));else if(table==='bom')db.prepare('INSERT INTO bom(id,model_id,sku,data) VALUES(?,?,?,?) ON CONFLICT(id) DO UPDATE SET model_id=excluded.model_id,sku=excluded.sku,data=excluded.data').run(obj.id,obj.modelId,obj.sku,JSON.stringify(obj));else db.prepare(`INSERT INTO ${table}(id,data) VALUES(?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data`).run(obj.id,JSON.stringify(obj));};
  const next=table=>Number(db.prepare(`SELECT COALESCE(MAX(id),0)+1 AS id FROM ${table}`).get().id);
  if(!mode){
    tx(()=>{
      db.prepare('INSERT INTO meta(key,value) VALUES(?,?)').run('mode',demo?'demo':'production');
      const add=(username,name,role,password)=>db.prepare('INSERT INTO users(username,display_name,role,password_hash) VALUES(?,?,?,?)').run(username,name,role,passwordHash(password));
      if(demo){
        add('admin','Demo Admin','admin','HuabaoAdmin!2026');add('alex','Alex Operator','operator','HuabaoAlex!2026');add('blair','Blair Operator','operator','HuabaoBlair!2026');
        const checkItems=[{code:'ac_output',labelEn:'AC Output',labelZh:'交流输出'},{code:'dc_output',labelEn:'DC Output',labelZh:'直流输出'},{code:'charging',labelEn:'Charging',labelZh:'充电'}];
        for(const id of [1,2])put('models',{id,nameEn:`Sample Model ${id===1?'A':'B'}`,nameZh:`演示型号${id===1?'甲':'乙'}`,productSku:`DEMO-PRODUCT-${id}`,active:true,checkItems:structuredClone(checkItems)});
        for(const [code,labelEn,labelZh] of [['no_defect','No Defect','无缺陷'],['scratches','Scratches','划痕'],['cracks','Cracks','裂纹'],['dents','Dents','凹痕']])put('appearance',{code,labelEn,labelZh,active:true});
        for(let id=1;id<=820;id++)put('bom',{id,modelId:1,sku:`DEMO-A-${String(id).padStart(4,'0')}`,descriptionEn:id===1?'DEMO Packing Box':`DEMO Component ${String(id).padStart(4,'0')}`,descriptionZh:id===1?'演示包材纸箱':`演示配件 ${id}`,unit:'pc',active:true});
        put('bom',{id:821,modelId:2,sku:'DEMO-B-0001',descriptionEn:'DEMO Model B Part',descriptionZh:'演示乙型配件',unit:'pc',active:true});
        const now=new Date().toISOString(),workDate=now.slice(0,10);
        for(const [id,sn,ownerId,ownerName,status,outcome] of [[1,'DEMO-HISTORY-001',3,'Blair Operator','completed','rok'],[2,'DEMO-WFR-001',2,'Alex Operator','wfr','awp']]){
          const checked=Object.fromEntries(checkItems.map(i=>[i.code,status==='completed'?'pass':'not_tested']));
          put('records',{id,workOrder:`HB-${workDate.replaceAll('-','')}-${String(id).padStart(6,'0')}`,sn,modelId:1,modelSnapshot:get('models',1),productSku:'DEMO-PRODUCT-1',ownerId,ownerName,sourcePallet:'',storagePallet:'',workDate,status,outcome,outcomeGroup:status==='completed'?'repair':'wfr',appearanceCodes:[],appearanceSnapshot:[],appearanceNotes:'',issueNotes:'Fictitious demonstration record / 虚构演示记录',scrapReason:'',checks:{initial:structuredClone(checked),final:structuredClone(checked)},materials:[],photos:[],version:1,createdAt:now,updatedAt:now,completedAt:status==='completed'?now:null});
        }
      }else{
        const password=randomBytes(24).toString('base64url');add('admin','Administrator','admin',password);
        const credentialsPath=path.join(dataDir,'first-run-accounts.json');
        if(existsSync(credentialsPath))throw new Error('First-run credentials file already exists in uninitialized data directory');
        writeFileSync(credentialsPath,JSON.stringify({admin:{username:'admin',password},note:'Change this password after first login. Protect this file and the data directory.'},null,2)+'\n',{flag:'wx',mode:0o600});chmodSync(credentialsPath,0o600);
      }
    });
  }
  const catalog=()=>({models:all('models'),appearanceOptions:all('appearance'),bom:all('bom')});
  const record=id=>{const r=get('records',id);if(!r)throw new ApiError(404,'NOT_FOUND','Record not found');r.photos=db.prepare('SELECT data FROM photos WHERE record_id=? AND removed=0 ORDER BY rowid').all(id).map(p=>JSON.parse(p.data));return r;};
  const audit=(recordId,action,actor,reason,before,after)=>{const id=next('audits');db.prepare('INSERT INTO audits(id,record_id,data) VALUES(?,?,?)').run(id,recordId,JSON.stringify({id,recordId,action,actorId:actor.id,actorName:actor.displayName,reason:reason??'',before,after,createdAt:new Date().toISOString()}));};
  return {db,tx,get,all,put,next,catalog,record,audit,dataDir};
}
