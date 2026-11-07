import test from 'node:test';
import assert from 'node:assert/strict';
import {enrichSheetValues,numericFieldsWithDerived,validateModifierRules,modifierReferenceId} from '../src/SheetDerived.js';

const template={modifierRules:{base:10,step:2},tabs:[{id:'main',fields:[
 {id:'dex_score',label:'Dexterity',type:'number',modifierEnabled:true,modifierCode:'dexterity'}
]}]};
test('DM modifier rule maps odd and negative D&D scores without visible fields',()=>{
 for(const [score,mod] of [[8,-1],[9,-1],[10,0],[11,0],[12,1],[13,1],[19,4],[20,5]]){
  assert.equal(enrichSheetValues(template,{dex_score:score}).dexterity_mod,mod);
 }
 assert.ok(numericFieldsWithDerived(template).some(f=>f.id==='dexterity_mod'));
 assert.equal(template.tabs[0].fields.length,1);
});
test('DM can change modifier base and step',()=>{
 const custom={...template,modifierRules:{base:12,step:3}};
 assert.equal(enrichSheetValues(custom,{dex_score:14}).dexterity_mod,0);
 assert.equal(enrichSheetValues(custom,{dex_score:15}).dexterity_mod,1);
});
test('duplicate modifier aliases cannot be saved',()=>{
 const other={...template,tabs:[{id:'main',fields:[
  ...template.tabs[0].fields,{id:'strength',label:'Strength',type:'number',modifierEnabled:true,modifierCode:'dexterity'}
 ]}]};
 assert.throws(()=>validateModifierRules(other),/unique/);
 assert.equal(modifierReferenceId({label:'Dexterity'}),'dexterity');
});
