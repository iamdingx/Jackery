import {buildWorkbook} from './xlsx.js';
import {ApiError,outcomes} from './domain.js';

const columns=labels=>labels.map(([key,label,width])=>({key,label,width:width??22}));
export function exportRecords(records,baseUrl=''){
  if(records.length>10000)throw new ApiError(413,'EXPORT_LIMIT','Export supports at most 10,000 records; narrow the filters');
  const rowCount=records.reduce((n,r)=>n+1+r.modelSnapshot.checkItems.length*(r.outcomeGroup==='refurbishment'?1:2)+r.materials.length+r.photos.length,0);
  if(rowCount>200000)throw new ApiError(413,'EXPORT_LIMIT','Export exceeds 200,000 rows; narrow the filters');
  const summary=[],checks=[],materials=[],photos=[],hyperlinks=[];
  for(const r of records){
    const outcome=outcomes.find(o=>o.code===r.outcome);
    summary.push({...r,modelNameEn:r.modelSnapshot.nameEn,modelNameZh:r.modelSnapshot.nameZh,outcomeLabelEn:outcome?.labelEn??'',outcomeLabelZh:outcome?.labelZh??'',appearanceCodes:r.appearanceCodes.join('; '),appearanceLabelsEn:r.appearanceSnapshot.map(a=>a.labelEn).join('; '),appearanceLabelsZh:r.appearanceSnapshot.map(a=>a.labelZh).join('; '),modelSnapshot:JSON.stringify(r.modelSnapshot),appearanceSnapshot:JSON.stringify(r.appearanceSnapshot),photoCount:r.photos.length,materialLineCount:r.materials.length});
    // Refurbishment has one functional inspection; repair and waiting records retain both stages.
    const stages=r.outcomeGroup==='refurbishment'?['initial']:['initial','final'];
    for(const stage of stages)for(const item of r.modelSnapshot.checkItems)checks.push({workOrder:r.workOrder,sn:r.sn,modelId:r.modelId,stage,code:item.code,labelEn:item.labelEn,labelZh:item.labelZh,state:r.checks[stage][item.code]??'not_tested'});
    for(const m of r.materials)materials.push({workOrder:r.workOrder,sn:r.sn,modelId:r.modelId,...m});
    for(const p of r.photos){const url=baseUrl+p.url;photos.push({workOrder:r.workOrder,sn:r.sn,...p,url});hyperlinks.push({row:photos.length,column:'url',url});}
  }
  if(summary.some(row=>Object.values(row).some(value=>typeof value==='string'&&value.length>32767)))throw new ApiError(413,'EXPORT_LIMIT','A snapshot exceeds the Excel cell text limit of 32,767 characters');
  const workbook=buildWorkbook([
    {name:'Work Summary',columns:columns([
      ['workOrder','Work Order'],['id','Record ID'],['sn','SN'],['modelId','Model ID'],['modelNameEn','Model (English)'],['modelNameZh','Model (Chinese)'],['productSku','Product SKU'],['ownerId','Owner ID'],['ownerName','Owner'],['sourcePallet','Source Pallet'],['storagePallet','Storage Pallet'],['workDate','Work Date'],['status','Status'],['outcomeGroup','Outcome Group'],['outcome','Outcome Code'],['outcomeLabelEn','Outcome (English)'],['outcomeLabelZh','Outcome (Chinese)'],['appearanceCodes','Appearance Codes'],['appearanceLabelsEn','Appearance (English)'],['appearanceLabelsZh','Appearance (Chinese)'],['appearanceNotes','Appearance Notes',45],['issueNotes','Issue Notes',45],['scrapReason','Scrap Reason',40],['version','Version'],['photoCount','Photo Count'],['materialLineCount','Material Lines'],['createdAt','Created (UTC)'],['updatedAt','Updated (UTC)'],['completedAt','Completed (UTC)'],['modelSnapshot','Model Snapshot JSON',50],['appearanceSnapshot','Appearance Snapshot JSON',50]
    ]),rows:summary},
    {name:'Functional Checks',columns:columns([['workOrder','Work Order'],['sn','SN'],['modelId','Model ID'],['stage','Stage'],['code','Check Code'],['labelEn','Check (English)',35],['labelZh','Check (Chinese)',35],['state','Result']]),rows:checks},
    {name:'Material Usage',columns:columns([['workOrder','Work Order'],['sn','SN'],['modelId','Model ID'],['bomId','BOM ID'],['sku','SKU'],['descriptionEn','Description (English)',45],['descriptionZh','Description (Chinese)',45],['unit','Unit'],['quantity','Quantity']]),rows:materials},
    {name:'Photo Index',columns:columns([['workOrder','Work Order'],['sn','SN'],['id','Photo ID'],['recordId','Record ID'],['filename','Original Filename',35],['mime','MIME'],['size','Bytes'],['width','Width'],['height','Height'],['url','Authenticated Photo URL',65],['uploadedAt','Uploaded (UTC)'],['uploadedBy','Uploader ID']]),rows:photos,hyperlinks}
  ]);
  if(workbook.length>64*1024*1024)throw new ApiError(413,'EXPORT_LIMIT','Export exceeds 64 MiB; narrow the filters');
  return workbook;
}
