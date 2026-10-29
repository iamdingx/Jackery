export const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function mergeMaterials(existing, selected) {
  const result=existing.map(x=>({...x}));const ids=new Set(result.map(x=>String(x.bomId)));
  for(const x of selected) if(!ids.has(String(x.id))){result.push({bomId:x.id,sku:x.sku,descriptionEn:x.descriptionEn,descriptionZh:x.descriptionZh,unit:x.unit,quantity:x.quantity??1});ids.add(String(x.id));}
  return result;
}
export function toggleAppearance(codes, code, selected) {if(!selected)return codes.filter(x=>x!==code);if(code==='no_defect')return ['no_defect'];return [...new Set([...codes.filter(x=>x!=='no_defect'),code])];}
export function completionError(r){
  if(!r.outcome)return 'outcome';if(['awp','needs_analysis'].includes(r.outcome))return 'wfr';
  if(r.outcome==='scrap')return r.scrapReason?.trim()?null:'scrap';
  // Existing completed repairs may receive notes-only administrator corrections.
  // The server checks whether their inspection is unchanged before allowing this exception.
  if(r.status==='completed'&&r.outcome==='rok'&&r.checks?.final)return null;
  return r.modelSnapshot?.checkItems?.length && r.modelSnapshot.checkItems.every(x=>r.outcome==='rok'?['pass','fail'].includes(r.checks?.initial?.[x.code]):r.checks?.initial?.[x.code]==='pass')?null:'inspection';
}
export function recordInput(r,action){const fields=['version','sn','modelId','productSku','sourcePallet','storagePallet','workDate','outcome','appearanceCodes','appearanceNotes','issueNotes','scrapReason'];const value=Object.fromEntries(fields.map(k=>[k,r[k]]));return {...value,checks:{initial:{...r.checks?.initial}},materials:(r.materials||[]).map(x=>({bomId:x.bomId,quantity:Number(x.quantity)})),action};}
