import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { inflateRawSync } from 'node:zlib';
import { DatabaseSync } from 'node:sqlite';
import { startServer } from '../server.js';
import { germanWorkTime } from '../public/work-time.js';

const root = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const tempRoot = path.join(root, 'tests', '.tmp');
mkdirSync(tempRoot, { recursive: true });

async function fixture(t, demo = true) {
  const dir = mkdtempSync(path.join(tempRoot, 'acceptance-'));
  const app = await startServer({ dataDir: dir, demo, port: 0 });
  t.after(async () => {
    await app.close();
    const resolved = path.resolve(dir);
    assert.ok(resolved.startsWith(tempRoot + path.sep), 'Only owned temporary test paths may be removed');
    rmSync(resolved, { recursive: true, force: true });
  });
  return { ...app, dir };
}

async function client(app, username = 'alex', password = 'JackeryAlex!2026') {
  let cookie = '', csrf = '';
  async function req(route, method = 'GET', body, extra = {}) {
    const headers = { Origin: app.baseUrl, ...extra };
    if (cookie) headers.Cookie = cookie;
    if (csrf) headers['X-CSRF-Token'] = csrf;
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    const response = await fetch(app.baseUrl + route, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    if (response.headers.get('set-cookie')) cookie = response.headers.get('set-cookie').split(';')[0];
    const bytes = Buffer.from(await response.arrayBuffer());
    let data; try { data = JSON.parse(bytes.toString()); } catch { data = null; }
    if (data?.csrfToken) csrf = data.csrfToken;
    return { status: response.status, data, bytes, headers: response.headers };
  }
  const login = await req('/api/login', 'POST', { username, password });
  assert.equal(login.status, 200, `Login ${username}: ${login.bytes}`);
  return { req, cookie: () => cookie, csrf: () => csrf };
}

async function create(c, sn = 'TEST-SN-001', modelId = 1) {
  const r = await c.req('/api/records', 'POST', { sn, modelId });
  assert.equal(r.status, 201, r.bytes.toString());
  return r.data.record;
}
function input(r, changes = {}) {
  return {
    version: r.version, sn: r.sn, modelId: r.modelId,
    productSku: r.productSku, sourcePallet: r.sourcePallet, storagePallet: r.storagePallet,
    workDate: r.workDate, outcome: r.outcome, appearanceCodes: r.appearanceCodes,
    appearanceNotes: r.appearanceNotes, issueNotes: r.issueNotes, scrapReason: r.scrapReason,
    checks: structuredClone(r.checks), materials: r.materials.map(m => ({ bomId: m.bomId, quantity: m.quantity })),
    action: 'save', ...changes,
  };
}
function passes(r) {
  return Object.fromEntries(r.modelSnapshot.checkItems.map(c => [c.code, 'pass']));
}
function zipFiles(buffer) {
  let end = buffer.length - 22;
  while (end >= 0 && buffer.readUInt32LE(end) !== 0x06054b50) end--;
  assert.ok(end >= 0, 'Valid ZIP end directory');
  const count = buffer.readUInt16LE(end + 10), files = {};
  let pos = buffer.readUInt32LE(end + 16);
  for (let i = 0; i < count; i++) {
    assert.equal(buffer.readUInt32LE(pos), 0x02014b50);
    const method = buffer.readUInt16LE(pos + 10), size = buffer.readUInt32LE(pos + 20);
    const nameLen = buffer.readUInt16LE(pos + 28), extra = buffer.readUInt16LE(pos + 30), comment = buffer.readUInt16LE(pos + 32);
    const local = buffer.readUInt32LE(pos + 42), name = buffer.toString('utf8', pos + 46, pos + 46 + nameLen);
    const start = local + 30 + buffer.readUInt16LE(local + 26) + buffer.readUInt16LE(local + 28);
    const data = buffer.subarray(start, start + size);
    files[name] = (method === 8 ? inflateRawSync(data) : data).toString('utf8');
    pos += 46 + nameLen + extra + comment;
  }
  return files;
}

test('AC-01 unauthenticated requests and own-only lists', async t => {
  const app = await fixture(t);
  assert.equal((await fetch(app.baseUrl + '/api/records')).status, 401);
  const alex = await client(app), blair = await client(app, 'blair', 'JackeryBlair!2026');
  const foreign = await create(blair, 'PRIVATE-FOREIGN-SN');
  const mine = await create(alex, 'MY-ONLY-SN');
  const list = await alex.req('/api/records?pageSize=100');
  assert.equal(list.status, 200);
  assert.ok(list.data.items.some(r => r.id === mine.id));
  assert.ok(!list.data.items.some(r => r.id === foreign.id));
  assert.equal((await alex.req(`/api/records/${foreign.id}`)).status, 403);
});

test('AC-02 exact SN read-only exception never grants editing or broad search', async t => {
  const app = await fixture(t), alex = await client(app), blair = await client(app, 'blair', 'JackeryBlair!2026');
  const r = await create(blair, 'EXACT-SN-REF-001');
  const history = await alex.req('/api/sn-history?sn=EXACT-SN-REF-001');
  assert.equal(history.status, 200);
  assert.ok(history.data.items.some(x => x.id === r.id));
  assert.equal((await alex.req(`/api/records/${r.id}?historySn=EXACT-SN-REF-001`)).status, 200);
  assert.ok((await alex.req('/api/sn-history?sn=EXACT-SN-REF')).data.items.length === 0);
  assert.ok([400, 422].includes((await alex.req('/api/sn-history?sn=')).status));
  assert.equal((await alex.req(`/api/records/${r.id}`, 'PUT', input(r, { issueNotes: 'Unauthorized takeover' }))).status, 403);
});

test('AC-03 repeated SN creates a separate work order after completion', async t => {
  const app = await fixture(t), c = await client(app);
  const first = await create(c, 'REPEAT-001');
  const done = await c.req('/api/records/'+first.id,'PUT',input(first,{action:'complete',outcome:'scrap',scrapReason:'End first visit'}));
  assert.equal(done.status,200);
  const second = await create(c, 'REPEAT-001');
  assert.notEqual(first.id, second.id);
  assert.notEqual(first.workOrder, second.workOrder);
  const history = await c.req('/api/sn-history?sn=REPEAT-001');
  assert.equal(history.data.items.length, 2);
});

test('AC-04 WFR resume retains notes, checks and same work order', async t => {
  const app = await fixture(t), c = await client(app), r = await create(c, 'WAIT-AND-RESUME');
  const waiting = await c.req(`/api/records/${r.id}`, 'PUT', input(r, { outcome: 'awp', issueNotes: 'Waiting for specific board' }));
  assert.equal(waiting.status, 200);
  assert.equal(waiting.data.record.status, 'wfr');
  const final = await c.req(`/api/records/${r.id}`, 'PUT', input(waiting.data.record, { outcome: 'rok', checks: { initial: passes(r) }, action: 'complete' }));
  assert.equal(final.status, 200, final.bytes.toString());
  assert.equal(final.data.record.id, r.id);
  assert.equal(final.data.record.workOrder, r.workOrder);
  assert.equal(final.data.record.issueNotes, 'Waiting for specific board');
  const auditPath = `/api/records/${r.id}/audit`;
  assert.equal((await c.req(auditPath)).status, 403);
  const blair = await client(app, 'blair', 'JackeryBlair!2026');
  assert.equal((await blair.req(auditPath+'?historySn=WAIT-AND-RESUME')).status, 403);
  assert.equal((await fetch(app.baseUrl+auditPath)).status, 401);
  const admin = await client(app, 'admin', 'JackeryAdmin!2026');
  const audit = await admin.req(auditPath);
  assert.equal(audit.status, 200);
  assert.ok(audit.data.items.length >= 2);
});

test('work order IDs stay above the archived sequence after test records are removed', async t => {
  const app = await fixture(t), c = await client(app);
  const database = new DatabaseSync(path.join(app.dir, 'huabao.sqlite'));
  try {
    database.prepare('INSERT INTO meta(key,value) VALUES(?,?)').run('records:id-floor','17');
  } finally {
    database.close();
  }
  const first = await create(c, 'AFTER-ARCHIVE-1');
  const second = await create(c, 'AFTER-ARCHIVE-2');
  assert.equal(first.id,18);
  assert.match(first.workOrder,/-000018$/);
  assert.equal(second.id,19);
});

test('Jackery customer reads completed and WFR work and stock without access to drafts or business writes', async t => {
  const app = await fixture(t);
  const admin = await client(app,'admin','JackeryAdmin!2026');
  const alex = await client(app);
  const sn = 'CUSTOMER-VISIBLE-SN';
  const draft = await create(alex,sn+'-DRAFT');
  const finishing = await create(alex,sn);
  const part = (await admin.req('/api/models/1/bom')).data.items[0];
  const stockInput = {kind:'receipt',csv:`sku,quantity\n${part.sku},10\n`};
  const preview = await admin.req('/api/admin/inventory/preview','POST',stockInput);
  assert.equal(preview.status,200);
  const imported = await admin.req('/api/admin/inventory/commit','POST',{...stockInput,previewHash:preview.data.previewHash,requestId:'0123456789abcdef0123456789abcdef'});
  assert.equal(imported.status,200);
  const image='iVBORw0KGgoAAAANSUhEUgAAAAIAAAADCAIAAAA2iEnWAAAAEUlEQVR4nGP8zwACTGASRgEAFEABBVDVLjgAAAAASUVORK5CYII=';
  const attach = record => alex.req(`/api/records/${record.id}/photos`,'POST',{version:record.version,filename:'sample.png',contentBase64:image});
  const draftPhoto = (await attach(draft)).data.photo;
  const attached = (await attach(finishing)).data;
  assert.equal((await alex.req(`/api/records/${finishing.id}`,'PUT',input(attached.record,{action:'complete',outcome:'scrap',scrapReason:'Test unit',materials:[{bomId:part.id,quantity:1}]}))).status,200);
  const waiting = await create(alex,sn);
  assert.equal((await alex.req(`/api/records/${waiting.id}`,'PUT',input(waiting,{outcome:'awp'}))).status,200);
  const created = await admin.req('/api/admin/users','POST',{username:'jackery_customer',displayName:'Jackery Customer',role:'customer',password:'CustomerReadOnly!2026'});
  assert.equal(created.status,201,created.bytes.toString());
  const customer = await client(app,'jackery_customer','CustomerReadOnly!2026');
  const ids = result=>result.data.items.map(row=>row.id).sort((a,b)=>a-b);
  assert.deepEqual(ids(await customer.req('/api/records?q='+sn)),[finishing.id,waiting.id]);
  assert.deepEqual(ids(await customer.req('/api/records?q='+sn+'&status=draft')),[]);
  assert.deepEqual(ids(await customer.req('/api/sn-history?sn='+sn)),[finishing.id,waiting.id]);
  assert.equal((await customer.req(`/api/records/${draft.id}?historySn=${sn}`)).status,403);
  const detail = (await customer.req(`/api/records/${finishing.id}`)).data.record;
  assert.equal(detail.scrapReason,'Test unit');
  assert.deepEqual(detail.materials.map(({sku,quantity})=>({sku,quantity})),[{sku:part.sku,quantity:1}]);
  assert.ok(!Object.hasOwn(detail,'ownerId')&&!Object.hasOwn(detail,'faultSnapshot'));
  assert.equal((await customer.req(detail.photos[0].url)).status,200);
  assert.equal((await customer.req(draftPhoto.url+'?sn='+sn)).status,403);
  const stockUrl = '/api/inventory?q='+encodeURIComponent(part.sku);
  const stock = await customer.req(stockUrl);
  assert.equal(stock.status,200);
  assert.ok(stock.data.total>0);
  assert.ok(stock.data.items.every(item=>Object.hasOwn(item,'quantity')&&Object.hasOwn(item,'updatedAt')));
  assert.equal(stock.data.items.find(item=>item.sku===part.sku).quantity,9);
  assert.equal((await alex.req('/api/inventory')).status,403);
  for(const [method,route] of [
    ['POST','/api/records'],['PUT',`/api/records/${waiting.id}`],
    ['POST',`/api/records/${finishing.id}/corrections`],['POST',`/api/records/${waiting.id}/photos`],
    ['DELETE',attached.photo.url],['GET',`/api/records/${finishing.id}/audit`],
    ['GET','/api/export'],['GET','/api/admin/inventory/export'],['GET','/api/admin/inventory/history'],
    ['GET','/api/admin/inventory/movements'],['POST','/api/admin/inventory/preview'],
    ['POST','/api/admin/inventory/commit'],['POST','/api/admin/materials/import'],['PUT','/api/admin/materials/status']
  ])assert.equal((await customer.req(route,method,method==='GET'?undefined:{})).status,403,method+' '+route);
  assert.equal((await customer.req('/api/account/language','PUT',{language:'zh'})).status,200);
  assert.equal((await admin.req(`/api/admin/users/${created.data.user.id}`,'PUT',{active:false})).status,200);
  assert.equal((await customer.req('/api/inventory')).status,401);
  await admin.req('/api/admin/users/2','PUT',{role:'customer'});
  assert.equal((await alex.req('/api/records')).status,401);
  const converted = await client(app);
  assert.equal((await converted.req(`/api/records/${draft.id}`)).status,403);
  assert.equal((await converted.req(`/api/records/${waiting.id}`,'PUT',{})).status,403);
  assert.equal((await converted.req(draftPhoto.url)).status,403);
  assert.deepEqual((await converted.req(stockUrl)).data,stock.data);
  assert.equal((await admin.req(`/api/records/${waiting.id}`)).data.record.status,'wfr');
  assert.equal((await admin.req(`/api/records/${draft.id}`)).data.record.photos.length,1);
});

test('AC-05 only current model BOM items may be consumed', async t => {
  const app = await fixture(t), c = await client(app), r = await create(c);
  const foreign = (await c.req('/api/models/2/bom')).data.items[0];
  const bad = await c.req(`/api/records/${r.id}`, 'PUT', input(r, { materials: [{ bomId: foreign.id, quantity: 1 }] }));
  assert.equal(bad.status, 422);
});

test('AC-06 and AC-07 packaging is ordinary BOM, precise quantity and no duplicate rows', async t => {
  const app = await fixture(t), c = await client(app), r = await create(c);
  const items = (await c.req('/api/models/1/bom?q=Packing')).data.items;
  assert.ok(items.length > 0, 'Demo packaging exists in model BOM');
  const saved = await c.req(`/api/records/${r.id}`, 'PUT', input(r, { materials: [{ bomId: items[0].id, quantity: 2.125 }] }));
  assert.equal(saved.status, 200, saved.bytes.toString());
  assert.equal(saved.data.record.materials[0].quantity, 2.125);
  assert.equal(saved.data.record.materials[0].sku, items[0].sku);
  const dupe = await c.req(`/api/records/${r.id}`, 'PUT', input(saved.data.record, { materials: [{ bomId: items[0].id, quantity: 1 }, { bomId: items[0].id, quantity: 1 }] }));
  assert.equal(dupe.status, 422);
});

test('AC-08 no material or photo is required for valid refurbishment', async t => {
  const app = await fixture(t), c = await client(app), r = await create(c);
  const done = await c.req(`/api/records/${r.id}`, 'PUT', input(r, { outcome: 'acceptable', checks: { initial: passes(r) }, action: 'complete' }));
  assert.equal(done.status, 200, done.bytes.toString());
  assert.equal(done.data.record.status, 'completed');
  assert.equal(done.data.record.materials.length, 0);
  assert.equal(done.data.record.photos.length, 0);
});

test('AC-09 incomplete or failed refurbishment checks block completion', async t => {
  const app = await fixture(t), c = await client(app), r = await create(c);
  const bad = await c.req(`/api/records/${r.id}`, 'PUT', input(r, { outcome: 'like_new', action: 'complete' }));
  assert.equal(bad.status, 422);
  const checks = passes(r); checks.ac_output = 'fail';
  assert.equal((await c.req(`/api/records/${r.id}`, 'PUT', input(r, { outcome: 'good', checks: { initial: checks }, action: 'complete' }))).status, 422);
  assert.equal((await c.req(`/api/records/${r.id}`)).data.record.version, r.version, 'Rejected mutation is atomic');
});

test('AC-10 failed inspection survives successful ROK completion without post-work checks', async t => {
  const app = await fixture(t), c = await client(app), r = await create(c);
  const initial = passes(r); initial.ac_output = 'fail';
  const done = await c.req(`/api/records/${r.id}`, 'PUT', input(r, { outcome: 'rok', checks: { initial }, action: 'complete' }));
  assert.equal(done.status, 200, done.bytes.toString());
  assert.equal(done.data.record.checks.initial.ac_output, 'fail');
  assert.equal(Object.hasOwn(done.data.record.checks,'final'),false);
});

test('AC-11 ROK cannot complete without every inspection item assessed', async t => {
  const app = await fixture(t), c = await client(app), r = await create(c);
  const bad = await c.req(`/api/records/${r.id}`, 'PUT', input(r, { outcome: 'rok', action: 'complete' }));
  assert.equal(bad.status, 422);
});

test('AC-12 SCRAP requires non-whitespace reason but not passing checks', async t => {
  const app = await fixture(t), c = await client(app), r = await create(c);
  assert.equal((await c.req(`/api/records/${r.id}`, 'PUT', input(r, { outcome: 'scrap', scrapReason: '   ', action: 'complete' }))).status, 422);
  const good = await c.req(`/api/records/${r.id}`, 'PUT', input(r, { outcome: 'scrap', scrapReason: 'Structural damage', action: 'complete' }));
  assert.equal(good.status, 200, good.bytes.toString());
  assert.equal(good.data.record.status, 'completed');
});

test('AC-13 exactly one outcome is supported; WFR cannot complete', async t => {
  const app = await fixture(t), c = await client(app), r = await create(c);
  assert.equal((await c.req(`/api/records/${r.id}`, 'PUT', input(r, { outcome: ['rok', 'awp'] }))).status, 422);
  assert.equal((await c.req(`/api/records/${r.id}`, 'PUT', input(r, { outcome: 'needs_analysis', action: 'complete' }))).status, 422);
  const waiting = await c.req(`/api/records/${r.id}`, 'PUT', input(r, { outcome: 'needs_analysis' }));
  assert.equal(waiting.data.record.status, 'wfr');
  assert.equal(waiting.data.record.completedAt, null);
});

test('AC-14 completed owner cannot edit; administrator correction needs reason', async t => {
  const app = await fixture(t), c = await client(app), admin = await client(app, 'admin', 'JackeryAdmin!2026'), r = await create(c);
  const done = (await c.req(`/api/records/${r.id}`, 'PUT', input(r, { outcome: 'scrap', scrapReason: 'Damaged case', action: 'complete' }))).data.record;
  assert.equal((await c.req(`/api/records/${r.id}`, 'PUT', input(done, { issueNotes: 'cannot edit' }))).status, 403);
  assert.equal((await admin.req(`/api/records/${r.id}/corrections`, 'POST', { version: done.version, reason: '', changes: input(done, { issueNotes: 'adjust' }) })).status, 422);
});

test('AC-15 corrections retain before/after/actor/reason and original owner', async t => {
  const app = await fixture(t), c = await client(app), admin = await client(app, 'admin', 'JackeryAdmin!2026'), r = await create(c);
  const fixed = await admin.req(`/api/records/${r.id}/corrections`, 'POST', { version: r.version, reason: 'Correct transcription', changes: input(r, { issueNotes: 'Corrected issue text' }) });
  assert.equal(fixed.status, 200, fixed.bytes.toString());
  assert.equal(fixed.data.record.ownerId, r.ownerId);
  const audit = (await admin.req(`/api/records/${r.id}/audit`)).data.items;
  const correction = audit.find(x => x.reason === 'Correct transcription');
  assert.ok(correction);
  assert.ok(correction.before && correction.after && correction.actorId && correction.createdAt);
  assert.equal(correction.after.issueNotes, 'Corrected issue text');
});

test('only a reasoned administrator correction can change the model of a saved record', async t => {
  const app=await fixture(t), operator=await client(app), admin=await client(app,'admin','JackeryAdmin!2026');
  const r=await create(operator,'TEST-CORRECT-MODEL');
  const route='/api/records/'+r.id;
  const operatorChange=await operator.req(route,'PUT',{version:r.version,modelId:2});
  assert.equal(operatorChange.status,403);
  const changes={modelId:2,productSku:'WRONG-SKU',materials:[{bomId:821,quantity:1}],outcome:'awp'};
  assert.equal((await admin.req(route+'/corrections','POST',{version:r.version,reason:'',changes})).status,422);
  const stale=await admin.req(route+'/corrections','POST',{version:r.version,reason:'Correct model',changes:{...changes,materials:[{bomId:1,quantity:1}]}});
  assert.equal(stale.status,422);
  const result=await admin.req(route+'/corrections','POST',{version:r.version,reason:'Correct model',changes});
  assert.equal(result.status,200);
  assert.equal(result.data.record.productSku,'DEMO-PRODUCT-2');
  assert.equal(result.data.record.status,'wfr');
  assert.equal(result.data.record.ownerId,r.ownerId);
  assert.equal(result.data.record.workOrder,r.workOrder);
  assert.equal(result.data.record.materials[0].sku,'DEMO-B-0001');
  const revision=(await admin.req(route+'/audit')).data.items[0];
  assert.equal(revision.before.modelId,1);
  assert.equal(revision.after.modelId,2);
});

test('a completed model correction requires new inspection and shifts stock by SKU', async t => {
  const app=await fixture(t), operator=await client(app), admin=await client(app,'admin','JackeryAdmin!2026');
  const base='/api/admin/inventory';
  const model=(await admin.req('/api/catalog')).data.models.find(row=>row.id===2);
  const modified=await admin.req('/api/admin/models/2','PUT',{...model,checkItems:[...model.checkItems,{code:'b_only',labelEn:'Extra model test',labelZh:'型号专用测试'}]});
  assert.equal(modified.status,200);
  const csv='sku,quantity\nDEMO-A-0001,3\nDEMO-B-0001,3';
  const preview=await admin.req(base+'/preview','POST',{kind:'open',csv});
  assert.equal(preview.status,200);
  assert.equal((await admin.req(base+'/commit','POST',{kind:'open',csv,previewHash:preview.data.previewHash,requestId:'a'.repeat(32)})).status,200);
  const balance=async(model,sku)=>(await operator.req('/api/models/'+model+'/bom?q='+sku)).data.items[0].stockQuantity;
  const r=await create(operator,'TEST-LOCKED-MODEL');
  const route='/api/records/'+r.id;
  const closed=await operator.req(route,'PUT',input(r,{outcome:'rok',action:'complete',checks:{initial:passes(r)},materials:[{bomId:1,quantity:1}]}));
  assert.equal(closed.status,200);
  const previous=closed.data.record;
  const change=checks=>admin.req(route+'/corrections','POST',{version:previous.version,reason:'Correct verified model',
    changes:{modelId:2,materials:[{bomId:821,quantity:2}],...(checks?{checks}:{})}});
  assert.deepEqual(await Promise.all([balance(1,'DEMO-A-0001'),balance(2,'DEMO-B-0001')]),[2,3]);
  assert.equal((await change()).status,422);
  assert.deepEqual(await Promise.all([balance(1,'DEMO-A-0001'),balance(2,'DEMO-B-0001')]),[2,3]);
  const corrected=await change({initial:{b_only:'pass'}});
  assert.equal(corrected.status,200);
  assert.equal(corrected.data.record.status,'completed');
  assert.equal(corrected.data.record.completedAt,previous.completedAt);
  assert.deepEqual(await Promise.all([balance(1,'DEMO-A-0001'),balance(2,'DEMO-B-0001')]),[3,1]);
});

test('AC-16 four-sheet export is complete, inert and permission scoped', async t => {
  const app = await fixture(t), c = await client(app), other = await client(app, 'blair', 'JackeryBlair!2026');
  const r = await create(c, 'EXPORT-MINE-001');
  await c.req(`/api/records/${r.id}`, 'PUT', input(r, { issueNotes: '=HYPERLINK("https://bad.invalid") <tag> & text', outcome: 'awp' }));
  await create(other, 'EXPORT-FOREIGN-SECRET');
  const out = await c.req('/api/export');
  assert.equal(out.status, 200, out.bytes.toString());
  assert.match(out.headers.get('content-type'), /spreadsheetml/);
  const files = zipFiles(out.bytes);
  assert.equal(Object.keys(files).filter(n => /^xl\/worksheets\/sheet\d+\.xml$/.test(n)).length, 4);
  const xml = Object.values(files).join('\n');
  assert.ok(xml.includes('EXPORT-MINE-001'));
  assert.ok(!xml.includes('EXPORT-FOREIGN-SECRET'));
  assert.ok(!/<f(?:\s|>)/.test(xml), 'User strings must never become formula elements');
  assert.ok(xml.includes('HYPERLINK'));
  const dir = path.join(root, 'artifacts', 'acceptance'); mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, 'v1-export.xlsx'), out.bytes);
});

