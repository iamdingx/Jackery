import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { chromium } from 'playwright';
import { startServer } from '../server.js';

async function workspace(t, username) {
  const dataDir = await mkdtemp(path.join(tmpdir(), 'jackery-record-recovery-'));
  const app = await startServer({ dataDir, demo: true, host: '127.0.0.1' });
  t.after(async () => {
    await app.close();
    await rm(dataDir, { recursive: true, force: true });
  });
  const browser = await chromium.launch({
    executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
  });
  t.after(() => browser.close());
  const page = await browser.newPage({ baseURL: app.baseUrl });
  page.setDefaultTimeout(10000);
  await page.goto('/');
  await page.locator('#username').fill(username);
  await page.locator('#password').fill(username === 'alex' ? 'JackeryAlex!2026' : 'JackeryAdmin!2026');
  await page.locator('#login-form button').click();
  await page.locator('#new-record').waitFor();
  const { csrfToken } = await (await page.request.get('/api/session')).json();
  async function api(url, method = 'GET', data) {
    const response = await page.request.fetch(url, {
      method, data, headers: { Origin: app.baseUrl, 'X-CSRF-Token': csrfToken }
    });
    assert.ok(response.ok(), await response.text());
    return response.json();
  }
  return { page, api, dataDir };
}

// Let the real server finish the request, then control when the browser receives it.
async function holdResponse(page, url) {
  const captured = Promise.withResolvers();
  const release = Promise.withResolvers();
  const delivered = Promise.withResolvers();
  await page.route(url, async route => {
    const response = await route.fetch();
    captured.resolve(response);
    await release.promise;
    try {
      await route.fulfill({ response });
    } finally {
      delivered.resolve();
    }
  }, { times: 1 });
  return { captured: captured.promise, release: release.resolve, delivered: delivered.promise };
}

