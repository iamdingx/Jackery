import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile,readdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {inflateRawSync} from 'node:zlib';

const nodeServer = () => import('../server.js').catch(() => ({}));
async function harness(t,demo=true) {
  const {startServer} = await nodeServer(); assert.equal(typeof startServer,'function','startServer is implemented');
  const dir=await mkdtemp(path.join(tmpdir(),'hb-api-'));
  let app=await startServer({dataDir:dir,demo});
  t.after(async()=>{await app.close();await rm(dir,{recursive:true,force:true});});
  function client(){let cookie='',csrf='';return {async req(route,method='GET',body,extra={}){const r=await fetch(app.baseUrl+route,{method,headers:{...(cookie?{Cookie:cookie}:{}),...(csrf?{'X-CSRF-Token':csrf}:{}),...(body?{'Content-Type':'application/json'}:{}),...extra},body:body?JSON.stringify(body):undefined});if(r.headers.get('set-cookie'))cookie=r.headers.get('set-cookie').split(';')[0];const bytes=Buffer.from(await r.arrayBuffer());let data;try{data=JSON.parse(bytes.toString());}catch{};if(data?.csrfToken)csrf=data.csrfToken;return {status:r.status,data,bytes,headers:r.headers};},async login(username,password){return this.req('/api/login','POST',{username,password});}}}
  return {dir,client,restart:async()=>{await app.close();app=await startServer({dataDir:dir,demo});}};
}
const passChecks={initial:{ac_output:'pass',dc_output:'pass',charging:'pass'},final:{ac_output:'pass',dc_output:'pass',charging:'pass'}};

test('stock receipts add overlapping SKUs and expose dated batch and per-SKU inventory history',async t=>{
  const h=await harness(t),admin=h.client(),operator=h.client(),base='/api/admin/inventory';
  await admin.login('admin','JackeryAdmin!2026');await operator.login('alex','JackeryAlex!2026');
  const commit=async (kind,csv,sourceName,requestId)=>{
    const preview=await admin.req(base+'/preview','POST',{kind,csv});
    assert.equal(preview.status,200,JSON.stringify(preview.data));
    const input={kind,csv,sourceName,requestId,previewHash:preview.data.previewHash};
    const result=await admin.req(base+'/commit','POST',input);
    assert.equal(result.status,200,JSON.stringify(result.data));
    return {input,receipt:result.data};
  };
  const sku='DEMO-A-0001';
  const first=await commit('receipt','sku,quantity\n'+sku+',20','转运库存.xlsx','1'.repeat(32));
  const second=await commit('receipt','sku,quantity\n'+sku+',10\nDEMO-A-0002,0','国内发运物料.xlsx','2'.repeat(32));
  const adjustment=await commit('adjust','sku,delta\n'+sku+',-2','调整.xlsx','3'.repeat(32));
  assert.equal(first.receipt.updated,1);
  assert.equal(second.receipt.updated,2);
  assert.deepEqual((await admin.req(base+'/commit','POST',second.input)).data,second.receipt);
  assert.equal((await admin.req(base+'/commit','POST',{...second.input,sourceName:'other.xlsx'})).status,422);
  assert.equal((await admin.req(base+'/preview','POST',{kind:'receipt',csv:'sku,quantity\n'+sku+',-1'})).status,422);
  assert.equal((await operator.req(base+'/batches')).status,403);
  assert.equal((await operator.req(base+'/movements')).status,403);
  const list=(await admin.req(base+'/batches?kind=import')).data;
  assert.equal(list.total,2);
  assert.deepEqual(list.items.map(x=>x.sourceName),['国内发运物料.xlsx','转运库存.xlsx']);
  assert.equal(list.items[0].actorName,'Demo Admin');
  assert.ok(list.items[0].appliedAt);
  assert.equal((await admin.req(base+'/batches?kind=adjust')).data.items[0].requestId,adjustment.receipt.requestId);
  const sequence=(await admin.req(base+'/movements?sku='+sku)).data.items;
  assert.deepEqual(sequence.map(x=>[x.kind,x.before,x.delta,x.after]),[['adjust',30,-2,28],['receipt',20,10,30],['open',0,20,20]]);
  const detail=(await admin.req(base+'/movements?batch='+second.receipt.requestId)).data;
  assert.equal(detail.total,2);
  assert.ok(detail.items.every(x=>x.sourceName==='国内发运物料.xlsx'&&x.batchId===second.receipt.requestId));
  assert.ok(detail.items.some(x=>x.kind==='open'&&x.delta===0));
  await h.restart();
  assert.equal((await admin.req(base+'/movements?sku='+sku)).data.items[0].after,28);
});

