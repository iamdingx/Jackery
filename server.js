import http from 'node:http';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {existsSync} from 'node:fs';
import {readFile,writeFile,unlink} from 'node:fs/promises';
import {randomBytes,timingSafeEqual} from 'node:crypto';
import {openStore,passwordHash,passwordMatches,hashToken,userDto} from './src/store.js';
import {ApiError,invalid,outcomes,textValue,isoDate,positiveId,validateModel,validateAppearance,validateBom,validateRecord} from './src/domain.js';
import {validateImage} from './src/images.js';
import {parseBomCsv} from './src/csv.js';
import {exportRecords} from './src/export.js';
import {listenForBrowser} from './src/ports.js';
import {importJackeryCatalog} from './src/catalog-import.js';

const root=path.dirname(fileURLToPath(import.meta.url));
const MAX_BODY=12*1024*1024;
const expireCookie='hb_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0';
const forbidden=(message='Access denied')=>{throw new ApiError(403,'FORBIDDEN',message);};
const absent=(message='Not found')=>{throw new ApiError(404,'NOT_FOUND',message);};
const isObject=value=>value&&typeof value==='object'&&!Array.isArray(value);
function same(a,b){if(typeof a!=='string'||typeof b!=='string')return false;const x=Buffer.from(a),y=Buffer.from(b);return x.length===y.length&&timingSafeEqual(x,y);}
function password(value){if(typeof value!=='string'||value.length<10||value.length>128)invalid('Password must contain 10–128 characters');return value;}
function version(input,current){if(!Number.isSafeInteger(input)||input!==current.version)throw new ApiError(409,'VERSION_CONFLICT','Record changed; reload before saving',{currentVersion:current.version});}
function readAllowed(user,record,exactSn){if(user.role==='admin'||record.ownerId===user.id)return;if(typeof exactSn==='string'&&exactSn.trim()&&exactSn.trim()===record.sn)return;forbidden('This record is visible only to its owner or through exact-SN history');}
function pagination(params,defaultSize){const page=Number(params.get('page')??1),pageSize=Number(params.get('pageSize')??defaultSize);if(!Number.isSafeInteger(page)||page<1||!Number.isSafeInteger(pageSize)||pageSize<1||pageSize>100)invalid('Invalid pagination; page size must be 1–100');return {page,pageSize};}
function filteredRecords(store,user,params){
  if(user.role!=='admin'&&params.has('ownerId'))forbidden('Owner filtering is administrator only');
  const status=params.get('status');if(status&&!['draft','wfr','completed'].includes(status))invalid('Invalid status filter');
  const from=params.get('from'),to=params.get('to');if(from)isoDate(from);if(to)isoDate(to);if(from&&to&&from>to)invalid('Date filter is reversed');
  const owner=params.get('ownerId'),model=params.get('modelId');if(owner)positiveId(Number(owner),'Owner ID');if(model)positiveId(Number(model),'Model ID');
  const q=params.get('q')??'';textValue(q,'Search',200);
  return store.all('records').filter(r=>(user.role==='admin'||r.ownerId===user.id)&&(!owner||r.ownerId===Number(owner))&&(!model||r.modelId===Number(model))&&(!status||r.status===status)&&(!from||r.workDate>=from)&&(!to||r.workDate<=to)&&(!q||r.sn.includes(q)||r.workOrder.includes(q))).sort((a,b)=>b.createdAt.localeCompare(a.createdAt)||b.id-a.id).map(r=>store.record(r.id));
}
async function body(req){
  if(!/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(req.headers['content-type']??''))throw new ApiError(400,'JSON_CONTENT_TYPE','Content-Type must be application/json');
  const length=Number(req.headers['content-length']??0);if(length>MAX_BODY)throw new ApiError(413,'PAYLOAD_TOO_LARGE','Request body exceeds 12 MiB');
  const parts=[];let bytes=0;
  for await(const chunk of req){bytes+=chunk.length;if(bytes>MAX_BODY)throw new ApiError(413,'PAYLOAD_TOO_LARGE','Request body exceeds 12 MiB');parts.push(chunk);}
  try{const result=JSON.parse(Buffer.concat(parts).toString('utf8')||'{}');if(!isObject(result))throw new Error();return result;}catch{throw new ApiError(400,'INVALID_JSON','Body must be a JSON object');}
}

