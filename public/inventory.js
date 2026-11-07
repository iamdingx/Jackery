import {escapeHtml as e} from './state.js';
import {readStockFile} from './stock-file.js';
import {materialsZh,renderMaterialPanel} from './materials.js';
import {ledgerZh,renderInventoryLedger} from './inventory-ledger.js';

const base='/api/admin/inventory';
const sections={query:'Stock Query',open:'Import Opening Stock',adjust:'Stock Adjustment',ledger:'Stock Change History',history:'Usage History',materials:'Material Management'};
const importHint=kind=>kind==='receipt'?'Use sku,quantity to add received stock. A new SKU is initialized and an existing balance is increased.':'Use sku,quantity for opening stock. A SKU can be initialized once.';
const ledgerState={mode:'batches',kind:'all',sku:'',batch:null,page:1};

export const inventoryZh={
  ...materialsZh,
  ...ledgerZh,
  'Material Inventory':'物料库存','Stock Query':'库存查询','Import Opening Stock':'新增导入','Stock Adjustment':'库存调整',
  'Usage History':'历史耗用','Current Stock':'当前库存','Export Stock':'导出当前库存','Item Details':'物料详情',
  'Select a row to see its details.':'选择物料查看详情。','Last Stock Update':'最近库存更新','View Usage History':'查看历史耗用',
  'Search SKU, work order, or serial number':'搜索料号、工单号或序列号','Clear SKU filter':'清除料号筛选',
  'Choose an XLSX or UTF-8 CSV file up to 2 MiB.':'请选择不超过 2 MiB 的 XLSX 或 UTF-8 CSV 文件。',
  'Use the stock template or a single-sheet XLSX file with two columns and no formulas.':'请使用库存模板，或提交一份只有两列、无公式的单工作表 XLSX 文件。',
  'Choose stock file':'选择库存清单','Excel Template':'Excel 模板','Preview List':'预览清单','Confirm Import':'确认新增导入',
  'Confirm Adjustment':'确认库存调整','Use sku,quantity for opening stock. A SKU can be initialized once.':'新增导入使用 sku,quantity。每个料号只初始化一次。',
  'Use sku,delta for adjustments. Positive quantities add stock and negative quantities subtract it.':'库存调整使用 sku,delta。正数增加库存，负数减少库存。',
  'Before':'调整前','Change':'增减量','After':'调整后','Rows updated':'已更新行数','Row':'行','Unknown Part SKU':'未知物料料号',
  'Duplicate Part SKU':'物料料号重复','Invalid stock quantity':'库存数量无效','Expected two columns':'每行须有两列',
  'Stock already imported; use adjustment':'库存已经初始化，请使用库存调整','Import opening stock first':'请先新增导入期初库存',
  'Stock balance is outside the supported range':'库存余额超出支持范围','Inventory list rejected':'库存清单校验失败',
  'Inventory changed. Preview the list again.':'库存已变化，请重新预览清单。','Expected CSV headers: sku,quantity':'CSV 表头应为 sku,quantity',
  'Expected CSV headers: sku,delta':'CSV 表头应为 sku,delta','The stock list is empty':'库存清单为空',
  'Date range is invalid':'日期范围无效','CSV supports at most 5000 data rows':'CSV 最多支持 5000 行数据',
  'Inventory changed. Load a new preview before confirming.':'库存已变化，请重新预览后再确认。','Loading inventory…':'正在加载库存…',
};

