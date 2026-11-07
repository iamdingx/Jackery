import {createHash} from 'node:crypto';
import {ApiError,invalid,textValue,isoDate} from './domain.js';
import {parseCsvRecords} from './csv.js';
import {buildWorkbook} from './xlsx.js';
import {translateBom} from './bom-translations.js';

const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const readBalances=store=>new Map(store.db.prepare('SELECT * FROM inventory').all().map(row=>[row.sku,row]));
export const stockQuantities=store=>new Map(store.db.prepare('SELECT sku,quantity FROM inventory').all().map(row=>[row.sku,row.quantity]));

function partIndex(store){
  const parts=new Map();
  for(const p of store.all('bom'))if(!parts.has(p.sku)||p.active&&!parts.get(p.sku).active)parts.set(p.sku,p);
  return parts;
}

export function inventoryList(store,search='',translations={}){
  const q=textValue(search,'Search',200).trim().toLowerCase(),balances=readBalances(store);
  const parts=partIndex(store);
  for(const sku of balances.keys())if(!parts.has(sku))parts.set(sku,{sku,descriptionZh:'',descriptionEn:'',unit:''});
  return [...parts.values()].map(p=>translateBom(p,translations)).filter(p=>[p.sku,p.descriptionZh,p.descriptionEn].some(value=>value?.toLowerCase().includes(q)))
    .sort((a,b)=>a.sku.localeCompare(b.sku)).map(p=>({sku:p.sku,descriptionZh:p.descriptionZh,descriptionEn:p.descriptionEn,unit:p.unit,quantity:balances.get(p.sku)?.quantity??0,updatedAt:balances.get(p.sku)?.updated_at??null}));
}

export function usageHistory(store,params){
  const q=textValue(params.get('q')??'','Search',200).trim().toLowerCase(),from=params.get('from'),to=params.get('to');
  const sku=textValue(params.get('sku')??'','Part SKU',200).trim();
  if(from)isoDate(from);if(to)isoDate(to);if(from&&to&&from>to)invalid('Date range is invalid');
  return store.all('records').filter(r=>r.status==='completed'&&(!from||r.workDate>=from)&&(!to||r.workDate<=to))
    .sort((a,b)=>b.workDate.localeCompare(a.workDate)||b.id-a.id)
    .flatMap(r=>(r.materials??[]).filter(m=>(!sku||m.sku===sku)&&[m.sku,m.descriptionZh,m.descriptionEn,r.workOrder,r.sn].some(value=>value?.toLowerCase().includes(q)))
      .map(m=>({sku:m.sku,descriptionZh:m.descriptionZh,descriptionEn:m.descriptionEn,unit:m.unit,quantity:m.quantity,workOrder:r.workOrder,sn:r.sn,workDate:r.workDate})));
}

export function previewStockBatch(store,{kind,csv}){
  if(!['open','adjust'].includes(kind))invalid('Invalid inventory operation');
  let records;
  try{records=parseCsvRecords(csv);}catch(error){throw new ApiError(422,error.code??'CSV_INVALID',error.message,error.details);}
  const headers=records.shift()?.fields.map(x=>x.trim());
  if(headers?.length!==2||headers[0]!=='sku'||headers[1]!== (kind==='open'?'quantity':'delta'))invalid(kind==='open'?'Expected CSV headers: sku,quantity':'Expected CSV headers: sku,delta');
  if(!records.length)invalid('The stock list is empty');
  const balances=readBalances(store),parts=partIndex(store),seen=new Set(),errors=[],rows=[];
  for(const record of records){
    const [sku='',raw='']=record.fields.map(x=>x.trim()),current=balances.get(sku),amount=Number(raw);
    let message;
    if(record.fields.length!==2)message='Expected two columns';
    else if(!parts.has(sku)&&!current)message='Unknown Part SKU';
    else if(seen.has(sku))message='Duplicate Part SKU';
    else if(!/^[+-]?\d+$/.test(raw)||!Number.isSafeInteger(amount)||kind==='open'&&amount<0)message='Invalid stock quantity';
    else if(kind==='open'&&current)message='Stock already imported; use adjustment';
    else if(kind==='adjust'&&!current)message='Import opening stock first';
    const after=(current?.quantity??0)+amount;
    if(!message&&!Number.isSafeInteger(after))message='Stock balance is outside the supported range';
    seen.add(sku);
    if(message)errors.push({row:record.row,sku,message});
    else rows.push({sku,descriptionZh:parts.get(sku)?.descriptionZh??'',descriptionEn:parts.get(sku)?.descriptionEn??'',before:current?.quantity??0,delta:amount,after,updatedAt:current?.updated_at??null});
  }
  if(errors.length)throw new ApiError(422,'STOCK_BATCH_INVALID','Inventory list rejected',errors);
  return {rows,previewHash:hash({kind,rows})};
}

