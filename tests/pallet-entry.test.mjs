import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
import { startServer } from '../server.js';

test('pallet fields follow the work stages and survive WFR, completion and admin correction', { timeout: 60000 }, async t => {
  const temp = path.resolve('tests/.tmp');
  await mkdir(temp, { recursive: true });
  const app = await startServer({ dataDir: await mkdtemp(path.join(temp, 'pallet-entry-')), demo: true });
  t.after(() => app.close());
  const browser = await chromium.launch({ headless: true, executablePath: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe' });
  t.after(() => browser.close());
  const page = await browser.newPage({ viewport: { width: 1366, height: 768 } });
  await page.goto(app.baseUrl);
  await page.locator('#username').fill('admin');
  await page.locator('#password').fill('JackeryAdmin!2026');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.locator('#new-record').click();

  const source = page.locator('.identity #sourcePallet');
  const destination = page.locator('.actions #storagePallet');
  assert.equal(await source.isDisabled(), true);
  assert.equal(await destination.isDisabled(), true);
  await page.locator('#modelId').selectOption('1');
  assert.equal(await source.isDisabled(), true);
  await page.locator('#sn').fill('PALLET-ENTRY-001');
  await source.fill('0007-A');
  await source.press('Enter');
  await page.locator('input[name=outcome][value=awp]').check();
  await page.locator('#save-record').click();
  await page.getByText('Saved successfully', { exact: true }).waitFor();
  const reloadButton = await page.locator('#reload-record').elementHandle();
  await page.locator('#reload-record').click();
  await page.waitForFunction(button => !button.isConnected, reloadButton);
  assert.equal(await source.inputValue(), '0007-A');
  assert.equal(await destination.inputValue(), '');

  await destination.fill('0019-B');
  await page.locator('input[name=outcome][value=scrap]').check();
  await page.locator('#scrapReason').fill('Local test record');
  assert.equal(await destination.inputValue(), '0019-B');
  const footerControls = ['#storagePallet', '#view-audit', '#save-record', '#complete-record'];
  for (const language of ['en', 'zh']) {
    await page.getByLabel(language === 'en' ? 'Completion Pallet No.' : '完成后栈板号', { exact: true }).waitFor();
    for (const width of [1101, 1366, 1536, 1775]) {
      await page.setViewportSize({ width, height: 768 });
      const boxes = await Promise.all(footerControls.map(selector => page.locator(selector).boundingBox()));
      for (const [index, box] of boxes.entries()) {
        assert.ok(box.x >= 0 && box.x + box.width <= width, `${language} ${width}px: ${footerControls[index]} stays within the viewport`);
        assert.ok(Math.abs(box.y + box.height / 2 - boxes[0].y - boxes[0].height / 2) <= 4,
          `${language} ${width}px: ${footerControls[index]} stays on the pallet row`);
        if (index) assert.ok(box.x >= boxes[index - 1].x + boxes[index - 1].width, `${footerControls[index]} does not overlap`);
      }
    }
    await page.locator('#language').click();
  }
  await page.getByLabel('Completion Pallet No.', { exact: true }).waitFor();
  for (const width of [1366, 900, 390]) {
    await page.setViewportSize({ width, height: 768 });
    assert.ok(await destination.isVisible());
    const bounds = await destination.boundingBox();
    assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= width, `destination stays within the ${width}px viewport`);
  }
  await page.locator('#complete-record').click();
  await page.locator('#start-correction').waitFor();
  assert.equal(await source.isDisabled(), true);
  assert.equal(await destination.isDisabled(), true);
  assert.equal(await destination.inputValue(), '0019-B');

  await page.locator('#start-correction').click();
  await destination.fill('0020-C');
  await page.locator('#correctionReason').fill('Local test of pallet correction');
  await page.locator('#save-correction').click();
  await page.locator('#start-correction').waitFor();
  assert.equal(await source.inputValue(), '0007-A');
  assert.equal(await destination.inputValue(), '0020-C');
  await page.locator('#language').click();
  await page.getByLabel('来源栈板号', { exact: true }).waitFor();
  assert.equal(await page.getByLabel('完成后栈板号', { exact: true }).inputValue(), '0020-C');
});
