import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const panel=readFileSync(new URL('../src/InventoryPanel.jsx',import.meta.url),'utf8');
const editor=readFileSync(new URL('../src/InventoryItemEditor.jsx',import.meta.url),'utf8');
const css=readFileSync(new URL('../src/style.css',import.meta.url),'utf8');

test('new items and tile clicks open a separate compact floating editor',()=>{
 assert.ok(panel.includes("setEditing('new')"));
 assert.ok(panel.includes('onPointerUp={e=>endDrag(e)}'));
 assert.ok(panel.includes("openItem(index)"));
 assert.ok(panel.includes("const index=dragIndex(current)"));
 assert.ok(panel.includes('createPortal(<InventoryItemEditor'));
 assert.ok(editor.includes('<FloatingWindow kind="inventory"'));
 for(const field of ['Item','Qty','Weight','Notes','gridShortName','gridIcon',
  'gridBorderColor','gridBackgroundColor','gridW','gridH'])
  assert.ok(editor.includes(field),field+' editor control must be retained');
 assert.ok(editor.includes('onSubmit={submit}'));
 assert.ok(editor.includes("if(!draft.Item.trim())return 'Give the item a name.'"));
 assert.ok(editor.includes('Edits save automatically'));
 assert.doesNotMatch(editor,/>Save item<\/button>/);
});
test('inventory tiles render icon, abbreviation and border rather than inputs',()=>{
 assert.ok(panel.includes('inventory-tile-icon'));
 assert.ok(panel.includes('inventory-tile-name'));
 assert.ok(panel.includes('inventory-tile-qty'));
 assert.ok(panel.includes('gridBorderColor'));
 assert.ok(panel.includes('row.gridIcon'));
 assert.ok(css.includes('var(--inventory-tile-border'));
 assert.ok(css.includes('var(--inventory-tile-back'));
 assert.ok(css.includes('var(--inventory-tile-text'));
});
test('grid stays fixed in physical pixels and overflows instead of stretching',()=>{
 assert.ok(panel.includes("gridTemplateColumns:'repeat('+cols+', '+CELL_SIZE+'px)'"));
 assert.ok(panel.includes("gridTemplateRows:'repeat('+height+', '+CELL_SIZE+'px)'"));
 assert.ok(css.includes('grid-auto-columns:48px;grid-auto-rows:48px'));
 assert.ok(css.includes('.inventory-grid-scroll{'));
 assert.ok(css.includes('width:max-content'));
 assert.ok(!panel.includes('minmax(0,1fr)'));
});
test('custom pointer drag supports R-key and refuses invalid placement',()=>{
 assert.ok(!panel.includes('draggable'));
 assert.ok(panel.includes("e.key.toLowerCase()==='r'"));
 assert.ok(panel.includes("window.addEventListener('keydown',key,true)"));
 assert.ok(panel.includes('setPointerCapture(e.pointerId)'));
 assert.ok(panel.includes('moveInventoryItem(items,index,current.x,current.y,cols,height,current.turns)'));
 assert.ok(panel.includes('canPlaceInventoryItem('));
});