test('material master registers unknown inventory SKUs and enforces global status without removing BOM snapshots',async t=>{
  const h=await harness(t),admin=h.client(),operator=h.client();
  await admin.login('admin','JackeryAdmin!2026');await operator.login('alex','JackeryAlex!2026');
  const base='/api/admin/materials',sku='WAREHOUSE-SPARE-01',bomSku='DEMO-A-0001';
  const stockCsv='sku,quantity\n'+sku+',5';
  const previewStock=()=>admin.req('/api/admin/inventory/preview','POST',{kind:'open',csv:stockCsv});
  const status=(sku,active,client=admin)=>client.req(base+'/status','PUT',{sku,active});
  const stockBefore=await previewStock();
  assert.equal(stockBefore.data.error.details[0].message,'Unknown Part SKU');
  assert.equal((await operator.req(base)).status,403);
  assert.equal((await status(bomSku,false,operator)).status,403);
  const invalid=await admin.req(base+'/preview','POST',{csv:'sku,descriptionZh\nNEW-01,零件\nNEW-01,重复'});
  assert.equal(invalid.data.error.details[0].message,'Duplicate Part SKU');
  const csv='SKU,Product Name/产品名称,Available Inventory/可用库存\n'+sku+',备件,5\n'+bomSku+',现有,2\nDEMO-PRODUCT-1,整机,3';
  const preview=await admin.req(base+'/preview','POST',{csv});
  assert.equal(preview.status,200,JSON.stringify(preview.data));
  assert.deepEqual(preview.data.rows.map(row=>row.status),['new','existing','product']);
  assert.equal((await previewStock()).status,422);
  const input={csv,previewHash:preview.data.previewHash};
  const applied=await admin.req(base+'/import','POST',input);
  assert.deepEqual(applied.data,{created:1,skipped:2});
  assert.equal((await admin.req(base+'/import','POST',input)).status,409);
  assert.equal((await admin.req('/api/admin/inventory?q='+sku)).data.items[0].quantity,0);
  assert.equal((await operator.req('/api/models/1/bom?q='+sku)).data.total,0);
  const opening=await previewStock();
  assert.equal(opening.status,200);
  assert.equal((await status(sku,false)).status,200);
  assert.equal((await previewStock()).data.error.details[0].message,'Part SKU is inactive');
  assert.equal((await admin.req(base+'?status=inactive&q='+sku)).data.total,1);
  assert.equal((await admin.req('/api/admin/inventory/commit','POST',{kind:'open',csv:stockCsv,requestId:'e'.repeat(32),previewHash:opening.data.previewHash})).status,422);
  await status(sku,true);
  assert.equal((await admin.req('/api/admin/inventory/commit','POST',{kind:'open',csv:stockCsv,requestId:'e'.repeat(32),previewHash:opening.data.previewHash})).status,200);
  await admin.req('/api/admin/bom','POST',{modelId:2,sku:bomSku,descriptionEn:'Shared box',unit:'pc'});
  const r=(await operator.req('/api/records','POST',{sn:'MATERIAL-STATUS-DRAFT',modelId:1})).data.record;
  const save=(version,quantity)=>operator.req('/api/records/'+r.id,'PUT',{version,action:'save',materials:[{bomId:1,quantity}]});
  const draft=(await save(r.version,1)).data.record;
  await status(bomSku,false);
  assert.equal((await operator.req('/api/models/1/bom?q='+bomSku)).data.total,0);
  assert.equal((await operator.req('/api/models/2/bom?q='+bomSku)).data.total,0);
  assert.equal((await admin.req('/api/models/1/bom?includeInactive=1&q='+bomSku)).data.items[0].active,true);
  assert.equal((await save(draft.version,2)).data.error.code,'MATERIAL_INACTIVE');
  assert.equal((await save(draft.version,1)).status,200);
  await h.restart();
  assert.equal((await admin.req(base+'?status=inactive&q='+bomSku)).data.total,1);
  await status(bomSku,true);
  assert.equal((await operator.req('/api/models/2/bom?q='+bomSku)).data.total,1);
  assert.equal((await admin.req('/api/admin/inventory?q='+sku)).data.items[0].quantity,5);
});

