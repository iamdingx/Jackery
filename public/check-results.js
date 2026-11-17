function normalizedLabel(label){
  return (label??'').normalize('NFKC').toLowerCase().split(/\r?\n/)
    .map(line=>line.trim().replace(/^\d+[.)、]\s*(?=\D)/u,'').replace(/\s+/g,' '))
    .filter(Boolean).join('\n');
}

function uniqueLabels(items){
  const names=new Map();
  for(const item of items??[]){
    const labels=[normalizedLabel(item.labelEn),normalizedLabel(item.labelZh)];
    if(!labels.some(Boolean))continue;
    const key=JSON.stringify(labels);
    names.set(key,names.has(key)?null:item);
  }
  return names;
}

export function carryCheckResults(fromModel,toModel,results){
  const prior=uniqueLabels(fromModel?.checkItems);
  const retained=[];
  for(const [key,target] of uniqueLabels(toModel?.checkItems)){
    const source=prior.get(key);
    if(!source||!target)continue;
    const status=results?.[source.code];
    if(status==='pass'||status==='fail')retained.push([target.code,status]);
  }
  return Object.fromEntries(retained);
}
