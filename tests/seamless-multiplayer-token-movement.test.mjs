import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fogFrameDuringRefresh,fogCellState,FOG_EXPLORED} from '../src/MapFogModel.js';
import {applyAuthoritativeTokenMotion,shouldPersistFogDrag,
 FOG_DRAG_PERSIST_INTERVAL_MS} from '../src/LiveTokenMovement.js';

const map='00000000-0000-4000-8000-000000000001';
const id='00000000-0000-4000-8000-000000000003';
const original=[{id,map_id:map,owner_id:'owner',x:1,y:2}];

test('Realtime position delta is immediate without replacing the map state',()=>{
 const event={eventType:'UPDATE',new:{id,map_id:map,x:5,y:6}};
 const moved=applyAuthoritativeTokenMotion(original,event,map);
 assert.deepEqual([moved[0].x,moved[0].y],[5,6]);
 assert.equal(applyAuthoritativeTokenMotion(moved,event,map),moved);
 assert.equal(original[0].x,1);
 assert.equal(applyAuthoritativeTokenMotion(original,event,map,new Map([[id,{}]])),original);
});
test('wrong map, malformed coordinates or non-update cannot modify tokens',()=>{
 for(const event of [
  {eventType:'INSERT',new:{id,map_id:map,x:9,y:9}},
  {eventType:'UPDATE',new:{id,map_id:'another-map',x:9,y:9}},
  {eventType:'UPDATE',new:{id,map_id:map,x:Infinity,y:9}},
  {eventType:'UPDATE',new:{id,map_id:map,x:-1,y:9}}
 ])assert.equal(applyAuthoritativeTokenMotion(original,event,map),original);
});
test('fog refresh revokes sight but avoids repainting previously explored map art',()=>{
 const source={mapId:map,width:3,height:2,revision:4,enabled:true,
  partyShared:false,visible:[1,2],explored:[0,1,2,5]};
 const pending=fogFrameDuringRefresh(source,map);
 assert.deepEqual(pending.visible,[]);
 assert.deepEqual(pending.displayVisibleDuringRefresh,[1,2]);
 assert.equal(fogCellState(pending,1,0),FOG_EXPLORED);
 const repeated=fogFrameDuringRefresh(pending,map);
 assert.deepEqual(repeated.visible,[]);
 assert.deepEqual(repeated.displayVisibleDuringRefresh,[1,2]);
 assert.equal(fogFrameDuringRefresh(source,'wrong-map'),null);
 assert.deepEqual(fogFrameDuringRefresh({...source,enabled:false},map).displayVisibleDuringRefresh,[]);
 const ui=readFileSync(new URL('../src/MapFogOverlay.jsx',import.meta.url),'utf8');
 assert.match(ui,/state===FOG_EXPLORED&&displayVisible/);
});
test('SQL keeps fog-on invalidations and only skips movement-only fog-off ticks',()=>{
 const sql=readFileSync(new URL('../supabase/migrations/20261108055000_nonfog_token_movement_tick_optimization.sql',import.meta.url),'utf8');
 assert.match(sql,/to_jsonb\(old\)-'x'-'y'-'updated_at'/);
 assert.match(sql,/r\.fog_enforced=true/);
 assert.match(sql,/if not pure_movement or exists/);
});

test('fog-enabled drags persist RLS-filtered positions at a capped rate',()=>{
 assert.ok(FOG_DRAG_PERSIST_INTERVAL_MS>=150);
 assert.ok(shouldPersistFogDrag(true,0,1000));
 assert.ok(!shouldPersistFogDrag(false,0,1000));
 assert.ok(!shouldPersistFogDrag(true,1000,1100));
 assert.ok(shouldPersistFogDrag(true,1000,1000+FOG_DRAG_PERSIST_INTERVAL_MS));
 const board=readFileSync(new URL('../src/BattlemapBoard.jsx',import.meta.url),'utf8');
 assert.match(board,/fogFrame\?\.enabled,info\.lastFogWrite,now/);
 assert.match(board,/info\.persistedDuringDrag=true/);
 assert.match(board,/if\(!cancel\|\|info\.persistedDuringDrag\)move/);
});