test('AC-17 catalog edits preserve a saved record model/BOM snapshot', async t => {
  const app = await fixture(t), c = await client(app), admin = await client(app, 'admin', 'JackeryAdmin!2026'), r = await create(c);
  const part = (await c.req('/api/models/1/bom')).data.items[0];
  const saved = (await c.req(`/api/records/${r.id}`, 'PUT', input(r, { materials: [{ bomId: part.id, quantity: 1 }], outcome: 'awp' }))).data.record;
  const oldName = saved.materials[0].descriptionEn;
  const change = await admin.req(`/api/admin/bom/${part.id}`, 'PUT', { ...part, descriptionEn: 'Changed future description' });
  assert.equal(change.status, 200, change.bytes.toString());
  const old = (await c.req(`/api/records/${r.id}`)).data.record;
  assert.equal(old.materials[0].descriptionEn, oldName);
});

test('AC-18 stale versions are rejected without losing previous saved fields', async t => {
  const app = await fixture(t), c = await client(app), r = await create(c);
  const first = await c.req(`/api/records/${r.id}`, 'PUT', input(r, { issueNotes: 'First tab saved' }));
  assert.equal(first.status, 200);
  const stale = await c.req(`/api/records/${r.id}`, 'PUT', input(r, { issueNotes: 'Second tab stale' }));
  assert.equal(stale.status, 409);
  assert.equal((await c.req(`/api/records/${r.id}`)).data.record.issueNotes, 'First tab saved');
});

