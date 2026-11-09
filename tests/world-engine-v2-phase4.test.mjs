import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createWorldAuthorityClient,createMovementController,expandGestureRoute}
 from '../src/engine/v2/index.js';
const uid=i=>('00000000-0000-4000-8000-'+String(i).padStart(12,'0'));
const mapId=uid(1),tokenId=uid(2),sessionId=uid(3);
const piece={kind:'token',id:tokenId};
const start={mapId,gestureId:1,selection:[piece],mode:'drag',
 origin:{x:0,y:1},environmentRevision:7,permissionGeneration:3};
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const mockRpc=()=>{const calls=[];
 const db={rpc:async(name,args)=>{
  calls.push([name,args]);
  if(name==='begin_world_motion_v2')return {data:{version:2,sessionId},error:null};
  if(name==='advance_world_motion_v2')
   return {data:{version:2,sessionId,seq:args.p_seq,blocked:false,
    accepted:expandGestureRoute(args.p_from,args.p_targets)},error:null};
  if(name==='commit_world_motion_v2')
   return {data:{version:2,sessionId,seq:args.p_seq,
    endpoint:args.p_endpoint},error:null};
  if(name==='cancel_world_motion_v2')return {data:true,error:null};
  throw Error('Unexpected legacy RPC '+name);
 }};
 return {db,calls};
};
test('phase 4 authority client speaks only V2 RPCs with bounded args',async()=>{
 const {db,calls}=mockRpc();
 const authority=createWorldAuthorityClient({db});
 const session=await authority.begin(start);
 assert.equal(session.sessionId,sessionId);
 const reply=await authority.advance({mapId,sessionId,gestureId:1,seq:1,
  from:{x:0,y:1},targets:[{x:5,y:1}],environmentRevision:7,
  permissionGeneration:3});
 assert.equal(reply.accepted.length,5);
 const result=await authority.commit({mapId,sessionId,gestureId:1,seq:2,
  endpoint:{x:5,y:1},environmentRevision:7,permissionGeneration:3});
 assert.deepEqual(result.endpoint,{x:5,y:1});
 assert.equal(authority.sessionCount,0);
 assert.deepEqual(calls.map(x=>x[0]),[
  'begin_world_motion_v2','advance_world_motion_v2','commit_world_motion_v2']);
 assert.equal(JSON.stringify(calls).includes('privateWalls'),false);
 authority.dispose();
});
test('wrong session, forged piece and repeated sequence rejected without RPC',async()=>{
 const {db,calls}=mockRpc();
 const authority=createWorldAuthorityClient({db});
 await assert.rejects(authority.begin({...start,selection:[{kind:'token',id:'forged'}]}));
 await authority.begin(start);
 await assert.rejects(authority.advance({mapId,sessionId:uid(9),gestureId:1,seq:1,
  from:{x:0,y:1},targets:[{x:1,y:1}],environmentRevision:7,permissionGeneration:3}));
 await authority.advance({mapId,sessionId,gestureId:1,seq:1,from:{x:0,y:1},
  targets:[{x:1,y:1}],environmentRevision:7,permissionGeneration:3});
 await assert.rejects(authority.advance({mapId,sessionId,gestureId:1,seq:1,
  from:{x:1,y:1},targets:[{x:2,y:1}],environmentRevision:7,permissionGeneration:3}));
 assert.equal(calls.filter(x=>x[0]==='advance_world_motion_v2').length,1);
});
test('late cancelled response cannot revive local authority session',async()=>{
 let resolveAdvance;
 const {db}=mockRpc(), original=db.rpc;
 db.rpc=async(name,args)=>name==='advance_world_motion_v2'?
  new Promise(r=>{resolveAdvance=r}):original(name,args);
 const authority=createWorldAuthorityClient({db});
 await authority.begin(start);
 const pending=authority.advance({mapId,sessionId,gestureId:1,seq:1,
  from:{x:0,y:1},targets:[{x:1,y:1}],environmentRevision:7,
  permissionGeneration:3});
 await tick();
 assert.equal(await authority.cancel({mapId,sessionId,gestureId:1}),true);
 resolveAdvance({data:{version:2,sessionId,seq:1,blocked:false,
  accepted:[{x:1,y:1}]},error:null});
 await assert.rejects(pending,/cancelled/);
 assert.equal(authority.sessionCount,0);
});
test('client rejects API errors without silently invoking old movement RPCs',async()=>{
 const calls=[];
 const authority=createWorldAuthorityClient({db:{rpc:async name=>{
  calls.push(name);return {data:null,error:Error('network failure')};
 }}});
 await assert.rejects(authority.begin(start),/unavailable/);
 assert.deepEqual(calls,['begin_world_motion_v2']);
});
test('V2 movement controller can complete a multi-bend drag through its new RPC interface',async()=>{
 const {db,calls}=mockRpc(),events=[];
 const authority=createWorldAuthorityClient({db});
 const controller=createMovementController({authority,onEvent:e=>events.push(e)});
 assert.equal(controller.beginGesture({mapId,selection:[piece],
  origin:{x:0,y:1},pointer:{x:0,y:1},
  environmentRevision:7,permissionGeneration:3}),true);
 controller.updateGesture({x:5,y:1});
 controller.updateGesture({x:5,y:3});
 controller.updateGesture({x:2,y:3});
 const result=await controller.endGesture();
 assert.equal(result.status,'committed');
 assert.equal(controller.active,false);
 assert.deepEqual(calls.filter(x=>x[0]==='commit_world_motion_v2')
  .map(x=>x[1].p_endpoint),[{x:2,y:3}]);
 assert.ok(calls.some(x=>x[0]==='advance_world_motion_v2'));
 assert.equal(events.at(-1).type,'committed');
});
test('V2 staged SQL has protected session storage and actor-owned RPC grants',()=>{
 const sql=readFileSync(new URL('../supabase/migrations/20261109095000_world_engine_v2_motion_authority.sql',import.meta.url),'utf8');
 for(const name of ['begin_world_motion_v2','advance_world_motion_v2',
  'commit_world_motion_v2','cancel_world_motion_v2'])
  assert.match(sql,new RegExp('CREATE OR REPLACE FUNCTION public\\.'+name));
 assert.match(sql,/ENABLE ROW LEVEL SECURITY/);
 assert.match(sql,/SECURITY DEFINER SET search_path=''/);
 assert.match(sql,/actor_id=auth\.uid\(\)/);
 assert.match(sql,/public\.can_view_campaign_map/);
 assert.match(sql,/forge_world_v2\.step_allowed/);
 assert.match(sql,/REVOKE ALL ON FUNCTION public\.commit_world_motion_v2/);
 assert.match(sql,/FROM PUBLIC,anon,authenticated/);
 assert.doesNotMatch(sql,/GRANT EXECUTE[^\n]*\bTO anon/);
 assert.doesNotMatch(sql,/public\.commit_map_trajectory\(/);
 assert.doesNotMatch(sql,/public\.advance_map_motion_session\(/);
});
