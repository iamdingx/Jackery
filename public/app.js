import {formatChecklist,parseChecklist,escapeHtml as e,mergeMaterials,toggleAppearance,completionError,recordInput,materialQuantityError} from './state.js';
import {inventoryZh,renderInventory} from './inventory.js';
import {gradingZh,gradeCriteria,positionGradeCriteria} from './grading.js';
import {germanWorkTime,displayWorkTime} from './work-time.js';
import {auditChanges} from './audit-summary.js';
import {carryCheckResults} from './check-results.js';
import {compressPhoto,needsPhotoCompression} from './photo-compression.js';

const $=id=>document.getElementById(id);
const initialState=()=>({session:null,catalog:{models:[],appearanceOptions:[],outcomes:[]},lang:'en',view:'records',record:null,dirty:false,history:false,correction:false,filters:{q:'',status:'',modelId:'',ownerId:'',from:'',to:'',page:1},records:{items:[],total:0},historyQuery:'',historySearch:null,adminSection:'users',adminItems:[],adminModel:'',adminEdit:null});
const state=initialState();
function clearSessionState(){clearHistorySearch();recordsSequence++;invalidateSnLookup();knowledgeSequence++;knowledgeAbort?.abort();const demo=state.session?.demo;for(const key of Object.keys(state))delete state[key];Object.assign(state,initialState(),{session:{user:null,demo}});}
const zh={
 'This serial number already has an unfinished work order.':'该序列号已有未结案工单。',
 'Complete the existing work order before starting a new one.':'请先完成并锁定原工单，再为该序列号新建工单。',
 'Contact the owner to complete the existing work order.':'请联系原作业员完成并锁定工单。',
 'Resume existing work order':'续填原工单',
 'Unsaved edits':'有修改待保存',
 'Earlier changes saved. New edits are still unsaved.':'先前的修改已保存。刚输入的内容仍待保存。',
 'Save or cancel your work order correction before changing photos.':'请先保存或取消工单更正，再操作照片。',
'Source Pallet No.':'来源栈板号','Completion Pallet No.':'完成后栈板号','Defect remark':'缺陷备注','Photo selected':'已选择照片','Evidence Photo':'作业照片','Select model':'选择型号','Inspection Result':'检验结果','Complete all inspection items. Refurbishment requires all results to pass.':'请完成所有功能检验；翻新要求所有结果正常。','Jackery Service Records':'Jackery 翻新／维修记录','Service workspace':'售后作业工作台','My Records':'我的记录','All Records':'所有记录','Current Record':'当前作业','SN History':'SN 历史','Administration':'基础资料','Sign out':'退出','Sign in':'登录','Username':'账号','Password':'密码','New Work Record':'新建作业单','Work Record':'工单记录','Serial Number':'序列号','Model':'型号','Product SKU':'产品 SKU','Work Order':'工单号','Functional Checks':'功能检查','Check Item':'检查项目','Initial Test':'初检','Final Test':'复测','Not Tested':'未检查','Pass':'正常','Fail':'异常','Appearance condition':'外观状况','Appearance Notes':'外观备注','Issue Notes':'问题备注','Reference Details':'参考信息','Source Pallet':'来源托盘','Storage Pallet':'存放托盘','Work Date':'作业日期','Work Time':'作业时间','Work Time (Germany)':'作业时间（德国）','Enter a work time.':'请输入作业时间。','Work time must be a valid date and time to the minute':'请输入精确到分钟的有效作业时间。','Material Usage':'物料耗用','Add BOM Items':'添加 BOM 物料','Part SKU':'物料 SKU','Part Description':'物料描述','Part Name':'物料名称','Qty':'数量','Action':'操作','Remove':'移除','Outcome':'处理结果','Refurbishment':'翻新','Repair':'维修','WFR':'待处理 WFR','Like New':'近新品','Good':'良好','Acceptable':'可接受','ROK':'ROK','SCRAP':'报废','AWP':'待料','Needs Analysis':'待分析','Save Progress':'保存进度','Save WFR':'保存 WFR','Complete & Lock':'完成并锁定','Scrap Reason':'报废原因','View History':'查看历史','Save Correction':'保存更正','Admin Correction':'管理员更正','Correction Reason':'更正原因','Cancel':'取消','Search':'查询','Status':'状态','Owner':'作业员','From':'开始日期','To':'结束日期','All':'全部','Draft':'进行中','Waiting':'待处理','Completed':'已完成','Previous':'上一页','Next':'下一页','Export':'导出 Excel','No records found':'暂无记录','No materials added':'尚未添加物料','Evidence Photos':'照片（选填）','Upload Photo':'上传照片','View Audit':'查看审计','Close':'关闭','Exact full serial number':'完整精确序列号','Read only history':'历史只读','Completed · Read only':'已完成 · 只读','In Progress':'进行中','Add Items from Model BOM':'从型号 BOM 添加物料','Items to Add':'待添加物料','Already on record':'已在作业单','To add':'待添加','Not selected':'未选择','Add Selected Items':'添加所选物料','Selections stay checked across searches and pages. No duplicate rows.':'跨搜索、跨页保留选择，不重复添加。','Only model BOM items; default quantity is 1. Packaging is recorded the same way.':'仅限型号 BOM，默认数量 1；包材同样记录。','Choose ONE outcome across Refurbishment, Repair and WFR.':'翻新、维修、WFR 七项中仅可选择一项。','Refurbishment requires every inspection result to pass.':'翻新要求所有功能检验结果正常。','Complete all final tests with a Pass result before selecting ROK for completion.':'ROK 要求完成所有功能检验；报废必填原因。','Waiting, not completed. Continue this record later.':'保持未完成，可稍后续填本单。','Previous visits for the exact SN are available read only.':'输入完整 SN 可只读查看历史作业。','Only the owner can continue. Completed records require a reasoned admin correction.':'仅本人可续填，已完成单仅管理员带原因更正。','Saved successfully':'保存成功','Unsaved changes will be lost. Continue?':'尚有未保存修改，是否放弃并继续？','Model changes reset checks, fault codes and material selections. Continue?':'更改型号会重置功能检查、故障码和物料选择，是否继续？','Please choose an outcome.':'请选择处理结果。','WFR cannot be completed. Save WFR instead.':'WFR 不能结案，请保存 WFR。','All initial checks must pass.':'初检必须全部通过。','All final checks must pass.':'复测必须全部通过。','Scrap reason is required.':'报废原因必填。','Correction reason is required.':'更正原因必填。','Save record before uploading photos.':'请先保存作业单再上传照片。','This record changed elsewhere. Your entries are retained. Reload the record to review the latest version before retrying.':'本单已被其他页面修改。当前输入已保留，请重新加载并核对最新版本后再保存。','Reload latest record':'重新加载最新版本','Demo workspace · Fictitious records and BOM only':'演示环境 · 作业及 BOM 均为虚构样例','Users':'账号','Models & Checklists':'型号与检查项','Appearance Options':'外观字典','BOM':'BOM','New Entry':'新增','Edit':'编辑','Save':'保存','Active':'启用','Display Name':'姓名','Role':'角色','Operator':'作业员','Admin':'管理员','Name (English)':'英文名称','Name (Chinese)':'中文名称','Check items: code|English label|Chinese label, one per line':'检查项：代码|英文名称|中文名称，每行一项','Code':'代码','Label (English)':'英文名称','Label (Chinese)':'中文名称','Description (English)':'英文描述','Description (Chinese)':'中文描述','Unit':'单位','New password':'新密码','Reset Password':'重置密码','CSV Template':'CSV 模板','Import BOM CSV':'导入 BOM CSV','CSV content':'CSV 内容','Choose CSV file':'选择 CSV 文件','Imported':'已导入','Atomic import: all rows must be valid; existing or duplicate SKUs are rejected.':'全部通过才导入，拒绝已有或重复 SKU。','Change Password':'修改密码','Current Password':'当前密码','New Password':'新密码','Password updated':'密码已更新','No audit entries':'暂无审计记录','Before':'更正前','After':'更正后','Reason':'原因','New record':'新建作业单','No photos':'暂无照片','JPEG or PNG, up to 20 photos. Large photos are compressed before upload.':'支持 JPEG 或 PNG，每单最多 20 张。较大的照片会先压缩再上传。','Clear':'清空','Page':'页','items':'项','Version':'版本','Last saved':'上次保存','No outcome selected':'尚未选择结果','Save first':'请先保存','Select a model first.':'请先选择型号。','Entry saved':'条目已保存','Unfinished records owned by another operator are read only.':'其他作业员的未完成单仅可只读查看。','English is required except for source-backed originals. Historical snapshots are preserved.':'检查项英文必填，历史快照保留。','Photo upload failed':'照片上传失败','Photo uploaded':'照片已上传','Photo removed':'照片已移除','File must be PNG or JPEG and at most 8 MiB.':'请选择不超过 8 MiB 的 PNG 或 JPEG。','Record list':'作业列表','Return to records':'返回列表','No matching BOM items':'没有匹配的 BOM 物料','Search part SKU or description':'搜索物料 SKU 或描述','Pending items are not added until you click Add Selected Items.':'待选物料仅在点击“添加所选物料”后加入本单。','Select':'选择','Optional':'选填','Add':'添加','Demo accounts are listed in the supplied README.':'演示账号见随附 README。','Sign in to continue your work.':'登录以继续作业。','Refresh':'刷新','Discard unsaved changes and reload the latest version?':'放弃未保存输入并加载最新版本？','No active models. Ask an administrator to add a model and checklist.':'暂无启用型号，请管理员添加型号和检查清单。','Audit Trail':'审计记录','Work date':'作业日期','Selected':'已选择'};
zh['Upload selected photo before completing.']='请先上传所选照片，再完成作业。';
zh['Save or discard unsaved changes before changing password.']='请先保存或放弃未保存内容，再修改密码。';
zh['Password updated. Sign in with your new password.']='密码已更新，请使用新密码重新登录。';
Object.assign(zh,{'English is required except for source-backed originals. Historical snapshots are preserved.':'除来源原文项目外，检查项需提供英文；历史快照保留。',
 'View-only':'只读','In Progress · WFR':'进行中 · WFR','Translated Appearance Notes':'外观描述-翻译','Translated Issue Notes':'问题描述-翻译','Receiving SKU':'入库 SKU','Post-Sort SKU':'分拣后 SKU','Receiving Order No.':'入库单号','Receiving Status':'入库单状态','Product Name Verification':'产品名称校验','SKU Verification':'SKU 校验','Parent Record':'父记录','Unspecified Text Field':'文本 9',
 'Previous records found for this SN. Records owned by others are view-only.':'已找到该 SN 的历史记录，其他作业员的记录仅可只读查看。','No matching items in this model BOM. Check the part SKU or try another word.':'当前型号 BOM 中没有匹配物料，请检查物料 SKU 或尝试其他关键词。','This item is already on the usage list. Update its quantity in the existing row.':'此物料已在耗用清单中，请在原有行修改数量。','Complete all final tests with a Pass result before selecting ROK for completion.':'选择 ROK 结案前，所有完工复测必须通过。','Enter a scrap reason before completing this record.':'请填写报废原因后再完成本单。','Upload failed. Your photo has not been saved. Please try again.':'上传失败，照片尚未保存，请重试。','English description missing':'缺少英文描述','Original':'原文','Locate usage row':'定位耗用行','Discard pending BOM selections?':'是否放弃此次待加入的 BOM 物料？','Resume Record':'续填本单','Choose Photo':'选择照片','No photo selected':'尚未选择照片'
});
zh['ROK requires all functions to be inspected. SCRAP requires a reason.']='ROK 要求完成所有功能检验；报废必填原因。';
Object.assign(zh,inventoryZh,gradingZh,{
  'Changing the model keeps matching check results and clears fault codes and material selections.':'更换型号会保留相同检查项目的结果，并清空故障码和物料选择。','Substitutes':'替代料','Original part':'原料','First-level substitute':'一级替代','Second-level substitute':'二级替代',
  'First-level stock is above zero':'一级库存大于 0，二级不可选','Material unavailable':'物料已停用',
  'Shared limit':'共用上限','Selected quantity':'已选','Top position':'顶部料位','Bottom position':'底部料位',
  'Color box position':'彩盒料位','Lower insert position':'下内托料位','Packaging kit':'替代包材套装',
  'Use kit':'选择此套','Kit selected':'已选此套','Remove kit':'移除整套',
  'Quantity exceeds the shared BOM group maximum.':'耗用数量超过共用料位上限。',
  'Quantity exceeds the BOM item maximum.':'耗用数量超过该料号的单台上限。',
  'Enter a whole-piece quantity.':'请输入整数件数。',
  'This substitute is outside the model BOM rules.':'该替代料不适用于此机型。',
  'This substitute is outside the selected BOM group.':'该替代料不属于所选料位。',
  'Second-level substitute requires first-level stock of zero or below.':'一级替代库存大于 0，无法新增或增加二级替代用量。',
  'Select every part of the same packaging kit.':'请选择同一套完整的替代包材。',
});
const t=s=>state.lang==='zh'?(zh[s]||s):s;
Object.assign(zh,{'Fault Codes':'故障码','Common Fault Solutions':'常见故障处理','Manual translations':'手动翻译','No fault codes supplied for this model.':'此型号尚未提供故障码。','No repair guidance supplied for this model.':'此型号尚未提供维修指引。','English guidance not supplied. Original source shown.':'未提供英文指引，以下保留来源原文。','Standard usage / maximum':'标准用量／上限','Quantity exceeds the standard usage maximum.':'耗用数量超过 BOM 标准用量上限。','Enter a valid quantity. Imported pieces must be whole numbers.':'请输入有效数量，导入的按件物料必须为整数。','Loading model knowledge…':'正在加载型号知识…','Model knowledge could not be loaded. Try again.':'型号知识加载失败，请重试。','Retry knowledge':'重试加载知识','Source':'来源','Solution':'处理建议','Details':'详情','Symptoms':'故障现象','Notices':'提示','Test workspace · Imported Jackery catalog; sample records retained':'测试环境 · 已导入 Jackery 目录，保留历史样例作业'});
function quantityAttributes(x){const cap=Number(x.standardQty),limited=Number.isFinite(cap)&&cap>0,whole=limited&&/^(pcs?|pieces?|个|件)$/i.test(x.unit||'');return `min="${whole?1:0.001}" max="${limited?e(cap):1000000}" step="${whole?1:0.001}"`;}
function substitutionHint(x){
 const s=x.substitution;
 if(!s?.level)return '';
 const title=s.kitId?t('Packaging kit'):t(s.level===2?'Second-level substitute':'First-level substitute');
 return `<small class="standard-usage">${e(title)} · ${e(s.originalSku)}</small>`;
}
function capHint(x){return Number(x.standardQty)>0?`<small class="standard-usage">${e(t('Standard usage / maximum'))}: ${e(x.standardQty)} ${e(x.unit||'')}</small>`:'';}
function validateMaterialQuantities(materials){const error=materialQuantityError(materials);if(error)throw new Error(t(error==='cap'?'Quantity exceeds the standard usage maximum.':'Enter a valid quantity. Imported pieces must be whole numbers.'));}
let knowledgeSequence=0,knowledgeAbort;
async function loadKnowledge(){knowledgeAbort?.abort();const sequence=++knowledgeSequence,modelId=state.record?.modelId,userId=state.session?.user?.id;if(!modelId||state.signingOut||isCustomer())return;const controller=new AbortController();knowledgeAbort=controller;state.knowledge={modelId,loading:true,faultCodes:[],repairGuides:[]};renderKnowledge();try{const data=await api('/api/models/'+encodeURIComponent(modelId)+'/knowledge',{signal:controller.signal});if(sequence!==knowledgeSequence||String(state.record?.modelId)!==String(modelId)||state.session?.user?.id!==userId)return;state.knowledge={...data,modelId,loading:false};}catch(err){if(controller.signal.aborted||sequence!==knowledgeSequence||String(state.record?.modelId)!==String(modelId)||state.session?.user?.id!==userId)return;state.knowledge={modelId,faultCodes:[],repairGuides:[],error:err,loading:false};}if(state.view==='editor')renderKnowledge();}
function knowledgeForRecord(){return String(state.knowledge?.modelId)===String(state.record?.modelId)?state.knowledge:{faultCodes:[],repairGuides:[],loading:true};}
function faultItems(){const current=knowledgeForRecord().faultCodes||[],snapshots=state.record.faultSnapshot||[],selected=state.record.faultCodes||[],items=current.map(x=>selected.includes(x.code)?snapshots.find(saved=>saved.code===x.code)||x:x);for(const x of snapshots)if(selected.includes(x.code)&&!items.some(y=>y.code===x.code))items.push(x);return items;}
function guidanceText(value){return Array.isArray(value)?value.join('\n'):String(value??'');}
function sourceTranslation(original){const translations=state.catalog?.sourceTranslations||{};return Object.hasOwn(translations,original)&&typeof translations[original]==='string'&&translations[original].trim()?translations[original]:'';}
function guidanceValue(x,key){const original=guidanceText(x?.[key+'Zh']),supplied=guidanceText(x?.[key+'En']);if(supplied.trim())return {english:supplied,original,missing:false};if(!original.trim())return {english:'',original:'',missing:false};const exact=sourceTranslation(original);if(exact)return {english:exact,original,missing:false};if(Array.isArray(x?.[key+'Zh'])){const rows=x[key+'Zh'].map(value=>({original:guidanceText(value),english:sourceTranslation(guidanceText(value))}));return {english:rows.map(row=>row.english).join('\n'),original,missing:rows.some(row=>row.original.trim()&&!row.english)};}return {english:'',original,missing:true};}
function guidanceLabel(x,key,fallback=''){const {english,original}=guidanceValue(x,key);return [english,original].filter(value=>value.trim()).join(' · ')||fallback;}
function guidanceField(x,key){const {english,original,missing}=guidanceValue(x,key);return `${english.trim()?`<span class="guidance-en" lang="en">${e(english)}</span>`:''}${missing?`<span class="translation-warning">${e(t('English guidance not supplied. Original source shown.'))}</span>`:''}${original.trim()?`<span class="guidance-zh" lang="zh">${e(original)}</span>`:''}`;}
function sourceMarkup(source){if(!source)return '';const location=typeof source==='string'?[]:[source.slide!=null?'slide '+source.slide:'',source.row!=null?'row '+source.row:''].filter(Boolean),identifiers=typeof source==='string'?[source]:[source.file,source.sheet].filter(Boolean),original=[...identifiers,...location].join(' · '),translated=[...identifiers.map(value=>sourceTranslation(value)||value),...location].join(' · ');return `<small class="knowledge-source">${e(t('Source'))}: ${translated!==original?`<span class="guidance-en" lang="en">${e(translated)}</span><span class="guidance-zh" lang="zh">${e(original)}</span>`:e(original)}</small>`;}
function faultMarkup(x){const solution=guidanceField(x,'solution');return `<article class="knowledge-entry"><h3>${e(x.code||'')} ${guidanceField(x,'title')}</h3><div class="guidance-copy">${guidanceField(x,'description')}</div>${solution?`<h4>${e(t('Solution'))}</h4><div class="guidance-copy">${solution}</div>`:''}${sourceMarkup(x.source)}</article>`;}
function renderKnowledge(){if(!$('knowledge-tools')||!state.record)return;
 if(isCustomer()){
  $('selected-faults').innerHTML=(state.record.faultCodes||[]).map(code=>`<span class="fault-chip">${e(code)}</span>`).join('');
  return;
 }
const k=knowledgeForRecord();$('knowledge-tools').innerHTML=`<button id="fault-codes" type="button" ${k.loading?'disabled':''}>${e(t('Fault Codes'))} <small>(${e(t('Optional'))})</small></button><button id="open-guides" type="button" ${k.loading?'disabled':''}>${e(t('Common Fault Solutions'))}</button>${k.loading&&state.record.modelId?`<small role="status">${e(t('Loading model knowledge…'))}</small>`:''}${k.error?`<button id="retry-knowledge">${e(t('Retry knowledge'))}</button>`:''}`;$('selected-faults').innerHTML=(state.record.faultCodes||[]).map(code=>`<button type="button" class="fault-chip" data-fault-detail="${e(code)}" title="${e(code+' '+guidanceLabel(faultItems().find(x=>x.code===code),'title'))}" aria-label="${e(code+' '+guidanceLabel(faultItems().find(x=>x.code===code),'title'))}">${e(code)}</button>`).join('');bind('fault-codes','click',openFaultCodes);bind('open-guides','click',openGuides);bind('retry-knowledge','click',loadKnowledge);document.querySelectorAll('[data-fault-detail]').forEach(button=>button.addEventListener('click',()=>{const item=faultItems().find(x=>x.code===button.dataset.faultDetail);const modal=dialog('fault-detail-dialog',button.dataset.faultDetail,item?faultMarkup(item):`<p>${e(t('No fault codes supplied for this model.'))}</p>`,`<button id="fault-detail-close">${e(t('Close'))}</button>`);bind('fault-detail-close','click',modal.close);}));}
function openFaultCodes(){const k=knowledgeForRecord(),r=state.record,items=faultItems();const modal=dialog('fault-dialog',t('Fault Codes')+' · '+t('Optional'),`${k.error?`<p class="error-box">${e(t('Model knowledge could not be loaded. Try again.'))}</p>`:''}<div class="fault-list">${items.map(x=>`<article class="fault-option"><label><input type="checkbox" data-fault-select="${e(x.code)}" ${(r.faultCodes||[]).includes(x.code)?'checked':''} ${disabled()}><strong>${e(x.code)}</strong> <span>${guidanceField(x,'title')}</span></label><details><summary>${e(t('Details'))}</summary>${faultMarkup(x)}</details></article>`).join('')||`<p>${e(t('No fault codes supplied for this model.'))}</p>`}</div>`,`<button id="fault-close">${e(t('Close'))}</button>`);document.querySelectorAll('[data-fault-select]').forEach(el=>el.addEventListener('change',()=>{r.faultCodes=el.checked?[...new Set([...(r.faultCodes||[]),el.dataset.faultSelect])]:(r.faultCodes||[]).filter(code=>code!==el.dataset.faultSelect);state.dirty=true;renderKnowledge();}));bind('fault-close','click',modal.close);}
function openGuides(){const k=knowledgeForRecord();const modal=dialog('guides-dialog',t('Common Fault Solutions'),`${k.error?`<p class="error-box">${e(t('Model knowledge could not be loaded. Try again.'))}</p>`:''}${(k.repairGuides||[]).map(x=>`<details class="knowledge-entry"><summary>${guidanceField(x,'title')||e(x.id)}</summary><div class="guidance-copy">${guidanceField(x,'symptoms')}</div><div class="guidance-copy">${guidanceField(x,'steps')}</div>${sourceMarkup(x.source)}</details>`).join('')||`<p>${e(t('No repair guidance supplied for this model.'))}</p>`}${(k.notices||[]).map(x=>`<p class="guidance-copy">${typeof x==='string'?guidanceField({descriptionZh:x},'description'):guidanceField(x,'title')+(guidanceField(x,'description')||guidanceField(x,'text'))+sourceMarkup(x.source)}</p>`).join('')}`,`<button id="guides-close">${e(t('Close'))}</button>`);bind('guides-close','click',modal.close);}
const label=(x,en='labelEn',cn='labelZh')=>state.lang==='zh'?(x?.[cn]||x?.[en]||''):(x?.[en]||'');
function modelLabel(x){const name=label(x,'nameEn','nameZh'),version=x?.bomVersion;if(!version||version==='未标注版本')return name;const en={'原始版':'Original','降本版':'Cost-down','A版':'Version A','B版':'Version B'};return name+' · '+(state.lang==='en'?(en[version]||x.catalogKey||version):version);}
const date=x=>x?new Date(x).toLocaleString(state.lang==='zh'?'zh-CN':'en-GB'):'';
const option=(value,text,selected)=>`<option value="${e(value)}"${String(value)===String(selected)?' selected':''}>${e(text)}</option>`;
function input(id,text,value='',extra=''){return `<label for="${e(id)}">${e(t(text))}<input id="${e(id)}" name="${e(id)}" value="${e(value)}" ${extra}></label>`;}
function textarea(id,text,value='',extra=''){return `<label for="${e(id)}">${e(t(text))}<textarea id="${e(id)}" ${extra}>${e(value)}</textarea></label>`;}
function partDescription(x,{nameOnly=false}={}){
 const translations=state.catalog?.bomTranslations||{};
 let english=x.descriptionEn?.trim()?x.descriptionEn:(Object.hasOwn(translations,x.descriptionZh)?translations[x.descriptionZh]:undefined);
 let chinese=x.descriptionZh||'';
 if(nameOnly){
  english=english?.split(' | ',1)[0].trim();
  chinese=String(x.original?.['物料名称']??'').trim()||chinese.split(' | ',1)[0].trim();
 }
 return `<span class="part-description-en" lang="en">${english?e(english):`<span class="translation-warning">${e(t('English description missing'))}</span><small class="guidance-missing">${e(t('English guidance not supplied. Original source shown.'))}</small>`}</span><span class="part-description-zh original-description" lang="zh">${e(chinese)}</span>`;
}
let preferenceQueue=Promise.resolve();
function changeLanguage(afterRender){if(state.signingOut)return preferenceQueue;captureAdminDraft();state.lang=state.lang==='en'?'zh':'en';const language=state.lang,userId=state.session.user.id;renderCurrent();if(typeof afterRender==='function')afterRender();preferenceQueue=preferenceQueue.catch(()=>{}).then(async()=>{if(String(state.session.user?.id)!==String(userId))return;const data=await api('/api/account/language',{method:'PUT',body:{language}});if(String(state.session.user?.id)===String(userId))state.session.user={...state.session.user,...data.user};}).catch(showError);return preferenceQueue;}
let snLookupSequence=0,snLookupTimer,snLookupAbort;
function invalidateSnLookup(){clearTimeout(snLookupTimer);snLookupTimer=null;snLookupAbort?.abort();snLookupAbort=null;snLookupSequence++;state.snLookup=null;}
function renderSnLookup(){
 const hint=$('sn-history-hint'),resume=$('resume-existing-sn');
 if(!hint||!resume)return;
 const items=state.snLookup?.sn===state.record.sn.trim()?state.snLookup.items:[];
 const unfinished=items.filter(record=>record.status!=='completed');
 const own=unfinished.find(record=>String(record.ownerId)===String(state.session.user.id));
 const checkingNewSerial=!state.record.id||
   state.record.sn.trim().toUpperCase()!==state.savedRecord.sn.trim().toUpperCase();
 const blocked=checkingNewSerial&&unfinished.length>0;
 resume.hidden=!blocked||!own;
 hint.textContent=blocked
   ?t('This serial number already has an unfinished work order.')+' '+t(own||isAdmin()
     ?'Complete the existing work order before starting a new one.'
     :'Contact the owner to complete the existing work order.')
   :t(items.length?'Previous records found for this SN. Records owned by others are view-only.':'Previous visits for the exact SN are available read only.');
}
function scheduleSnLookup(){
 invalidateSnLookup();
 if(state.signingOut||!state.session.user)return;
 renderSnLookup();
 const sequence=snLookupSequence,record=state.record,sn=record.sn.trim(),userId=state.session.user.id;
 if(!sn)return;
 const current=()=>sequence===snLookupSequence&&!state.signingOut&&state.record===record&&
   record.sn.trim()===sn&&String(state.session.user?.id)===String(userId);
 snLookupTimer=setTimeout(async()=>{
  if(!current())return;
  const controller=new AbortController();
  snLookupAbort=controller;
  try{
   const data=await api('/api/sn-history?sn='+encodeURIComponent(sn),{signal:controller.signal});
   if(!current())return;
   state.snLookup={sn,items:data.items.filter(item=>String(item.id)!==String(record.id))};
   renderSnLookup();
  }catch(err){
   if(!controller.signal.aborted&&current())showError(err);
  }finally{
   if(snLookupAbort===controller)snLookupAbort=null;
  }
 },250);
}
const isAdmin=()=>state.session?.user?.role==='admin';
const isCustomer=()=>state.session?.user?.role==='customer';
const recordsTitle=()=>isCustomer()?'Work Orders':isAdmin()?'All Records':'My Records';
const recordStatusLabel=status=>t(status==='completed'?'Completed':status==='wfr'?'In Progress · WFR':'In Progress');
Object.assign(zh,{'Customer':'客户','Work Orders':'工单查询','Work order or serial number':'工单号或序列号'});
const modelById=id=>state.catalog.models.find(m=>String(m.id)===String(id));
const waiting=r=>['awp','needs_analysis'].includes(r?.outcome);
const editable=()=>!isCustomer()&&state.record&&!state.history&&(state.correction||(state.record.status!=='completed'&&String(state.record.ownerId)===String(state.session.user.id))||!state.record.id);
const photoBusy=()=>Boolean(state.photoTransfer?.busy);
const disabled=()=>editable()&&!photoBusy()?'':'disabled';
function notice(message){$('notice').textContent=message;clearTimeout(notice.timer);notice.timer=setTimeout(()=>$('notice').textContent='',4500);}
function errorMessage(error){if(error.code==='SN_OPEN_WORK_ORDER')return t('This serial number already has an unfinished work order.')+' '+t('Complete the existing work order before starting a new one.');if(error.code==='MATERIAL_INACTIVE')return t('Part SKU is inactive')+' '+error.details?.sku;if(error.code==='BOM_QUANTITY_LIMIT')return t('Quantity exceeds the standard usage maximum.');if(error.status===409)return t('This record changed elsewhere. Your entries are retained. Reload the record to review the latest version before retrying.');let s=error.message||String(error);if(error.details)s+='\n'+JSON.stringify(error.details,null,2);return s;}
function showError(error){const box=$('form-error')||$('page-error');if(box){box.textContent=errorMessage(error);box.hidden=false;box.focus();}else notice(errorMessage(error));}
async function api(url,{method='GET',body,signal}={}){const headers={};if(body!==undefined)headers['Content-Type']='application/json';if(method!=='GET'&&state.session?.csrfToken)headers['X-CSRF-Token']=state.session.csrfToken;const response=await fetch(url,{method,headers,signal,body:body===undefined?undefined:JSON.stringify(body)});const data=await response.json();if(!response.ok){const err=new Error(data.error?.message||response.statusText);Object.assign(err,{status:response.status,code:data.error?.code,details:data.error?.details});throw err;}return data;}
function bind(id,event,fn){$(id)?.addEventListener(event,async ev=>{try{await fn(ev);}catch(err){showError(err);}});}
function rememberRecord(record){
 state.savedRecord=structuredClone(record);
 state.record=record;
}
function discardEditorChanges(){
 state.record=structuredClone(state.savedRecord);
 if(!state.record.id)state.createRequestId=randomRequestId();
 state.correction=false;
 state.correctionReason='';
 state.dirty=false;
 clearPhotoDraft();
 renderEditor();
}
function safeGo(fn){if(photoBusy()||state.recordSaving)return;if((state.dirty||state.photoDraft)&&!confirm(t('Unsaved changes will be lost. Continue?')))return;if(state.view==='editor'&&state.savedRecord&&(state.dirty||state.correction||state.photoDraft))discardEditorChanges();state.dirty=false;clearPhotoDraft();recordsSequence++;if(state.view==='history')clearHistorySearch();return fn();}
function shell(content){document.documentElement.lang=state.lang;const user=state.session.user;$('app').innerHTML=`<div class="shell ${state.view==='editor'?'editor-shell':''}"><div class="masthead"><div class="brandmark">Jackery</div><div><h1>${e(t('Service workspace'))}</h1>${!isCustomer()?`<p>${e(t('Only the owner can continue. Completed records require a reasoned admin correction.'))}</p>`:''}</div></div><div class="app-frame">${state.session.demo?`<div class="demo">${e(t(state.catalog.models.some(m=>m.catalogKey)?'Test workspace · Imported Jackery catalog; sample records retained':'Demo workspace · Fictitious records and BOM only'))}</div>`:''}<header><strong>${e(t('Jackery Service Records'))}</strong><nav aria-label="${e(t('Service workspace'))}"><button id="records-nav" class="${state.view==='records'?'active':''}">${e(t(recordsTitle()))}</button>${!isCustomer()?`<button id="current-nav" class="${state.view==='editor'?'active':''}" ${state.record?'':'disabled'}>${e(t('Current Record'))}</button><button id="history-nav" class="${state.view==='history'?'active':''}">${e(t('SN History'))}</button>`:''}${isAdmin()||isCustomer()?`<button id="inventory-nav" class="${state.view==='inventory'?'active':''}">${e(t(isCustomer()?'Stock Query':'Material Inventory'))}</button>`:''}${isAdmin()?`<button id="admin-nav" class="${state.view==='admin'?'active':''}">${e(t('Administration'))}</button>`:''}</nav><span class="user">${e(user.displayName)}</span><button id="language" aria-label="${state.lang==='en'?'Switch to Chinese':'Switch to English'}">${state.lang==='en'?'ZH':'EN'}</button><button id="account">${e(t('Change Password'))}</button><button id="logout">${e(t('Sign out'))}</button></header><main id="main"><div id="page-error" class="error-box" role="alert" tabindex="-1" hidden></div>${content}</main></div>${!isCustomer()?`<p class="footnote">${e(t('Only model BOM items; default quantity is 1. Packaging is recorded the same way.'))}</p>`:''}</div>`;
 bind('records-nav','click',()=>safeGo(()=>loadRecords()));bind('current-nav','click',()=>{if(state.view==='editor')return;return safeGo(()=>{state.view='editor';state.knowledge=null;renderEditor();loadKnowledge();});});bind('history-nav','click',()=>safeGo(()=>{state.view='history';renderHistory();}));bind('admin-nav','click',()=>safeGo(()=>loadAdmin()));bind('inventory-nav','click',()=>safeGo(()=>{state.view='inventory';renderStock();}));bind('language','click',()=>changeLanguage());bind('logout','click',()=>safeGo(async()=>{state.signingOut=true;invalidateSnLookup();knowledgeSequence++;knowledgeAbort?.abort();$('logout').disabled=true;$('language').disabled=true;try{await preferenceQueue;await api('/api/logout',{method:'POST'});clearSessionState();renderLogin();}catch(err){state.signingOut=false;if($('logout'))$('logout').disabled=false;if($('language'))$('language').disabled=false;throw err;}}));bind('account','click',passwordDialog);
}
function renderCurrent(){if(state.view==='editor')renderEditor();else if(state.view==='history')renderHistory();else if(state.view==='admin')renderAdmin();else if(state.view==='inventory')renderStock();else renderRecords();}
function renderStock(){renderInventory({state,shell,api,t,date,partName:x=>partDescription(x,{nameOnly:true})});}
function renderLogin(){document.documentElement.lang=state.lang;$('app').innerHTML=`<main id="main" class="login"><div class="panel"><div class="brandmark">Jackery</div><h1>${e(t('Jackery Service Records'))}</h1><p class="muted">${e(t('Sign in to continue your work.'))}</p>${state.session?.demo?`<p class="demo">${e(t('Demo workspace · Fictitious records and BOM only'))}</p>`:''}<div id="form-error" class="error-box" role="alert" tabindex="-1" hidden></div><form id="login-form">${input('username','Username','','autocomplete="username" required')}${input('password','Password','','type="password" autocomplete="current-password" required')}<button class="primary" type="submit">${e(t('Sign in'))}</button></form><button id="login-language" aria-label="${state.lang==='en'?'Switch to Chinese':'Switch to English'}">${state.lang==='en'?'ZH':'EN'}</button></div></main>`;bind('login-language','click',()=>{state.lang=state.lang==='en'?'zh':'en';renderLogin();});bind('login-form','submit',async ev=>{ev.preventDefault();state.session=await api('/api/login',{method:'POST',body:{username:$('username').value,password:$('password').value}});invalidateSnLookup();state.lang=state.session.user.language==='zh'?'zh':'en';await loadCatalog();await loadRecords();});}
async function loadCatalog(){state.catalog=await api('/api/catalog'+(isAdmin()?'?includeInactive=1':''));}
function filterQuery(filters=state.filters){const q=new URLSearchParams();for(const[k,v]of Object.entries(filters))if(v!==''&&v!=null)q.set(k,v);return q.toString();}
let recordsSequence=0;
async function loadRecords(filters=state.filters){
 const seq=++recordsSequence;
 const records=await api('/api/records?'+filterQuery(filters)).catch(err=>{if(seq===recordsSequence)throw err;});
 if(seq!==recordsSequence)return;
 state.filters=filters;state.records=records;state.view='records';renderRecords();
}
function followUpFilters(){
 if(isCustomer())return '';
 return '<div class="follow-up" role="group" aria-label="'+e(t('Follow-up filter'))+'"><strong>'+e(t('Follow-up filter'))+'</strong>'+
  ['','awp','needs_analysis'].map(code=>`<button type="button" data-follow-up="${code}" aria-pressed="${(state.filters.followUp||'')===code}">${e(code?outcomeLabel(code):t('All'))}</button>`).join('')+'</div>';
}
function listStatus(r){
 if(!isCustomer()&&r.status==='wfr'&&waiting(r))return t('In Progress')+' · '+outcomeLabel(r.outcome);
 return isCustomer()?recordStatusLabel(r.status):t(r.status==='completed'?'Completed':'In Progress');
}
Object.assign(zh,{'Follow-up filter':'跟进筛选','Searching history':'正在查询历史工单','History for SN':'历史工单 · 序列号','History record count':'历史记录数','History lookup failed':'历史查询失败','Changed field':'变更字段','Full original record':'查看完整原始记录','Not recorded':'未记录','Empty':'空白','Changed fields':'变更项','No business field changes':'无业务字段变化','Administrator correction':'管理员更正','Record created':'新建工单','Progress saved':'保存进度','Record completed':'完成并锁定','Photo added':'添加照片'});
function renderRecords(){const f=state.filters;const modelOptions=state.catalog.models.map(m=>option(m.id,modelLabel(m),f.modelId)).join('');shell(`<div class="heading"><h1>${e(t(recordsTitle()))}</h1>${!isCustomer()?`<div><button id="export-records">${e(t('Export'))}</button><button class="primary" id="new-record">+ ${e(t('New Work Record'))}</button></div>`:''}</div><form id="filters" class="filters">${input('filter-q',isCustomer()?'Work order or serial number':'Serial Number',f.q)}<label>${e(t('Status'))}<select id="filter-status">${option('',t('All'),f.status)}${(isCustomer()?['wfr','completed']:['draft','wfr','completed']).map(s=>option(s,recordStatusLabel(s),f.status)).join('')}</select></label><label>${e(t('Model'))}<select id="filter-modelId">${option('',t('All'),f.modelId)}${modelOptions}</select></label>${isAdmin()?input('filter-ownerId','Owner',f.ownerId,'placeholder="User ID"'):''}${input('filter-from','From',f.from,'type="date"')}${input('filter-to','To',f.to,'type="date"')}<button class="primary">${e(t('Search'))}</button></form>${followUpFilters()}<div class="table-wrap"><table><thead><tr>${['Work Order','Serial Number','Model',...(!isCustomer()?['Owner']:[]),'Work Time','Status','Outcome'].map(x=>`<th>${e(t(x))}</th>`).join('')}</tr></thead><tbody>${state.records.items.map(r=>`<tr><td><button class="record-link" data-open-record="${e(r.id)}">${e(r.workOrder)}</button></td><td>${e(r.sn)}</td><td>${e(modelLabel(r.modelSnapshot))}</td>${!isCustomer()?`<td>${e(r.ownerName)}</td>`:''}<td>${e(displayWorkTime(r))}</td><td><span class="badge ${e(r.status)}">${e(listStatus(r))}</span></td><td>${e(outcomeLabel(r.outcome))}</td></tr>`).join('')||`<tr><td colspan="${isCustomer()?6:7}" class="empty">${e(t('No records found'))}</td></tr>`}</tbody></table></div><div class="pagination"><span>${e(state.records.total)} ${e(t('items'))} · ${e(t('Page'))} ${e(f.page)}</span><div class="row"><button id="records-prev" ${f.page<=1?'disabled':''}>${e(t('Previous'))}</button><button id="records-next" ${f.page*20>=state.records.total?'disabled':''}>${e(t('Next'))}</button></div></div>`);
 document.querySelectorAll('[data-follow-up]').forEach(button=>button.addEventListener('click',()=>{
  const filters={...state.filters,followUp:button.dataset.followUp,page:1};
  if(filters.followUp&&filters.status!=='wfr')filters.status='';
  loadRecords(filters).catch(showError);
 }));
 bind('new-record','click',newRecord);bind('filters','submit',ev=>{ev.preventDefault();const filters={...state.filters,page:1};for(const k of ['q','status','modelId','ownerId','from','to'])if($('filter-'+k))filters[k]=$('filter-'+k).value;if(['draft','completed'].includes(filters.status))filters.followUp='';return loadRecords(filters);});bind('records-prev','click',()=>loadRecords({...state.filters,page:state.filters.page-1}));bind('records-next','click',()=>loadRecords({...state.filters,page:state.filters.page+1}));bind('export-records','click',()=>{const a=document.createElement('a');const params=new URLSearchParams(filterQuery());params.set('language',state.lang);a.href='/api/export?'+params;a.download='work-records.xlsx';document.body.append(a);a.click();a.remove();});document.querySelectorAll('[data-open-record]').forEach(b=>b.addEventListener('click',()=>openRecord(b.dataset.openRecord).catch(showError)));
}
function randomRequestId(){
 return Array.from(crypto.getRandomValues(new Uint8Array(16)),byte=>byte.toString(16).padStart(2,'0')).join('');
}
function newRecord(){recordsSequence++;invalidateSnLookup();state.createRequestId=randomRequestId();rememberRecord({sn:'',modelId:'',modelSnapshot:{checkItems:[]},productSku:'',sourcePallet:'',storagePallet:'',workTime:germanWorkTime(),ownerId:state.session.user.id,status:'draft',version:0,outcome:null,faultCodes:[],checks:{initial:{}},appearanceCodes:[],appearanceSnapshot:[],appearanceNotes:'',issueNotes:'',scrapReason:'',materials:[],photos:[]});state.dirty=false;state.history=false;state.historySn='';state.snLookup=null;clearPhotoDraft();state.correction=false;state.view='editor';state.knowledge=null;renderEditor();loadKnowledge();}
async function openRecord(id,historySn=''){const originatingSearch=state.historySearch,seq=++recordsSequence;
 invalidateSnLookup();
 const current=()=>seq===recordsSequence&&(!historySn||state.historySearch===originatingSearch);
 let data;
 try{data=await api('/api/records/'+encodeURIComponent(id)+(historySn?'?historySn='+encodeURIComponent(historySn):''));}
 catch(err){if(current())throw err;return;}
 if(!current())return;
 rememberRecord(data.record);clearPhotoDraft();state.history=Boolean(historySn);state.historySn=historySn;state.correction=false;state.dirty=false;state.view='editor';state.knowledge=null;renderEditor();scheduleSnLookup();loadKnowledge();}