test('stock initializes per SKU, deducts once on completion, permits negatives and posts correction deltas',async t=>{
  const h=await harness(t),admin=h.client(),operator=h.client();
  await admin.login('admin','JackeryAdmin!2026');await operator.login('alex','JackeryAlex!2026');
  const base='/api/admin/inventory',sku='DEMO-A-0001';
  const stock=async()=> (await operator.req('/api/models/1/bom?q='+sku)).data.items[0].stockQuantity;
  const create=async sn=>(await operator.req('/api/records','POST',{sn,modelId:1})).data.record;
  const save=(r,action,quantity)=>operator.req('/api/records/'+r.id,'PUT',{version:r.version,action,outcome:action==='complete'?'rok':'awp',checks:passChecks,materials:[{bomId:1,quantity}]});
  const preview=(kind,csv)=>admin.req(base+'/preview','POST',{kind,csv});
  const commit=(kind,csv,previewHash,id)=>admin.req(base+'/commit','POST',{kind,csv,previewHash,requestId:id.repeat(32)});
  assert.equal((await operator.req(base)).status,403);
  assert.equal(await stock(),0);
  const legacy=(await save(await create('STOCK-BEFORE-OPENING'),'complete',1)).data.record;
  const draft=(await save(await create('STOCK-WFR'),'save',3)).data.record;
  assert.equal((await preview('adjust','sku,delta\n'+sku+',2')).status,422);
  assert.equal((await preview('open','sku,quantity\n'+sku+',2\n'+sku+',3')).status,422);
  assert.equal((await preview('open','sku,quantity\n'+sku+',2\nUNKNOWN,1')).status,422);
  assert.equal((await preview('open','sku,quantity\n'+sku+',1.2')).status,422);
  assert.equal(await stock(),0);
  const initial='sku,quantity\n'+sku+',2',opening=(await preview('open',initial)).data;
  assert.equal((await commit('open',initial,opening.previewHash,'a')).status,200);
  assert.equal(await stock(),2);
  const correction=(r,quantity)=>admin.req('/api/records/'+r.id+'/corrections','POST',{version:r.version,reason:'Counted again',changes:{materials:[{bomId:1,quantity}]}});
  assert.equal((await correction(legacy,2)).status,200);
  assert.equal(await stock(),2);
  const same=(await save(draft,'save',3)).data.record;
  assert.equal(await stock(),2);
  const complete=await save(same,'complete',3);
  assert.equal(complete.status,200);
  assert.equal(await stock(),-1);
  assert.equal((await save(same,'complete',3)).status,403);
  assert.equal(await stock(),-1);
  assert.equal((await correction(complete.data.record,2)).status,200);
  assert.equal(await stock(),0);
  const csv='sku,delta\n'+sku+',-4',adjustment=(await preview('adjust',csv)).data;
  assert.deepEqual(adjustment.rows.map(({before,delta,after})=>({before,delta,after})),[{before:0,delta:-4,after:-4}]);
  const bump='sku,delta\n'+sku+',+3',bumpPreview=(await preview('adjust',bump)).data;
  const applied=await commit('adjust',bump,bumpPreview.previewHash,'b');
  assert.equal(applied.status,200);
  assert.deepEqual((await commit('adjust',bump,bumpPreview.previewHash,'b')).data,applied.data);
  assert.equal((await commit('adjust',csv,adjustment.previewHash,'c')).data.error.code,'STOCK_PREVIEW_STALE');
  assert.equal((await commit('adjust',csv,(await preview('adjust',csv)).data.previewHash,'d')).status,200);
  assert.equal(await stock(),-1);
  await admin.req('/api/admin/bom','POST',{modelId:2,sku,descriptionEn:'Shared box',descriptionZh:'共用纸箱',unit:'pc'});
  assert.equal((await operator.req('/api/models/2/bom?q='+sku)).data.items[0].stockQuantity,-1);
  const history=await admin.req(base+'/history?sku='+sku+'&q=STOCK-WFR');
  assert.deepEqual(history.data.items.map(x=>[x.sn,x.quantity]),[['STOCK-WFR',2]]);
  const xlsx=await admin.req(base+'/export?language=zh');
  assert.equal(xlsx.status,200);
  let xml='';
  for(let offset=0;xlsx.bytes.readUInt32LE(offset)===0x04034b50;){
    const size=xlsx.bytes.readUInt32LE(offset+18),length=xlsx.bytes.readUInt16LE(offset+26),start=offset+30+length+xlsx.bytes.readUInt16LE(offset+28);
    if(xlsx.bytes.toString('utf8',offset+30,offset+30+length)==='xl/worksheets/sheet1.xml')xml=inflateRawSync(xlsx.bytes.subarray(start,start+size)).toString();
    offset=start+size;
  }
  assert.match(xml,/>当前库存</);assert.match(xml,/<v>-1<\/v>/);
  await h.restart();
  assert.equal(await stock(),-1);
});

