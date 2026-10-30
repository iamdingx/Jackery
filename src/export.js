import {buildWorkbook} from './xlsx.js';
import {ApiError,outcomes} from './domain.js';

const chineseHeaders={
  'Work Order':'作业单号','Record ID':'记录 ID','SN':'SN','Model ID':'型号 ID','Model (English)':'型号（英文）','Model (Chinese)':'型号（中文）','Product SKU':'整机 SKU','Owner ID':'作业员 ID','Owner':'作业员','Source Pallet':'机器挑货栈板编码','Storage Pallet':'存放栈板码','Receiving SKU':'入库 SKU','Post-Sort SKU':'分拣后 SKU','Receiving Order No.':'入库单号','Receiving Status':'入库单状态','Product Name Verification':'产品名称校验（华宝）','SKU Verification':'SKU 校验（华宝确认）','Parent Record':'父记录','Unspecified Text Field':'文本 9','Work Date':'作业日期','Status':'完成状态','Outcome Group':'结果类别','Outcome Code':'结果代码','Outcome (English)':'作业结果（英文）','Outcome (Chinese)':'作业结果（中文）','Appearance Codes':'外观选项代码','Appearance (English)':'外观（英文）','Appearance (Chinese)':'外观（中文）','Appearance Notes':'外观描述','Issue Notes':'问题描述','Translated Appearance Notes':'外观描述-翻译','Translated Issue Notes':'问题描述-翻译','Scrap Reason':'报废原因','Version':'版本','Photo Count':'图片数量','Material Lines':'物料行数','Created (UTC)':'创建时间（UTC）','Updated (UTC)':'更新时间（UTC）','Completed (UTC)':'完成时间（UTC）','Model Snapshot JSON':'型号快照 JSON','Appearance Snapshot JSON':'外观快照 JSON','Legacy Post-work Checks JSON':'旧版复测存档 JSON','Stage':'检查阶段','Check Code':'检查项目代码','Check (English)':'检查项目（英文）','Check (Chinese)':'检查项目（中文）','Result':'检查结果','BOM ID':'BOM ID','Part SKU':'物料 SKU','Description (English)':'物料描述（英文）','Description (Chinese)':'物料描述（中文）','Unit':'单位','Quantity':'实际耗用数量','Photo ID':'图片 ID','Original Filename':'原始文件名','MIME':'MIME','Bytes':'字节数','Width':'宽度','Height':'高度','Authenticated Photo URL':'需登录的图片链接','Uploaded (UTC)':'上传时间（UTC）','Uploader ID':'上传者 ID'
};
Object.assign(chineseHeaders,{'Status Code':'完成状态代码','Stage Code':'检查阶段代码','Result Code':'检查结果代码','Fault Codes':'故障代码','Fault Snapshot JSON':'故障快照 JSON','BOM Standard Qty':'BOM 标准用量上限','Quantity Control':'用量控制规则'});
const displayLabels={
  en:{status:{draft:'In Progress',wfr:'In Progress',completed:'Completed'},stage:{inspection:'Inspection Result'},result:{pass:'Pass',fail:'Fail',not_tested:'Not Tested'}},
  zh:{status:{draft:'未完成',wfr:'未完成',completed:'已完成'},stage:{inspection:'检验结果'},result:{pass:'正常',fail:'异常',not_tested:'未检查'}}
};
const stagesFor=()=>['inspection'];
export function exportRecords(records,baseUrl='',language='en'){
  if(!['en','zh'].includes(language))throw new ApiError(422,'VALIDATION','Language must be en or zh');
  const labels=displayLabels[language];
  const columns=labels=>labels.map(([key,label,width])=>({key,label:language==='zh'?chineseHeaders[label]:label,width:width??22}));
  if(records.length>10000)throw new ApiError(413,'EXPORT_LIMIT','Export supports at most 10,000 records; narrow the filters');
  const rowCount=records.reduce((n,r)=>n+1+stagesFor(r).length*r.modelSnapshot.checkItems.length+r.materials.length+r.photos.length,0);
  if(rowCount>200000)throw new ApiError(413,'EXPORT_LIMIT','Export exceeds 200,000 rows; narrow the filters');
  const summary=[],checks=[],materials=[],photos=[],hyperlinks=[];
  for(const r of records){
    const outcome=outcomes.find(o=>o.code===r.outcome);
    summary.push({...r,faultCodes:(r.faultCodes??[]).join('; '),faultSnapshot:JSON.stringify(r.faultSnapshot??[]),statusLabel:labels.status[r.status]??r.status,finalChecks:r.checks.final?JSON.stringify(r.checks.final):'',modelNameEn:r.modelSnapshot.nameEn,modelNameZh:r.modelSnapshot.nameZh,outcomeLabelEn:outcome?.labelEn??'',outcomeLabelZh:outcome?.labelZh??'',appearanceCodes:r.appearanceCodes.join('; '),appearanceLabelsEn:r.appearanceSnapshot.map(a=>a.labelEn).join('; '),appearanceLabelsZh:r.appearanceSnapshot.map(a=>a.labelZh).join('; '),modelSnapshot:JSON.stringify(r.modelSnapshot),appearanceSnapshot:JSON.stringify(r.appearanceSnapshot),photoCount:r.photos.length,materialLineCount:r.materials.length});
    for(const stage of stagesFor(r))for(const item of r.modelSnapshot.checkItems){
      const state=r.checks.initial?.[item.code]??'not_tested';
      checks.push({workOrder:r.workOrder,sn:r.sn,modelId:r.modelId,stage,stageLabel:labels.stage[stage],code:item.code,labelEn:item.labelEn,labelZh:item.labelZh,state,stateLabel:labels.result[state]??state});
    }
    for(const m of r.materials)materials.push({workOrder:r.workOrder,sn:r.sn,modelId:r.modelId,...m});
    for(const p of r.photos){const url=baseUrl+p.url;photos.push({workOrder:r.workOrder,sn:r.sn,...p,url});hyperlinks.push({row:photos.length,column:'url',url});}
  }
  if(summary.some(row=>Object.values(row).some(value=>typeof value==='string'&&value.length>32767)))throw new ApiError(413,'EXPORT_LIMIT','A snapshot exceeds the Excel cell text limit of 32,767 characters');
  const workbook=buildWorkbook([
    {name:'Work Summary',columns:columns([
      ['workOrder','Work Order'],['id','Record ID'],['sn','SN'],['modelId','Model ID'],['modelNameEn','Model (English)'],['modelNameZh','Model (Chinese)'],['productSku','Product SKU'],['ownerId','Owner ID'],['ownerName','Owner'],['sourcePallet','Source Pallet'],['storagePallet','Storage Pallet'],['receivingSku','Receiving SKU'],['postSortSku','Post-Sort SKU'],['receivingOrderNo','Receiving Order No.'],['receivingStatus','Receiving Status'],['productNameVerification','Product Name Verification'],['skuVerification','SKU Verification'],['parentRecord','Parent Record'],['unspecifiedTextField','Unspecified Text Field'],['workDate','Work Date'],['statusLabel','Status'],['status','Status Code'],['outcomeGroup','Outcome Group'],['outcome','Outcome Code'],['outcomeLabelEn','Outcome (English)'],['outcomeLabelZh','Outcome (Chinese)'],['appearanceCodes','Appearance Codes'],['appearanceLabelsEn','Appearance (English)'],['appearanceLabelsZh','Appearance (Chinese)'],['appearanceNotes','Appearance Notes',45],['translatedAppearanceNotes','Translated Appearance Notes',45],['issueNotes','Issue Notes',45],['translatedIssueNotes','Translated Issue Notes',45],['scrapReason','Scrap Reason',40],['version','Version'],['photoCount','Photo Count'],['materialLineCount','Material Lines'],['createdAt','Created (UTC)'],['updatedAt','Updated (UTC)'],['completedAt','Completed (UTC)'],['modelSnapshot','Model Snapshot JSON',50],['appearanceSnapshot','Appearance Snapshot JSON',50],['finalChecks','Legacy Post-work Checks JSON',50]
      ,['faultCodes','Fault Codes'],['faultSnapshot','Fault Snapshot JSON',50]
    ]),rows:summary},
    {name:'Functional Checks',columns:columns([['workOrder','Work Order'],['sn','SN'],['modelId','Model ID'],['stageLabel','Stage'],['stage','Stage Code'],['code','Check Code'],['labelEn','Check (English)',35],['labelZh','Check (Chinese)',35],['stateLabel','Result'],['state','Result Code']]),rows:checks},
    {name:'Material Usage',columns:columns([['workOrder','Work Order'],['sn','SN'],['modelId','Model ID'],['bomId','BOM ID'],['sku','Part SKU'],['descriptionEn','Description (English)',45],['descriptionZh','Description (Chinese)',45],['unit','Unit'],['quantity','Quantity'],['standardQty','BOM Standard Qty'],['quantityControl','Quantity Control']]),rows:materials},
    {name:'Photo Index',columns:columns([['workOrder','Work Order'],['sn','SN'],['id','Photo ID'],['recordId','Record ID'],['filename','Original Filename',35],['mime','MIME'],['size','Bytes'],['width','Width'],['height','Height'],['url','Authenticated Photo URL',65],['uploadedAt','Uploaded (UTC)'],['uploadedBy','Uploader ID']]),rows:photos,hyperlinks}
  ]);
  if(workbook.length>64*1024*1024)throw new ApiError(413,'EXPORT_LIMIT','Export exceeds 64 MiB; narrow the filters');
  return workbook;
}
