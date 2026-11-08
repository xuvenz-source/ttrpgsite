import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {applyAuthorizedFogEnvelope} from '../src/AuthorizedFogDelta.js';
import {normalizeAuthorizedFogFrame} from '../src/MapFogModel.js';
import {clearVerifiedHiddenTokens,clearVerifiedHiddenTools,newerAuthorizedSight} from '../src/AuthorizedObserverVisibility.js';
import {createAuthorizedMotionTransport} from '../src/AuthorizedMotionTransport.js';
import {createMovementDiagnostics} from '../src/MovementDiagnostics.js';

const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const map='00000000-0000-4000-8000-000000000001';
const viewer='00000000-0000-4000-8000-000000000002';
const tokenId='00000000-0000-4000-8000-000000000003';
const sessionId='00000000-0000-4000-8000-000000000004';
const initial={mapId:map,revision:4,protocolVersion:2,deltaProtocolVersion:1,
 epoch:sessionId,sequence:1,width:4,height:4,enabled:true,partyShared:false,
 visible:[5,6],explored:[5,6,7],collisionEnabled:true,mode:'snapshot'};
const snapshot=applyAuthorizedFogEnvelope(null,initial,map);

test('authoritative fog delta grants and revokes only explicit server cell indices',()=>{
 assert.ok(snapshot,JSON.stringify({normalized:normalizeAuthorizedFogFrame(initial,map),initial}));
 assert.equal(snapshot.epoch,sessionId);
 assert.equal(snapshot.sequence,1);
 assert.deepEqual(snapshot.visible,[5,6]);
 const next=applyAuthorizedFogEnvelope(snapshot,{
  mode:'delta',deltaProtocolVersion:1,protocolVersion:2,mapId:map,
  revision:5,baseRevision:4,baseSequence:1,sequence:2,epoch:sessionId,
  width:4,height:4,enabled:true,partyShared:false,collisionEnabled:true,
  visibleAdd:[8],visibleRemove:[5],exploredAdd:[8],exploredRemove:[]
 },map);
 assert.deepEqual(next?.visible,[6,8]);
 assert.deepEqual(next?.explored,[5,6,7,8]);
 assert.equal(applyAuthorizedFogEnvelope(next,{
  mode:'noop',mapId:map,deltaProtocolVersion:1,protocolVersion:2,
  revision:5,sequence:2,epoch:sessionId
 },map),next);
});
test('lost, reordered, malformed or foreign deltas fail closed',()=>{
 const update={mode:'delta',deltaProtocolVersion:1,protocolVersion:2,
  mapId:map,revision:5,baseRevision:4,baseSequence:1,sequence:2,
  epoch:sessionId,width:4,height:4,enabled:true,partyShared:false,
  visibleAdd:[8],visibleRemove:[5],exploredAdd:[8],exploredRemove:[]};
 for(const envelope of [
  {...update,baseSequence:0},{...update,baseRevision:3},
  {...update,epoch:viewer},{...update,mapId:viewer},
  {...update,sequence:3},{...update,revision:3},
  {...update,visibleAdd:[999]},{...update,visibleAdd:[8,8]},
  {...update,visibleRemove:[5,5]},{...update,visibleRemove:[9]},
  {...update,visibleAdd:[8],visibleRemove:[8]},
  {...update,exploredAdd:[]},
  {...update,enabled:false}
 ])assert.equal(applyAuthorizedFogEnvelope(snapshot,envelope,map),null);
 assert.equal(applyAuthorizedFogEnvelope(null,{...update},map),null);
 assert.equal(applyAuthorizedFogEnvelope(snapshot,{
  mode:'noop',mapId:map,deltaProtocolVersion:1,protocolVersion:2,
  revision:4,sequence:99,epoch:sessionId
 },map),null);
});
test('observer hide cannot expire or be released by an old RLS snapshot',()=>{
 const hidden={[tokenId]:{hidden:true,seq:10,fogRevision:4}};
 const rows=[{id:tokenId,map_id:map,owner_id:null,
  x:1,y:1,span_x:1,span_y:1,visible:true}];
 assert.equal(clearVerifiedHiddenTokens(hidden,rows,snapshot,viewer),hidden);
 assert.equal(clearVerifiedHiddenTokens(hidden,rows,{...snapshot,
  revision:5,displayVisibleDuringRefresh:[5,6]},viewer),hidden);
 assert.deepEqual(clearVerifiedHiddenTokens(hidden,[],{...snapshot,revision:5},viewer),{},
  'newer RLS omission may retire an invisible stale marker without granting sight');
 assert.equal(clearVerifiedHiddenTokens(hidden,rows,{...snapshot,
  revision:5,visible:[]},viewer),hidden);
 assert.deepEqual(clearVerifiedHiddenTokens(hidden,rows,
  {...snapshot,revision:5},viewer),{});
 assert.deepEqual(clearVerifiedHiddenTools(hidden,[{issue_id:tokenId,map_id:map}],
  {...snapshot,revision:5}),{});
});
test('stationary NPC can reappear only after a newer server-owned frame with a fresh RLS roster',()=>{
 const hidden={[tokenId]:{hidden:true,seq:20,fogRevision:4,
  fogEpoch:sessionId,fogSequence:1}};
 const rows=[{id:tokenId,map_id:map,owner_id:null,
  x:1,y:1,span_x:1,span_y:1,visible:true}];
 assert.equal(clearVerifiedHiddenTokens(hidden,rows,snapshot,viewer),hidden);
 assert.equal(clearVerifiedHiddenTokens(hidden,rows,{
  ...snapshot,sequence:2,visible:[]},viewer),hidden);
 assert.deepEqual(clearVerifiedHiddenTokens(hidden,rows,{
  ...snapshot,sequence:2},viewer),{});
 assert.equal(newerAuthorizedSight({...snapshot,epoch:viewer,sequence:4},
  hidden[tokenId]),false,'foreign epoch cannot revoke concealment');
 assert.equal(newerAuthorizedSight({...snapshot,sequence:0},hidden[tokenId]),false);
 assert.equal(newerAuthorizedSight({...snapshot,revision:3,sequence:3},
  hidden[tokenId]),false);
 assert.deepEqual(clearVerifiedHiddenTools(hidden,[{issue_id:tokenId,map_id:map}],
  {...snapshot,sequence:2}),{});
});
test('motion uses only authenticated begin/advance/end RPCs and never broadcasts',async()=>{
 const calls=[];
 const db={rpc:async(name,args)=>{
  calls.push([name,args]);
  return {data:name==='begin_map_motion_session'?
   {sessionId,mapId:map,kind:'token',pieceId:tokenId}:true,error:null};
 }};
 const transport=createAuthorizedMotionTransport({db});
 const params={p_map:map,p_kind:'token',p_piece:tokenId,
  p_x:1,p_y:2,p_seq:123,p_ignore_collision:false};
 assert.deepEqual(await transport.send({params}),{data:true,error:null});
 assert.deepEqual(await transport.send({params:{...params,p_x:3,p_seq:124}}),
  {data:true,error:null});
 await transport.end(map,[tokenId],[]);
 assert.deepEqual(calls.map(call=>call[0]),[
  'begin_map_motion_session','advance_map_motion_session',
  'advance_map_motion_session','end_map_motion_sessions'
 ]);
 assert.equal(transport.sessionCount,0);
 transport.dispose();
 assert.equal((await transport.send({params})).data,false);
});
test('failed session creation cannot silently fall back to untrusted preview',async()=>{
 const calls=[];
 const transport=createAuthorizedMotionTransport({db:{rpc:async(name)=>{
  calls.push(name);return {data:null,error:{message:'unauthorized'}}}}});
 const result=await transport.send({params:{
  p_map:map,p_kind:'token',p_piece:tokenId,p_x:1,p_y:1,p_seq:1
 }});
 assert.equal(result.data,false);
 assert.ok(result.error);
 assert.deepEqual(calls,['begin_map_motion_session']);
});
test('server functions retain collision and private authorization while excluding direct broadcasts',()=>{
 const sql=read('staging/sql-candidates/movement_sessions_and_visibility_delta.sql');
 const app=read('src/TabletopApp.jsx');
 const rollback=read('staging/sql-candidates/rollback_movement_sessions_and_visibility_delta.sql');
 for(const name of ['begin_map_motion_session','advance_map_motion_session',
  'end_map_motion_sessions','get_authorized_map_fog_delta'])
  assert.match(sql,new RegExp('function public\\.'+name+'\\('));
 assert.match(sql,/public\.can_view_campaign_map\(s\.campaign_id,s\.map_id\)/);
 assert.match(sql,/not public\.is_campaign_dm\(s\.campaign_id\)/);
 assert.match(sql,/forge_visibility\.swept_hits_segment/);
 assert.match(sql,/forge_visibility\.observer_path_status_cached/);
 assert.match(read('staging/sql-candidates/observer_path_cached_scene.sql'),/create or replace function forge_visibility\.observer_path_status_cached/i);
 assert.match(sql,/realtime\.send\(packet,'motion'/);
 assert.match(sql,/p_seq<=s\.last_seq/);
 assert.match(sql,/t\.updated_at is distinct from s\.base_updated_at/);
 assert.match(sql,/environment_revision/);
 assert.match(sql,/rules_updated_at/);
 assert.match(sql,/get_authorized_map_fog_v2\(p_map\)/);
 assert.match(sql,/old\.frame \? 'visible'/);
 assert.match(sql,/current_frame=old\.frame/);
 assert.match(sql,/create table if not exists forge_visibility\.viewer_fog_snapshots/);
 assert.match(sql,/revoke all on table forge_visibility\.viewer_fog_snapshots from public,anon,authenticated/);
 assert.match(app,/createAuthorizedMotionTransport/);
 assert.match(app,/transport\.send\(packet\)/);
 assert.doesNotMatch(app,/send:packet=>db\.rpc\('preview_map_motion'/);
 assert.match(rollback,/drop table if exists forge_visibility\.movement_sessions/);
 assert.match(rollback,/drop table if exists forge_visibility\.viewer_fog_snapshots/);
 assert.doesNotMatch(rollback,/drop (?:function|table) if exists public\.map_tokens/);
});

test('server reuse of published LOS scene retains all recipient privacy rules',()=>{
 const helper=read('staging/sql-candidates/observer_path_cached_scene.sql');
 const advance=read('staging/sql-candidates/movement_sessions_and_visibility_delta.sql');
 assert.match(helper,/function forge_visibility\.observer_path_status_cached\(/i);
 assert.match(helper,/from public\.campaign_members cm/);
 assert.match(helper,/cm\.campaign_id=p_campaign/);
 assert.match(helper,/pm\.campaign_id=p_campaign/);
 assert.doesNotMatch(helper,/cp_campaign|pp_campaign/);
 assert.match(helper,/coalesce\(assigned,active\)/);
 assert.match(helper,/ray_blocked\(scene/);
 assert.match(helper,/forge_visibility\.is_lit/);
 assert.match(helper,/if not old_visible then return 0/);
 assert.match(helper,/if p_steps>12 or not path_visible then return 2/);
 assert.match(helper,/from public,anon,authenticated/);
 assert.match(advance,/s\.scene/);
 assert.match(advance,/current_grid is distinct from s\.grid_size/);
 assert.match(advance,/forge_visibility\.observer_path_status_cached/);
 const rollback=read('staging/sql-candidates/rollback_movement_sessions_and_visibility_delta.sql');
 assert.match(rollback,/drop function if exists forge_visibility\.observer_path_status_cached/);
});

test('stress telemetry is bounded and contains timings only',()=>{
 let time=0;
 const metrics=createMovementDiagnostics({clock:()=>time,limit:3});
 for(const span of [30,10,100,20]){
  const stop=metrics.begin('movement-preview-rpc');
  time+=span;
  stop();
 }
 const snapshot=metrics.snapshot();
 assert.deepEqual(snapshot['movement-preview-rpc'],{
  samples:3,p50Ms:20,p95Ms:100,maxMs:100
 });
 assert.deepEqual(Object.keys(snapshot),['movement-preview-rpc']);
 metrics.clear();
 assert.deepEqual(metrics.snapshot(),{});
});

test('released movement SQL has runtime-valid aliases, step-count expression and matching hotfix migrations',()=>{
 const sql=read('staging/sql-candidates/movement_sessions_and_visibility_delta.sql');
 assert.match(sql,/from public\.map_tokens mt where mt\.id=s\.piece_id/);
 assert.match(sql,/from public\.campaign_tool_issues ti where ti\.id=s\.piece_id/);
 assert.match(sql,/steps:=pg_catalog\.ceil\(greatest\(/);
 assert.doesNotMatch(sql,/pg_catalog\.greatest\(/);
 assert.match(sql,/p_x<>s\.last_x or p_y<>s\.last_y/);
 for(const path of [
  'supabase/migrations/20261108112135_fix_motion_session_record_alias_20261108.sql',
  'supabase/migrations/20261108112252_guard_stationary_motion_collision_20261108.sql',
  'supabase/migrations/20261108112544_fix_motion_step_count_builtin_20261108.sql'])
  assert.match(read(path),/function public\.advance_map_motion_session/);
});