function outcomeLabel(code){const own=state.catalog.outcomes?.find(x=>x.code===code);return own?label(own):t(({like_new:'Like New',good:'Good',acceptable:'Acceptable',rok:'ROK',scrap:'SCRAP',awp:'AWP',needs_analysis:'Needs Analysis'})[code]||'No outcome selected');}
function workTimeField(record){
 const title='Work Time (Germany)';
 if(!editable())return input('workTime',title,displayWorkTime(record),'readonly');
 const field=input('workTime',title,record.workTime??'',`type="datetime-local" step="60" ${record.id?'':'required'}`);
 if(!record.id||record.workTime)return field;
 return field.replace('</label>',`<small id="legacy-work-date" class="legacy-work-date">${e(record.workDate)}</small></label>`);
}
function renderEditor(){const r=state.record,d=disabled(),m=r.modelSnapshot||modelById(r.modelId)||{checkItems:[]};const checks=m.checkItems||[];const appearance=state.catalog.appearanceOptions.map(option=>(r.appearanceSnapshot||[]).find(saved=>saved.code===option.code)||option);for(const x of r.appearanceSnapshot||[])if(!appearance.some(y=>y.code===x.code))appearance.push(x);const groups=[['refurbishment','Refurbishment',['like_new','good','acceptable'],'Refurbishment requires every inspection result to pass.'],['repair','Repair',['rok','scrap'],'ROK requires all functions to be inspected. SCRAP requires a reason.'],['wfr','WFR',['awp','needs_analysis'],'Waiting, not completed. Continue this record later.']];
 shell(`<div class="heading"><div><h1>${e(t('Work Record'))}</h1><span class="badge ${e(r.status)}">${e(isCustomer()?recordStatusLabel(r.status):t(r.status==='completed'?'Completed':'In Progress'))}</span>${state.dirty?`<span class="badge draft">${e(t('Unsaved edits'))}</span>`:''}${!editable()?`<span class="badge">${e(t('View-only'))}</span>`:''}</div><div><small>${r.updatedAt?`${e(t('Last saved'))} ${e(date(r.updatedAt))} · ${e(t('Version'))} ${r.version}`:e(t('New record'))}</small><button id="reload-record" ${r.id?'':'disabled'}>${e(t('Reload latest record'))}</button></div></div><div id="form-error" class="error-box" role="alert" tabindex="-1" hidden></div>${r.modelId&&!m.checkItems?.length?`<p class="error-box">${e(t('No active models. Ask an administrator to add a model and checklist.'))}</p>`:''}<div class="identity${isCustomer()?'':' has-pallets'}">${input('sn','Serial Number',r.sn,`${d} required maxlength="200"`)}<label for="modelId">${e(t('Model'))}<select id="modelId" ${d} ${r.id&&!state.correction?'disabled':''} ${state.correction?'aria-describedby="model-correction-hint"':''}>${!r.id?option('',t('Select model'),r.modelId):''}${r.modelId&&!modelById(r.modelId)?option(r.modelId,modelLabel(m),r.modelId):''}${state.catalog.models.filter(x=>x.active||String(x.id)===String(r.modelId)).map(x=>option(x.id,modelLabel(r.id&&String(x.id)===String(r.modelId)?m:x),r.modelId)).join('')}</select>${state.correction?`<small id="model-correction-hint">${e(t('Changing the model keeps matching check results and clears fault codes and material selections.'))}</small>`:''}</label>${!isCustomer()?input('sourcePallet','Source Pallet No.',r.sourcePallet??'','maxlength="200"'):''}${input('productSku','Product SKU',r.productSku,'disabled')}${input('workOrder','Work Order',r.workOrder||'—','disabled')}${workTimeField(r)}</div><div class="banner"><span id="sn-history-hint" role="status">${e(t(state.snLookup?.sn===r.sn.trim()&&state.snLookup.items.length?'Previous records found for this SN. Records owned by others are view-only.':'Previous visits for the exact SN are available read only.'))}</span><div class="row"><button id="resume-existing-sn" hidden>${e(t('Resume existing work order'))}</button><button id="view-history">${e(t('View History'))}</button></div></div><div class="editor-grid"><section class="panel checks"><div class="panel-head"><h2>${e(t('Functional Checks'))}</h2><div id="knowledge-tools"></div></div><div id="selected-faults" class="fault-chips"></div>${checks.some(c=>guidanceValue(c,'label').missing)?`<small class="guidance-missing check-language-warning">${e(t('English guidance not supplied. Original source shown.'))}</small>`:''}<div class="check-table-wrap"><table><thead><tr><th>${e(t('Check Item'))}</th><th>${e(t('Inspection Result'))}</th></tr></thead><tbody>${checks.map(c=>`<tr><td>${guidanceField(c,'label')||e(c.code)}</td><td><div class="functional-options" role="radiogroup" aria-label="${e(guidanceLabel(c,'label',c.code))}">${['not_tested','pass','fail'].map((value,i)=>`<label class="functional-choice ${value}"><input type="radio" name="functional-initial-${e(c.code)}" data-functional-check="${e(c.code)}" data-check-code="${e(c.code)}" data-check-phase="initial" value="${value}" ${(r.checks?.initial?.[c.code]||'not_tested')===value?'checked':''} ${d}><span>${e(t(['Not Tested','Pass','Fail'][i]))}</span></label>`).join('')}</div></td></tr>`).join('')}</tbody></table></div></section><section class="panel defect-panel" id="defect-panel"><h2 id="defect-heading">${e(t('Defect remark'))}</h2><div class="stack"><textarea id="issueNotes" aria-labelledby="defect-heading" ${d}>${e(r.issueNotes)}</textarea></div></section><section class="panel notes-panel"><h2>${e(t('Appearance condition'))}</h2><div class="stack"><textarea id="appearanceNotes" aria-label="${e(t('Appearance Notes'))}" ${d}>${e(r.appearanceNotes)}</textarea></div><div class="appearances">${appearance.map(a=>`<label><input type="checkbox" data-appearance="${e(a.code)}" ${r.appearanceCodes.includes(a.code)?'checked':''} ${d}>${e(label(a))}</label>`).join('')}</div></section><section class="panel evidence-section"><div class="panel-head"><h2>${e(t('Evidence Photos'))}</h2><span class="badge">${r.photos?.length||0}</span></div><small>${e(t('Optional'))} · ${e(t('JPEG or PNG, up to 20 photos. Large photos are compressed before upload.'))}</small><div id="photos" class="photos">${r.photos?.map((p,i)=>`<div class="photo"><a href="${e(photoUrl(p))}" target="_blank" rel="noopener"><img src="${e(photoUrl(p))}" alt="${e(t('Evidence Photo'))} ${i+1}" loading="lazy"></a>${editable()?`<button class="danger" data-delete-photo="${e(p.id)}">${e(t('Remove'))}</button>`:''}</div>`).join('')||`<small>${e(t('No photos'))}</small>`}</div>${editable()?`<div class="photo-tools"><div class="photo-picker"><label for="photo-file">${e(t('Evidence Photos'))}</label><input id="photo-file" class="sr-only" type="file" accept="image/png,image/jpeg" tabindex="-1" aria-describedby="photo-selection"><button id="choose-photo" type="button">${e(t('Choose Photo'))}</button><small id="photo-selection" role="status"></small></div><button id="upload-photo" type="button">${e(t('Upload Photo'))}</button></div><div id="photo-feedback" class="photo-feedback" hidden><small id="photo-progress-status" role="status"></small><progress id="photo-progress" max="100" aria-label="${e(t('Photo upload progress'))}" hidden></progress><small id="photo-error" role="alert" hidden></small><button id="discard-photo" type="button" hidden>${e(t('Remove pending photo'))}</button></div>`:''}</section><section class="panel materials"><div class="panel-head"><h2>${e(t('Material Usage'))}</h2>${!isCustomer()?`<button class="primary" id="open-bom" ${d}>+ ${e(t('Add BOM Items'))}</button>`:''}</div><p class="muted">${e(t('Only model BOM items; default quantity is 1. Packaging is recorded the same way.'))}</p><p><span class="badge">${r.materials.length} ${e(t('items'))}</span></p><div class="table-wrap"><table><thead><tr>${['Part SKU','Part Name','Qty',...(!isCustomer()?['Action']:[])].map(x=>`<th>${e(t(x))}</th>`).join('')}</tr></thead><tbody id="material-rows">${r.materials.map((x,i)=>`<tr data-material-row="${e(x.bomId)}"><td>${e(x.sku)}</td><td>${partDescription(x,{nameOnly:true})}${capHint(x)}${substitutionHint(x)}</td><td>${isCustomer()?e(x.quantity):`<input class="quantity" data-material-qty="${i}" type="number" ${quantityAttributes(x)} value="${e(x.quantity)}" aria-label="${e(x.sku)} ${e(t('Qty'))}" ${d} ${x.substitution?.kitId?'disabled':''}>`}</td>${!isCustomer()?`<td><button class="danger" data-remove-material="${i}" ${d}>${e(t(x.substitution?.kitId?'Remove kit':'Remove'))}</button></td>`:''}</tr>`).join('')}</tbody></table>${!r.materials.length?`<p class="empty">${e(t('No materials added'))}</p>`:''}</div><div class="info">${e(t('Only model BOM items; default quantity is 1. Packaging is recorded the same way.'))}</div></section></div><section class="panel outcomes"><div class="panel-head"><div class="row"><h2>${e(t('Outcome'))}</h2>${!isCustomer()?`<span class="muted">${e(t('Choose ONE outcome across Refurbishment, Repair and WFR.'))}</span>`:''}</div><span class="badge">${e(outcomeLabel(r.outcome))}</span></div>${!isCustomer()?`<div class="outcome-grid">${groups.map(([group,title,codes,hint])=>`<section class="outcome-group"><h3>${e(t(title))}${group==='refurbishment'?`<button id="grade-criteria-button" type="button" popovertarget="grade-criteria">${e(t('Grade criteria'))}</button>`:''}</h3><div class="outcome-options">${codes.map(code=>`<label class="radio-option"><input type="radio" name="outcome" value="${code}" ${r.outcome===code?'checked':''} ${d}>${e(outcomeLabel(code))}</label>`).join('')}</div><small>${e(t(hint))}</small></section>`).join('')}</div>${gradeCriteria(m,t)}`:''}${r.outcome==='scrap'?`<div class="spaced">${textarea('scrapReason','Scrap Reason',r.scrapReason,`${d} required`)}</div>`:''}</section>${!isCustomer()&&state.history&&r.status!=='completed'&&String(r.ownerId)===String(state.session.user.id)?`<button id="resume-record">${e(t('Resume Record'))}</button>`:''}${!isCustomer()?`<div class="actions${state.correction?' correction-actions':''}">${state.correction?textarea('correctionReason','Correction Reason',state.correctionReason||'','required maxlength="2000"'):`<small>${e(t('Only the owner can continue. Completed records require a reasoned admin correction.'))}</small>`}<div class="row pallet-actions">${input('storagePallet','Completion Pallet No.',r.storagePallet??'','maxlength="200"')}${isAdmin()?`<button id="view-audit" ${r.id?'':'disabled'}>${e(t('View Audit'))}</button>`:''}${state.correction?`<button id="cancel-correction">${e(t('Cancel'))}</button><button class="primary" id="save-correction">${e(t('Save Correction'))}</button>`:editable()?`<button id="save-record">${e(t(waiting(r)?'Save WFR':'Save Progress'))}</button>${waiting(r)?'':`<button class="primary" id="complete-record">${e(t('Complete & Lock'))}</button>`}`:isAdmin()&&!state.history?`<button class="primary" id="start-correction">${e(t('Admin Correction'))}</button>`:''}</div></div>`:''}`);
 for(const key of ['sn','sourcePallet','storagePallet','appearanceNotes','issueNotes','translatedAppearanceNotes','translatedIssueNotes','scrapReason'])bind(key,'input',ev=>{r[key]=ev.target.value;state.dirty=true;if(key==='sn'){scheduleSnLookup();updatePalletFields();}if(key==='appearanceNotes'||key==='issueNotes'){const translated=key==='appearanceNotes'?'translatedAppearanceNotes':'translatedIssueNotes';if(!r[key].trim()){r[translated]='';if($(translated))$(translated).value='';}if($(translated))$(translated).disabled=!editable()||!r[key].trim();}});bind('workTime','input',ev=>{r.workTime=ev.target.value;state.dirty=true;if($('legacy-work-date'))$('legacy-work-date').hidden=Boolean(r.workTime);});bind('correctionReason','input',ev=>{state.correctionReason=ev.target.value;state.dirty=true;});bind('modelId','change',ev=>{const previousModel=r.modelSnapshot;r.modelId=ev.target.value?Number(ev.target.value):'';r.modelSnapshot=structuredClone(modelById(r.modelId));r.productSku=r.modelSnapshot?.productSku||'';r.checks={initial:state.correction?carryCheckResults(previousModel,r.modelSnapshot,r.checks?.initial):{}};r.materials=[];r.faultCodes=[];r.faultSnapshot=[];state.knowledge=null;state.dirty=true;renderEditor();loadKnowledge();});
 document.querySelectorAll('[data-functional-check]').forEach(el=>el.addEventListener('change',()=>{r.checks[el.dataset.checkPhase]??={};r.checks[el.dataset.checkPhase][el.dataset.checkCode]=el.value;state.dirty=true;}));document.querySelectorAll('[data-appearance]').forEach(el=>el.addEventListener('change',()=>{r.appearanceCodes=toggleAppearance(r.appearanceCodes,el.dataset.appearance,el.checked);state.dirty=true;document.querySelectorAll('[data-appearance]').forEach(x=>x.checked=r.appearanceCodes.includes(x.dataset.appearance));}));document.querySelectorAll('input[name=outcome]').forEach(el=>el.addEventListener('change',()=>{r.outcome=el.value;state.dirty=true;renderEditor();}));document.querySelectorAll('[data-material-qty]').forEach(el=>el.addEventListener('input',()=>{r.materials[Number(el.dataset.materialQty)].quantity=el.value;state.dirty=true;}));document.querySelectorAll('[data-remove-material]').forEach(el=>el.addEventListener('click',()=>{const index=Number(el.dataset.removeMaterial),kit=r.materials[index].substitution?.kitId;
 if(kit)r.materials=r.materials.filter(item=>item.substitution?.kitId!==kit);
 else r.materials.splice(index,1);state.dirty=true;renderEditor();}));
 renderSnLookup();
 bind('resume-existing-sn','click',()=>{
  const own=state.snLookup?.items.find(item=>item.status!=='completed'&&String(item.ownerId)===String(state.session.user.id));
  if(own)return safeGo(()=>openRecord(own.id));
 });
 renderKnowledge();if(!r.modelId)document.querySelectorAll('.editor-grid input,.editor-grid textarea,.editor-grid button,.outcomes input,.outcomes textarea,.outcomes button,#save-record,#complete-record,#save-correction').forEach(el=>el.disabled=true);bind('sn','keydown',ev=>{if(ev.key==='Enter'){ev.preventDefault();$('modelId')?.focus();}});bind('save-record','click',()=>saveRecord('save'));bind('complete-record','click',()=>saveRecord('complete'));bind('open-bom','click',()=>openBom());bind('reload-record','click',()=>{if(!photoBusy()&&!state.recordSaving&&((!state.dirty&&!state.photoDraft)||confirm(t('Discard unsaved changes and reload the latest version?'))))return openRecord(r.id,state.historySn);});bind('view-history','click',()=>safeGo(()=>{state.view='history';clearHistorySearch();state.historyQuery=r.sn;renderHistory();return loadHistory(r.sn);}));bind('resume-record','click',()=>openRecord(r.id));bind('view-audit','click',auditDialog);bind('start-correction','click',()=>{state.correction=true;state.correctionReason='';renderEditor();});bind('cancel-correction','click',()=>safeGo(()=>openRecord(r.id)));bind('save-correction','click',()=>saveRecord(r.status==='completed'?'complete':'save'));bind('choose-photo','click',()=>$('photo-file').click());bind('photo-file','change',ev=>{
  const file=ev.target.files[0];
  if(!file)return;
  state.photoDraft=file;
  state.preparedPhoto=null;
  state.photoUploadId=randomRequestId();
  state.photoTransfer=null;
  renderPhotoTransfer();
 });bind('upload-photo','click',uploadPhoto);bind('discard-photo','click',()=>{
  if(photoBusy())return;
  clearPhotoDraft();
  $('photo-file').value='';
  renderPhotoTransfer();
 });renderPhotoTransfer();document.querySelectorAll('[data-delete-photo]').forEach(b=>b.addEventListener('click',()=>deletePhoto(b.dataset.deletePhoto).catch(showError)));
}
async function saveRecord(action,{forPhoto=false}={}){if(state.recordSaving||(!forPhoto&&photoBusy()))return false;if(!forPhoto&&!state.correction&&action==='complete'&&state.photoDraft)throw new Error(t('Upload selected photo before completing.'));const r=state.record;validateMaterialQuantities(r.materials);if(!r.sn?.trim())throw new Error(t('Serial Number')+' '+t('Reason')+': required');if(!r.modelId)throw new Error(t('Select a model first.'));if(!r.id&&!r.workTime)throw new Error(t('Enter a work time.'));if(action==='complete'){const err=completionError(r);if(err)throw new Error(t({outcome:'Please choose an outcome.',wfr:'WFR cannot be completed. Save WFR instead.',inspection:'Complete all inspection items. Refurbishment requires all results to pass.',scrap:'Enter a scrap reason before completing this record.'}[err]));}if(state.correction&&!state.correctionReason?.trim())throw new Error(t('Correction reason is required.'));
 const submitted=structuredClone(r);
 const reason=state.correctionReason;
 state.recordSaving=true;
 state.lockingRecord=action==='complete'||state.correction;
 renderPhotoTransfer();
 try{
  if(!r.id){
   const {sn,modelId,workDate,workTime,productSku,sourcePallet,storagePallet}=submitted;
   const created=await api('/api/records',{method:'POST',body:{sn,modelId,workDate,workTime,productSku,sourcePallet,storagePallet,requestId:state.createRequestId}});
   state.savedRecord=structuredClone(created.record);
   for(const key of ['id','workOrder','version'])r[key]=submitted[key]=created.record[key];
  }
  const url='/api/records/'+encodeURIComponent(r.id);
  const body=recordInput(submitted,action);
  const data=state.correction?await api(url+'/corrections',{method:'POST',body:{version:submitted.version,reason,changes:body}}):await api(url,{method:'PUT',body});
  const active=document.activeElement;
  const focusId=active?.id;
  const caret=active?.selectionEnd;
  rememberRecord(data.record);
  const changed=Object.keys(r).filter(key=>JSON.stringify(r[key])!==JSON.stringify(submitted[key]));
  for(const key of changed)state.record[key]=r[key];
  state.dirty=changed.length>0;
  if(!forPhoto&&!state.photoDraft)state.correction=false;
  renderEditor();
  if(state.dirty&&focusId&&$(focusId)){
   $(focusId).focus();
   if(caret!=null)$(focusId).setSelectionRange(caret,caret);
  }
  if(!forPhoto)notice(t(state.dirty?'Earlier changes saved. New edits are still unsaved.':'Saved successfully'));
  return true;
 }catch(err){
  if(err.code==='SN_OPEN_WORK_ORDER')scheduleSnLookup();
  throw err;
 }finally{state.recordSaving=false;state.lockingRecord=false;renderPhotoTransfer();}
}
function photoUrl(p){if(!state.history)return p.url;const url=new URL(p.url,location.origin);url.searchParams.set('sn',state.historySn);return url.pathname+url.search;}
Object.assign(zh,{
 'Photo selected, pending upload':'已选择照片，待上传',
 'Enter or scan a serial number before uploading photos.':'请输入或扫描序列号后再上传照片。',
 'Select a model before uploading photos.':'请选择型号后再上传照片。',
 'Photo upload progress':'照片上传进度',
 'Saving work record…':'正在保存工单…',
 'Preparing photo…':'正在准备照片…',
 'Compressing photo…':'正在压缩照片…',
 'The photo could not be compressed. Select a readable JPEG or PNG and try again.':'无法压缩这张照片，请重新选择可正常打开的 JPEG 或 PNG。',
 'Uploading photo…':'正在上传照片…',
 'Uploading photo':'正在上传照片',
 'Transfer complete. Confirming photo storage…':'传输完成，正在确认保存…',
 'The network is slow. Upload is still in progress.':'网络较慢，仍在上传。',
 'Retry upload':'重试上传',
 'Remove pending photo':'移除待上传照片',
 'The connection was interrupted. Check your connection and retry the photo upload.':'网络连接中断，请检查网络后重试上传。',
 'The photo could not be read. Select it again and retry.':'无法读取照片，请重新选择后上传。',
 'The server did not confirm the photo was saved. Retry the upload.':'服务器未确认照片已保存，请重试上传。',
 'This record is locked or your account cannot upload photos to it.':'工单已锁定，或当前账号没有上传照片的权限。',
 'Photo storage is temporarily unavailable. Retry the upload.':'照片暂时无法保存，请重试上传。',
 'Choose a JPEG or PNG photo.':'请选择 JPEG 或 PNG 格式的照片。',
 'The photo exceeds 8 MiB. Choose a smaller photo.':'照片超过 8 MiB，请选择更小的照片。',
 'The work record could not be saved.':'工单保存失败。',
 'Choose a photo before uploading.':'请先选择照片。'
});
function clearPhotoDraft(){
 state.photoDraft=null;
 state.preparedPhoto=null;
 state.photoUploadId=null;
 state.photoTransfer=null;
}
function updatePalletFields(){
 const disabled=!editable()||!state.record?.modelId||!state.record?.sn?.trim()||photoBusy()||state.recordSaving;
 for(const id of ['sourcePallet','storagePallet'])if($(id))$(id).disabled=Boolean(disabled);
}
function renderPhotoTransfer(){
 if(state.view==='editor'&&$('main'))$('main').inert=Boolean(state.lockingRecord);
 if($('modelId'))$('modelId').disabled=!editable()||photoBusy()||Boolean(state.recordSaving)||(Boolean(state.record?.id)&&!state.correction);
 updatePalletFields();
 const busy=photoBusy(), saving=state.recordSaving;
 const canEdit=editable()&&Boolean(state.record?.modelId);
 for(const id of ['save-record','save-correction','complete-record','upload-photo','choose-photo','photo-file']){
  const control=$(id);
  if(control)control.disabled=!canEdit||busy||Boolean(saving)||(id==='complete-record'&&Boolean(state.photoDraft));
 }
 const reload=$('reload-record');
 if(reload)reload.disabled=!state.record?.id||busy||Boolean(saving);
 for(const button of document.querySelectorAll('[data-delete-photo]'))button.disabled=busy||Boolean(saving);
 if(!$('photo-feedback'))return;
 const transfer=state.photoTransfer;
 const stage=transfer?.stage;
 const transferring=stage==='uploading'||stage==='confirming';
 const error=transfer?.error;
 const progress=$('photo-progress');
 $('photo-selection').textContent=t(state.photoDraft?(stage==='failed'?'Photo selected':'Photo selected, pending upload'):'No photo selected');
 $('upload-photo').textContent=t(stage==='failed'?'Retry upload':'Upload Photo');
 $('photo-feedback').hidden=!transfer;
 $('photo-error').hidden=!error;
 $('photo-error').textContent=error?errorMessage(error):'';
 $('discard-photo').hidden=!state.photoDraft||busy;
 $('discard-photo').disabled=Boolean(saving);
 progress.hidden=!transferring;
 if(transfer?.percent==null)progress.removeAttribute('value');
 else progress.value=transfer.percent;
 let label={saving:'Saving work record…',preparing:'Preparing photo…',compressing:'Compressing photo…',uploading:'Uploading photo…',confirming:'Transfer complete. Confirming photo storage…',saved:'Photo uploaded'}[stage];
 if(stage==='uploading'&&transfer.percent!=null)label=t('Uploading photo')+' '+transfer.percent+'%';
 else label=label?t(label):'';
 if(stage==='uploading'&&transfer.slow)label+=' '+t('The network is slow. Upload is still in progress.');
 $('photo-progress-status').textContent=label;
}
function photoFileContent(file){
 return new Promise((resolve,reject)=>{
  const reader=new FileReader();
  reader.onload=()=>resolve(reader.result.split(',')[1]);
  reader.onerror=()=>reject(new Error(t('The photo could not be read. Select it again and retry.')));
  reader.readAsDataURL(file);
 });
}
function sendPhoto(url,body,updateProgress){
 return new Promise((resolve,reject)=>{
  const request=new XMLHttpRequest();
  request.open('POST',url);
  request.setRequestHeader('Content-Type','application/json');
  request.setRequestHeader('X-CSRF-Token',state.session.csrfToken);
  request.responseType='json';
  request.upload.onprogress=event=>{
   if(event.lengthComputable&&event.total>0)updateProgress('uploading',Math.floor(event.loaded/event.total*100));
  };
  request.upload.onload=()=>updateProgress('confirming',100);
  const connectionError=()=>reject(new Error(t('The connection was interrupted. Check your connection and retry the photo upload.')));
  request.onerror=connectionError;
  request.onabort=connectionError;
  request.onload=()=>{
   const data=request.response;
   if(request.status>=200&&request.status<300&&data?.photo&&data.record?.photos?.some(photo=>photo.id===data.photo.id)){
    resolve(data);
    return;
   }
   const message=data?.error?.message??(request.status===413?'The photo exceeds 8 MiB. Choose a smaller photo.':'The server did not confirm the photo was saved. Retry the upload.');
   const error=Object.assign(new Error(t(message)),{status:request.status,code:data?.error?.code,details:data?.error?.details});
   reject(error);
  };
  request.send(JSON.stringify(body));
 });
}
async function uploadPhoto(){
 if(photoBusy()||state.recordSaving)return;
 const file=state.photoDraft;
 const r=state.record;
 const invalidPhoto=(message,focus)=>{
  state.photoTransfer={stage:file?'failed':'invalid',error:new Error(t(message))};
  renderPhotoTransfer();
  $(focus)?.focus();
 };
 if(!file)return invalidPhoto('Choose a photo before uploading.','choose-photo');
 if(!r.sn?.trim())return invalidPhoto('Enter or scan a serial number before uploading photos.','sn');
 if(!r.modelId)return invalidPhoto('Select a model before uploading photos.','modelId');
 if(!['image/png','image/jpeg'].includes(file.type))return invalidPhoto('Choose a JPEG or PNG photo.','choose-photo');
 const reason=state.correction?state.correctionReason:null;
 if(state.correction&&!reason?.trim())return invalidPhoto('Correction reason is required.','correctionReason');

 if(hasUnsavedCorrection())return invalidPhoto('Save or cancel your work order correction before changing photos.','save-correction');
 const needsSave=!state.correction&&(!r.id||state.dirty);
 const shouldCompress=!state.preparedPhoto&&needsPhotoCompression(file);
 const transfer={busy:true,stage:shouldCompress?'compressing':'preparing'};
 state.photoTransfer=transfer;
 renderEditor();
 notice('');
 let slowTimer;
 const updateProgress=(stage,percent)=>{
  clearTimeout(slowTimer);
  Object.assign(transfer,{stage,percent,slow:false});
  renderPhotoTransfer();
  if(stage==='uploading')slowTimer=setTimeout(()=>{transfer.slow=true;renderPhotoTransfer();},8000);
 };
 try{
  state.preparedPhoto??=shouldCompress?await compressPhoto(file):file;
  const prepared=state.preparedPhoto;
  if(prepared.size>8388608){
   invalidPhoto('The photo exceeds 8 MiB. Choose a smaller photo.','choose-photo');
   return;
  }
  if(needsSave){
   updateProgress('saving');
   await saveRecord(state.correction&&r.status==='completed'?'complete':'save',{forPhoto:true});
   updateProgress('preparing');
  }
  const contentBase64=await photoFileContent(prepared);
  updateProgress('uploading');
  const data=await sendPhoto('/api/records/'+state.record.id+'/photos',{
   version:state.record.version,filename:file.name,contentBase64,uploadId:state.photoUploadId,...(reason?{reason}:{})
  },updateProgress);
  rememberRecord(data.record);
  state.dirty=false;
  clearPhotoDraft();
  state.photoTransfer={stage:'saved'};
 }catch(error){
  let failure=error;
  if(transfer.stage==='compressing')failure=new Error(t('The photo could not be compressed. Select a readable JPEG or PNG and try again.'));
  else if(transfer.stage==='saving')failure=new Error(t('The work record could not be saved.')+' '+errorMessage(error));
  else if(error.status===403)failure=new Error(t('This record is locked or your account cannot upload photos to it.'));
  else if(error.status>=500)failure=new Error(t('Photo storage is temporarily unavailable. Retry the upload.'));
  else if(error.code&&[413,422].includes(error.status))failure=new Error(t('Upload failed. Your photo has not been saved. Please try again.')+' '+error.code+' · '+error.message);
  state.photoTransfer={stage:'failed',error:failure};
 }finally{
  clearTimeout(slowTimer);
  renderEditor();
 }
}
function hasUnsavedCorrection(){
 if(!state.correction||!state.dirty)return false;
 return JSON.stringify(recordInput(state.record,'save'))!==JSON.stringify(recordInput(state.savedRecord,'save'));
}
async function deletePhoto(id){if(photoBusy()||state.recordSaving)return;const reason=state.correction?state.correctionReason:null;if(state.correction&&!reason?.trim())throw new Error(t('Correction reason is required.'));if(hasUnsavedCorrection())throw new Error(t('Save or cancel your work order correction before changing photos.'));if(state.dirty&&!state.correction)await saveRecord('save');const data=await api('/api/photos/'+encodeURIComponent(id),{method:'DELETE',body:{version:state.record.version,...(reason?{reason}:{})}});rememberRecord(data.record);state.dirty=false;renderEditor();notice(t('Photo removed'));}
function dialog(id,title,body,footer='',className='',beforeClose=null){const previous=document.activeElement;$('modal-root').innerHTML=`<dialog id="${id}" class="${className}" aria-labelledby="dialog-title"><div class="dialog-head"><div><h2 id="dialog-title">${e(title)}</h2></div><button id="dialog-x" aria-label="${e(t('Close'))}">${e(t('Close'))}</button></div><div class="dialog-body">${body}</div>${footer?`<div class="dialog-footer">${footer}</div>`:''}</dialog>`;const d=$(id);const close=(force=false)=>{if(force!==true&&beforeClose&&!beforeClose())return false;d.close();d.remove();previous?.focus();return true;};d.addEventListener('cancel',ev=>{ev.preventDefault();close();});d.addEventListener('close',()=>{if(document.activeElement===document.body||document.activeElement===d||d.contains(document.activeElement))previous?.focus();});$('dialog-x').addEventListener('click',()=>close());d.showModal();return {d,close};}
Object.assign(zh,{'All Items':'全部','Core':'核心','Non-core':'非核心','Packaging':'包材','Material category':'物料类别','items have no category label yet. Find them in All Items.':'项物料分类标注待补充，请在“全部”中查找。','Category labels are pending. Use All Items to find available materials.':'分类标注待补充，请在“全部”中选择现有物料。','Selections stay checked across categories, searches and pages. No duplicate rows.':'跨分类、搜索、分页保留选择，不重复添加。','Loading BOM items…':'正在加载 BOM 物料…'});
async function openBom(retained=null){if(!state.record.modelId)throw new Error(t('Select a model first.'));const bomModelId=state.record.modelId;const bomRecord=state.record;const b=retained||{q:'',page:1,category:'all',pending:new Map(),data:{items:[],total:0}};b.category??='all';b.kits??=new Map();const categories=[['all','All Items'],['core','Core'],['non_core','Non-core'],['packaging','Packaging']];const modal=dialog('bom-dialog',t('Add Items from Model BOM'),`<section class="drawer-results"><form id="bom-search-form" class="search-row"><label class="grow">${e(t('Search part SKU or description'))}<input id="bom-search" autocomplete="off" value="${e(b.q)}"></label><button>${e(t('Search'))}</button></form><div id="bom-categories" class="bom-categories" role="group" aria-label="${e(t('Material category'))}"></div><p id="bom-category-note" class="bom-category-note" role="status" hidden></p><p id="bom-count" class="muted" role="status"></p><div id="bom-error" role="alert" class="error-box" hidden></div><div class="bom-list"><table><thead><tr><th>${e(t('Select'))} / ${e(t('Part SKU'))}</th><th>${e(t('Part Name'))}</th><th>${e(t('Current Stock'))}</th><th>${e(t('Status'))}</th></tr></thead><tbody id="bom-results"></tbody></table></div><div class="pagination"><small id="bom-page"></small><div class="row"><button id="bom-prev">${e(t('Previous'))}</button><button id="bom-next">${e(t('Next'))}</button></div></div><div class="info">${e(t('Selections stay checked across categories, searches and pages. No duplicate rows.'))}</div></section><aside class="pending"><h3 id="pending-count"></h3><small>${e(t('Pending items are not added until you click Add Selected Items.'))}</small><div id="bom-pending"></div></aside>`,`<small>${e(t('Only model BOM items; default quantity is 1. Packaging is recorded the same way.'))}</small><div class="row"><button id="bom-language" aria-label="${state.lang==='en'?'Switch to Chinese':'Switch to English'}">${state.lang==='en'?'ZH':'EN'}</button><button id="bom-cancel">${e(t('Cancel'))}</button><button class="primary" id="bom-add">${e(t('Add Selected Items'))}</button></div>`,'drawer',()=>!b.pending.size||confirm(t('Discard pending BOM selections?')));
 const renderPending=()=>{$('pending-count').textContent=b.pending.size+' '+t('Items to Add');$('bom-add').disabled=!b.pending.size;$('bom-pending').innerHTML=[...b.pending.values()].map(x=>`<div class="pending-item"><strong data-pending-sku>${e(x.sku)}</strong><p>${partDescription(x,{nameOnly:true})}${capHint(x)}</p><div class="row"><label>${e(t('Qty'))}<input class="quantity" type="number" ${quantityAttributes(x)} value="${e(x.quantity)}" data-pending-qty="${e(x.id)}" ${x.substitution?.kitId?'disabled':''}></label><button class="danger" data-pending-remove="${e(x.id)}">${e(t('Remove'))}</button></div></div>`).join('');document.querySelectorAll('[data-pending-qty]').forEach(el=>el.addEventListener('input',()=>{b.pending.get(String(el.dataset.pendingQty)).quantity=el.value;refreshGroupTotals();}));document.querySelectorAll('[data-pending-remove]').forEach(el=>el.addEventListener('click',()=>{const id=String(el.dataset.pendingRemove),kit=b.pending.get(id)?.substitution?.kitId;
 if(kit){
   for(const [key,value] of b.pending)if(value.substitution?.kitId===kit)b.pending.delete(key);
   for(const [group,selected] of b.kits)if(selected.kit.id===kit)b.kits.delete(group);
 }else b.pending.delete(id);
 renderBom();}));};
 const renderCategories=()=>{$('bom-categories').innerHTML=categories.map(([code,title])=>`<button type="button" class="bom-category" data-bom-category="${code}" aria-pressed="${b.category===code}" aria-controls="bom-results"><span>${e(t(title))}</span><span class="bom-category-count">${b.data.categoryCounts?.[code]??'…'}</span></button>`).join('');document.querySelectorAll('[data-bom-category]').forEach(button=>button.addEventListener('click',()=>{if(b.category===button.dataset.bomCategory)return;b.category=button.dataset.bomCategory;b.q=$('bom-search').value;b.page=1;return load();}));const missing=b.data.categoryCounts?.uncategorized||0;$('bom-category-note').hidden=!missing;$('bom-category-note').textContent=missing+' '+t('items have no category label yet. Find them in All Items.');};
 const selectedRows=(includePending=true)=>[
   ...bomRecord.materials.filter(item=>![...b.kits.values()].some(({group})=>group.items.some(row=>row.sku===item.sku)||group.kits.some(kit=>kit.items.some(row=>row.sku===item.sku)))),
   ...(includePending?b.pending.values():[]),
 ];
 const stagePart=(item,group)=>({...item,quantity:1,...(group?{substitution:{
   groupId:group.id,originalSku:item.originalSku,level:item.level,
   ...(group.cap==null?{}:{groupCap:group.cap}),...(item.kitId?{kitId:item.kitId}:{}),
 }}:{})});
 const groupRow=(group,index)=>`substitution-row ${index===0?'substitution-start ':''}${index===group.items.length+(group.kits?.length??0)-1?'substitution-end':''}`;
 const connector='<span class="substitution-connector" aria-hidden="true"></span>';
 const renderPart=(x,group=null,index=0)=>{
   const on=selectedRows(false).some(v=>String(v.bomId)===String(x.id));
   const selected=b.pending.has(String(x.id));
   const kitPending=group&&b.kits.has(group.id);
   const canSelect=x.selectable!==false&&!kitPending;
   const level=['Original part','First-level substitute','Second-level substitute'][x.level??0];
   const status=x.blockedByStock?'First-level stock is above zero':x.selectable===false?'Material unavailable':selected?'To add':'Not selected';
   return `<tr class="${on||selected?'selected ':''}${group?groupRow(group,index)+(x.level===0?' substitution-original ':' '):''}${!canSelect&&!on?'substitution-blocked':''}" ${group?`data-bom-group="${e(group.id)}"`:''}><td>${group?connector:''}<label><input type="checkbox" data-bom-select="${e(x.id)}" ${on||selected?'checked':''} ${on||!canSelect?'disabled':''}>${e(x.sku)}${group?`<span class="substitution-level">${e(t(level))}</span>`:''}</label></td><td>${partDescription(x,{nameOnly:true})}${capHint(x)}</td><td class="bom-stock ${x.stockQuantity<0?'danger':''}"><strong>${e(x.stockQuantity??0)}</strong> <small>${e(x.unit??'')}</small></td><td>${on?`<p class="duplicate-hint">${e(t('This item is already on the usage list. Update its quantity in the existing row.'))}</p><button data-locate-material="${e(x.id)}">${e(t('Locate usage row'))}</button>`:e(t(status))}${group?.cap!=null&&index===0?`<strong class="substitution-total" id="bom-total-${e(group.id)}">${e(groupSummary(group,x.unit))}</strong>`:''}</td></tr>`;
 };
 const groupQuantity=group=>selectedRows()
   .filter(row=>group.items.some(part=>part.sku===row.sku))
   .reduce((total,row)=>total+Number(row.quantity||0),0);
 const groupSummary=(group,unit)=>`${t('Selected quantity')} ${groupQuantity(group)} / ${group.cap} ${unit||''}`;
 const refreshGroupTotals=()=>{
   for(const x of b.data.items){
     const group=x.substitutionGroup;
     if(!group||group.cap==null)continue;
     const current=document.getElementById('bom-total-'+group.id);
     if(current)current.textContent=groupSummary(group,x.unit);
   }
 };
 const renderGroup=x=>{
   const group=x.substitutionGroup;
   const kits=(group.kits??[]).map((kit,i)=>{
     const selected=b.kits.get(group.id)?.kit.id===kit.id;
     const current=!b.kits.has(group.id)&&bomRecord.materials.some(row=>row.substitution?.kitId===kit.id);
     return `<tr class="${groupRow(group,group.items.length+i)} substitution-kit" data-bom-group="${e(group.id)}"><td colspan="4">${connector}<section class="bom-kit"><h3>${e(t('Packaging kit'))} ${i+1}</h3><ul>${kit.items.map(item=>`<li><strong>${e(item.sku)}</strong> ${partDescription(item,{nameOnly:true})}<small>${e(t('Current Stock'))} ${e(item.stockQuantity)}</small></li>`).join('')}</ul><button type="button" data-bom-kit="${e(kit.id)}" ${current||kit.items.some(item=>!item.selectable)?'disabled':''}>${e(t(selected||current?'Kit selected':'Use kit'))}</button></section></td></tr>`;
   }).join('');
   return group.items.map((item,index)=>renderPart(item,group,index)).join('')+kits;
 };
 const renderBom=()=>{renderCategories();$('bom-count').textContent=b.data.total+' '+t('items');$('bom-page').textContent=`${t('Page')} ${b.page} / ${Math.max(1,Math.ceil(b.data.total/50))}`;$('bom-prev').disabled=b.page<=1;$('bom-next').disabled=b.page*50>=b.data.total;$('bom-results').innerHTML=b.data.items.map(x=>x.substitutionGroup?renderGroup(x):renderPart(x)).join('')||`<tr><td colspan="4" class="empty">${e(t(b.category!=='all'&&!b.q&&b.data.categoryCounts?.[b.category]===0&&b.data.categoryCounts?.uncategorized>0?'Category labels are pending. Use All Items to find available materials.':'No matching items in this model BOM. Check the part SKU or try another word.'))}</td></tr>`;document.querySelectorAll('[data-bom-select]').forEach(el=>el.addEventListener('change',()=>{const id=el.dataset.bomSelect;
 const group=b.data.items.map(x=>x.substitutionGroup).find(g=>g?.items.some(x=>String(x.id)===id));
 const item=group?.items.find(x=>String(x.id)===id)??b.data.items.find(x=>String(x.id)===id);
 if(el.checked)b.pending.set(String(item.id),stagePart(item,group));else b.pending.delete(String(item.id));renderBom();})); document.querySelectorAll('[data-bom-kit]').forEach(el=>el.addEventListener('click',()=>{
   const id=el.dataset.bomKit,group=b.data.items.map(x=>x.substitutionGroup).find(g=>g?.kits?.some(k=>k.id===id));
   const kit=group.kits.find(k=>k.id===id),wasSelected=b.kits.get(group.id)?.kit.id===id;
   const members=new Set([...group.items,...group.kits.flatMap(k=>k.items)].map(x=>x.sku));
   for(const [key,row] of b.pending)if(members.has(row.sku))b.pending.delete(key);
   if(wasSelected)b.kits.delete(group.id);
   else{b.kits.set(group.id,{group,kit});for(const item of kit.items)b.pending.set(String(item.id),stagePart(item,group));}
   renderBom();
 }));
 document.querySelectorAll('[data-locate-material]').forEach(el=>el.addEventListener('click',()=>{if(!modal.close())return;const row=[...document.querySelectorAll('[data-material-row]')].find(row=>row.dataset.materialRow===el.dataset.locateMaterial);row?.scrollIntoView({block:'center'});row?.querySelector('[data-material-qty]')?.focus();}));renderPending();};
 let loadSequence=0;const isCurrentLoad=sequence=>sequence===loadSequence&&$('bom-dialog')===modal.d&&modal.d.open&&state.record===bomRecord&&String(state.record.modelId)===String(bomModelId);
 const load=async()=>{const sequence=++loadSequence;renderCategories();renderPending();$('bom-count').textContent='';$('bom-error').hidden=true;$('bom-prev').disabled=true;$('bom-next').disabled=true;$('bom-results').innerHTML=`<tr><td colspan="4" class="empty" role="status">${e(t('Loading BOM items…'))}</td></tr>`;try{const data=await api('/api/models/'+encodeURIComponent(bomModelId)+'/bom?'+new URLSearchParams({q:b.q,page:b.page,pageSize:50,category:b.category,substitutions:1}));if(!isCurrentLoad(sequence))return;b.data=data;$('bom-error').hidden=true;renderBom();}catch(err){if(!isCurrentLoad(sequence))return;$('bom-error').hidden=false;$('bom-error').textContent=errorMessage(err);}};
 positionGradeCriteria($('grade-criteria-button'),$('grade-criteria'));
 bind('bom-search','input',()=>{b.q=$('bom-search').value;});bind('bom-search-form','submit',ev=>{ev.preventDefault();b.q=$('bom-search').value;b.page=1;return load();});bind('bom-prev','click',()=>{b.page--;return load();});bind('bom-next','click',()=>{b.page++;return load();});bind('bom-language','click',()=>{b.q=$('bom-search').value;modal.close(true);return changeLanguage(()=>openBom(b));});bind('bom-cancel','click',()=>modal.close());bind('bom-add','click',()=>{const selected=selectedRows();validateMaterialQuantities(selected);const keep=selected.filter(x=>x.bomId);state.record.materials=mergeMaterials(keep,[...b.pending.values()].map(x=>({...x,quantity:Number(x.quantity)})));state.dirty=true;modal.close(true);renderEditor();});await load();if($('bom-dialog')===modal.d&&modal.d.open)$('bom-search').focus();
}
function renderHistory(){shell(`<div class="heading"><h1>${e(t('SN History'))}</h1></div><p class="muted">${e(t('Previous visits for the exact SN are available read only.'))}</p><form id="history-form" class="search-row">${input('history-sn','Exact full serial number',state.historyQuery||'','required autocomplete="off"')}<button class="primary">${e(t('Search'))}</button></form><div id="history-results" aria-live="polite"></div>`);bind('history-sn','input',ev=>{state.historyQuery=ev.target.value;clearHistorySearch();renderHistoryItems();});bind('history-form','submit',ev=>{ev.preventDefault();return loadHistory($('history-sn').value);});renderHistoryItems();}
function clearHistorySearch(){
 state.historySearch?.controller.abort();
 state.historySearch=null;
}
async function loadHistory(sn){
 clearHistorySearch();
 const query=sn.trim();
 if(!query){renderHistoryItems();return;}
 const search={sn:query,controller:new AbortController(),loading:true,items:[]};
 state.historySearch=search;
 renderHistoryItems();
 try{
  const response=await api('/api/sn-history?sn='+encodeURIComponent(query),{signal:search.controller.signal});
  search.items=response.items;
 }catch(err){
  if(search.controller.signal.aborted)return;
  search.error=err;
 }
 if(state.historySearch!==search||state.view!=='history')return;
 search.loading=false;
 renderHistoryItems();
}
function renderHistoryItems(){
 const root=$('history-results'),search=state.historySearch;
 if(!root)return;
 if(!search){root.replaceChildren();return;}
 if(search.error){root.innerHTML=`<p class="error-box" role="alert">${e(t('History lookup failed'))} · ${e(search.sn)} · ${e(errorMessage(search.error))}</p>`;return;}
 const title=t(search.loading?'Searching history':'History for SN');
 const summary=`<div class="banner history-summary"><strong>${e(title)} · ${e(search.sn)}</strong>${search.loading?'':`<span>${e(t('History record count'))} · ${search.items.length}</span>`}</div>`;
 if(search.loading){root.innerHTML=summary;return;}
 root.innerHTML=summary+`<table><thead><tr>${['Work Order','Serial Number',...(!isCustomer()?['Owner']:[]),'Model','Status','Work Time','Outcome'].map(x=>`<th>${e(t(x))}</th>`).join('')}</tr></thead><tbody>${search.items.map(r=>`<tr><td><button class="record-link" data-history-record="${e(r.id)}">${e(r.workOrder)}</button></td><td>${e(r.sn)}</td>${!isCustomer()?`<td>${e(r.ownerName)}</td>`:''}<td>${e(modelLabel(r.modelSnapshot))}</td><td>${e(isCustomer()?recordStatusLabel(r.status):t(r.status==='completed'?'Completed':'In Progress'))} · ${e(t('View-only'))}</td><td>${e(displayWorkTime(r))}</td><td>${e(outcomeLabel(r.outcome))}</td></tr>`).join('')||`<tr><td colspan="${isCustomer()?6:7}" class="empty">${e(t('No records found'))}</td></tr>`}</tbody></table>`;document.querySelectorAll('[data-history-record]').forEach(b=>b.addEventListener('click',()=>openRecord(b.dataset.historyRecord,search.sn).catch(showError)));}