function writeMovement(store,sku,delta,balance,kind,reference,actorId,now){
  store.db.prepare('INSERT INTO inventory(sku,quantity,opened_at,updated_at) VALUES(?,?,?,?) ON CONFLICT(sku) DO UPDATE SET quantity=excluded.quantity,updated_at=excluded.updated_at').run(sku,balance,now,now);
  store.db.prepare('INSERT INTO inventory_events(sku,delta,balance,kind,reference,actor_id,created_at) VALUES(?,?,?,?,?,?,?)').run(sku,delta,balance,kind,reference,actorId,now);
}

export function commitStockBatch(store,input,user){
  const {requestId,previewHash,kind,csv}=input;
  if(typeof requestId!=='string'||!/^[a-f0-9]{32}$/.test(requestId))invalid('Invalid inventory batch ID');
  const inputHash=hash({kind,csv});
  return store.tx(()=>{
    const old=store.db.prepare('SELECT * FROM inventory_batches WHERE id=?').get(requestId);
    if(old){if(old.input_hash!==inputHash)invalid('Inventory batch ID already used for a different file');return JSON.parse(old.receipt);}
    const planned=previewStockBatch(store,input);
    if(planned.previewHash!==previewHash)throw new ApiError(409,'STOCK_PREVIEW_STALE','Inventory changed. Preview the list again.');
    const now=new Date().toISOString();
    for(const row of planned.rows)writeMovement(store,row.sku,row.delta,row.after,kind,requestId,user.id,now);
    const receipt={requestId,kind,updated:planned.rows.length,appliedAt:now};
    store.db.prepare('INSERT INTO inventory_batches(id,input_hash,receipt) VALUES(?,?,?)').run(requestId,inputHash,JSON.stringify(receipt));
    return receipt;
  });
}

// Called inside the same transaction that saves the work record and audit.
export function applyCompletedUsage(store,before,after,user){
  if(after.status!=='completed')return;
  if(before.status!=='completed'){
    // Remember which openings existed at the moment of completion, even if a
    // later opening or correction happens within the same clock tick.
    after.stockEventCutoff=store.db.prepare('SELECT COALESCE(MAX(id),0) AS id FROM inventory_events').get().id;
  }
  if(!after.stockEventCutoff)return;
  const difference=new Map();
  const accumulate=(items,sign)=>{for(const m of items??[])difference.set(m.sku,(difference.get(m.sku)??0)+sign*m.quantity);};
  if(before.status==='completed')accumulate(before.materials,1);
  accumulate(after.materials,-1);
  const lookup=store.db.prepare("SELECT inventory.quantity,opening.id FROM inventory JOIN inventory_events opening ON opening.sku=inventory.sku AND opening.kind='open' WHERE inventory.sku=?");
  for(const [sku,delta] of difference){
    if(!delta)continue;
    const balance=lookup.get(sku);
    if(!balance||balance.id>after.stockEventCutoff)continue;
    const quantity=balance.quantity+delta;
    if(!Number.isSafeInteger(quantity))invalid('Stock-managed parts require whole-piece quantities');
    writeMovement(store,sku,delta,quantity,before.status==='completed'?'correction':'complete',after.workOrder,user.id,after.updatedAt);
  }
}

export function exportInventory(store,lang,translations){
  const zh=lang==='zh';
  const columns=[['sku','Part SKU','物料 SKU'],['descriptionEn','Description (English)','英文描述'],['descriptionZh','Description (Chinese)','中文描述'],['quantity','Current Stock','当前库存'],['unit','Unit','单位'],['updatedAt','Updated','最近更新']].map(([key,en,cn])=>({key,label:zh?cn:en,width:key.startsWith('description')?45:21}));
  return buildWorkbook([{name:zh?'当前库存':'Current Stock',columns,rows:inventoryList(store,'',translations)}]);
}

export function stockTemplate(kind){
  return buildWorkbook([{name:'Stock',columns:[{key:'sku',width:24},{key:kind==='open'?'quantity':'delta',width:14}],rows:[]}]);
}
