const bluetooth={code:'bluetooth',labelEn:'Bluetooth',labelZh:'蓝牙'};

export function currentModelChecklist(model){
 if(!model?.catalogKey||model.checkItems?.some(x=>x.code==='bluetooth'||/^bluetooth$/i.test(x.labelEn?.trim()??'')||x.labelZh?.trim()==='蓝牙'))return model;
 return {...model,checkItems:[...(model.checkItems??[]),{...bluetooth}]};
}

export function currentRecordChecklist(record){
 if(!record?.modelSnapshot||record.status==='completed')return record;
 const model=currentModelChecklist(record.modelSnapshot);
 if(model===record.modelSnapshot)return record;
 return {...record,modelSnapshot:model,checks:{...record.checks,initial:{bluetooth:'not_tested',...record.checks?.initial}}};
}