const auditActions={correction:'Administrator correction',create:'Record created',complete:'Record completed',save:'Progress saved',photo_add:'Photo added',photo_remove:'Photo removed'};
function auditEntry(event,expanded){
 const {before,after}=event;
 const rows=auditChanges(before,after,{t,modelLabel,lang:state.lang});
 const title=t(auditActions[event.action]||event.action);
 const reason=event.reason?`<p><strong>${e(t('Reason'))}</strong>　${e(event.reason)}</p>`:'';
 const comparison=rows.length?`<div class="table-wrap"><table><thead><tr>${['Changed field','Before','After'].map(h=>'<th>'+e(t(h))+'</th>').join('')}</tr></thead><tbody>${rows.map(row=>'<tr>'+row.map(cell=>'<td>'+e(cell)+'</td>').join('')+'</tr>').join('')}</tbody></table></div>`:
  `<p class="muted">${e(t(before&&after?'No business field changes':'Not recorded'))}</p>`;
 const raw=record=>e(record==null?t('Not recorded'):JSON.stringify(record,null,2));
 return `<details class="audit-entry" ${expanded?'open':''}><summary><strong>${e(title)}</strong> · ${e(event.actorName)} · ${e(date(event.createdAt))}${rows.length?' · '+e(t('Changed fields'))+' '+rows.length:''}</summary>${reason}${comparison}<details class="audit-original"><summary>${e(t('Full original record'))}</summary><div class="audit-pair"><div><strong>${e(t('Before'))}</strong><pre>${raw(before)}</pre></div><div><strong>${e(t('After'))}</strong><pre>${raw(after)}</pre></div></div></details></details>`;
}
async function auditDialog(){
 const record=state.record;
 const data=await api('/api/records/'+record.id+'/audit'+(state.history?'?historySn='+encodeURIComponent(state.historySn):''));
 if(state.view!=='editor'||state.record!==record||!isAdmin())return;
 const latest=data.items.find(a=>a.action==='correction'||a.reason)||data.items[0];
 const body=data.items.map(a=>auditEntry(a,a===latest)).join('')||`<p>${e(t('No audit entries'))}</p>`;
 const modal=dialog('audit-dialog',t('Audit Trail'),body,`<button id="audit-close">${e(t('Close'))}</button>`);
 bind('audit-close','click',modal.close);
}
function passwordDialog(){if(state.dirty||state.photoDraft){notice(t('Save or discard unsaved changes before changing password.'));return;}const modal=dialog('password-dialog',t('Change Password'),`<form id="password-form" class="stack">${input('currentPassword','Current Password','','type="password" autocomplete="current-password" required')}${input('newPassword','New Password','','type="password" autocomplete="new-password" minlength="10" required')}<div id="password-error" role="alert"></div><button class="primary">${e(t('Save'))}</button></form>`);bind('password-form','submit',async ev=>{ev.preventDefault();try{await api('/api/account/password',{method:'POST',body:{currentPassword:$('currentPassword').value,newPassword:$('newPassword').value}});modal.close();clearSessionState();renderLogin();notice(t('Password updated. Sign in with your new password.'));}catch(err){$('password-error').textContent=errorMessage(err);}});}

