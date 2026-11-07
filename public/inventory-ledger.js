import {escapeHtml as e} from './state.js';

const batchKinds={open:'Opening stock',receipt:'Stock receipt',adjust:'Stock Adjustment'};
const movementKinds={...batchKinds,complete:'Work order usage',correction:'Work order correction'};

export const ledgerZh={
  'Stock Change History':'库存变更记录','Stock Batches':'批次记录','Stock Movements':'库存流水',
  'Stock Import':'库存导入','Opening stock':'期初库存','Stock receipt':'到货入库',
  'Work order usage':'工单扣料','Work order correction':'工单更正',
  'Source file':'来源文件','Batch ID':'批次编号','Recorded at':'变更时间','Operator':'操作人',
  'Reference':'关联单据','Affected SKUs':'物料行数','View batch details':'查看批次明细',
  'Back to stock batches':'返回批次记录','View stock changes':'查看库存变更',
  'Import type':'导入类型',
  'Use sku,quantity to add received stock. A new SKU is initialized and an existing balance is increased.':'到货入库使用 sku,quantity。未初始化的料号建立库存，已有余额的料号按到货数量增加。',
};

export function renderInventoryLedger({root,api,t,date,ledger}){
  const tr=label=>e(t(label));
  const byId=id=>root.querySelector('#'+id);
  const signed=value=>(value>0?'+':'')+e(value);
  let sequence=0;
  const showError=error=>{
    if(!root.isConnected)return;
    const box=byId('ledger-error');
    box.hidden=false;
    box.textContent=t(error.message);
  };
  const bind=(id,event,fn)=>byId(id)?.addEventListener(event,ev=>Promise.resolve().then(()=>fn(ev)).catch(showError));

  async function load(){
    const request=++sequence,batch=ledger.batch,showBatches=ledger.mode==='batches'&&!batch;
    root.innerHTML=`
      <div class="row" aria-label="${tr('Stock Change History')}">
        <button type="button" id="ledger-batches" aria-pressed="${showBatches}">${tr('Stock Batches')}</button>
        <button type="button" id="ledger-movements" aria-pressed="${!showBatches&&!batch}">${tr('Stock Movements')}</button>
      </div>
      ${batch?`<div class="ledger-summary"><h2>${e(batch.sourceName||t('View batch details'))}</h2>
        <p class="muted">${tr(batchKinds[batch.kind])} · ${e(batch.requestId)}</p>
        <button type="button" id="ledger-back">${tr('Back to stock batches')}</button></div>`:''}
      <form id="ledger-filter" class="search-row">
        ${showBatches?`<label>${tr('Import type')}<select id="ledger-kind">${Object.entries({all:'All',import:'Stock Import',adjust:'Stock Adjustment'}).map(([kind,label])=>`<option value="${kind}" ${ledger.kind===kind?'selected':''}>${tr(label)}</option>`).join('')}</select></label>`:
          `<label class="grow">${tr('Part SKU')}<input id="ledger-sku" value="${e(ledger.sku)}" maxlength="200"></label>`}
        <button>${tr('Search')}</button>
      </form>
      <div id="ledger-error" class="error-box" role="alert" hidden></div>
      <div id="ledger-results" aria-live="polite">${tr('Loading inventory…')}</div>`;

    function select(mode){
      ledger.mode=mode;ledger.batch=null;ledger.sku='';ledger.page=1;
      return load();
    }
    bind('ledger-batches','click',()=>select('batches'));
    bind('ledger-movements','click',()=>select('movements'));
    bind('ledger-back','click',()=>select('batches'));
    bind('ledger-filter','submit',ev=>{
      ev.preventDefault();
      if(showBatches)ledger.kind=byId('ledger-kind').value;
      else ledger.sku=byId('ledger-sku').value.trim();
      ledger.page=1;
      return load();
    });
    const query=new URLSearchParams(showBatches?{page:ledger.page,kind:ledger.kind}:
      {page:ledger.page,sku:ledger.sku,...(batch?{batch:batch.requestId}:{})});
    let data;
    try{data=await api('/api/admin/inventory/'+(showBatches?'batches':'movements')+'?'+query);}
    catch(error){
      if(root.isConnected&&request===sequence){byId('ledger-results').textContent='';showError(error);}
      return;
    }
    if(!root.isConnected||request!==sequence)return;
    const {items,total,page,pageSize}=data;
    const headers=showBatches?['Recorded at','Import type','Source file','Operator','Affected SKUs','Batch ID','Action']:
      ['Recorded at','Part SKU','Status','Before','Change','After','Operator','Reference'];
    const rows=items.map((item,index)=>showBatches?`<tr>
      <td>${e(date(item.appliedAt))}</td><td>${tr(batchKinds[item.kind])}</td><td>${e(item.sourceName||'—')}</td>
      <td>${e(item.actorName||'—')}</td><td>${e(item.updated)}</td><td class="ledger-reference">${e(item.requestId)}</td>
      <td><button type="button" data-ledger-batch="${index}">${tr('View batch details')}</button></td>
    </tr>`:`<tr>
      <td>${e(date(item.createdAt))}</td><td>${e(item.sku)}</td><td>${tr(movementKinds[item.kind])}</td>
      <td>${e(item.before)}</td><td>${signed(item.delta)}</td><td>${e(item.after)}</td><td>${e(item.actorName||'—')}</td>
      <td class="ledger-reference">${e(item.sourceName||item.reference)}${item.sourceName?`<br><small>${e(item.reference)}</small>`:''}</td>
    </tr>`).join('');
    const results=byId('ledger-results');
    results.innerHTML=`<div class="table-wrap stock-table"><table><thead><tr>${headers.map(h=>`<th>${tr(h)}</th>`).join('')}</tr></thead>
      <tbody>${rows||`<tr><td colspan="${headers.length}" class="empty">${tr('No records found')}</td></tr>`}</tbody></table></div>
      <div class="pagination"><small>${e(total)} ${tr('items')} · ${tr('Page')} ${page} / ${Math.max(1,Math.ceil(total/pageSize))}</small>
      <div class="row"><button id="ledger-prev" ${page<=1?'disabled':''}>${tr('Previous')}</button>
      <button id="ledger-next" ${page*pageSize>=total?'disabled':''}>${tr('Next')}</button></div></div>`;
    results.querySelectorAll('[data-ledger-batch]').forEach(button=>button.addEventListener('click',()=>{
      ledger.batch=items[Number(button.dataset.ledgerBatch)];ledger.sku='';ledger.page=1;
      load().catch(showError);
    }));
    bind('ledger-prev','click',()=>{ledger.page--;return load();});
    bind('ledger-next','click',()=>{ledger.page++;return load();});
  }
  load().catch(showError);
}
