import test from 'node:test';
import assert from 'node:assert/strict';
import {inflateRawSync} from 'node:zlib';
import {exportRecords} from '../src/export.js';
function sheets(bytes){const out=new Map();for(let o=0;bytes.readUInt32LE(o)===0x04034b50;){const size=bytes.readUInt32LE(o+18),len=bytes.readUInt16LE(o+26),start=o+30+len+bytes.readUInt16LE(o+28);out.set(bytes.toString('utf8',o+30,o+30+len),inflateRawSync(bytes.subarray(start,start+size)).toString());o=start+size;}return out;}
const check={code:'dc',labelEn:'',labelZh:'DC输入'},record={id:1,workOrder:'SOURCE-EXPORT',sn:'EXPORT-001',modelId:1,modelSnapshot:{id:1,nameEn:'Model',nameZh:'型号',checkItems:[check]},appearanceCodes:[],appearanceSnapshot:[],faultCodes:['F0'],faultSnapshot:[{code:'F0',titleEn:'',titleZh:'BMS通讯故障'}],checks:{initial:{dc:'fail'}},materials:[{bomId:1,sku:'PART',descriptionEn:'',descriptionZh:'原中文物料',unit:'pcs',quantity:1,standardQty:1}],photos:[],status:'wfr',outcome:'awp',issueNotes:'用户原始中文',translatedIssueNotes:''};
test('Human export English uses exact-source translations while archival snapshot JSON and free text remain original',()=>{
 const before=structuredClone(record),zip=sheets(exportRecords([record],'','en',{sourceTranslations:{'DC输入':'DC Input'},bomTranslations:{'原中文物料':'Original Part'}}));assert.match(zip.get('xl/worksheets/sheet2.xml'),/>DC Input</);assert.match(zip.get('xl/worksheets/sheet2.xml'),/>DC输入</);assert.match(zip.get('xl/worksheets/sheet3.xml'),/>Original Part</);assert.match(zip.get('xl/worksheets/sheet3.xml'),/>原中文物料</);assert.ok(zip.get('xl/worksheets/sheet1.xml').includes('用户原始中文'));assert.ok(!zip.get('xl/worksheets/sheet1.xml').includes('DC Input'));assert.deepEqual(record,before);
});
test('Existing reviewed English always wins over authored display translation in either export locale',()=>{
 const r=structuredClone(record);r.modelSnapshot.checkItems[0].labelEn='Reviewed check';r.materials[0].descriptionEn='Reviewed part';for(const lang of ['en','zh']){const zip=sheets(exportRecords([r],'',lang,{sourceTranslations:{'DC输入':'Other check'},bomTranslations:{'原中文物料':'Other part'}}));assert.match(zip.get('xl/worksheets/sheet2.xml'),/>Reviewed check</);assert.match(zip.get('xl/worksheets/sheet3.xml'),/>Reviewed part</);assert.ok(!zip.get('xl/worksheets/sheet2.xml').includes('Other check'));}
});
