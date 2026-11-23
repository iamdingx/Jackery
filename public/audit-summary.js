// Compare the snapshots captured by this event, independent of today's catalog.
const fields = {
  sn:'Serial Number', sourcePallet:'Source Pallet No.', storagePallet:'Completion Pallet No.',
  productSku:'Product SKU', workTime:'Work Time', workDate:'Work Date', status:'Status',
  outcome:'Outcome', issueNotes:'Defect remark', appearanceNotes:'Appearance condition',
  scrapReason:'Scrap Reason', translatedIssueNotes:'Translated Issue Notes',
  translatedAppearanceNotes:'Translated Appearance Notes', receivingSku:'Receiving SKU',
  postSortSku:'Post-Sort SKU', receivingOrderNo:'Receiving Order No.', receivingStatus:'Receiving Status',
  productNameVerification:'Product Name Verification', skuVerification:'SKU Verification',
  parentRecord:'Parent Record', unspecifiedTextField:'Unspecified Text Field'
};
const statuses={draft:'In Progress',wfr:'In Progress · WFR',completed:'Completed'};
const outcomes={like_new:'Like New',good:'Good',acceptable:'Acceptable',rok:'ROK',scrap:'SCRAP',awp:'AWP',needs_analysis:'Needs Analysis'};
const checks={not_tested:'Not Tested',pass:'Pass',fail:'Fail'};

export function auditChanges(before,after,{t,modelLabel,lang}){
  if(!before||!after)return [];
  const rows=[];
  const missing=t('Not recorded');
  const value=v=>v==null?missing:v===''?t('Empty'):String(v);
  function compare(field,oldValue,newValue,format=value){
    // Saving a legacy record can fill a previously absent field with an empty default.
    if((oldValue??'')!==(newValue??''))rows.push([field,format(oldValue),format(newValue)]);
  }
  if(before.modelId!==after.modelId){
    const describe=r=>r.modelId==null?missing:[modelLabel(r.modelSnapshot),'#'+r.modelId].filter(Boolean).join(' ');
    rows.push([t('Model'),describe(before),describe(after)]);
  }
  for(const [key,title] of Object.entries(fields)){
    const dict=key==='status'?statuses:key==='outcome'?outcomes:null;
    compare(t(title),before[key],after[key],v=>dict?.[v]?t(dict[v]):value(v));
  }
  const oldChecks=before.checks?.initial,newChecks=after.checks?.initial;
  for(const code of new Set([...Object.keys(oldChecks??{}),...Object.keys(newChecks??{})])){
    const item=[...(after.modelSnapshot?.checkItems??[]),...(before.modelSnapshot?.checkItems??[])].find(c=>c.code===code);
    const name=(lang==='zh'?item?.labelZh:item?.labelEn)||item?.labelEn||item?.labelZh||code;
    compare(t('Functional Checks')+' · '+name,oldChecks?.[code],newChecks?.[code],v=>checks[v]?t(checks[v]):value(v));
  }
  for(const [key,title] of [['appearanceCodes','Appearance condition'],['faultCodes','Fault Codes']]){
    const codes=r=>Array.isArray(r[key])?[...r[key]].sort().join(', '):undefined;
    compare(t(title),codes(before),codes(after));
  }
  const byMaterial=items=>new Map((items??[]).map(m=>[JSON.stringify([m.sku,m.bomId??null]),m]));
  const oldParts=byMaterial(before.materials),newParts=byMaterial(after.materials);
  for(const id of new Set([...oldParts.keys(),...newParts.keys()])){
    const a=oldParts.get(id),b=newParts.get(id),part=b??a;
    const qty=(item,record)=>item?value(item.quantity)+(item.unit?' '+item.unit:''):Array.isArray(record.materials)?'—':missing;
    const key=t('Material Usage')+' · '+part.sku+(part.bomId!=null?' · BOM #'+part.bomId:'');
    compare(key,qty(a,before),qty(b,after));
  }
  const photoIds=r=>Array.isArray(r.photos)?r.photos.map(p=>p.id).sort().join(', '):undefined;
  compare(t('Evidence Photos'),photoIds(before),photoIds(after));
  return rows;
}