test('authentication, CSRF, own-only list and full-SN history cannot grant writes or export',async t=>{
  const h=await harness(t), alex=h.client(), blair=h.client(), anonymous=h.client();
  assert.equal((await anonymous.req('/api/records')).status,401);
  const session=await alex.login('alex','JackeryAlex!2026');assert.equal(session.status,200);assert.equal(session.data.user.role,'operator');assert.match(session.headers.get('set-cookie'),/HttpOnly.*SameSite=Strict/i);
  await blair.login('blair','JackeryBlair!2026');
  assert.equal((await alex.req('/api/records','POST',{sn:'X',modelId:1},{'X-CSRF-Token':'wrong'})).status,403);
  const list=await alex.req('/api/records');assert.ok(list.data.items.every(r=>r.ownerName==='Alex Operator'));
  const history=await alex.req('/api/sn-history?sn=DEMO-HISTORY-001');assert.equal(history.data.items.length,1);const foreign=history.data.items[0];
  assert.equal((await alex.req(`/api/records/${foreign.id}`)).status,403);
  assert.equal((await alex.req(`/api/records/${foreign.id}?historySn=DEMO-HISTORY-001`)).status,200);
  assert.equal((await alex.req(`/api/records/${foreign.id}?historySn=DEMO-HISTORY`)).status,403);
  assert.equal((await alex.req(`/api/records/${foreign.id}`,'PUT',{version:foreign.version,outcome:'scrap',scrapReason:'x',action:'complete'})).status,403);
  assert.equal((await alex.req('/api/sn-history?sn=')).status,422);
  const ex=await alex.req('/api/export?ownerId='+foreign.ownerId);assert.equal(ex.status,403);
  assert.equal((await alex.req('/api/admin/users')).status,403);
});
test('records validate atomically, preserve snapshots, lock completion and audit corrections',async t=>{
  const h=await harness(t), c=h.client(), admin=h.client();await c.login('alex','JackeryAlex!2026');await admin.login('admin','JackeryAdmin!2026');
  let r=(await c.req('/api/records','POST',{sn:' NEW-SN ',modelId:1,ownerId:3})).data.record;assert.equal(r.sn,'NEW-SN');assert.equal(r.ownerName,'Alex Operator');assert.equal(r.outcome,null);
  const id=r.id;const bad=await c.req(`/api/records/${id}`,'PUT',{version:r.version,outcome:'like_new',action:'complete'});assert.equal(bad.status,422);
  assert.equal((await c.req(`/api/records/${id}`)).data.record.version,r.version);
  const bom=(await c.req('/api/models/1/bom?pageSize=100')).data;assert.ok(bom.total>=800);
  r=(await c.req(`/api/records/${id}`,'PUT',{version:r.version,outcome:'awp',materials:[{bomId:bom.items[0].id,quantity:2}],action:'save'})).data.record;assert.equal(r.status,'wfr');
  assert.equal((await c.req(`/api/records/${id}`,'PUT',{version:r.version-1,issueNotes:'stale',action:'save'})).status,409);
  const model=r.modelSnapshot;await admin.req('/api/admin/models/1','PUT',{...model,nameEn:'Renamed',checkItems:[{code:'new_check',labelEn:'New',labelZh:'新'}]});
  const saved=await c.req(`/api/records/${id}`,'PUT',{version:r.version,outcome:'rok',checks:passChecks,action:'complete'});assert.equal(saved.status,200,JSON.stringify(saved.data));r=saved.data.record;assert.equal(r.status,'completed');assert.equal(r.modelSnapshot.nameEn,'Sample Model A');
  assert.equal((await c.req(`/api/records/${id}`,'PUT',{version:r.version,action:'save'})).status,403);
  assert.equal((await admin.req(`/api/records/${id}/corrections`,'POST',{version:r.version,reason:'',changes:{issueNotes:'fix'}})).status,422);
  const correction=await admin.req(`/api/records/${id}/corrections`,'POST',{version:r.version,reason:'Correct note',changes:{issueNotes:'corrected'}});assert.equal(correction.status,200,JSON.stringify(correction.data));assert.equal(correction.data.record.status,'completed');
  const audit=(await admin.req(`/api/records/${id}/audit`)).data.items;const entry=audit.find(x=>x.action==='correction');assert.equal(entry.reason,'Correct note');assert.equal(entry.before.issueNotes,'');assert.equal(entry.after.issueNotes,'corrected');
  await h.restart();await c.login('alex','JackeryAlex!2026');assert.equal((await c.req(`/api/records/${id}`)).data.record.issueNotes,'corrected');
});
test('admin account maintenance enforces last admin and revokes deactivated/password-changed sessions',async t=>{
  const h=await harness(t),a=h.client(),c=h.client();await a.login('admin','JackeryAdmin!2026');await c.login('alex','JackeryAlex!2026');
  const users=(await a.req('/api/admin/users')).data.items,admin=users.find(x=>x.username==='admin'),alex=users.find(x=>x.username==='alex');
  assert.equal((await a.req(`/api/admin/users/${admin.id}`,'PUT',{displayName:'Admin',role:'operator',active:true})).status,422);
  await a.req(`/api/admin/users/${alex.id}`,'PUT',{displayName:'Alex',role:'operator',active:false});assert.equal((await c.req('/api/records')).status,401);
  await a.req(`/api/admin/users/${alex.id}`,'PUT',{displayName:'Alex',role:'operator',active:true});await c.login('alex','JackeryAlex!2026');
  await a.req(`/api/admin/users/${alex.id}/password`,'POST',{password:'ChangedPassword!2026'});assert.equal((await c.req('/api/records')).status,401);
  assert.equal((await c.login('alex','JackeryAlex!2026')).status,401);assert.equal((await c.login('alex','ChangedPassword!2026')).status,200);
});
test('BOM import rejects duplicate existing SKUs atomically and exports actual XLSX',async t=>{
  const h=await harness(t),a=h.client();await a.login('admin','JackeryAdmin!2026');
  const before=(await a.req('/api/models/1/bom')).data.total;
  const rejected=await a.req('/api/admin/bom/import','POST',{modelId:1,csv:'sku,descriptionEn,descriptionZh,unit\r\nNEW-SKU,New,新,pc\r\nNEW-SKU,Duplicate,重复,pc'});assert.equal(rejected.status,422);assert.equal((await a.req('/api/models/1/bom')).data.total,before);
  const imported=await a.req('/api/admin/bom/import','POST',{modelId:1,csv:'sku,descriptionEn,descriptionZh,unit\r\nNEW-SKU,"New, part",新,pc'});assert.equal(imported.status,201);assert.equal(imported.data.created,1);
  const ex=await a.req('/api/export');assert.equal(ex.status,200);assert.equal(ex.bytes.readUInt32LE(0),0x04034b50);assert.match(ex.headers.get('content-type'),/spreadsheetml/);
});
test('fresh production has empty catalogs and a random first-run credential file, never demo logins',async t=>{
  const h=await harness(t,false),c=h.client();assert.equal((await c.login('admin','JackeryAdmin!2026')).status,401);
  const files=await readdir(h.dir), file=files.find(f=>f==='first-run-accounts.json');assert.ok(file);const {password}=JSON.parse(await readFile(path.join(h.dir,file),'utf8')).admin;assert.ok(password.length>=20);
  assert.equal((await c.login('admin',password)).status,200);assert.equal((await c.req('/api/catalog')).data.models.length,0);assert.equal((await c.req('/api/records')).data.total,0);
});

