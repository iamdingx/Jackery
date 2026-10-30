import {readFile} from 'node:fs/promises';
import {textValue} from './domain.js';

export async function loadSourceTranslations(file){
 if(!file)return {};
 const source=JSON.parse(await readFile(file,'utf8'));
 if(source.schemaVersion!==1||!Array.isArray(source.entries))throw new Error('Invalid source translation catalog');
 const entries=new Map();
 for(const item of source.entries){
  const zh=textValue(item.textZh,'Original guidance',20000,true),en=textValue(item.textEn,'Translated guidance',40000,true);
  if(entries.has(zh))throw new Error('Duplicate source translation');entries.set(zh,en);
 }
 return Object.fromEntries(entries);
}
export function translateSourceFields(item,translations){
 if(!item||typeof item!=='object'||Array.isArray(item))return item;
 const result={...item};
 for(const [key,zh] of Object.entries(item)){
  if(!key.endsWith('Zh')||typeof zh!=='string'||!zh.trim())continue;
  const englishKey=key.slice(0,-2)+'En',en=item[englishKey];
  if((typeof en==='string'&&en.trim())||(Array.isArray(en)&&en.join('\n').trim()))continue;
  if(Object.hasOwn(translations??{},zh))result[englishKey]=translations[zh];
 }
 return result;
}
export function translateModel(model,translations){
 if(!model)return model;
 return {...translateSourceFields(model,translations),checkItems:(model.checkItems??[]).map(x=>translateSourceFields(x,translations))};
}
export function translateKnowledge(knowledge,translations){
 if(!knowledge)return {faultCodes:[],repairGuides:[],notices:[]};
 const result={...knowledge};for(const key of ['faultCodes','repairGuides','notices'])result[key]=(knowledge[key]??[]).map(x=>translateSourceFields(x,translations));return result;
}
