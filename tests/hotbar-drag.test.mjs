import {readAppStyles} from './readAppStyles.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {normaliseHotbar,reorderHotbarSlots,removeHotbarSlot} from '../src/HotbarSlots.js';

const initial=[
 {label:'Slash',command:'/roll 1d20+4'},
 {label:'Shield',command:'/macro Defense'},
 {label:'Heal',command:'/roll 2d8+3'},
 {label:'Spell',command:'/spell character aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa magic bolt'}
];
const asCommands=slots=>slots.map(slot=>slot.command);

test('dragging a populated slot forward inserts and shifts without losing macros',()=>{
 const result=reorderHotbarSlots(initial,0,2);
 assert.deepEqual(asCommands(result).slice(0,4),[
  '/macro Defense','/roll 2d8+3','/roll 1d20+4',initial[3].command
 ]);
 assert.deepEqual(initial[0],{label:'Slash',command:'/roll 1d20+4'});
 assert.equal(result.length,8);
});
test('dragging a populated slot backward preserves all assignments',()=>{
 const result=reorderHotbarSlots(initial,3,1);
 assert.deepEqual(result.slice(0,4).map(x=>x.label),['Slash','Spell','Shield','Heal']);
 assert.equal(result[1].command,initial[3].command);
});
test('dragging to an empty slot reorders and keeps eight key positions',()=>{
 const result=reorderHotbarSlots(initial,0,7);
 assert.equal(result.length,8);
 assert.equal(result[7].command,'/roll 1d20+4');
 assert.equal(result[0].command,'/macro Defense');
 assert.equal(result[6].command,'');
});
test('dragging off the hotbar clears only the selected slot',()=>{
 const result=removeHotbarSlot(initial,1);
 assert.deepEqual(result[1],{label:'',command:''});
 assert.equal(result[0].command,initial[0].command);
 assert.equal(result[2].command,initial[2].command);
 assert.equal(result.length,8);
 assert.equal(initial[1].label,'Shield');
});
test('invalid drag indices and empty source do not change assignments',()=>{
 const a=normaliseHotbar(initial);
 for(const [source,target] of [[-1,3],[9,2],[2,-1],[2,9],[1,1],[6,0]]){
  assert.deepEqual(reorderHotbarSlots(a,source,target),a);
 }
 for(const index of [-1,8,NaN])
  assert.deepEqual(removeHotbarSlot(a,index),a);
});
test('hotbar slot drag supports outside drop, Escape cancel and external assignments',()=>{
 const ui=readFileSync(new URL('../src/TabletopControls.jsx',import.meta.url),'utf8');
 const main=(readFileSync(new URL('../src/main.jsx',import.meta.url),'utf8')+readFileSync(new URL('../src/TabletopApp.jsx',import.meta.url),'utf8')+readFileSync(new URL('../src/BattlemapBoard.jsx',import.meta.url),'utf8')+readFileSync(new URL('../src/SheetTemplateDesigner.jsx',import.meta.url),'utf8'));
 const css=readAppStyles();
 assert.ok(ui.includes('draggable={!!slot.command}'));
 assert.ok(ui.includes("setData('application/x-forge-hotbar-slot'"));
 assert.ok(ui.includes("document.addEventListener('drop',dropOutside,true)"));
 assert.ok(ui.includes("document.addEventListener('dragover',allowOutside,true)"));
 assert.ok(ui.includes('onReorderSlot?.(from,i)'));
 assert.ok(ui.includes('removeRef.current?.(source)'));
 assert.ok(ui.includes("application/x-forge-spell"));
 assert.ok(ui.includes("application/x-forge-macro"));
 assert.ok(main.includes('onReorderSlot={(from,to)=>rearrangeHotbar(from,to).catch(fail)}'));
 assert.ok(main.includes('onRemoveSlot={index=>clearHotbarSlot(index).catch(fail)}'));
 assert.ok(main.includes('hotbarWriteQueue.current'));
 assert.ok(css.includes('.macro-hotbar-drag-hint'));
 assert.ok(css.includes('.macro-hotbar-slot.hotbar-reorder-target'));
});