export function renderInventory({state,shell,api,t,date,partName}){
  const s=state.inventory??={section:'query',query:{q:'',page:1},history:{q:'',sku:'',from:'',to:'',page:1},batches:{open:{},adjust:{}}};
  const section=s.section,history=section==='history',listing=history||section==='query';
  const filters=history?s.history:s.query,batch=s.batches[section];
  const tr=text=>e(t(text));
  const table=(headers,rows)=>`<div class="table-wrap stock-table"><table><thead><tr>${headers.map(text=>`<th>${tr(text)}</th>`).join('')}</tr></thead><tbody>${rows||`<tr><td colspan="${headers.length}" class="empty">${tr('No records found')}</td></tr>`}</tbody></table></div>`;
  const shellId='stock-workspace';
  const byId=id=>document.getElementById(id);
  const stock=n=>`<strong class="${n<0?'danger':'stock-value'}">${e(n)}</strong>`;
  shell(`<div id="${shellId}" class="inventory-layout"><aside class="panel inventory-nav"><h2>${tr('Material Inventory')}</h2><nav aria-label="${tr('Material Inventory')}">${Object.entries(sections).map(([key,label])=>`<button type="button" data-stock-section="${key}" ${key===section?'aria-current="page"':''}>${tr(label)}</button>`).join('')}</nav></aside><section class="panel inventory-main"><div class="panel-head"><h1>${tr(sections[section])}</h1>${section==='query'?`<a class="button" href="${base}/export?language=${state.lang}">${tr('Export Stock')}</a>`:''}</div><div id="stock-error" class="error-box" role="alert" hidden></div>
    ${section==='materials'?'<div id="material-panel"></div>':section==='ledger'?'<div id="ledger-panel"></div>':listing?`<form id="stock-search" class="search-row">
      <label class="grow">${tr(history?'Search SKU, work order, or serial number':'Search part SKU or description')}<input id="stock-q" value="${e(filters.q)}" maxlength="200"></label>
      ${history?`<label>${tr('From')}<input id="stock-from" type="date" value="${e(filters.from)}"></label><label>${tr('To')}<input id="stock-to" type="date" value="${e(filters.to)}"></label>`:''}
      <button>${tr('Search')}</button>
    </form>${history&&filters.sku?`<p class="stock-filter"><span class="badge">${e(filters.sku)}</span> <button id="stock-clear" type="button">${tr('Clear SKU filter')}</button></p>`:''}
    <div class="${history?'':'stock-query-grid'}"><div id="stock-results" aria-live="polite"></div>${history?'':`<aside id="stock-detail" class="panel stock-detail"></aside>`}</div>`:
    `<p id="stock-import-hint" class="muted">${tr(section==='open'?importHint(batch.kind):'Use sku,delta for adjustments. Positive quantities add stock and negative quantities subtract it.')}</p>
      <form id="stock-upload" class="search-row">${section==='open'?`<label>${tr('Import type')}<select id="stock-kind">
        <option value="open" ${batch.kind!=='receipt'?'selected':''}>${tr('Opening stock')}</option>
        <option value="receipt" ${batch.kind==='receipt'?'selected':''}>${tr('Stock receipt')}</option>
      </select></label>`:''}<label class="grow">${tr('Choose stock file')}<input id="stock-file" type="file" accept=".xlsx,.csv"></label><a class="button" href="${base}/template?kind=${section}&format=xlsx">${tr('Excel Template')}</a><button class="primary">${tr('Preview List')}</button></form>
      <p id="stock-file-status" class="muted" role="status">${e(batch.filename??'')}</p>
      <button id="stock-materials-link" type="button" hidden>${tr('Material Management')}</button><div id="stock-preview"></div>`}
    </section></div>`);
  const workspace=byId(shellId),isCurrent=()=>byId(shellId)===workspace;
  function showError(error){
    if(!isCurrent())return;
    const message=byId('stock-error');
    message.hidden=false;
    message.textContent=[t(error.message),...(Array.isArray(error.details)?error.details.map(x=>`${t('Row')} ${x.row}${x.sku?` · ${x.sku}`:''} · ${t(x.message)}`):[])].join('\n');
    const link=byId('stock-materials-link');
    if(link)link.hidden=!Array.isArray(error.details)||!error.details.some(row=>['Unknown Part SKU','Part SKU is inactive'].includes(row.message));
  }
  const bind=(id,event,fn)=>byId(id)?.addEventListener(event,ev=>Promise.resolve().then(()=>fn(ev)).catch(showError));
  function go(next){
    s.section=next;
    renderInventory({state,shell,api,t,date,partName});
  }
  workspace.querySelectorAll('[data-stock-section]').forEach(btn=>btn.addEventListener('click',()=>go(btn.dataset.stockSection)));
  if(section==='materials'){
    renderMaterialPanel({root:byId('material-panel'),api,t,partName,state:s});
    return;
  }
  if(section==='ledger'){
    renderInventoryLedger({root:byId('ledger-panel'),api,t,date,ledger:s.ledger??={...ledgerState}});
    return;
  }
  bind('stock-materials-link','click',()=>{
    s.materials??={q:'',status:'all',page:1};
    s.materials.importOpen=true;
    go('materials');
  });

  if(listing){
    let sequence=0;
    function detail(item){
      if(history)return;
      byId('stock-detail').innerHTML=`<h2>${tr('Item Details')}</h2>${item?`<p><strong>${e(item.sku)}</strong></p><p>${partName(item)}</p>
        <dl><dt>${tr('Current Stock')}</dt><dd>${stock(item.quantity)} ${e(item.unit??'')}</dd><dt>${tr('Last Stock Update')}</dt><dd>${e(item.updatedAt?date(item.updatedAt):'—')}</dd></dl>
        <div class="row"><button id="stock-view-history" type="button">${tr('View Usage History')}</button>
        <button id="stock-view-ledger" type="button">${tr('View stock changes')}</button></div>`:`<p class="muted">${tr('Select a row to see its details.')}</p>`}`;
      bind('stock-view-history','click',()=>{s.history={q:'',sku:item.sku,from:'',to:'',page:1};go('history');});
      bind('stock-view-ledger','click',()=>{s.ledger={...ledgerState,mode:'movements',sku:item.sku};go('ledger');});
    }
    async function load(){
      const request=++sequence;
      byId('stock-error').hidden=true;
      const result=byId('stock-results');
      result.textContent=t('Loading inventory…');
      detail();
      let data;
      try{data=await api(`${base}${history?'/history':''}?${new URLSearchParams(Object.entries(filters).filter(([,v])=>v))}`);}
      catch(error){if(isCurrent()&&request===sequence){result.textContent='';showError(error);}return;}
      if(!isCurrent()||request!==sequence)return;
      const {items,page,pageSize,total}=data;
      const headers=history?['Part SKU','Part Name','Qty','Work Order','Serial Number','Work Date']:['Part SKU','Part Name','Current Stock','Unit'];
      const rows=items.map((item,i)=>history?
        `<tr><td>${e(item.sku)}</td><td>${partName(item)}</td><td>${e(item.quantity)} ${e(item.unit??'')}</td><td>${e(item.workOrder)}</td><td>${e(item.sn)}</td><td>${e(item.workDate)}</td></tr>`:
        `<tr><td><button class="record-link" type="button" data-stock-row="${i}">${e(item.sku)}</button></td><td>${partName(item)}</td><td>${stock(item.quantity)}</td><td>${e(item.unit??'')}</td></tr>`).join('');
      result.innerHTML=table(headers,rows)+`<div class="pagination"><small>${e(total)} ${tr('items')} · ${tr('Page')} ${page} / ${Math.max(1,Math.ceil(total/pageSize))}</small><div class="row"><button id="stock-prev" ${page<=1?'disabled':''}>${tr('Previous')}</button><button id="stock-next" ${page*pageSize>=total?'disabled':''}>${tr('Next')}</button></div></div>`;
      result.querySelectorAll('[data-stock-row]').forEach(btn=>btn.addEventListener('click',()=>{s.selected=items[Number(btn.dataset.stockRow)].sku;detail(items[Number(btn.dataset.stockRow)]);}));
      if(!history)detail(items.find(item=>item.sku===s.selected)??items[0]);
      bind('stock-prev','click',()=>{filters.page--;return load();});
      bind('stock-next','click',()=>{filters.page++;return load();});
    }
    byId('stock-search').addEventListener('submit',ev=>{
      ev.preventDefault();
      filters.q=byId('stock-q').value.trim();
      if(history){filters.from=byId('stock-from').value;filters.to=byId('stock-to').value;}
      filters.page=1;
      load().catch(showError);
    });
    bind('stock-clear','click',()=>{filters.sku='';filters.page=1;go('history');});
    load().catch(showError);
    return;
  }

  function preview(){
    byId('stock-preview').innerHTML=batch.preview?table(['Part SKU','Part Name','Before','Change','After'],batch.preview.rows.map(row=>`<tr><td>${e(row.sku)}</td><td>${partName(row)}</td><td>${e(row.before)}</td><td>${row.delta>0?'+':''}${e(row.delta)}</td><td>${stock(row.after)}</td></tr>`).join(''))+`<button type="button" class="primary stock-confirm" id="stock-confirm" ${batch.busy?'disabled':''}>${tr(section==='open'?'Confirm Import':'Confirm Adjustment')}</button>`:
      batch.receipt?`<p class="banner" role="status">${tr('Rows updated')} · ${e(batch.receipt.updated)}</p>
        <button id="stock-receipt-ledger" type="button">${tr('View batch details')}</button>`:'';
    bind('stock-receipt-ledger','click',()=>{s.ledger={...ledgerState,batch:batch.receipt};go('ledger');});
    bind('stock-confirm','click',async()=>{
      if(batch.busy)return;
      batch.busy=true;
      preview();
      try{
        batch.receipt=await api(base+'/commit',{method:'POST',body:{kind:batch.previewKind,csv:batch.csv,previewHash:batch.preview.previewHash,requestId:batch.requestId,sourceName:batch.filename??''}});
        delete batch.preview;delete batch.csv;delete batch.filename;
        if(isCurrent()){byId('stock-file').value='';byId('stock-file-status').textContent='';}
      }catch(error){
        if(error.code==='STOCK_PREVIEW_STALE'||error.status===422)delete batch.preview;
        showError(error);
      }finally{
        batch.busy=false;
        if(isCurrent())preview();
        else if(state.inventory===s&&state.view==='inventory'&&s.section===section)go(section);
      }
    });
  }
  bind('stock-kind','change',ev=>{
    if(batch.busy){ev.target.value=batch.kind??'open';return;}
    batch.kind=ev.target.value;
    delete batch.preview;delete batch.receipt;
    byId('stock-import-hint').textContent=t(importHint(batch.kind));
    byId('stock-error').hidden=true;
    byId('stock-materials-link').hidden=true;
    preview();
  });
  bind('stock-file','change',()=>{
    if(batch.busy)return;
    delete batch.preview;delete batch.receipt;delete batch.csv;delete batch.filename;
    byId('stock-error').hidden=true;
    byId('stock-materials-link').hidden=true;
    byId('stock-file-status').textContent='';
    preview();
  });
  byId('stock-upload').addEventListener('submit',async ev=>{
    ev.preventDefault();
    if(batch.busy)return;
    batch.busy=true;
    try{
      const file=byId('stock-file').files[0];
      if(!file&&!batch.csv)throw new Error('Choose an XLSX or UTF-8 CSV file up to 2 MiB.');
      byId('stock-error').hidden=true;
      byId('stock-materials-link').hidden=true;
      const csv=file?await readStockFile(file):batch.csv;
      batch.filename=file?.name??batch.filename;
      batch.csv=csv;
      batch.previewKind=section==='open'?(batch.kind??'open'):section;
      batch.preview=await api(base+'/preview',{method:'POST',body:{kind:batch.previewKind,csv}});
      batch.requestId=Array.from(crypto.getRandomValues(new Uint8Array(16)),b=>b.toString(16).padStart(2,'0')).join('');
      delete batch.receipt;
    }catch(error){delete batch.preview;showError(error);}
    finally{
      batch.busy=false;
      if(isCurrent()){byId('stock-file-status').textContent=batch.filename??'';preview();}
      else if(state.inventory===s&&state.view==='inventory'&&s.section===section)go(section);
    }
  });
  preview();
}
