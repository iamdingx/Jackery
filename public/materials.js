import {escapeHtml as e} from './state.js';
import {readStockFile} from './stock-file.js';

const endpoint='/api/admin/materials';
const dispositions={new:'New material',existing:'Existing SKU',product:'Finished product SKU'};
const sources={bom:'Model BOM',registered:'Material master',inventory:'Inventory record'};

export const materialsZh={
  'Material Management':'物料管理','Material master':'物料档案','Model BOM':'机型 BOM','Inventory record':'库存记录',
  'Material list':'物料清单','Import materials':'导入物料','Enabled':'已启用','Disabled':'已停用',
  'Enable':'启用','Disable':'停用','Source':'来源','Status updated':'状态已更新',
  'Manage material SKUs used for stock imports and BOM selection.':'维护库存导入和 BOM 选料使用的物料料号。',
  'Disabled materials stay visible in inventory and history. New stock imports and additions to work orders are blocked.':'停用料号仍可在库存和历史中查看。停用后禁止导入库存，也不能新增到工单。',
  'Choose material file':'选择物料文件','Confirm material import':'确认导入物料','New material':'新增物料',
  'Existing SKU':'已存在料号','Finished product SKU':'整机料号','Skipped rows':'跳过行数','Created rows':'新增行数',
  'Preview shows new rows and rows that will be skipped.':'预览显示将新增和跳过的行。',
  'Import a material template or an OMS XLSX/CSV export with SKU and product name.':'上传物料模板，或包含 SKU 和产品名称的 OMS XLSX／CSV 导出文件。',
  'Use a single-sheet material XLSX file without formulas, or a UTF-8 CSV file.':'请使用无公式的单工作表物料 XLSX 文件或 UTF-8 CSV 文件。',
  'Material list needs SKU and product name columns. Use the material template or an OMS export.':'物料清单需要 SKU 和产品名称列，请使用物料模板或 OMS 导出文件。',
  'The material list is empty':'物料清单为空','Invalid material SKU':'物料料号格式无效',
  'Invalid material status':'物料状态无效','Material list rejected':'物料清单校验失败',
  'Material list changed. Preview the file again.':'物料清单已变化，请重新预览文件。',
  'Part SKU is inactive':'物料料号已停用','Product SKU is not a material':'整机料号不能作为物料导入库存',
  'Part Name is required':'物料名称不能为空','Choose an XLSX or UTF-8 CSV file up to 2 MiB.':'请选择不超过 2 MiB 的 XLSX 或 UTF-8 CSV 文件。',
};

