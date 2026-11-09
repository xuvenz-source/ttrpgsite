import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createBufferedObserverPathQueue,expandSweptPreviewLeg,
 MAX_PATH_PREVIEW_CELLS,MAX_QUEUED_PATH_CELLS}
 from '../src/BufferedObserverPathQueue.js';
import {createAuthorizedMotionTransport} from '../src/AuthorizedMotionTransport.js';
const file=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');

test('fast pointer sampling expands a continuous multi-cell sweep without corner shortcuts',()=>{
 assert.deepEqual(expandSweptPreviewLeg({x:1,y:1},{x:5,y:1}),
  [{x:1,y:1},{x:2,y:1},{x:3,y:1},{x:4,y:1},{x:5,y:1}]);
 assert.equal(expandSweptPreviewLeg({x:1,y:1},{x:250,y:1}),null);
 assert.equal(expandSweptPreviewLeg({x:NaN,y:0},{x:2,y:0}),null);
 assert.equal(MAX_PATH_PREVIEW_CELLS,48);
 assert.ok(MAX_QUEUED_PATH_CELLS<=192);
});
test('DM route queue never replaces unsent turns with a straight endpoint',async()=>{
 let now=1000,resolveFirst;
 const packets=[],timers=[];
 const queue=createBufferedObserverPathQueue({
  clock:()=>now,
  send:packet=>{
   packets.push(packet.params.p_path);
   if(packets.length===1)return new Promise(resolve=>{resolveFirst=resolve});
   return Promise.resolve({data:true,error:null});
  },
  setTimer:fn=>{timers.push(fn);return timers.length},
  clearTimer:()=>{},
  spacingMs:100
 });
 const pkt=seq=>({kind:'token',params:{
  p_map:'map',p_kind:'token',p_piece:'token',p_seq:seq
 }});
 assert.equal(queue.enqueue('token',pkt(1),{x:1,y:1},{x:5,y:1}),true);
 await Promise.resolve();await Promise.resolve();
 assert.equal(queue.enqueue('token',pkt(2),{x:5,y:1},{x:5,y:4}),true);
 assert.equal(queue.enqueue('token',pkt(3),{x:5,y:4},{x:8,y:4}),true);
 assert.equal(packets.length,1);
 resolveFirst({data:true,error:null});
 for(let n=0;n<8;n++)await Promise.resolve();
 now+=110;for(const fn of timers.splice(0))fn();
 for(let n=0;n<8;n++)await Promise.resolve();
 assert.ok(packets.length>=2);
 assert.deepEqual(packets[1],[
  {x:5,y:1},{x:5,y:2},{x:5,y:3},{x:5,y:4},
  {x:6,y:4},{x:7,y:4},{x:8,y:4}]);
 await queue.drain('token');
 queue.dispose();
});
test('saturated preview queue fails closed without fabricating a new path',async()=>{
 const queue=createBufferedObserverPathQueue({
  send:async()=>({data:true,error:null}),
  setTimer:()=>1,clearTimer:()=>{}
 });
 const params={kind:'token',params:{p_seq:1}};
 assert.equal(queue.enqueue('self',params,{x:1,y:1},{x:2,y:1}),true);
 assert.equal(queue.enqueue('self',params,{x:6,y:1},{x:7,y:1}),false,
  'a missing queued waypoint is not a straight line');
 assert.equal(queue.enqueue('self',params,{x:2,y:1},{x:195,y:1}),false,
  'more than 192 unconfirmed cells may not accumulate');
 await queue.cancel('self');
 queue.dispose();
});
test('DM path adapter chooses the authenticated route RPC, not old straight endpoint',async()=>{
 const methods=[];
 const uuid='10000000-0000-4000-8000-000000000001';
 const db={rpc:async(name,args)=>{
  methods.push(name);
  if(name==='begin_map_motion_session')return {data:{
   sessionId:uuid,mapId:uuid,pieceId:uuid
  },error:null};
  return {data:true,error:null};
 }};
 const transport=createAuthorizedMotionTransport({db});
 const path=[{x:1,y:1},{x:2,y:1},{x:2,y:2}];
 const result=await transport.send({kind:'token',params:{
  p_map:uuid,p_kind:'token',p_piece:uuid,p_x:2,p_y:2,p_seq:1,
  p_ignore_collision:false,p_path:path
 }});
 assert.equal(result?.data,true);
 assert.deepEqual(methods,[
  'begin_map_motion_session','advance_map_motion_session_path']);
 transport.dispose();
});
test('all DM pointer and tool routes use same ordered and bounded queue',()=>{
 const app=file('src/TabletopApp.jsx');
 const board=file('src/BattlemapBoard.jsx');
 const transport=file('src/AuthorizedMotionTransport.js');
 const sql=file('supabase/migrations/20261109000700_authorized_dm_observer_paths.sql');
 assert.match(app,/movementPathPreviewQueue\.current\?\.enqueue/);
 assert.match(app,/keys\.flatMap\(key=>\[/);
 assert.match(board,/onMovementPreview\?\.\(t,next\.x,next\.y,false,false,isDM\?/);
 assert.match(board,/onToolMovementPreview\?\.\(tool,next\.x,next\.y,false,false,isDM\?/);
 assert.match(transport,/advance_map_motion_session_path/);
 assert.match(sql,/WHERE ms\.id=p_session AND ms\.actor_id=actor FOR UPDATE/);
 assert.match(sql,/forge_visibility\.validate_piece_trajectory/);
 assert.match(sql,/observer_verified_path_status/);
 assert.match(sql,/public\.can_view_campaign_map/);
 assert.match(sql,/REVOKE ALL ON FUNCTION public\.advance_map_motion_session_path/);
});
