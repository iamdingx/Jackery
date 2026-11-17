import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import path from 'node:path';
import {chromium} from 'playwright';
import {startServer} from '../server.js';
import {openStore} from '../src/store.js';
import {substitutionKey} from '../src/bom-substitutions.js';

test('browser shows substitution levels, stock availability and the shared usage limit', {timeout:60000}, async t=>{
  const dir=await mkdtemp(path.resolve('tests/.tmp/substitution-browser-'));
  t.after(()=>rm(dir,{recursive:true,force:true}));
  const store=openStore(dir,true);
  let modelId;
  try{
    const model=store.get('models',1);
    modelId=model.id;
    store.put('models',{...model,catalogKey:'test-model'});
    const groups=[];
    for(const [label,stock] of [['top',0],['bottom',2]]){
      const group={id:label+'-MAIN',label,cap:4,originals:[label+'-MAIN'],
        options:[{sku:label+'-LEVEL1',originalSku:label+'-MAIN',level:1},
          {sku:label+'-LEVEL2',originalSku:label+'-MAIN',level:2,gateSku:label+'-LEVEL1'}]};
      for(const [sku,name] of [[group.id,'Original'],...group.options.map(opt=>[opt.sku,'Substitute '+opt.level])]){
        store.put('bom',{id:store.next('bom'),modelId,sku,active:true,category:'packaging',descriptionEn:name,descriptionZh:'物料',unit:'pcs',
          standardQty:4,quantityControl:'standard_hard_cap',substituteOnly:sku!==group.id});
      }
      store.db.prepare("INSERT INTO inventory(sku,quantity,opened_at,updated_at) VALUES(?,?,'','')").run(label+'-LEVEL1',stock);
      groups.push(group);
    }
    store.put('bom',{id:store.next('bom'),modelId,sku:'bottom-ZZ-REGULAR',active:true,category:'packaging',descriptionEn:'Regular packaging',descriptionZh:'普通物料',unit:'pcs'});
    store.db.prepare('INSERT INTO meta VALUES(?,?)').run(substitutionKey,JSON.stringify({models:[{catalogKey:'test-model',groups}]}));
  }finally{store.db.close();}
  const app=await startServer({dataDir:dir,demo:true});
  const browser=await chromium.launch({headless:true,executablePath:'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'});
  try{
    const page=await browser.newPage({viewport:{width:1366,height:768}});
    const el=id=>page.locator('#'+id);
    await page.goto(app.baseUrl);
    await el('username').fill('alex');
    await el('password').fill('JackeryAlex!2026');
    await page.getByRole('button',{name:'Sign in',exact:true}).click();
    await el('new-record').click();
    await el('sn').fill('LOCAL-SUBSTITUTE-CASE');
    await el('modelId').selectOption(String(modelId));
    await el('open-bom').click();
    await page.locator('[data-bom-category="packaging"]').click();
    const drawer=el('bom-dialog');
    const group=drawer.locator('tr[data-bom-group="bottom-MAIN"]');
    await group.first().waitFor({timeout:4000});
    assert.equal(await drawer.locator('#bom-results [aria-expanded]').count(),0);
    assert.deepEqual(await group.locator('input').count(),3);
    assert.match(await group.nth(0).innerText(),/bottom-MAIN/);
    assert.match(await group.nth(1).innerText(),/bottom-LEVEL1/);
    assert.match(await group.nth(2).innerText(),/bottom-LEVEL2/);
    const following=drawer.locator('tr[data-bom-group="bottom-MAIN"] + tr:not([data-bom-group])');
    assert.match(await following.innerText(),/bottom-ZZ-REGULAR/);
    const ordinaryX=(await following.locator('input').boundingBox()).x;
    const originalX=(await group.nth(0).locator('input').boundingBox()).x;
    const substituteX=(await group.nth(1).locator('input').boundingBox()).x;
    assert.ok(Math.abs(originalX-ordinaryX)<=1,`Original checkbox ${originalX} must align with regular checkbox ${ordinaryX}`);
    assert.ok(substituteX>originalX,`Substitute checkbox ${substituteX} must be indented from original ${originalX}`);
    assert.notEqual(await group.nth(1).locator('td').first().evaluate(td=>getComputedStyle(td).backgroundColor),
      await following.locator('td').first().evaluate(td=>getComputedStyle(td).backgroundColor));
    assert.equal(await group.nth(1).locator('.substitution-connector').count(),1);
    assert.equal(await following.locator('.substitution-connector').count(),0);
    const top=page.locator('#bom-results tr').filter({hasText:'top-LEVEL2'});
    const bottom=page.locator('#bom-results tr').filter({hasText:'bottom-LEVEL2'});
    assert.ok(await bottom.locator('input').isDisabled());
    assert.match(await bottom.innerText(),/First-level stock is above zero/);
    assert.match(await top.innerText(),/Second-level substitute/);
    await top.locator('input').check();
    await page.locator('[data-pending-qty]').fill('2');
    assert.match(await el('bom-total-top-MAIN').innerText(),/2 \/ 4/);
    await el('bom-language').click();
    await page.getByText('二级替代',{exact:true}).first().waitFor();
    assert.equal(await page.locator('[data-pending-qty]').inputValue(),'2');
    await el('bom-add').click();
    const row=page.locator('#material-rows tr').filter({hasText:'top-LEVEL2'});
    assert.match(await row.innerText(),/二级替代/);
    const saving=page.waitForResponse(r=>/\/api\/records\/\d+$/.test(r.url())&&r.request().method()==='PUT');
    await el('save-record').click();
    const response=await saving;
    assert.equal(response.status(),200);
    const payload=await response.json();
    assert.equal(payload.record.materials[0].substitution.level,2);
    assert.equal(payload.record.materials[0].quantity,2);
  }finally{
    await browser.close();
    await app.close();
  }
});