test('photo history is protected, removals preserve bytes, and every change checks record version',async t=>{
  const h=await harness(t),a=h.client(),b=h.client(),admin=h.client();await a.login('alex','JackeryAlex!2026');await b.login('blair','JackeryBlair!2026');await admin.login('admin','JackeryAdmin!2026');
  const image=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAADCAIAAAA2iEnWAAAAEUlEQVR4nGP8zwACTGASRgEAFEABBVDVLjgAAAAASUVORK5CYII=','base64');
  let r=(await b.req('/api/records','POST',{sn:'PHOTO-PRIVATE',modelId:1})).data.record;
  const upload=await b.req(`/api/records/${r.id}/photos`,'POST',{version:r.version,filename:'original.png',contentBase64:image.toString('base64')});assert.equal(upload.status,201,JSON.stringify(upload.data));r=upload.data.record;const p=upload.data.photo;
  assert.equal((await a.req(p.url)).status,403);assert.equal((await a.req(p.url+'?sn=PHOTO')).status,403);
  assert.deepEqual((await a.req(p.url+'?sn=PHOTO-PRIVATE')).bytes,image);
  assert.match((await b.req(p.url)).headers.get('cache-control'),/private.*no-store/);
  const history=(await a.req('/api/sn-history?sn=PHOTO-PRIVATE')).data.items[0];assert.ok(history.photos[0].url.endsWith('?sn=PHOTO-PRIVATE'));
  assert.equal((await a.req(`/api/records/${r.id}/photos`,'POST',{version:r.version,filename:'x.png',contentBase64:image.toString('base64')})).status,403);
  assert.equal((await b.req(p.url,'DELETE',{version:r.version-1})).status,409);
  const stale=await b.req(`/api/records/${r.id}/photos`,'POST',{version:r.version-1,filename:'x.png',contentBase64:image.toString('base64')});assert.equal(stale.status,409);
  r=(await b.req(`/api/records/${r.id}`,'PUT',{version:r.version,outcome:'scrap',scrapReason:'Unsafe',action:'complete'})).data.record;
  assert.equal((await b.req(p.url,'DELETE',{version:r.version})).status,403);
  assert.equal((await admin.req(p.url,'DELETE',{version:r.version})).status,422);
  const removed=await admin.req(p.url,'DELETE',{version:r.version,reason:'Wrong attachment'});assert.equal(removed.status,200);assert.equal(removed.data.record.status,'completed');assert.equal(removed.data.record.photos.length,0);
  assert.equal((await b.req(p.url)).status,404);
  const files=await readdir(path.join(h.dir,'photos'));assert.equal(files.length,1);assert.deepEqual(await readFile(path.join(h.dir,'photos',files[0])),image);
  const audit=(await admin.req(`/api/records/${r.id}/audit`)).data.items;assert.ok(audit.some(x=>x.action==='photo_remove'&&x.reason==='Wrong attachment'&&x.before.photos.length===1&&x.after.photos.length===0));
});

