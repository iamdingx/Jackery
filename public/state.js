export const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const encodeCheckLabel=s=>String(s??'').replace(/[\\|\r\n]/g,c=>({'\\':'\\\\','|':'\\p','\r':'\\r','\n':'\\n'}[c]));
const decodeCheckLabel=s=>s.replace(/\\([\\pnr])/g,(_,c)=>({'\\':'\\','p':'|','n':'\n','r':'\r'}[c]));
export function formatChecklist(items){return (items||[]).map(c=>[c.code,encodeCheckLabel(c.labelEn),encodeCheckLabel(c.labelZh)].join('|')).join('\n');}
export function parseChecklist(value,previous=[]){return value.split('\n').filter(s=>s.trim()).map(line=>{const[code='',en='',...zh]=line.split('|'),key=code.trim();return {...previous.find(c=>c.code===key),code:key,labelEn:decodeCheckLabel(en).trim(),labelZh:decodeCheckLabel(zh.join('|')).trim()};});}
export function mergeMaterials(existing, selected) {
  const result=existing.map(x=>({...x}));const ids=new Set(result.map(x=>String(x.bomId)));
  for(const x of selected) if(!ids.has(String(x.id))){result.push({bomId:x.id,sku:x.sku,descriptionEn:x.descriptionEn,descriptionZh:x.descriptionZh,unit:x.unit,quantity:x.quantity??1,...(x.standardQty!=null?{standardQty:x.standardQty}:{}),...(x.quantityControl?{quantityControl:x.quantityControl}:{}),...(x.source?{source:x.source}:{})});ids.add(String(x.id));}
  return result;
}
export function toggleAppearance(codes, code, selected) {if(!selected)return codes.filter(x=>x!==code);if(code==='no_defect')return ['no_defect'];return [...new Set([...codes.filter(x=>x!=='no_defect'),code])];}
export function completionError(r){
  if(!r.outcome)return 'outcome';if(['awp','needs_analysis'].includes(r.outcome))return 'wfr';
  if(r.outcome==='scrap')return r.scrapReason?.trim()?null:'scrap';
  // Server verifies that an existing historical completion has an unchanged inspection.
  if(r.status==='completed'&&r.outcome==='rok'&&r.checks?.final)return null;
  return r.modelSnapshot?.checkItems?.length && r.modelSnapshot.checkItems.every(x=>r.outcome==='rok'?['pass','fail'].includes(r.checks?.initial?.[x.code]):r.checks?.initial?.[x.code]==='pass')?null:'inspection';
}
export function materialQuantityError(materials){for(const x of materials||[]){const n=Number(x.quantity),cap=Number(x.standardQty);if(Number.isFinite(cap)&&cap>0&&n>cap)return 'cap';if(!(n>0)||n>1e6||!/^\d+(\.\d{1,3})?$/.test(String(x.quantity))||(Number.isFinite(cap)&&cap>0&&/^(pcs?|pieces?|个|件)$/i.test(x.unit||'')&&!Number.isInteger(n)))return 'quantity';}return null;}
export function recordInput(r,action){const fields=['version','sn','modelId','productSku','sourcePallet','storagePallet','workDate','outcome','appearanceCodes','appearanceNotes','issueNotes','translatedAppearanceNotes','translatedIssueNotes','receivingSku','postSortSku','receivingOrderNo','receivingStatus','productNameVerification','skuVerification','parentRecord','unspecifiedTextField','scrapReason'];const value=Object.fromEntries(fields.map(k=>[k,r[k]]));return {...value,faultCodes:[...(r.faultCodes||[])],checks:{initial:{...r.checks?.initial}},materials:(r.materials||[]).map(x=>({bomId:x.bomId,quantity:Number(x.quantity)})),action};}
