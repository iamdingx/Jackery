import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { inflateRawSync } from 'node:zlib';
import { startServer } from '../server.js';

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

async function client(app, username = 'alex', password = 'HuabaoAlex!2026') {
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
  const alex = await client(app), blair = await client(app, 'blair', 'HuabaoBlair!2026');
  const foreign = await create(blair, 'PRIVATE-FOREIGN-SN');
  const mine = await create(alex, 'MY-ONLY-SN');
  const list = await alex.req('/api/records?pageSize=100');
  assert.equal(list.status, 200);
  assert.ok(list.data.items.some(r => r.id === mine.id));
  assert.ok(!list.data.items.some(r => r.id === foreign.id));
  assert.equal((await alex.req(`/api/records/${foreign.id}`)).status, 403);
});

test('AC-02 exact SN read-only exception never grants editing or broad search', async t => {
  const app = await fixture(t), alex = await client(app), blair = await client(app, 'blair', 'HuabaoBlair!2026');
  const r = await create(blair, 'EXACT-SN-REF-001');
  const history = await alex.req('/api/sn-history?sn=EXACT-SN-REF-001');
  assert.equal(history.status, 200);
  assert.ok(history.data.items.some(x => x.id === r.id));
  assert.equal((await alex.req(`/api/records/${r.id}?historySn=EXACT-SN-REF-001`)).status, 200);
  assert.ok((await alex.req('/api/sn-history?sn=EXACT-SN-REF')).data.items.length === 0);
  assert.ok([400, 422].includes((await alex.req('/api/sn-history?sn=')).status));
  assert.equal((await alex.req(`/api/records/${r.id}`, 'PUT', input(r, { issueNotes: 'Unauthorized takeover' }))).status, 403);
});

test('AC-03 repeated SN creates separate work orders without overwriting', async t => {
  const app = await fixture(t), c = await client(app);
  const first = await create(c, 'REPEAT-001'), second = await create(c, 'REPEAT-001');
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
  const audit = await c.req(`/api/records/${r.id}/audit`);
  assert.ok(audit.data.items.length >= 2);
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
  const app = await fixture(t), c = await client(app), admin = await client(app, 'admin', 'HuabaoAdmin!2026'), r = await create(c);
  const done = (await c.req(`/api/records/${r.id}`, 'PUT', input(r, { outcome: 'scrap', scrapReason: 'Damaged case', action: 'complete' }))).data.record;
  assert.equal((await c.req(`/api/records/${r.id}`, 'PUT', input(done, { issueNotes: 'cannot edit' }))).status, 403);
  assert.equal((await admin.req(`/api/records/${r.id}/corrections`, 'POST', { version: done.version, reason: '', changes: input(done, { issueNotes: 'adjust' }) })).status, 422);
});

test('AC-15 corrections retain before/after/actor/reason and original owner', async t => {
  const app = await fixture(t), c = await client(app), admin = await client(app, 'admin', 'HuabaoAdmin!2026'), r = await create(c);
  const fixed = await admin.req(`/api/records/${r.id}/corrections`, 'POST', { version: r.version, reason: 'Correct transcription', changes: input(r, { issueNotes: 'Corrected issue text' }) });
  assert.equal(fixed.status, 200, fixed.bytes.toString());
  assert.equal(fixed.data.record.ownerId, r.ownerId);
  const audit = (await admin.req(`/api/records/${r.id}/audit`)).data.items;
  const correction = audit.find(x => x.reason === 'Correct transcription');
  assert.ok(correction);
  assert.ok(correction.before && correction.after && correction.actorId && correction.createdAt);
  assert.equal(correction.after.issueNotes, 'Corrected issue text');
});

test('AC-16 four-sheet export is complete, inert and permission scoped', async t => {
  const app = await fixture(t), c = await client(app), other = await client(app, 'blair', 'HuabaoBlair!2026');
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
  const app = await fixture(t), c = await client(app), admin = await client(app, 'admin', 'HuabaoAdmin!2026'), r = await create(c);
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
  const app = await fixture(t), c = await client(app, 'admin', 'HuabaoAdmin!2026');
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
  const app = await fixture(t), c = await client(app), admin = await client(app, 'admin', 'HuabaoAdmin!2026');
  const users = (await admin.req('/api/admin/users')).data.items;
  const alex = users.find(u => u.username === 'alex');
  assert.ok(alex);
  const changed = await admin.req(`/api/admin/users/${alex.id}`, 'PUT', { displayName: alex.displayName, role: 'operator', active: false });
  assert.equal(changed.status, 200, changed.bytes.toString());
  assert.equal((await c.req('/api/records')).status, 401);
});

test('ADMIN last active administrator is protected', async t => {
  const app = await fixture(t), admin = await client(app, 'admin', 'HuabaoAdmin!2026');
  const users = (await admin.req('/api/admin/users')).data.items;
  const current = users.find(u => u.username === 'admin');
  const changed = await admin.req(`/api/admin/users/${current.id}`, 'PUT', { displayName: current.displayName, role: 'operator', active: false });
  assert.equal(changed.status, 422);
});

test('DATA invalid numeric quantities and missing English BOM names are rejected', async t => {
  const app = await fixture(t), c = await client(app), admin = await client(app, 'admin', 'HuabaoAdmin!2026'), r = await create(c);
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

export { zipFiles };