test('large syntactically valid base64 is rejected as image input without crashing the request',async t=>{
  const h=await harness(t),c=h.client();await c.login('alex','JackeryAlex!2026');const r=(await c.req('/api/records','POST',{sn:'LARGE-IMAGE',modelId:1})).data.record;
  const result=await c.req(`/api/records/${r.id}/photos`,'POST',{version:r.version,filename:'large.png',contentBase64:Buffer.alloc(7*1024*1024).toString('base64')});assert.ok([413,422].includes(result.status),JSON.stringify(result.data));
});

test('export reports an explicit cap rather than a server error for a snapshot exceeding Excel cell size',async t=>{
  const h=await harness(t),a=h.client();await a.login('admin','JackeryAdmin!2026');
  const model=(await a.req('/api/admin/models','POST',{nameEn:'Long checklist',checkItems:Array.from({length:100},(_,i)=>({code:'c'+i,labelEn:'E'.repeat(300),labelZh:'中'.repeat(300)}))})).data.model;
  const created=await a.req('/api/records','POST',{sn:'LARGE-SNAPSHOT',modelId:model.id});assert.equal(created.status,201);
  assert.equal((await a.req('/api/export?modelId='+model.id)).status,413);
});

test('data directories cannot silently mix demo and real startup modes',async t=>{
  const h=await harness(t);const {startServer}=await nodeServer();await assert.rejects(startServer({dataDir:h.dir,demo:false}),/mode mismatch/i);
});