test('SEC authenticated mutations require CSRF and reject hostile Origin', async t => {
  const app = await fixture(t), c = await client(app);
  const naked = await fetch(app.baseUrl + '/api/records', { method: 'POST', headers: { Cookie: c.cookie(), 'Content-Type': 'application/json', Origin: app.baseUrl }, body: JSON.stringify({ sn: 'CSRF', modelId: 1 }) });
  assert.equal(naked.status, 403);
  const hostile = await c.req('/api/records', 'POST', { sn: 'HOSTILE', modelId: 1 }, { Origin: 'https://evil.invalid' });
  assert.equal(hostile.status, 403);
});

test('SEC operators cannot administer users, roles or dictionaries', async t => {
  const app = await fixture(t), c = await client(app);
  assert.equal((await c.req('/api/admin/users')).status, 403);
  assert.equal((await c.req('/api/admin/models', 'POST', { nameEn: 'Bad', checkItems: [] })).status, 403);
  assert.equal((await c.req('/api/admin/appearance', 'POST', { code: 'bad', labelEn: 'Bad', active: true })).status, 403);
});

test('ADMIN CSV import is atomic for duplicate/missing rows, accepts quoted cells', async t => {
  const app = await fixture(t), c = await client(app, 'admin', 'JackeryAdmin!2026');
  const initial = (await c.req('/api/models/1/bom')).data.total;
  const bad = await c.req('/api/admin/bom/import', 'POST', { modelId: 1, csv: 'sku,descriptionEn,descriptionZh,unit\nIMPORT-NEW,Valid,,pcs\nIMPORT-NEW,Duplicate,,pcs' });
  assert.equal(bad.status, 422);
  assert.equal((await c.req('/api/models/1/bom')).data.total, initial);
  const good = await c.req('/api/admin/bom/import', 'POST', { modelId: 1, csv: '\ufeffsku,descriptionEn,descriptionZh,unit\r\nIMPORT-QUOTED,"Board, control",控制板,pcs\r\n' });
  assert.equal(good.status, 201, good.bytes.toString());
  assert.equal(good.data.created, 1);
  assert.equal((await c.req('/api/models/1/bom?q=IMPORT-QUOTED')).data.items[0].descriptionEn, 'Board, control');
});

