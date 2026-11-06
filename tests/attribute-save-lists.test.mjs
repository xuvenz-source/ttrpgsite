import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {enrichSheetValues,makeProgressionField,numericFieldsWithDerived,
 attributeSaveProficiency} from '../src/SheetDerived.js';
import {numberFields} from '../src/SheetMath.js';
import {parseSheetTemplateFile,serializeSheetTemplate} from '../src/TemplateFiles.js';

function setup(){
 const progression=makeProgressionField();
 progression.id='level_progression';
 const attribute={id:'constitution',label:'Constitution',type:'attribute'};
 const template={modifierRules:{base:10,step:2},tabs:[{
  id:'main',name:'Main',fields:[attribute,progression,
   {id:'equipment',label:'Equipment',type:'equipment',weaponModifierListId:'stats',categories:[]}]
 }],optionLists:[{id:'stats',name:'Weapon stats',items:[
  {id:'strength',label:'Strength',statField:'strength',statMode:'score'},
  {id:'dexterity',label:'Dexterity',statField:'dexterity',statMode:'score'}
 ]}]};
 const levelValues={[progression.classes[0].id]:5};
 return {attribute,template,progression,values:{
  constitution:15,level_progression:{levels:levelValues},constitution__save_prof:true
 }};
}

test('Constitution saving throws add the score modifier and configured proficiency',()=>{
 const {template,values}=setup();
 const saved=enrichSheetValues(template,values);
 assert.equal(saved.constitution_mod,2);
 assert.equal(saved.proficiency_bonus,3);
 assert.equal(saved.constitution_save_bonus,5);
 const untrained=enrichSheetValues(template,{...values,constitution__save_prof:false});
 assert.equal(untrained.constitution_save_bonus,2);
 assert.equal(untrained.constitution_mod,2);
 assert.equal(saved.constitution,15);
 assert.equal(saved.constitution__save_prof,true);
});
test('odd scores, negative modifiers and alternate proficiency fields work',()=>{
 const {template,values}=setup();
 assert.equal(enrichSheetValues(template,{...values,constitution:9}).constitution_save_bonus,2);
 assert.equal(enrichSheetValues(template,{...values,constitution:8}).constitution_save_bonus,2);
 const custom=structuredClone(template);
 custom.tabs[0].fields[0].proficiencyField='manual_proficiency';
 assert.equal(attributeSaveProficiency(custom.tabs[0].fields[0],{manual_proficiency:4},custom),4);
 assert.equal(enrichSheetValues(custom,{...values,manual_proficiency:4}).constitution_save_bonus,6);
});
test('Attribute remains a Number-like field and provides derived roll references',()=>{
 const {template}=setup();
 assert.ok(numberFields(template).some(f=>f.id==='constitution'));
 const derived=numericFieldsWithDerived(template).map(f=>f.id);
 assert.ok(derived.includes('constitution_mod'));
 assert.ok(derived.includes('constitution_save_bonus'));
});
test('reusable lists and new fields survive template export / import unchanged',()=>{
 const {template}=setup();
 template.tabs[0].fields.push({id:'fav',type:'list',label:'Favourites',listId:'stats'});
 assert.deepEqual(parseSheetTemplateFile(serializeSheetTemplate(template)),template);
 const duplicate=structuredClone(template);
 duplicate.optionLists[0].items.push({...duplicate.optionLists[0].items[0]});
 assert.throws(()=>serializeSheetTemplate(duplicate),/duplicated/);
});
test('weapon and spell UI retains server roll fields and compact styling',()=>{
 const equipment=readFileSync(new URL('../src/SheetEquipment.jsx',import.meta.url),'utf8');
 const spell=readFileSync(new URL('../src/SpellChatCard.jsx',import.meta.url),'utf8');
 const css=readFileSync(new URL('../src/style.css',import.meta.url),'utf8');
 for(const key of ['magic','attackBonus','damageBonus','statField','statMode','critDice','critOn','useStatForDamage'])
  assert.ok(equipment.includes(key),key+' must remain editable for server rolls');
 assert.ok(spell.includes('MacroChatCard'));
 assert.ok(spell.includes("kind:'roll'"));
 assert.ok(css.includes('.equipment-settings-backdrop'));
 assert.ok(css.includes('.app .floating-window.floating-quick .quick-status-editor'));
 assert.ok(css.includes('.app .floating-window.floating-quick .quick-token-fields'));
});
