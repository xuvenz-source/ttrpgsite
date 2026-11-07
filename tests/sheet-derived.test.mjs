import test from 'node:test';
import assert from 'node:assert/strict';
import {
 makeProgressionField,makeProficienciesField,derivedProgression,
 derivedProficiencies,enrichSheetValues,proficiencyForLevel,numericFieldsWithDerived,
 abilityModifier,PERSONAL_RESOURCE_KEY
} from '../src/SheetDerived.js';
import {calculateFormula} from '../src/SheetMath.js';

function example(){
 const progression=makeProgressionField();
 progression.id='progression_1';
 progression.classes=[
  {id:'scholar',label:'Scholar',castingField:'intelligence',castingMode:'score'},
  {id:'warden',label:'Warden',castingField:'wisdom',castingMode:'score'}
 ];
 const skills=makeProficienciesField();
 skills.id='skillset_1';skills.progressionField=progression.id;
 skills.entries=[
  {id:'lore',label:'Arcane lore',group:'Knowledge',abilityField:'intelligence',abilityMode:'score'},
  {id:'insight',label:'Insight',group:'Skills',abilityField:'wisdom',abilityMode:'score'}
 ];
 const template={tabs:[{id:'main',fields:[
  {id:'intelligence',label:'Intelligence',type:'number'},
  {id:'wisdom',label:'Wisdom',type:'number'},progression,skills
 ]}]};
 const values={
  intelligence:18,wisdom:14,
  [progression.id]:{levels:{scholar:6,warden:2},castingSource:'scholar'},
  [skills.id]:{ranks:{lore:2,insight:1}},
  [PERSONAL_RESOURCE_KEY]:[{id:'charges',name:'Tremorsense',current:3,max:4,recharge:'long'}]
 };
 return {progression,skills,template,values};
}
test('level thresholds obey total class levels and ignore future milestones',()=>{
 assert.equal(proficiencyForLevel([{level:5,bonus:4}],2),0);
 assert.equal(proficiencyForLevel([{level:1,bonus:2},{level:5,bonus:3}],4),2);
 assert.equal(proficiencyForLevel([{level:1,bonus:2},{level:5,bonus:3}],6),3);
 assert.equal(proficiencyForLevel([{level:1,bonus:2}],0),0);
});
test('classless multiclass levels calculate proficiency and per-path spell DC',()=>{
 const {progression,template,values}=example();
 const result=derivedProgression(progression,values[progression.id],values);
 assert.equal(result.total,8);
 assert.equal(result.proficiency,3);
 assert.equal(result.outputs.level,8);
 assert.equal(result.outputs.proficiency_bonus,3);
 assert.equal(result.outputs.spell_save_dc,15);
 assert.equal(result.outputs.spell_attack_bonus,7);
 const derived=enrichSheetValues(template,values);
 assert.equal(derived.intelligence_mod,4);
 assert.equal(derived.wisdom_mod,2);
 assert.equal(result.perClass.warden.saveDC,13);
 assert.equal(result.outputs.progression_1__warden_save_dc,13);
});
test('changing selected casting source switches active spell save DC',()=>{
 const {template,progression,values}=example();
 values[progression.id].castingSource='warden';
 const result=enrichSheetValues(template,values);
 assert.equal(result.spell_save_dc,13);
 assert.equal(result.spell_attack_bonus,5);
});
test('proficiencies calculate proficient, expert, half and untrained bonuses',()=>{
 const {template,skills,values}=example();
 const derived=enrichSheetValues(template,values);
 assert.equal(derived.skillset_1__lore_bonus,10);
 assert.equal(derived.skillset_1__insight_bonus,5);
 values[skills.id].ranks.lore=.5;
 assert.equal(enrichSheetValues(template,values).skillset_1__lore_bonus,5);
 values[skills.id].ranks.insight=0;
 assert.equal(enrichSheetValues(template,values).skillset_1__insight_bonus,2);
});
test('DM-defined class paths can grant proficiencies without player toggles',()=>{
 const {template,progression,skills,values}=example();
 const skill=skills.entries.find(entry=>entry.id==='insight');
 skill.autoPaths=['warden'];
 values[skills.id].ranks.insight=0;
 const granted=enrichSheetValues(template,values);
 assert.equal(granted.skillset_1__insight_bonus,5);
 values[progression.id].levels.warden=0;
 const notGranted=enrichSheetValues(template,values);
 assert.equal(notGranted.skillset_1__insight_bonus,2);
});
test('leveling updates all derived values without changing saved personal resources',()=>{
 const {template,progression,skills,values}=example();
 const before=JSON.stringify(values[PERSONAL_RESOURCE_KEY]);
 const upgraded={...values,[progression.id]:{
  ...values[progression.id],levels:{scholar:7,warden:2}
 }};
 const result=enrichSheetValues(template,upgraded);
 assert.equal(result.level,9);
 assert.equal(result.proficiency_bonus,4);
 assert.equal(result.spell_save_dc,16);
 assert.equal(result.skillset_1__lore_bonus,12);
 assert.equal(JSON.stringify(result[PERSONAL_RESOURCE_KEY]),before);
});
test('numeric derived outputs can be referenced by arithmetic formulas and macros',()=>{
 const {template,values}=example();
 const derived=enrichSheetValues(template,values);
 assert.equal(calculateFormula('8+@{proficiency_bonus}+4',derived),15);
 assert.equal(calculateFormula('floor(@{level}/2)',derived),4);
 const fields=numericFieldsWithDerived(template);
 for(const id of ['level','proficiency_bonus','spell_save_dc',
  'spell_attack_bonus','skillset_1__lore_bonus']){
  assert.ok(fields.some(f=>f.id===id),id+' should be a selectable field');
 }
});
test('score mode and direct modifier mode behave separately',()=>{
 assert.equal(abilityModifier(18,'score',10,2),4);
 assert.equal(abilityModifier(14,'score',10,2),2);
 assert.equal(abilityModifier(8,'score',10,2),-1);
 assert.equal(abilityModifier(-2,'modifier'),-2);
});
