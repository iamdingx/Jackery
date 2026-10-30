import {readFile} from 'node:fs/promises';
import {textValue} from './domain.js';

// Authored, local translations are keyed by the exact original description.
// The original catalog digest, activation flags and historical records are immutable here.
export async function loadBomTranslations(file){
 if(!file)return {};
 const source=JSON.parse(await readFile(file,'utf8'));
 if(source.schemaVersion!==1||!Array.isArray(source.entries))throw new Error('Invalid BOM translation catalog');
 const entries=new Map();
 for(const item of source.entries){
  const zh=textValue(item.descriptionZh,'Original BOM description',4000,true),en=textValue(item.descriptionEn,'Translated BOM description',8000,true);
  if(entries.has(zh))throw new Error('Duplicate or conflicting BOM translation');
  entries.set(zh,en);
 }
 return Object.fromEntries(entries);
}
export function translateBom(part,translations){
 const en=part.descriptionEn?.trim()?part.descriptionEn:(Object.hasOwn(translations??{},part.descriptionZh)?translations[part.descriptionZh]:undefined);
 return en?{...part,descriptionEn:en}:part;
}