async function loadAdmin(){state.view='admin';state.adminEdit=null;if(state.adminSection==='users')state.adminItems=(await api('/api/admin/users')).items;else if(state.adminSection==='models')state.adminItems=state.catalog.models;else if(state.adminSection==='appearance')state.adminItems=state.catalog.appearanceOptions;else{state.adminModel=state.adminModel||state.catalog.models[0]?.id||'';state.adminBomPage=state.adminBomPage||1;const data=state.adminModel?await api('/api/models/'+state.adminModel+'/bom?includeInactive=1&pageSize=50&page='+state.adminBomPage+'&q='+encodeURIComponent(state.adminBomQuery||'')):{items:[],total:0};state.adminItems=data.items;state.adminBomTotal=data.total;}renderAdmin();}
function renderAdmin(){const section=state.adminSection;const title=({users:'Users',models:'Models & Checklists',appearance:'Appearance Options',bom:'BOM'})[section];shell(`<div class="heading"><h1>${e(t('Administration'))}</h1><div><label>${e(t('Administration'))}<select id="admin-section">${Object.entries({users:'Users',models:'Models & Checklists',appearance:'Appearance Options',bom:'BOM'}).map(([k,v])=>option(k,t(v),section)).join('')}</select></label><button id="admin-new" class="primary">+ ${e(t('New Entry'))}</button></div></div><h2>${e(t(title))}</h2>${section==='bom'?`<div class="search-row"><label>${e(t('Model'))}<select id="admin-model-filter">${state.catalog.models.map(m=>option(m.id,modelLabel(m),state.adminModel)).join('')}</select></label><form id="admin-bom-search-form" class="search-row">${input('admin-bom-search','Search part SKU or description',state.adminBomQuery||'')}<button>${e(t('Search'))}</button></form></div>`:''}<div class="admin-layout"><section><div class="admin-table"><table><thead><tr><th>${e(t('Code'))}</th><th>${e(t(title))}</th><th>${e(t('Active'))}</th><th>${e(t('Action'))}</th></tr></thead><tbody>${state.adminItems.map((x,i)=>`<tr><td>${e(x.username||x.sku||x.code||x.id)}</td><td>${section==='bom'?partDescription(x):e(x.displayName||modelLabel(x)||label(x))}</td><td>${x.active?'✓':'—'}</td><td><button data-admin-edit="${i}">${e(t('Edit'))}</button></td></tr>`).join('')||`<tr><td colspan="4">${e(t('No records found'))}</td></tr>`}</tbody></table></div>${section==='bom'?`<div class="pagination"><small>${state.adminBomTotal} ${e(t('items'))} · ${e(t('Page'))} ${state.adminBomPage||1}</small><div class="row"><button id="admin-bom-prev" ${(state.adminBomPage||1)<=1?'disabled':''}>${e(t('Previous'))}</button><button id="admin-bom-next" ${(state.adminBomPage||1)*50>=state.adminBomTotal?'disabled':''}>${e(t('Next'))}</button></div></div>`:''}</section><section id="admin-editor"></section></div>${section==='bom'?`<section class="panel outcomes"><div class="panel-head"><h2>${e(t('Import BOM CSV'))}</h2><a class="button" href="/api/admin/bom/template" download>${e(t('CSV Template'))}</a></div><p class="muted">${e(t('Atomic import: all rows must be valid; existing or duplicate SKUs are rejected.'))}</p><form id="csv-form" class="stack"><label>${e(t('Choose CSV file'))}<input id="csv-file" type="file" accept=".csv,text/csv"></label>${textarea('csv-content','CSV content',state.adminCsvDraft||'','required')}<div><button id="csv-import" class="primary">${e(t('Import BOM CSV'))}</button></div><p id="csv-result" role="status"></p></form></section>`:''}`);
 bind('admin-section','change',ev=>safeGo(()=>{state.adminSection=ev.target.value;state.adminBomPage=1;loadAdmin().catch(showError);}));bind('admin-new','click',()=>safeGo(()=>{state.adminEdit={};renderAdminForm();}));document.querySelectorAll('[data-admin-edit]').forEach(b=>b.addEventListener('click',()=>safeGo(()=>{state.adminEdit=structuredClone(state.adminItems[Number(b.dataset.adminEdit)]);renderAdminForm();})));bind('admin-model-filter','change',ev=>safeGo(()=>{state.adminModel=ev.target.value;state.adminBomPage=1;loadAdmin().catch(showError);}));bind('admin-bom-search-form','submit',ev=>{ev.preventDefault();safeGo(()=>{state.adminBomQuery=$('admin-bom-search').value;state.adminBomPage=1;loadAdmin().catch(showError);});});bind('admin-bom-prev','click',()=>safeGo(()=>{state.adminBomPage--;loadAdmin().catch(showError);}));bind('admin-bom-next','click',()=>safeGo(()=>{state.adminBomPage++;loadAdmin().catch(showError);}));bind('csv-file','change',async()=>{if($('csv-file').files[0]){$('csv-content').value=await $('csv-file').files[0].text();state.dirty=true;}});bind('csv-content','input',()=>{state.adminCsvDraft=$('csv-content').value;state.dirty=true;});bind('csv-form','submit',async ev=>{ev.preventDefault();try{const data=await api('/api/admin/bom/import',{method:'POST',body:{modelId:Number(state.adminModel),csv:$('csv-content').value}});state.dirty=false;state.adminCsvDraft='';await loadAdmin();$('csv-result').textContent=t('Imported')+': '+data.created;notice(t('Imported')+': '+data.created);}catch(err){$('csv-result').textContent=errorMessage(err);$('csv-result').className='error-box';}});if(state.adminEdit)renderAdminForm();
}
function captureAdminDraft(){if(state.view!=='admin')return;if($('csv-content'))state.adminCsvDraft=$('csv-content').value;if(!state.adminEdit||!$('admin-form'))return;const x=state.adminEdit;for(const k of ['username','displayName','role','nameEn','nameZh','productSku','code','labelEn','labelZh','modelId','sku','descriptionEn','descriptionZh','unit','standardQty'])if($('admin-'+k))x[k]=$('admin-'+k).value;if($('admin-active'))x.active=$('admin-active').checked;if($('admin-checkItems'))x.checkItems=parseChecklist($('admin-checkItems').value,x.checkItems);if($('admin-password'))x.password=$('admin-password').value;state.adminCsvDraft=$('csv-content')?.value??state.adminCsvDraft;}
function renderAdminForm(){const x=state.adminEdit,section=state.adminSection,editing=Boolean(x.id||(section==='appearance'&&state.adminItems.some(v=>v.code===x.code)));const active=`<label class="radio-option"><input id="admin-active" type="checkbox" ${x.active!==false?'checked':''}>${e(t('Active'))}</label>`;let fields='';
 if(section==='users')fields=`${input('admin-username','Username',x.username||'',`${editing?'disabled':'required'} autocomplete="off"`)}${input('admin-displayName','Display Name',x.displayName||'','required')}<label>${e(t('Role'))}<select id="admin-role">${option('operator',t('Operator'),x.role)}${option('customer',t('Customer'),x.role)}${option('admin',t('Admin'),x.role)}</select></label>${editing?active:input('admin-password','Password',x.password||'','type="password" minlength="10" required autocomplete="new-password"')}`;
 if(section==='models')fields=`${input('admin-nameEn','Name (English)',x.nameEn||'','required')}${input('admin-nameZh','Name (Chinese)',x.nameZh||'')}${input('admin-productSku','Product SKU',x.productSku||'')}${textarea('admin-checkItems','Check items: code|English label|Chinese label, one per line',formatChecklist(x.checkItems),'required rows="7"')}<small>${e(t('English is required except for source-backed originals. Historical snapshots are preserved.'))}</small>${active}`;
 if(section==='appearance')fields=`${input('admin-code','Code',x.code||'',editing?'disabled':'required')}${input('admin-labelEn','Label (English)',x.labelEn||'','required')}${input('admin-labelZh','Label (Chinese)',x.labelZh||'')}${active}`;
 if(section==='bom')fields=`<label>${e(t('Model'))}<select id="admin-modelId">${state.catalog.models.map(m=>option(m.id,modelLabel(m),x.modelId||state.adminModel)).join('')}</select></label>${input('admin-sku','Part SKU',x.sku||'','required')}${input('admin-descriptionEn','Description (English)',x.descriptionEn||'',x.source?'':'required')}${input('admin-descriptionZh','Description (Chinese)',x.descriptionZh||'')}${input('admin-unit','Unit',x.unit||'pcs','required')}${input('admin-standardQty','Standard usage / maximum',x.standardQty??'','type="number" min="0.001" step="0.001"')}${active}`;
 $('admin-editor').innerHTML=`<form id="admin-form" class="panel stack"><h3>${e(t(editing?'Edit':'New Entry'))}</h3>${fields}<div id="admin-error" role="alert" class="error-box" hidden></div><button id="admin-save" class="primary">${e(t('Save'))}</button></form>${section==='users'&&editing?`<form id="admin-reset-form" class="panel stack outcomes">${input('admin-reset-password','New password','','type="password" autocomplete="new-password" minlength="10" required')}<button>${e(t('Reset Password'))}</button><p id="admin-reset-result" role="status"></p></form>`:''}`;
 $('admin-form').addEventListener('input',()=>state.dirty=true);bind('admin-form','submit',async ev=>{ev.preventDefault();const v=k=>$('admin-'+k)?.value??'';let body;if(section==='users')body={displayName:v('displayName'),role:v('role'),...(editing?{active:$('admin-active').checked}:{username:v('username'),password:v('password')})};if(section==='models')body={nameEn:v('nameEn'),nameZh:v('nameZh'),productSku:v('productSku'),active:$('admin-active').checked,checkItems:parseChecklist(v('checkItems'),x.checkItems)};if(section==='appearance')body={code:v('code'),labelEn:v('labelEn'),labelZh:v('labelZh'),active:$('admin-active').checked};if(section==='bom')body={modelId:Number(v('modelId')),sku:v('sku'),descriptionEn:v('descriptionEn'),descriptionZh:v('descriptionZh'),unit:v('unit'),active:$('admin-active').checked,...(v('standardQty')?{standardQty:Number(v('standardQty'))}:x.quantityControl?{standardQty:null}:{})};try{await api('/api/admin/'+section+(editing?'/'+encodeURIComponent(x.id||x.code):''),{method:editing?'PUT':'POST',body});state.dirty=false;await loadCatalog();await loadAdmin();notice(t('Saved successfully'));}catch(err){$('admin-error').hidden=false;$('admin-error').textContent=errorMessage(err);}});bind('admin-reset-form','submit',async ev=>{ev.preventDefault();try{await api('/api/admin/users/'+x.id+'/password',{method:'POST',body:{password:$('admin-reset-password').value}});$('admin-reset-password').value='';$('admin-reset-result').textContent=t('Password updated');}catch(err){$('admin-reset-result').textContent=errorMessage(err);}});
}
window.addEventListener('beforeunload',ev=>{if(state.dirty||state.photoDraft||photoBusy()){ev.preventDefault();ev.returnValue='';}});
try{state.session=await api('/api/session');if(state.session.user){state.lang=state.session.user.language==='zh'?'zh':'en';await loadCatalog();await loadRecords();}else renderLogin();}catch(err){$('app').textContent=err.message;}