test('a photo upload with an unsaved material correction leaves the completed order and stock intact', async t => {
  const { page, api, dataDir } = await workspace(t, 'admin');
  const [part] = (await api('/api/models/1/bom')).items;
  const inventory = { kind: 'open', csv: 'sku,quantity\n' + part.sku + ',10' };
  const { previewHash } = await api('/api/admin/inventory/preview', 'POST', inventory);
  await api('/api/admin/inventory/commit', 'POST', { ...inventory, previewHash, requestId: randomBytes(16).toString('hex') });
  const created = (await api('/api/records', 'POST', { sn: 'TEST-PHOTO-CORRECTION', modelId: 1 })).record;
  const url = '/api/records/' + created.id;
  await api(url, 'PUT', {
    version: created.version, action: 'complete', outcome: 'scrap', scrapReason: 'Test bench',
    materials: [{ bomId: part.id, quantity: 1 }]
  });
  async function snapshot() {
    const stock = (await api('/api/admin/inventory?q=' + encodeURIComponent(part.sku))).items;
    return {
      record: (await api(url)).record,
      audit: (await api(url + '/audit')).items,
      quantity: stock.find(row => row.sku === part.sku).quantity,
      photos: await readdir(path.join(dataDir, 'photos'))
    };
  }
  const before = await snapshot();
  assert.equal(before.quantity, 9);
  await page.locator('#filters button').click();
  await page.locator('[data-open-record="' + created.id + '"]').click();
  await page.locator('#start-correction').click();
  await page.locator('#correctionReason').fill('Reconcile the removed part');
  await page.locator('[data-remove-material]').click();
  await page.locator('#photo-file').setInputFiles(path.resolve('tests/fixtures/evidence-2x3.jpg'));
  const writes = [];
  page.on('request', request => {
    if (request.method() !== 'GET' && new URL(request.url()).pathname.startsWith('/api/')) {
      writes.push(request.method() + ' ' + new URL(request.url()).pathname);
    }
  });
  // If a regression reaches photo storage, the failed upload must not commit the correction either.
  await page.route('**/api/records/*/photos', route => route.fulfill({
    status: 503, json: { error: { message: 'Photo storage unavailable' } }
  }));
  await page.locator('#upload-photo').click();
  await page.locator('#photo-error:visible').waitFor();
  assert.deepEqual(await snapshot(), before);
  assert.deepEqual(writes, []);
  assert.equal(await page.locator('[data-remove-material]').count(), 0);
  assert.equal(await page.locator('#correctionReason').inputValue(), 'Reconcile the removed part');

  await page.unroute('**/api/records/*/photos');
  await page.locator('#save-correction').click();
  await page.getByText('Saved successfully', { exact: true }).waitFor();
  const corrected = await snapshot();
  assert.equal(corrected.quantity, 10);
  assert.equal(corrected.record.materials.length, 0);
  assert.deepEqual(corrected.photos, before.photos);
  assert.equal(corrected.audit.filter(entry => entry.action === 'correction').length, 1);

  await page.locator('#upload-photo').click();
  await page.locator('#photos img').waitFor();
  const attached = await snapshot();
  assert.deepEqual(writes, ['POST ' + url + '/corrections', 'POST ' + url + '/photos']);
  assert.equal(attached.quantity, corrected.quantity);
  assert.deepEqual(attached.record.materials, corrected.record.materials);
  assert.equal(attached.record.photos.length, 1);
  assert.equal(attached.photos.length, corrected.photos.length + 1);
  assert.equal(attached.audit.filter(entry => entry.action === 'photo_add').length, 1);

  // Start a fresh correction for photo evidence only, with its own audit reason.
  await page.locator('#records-nav').click();
  await page.locator('[data-open-record="' + created.id + '"]').click();
  await page.locator('#start-correction').click();
  await page.locator('#correctionReason').fill('Add another inspection image');
  await page.locator('#photo-file').setInputFiles(path.resolve('tests/fixtures/evidence-2x3.jpg'));
  await page.locator('#upload-photo').click();
  await page.locator('#photos img').nth(1).waitFor();
  const photoOnly = await snapshot();
  assert.deepEqual(writes.slice(2), ['POST ' + url + '/photos']);
  assert.equal(photoOnly.quantity, corrected.quantity);
  assert.deepEqual(photoOnly.record.materials, corrected.record.materials);
  assert.equal(photoOnly.record.photos.length, 2);
  assert.ok(photoOnly.audit.some(entry => entry.action === 'photo_add' && entry.reason === 'Add another inspection image'));
});

test('a delayed detail response cannot replace the last selected work order', async t => {
  const { page } = await workspace(t, 'admin');
  const first = await holdResponse(page, '**/api/records/1');
  await page.locator('[data-open-record="1"]').click();
  await first.captured;
  try {
    await page.locator('[data-open-record="2"]').click();
    await page.waitForFunction(() => document.querySelector('#sn')?.value === 'DEMO-WFR-001');
  } finally {
    first.release();
  }
  await first.delivered;
  await page.waitForLoadState('networkidle');
  assert.equal(await page.locator('#sn').inputValue(), 'DEMO-WFR-001');
});

test('text entered after Save survives the delayed response and persists on the next save', async t => {
  const { page, api } = await workspace(t, 'alex');
  const url = '/api/records/2';
  await page.locator('[data-open-record="2"]').click();
  const notes = page.locator('#issueNotes');
  await notes.fill('A - submitted');
  const save = await holdResponse(page, '**' + url);
  await page.locator('#save-record').click();
  try {
    assert.equal((await save.captured).status(), 200);
    await notes.fill('B - typed while saving');
  } finally {
    save.release();
  }
  await save.delivered;
  await page.waitForFunction(() => document.querySelector('#save-record')?.disabled === false);
  assert.equal((await api(url)).record.issueNotes, 'A - submitted');
  assert.equal(await notes.inputValue(), 'B - typed while saving');
  const nextSave = page.waitForResponse(r => new URL(r.url()).pathname === url && r.request().method() === 'PUT');
  await page.locator('#save-record').click();
  assert.equal((await nextSave).status(), 200);
  assert.equal((await api(url)).record.issueNotes, 'B - typed while saving');
});