test('ADMIN user deactivation invalidates previously issued sessions', async t => {
  const app = await fixture(t), c = await client(app), admin = await client(app, 'admin', 'JackeryAdmin!2026');
  const users = (await admin.req('/api/admin/users')).data.items;
  const alex = users.find(u => u.username === 'alex');
  assert.ok(alex);
  const changed = await admin.req(`/api/admin/users/${alex.id}`, 'PUT', { displayName: alex.displayName, role: 'operator', active: false });
  assert.equal(changed.status, 200, changed.bytes.toString());
  assert.equal((await c.req('/api/records')).status, 401);
});

test('ADMIN last active administrator is protected', async t => {
  const app = await fixture(t), admin = await client(app, 'admin', 'JackeryAdmin!2026');
  const users = (await admin.req('/api/admin/users')).data.items;
  const current = users.find(u => u.username === 'admin');
  const changed = await admin.req(`/api/admin/users/${current.id}`, 'PUT', { displayName: current.displayName, role: 'operator', active: false });
  assert.equal(changed.status, 422);
});

test('DATA invalid numeric quantities and missing English BOM names are rejected', async t => {
  const app = await fixture(t), c = await client(app), admin = await client(app, 'admin', 'JackeryAdmin!2026'), r = await create(c);
  const part = (await c.req('/api/models/1/bom')).data.items[0];
  for (const q of [0, -1, 'NaN', 1000001, 0.00001]) {
    assert.equal((await c.req(`/api/records/${r.id}`, 'PUT', input(r, { materials: [{ bomId: part.id, quantity: q }] }))).status, 422, `quantity ${q}`);
  }
  const invalid = await admin.req('/api/admin/bom', 'POST', { modelId: 1, sku: 'NO-EN-NAME', descriptionEn: '', descriptionZh: '物料', unit: 'pcs', active: true });
  assert.equal(invalid.status, 422);
});

