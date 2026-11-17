import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {validateSubstitutionUsage} from '../src/bom-substitutions.js';

const group={id:'top',cap:4,originals:['ORIG'],options:[
  {sku:'LEVEL-1',level:1,originalSku:'ORIG'},
  {sku:'LEVEL-2',level:2,originalSku:'ORIG',gateSku:'LEVEL-1'},
]};
const bom=[{id:1,sku:'ORIG'},{id:2,sku:'LEVEL-1'},{id:3,sku:'LEVEL-2',substituteOnly:true}];
const items=(...pairs)=>pairs.map(([i,quantity])=>({...bom[i],bomId:bom[i].id,quantity}));
function validate(materials,previous=[],stock=0,groups=[group]){
  return validateSubstitutionUsage(materials,previous,{groups,stock:new Map([['LEVEL-1',stock]])});
}

test('replacement tiers enforce the shared limit and current stock on new use',()=>{
  assert.throws(()=>validate(items([0,3],[1,2])),{code:'BOM_GROUP_LIMIT'});
  assert.throws(()=>validate(items([2,2]),[],1),{code:'BOM_SUBSTITUTE_STOCK'});
  assert.equal(validate(items([2,2]),[],-1)[0].substitution.level,2);
  const saved=validate(items([0,2],[2,2]));
  assert.equal(saved[1].substitution.originalSku,'ORIG');
  assert.equal(validate(items([0,2],[2,2]),saved,20)[1].substitution.level,2);
  assert.throws(()=>validate(items([2,3]),saved,20),{code:'BOM_SUBSTITUTE_STOCK'});
});

test('unknown substitute-only rows cannot be selected',()=>{
  assert.throws(()=>validate(items([2,1]),[],0,[]),{code:'BOM_SUBSTITUTE_INVALID'});
});

test('substitute materials are a whole kit and cannot be mixed',()=>{
  const kits=[{id:'kit-1',skus:['ONE','COMMON']},{id:'kit-2',skus:['TWO','COMMON']}];
  const set={id:'box',cap:null,originals:['ORIG'],options:[],kits};
  const kit=(kitId,...skus)=>skus.map(sku=>({sku,quantity:1,substitution:{groupId:'box',kitId}}));
  assert.equal(validate(kit('kit-1','ONE','COMMON'),[],0,[set]).length,2);
  assert.throws(()=>validate(kit('kit-1','ONE'),[],0,[set]),{code:'BOM_SUBSTITUTE_KIT'});
  assert.throws(()=>validate([...kit('kit-1','ONE'),...kit('kit-2','COMMON')],[],0,[set]),{code:'BOM_SUBSTITUTE_KIT'});
});

test('approved workbook data preserves distinct model versions and source rows',()=>{
  const data=JSON.parse(readFileSync(new URL('../catalogs/jackery-bom-substitutions.json',import.meta.url)));
  assert.equal(data.models.length,11);
  assert.equal(data.models.flatMap(m=>m.relationships).filter(r=>r.level===1).length,65);
  assert.equal(data.models.flatMap(m=>m.relationships).filter(r=>r.level===2).length,2);
  assert.equal(data.createMaterials.length,5);
  assert.equal(data.renameMaterials.length,3);
});