export async function startServer({dataDir=path.join(root,'data'),demo=false,port=0,host='127.0.0.1',publicBaseUrl,catalogPath}={}){
  if(publicBaseUrl){const parsed=new URL(publicBaseUrl);if(!['http:','https:'].includes(parsed.protocol)||parsed.username||parsed.password||parsed.pathname!=='/'||parsed.search||parsed.hash)throw new Error('PUBLIC_BASE_URL must be an HTTP(S) origin');publicBaseUrl=parsed.origin;}
  const store=openStore(path.resolve(dataDir),demo),{db}=store;
  if(catalogPath){try{importJackeryCatalog(store,JSON.parse(await readFile(path.resolve(catalogPath),'utf8')),{deactivateSamples:true});}catch(error){db.close();throw error;}}
  const throttles=new Map();
  const dummyHash=passwordHash(randomBytes(24).toString('hex'));
  function auth(req){
    const token=(req.headers.cookie??'').split(';').map(x=>x.trim()).find(x=>x.startsWith('hb_session='))?.slice(11);
    if(!token||!/^[a-f0-9]{64}$/.test(token))return null;
    const row=db.prepare('SELECT s.*,u.id,u.username,u.display_name,u.role,u.active,u.language FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=?').get(hashToken(token));
    if(!row||!row.active||row.expires_at<Date.now())return null;return {user:userDto(row),csrfToken:row.csrf,tokenHash:row.token_hash};
  }
  function sessionDto(session){return {user:session?.user??null,csrfToken:session?.csrfToken??null,demo};}
  function persistRecord(record,actor,action,reason,before){store.put('records',record);store.audit(record.id,action,actor,reason,before,record);return record;}
  const server=http.createServer(async(req,res)=>{
    const common={'X-Content-Type-Options':'nosniff','Referrer-Policy':'same-origin','X-Frame-Options':'DENY','Cache-Control':'no-store'};
    function send(status,data,headers={}){res.writeHead(status,{...common,'Content-Type':'application/json; charset=utf-8',...headers});res.end(Buffer.isBuffer(data)?data:JSON.stringify(data));}
    try{
      const url=new URL(req.url,'http://localhost'),route=url.pathname,params=url.searchParams,method=req.method;
      if(!route.startsWith('/api/')){
        if(method!=='GET'&&method!=='HEAD')absent();
        let relative;try{relative=decodeURIComponent(route);}catch{absent();}
        if(relative.includes('\0')||relative.includes('\\'))absent();
        if(relative==='/')relative='/index.html';
        const target=path.resolve(root,'public','.'+relative),publicDir=path.join(root,'public');
        if(!target.startsWith(publicDir+path.sep))absent();
        const ext=path.extname(target),types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.png':'image/png','.svg':'image/svg+xml','.ico':'image/x-icon','.json':'application/json; charset=utf-8'};
        if(!types[ext])absent();
        let bytes;try{bytes=await readFile(target);}catch{absent();}
        res.writeHead(200,{...common,'Content-Type':types[ext],'Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'"});res.end(method==='HEAD'?undefined:bytes);return;
      }
      if(method==='GET'&&route==='/api/health')return send(200,{ok:true,version:'1.0.0',demo});
      if(!['GET','HEAD'].includes(method)&&req.headers.origin){const expected=publicBaseUrl??`http://${req.headers.host}`;if(req.headers.origin!==expected)throw new ApiError(403,'CSRF','Request origin is not allowed');}
      const session=auth(req);
      if(method==='GET'&&route==='/api/session')return send(200,sessionDto(session));
      if(method==='POST'&&route==='/api/login'){
        const input=await body(req);
        if(typeof input.username!=='string'||typeof input.password!=='string'||input.username.length>80||input.password.length>128)throw new ApiError(401,'INVALID_LOGIN','Invalid username or password');
        const key=req.socket.remoteAddress+'|'+input.username;
        const now=Date.now(),limit=throttles.get(key);
        if(limit&&limit.until>now&&limit.count>=10)throw new ApiError(429,'LOGIN_THROTTLED','Too many login attempts; retry in 15 minutes');
        const user=db.prepare('SELECT * FROM users WHERE username=?').get(input.username);
        const valid=passwordMatches(input.password,user?.password_hash??dummyHash);
        if(!user||!user.active||!valid){if(throttles.size>2000)for(const [k,v] of throttles)if(v.until<now)throttles.delete(k);if(throttles.size>2000)throttles.delete(throttles.keys().next().value);throttles.set(key,{count:limit&&limit.until>now?limit.count+1:1,until:limit&&limit.until>now?limit.until:now+900000});throw new ApiError(401,'INVALID_LOGIN','Invalid username or password');}
        throttles.delete(key);if(session)db.prepare('DELETE FROM sessions WHERE token_hash=?').run(session.tokenHash);
        db.prepare('DELETE FROM sessions WHERE expires_at<?').run(now);
        const token=randomBytes(32).toString('hex'),csrfToken=randomBytes(32).toString('hex');
        db.prepare('INSERT INTO sessions(token_hash,user_id,csrf,expires_at) VALUES(?,?,?,?)').run(hashToken(token),user.id,csrfToken,now+24*3600000);
        return send(200,{user:userDto(user),csrfToken,demo},{'Set-Cookie':`hb_session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=86400${publicBaseUrl?.startsWith('https:')?'; Secure':''}`});
      }
      if(!session)throw new ApiError(401,'UNAUTHENTICATED','Please sign in');
      const user=session.user;
      if(!['GET','HEAD'].includes(method)){
        if(!same(req.headers['x-csrf-token'],session.csrfToken))throw new ApiError(403,'CSRF','Invalid CSRF token');
      }
      if(route.startsWith('/api/admin/')&&user.role!=='admin')forbidden('Administrator access required');
      if(method==='POST'&&route==='/api/logout'){db.prepare('DELETE FROM sessions WHERE token_hash=?').run(session.tokenHash);return send(200,{ok:true},{'Set-Cookie':expireCookie});}
      if(method==='PUT'&&route==='/api/account/language'){
        const input=await body(req);if(!['en','zh'].includes(input.language))invalid('Language must be en or zh');
        db.prepare('UPDATE users SET language=? WHERE id=?').run(input.language,user.id);
        return send(200,{user:userDto(db.prepare('SELECT * FROM users WHERE id=?').get(user.id))});
      }
      if(method==='POST'&&route==='/api/account/password'){
        const input=await body(req),row=db.prepare('SELECT * FROM users WHERE id=?').get(user.id);
        if(typeof input.currentPassword!=='string'||input.currentPassword.length>128||!passwordMatches(input.currentPassword,row.password_hash))throw new ApiError(403,'INVALID_PASSWORD','Current password is incorrect');
        const hash=passwordHash(password(input.newPassword));store.tx(()=>{db.prepare('UPDATE users SET password_hash=? WHERE id=?').run(hash,user.id);db.prepare('DELETE FROM sessions WHERE user_id=?').run(user.id);});return send(200,{ok:true},{'Set-Cookie':expireCookie});
      }
      if(method==='GET'&&route==='/api/catalog'){
        const inactive=params.get('includeInactive')==='1';if(inactive&&user.role!=='admin')forbidden();
        const c=store.catalog();return send(200,{models:c.models.filter(m=>inactive||m.active),appearanceOptions:c.appearanceOptions.filter(m=>inactive||m.active),outcomes});
      }
      let match=route.match(/^\/api\/models\/(\d+)\/knowledge$/);
      if(method==='GET'&&match){
        const id=Number(match[1]);if(!store.get('models',id))absent('Model not found');
        const knowledge=store.get('model_knowledge',id);return send(200,knowledge?{faultCodes:knowledge.faultCodes??[],repairGuides:knowledge.repairGuides??[],notices:knowledge.notices??[]}:{faultCodes:[],repairGuides:[],notices:[]});
      }
      match=route.match(/^\/api\/models\/(\d+)\/bom$/);
      if(method==='GET'&&match){
        const modelId=Number(match[1]);if(!store.get('models',modelId))absent('Model not found');
        const inactive=params.get('includeInactive')==='1';if(inactive&&user.role!=='admin')forbidden();
        const {page,pageSize}=pagination(params,50),q=params.get('q')??'';textValue(q,'Search',200);const lower=q.toLocaleLowerCase();
        const items=store.all('bom').filter(b=>b.modelId===modelId&&(inactive||b.active)&&(!q||[b.sku,b.descriptionEn,b.descriptionZh].some(value=>(value??'').toLocaleLowerCase().includes(lower)))).sort((a,b)=>Number(b.sku===q)-Number(a.sku===q)||a.sku.localeCompare(b.sku)).map(b=>({...b,missingEnglish:!b.descriptionEn?.trim()}));
        return send(200,{items:items.slice((page-1)*pageSize,page*pageSize),total:items.length,page,pageSize});
      }
      if(method==='GET'&&route==='/api/records'){const {page,pageSize}=pagination(params,20),items=filteredRecords(store,user,params);return send(200,{items:items.slice((page-1)*pageSize,page*pageSize),total:items.length,page,pageSize});}
      if(method==='GET'&&route==='/api/sn-history'){
        const sn=textValue(params.get('sn')??'','SN',200,true).trim();
        const items=store.all('records').filter(r=>r.sn===sn).sort((a,b)=>b.createdAt.localeCompare(a.createdAt)||b.id-a.id).map(r=>{const item=store.record(r.id);if(user.role!=='admin'&&item.ownerId!==user.id)item.photos=item.photos.map(p=>({...p,url:p.url+'?sn='+encodeURIComponent(sn)}));return item;});return send(200,{items});
      }
      if(method==='POST'&&route==='/api/records'){
        const input=await body(req);
        const record=store.tx(()=>{
          const model=store.get('models',positiveId(input.modelId,'Model ID'));if(!model?.active||!model.checkItems.length)invalid('Select an active model with a check list');
          const id=store.next('records'),now=new Date().toISOString();
          const validated=validateRecord({...input,outcome:null,appearanceCodes:[],checks:{},materials:[],action:'save'},{modelId:model.id,modelSnapshot:model,productSku:model.productSku},store.catalog());
          const r={...validated,id,workOrder:`HB-${now.slice(0,10).replaceAll('-','')}-${String(id).padStart(6,'0')}`,ownerId:user.id,ownerName:user.displayName,photos:[],version:1,createdAt:now,updatedAt:now,completedAt:null};return persistRecord(r,user,'create','',null);
        });return send(201,{record});
      }
      match=route.match(/^\/api\/records\/(\d+)(?:\/(audit|corrections|photos))?$/);
      if(match){
        const id=Number(match[1]),sub=match[2];
        if(method==='GET'&&!sub){const record=store.record(id);readAllowed(user,record,params.get('historySn'));if(record.ownerId!==user.id&&user.role!=='admin')record.photos=record.photos.map(p=>({...p,url:p.url+'?sn='+encodeURIComponent(record.sn)}));return send(200,{record});}
        if(method==='GET'&&sub==='audit'){const r=store.record(id);readAllowed(user,r,params.get('historySn'));return send(200,{items:store.all('audits').filter(a=>a.recordId===id).sort((a,b)=>b.id-a.id)});}
        if((method==='PUT'&&!sub)||(method==='POST'&&sub==='corrections')){
          const input=await body(req),correction=sub==='corrections';
          const record=store.tx(()=>{
            const before=store.record(id);
            if(correction){if(user.role!=='admin')forbidden();textValue(input.reason??'','Correction reason',2000,true);}else if(before.ownerId!==user.id||before.status==='completed')forbidden('Only the owner may edit an unfinished record; administrator corrections require a reason');
            version(input.version,before);
            const changes=correction?input.changes:input;if(!isObject(changes))invalid('Changes must be a record input');
            const after=validateRecord({...changes,...(correction&&before.status==='completed'?{action:'complete'}:{})},before,store.catalog());
            after.version=before.version+1;after.updatedAt=new Date().toISOString();after.completedAt=after.status==='completed'?(before.completedAt??after.updatedAt):null;
            return persistRecord(after,user,correction?'correction':after.status==='completed'?'complete':'save',correction?input.reason.trim():'',before);
          });return send(200,{record});
        }
        if(method==='POST'&&sub==='photos'){
          const input=await body(req);const before=store.record(id);const privileged=user.role==='admin'&&(before.ownerId!==user.id||before.status==='completed');
          if(privileged)textValue(input.reason??'','Photo correction reason',2000,true);else if(before.ownerId!==user.id||before.status==='completed')forbidden();
          version(input.version,before);if(before.photos.length>=20)invalid('Each record supports at most 20 photos');
          const filename=textValue(input.filename??'','Filename',255,true);if(/[\\/]/.test(filename))invalid('Filename must not contain a path');
          if(typeof input.contentBase64!=='string'||!input.contentBase64.length||input.contentBase64.length%4!==0||!/^[A-Za-z0-9+/]*={0,2}$/.test(input.contentBase64))invalid('Photo content must be valid base64');
          if(input.contentBase64.length>11184812)throw new ApiError(413,'IMAGE_TOO_LARGE','Photo exceeds 8 MiB');
          const bytes=Buffer.from(input.contentBase64,'base64');if(bytes.toString('base64')!==input.contentBase64)invalid('Photo content must be canonical base64');let info;try{info=validateImage(bytes);}catch(e){throw new ApiError(e.code==='IMAGE_TOO_LARGE'?413:422,e.code??'INVALID_IMAGE',e.message);}
          const photoId=randomBytes(16).toString('hex'),physicalName=photoId+'.'+info.extension;
          const photo={id:photoId,recordId:id,filename,mime:info.mime,size:bytes.length,width:info.width,height:info.height,url:`/api/photos/${photoId}`,uploadedAt:new Date().toISOString(),uploadedBy:user.id};
          const photoPath=path.join(store.dataDir,'photos',physicalName);await writeFile(photoPath,bytes,{flag:'wx',mode:0o600});
          let record;try{record=store.tx(()=>{const current=store.record(id);version(input.version,current);db.prepare('INSERT INTO photos(id,record_id,data,physical_name) VALUES(?,?,?,?)').run(photoId,id,JSON.stringify(photo),physicalName);const after={...current,photos:[...current.photos,photo],version:current.version+1,updatedAt:new Date().toISOString()};return persistRecord(after,user,'photo_add',input.reason??'',current);});}catch(e){await unlink(photoPath).catch(()=>{});throw e;}
          return send(201,{photo,record});
        }
      }
      match=route.match(/^\/api\/photos\/([a-f0-9]{32})$/);
      if(match){
        const row=db.prepare('SELECT * FROM photos WHERE id=? AND removed=0').get(match[1]);if(!row)absent('Photo not found');const current=store.record(row.record_id);
        if(method==='GET'){readAllowed(user,current,params.get('sn'));const p=JSON.parse(row.data),bytes=await readFile(path.join(store.dataDir,'photos',row.physical_name));return send(200,bytes,{'Content-Type':p.mime,'Cache-Control':'private, no-store','Content-Disposition':`inline; filename="photo${p.mime==='image/png'?'.png':'.jpg'}"`});}
        if(method==='DELETE'){
          const input=await body(req);const record=store.tx(()=>{
            const before=store.record(row.record_id);if(user.role==='admin'&&(before.ownerId!==user.id||before.status==='completed'))textValue(input.reason??'','Photo correction reason',2000,true);else if(before.ownerId!==user.id||before.status==='completed')forbidden();version(input.version,before);
            db.prepare('UPDATE photos SET removed=1 WHERE id=?').run(row.id);const after={...before,photos:before.photos.filter(p=>p.id!==row.id),version:before.version+1,updatedAt:new Date().toISOString()};return persistRecord(after,user,'photo_remove',input.reason??'',before);
          });return send(200,{record});
        }
      }
      if(method==='GET'&&route==='/api/export'){
        const language=params.get('language')??'en';if(!['en','zh'].includes(language))invalid('Language must be en or zh');
        const records=filteredRecords(store,user,params);const bytes=exportRecords(records,publicBaseUrl??baseUrl,language);return send(200,bytes,{'Content-Type':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','Content-Disposition':`attachment; filename="jackery-${new Date().toISOString().slice(0,10)}.xlsx"`});
      }
      if(method==='GET'&&route==='/api/admin/users')return send(200,{items:db.prepare('SELECT * FROM users ORDER BY id').all().map(userDto)});
      if(method==='POST'&&route==='/api/admin/users'){
        const input=await body(req),username=textValue(input.username??'','Username',80,true).trim();if(!/^[A-Za-z0-9_.-]+$/.test(username))invalid('Username allows letters, digits, underscore, dot and hyphen');
        const displayName=textValue(input.displayName??'','Display name',200,true).trim();if(!['admin','operator'].includes(input.role))invalid('Invalid role');
        const hash=passwordHash(password(input.password));if(db.prepare('SELECT id FROM users WHERE username=?').get(username))invalid('Username already exists');
        const result=db.prepare('INSERT INTO users(username,display_name,role,password_hash) VALUES(?,?,?,?)').run(username,displayName,input.role,hash);return send(201,{user:userDto(db.prepare('SELECT * FROM users WHERE id=?').get(Number(result.lastInsertRowid)))});
      }
      match=route.match(/^\/api\/admin\/users\/(\d+)(?:\/(password))?$/);
      if(match){
        const id=Number(match[1]),row=db.prepare('SELECT * FROM users WHERE id=?').get(id);if(!row)absent('User not found');
        if(method==='PUT'&&!match[2]){
          const input=await body(req),displayName=textValue(input.displayName??row.display_name,'Display name',200,true).trim(),role=input.role??row.role,active=input.active??Boolean(row.active);
          if(!['admin','operator'].includes(role)||typeof active!=='boolean')invalid('Invalid role or active state');
          store.tx(()=>{if(row.role==='admin'&&row.active&&(!active||role!=='admin')&&db.prepare("SELECT COUNT(*) AS n FROM users WHERE role='admin' AND active=1").get().n<=1)invalid('Cannot deactivate or demote the last active administrator');db.prepare('UPDATE users SET display_name=?,role=?,active=? WHERE id=?').run(displayName,role,active?1:0,id);if(!active||role!==row.role)db.prepare('DELETE FROM sessions WHERE user_id=?').run(id);});return send(200,{user:userDto(db.prepare('SELECT * FROM users WHERE id=?').get(id))});
        }
        if(method==='POST'&&match[2]){const input=await body(req),hash=passwordHash(password(input.password));store.tx(()=>{db.prepare('UPDATE users SET password_hash=? WHERE id=?').run(hash,id);db.prepare('DELETE FROM sessions WHERE user_id=?').run(id);});return send(200,{ok:true});}
      }
      match=route.match(/^\/api\/admin\/models(?:\/(\d+))?$/);
      if(match&&((method==='POST'&&!match[1])||(method==='PUT'&&match[1]))){
        const input=await body(req),id=match[1]?Number(match[1]):store.next('models');if(match[1]&&!store.get('models',id))absent('Model not found');const model=validateModel({...store.get('models',id),...input},id);store.put('models',model);return send(method==='POST'?201:200,{model});
      }
      match=route.match(/^\/api\/admin\/appearance(?:\/([A-Za-z0-9_-]+))?$/);
      if(match&&((method==='POST'&&!match[1])||(method==='PUT'&&match[1]))){
        const input=await body(req),option=validateAppearance(input,match[1]);if(method==='POST'&&store.get('appearance',option.code))invalid('Appearance code already exists');if(method==='PUT'&&!store.get('appearance',option.code))absent('Appearance option not found');store.put('appearance',option);return send(method==='POST'?201:200,{option});
      }
      if(method==='GET'&&route==='/api/admin/bom/template')return send(200,Buffer.from('\uFEFFsku,descriptionEn,descriptionZh,unit,standardQty\r\n'),{'Content-Type':'text/csv; charset=utf-8','Content-Disposition':'attachment; filename="bom-template.csv"'});
      if(method==='POST'&&route==='/api/admin/bom/import'){
        const input=await body(req),modelId=positiveId(input.modelId,'Model ID');if(!store.get('models',modelId))invalid('Model does not exist');let rows;try{rows=parseBomCsv(input.csv);}catch(e){throw new ApiError(e.code==='CSV_TOO_LARGE'?413:422,e.code??'INVALID_CSV',e.message,e.details);}
        const created=store.tx(()=>{
          const existing=new Set(store.all('bom').filter(b=>b.modelId===modelId).map(b=>b.sku)),seen=new Set(),errors=[],valid=[];
          for(let i=0;i<rows.length;i++){try{const item=validateBom({...rows[i],modelId},0,store.all('models'));if(existing.has(item.sku)||seen.has(item.sku))invalid('SKU duplicates an existing or imported item');seen.add(item.sku);valid.push(item);}catch(e){errors.push({row:rows[i].sourceRow??i+2,message:e.message});}}
          if(errors.length)invalid('BOM import rejected; no rows were written',errors);
          let id=store.next('bom');for(const item of valid)store.put('bom',{...item,id:id++});return valid.length;
        });return send(201,{created});
      }
      match=route.match(/^\/api\/admin\/bom(?:\/(\d+))?$/);
      if(match&&((method==='POST'&&!match[1])||(method==='PUT'&&match[1]))){
        const input=await body(req),id=match[1]?Number(match[1]):store.next('bom');if(match[1]&&!store.get('bom',id))absent('BOM item not found');const item=validateBom({...store.get('bom',id),...input},id,store.all('models'));if(store.all('bom').some(b=>b.modelId===item.modelId&&b.sku===item.sku&&b.id!==id))invalid('SKU already exists in this model');store.put('bom',item);return send(method==='POST'?201:200,{item});
      }
      absent('API route not found');
    }catch(e){
      if(res.headersSent){res.destroy();return;}
      if(e instanceof ApiError)return send(e.status,{error:{code:e.code,message:e.message,...(e.details===undefined?{}:{details:e.details})}});
      // Do not log request bodies, database values, credentials or session tokens.
      console.error('Request failed:',e?.code??e?.name??'Error');return send(500,{error:{code:'INTERNAL_ERROR',message:'An internal error occurred'}});
    }
  });
  server.requestTimeout=30000;server.headersTimeout=15000;
  try{await listenForBrowser(server,port,host);}catch(e){db.close();throw e;}
  const address=server.address(),baseUrl=`http://${host.includes(':')?'['+host+']':host}:${address.port}`;
  let closed=false;
  return {server,baseUrl,close:async()=>{if(closed)return;closed=true;await new Promise((resolve,reject)=>server.close(e=>e?reject(e):resolve()));db.close();}};
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const demo=process.argv.includes('--demo');
  const port=Number(process.env.PORT??4310);if(!Number.isInteger(port)||port<0||port>65535)throw new Error('PORT must be 0–65535');
  const catalogIndex=process.argv.indexOf('--catalog'),bundled=path.join(root,'catalogs','jackery-eu-20261030.json');
  const catalogPath=catalogIndex>=0?process.argv[catalogIndex+1]:(existsSync(bundled)?bundled:undefined);
  startServer({dataDir:process.env.JACKERY_DATA_DIR??process.env.HB_DATA_DIR??path.join(root,demo?'data-demo':'data'),demo,port,host:process.env.HOST??'127.0.0.1',publicBaseUrl:process.env.PUBLIC_BASE_URL,catalogPath}).then(app=>{
    console.log(`Jackery V1 ${demo?'TEST':'production'}: ${app.baseUrl}`);
    for(const signal of ['SIGINT','SIGTERM'])process.once(signal,()=>{app.close().then(()=>process.exit(0)).catch(()=>process.exit(1));});
  }).catch(e=>{console.error('Startup failed:',e.message);process.exitCode=1;});
}