export function renderMaterialPanel({root,api,t,partName,state}){
  const s=state.materials??={q:'',status:'all',page:1};
  const tr=text=>e(t(text));
  const materialName=item=>item.descriptionEn?partName(item):e(item.descriptionZh||'—');
  const byId=id=>root.querySelector('#'+id);
  const table=(heads,rows)=>`<div class="table-wrap stock-table"><table><thead><tr>${heads.map(h=>`<th>${tr(h)}</th>`).join('')}</tr></thead><tbody>${rows||`<tr><td colspan="${heads.length}" class="empty">${tr('No records found')}</td></tr>`}</tbody></table></div>`;
  root.innerHTML=`
    <p class="muted">${tr('Manage material SKUs used for stock imports and BOM selection.')}</p>
    <div id="material-error" class="error-box" role="alert" hidden></div>
    <div id="material-status" class="muted" role="status"></div>
    <details class="panel material-import" ${s.importOpen?'open':''}>
      <summary>${tr('Import materials')}</summary>
      <p class="muted">${tr('Import a material template or an OMS XLSX/CSV export with SKU and product name.')}</p>
      <form id="material-upload" class="search-row">
        <label class="grow">${tr('Choose material file')}<input id="material-file" type="file" accept=".xlsx,.csv"></label>
        <a class="button" href="${endpoint}/template">${tr('Excel Template')}</a>
        <button class="primary">${tr('Preview List')}</button>
      </form>
      <p id="material-file-name" class="muted">${e(s.filename??'')}</p>
      <div id="material-import-error" class="error-box" role="alert" hidden></div>
      <div id="material-preview" aria-live="polite"></div>
    </details>
    <form id="material-search" class="search-row">
      <label class="grow">${tr('Search part SKU or description')}<input id="material-q" value="${e(s.q)}" maxlength="200"></label>
      <label>${tr('Status')}<select id="material-filter">${Object.entries({all:'All',active:'Enabled',inactive:'Disabled'}).map(([value,label])=>`<option value="${value}" ${s.status===value?'selected':''}>${tr(label)}</option>`).join('')}</select></label>
      <button>${tr('Search')}</button>
    </form>
    <p class="muted">${tr('Disabled materials stay visible in inventory and history. New stock imports and additions to work orders are blocked.')}</p>
    <div id="material-list" aria-live="polite"></div>`;
  root.querySelector('details').addEventListener('toggle',event=>{s.importOpen=event.currentTarget.open;});

  function showError(error,id){
    if(!root.isConnected)return;
    const box=byId(id);
    box.hidden=false;
    const details=Array.isArray(error.details)?error.details.map(x=>`${t('Row')} ${x.row} · ${x.sku||''} · ${t(x.message)}`):[];
    box.textContent=[t(error.message),...details].join('\n');
  }
  const bind=(id,event,fn,errorId='material-error')=>byId(id)?.addEventListener(event,ev=>{
    Promise.resolve().then(()=>fn(ev)).catch(error=>showError(error,errorId));
  });
  let sequence=0;
  async function load(){
    const request=++sequence;
    byId('material-error').hidden=true;
    const list=byId('material-list');
    list.textContent=t('Loading inventory…');
    const query=new URLSearchParams({q:s.q,status:s.status,page:s.page});
    let data;
    try{data=await api(endpoint+'?'+query);}
    catch(error){
      if(root.isConnected&&request===sequence){list.textContent='';showError(error,'material-error');}
      return;
    }
    if(!root.isConnected||request!==sequence)return;
    const {items,total,page,pageSize}=data;
    const rows=items.map((item,index)=>`<tr>
      <td>${e(item.sku)}</td><td>${materialName(item)}</td><td>${e(item.unit)}</td><td>${tr(sources[item.source])}</td>
      <td>${tr(item.active?'Enabled':'Disabled')}</td>
      <td><button type="button" data-material-status="${index}">${tr(item.active?'Disable':'Enable')}</button></td>
    </tr>`).join('');
    list.innerHTML=table(['Part SKU','Part Name','Unit','Source','Status','Action'],rows)
      +`<div class="pagination"><small>${total} ${tr('items')} · ${tr('Page')} ${page} / ${Math.max(1,Math.ceil(total/pageSize))}</small>
      <div class="row"><button id="material-prev" ${page<=1?'disabled':''}>${tr('Previous')}</button>
      <button id="material-next" ${page*pageSize>=total?'disabled':''}>${tr('Next')}</button></div></div>`;
    list.querySelectorAll('[data-material-status]').forEach(button=>button.addEventListener('click',async()=>{
      const item=items[Number(button.dataset.materialStatus)];
      button.disabled=true;
      try{
        await api(endpoint+'/status',{method:'PUT',body:{sku:item.sku,active:!item.active}});
        if(!root.isConnected)return;
        byId('material-status').textContent=`${t('Status updated')} · ${item.sku}`;
        if(s.status!=='all'&&items.length===1&&s.page>1)s.page--;
        await load();
      }catch(error){showError(error,'material-error');}
      finally{button.disabled=false;}
    }));
    bind('material-prev','click',()=>{s.page--;return load();});
    bind('material-next','click',()=>{s.page++;return load();});
  }
  bind('material-search','submit',ev=>{
    ev.preventDefault();
    s.q=byId('material-q').value.trim();s.status=byId('material-filter').value;s.page=1;
    return load();
  });
  function renderPreview(){
    if(!root.isConnected)return;
    const panel=byId('material-preview');
    if(!s.preview){
      panel.innerHTML=s.receipt?`<p class="banner" role="status">${tr('Created rows')} · ${s.receipt.created} · ${tr('Skipped rows')} · ${s.receipt.skipped}</p>`:'';
      return;
    }
    const {rows}=s.preview;
    const newCount=rows.filter(row=>row.status==='new').length;
    panel.innerHTML=`<p class="muted">${tr('Preview shows new rows and rows that will be skipped.')}</p>
      <p>${tr('New material')} · ${newCount} · ${tr('Skipped rows')} · ${rows.length-newCount}</p>`
      +table(['Row','Part SKU','Part Name','Unit','Status'],rows.map(row=>`<tr><td>${row.row}</td><td>${e(row.sku)}</td>
        <td>${materialName(row)}</td><td>${e(row.unit)}</td><td>${tr(dispositions[row.status])}</td></tr>`).join(''))
      +`<button id="material-confirm" class="primary stock-confirm" type="button" ${!newCount||s.busy?'disabled':''}>${tr('Confirm material import')}</button>`;
    bind('material-confirm','click',async()=>{
      if(s.busy)return;
      s.busy=true;renderPreview();
      try{
        s.receipt=await api(endpoint+'/import',{method:'POST',body:{csv:s.csv,previewHash:s.preview.previewHash}});
        delete s.preview;delete s.csv;delete s.filename;
        if(root.isConnected){byId('material-file').value='';byId('material-file-name').textContent='';await load();}
      }catch(error){
        if(error.status===409)delete s.preview;
        showError(error,'material-import-error');
      }finally{s.busy=false;renderPreview();}
    },'material-import-error');
  }
  bind('material-file','change',()=>{
    if(s.busy)return;
    delete s.preview;delete s.csv;delete s.receipt;delete s.filename;
    byId('material-file-name').textContent='';
    byId('material-import-error').hidden=true;
    renderPreview();
  });
  bind('material-upload','submit',async ev=>{
    ev.preventDefault();
    if(s.busy)return;
    s.busy=true;
    try{
      const file=byId('material-file').files[0];
      if(!file&&!s.csv)throw new Error('Choose an XLSX or UTF-8 CSV file up to 2 MiB.');
      byId('material-import-error').hidden=true;
      s.csv=file?await readStockFile(file,{material:true}):s.csv;
      s.filename=file?.name??s.filename;
      s.preview=await api(endpoint+'/preview',{method:'POST',body:{csv:s.csv}});
      delete s.receipt;
    }catch(error){delete s.preview;showError(error,'material-import-error');}
    finally{
      s.busy=false;
      if(root.isConnected)byId('material-file-name').textContent=s.filename??'';
      renderPreview();
    }
  },'material-import-error');
  renderPreview();
  load().catch(error=>showError(error,'material-error'));
}