test('DATA no_defect cannot coexist with another appearance defect', async t => {
  const app = await fixture(t), c = await client(app), r = await create(c);
  assert.equal((await c.req(`/api/records/${r.id}`, 'PUT', input(r, { appearanceCodes: ['no_defect', 'scratches'] }))).status, 422);
});

test('DATA invalid outcome/check codes and ownership forgery cannot modify authority', async t => {
  const app = await fixture(t), c = await client(app), r = await create(c);
  assert.equal((await c.req(`/api/records/${r.id}`, 'PUT', input(r, { outcome: 'invented-result' }))).status, 422);
  const forged = await c.req(`/api/records/${r.id}`, 'PUT', { ...input(r), ownerId: 999, ownerName: 'Forged' });
  assert.ok([200, 422].includes(forged.status));
  assert.equal((await c.req(`/api/records/${r.id}`)).data.record.ownerId, r.ownerId);
});

test('MEDIA SVG disguised as PNG is rejected without a photo row', async t => {
  const app = await fixture(t), c = await client(app), r = await create(c);
  const bad = await c.req(`/api/records/${r.id}/photos`, 'POST', { version: r.version, filename: 'fake.png', contentBase64: Buffer.from('<svg onload="alert(1)"></svg>').toString('base64') });
  assert.equal(bad.status, 422);
  assert.equal((await c.req(`/api/records/${r.id}`)).data.record.photos.length, 0);
});