test('login rejects hostile Origin before creating a session',async t=>{
  const h=await harness(t),c=h.client();
  const input={username:'alex',password:'JackeryAlex!2026'};
  assert.equal((await c.req('/api/login','POST',input,{Origin:'https://evil.invalid'})).status,403);
  assert.equal((await c.req('/api/session')).data.user,null);
  assert.equal((await c.req('/api/login','POST',input)).status,200);
});
test('JSON login rejects browser simple-request media types before creating a session',async t=>{
  const h=await harness(t),c=h.client();
  const input={username:'alex',password:'JackeryAlex!2026'};
  assert.equal((await c.req('/api/login','POST',input,{'Content-Type':'text/plain'})).status,400);
  assert.equal((await c.req('/api/session')).data.user,null);
  assert.equal((await c.req('/api/login','POST',input)).status,200);
});

test('existing-SKU CSV conflicts identify the physical source row after multiline fields',async t=>{
  const h=await harness(t),a=h.client();await a.login('admin','JackeryAdmin!2026');
  const result=await a.req('/api/admin/bom/import','POST',{modelId:1,csv:'sku,descriptionEn,descriptionZh,unit\r\nNEW-MULTI,"Board\r\nwith note",,pc\r\nDEMO-A-0001,Existing,,pc'});
  assert.equal(result.status,422);assert.equal(result.data.error.details[0].row,4);assert.equal((await a.req('/api/models/1/bom?q=NEW-MULTI')).data.total,0);
});
