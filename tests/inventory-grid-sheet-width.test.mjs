import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {gridLayout} from '../src/InventoryMath.js';

const css=readFileSync(new URL('../src/style.css',import.meta.url),'utf8');
const panel=readFileSync(new URL('../src/InventoryPanel.jsx',import.meta.url),'utf8');
const character=readFileSync(new URL('../src/CharacterEditor.jsx',import.meta.url),'utf8');
const npc=readFileSync(new URL('../src/NpcEditor.jsx',import.meta.url),'utf8');
const app=readFileSync(new URL('../src/main.jsx',import.meta.url),'utf8');

test('grid inventory fields are identified in all three character and NPC sheet renderers',()=>{
 for(const [name,source] of [['DM player sheet',character],['NPC sheet',npc],['player sheet',app]]){
  assert.ok(source.includes("f.type==='inventory'&&f.inventoryPreset==='grid'?' inventory-grid-field':''"),
   name+' must classify slot grid inventory fields');
  assert.ok(source.includes("'field span'+(f.span||1)"),name+' must respect template width');
 }
});
test('configured three-column inventory spans full sheet row instead of collapsing',()=>{
 assert.ok(css.includes('.floating-window.floating-sheet>.npc-modal>.npc-fields.fields'));
 assert.ok(css.includes('.floating-window.floating-npc>.npc-modal>.npc-fields.fields'));
 assert.match(css,/\.npc-fields\.fields\s*\{[^}]*grid-template-columns:repeat\(3,minmax\(0,1fr\)\)/);
 assert.match(css,/\.field\.inventory-grid-field\.span3\s*\{\s*grid-column:1\s*\/\s*-1/);
 assert.ok(css.includes('.field.inventory-grid-field.span2'));
 assert.ok(css.includes('.field.inventory-grid-field.span1'));
 assert.ok(css.includes('.field.inventory-grid-field>.inventory-panel.inventory-grid'));
});
test('grid retains 48px physical slots and scrolls horizontally when window is smaller',()=>{
 assert.ok(panel.includes('const CELL_SIZE=48'));
 assert.ok(panel.includes("gridTemplateColumns:'repeat('+cols+', '+CELL_SIZE+'px)'"));
 assert.ok(panel.includes("gridTemplateRows:'repeat('+height+', '+CELL_SIZE+'px)'"));
 assert.match(css,/\.field\.inventory-grid-field \.inventory-grid-scroll\s*\{[^}]*overflow-x:auto/);
 assert.match(css,/\.field\.inventory-grid-field \.inventory-slot-grid\s*\{[^}]*width:max-content/);
 const layout=gridLayout([{Item:'Sword',gridX:0,gridY:0,gridW:1,gridH:1}],8,5);
 assert.equal(layout.placed[0].x,0);
 assert.equal(layout.placed[0].y,0);
 assert.equal(layout.placed[0].w,1);
 assert.equal(layout.placed[0].h,1);
 assert.equal(layout.unplaced.length,0);
});
test('inventory designer retains separately configurable sheet field width and slot dimensions',()=>{
 assert.ok(app.includes("update(f.id,'span',Number(e.target.value))"));
 assert.ok(app.includes("update(f.id,'gridColumns',Number(e.target.value))"));
 assert.ok(app.includes("update(f.id,'gridRows',Number(e.target.value))"));
 assert.ok(panel.includes("Number(field.gridColumns)||8"));
 assert.ok(panel.includes("Number(field.gridRows)||5"));
 assert.match(css,/@media\(max-width:700px\)\s*\{[\s\S]*?\.floating-window\.floating-sheet>\.npc-modal>\.npc-fields\.fields/);
});