test('SEC private data directories and path traversal are not static content', async t => {
  const app = await fixture(t);
  for (const route of ['/data/database.sqlite', '/data-demo/first-run-accounts.json', '/.git/config', '/%2e%2e%2fPRODUCT_CONTRACT.md']) {
    const result = await fetch(app.baseUrl + route);
    assert.ok([400, 404].includes(result.status), `${route}: ${result.status}`);
  }
});

test('AUTH invalid logins are generic and throttled', async t => {
  const app = await fixture(t);
  let throttled = false;
  for (let i = 0; i < 15; i++) {
    const r = await fetch(app.baseUrl + '/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: app.baseUrl }, body: JSON.stringify({ username: 'alex', password: 'wrong-password' }) });
    assert.ok([401, 429].includes(r.status));
    if (r.status === 429) { throttled = true; break; }
  }
  assert.ok(throttled);
});

test('REAL fresh production has no fictitious models or records and generates private admin credentials', async t => {
  const app = await fixture(t, false);
  assert.equal((await fetch(app.baseUrl + '/api/health').then(r => r.json())).demo, false);
  assert.ok(existsSync(path.join(app.dir, 'first-run-accounts.json')), 'Private bootstrap credentials must exist');
  assert.equal((await fetch(app.baseUrl + '/first-run-accounts.json')).status, 404);
});

test('German work time stores minutes while historical WFR keeps date precision', async t => {
  assert.equal(germanWorkTime(new Date('2026-01-31T23:05:51Z')), '2026-02-01T00:05');
  assert.equal(germanWorkTime(new Date('2026-07-31T22:05:51Z')), '2026-08-01T00:05');
  const app = await fixture(t);
  const alex = await client(app);
  const route = '/api/records';
  const day = '2026-11-17';
  const old = (await alex.req(route, 'POST', {sn:'TEST-LEGACY-WORK-TIME',modelId:1,workDate:day})).data.record;
  const wfr = await alex.req(route+'/'+old.id, 'PUT', input(old,{outcome:'awp'}));
  assert.equal(wfr.status, 200);
  assert.equal(wfr.data.record.status,'wfr');
  assert.equal(wfr.data.record.workTime,undefined);
  assert.equal(wfr.data.record.workDate,day);

  const sn = 'TEST-BERLIN-WORK-TIME';
  for(const workTime of ['2026-02-30T11:23', day+'T24:00', day+'T23:59:00', day+'T23:59Z']){
    assert.equal((await alex.req(route, 'POST', {sn,modelId:1,workTime})).status,422);
  }
  const workTime = day+'T23:59';
  const created = await alex.req(route,'POST',{sn,modelId:1,workDate:'2026-11-18',workTime});
  assert.equal(created.status,201);
  const current = created.data.record;
  assert.equal(current.workDate,day);
  assert.equal(current.workTime,workTime);
  const currentRoute = route+'/'+current.id;
  assert.equal((await alex.req(currentRoute,'PUT',input(current,{workTime:''}))).status,422);
  const updated = await alex.req(currentRoute,'PUT',input(current,{outcome:'awp'}));
  assert.equal(updated.status,200);
  assert.equal(updated.data.record.workTime,workTime);
  assert.equal(updated.data.record.createdAt,current.createdAt);
  const list = await alex.req(route+'?from='+day+'&to='+day);
  assert.deepEqual(list.data.items.filter(r=>r.id===old.id||r.id===current.id).map(r=>[r.id,r.workTime]).sort((a,b)=>a[0]-b[0]),[[old.id,undefined],[current.id,workTime]]);
  assert.equal((await alex.req('/api/sn-history?sn='+sn)).data.items[0].workTime,workTime);
  for(const [lang,header] of [['en','Work Time (Germany)'],['zh','作业时间（德国）']]){
    const workbook = zipFiles((await alex.req('/api/export?language='+lang)).bytes);
    const xml = workbook['xl/worksheets/sheet1.xml'];
    assert.ok(xml.includes(header));
    const exportRow = xml.match(/<row[^>]*>.*?<\/row>/g).find(row=>row.includes(old.sn));
    const headerCell = xml.match(new RegExp('<c r="([A-Z]+)1"[^>]*><is><t[^>]*>'+header.replace(/[()]/g,'\\$&')+'<'));
    assert.ok(headerCell);
    assert.ok(!new RegExp('<c r="'+headerCell[1]+'[0-9]+"[^>]*><is><t[^>]*>[0-9]').test(exportRow));
    assert.ok(xml.includes(day+' 23:59'));
  }

  const supplemented = await alex.req(route+'/'+old.id,'PUT',input(wfr.data.record,{workTime:day+'T08:15'}));
  assert.equal(supplemented.status,200);
  assert.equal(supplemented.data.record.workTime,day+'T08:15');
});

export { zipFiles };