test('retrying a lost creation response reuses the order and a new same-SN visit gets its own order', async t => {
  const { page, api } = await workspace(t, 'alex');
  const sn = 'TEST-LOST-RESPONSE';
  async function enterVisit() {
    await page.locator('#new-record').click();
    await page.locator('#sn').fill(sn);
    await page.locator('#modelId').selectOption('1');
    await page.locator('#issueNotes').fill('Repeatable inspection');
  }
  const orders = async () => (await api('/api/records?q=' + sn)).items;
  await enterVisit();
  await page.route('**/api/records', async route => {
    await route.fetch();
    await route.abort('connectionreset');
  }, { times: 1 });
  await page.locator('#save-record').click();
  await page.locator('#form-error:visible').waitFor();
  const afterLoss = await orders();
  assert.equal(afterLoss.length, 1);
  await page.locator('#save-record').click();
  await page.getByText('Saved successfully', { exact: true }).waitFor();
  assert.deepEqual((await orders()).map(order => order.id), [afterLoss[0].id]);
  assert.equal((await api('/api/records/' + afterLoss[0].id)).record.issueNotes, 'Repeatable inspection');

  await page.locator('#records-nav').click();
  await enterVisit();
  await page.locator('#save-record').click();
  await page.getByText('Saved successfully', { exact: true }).waitFor();
  const separate = await orders();
  assert.equal(separate.length, 2);
  assert.equal(new Set(separate.map(order => order.workOrder)).size, 2);
});

test('discarded edits stay discarded after returning to Current Record and saving another field', async t => {
  const { page, api } = await workspace(t, 'alex');
  const url = '/api/records/2';
  const original = (await api(url)).record.issueNotes;
  await page.locator('[data-open-record="2"]').click();
  await page.locator('#issueNotes').fill('Discard this edit');
  page.once('dialog', dialog => dialog.accept());
  await page.locator('#records-nav').click();
  await page.locator('#filters').waitFor();
  await page.locator('#current-nav').click();
  const restored = await page.locator('#issueNotes').inputValue();
  await page.locator('#appearanceNotes').fill('A later inspection');
  await page.locator('#save-record').click();
  await page.getByText('Saved successfully', { exact: true }).waitFor();
  const saved = (await api(url)).record;
  assert.equal(restored, original);
  assert.equal(saved.issueNotes, original);
  assert.equal(saved.appearanceNotes, 'A later inspection');
});

test('after a failed follow-up filter, exports match the displayed list before and after retry', async t => {
  const { page } = await workspace(t, 'admin');
  const rows = page.locator('[data-open-record]');
  const selected = page.locator('[data-follow-up][aria-pressed=true]');
  async function exportFilter() {
    const pending = page.waitForEvent('download');
    await page.locator('#export-records').click();
    const download = await pending;
    assert.equal(await download.failure(), null);
    return new URL(download.url()).searchParams.get('followUp');
  }
  const original = await rows.allTextContents();
  assert.ok(original.length > 1);
  await page.route('**/api/records?**', route => route.fulfill({
    status: 503, json: { error: { message: 'Search unavailable' } }
  }), { times: 1 });
  const awp = page.locator('[data-follow-up="awp"]');
  await awp.click();
  await page.locator('#page-error:visible').waitFor();
  assert.equal(await selected.getAttribute('data-follow-up'), '');
  assert.deepEqual(await rows.allTextContents(), original);
  assert.equal(await exportFilter(), null);
  await awp.click();
  await page.locator('[data-follow-up="awp"][aria-pressed=true]').waitFor();
  assert.equal(await rows.count(), 1);
  assert.equal(await rows.first().getAttribute('data-open-record'), '2');
  assert.equal(await exportFilter(), 'awp');
});
