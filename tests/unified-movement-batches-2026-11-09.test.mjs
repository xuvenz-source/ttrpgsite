import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {enqueueConcealedTarget,takeConcealedBatch,
 MAX_SECURE_BATCH_CELLS} from '../src/ConcealedGestureBatch.js';
import {createConcealedMovementGate} from '../src/ConcealedMovementGate.js';
import {createTokenMotionRuntime} from '../src/TokenMotionRuntime.js';
import {authorizedFractionalOffset} from '../src/AuthorizedFractionalMotion.js';
import {movementDiagnostics} from '../src/MovementDiagnostics.js';
const source=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const sql=source('supabase/migrations/20261109000500_batched_concealed_navigation.sql');
const map='10000000-0000-4000-8000-000000000001';
const token='10000000-0000-4000-8000-000000000002';
const session='10000000-0000-4000-8000-000000000003';

test('fast drag becomes one batched request instead of one RPC per cell',()=>{
 const queue=[];
 assert.equal(enqueueConcealedTarget(queue,{dx:10,dy:0}),true);
 assert.deepEqual(takeConcealedBatch({dx:0,dy:0},queue).targets,[{dx:10,dy:0}]);
 assert.equal(MAX_SECURE_BATCH_CELLS>=10,true);
});
test('intermediate pointer turns are never shortened into a wall-crossing diagonal',()=>{
 const queue=[];
 for(const target of [{dx:8,dy:0},{dx:8,dy:4},{dx:2,dy:4}])
  assert.equal(enqueueConcealedTarget(queue,target),true);
 assert.deepEqual(queue,[{dx:8,dy:0},{dx:8,dy:4},{dx:2,dy:4}]);
 const {targets,remaining}=takeConcealedBatch({dx:0,dy:0},queue);
 assert.deepEqual(targets,queue);
 assert.deepEqual(remaining,[]);
});
test('bounded batches preserve the whole 60-cell intent in three round-trips',()=>{
 let current={dx:0,dy:0},pending=[{dx:60,dy:0}],batches=0;
 while(pending.length){
  const batch=takeConcealedBatch(current,pending);
  assert.ok(batch.targets.length>0);
  assert.ok(batch.targets.at(-1).dx-current.dx<=24);
  current=batch.targets.at(-1);pending=batch.remaining;batches++;
  assert.ok(batches<8);
 }
 assert.deepEqual(current,{dx:60,dy:0});
 assert.equal(batches,3);
});
test('new protocol rejects private fields, jumps, wrong sequences and forged outcomes',async()=>{
 let response={version:1,seq:1,blocked:false,approved:[
  {dx:1,dy:0},{dx:2,dy:0},{dx:3,dy:0}]};
 const calls=[];
 const gate=createConcealedMovementGate({db:{rpc:async(name,args)=>{
  calls.push(name);
  if(name==='begin_authorized_navigation_gesture')
   return {data:{sessionId:session},error:null};
  return {data:response,error:null};
 }}});
 await gate.begin(map,[token],[]);
 assert.deepEqual(await gate.approveBatch(session,[{dx:3,dy:0}],1),{
  approved:response.approved,blocked:false});
 response={...response,seq:2,privateWalls:[]};
 await assert.rejects(gate.approveBatch(session,[{dx:3,dy:0}],2));
 response={version:1,seq:3,blocked:false,approved:[{dx:3,dy:3}]};
 await assert.rejects(gate.approveBatch(session,[{dx:3,dy:3}],3));
 assert.deepEqual(calls.filter(x=>x==='advance_authorized_navigation_gesture_batch').length,3);
 gate.dispose();
});
test('SQL additive protocol retains actor session, revocation, full-footprint sweeps',()=>{
 assert.match(sql,/ADD COLUMN IF NOT EXISTS batch_count/);
 assert.match(sql,/CREATE OR REPLACE FUNCTION public\.advance_authorized_navigation_gesture_batch/);
 assert.match(sql,/WHERE id=p_session AND actor_id=actor FOR UPDATE/);
 assert.match(sql,/permission_generation/);
 assert.match(sql,/public\.can_view_campaign_map/);
 assert.match(sql,/current_token\.owner_id IS DISTINCT FROM actor|token_row\.owner_id IS DISTINCT FROM actor/);
 assert.match(sql,/tool_row\.owner_id IS DISTINCT FROM actor/);
 assert.match(sql,/forge_visibility\.validate_piece_trajectory/);
 assert.match(sql,/REVOKE ALL ON FUNCTION public\.advance_authorized_navigation_gesture_batch/);
 assert.doesNotMatch(sql,/GRANT EXECUTE[^;]*TO anon/);
 assert.equal(sql.includes('RETURN scene;')||sql.includes('RETURN barrier;'),false);
});
test('release drains queued moves before the atomic final commit',()=>{
 const board=source('src/BattlemapBoard.jsx');
 const app=source('src/TabletopApp.jsx');
 assert.match(board,/const pending=requestConcealedOffset\(info,finalTarget,true\)/);
 assert.match(board,/info\.secureReleased=true/);
 assert.match(board,/Promise\.resolve\(pending\)\.finally/);
 assert.match(board,/info\.secureFinalized=true/);
 assert.match(board,/moveGroup\(\{/);
 assert.match(app,/commit_map_trajectory/);
});
test('remote settle cannot rewind to a stale canonical cell on a timer',()=>{
 const frames=[],timers=[];
 const motion=createTokenMotionRuntime({
  requestFrame:fn=>{frames.push(fn);return frames.length},
  cancelFrame:()=>{},
  setTimer:fn=>{timers.push(fn);return timers.length},
  clearTimer:()=>{}
 });
 const node={style:{}};
 motion.bind('token','sprite',node,{x:1,y:0,cell:70});
 motion.previewRemote('token',5,0);
 motion.settleRemote('token',5,0);
 while(frames.length)frames.shift()();
 for(let i=0;i<8&&timers.length;i++)timers.shift()();
 assert.equal(motion.getPreview('token')?.x,5);
 motion.bind('token','sprite',node,{x:5,y:0,cell:70});
 assert.equal(motion.getPreview('token'),null);
 motion.dispose();
});

test('subcell pointer follows only an authorized swept edge',()=>{
 const allowed=(_from,to)=>to.dx===1&&to.dy===0;
 assert.deepEqual(authorizedFractionalOffset({dx:0,dy:0},
  {dx:.42,dy:0},allowed),{dx:.42,dy:0});
 assert.deepEqual(authorizedFractionalOffset({dx:0,dy:0},
  {dx:-.4,dy:0},allowed),{dx:0,dy:0});
 assert.deepEqual(authorizedFractionalOffset({dx:0,dy:0},
  {dx:.42,dy:.3},allowed),{dx:.42,dy:0});
 assert.deepEqual(authorizedFractionalOffset({dx:0,dy:0},
  {dx:.3,dy:.3},()=>false),{dx:0,dy:0});
 assert.deepEqual(authorizedFractionalOffset({dx:0,dy:0},
  {dx:NaN,dy:0},allowed),{dx:0,dy:0});
});
test('frame telemetry contains only aggregate timings, never coordinates',()=>{
 movementDiagnostics.clear();
 let now=10;const frames=[];
 const motion=createTokenMotionRuntime({
  clock:()=>now,
  requestFrame:fn=>{frames.push(fn);return frames.length},
  cancelFrame:()=>{}
 });
 const node={style:{}};
 motion.bind('sensitive-id','sprite',node,{x:0,y:0,cell:50});
 motion.preview('sensitive-id',.4,0);
 now=18;frames.shift()();
 const metric=movementDiagnostics.snapshot();
 assert.equal(metric['local-motion-frame-latency'].p50Ms,8);
 assert.equal(JSON.stringify(metric).includes('sensitive-id'),false);
 assert.equal(JSON.stringify(metric).includes('.4'),false);
 motion.dispose();
 movementDiagnostics.clear();
});

test('straight clear corridors use one sweep per member but blocked routes retain exact prefixes',()=>{
 assert.match(sql,/IF delta_x=0 OR delta_y=0 THEN/);
 assert.match(sql,/IF fast_legal THEN/);
 assert.match(sql,/CONTINUE targets_loop;/);
 assert.match(sql,/IF NOT valid THEN blocked:=true;EXIT targets_loop;END IF;/);
 assert.match(sql,/PERFORM forge_visibility\.validate_piece_trajectory/);
 assert.match(sql,/check_end:=forge_visibility\.validate_piece_trajectory/);
});
