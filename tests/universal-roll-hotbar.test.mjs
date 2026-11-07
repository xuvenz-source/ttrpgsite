import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {rollHotbarSlot,parseRollHotbarCommand,rollDragProps,
 resolveSheetRollExpression,resolveSheetHotbarRoll,isRollHotbarCommand,
 ROLL_HOTBAR_MIME} from '../src/HotbarRollActions.js';
const sourceId='11111111-1111-4111-8111-111111111111';
const entryId='22222222-2222-4222-8222-222222222222';
const source={sourceType:'character',sourceId};
const template={modifierRules:{base:10,step:2},tabs:[{fields:[
 {id:'rolled',type:'roll',label:'Ability check',formula:'1d20+@{strength}'},
 {id:'strength',type:'attribute',label:'Strength',span:1},
 {id:'proficiency',type:'proficiencies',label:'Skills',
  entries:[{id:'athletics',label:'Athletics',group:'Skills',abilityField:'strength',
   abilityMode:'modifier',rank:0}]},
 {id:'equipment',type:'equipment',label:'Equipment'},
 {id:'loot',type:'collection',label:'Actions',entryLabel:'Action',titleField:'name',
  fields:[{id:'name',type:'text',label:'Name'},{id:'strike',type:'roll',label:'Roll',
   formula:'1d6+@{row.bonus}+@{strength}'}]}
 ]}]};
const values={strength:16,strength__save_prof:false,
 loot:[{id:'entry1',values:{name:'Trap',bonus:2}}]};

test('every roll type becomes a bounded, unambiguous hotbar command',()=>{
 const actions=[
  {kind:'weapon',...source,fieldId:'equipment',weaponId:'weapon_1',label:'Greatsword'},
  {kind:'sheet',...source,fieldId:'rolled',label:'Ability'},
  {kind:'collection',...source,fieldId:'loot',entryId:'entry1',childId:'strike',label:'Trap'},
  {kind:'save',...source,fieldId:'strength',label:'Strength save'},
  {kind:'proficiency',...source,fieldId:'proficiency',entryId:'athletics',label:'Athletics'},
  {kind:'spell',...source,fieldId:'spellbook',entryId:'spell1',mode:'damage',label:'Fire'},
  {kind:'initiative',entryId,label:'Initiative'},
  {kind:'initiative-npcs',label:'Roll NPCs'}
 ];
 for(const action of actions){
  const slot=rollHotbarSlot(action);
  assert.ok(slot.command.length<=300);
  assert.ok(slot.label.length<=40);
  assert.equal(isRollHotbarCommand(slot.command),true);
  const parsed=parseRollHotbarCommand(slot.command);
  assert.equal(parsed.kind,action.kind);
  if(action.fieldId)assert.equal(parsed.fieldId,action.fieldId);
 }
 assert.equal(rollHotbarSlot({kind:'dice',formula:'2d8+3',label:'Heal'}).command,'/roll 2d8+3');
});
test('weapon hotbar command points to the saved weapon rather than frozen dice',()=>{
 const action={kind:'weapon',...source,fieldId:'equipment',weaponId:'weapon_1',label:'Longsword'};
 const command=rollHotbarSlot(action).command;
 assert.equal(command,'/weapon character '+sourceId+' equipment weapon_1');
 assert.equal(parseRollHotbarCommand(command).weaponId,'weapon_1');
 assert.throws(()=>rollHotbarSlot({...action,weaponId:'unsafe; drop table'}));
 assert.throws(()=>rollHotbarSlot({...action,sourceId:'not-an-id'}));
 assert.equal(parseRollHotbarCommand('/weapon character bad equipment weapon_1'),null);
});
test('shared drag handler uses only the app MIME and leaves click action alone',()=>{
 const action={kind:'save',...source,fieldId:'strength',label:'Save'};
 const props=rollDragProps(action);
 assert.equal(props.draggable,true);
 let dragged={};
 props.onDragStart({dataTransfer:{setData:(mime,payload)=>{dragged={mime,payload}}}});
 assert.equal(dragged.mime,ROLL_HOTBAR_MIME);
 assert.deepEqual(JSON.parse(dragged.payload),action);
 assert.equal(rollDragProps(null).draggable,false);
});
test('sheet rolls resolve using current values, not values when shortcut was created',()=>{
 const shortcut=parseRollHotbarCommand(rollHotbarSlot({kind:'sheet',...source,fieldId:'rolled'}).command);
 assert.equal(resolveSheetHotbarRoll(shortcut,template,values).formula,'1d20+16');
 assert.equal(resolveSheetHotbarRoll(shortcut,template,{...values,strength:19}).formula,'1d20+19');
 const save={kind:'save',fieldId:'strength'};
 assert.equal(resolveSheetHotbarRoll(save,template,values).formula,'1d20+3');
 assert.equal(resolveSheetHotbarRoll(save,template,{...values,strength:18}).formula,'1d20+4');
 assert.equal(resolveSheetHotbarRoll({kind:'collection',fieldId:'loot',entryId:'entry1',childId:'strike'},template,values).formula,'1d6+2+16');
 assert.equal(resolveSheetRollExpression('1d20+@{row.bonus}+@{strength}',{bonus:5},values),'1d20+5+16');
});
test('deleted or mismatched rolls fail closed rather than executing stale code',()=>{
 assert.throws(()=>resolveSheetHotbarRoll({kind:'sheet',fieldId:'deleted'},template,values));
 assert.throws(()=>resolveSheetHotbarRoll({kind:'collection',fieldId:'loot',entryId:'deleted',childId:'strike'},template,values));
 assert.throws(()=>resolveSheetHotbarRoll({kind:'weapon',fieldId:'equipment'},template,values));
});
test('all existing roll surfaces expose the common roll drag action',()=>{
 const files=[
  'src/PlayerSheetFields.jsx','src/CharacterEditor.jsx','src/NpcEditor.jsx',
  'src/AttributeField.jsx','src/SheetProgression.jsx','src/SheetEquipment.jsx',
  'src/RepeatingCollection.jsx','src/CombatTurnOrder.jsx'
 ];
 for(const path of files){
  const src=readFileSync(new URL('../'+path,import.meta.url),'utf8');
  assert.match(src,/rollDragProps/,'roll button drag missing from '+path);
 }
 const main=readFileSync(new URL('../src/TabletopApp.jsx',import.meta.url),'utf8');
 const controls=readFileSync(new URL('../src/TabletopControls.jsx',import.meta.url),'utf8');
 assert.match(main,/onAssignRoll=\{/);
 assert.match(main,/await attackWithWeapon\(\{sourceType:shortcut.sourceType/);
 assert.match(main,/await executeSheetHotbarRoll\(shortcut\)/);
 assert.match(main,/await combatTracker.roll\(shortcut.entryId\)/);
 assert.match(main,/await castSpell\(\{sourceType:shortcut.sourceType/);
 assert.match(controls,/types.includes\(ROLL_HOTBAR_MIME\)/);
 assert.match(controls,/getData\(ROLL_HOTBAR_MIME\)/);
 assert.match(controls,/isRollHotbarCommand\(s.command\)/);
});
