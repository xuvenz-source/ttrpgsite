import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {gridLayout} from '../src/InventoryMath.js';

const inventory=readFileSync(new URL('../src/InventoryPanel.jsx',import.meta.url),'utf8');
const css=readFileSync(new URL('../src/style.css',import.meta.url),'utf8');

test('grid inventory panel and fixed-cell grid do not share the same display class',()=>{
 assert.ok(inventory.includes("className={'inventory-panel inventory-'+mode}"));
 assert.ok(inventory.includes('className="inventory-slot-grid" ref={gridRef}'));
 assert.ok(!inventory.includes('<div className="inventory-grid" ref={gridRef}'));
 assert.ok(css.includes('.inventory-panel{width:100%;min-width:0;max-width:100%;display:flex'));
 assert.ok(css.includes('.inventory-slot-grid{display:grid;gap:2px;width:max-content'));
 assert.ok(!css.includes('.inventory-grid{display:grid'));
 assert.ok(css.includes('.field.inventory-grid-field .inventory-slot-grid{'));
 assert.ok(!css.includes('.field.inventory-grid-field .inventory-grid{'));
});
test('configured inventory dimensions remain full sized and scroll within its field',()=>{
 assert.ok(inventory.includes("gridTemplateColumns:'repeat('+cols+', '+CELL_SIZE+'px)'"));
 assert.ok(inventory.includes("gridTemplateRows:'repeat('+height+', '+CELL_SIZE+'px)'"));
 assert.ok(inventory.includes('const CELL_SIZE=48,GAP=2,GRID_PADDING=5'));
 assert.ok(css.includes('.inventory-grid-scroll{width:100%;max-width:100%;min-width:0;'));
 assert.ok(css.includes('overflow:auto;max-height:min(66vh,750px)'));
 assert.ok(css.includes('.field.inventory-grid-field .inventory-grid-scroll{'));
 assert.ok(css.includes('overflow-x:auto;overflow-y:auto;'));
 assert.deepEqual(gridLayout([],8,5),{placed:[],unplaced:[],cols:8,rows:5});
 assert.deepEqual(gridLayout([],12,7),{placed:[],unplaced:[],cols:12,rows:7});
});
test('grid item rotation and inventory data remain unchanged',()=>{
 assert.ok(inventory.includes('moveInventoryItem(items,current.index,current.x,current.y,cols,height,current.turns)'));
 assert.ok(inventory.includes("gridColumn:(x+1)+' / span '+w"));
 assert.ok(inventory.includes("gridRow:(y+1)+' / span '+h"));
});
