import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {canControlMapToken,selectionRectangle,selectableTokenIds,
 boundedGroupOffset} from '../src/MapSelection.js';

const mapId='map_a',owner='player_a',other='player_b';
const make=(id,x,y,ownerId=owner,extra={})=>({
 id,map_id:mapId,owner_id:ownerId,visible:true,x,y,span_x:1,span_y:1,...extra
});

test('left drag builds a rectangle regardless of drag direction',()=>{
 assert.deepEqual(selectionRectangle({x:185,y:150},{x:60,y:75}),
  {x:60,y:75,width:125,height:75});
 assert.deepEqual(selectionRectangle({x:0,y:0},{x:0,y:0}),
  {x:0,y:0,width:0,height:0});
});
test('marquee selects only tokens the viewer may control',()=>{
 const items=[
  make('own',2,2),
  make('ally',3,2),
  make('npc',4,2,null),
  make('other',2,3,other),
  make('hidden',3,3,owner,{visible:false}),
  make('elsewhere',3,3,owner,{map_id:'map_b'})
 ];
 const r=selectionRectangle({x:125,y:125},{x:340,y:340});
 assert.deepEqual(selectableTokenIds(items,r,70,owner,false,mapId),['own','ally']);
 assert.deepEqual(selectableTokenIds(items,r,70,owner,true,mapId),
  ['own','ally','npc','other','hidden']);
 assert.deepEqual(selectableTokenIds(items,{x:0,y:0,width:10,height:10},70,owner,true,mapId),[]);
 assert.equal(canControlMapToken(items[2],owner,false,mapId),false);
 assert.equal(canControlMapToken(items[2],owner,true,mapId),true);
});
test('marquee checks the token footprint, not just its top-left cell',()=>{
 const large=make('large',4,3,owner,{span_x:2,span_y:3});
 const r={x:350,y:350,width:20,height:25};
 assert.deepEqual(selectableTokenIds([large],r,70,owner,false,mapId),['large']);
});
test('group moves preserve relative layout and clamp as one group',()=>{
 const group=[make('a',1,1),make('b',4,3),make('c',5,2)];
 assert.deepEqual(boundedGroupOffset(group,2,1,700,700,70),{dx:2,dy:1});
 assert.deepEqual(boundedGroupOffset(group,10,10,490,350,70),{dx:1,dy:1});
 assert.deepEqual(boundedGroupOffset(group,-15,-15,700,700,70),{dx:-1,dy:-1});
 const delta=boundedGroupOffset(group,3,2,700,700,70);
 const shifted=group.map(t=>({x:t.x+delta.dx,y:t.y+delta.dy}));
 assert.equal(shifted[1].x-shifted[0].x,group[1].x-group[0].x);
 assert.equal(shifted[2].y-shifted[1].y,group[2].y-group[1].y);
});
test('group movement handles larger NPC footprints at map edges',()=>{
 const g=[make('a',0,0,null,{span_x:3,span_y:2}),
  make('b',5,3,null,{span_x:2,span_y:2})];
 assert.deepEqual(boundedGroupOffset(g,4,3,490,350,70),{dx:0,dy:0});
 assert.deepEqual(boundedGroupOffset(g,-20,-20,490,350,70),{dx:0,dy:0});
});
test('battlemap switches mouse gestures and retains old token shortcuts',()=>{
 const m=readFileSync(new URL('../src/main.jsx',import.meta.url),'utf8');
 const css=readFileSync(new URL('../src/style.css',import.meta.url),'utf8');
 assert.ok(m.includes("e.button!==1&&!(e.pointerType==='touch'&&e.button===0)"));
 assert.ok(m.includes('onPointerDownCapture={startPan} onPointerDown={startMarquee}'));
 assert.ok(m.includes('const found=selectableTokenIds('));
 assert.ok(m.includes('const delta=boundedGroupOffset('));
 assert.ok(m.includes('for(const t of info.members)'));
 assert.ok(m.includes('if(e.shiftKey&&!e.ctrlKey&&!e.altKey)'));
 assert.ok(m.includes('if(e.ctrlKey&&!e.altKey&&canMove)'));
 assert.ok(m.includes('onMovementPreview?.(t,next.x,next.y,true)'));
 assert.ok(m.includes('move(t,next.x,next.y)'));
 assert.ok(m.includes('selectedIds.length===1&&<div className="token-resize-handle"'));
 assert.ok(css.includes('.map-selection-marquee{position:absolute'));
});
