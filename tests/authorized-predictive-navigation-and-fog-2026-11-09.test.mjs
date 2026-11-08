import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {NAV_DIRECTIONS,normalizeAuthorizedNavigation,navigationAllows,
 navigationRouteApproved,createAuthorizedNavigation,navigationAuthorizationKey} from '../src/AuthorizedNavigation.js';
import {traceAuthorizedGroupOffset} from '../src/DragCollisionGuard.js';
import {adoptVerifiedViewerTick} from '../src/AuthorizedViewerTick.js';
import {normalizeAuthorizedFogFrame} from '../src/MapFogModel.js';
import {movementDiagnostics} from '../src/MovementDiagnostics.js';
const source=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const map='00000000-0000-4000-8000-000000000001';
const owner='00000000-0000-4000-8000-000000000002';
const peer='00000000-0000-4000-8000-000000000003';
const epoch='00000000-0000-4000-8000-000000000004';
const grant=(piece=owner,nodes=[[0,0,5],[1,0,4],[0,1,1],[1,1,0]])=>({
 version:1,mapId:map,pieceId:piece,kind:'token',origin:[0,0],
 gridWidth:20,gridHeight:20,visibilityRevision:8,environmentRevision:5,
 permissionGeneration:3,collisionEnabled:true,footprint:[1,1],nodes
});

test('opaque navigation validates only direction bits, never hidden geometry',()=>{
 const safe=normalizeAuthorizedNavigation(grant(),map,'token',owner,100);
 assert.ok(safe);assert.equal(safe.nodes.get('0:0'),5);
 assert.equal(navigationAllows(safe,{x:0,y:0},{x:1,y:0}),true);
 assert.equal(navigationAllows(safe,{x:0,y:0},{x:0,y:1}),true);
 assert.equal(navigationAllows(safe,{x:0,y:0},{x:1,y:1}),false,
  'diagonals must be explicitly permitted by the server');
 assert.equal(navigationAllows(safe,{x:0,y:0},{x:3,y:0}),false,
  'graph grants are not teleport permissions');
 assert.equal(normalizeAuthorizedNavigation({...grant(),scene:{}},map,'token',owner),null);
 assert.equal(normalizeAuthorizedNavigation({...grant(),walls:[]},map,'token',owner),null);
 assert.equal(normalizeAuthorizedNavigation({...grant(),nodes:[[0,0,256]]},map,'token',owner),null);
 assert.equal(normalizeAuthorizedNavigation({...grant(),nodes:[[0,0,1],[0,0,1]]},map,'token',owner),null);
 assert.equal(NAV_DIRECTIONS.length,8);
});
test('a compressed route cannot shortcut around a wall or a corner',()=>{
 const safe=normalizeAuthorizedNavigation(grant(),map,'token',owner);
 assert.equal(navigationRouteApproved(safe,{x:0,y:0},[{dx:1,dy:0}]),true);
 assert.equal(navigationRouteApproved(safe,{x:0,y:0},[{dx:1,dy:1}]),false);
 assert.equal(navigationRouteApproved(safe,{x:0,y:0},[{dx:1,dy:0},{dx:1,dy:1}]),true);
 assert.equal(navigationRouteApproved(safe,{x:0,y:0},[{dx:4,dy:0}]),false);
});
test('multitoken movement stops together at unknown boundaries and slides along walls',()=>{
 const piece={kind:'token',id:owner,x:0,y:0};
 const canStep=(_piece,from,to)=>to.x<2&&to.x>=0&&to.y>=0&&
  Math.max(Math.abs(to.x-from.x),Math.abs(to.y-from.y))===1;
 const first=traceAuthorizedGroupOffset({
  pieces:[piece],previous:{dx:0,dy:0},desired:{dx:5,dy:3},canStep});
 assert.deepEqual({dx:first.dx,dy:first.dy},{dx:1,dy:3});
 assert.ok(first.path.some(point=>point.dx===1&&point.dy===3));
 const peerPiece={...piece,id:peer,y:3};
 const locked=traceAuthorizedGroupOffset({
  pieces:[piece,peerPiece],previous:{dx:0,dy:0},desired:{dx:5,dy:0},
  canStep:(p,from,to)=>p.id!==peer&&canStep(p,from,to)
 });
 assert.deepEqual({dx:locked.dx,dy:locked.dy},{dx:0,dy:0});
});
test('navigation never trusts a stale, mismatched, or expired server grant',async()=>{
 let tick=100,calls=0;
 const db={rpc:async()=>{calls++;return {data:grant(),error:null}}};
 const store=createAuthorizedNavigation({db,clock:()=>tick});
 store.setRevision(map,8);
 const [a,c]=await Promise.all([store.ensure(map,'token',owner),
  store.ensure(map,'token',owner)]);
 assert.ok(a);assert.equal(a,c);assert.equal(calls,1);
 assert.equal(store.allows(map,'token',owner,{x:0,y:0},{x:1,y:0}),true);
 store.setRevision(map,9);
 assert.equal(store.allows(map,'token',owner,{x:0,y:0},{x:1,y:0}),false);
 assert.equal(await store.ensure(map,'token',owner),null,'reject wrong viewer revision');
 store.setRevision(map,8);tick+=12001;
 assert.equal(store.allows(map,'token',owner,{x:0,y:0},{x:1,y:0}),false);
 store.dispose();
});
test('private Realtime fog tick changes exactly the authorized cell set',()=>{
 const previous={
  mapId:map,width:4,height:4,revision:8,enabled:true,partyShared:false,
  protocolVersion:2,deltaProtocolVersion:1,epoch,sequence:6,
  visible:[0,1,2],explored:[0,1,2]
 };
 const envelope={
  mode:'delta',deltaProtocolVersion:1,protocolVersion:2,mapId:map,
  width:4,height:4,revision:9,enabled:true,partyShared:false,
  epoch,sequence:7,baseRevision:8,baseSequence:6,
  visibleAdd:[3],visibleRemove:[2],exploredAdd:[3],exploredRemove:[]
 };
 const tick={map_id:map,user_id:owner,revision:9,fog_enforced:true,
  authorized_frame:envelope};
 const accepted=adoptVerifiedViewerTick(previous,tick,map,owner);
 assert.deepEqual(accepted.visible,[0,1,3]);
 assert.equal(adoptVerifiedViewerTick(previous,tick,map,peer),null);
 assert.equal(adoptVerifiedViewerTick(previous,{
  ...tick,authorized_frame:{...envelope,baseSequence:5}},map,owner),null);
 assert.equal(adoptVerifiedViewerTick(previous,{
  ...tick,authorized_frame:{...envelope,visibleAdd:[3,999]}},map,owner),null);
 assert.equal(adoptVerifiedViewerTick(previous,{
  ...tick,revision:10},map,owner),null);
});
test('stage has no raw wall leak, no per-step local RPC gate, and prepared SQL only',()=>{
 const board=source('src/BattlemapBoard.jsx');
 const app=source('src/TabletopApp.jsx');
 const fog=source('src/useAuthorizedMapFog.js');
 const navSql=source('supabase/migrations/20261109000100_authorized_predictive_navigation.sql');
 const visSql=source('supabase/migrations/20261109000200_private_verified_visibility_deltas.sql');
 assert.match(app,/commitPredictedPlayerMove/);
 assert.doesNotMatch(app,/await queue\.drain\(id\)/);
 assert.match(board,/traceAuthorizedGroupOffset/);
 assert.match(board,/motion\.current\?\.preview\(token\.id/);
 assert.match(navSql,/get_authorized_map_navigation/);
 assert.match(navSql,/get_authorized_map_fog_v2\(p_map\)/);
 assert.match(navSql,/forge_visibility\.swept_hits_segment/);
 assert.match(navSql,/blockers:=blockers\|\|ARRAY\[/);
 assert.match(navSql,/forge_visibility\.wall_passes/);
 assert.doesNotMatch(navSql,/PERFORM\s+forge_visibility\.validate_piece_trajectory/);
 assert.doesNotMatch(navSql,/RETURN[^;]*scene/i);
 assert.match(visSql,/authorized_frame jsonb/);
 assert.match(visSql,/authorized_viewer_fog_frame/i);
 assert.match(visSql,/revoke all on function forge_visibility\.authorized_viewer_fog_frame/i);
 assert.match(fog,/adoptVerifiedViewerTick/);
});

test('navigation cache keeps grants across harmless fog ticks, but not changing sight or walls',async()=>{
 movementDiagnostics.clear();
 let revision=8,environmentRevision=5,calls=0,tick=500;
 const db={rpc:async()=>{calls++;return {data:{
  ...grant(),visibilityRevision:revision,environmentRevision
 },error:null}}};
 const store=createAuthorizedNavigation({db,clock:()=>tick});
 const frame=(rev,env,visible=[0,1])=>({
  mapId:map,protocolVersion:2,epoch,width:20,height:20,revision:rev,
  enabled:true,collisionEnabled:true,partyShared:false,
  permissionGeneration:3,navigationEnvironmentRevision:env,visible
 });
 const authorize=(rev,env,visible)=>store.setRevision(map,rev,
  navigationAuthorizationKey(frame(rev,env,visible)),env,true);
 assert.equal(navigationAuthorizationKey(frame(8,5)),navigationAuthorizationKey(frame(9,5)));
 authorize(8,5);
 assert.ok(await store.ensure(map,'token',owner));
 assert.equal(calls,1);
 revision=9;authorize(9,5);
 assert.equal(store.hasGrant(map,'token',owner),true);
 assert.ok(await store.ensure(map,'token',owner));
 assert.equal(calls,1,'unchanged authorized cells do not re-fetch the expensive grant');
 environmentRevision=6;revision=10;authorize(10,6);
 assert.equal(store.hasGrant(map,'token',owner),false,'new scene revision revokes cached edges');
 assert.ok(await store.ensure(map,'token',owner));
 assert.equal(calls,2);
 revision=11;authorize(11,6,[0]);
 assert.equal(store.hasGrant(map,'token',owner),false,'sight changes revoke even without geometry changes');
 assert.ok(await store.ensure(map,'token',owner));
 assert.equal(calls,3);
 revision=12;authorize(12,6,[0]);tick+=12001;
 assert.equal(store.hasGrant(map,'token',owner),false,'TTL still expires');
 assert.ok(await store.ensure(map,'token',owner));
 assert.equal(calls,4);
 const counts=movementDiagnostics.snapshot().counts;
 assert.equal(counts.navigationGrantRequested,4);
 assert.ok(counts.navigationGrantCacheHit>=1);
 assert.ok(counts.navigationRevisionReused>=1);
 store.setRevision(map,13,null,6,true);
 assert.equal(store.hasGrant(map,'token',owner),false,'unverified frame revokes every grant');
 store.dispose();movementDiagnostics.clear();
});

test('new collision snapshot metadata reaches the client and rejects old scene grants',async()=>{
 const raw={
  mapId:map,width:4,height:4,revision:20,enabled:true,partyShared:false,
  collisionEnabled:true,permissionGeneration:3,navigationEnvironmentRevision:7,
  protocolVersion:2,visible:[0],explored:[0]
 };
 assert.equal(normalizeAuthorizedFogFrame(raw,map).navigationEnvironmentRevision,7);
 assert.equal(normalizeAuthorizedFogFrame({...raw,permissionGeneration:3,navigationEnvironmentRevision:-1},map),null);
 assert.equal(navigationAuthorizationKey(raw)!==null,true);
 assert.equal(navigationAuthorizationKey({...raw,permissionGeneration:3,navigationEnvironmentRevision:undefined}),null);
 const db={rpc:async()=>({data:{...grant(),visibilityRevision:20,
  environmentRevision:6},error:null})};
 const store=createAuthorizedNavigation({db});
 store.setRevision(map,20,navigationAuthorizationKey(raw),7,true);
 assert.equal(await store.ensure(map,'token',owner),null,'reject stale server scene even with current viewer rev');
 assert.equal(store.hasGrant(map,'token',owner),false);
 store.dispose();
});

test('in-flight navigation responses cannot resurrect a revoked authorization',async()=>{
 let resolve;
 const db={rpc:()=>new Promise(done=>{resolve=done})};
 const store=createAuthorizedNavigation({db});
 const key=(rev,visible)=>navigationAuthorizationKey({
  mapId:map,protocolVersion:2,width:20,height:20,revision:rev,
  enabled:true,collisionEnabled:true,partyShared:false,
  permissionGeneration:3,navigationEnvironmentRevision:5,visible
 });
 store.setRevision(map,8,key(8,[0,1]),5,true);
 const pending=store.ensure(map,'token',owner);
 store.setRevision(map,9,key(9,[0]),5,true);
 resolve({data:grant(),error:null});
 assert.equal(await pending,null);
 assert.equal(store.size,0);
 store.dispose();
});

test('committed coordinate changes re-center the cached grant rather than strand movement at an old edge',async()=>{
 let origin=0,calls=0;
 const db={rpc:async()=>{calls++;return {data:{
  ...grant(owner,[[0,0,1],[1,0,1],[2,0,0]]),origin:[origin,0]
 },error:null}}};
 const store=createAuthorizedNavigation({db});
 store.setRevision(map,8,navigationAuthorizationKey({
  mapId:map,protocolVersion:2,width:20,height:20,revision:8,
  enabled:true,collisionEnabled:true,partyShared:false,
  permissionGeneration:3,navigationEnvironmentRevision:5,visible:[0,1,2]
 }),5,true);
 assert.ok(await store.ensure(map,'token',owner,{x:0,y:0}));
 assert.equal(calls,1);
 assert.ok(await store.ensure(map,'token',owner,{x:0,y:0}));
 assert.equal(calls,1);
 origin=1;
 assert.ok(await store.ensure(map,'token',owner,{x:1,y:0}));
 assert.equal(calls,2,'new authoritative token origin must request a re-centered grant');
 assert.equal(store.routeApproved(map,'token',owner,{x:0,y:0},[{dx:1,dy:0}]),false,
  'old origin must never reuse the new graph');
 assert.equal(store.routeApproved(map,'token',owner,{x:1,y:0},[{dx:1,dy:0}]),true);
 store.dispose();
});

test('confirmed sight changes clip revoked edges without invalidating valid active movement',async()=>{
 let calls=0,serverRev=8;
 const db={rpc:async()=>{calls++;return {data:{
  ...grant(),visibilityRevision:serverRev
 },error:null}}};
 const store=createAuthorizedNavigation({db});
 const frame=(revision,visible=[0,1,20,21],environmentRevision=5)=>({
  mapId:map,protocolVersion:2,deltaProtocolVersion:1,epoch,sequence:revision,
  revision,width:20,height:20,enabled:true,partyShared:false,
  collisionEnabled:true,permissionGeneration:3,navigationEnvironmentRevision:environmentRevision,
  visible,explored:[0,1,2,20,21]
 });
 assert.equal(store.adoptFrame(map,frame(8)),true);
 const authority=store.authority(map);
 assert.ok(await store.ensure(map,'token',owner,{x:0,y:0}));
 assert.equal(store.allows(map,'token',owner,{x:0,y:0},{x:1,y:0}),true);
 serverRev=9;
 assert.equal(store.adoptFrame(map,frame(9,[0,1,2,20,21])),true);
 assert.equal(store.authority(map),authority);
 assert.equal(store.routeApproved(map,'token',owner,{x:0,y:0},[{dx:1,dy:0}]),true);
 assert.equal(store.allows(map,'token',owner,{x:0,y:0},{x:1,y:0}),true);
 assert.equal(calls,1,'sight expansion alone must not issue new navigation RPC');
 serverRev=10;
 assert.equal(store.adoptFrame(map,frame(10,[0,20,21])),true);
 assert.equal(store.authority(map),authority);
 assert.equal(store.hasGrant(map,'token',owner),true,'preserve approved graph as a clipped subset');
 assert.equal(store.allows(map,'token',owner,{x:0,y:0},{x:1,y:0}),false);
 assert.equal(store.allows(map,'token',owner,{x:0,y:0},{x:0,y:1}),true);
 assert.equal(store.routeApproved(map,'token',owner,{x:0,y:0},
  [{dx:1,dy:0}]),false,'revoked endpoint cannot be committed');
 assert.equal(store.routeApproved(map,'token',owner,{x:0,y:0},
  [{dx:1,dy:0},{dx:1,dy:1}]),true,
  'already authorized past legs may drop out of sight as a viewer moves');
 store.dispose();
});

test('doors, scene versions and pending fog revoke an active movement grant',async()=>{
 const db={rpc:async()=>({data:grant(),error:null})};
 const store=createAuthorizedNavigation({db});
 const frame=(revision,sceneRevision,collision=true)=>({
  mapId:map,protocolVersion:2,epoch,revision,
  width:20,height:20,enabled:true,partyShared:false,
  collisionEnabled:collision,permissionGeneration:3,navigationEnvironmentRevision:sceneRevision,
  visible:[0,1,20,21],explored:[0,1,20,21]
 });
 assert.equal(store.adoptFrame(map,frame(8,5)),true);
 assert.ok(await store.ensure(map,'token',owner,{x:0,y:0}));
 const before=store.authority(map);
 assert.equal(store.adoptFrame(map,frame(9,6)),true);
 assert.notEqual(store.authority(map),before,
  'published door or wall edit changes the authoritative scene version');
 assert.equal(store.hasGrant(map,'token',owner),false);
 assert.equal(store.adoptFrame(map,frame(10,6,false)),true);
 assert.equal(store.hasGrant(map,'token',owner),false);
 assert.equal(store.adoptFrame(map,{
  ...frame(11,6,false),visible:[],displayVisibleDuringRefresh:[0,1]
 }),false,'pending fog cannot mint or keep movement permission');
 assert.equal(store.authority(map),null);
 assert.equal(await store.ensure(map,'token',owner),null);
 store.dispose();
});

test('player role loss or RLS token removal evicts just that piece',async()=>{
 const mapFrame={mapId:map,protocolVersion:2,epoch,revision:8,
  width:20,height:20,enabled:true,partyShared:false,
  collisionEnabled:true,permissionGeneration:3,navigationEnvironmentRevision:5,
  visible:[0,1,20,21]};
 const db={rpc:async(_fn,args)=>({data:grant(args.p_piece),error:null})};
 const store=createAuthorizedNavigation({db});
 store.adoptFrame(map,mapFrame);
 assert.ok(await store.ensure(map,'token',owner,{x:0,y:0}));
 assert.ok(await store.ensure(map,'token',peer,{x:0,y:0}));
 assert.equal(store.size,2);
 store.retainPermitted(map,new Set([map+':token:'+owner]));
 assert.equal(store.hasGrant(map,'token',peer),false);
 assert.equal(store.hasGrant(map,'token',owner),true);
 store.dispose();
});

test('board cancels revoked live gestures and clears server previews without saving',()=>{
 const board=source('src/BattlemapBoard.jsx');
 const app=source('src/TabletopApp.jsx');
 assert.match(board,/useLayoutEffect\(\(\)=>\{[\s\S]*?navigation\.adoptFrame\(map\.id,fogFrame\)/);
 assert.match(board,/authority===gesture\.navigationAuthority/);
 assert.match(board,/navigation\.routeApproved/);
 assert.match(board,/navigation\.canOccupy/);
 assert.match(board,/drag\.current=null/);
 assert.match(board,/movementCancelHandler\.current\?\.\(/);
 assert.match(app,/onMovementCancel=\{\(\{mapId,tokenIds,toolIssueIds\}\)=>/);
 assert.match(app,/navigationStore\.retainPermitted/);
});

test('harmless sight tick during a navigation RPC cannot starve a smooth drag',async()=>{
 let deliver,calls=0;
 const db={rpc:()=>{calls++;return new Promise(resolve=>{deliver=resolve})}};
 const frame=(revision,visible)=>({mapId:map,protocolVersion:2,epoch,
  revision,width:20,height:20,enabled:true,partyShared:false,
  collisionEnabled:true,permissionGeneration:3,navigationEnvironmentRevision:5,visible});
 const store=createAuthorizedNavigation({db});
 store.adoptFrame(map,frame(8,[0,1,20,21]));
 const pending=store.ensure(map,'token',owner,{x:0,y:0,spanX:1,spanY:1});
 store.adoptFrame(map,frame(9,[0,20,21]));
 deliver({data:grant(),error:null});
 assert.ok(await pending,'old server-issued graph may survive same-scene revision');
 assert.equal(calls,1);
 assert.equal(store.allows(map,'token',owner,{x:0,y:0},{x:1,y:0}),false,
  'current sight still revokes the now forbidden edge');
 assert.equal(store.allows(map,'token',owner,{x:0,y:0},{x:0,y:1}),true);
 store.dispose();
});

test('changed creature footprint invalidates previously issued navigation',async()=>{
 let span=1,calls=0;
 const db={rpc:async()=>{calls++;return {data:{
  ...grant(),footprint:[span,span]
 },error:null}}};
 const store=createAuthorizedNavigation({db});
 const frame={mapId:map,protocolVersion:2,epoch,revision:8,
  width:20,height:20,enabled:true,partyShared:false,
  collisionEnabled:true,permissionGeneration:3,navigationEnvironmentRevision:5,
  visible:[0,1,20,21]};
 store.adoptFrame(map,frame);
 assert.ok(await store.ensure(map,'token',owner,{x:0,y:0,spanX:1,spanY:1}));
 span=2;
 assert.ok(await store.ensure(map,'token',owner,{x:0,y:0,spanX:2,spanY:2}));
 assert.equal(calls,2,'footprint changed without scene revision');
 assert.equal(store.allows(map,'token',owner,{x:0,y:0},{x:1,y:0}),false,
  'larger creature cannot enter a cell when any part of its footprint is unseen');
 store.dispose();
});

test('a server-issued generation change revokes navigation despite identical fog and scene',async()=>{
 let rev=8,generation=3,calls=0;
 const db={rpc:async()=>{calls++;return {data:{
  ...grant(),visibilityRevision:rev,permissionGeneration:generation
 },error:null}}};
 const store=createAuthorizedNavigation({db});
 const frame=(revision,permissionGeneration)=>({
  mapId:map,protocolVersion:2,epoch,revision,width:20,height:20,
  enabled:true,collisionEnabled:true,partyShared:false,
  navigationEnvironmentRevision:5,permissionGeneration,
  visible:[0,1,20,21]
 });
 assert.ok(store.adoptFrame(map,frame(8,3)));
 assert.ok(await store.ensure(map,'token',owner,{x:0,y:0}));
 assert.equal(store.hasGrant(map,'token',owner),true);
 const before=store.authority(map);
 rev=9;generation=4;
 assert.ok(store.adoptFrame(map,frame(9,4)));
 assert.notEqual(store.authority(map),before);
 assert.equal(store.hasGrant(map,'token',owner),false,
  'character value or tool attribute changes must revoke every cached edge');
 assert.equal(store.allows(map,'token',owner,{x:0,y:0},{x:1,y:0}),false);
 assert.ok(await store.ensure(map,'token',owner,{x:0,y:0}));
 assert.equal(calls,2,'only one replacement grant was fetched');
 store.dispose();
});

test('an in-flight graph from a prior permission generation cannot resurrect',async()=>{
 let deliver;
 const db={rpc:()=>new Promise(done=>{deliver=done})};
 const store=createAuthorizedNavigation({db});
 const frame=(revision,permissionGeneration)=>({
  mapId:map,protocolVersion:2,epoch,revision,width:20,height:20,
  enabled:true,collisionEnabled:true,partyShared:false,
  navigationEnvironmentRevision:5,permissionGeneration,
  visible:[0,1,20,21]
 });
 store.adoptFrame(map,frame(8,3));
 const pending=store.ensure(map,'token',owner,{x:0,y:0});
 store.adoptFrame(map,frame(9,4));
 deliver({data:grant(),error:null});
 assert.equal(await pending,null);
 assert.equal(store.size,0);
 store.dispose();
});

test('navigation permission protocol contains only opaque generations and origin-connected edges',()=>{
 const navSql=source('supabase/migrations/20261109000100_authorized_predictive_navigation.sql');
 const privateSql=source('supabase/migrations/20261109000200_private_verified_visibility_deltas.sql');
 const deltaSql=source('supabase/migrations/20261109000300_navigation_scene_revisions.sql');
 assert.match(navSql,/CREATE TABLE IF NOT EXISTS forge_visibility\.navigation_permission_generations/);
 assert.match(navSql,/REVOKE ALL ON TABLE forge_visibility\.navigation_permission_generations/i);
 assert.match(navSql,/tick_character_elevation/);
 assert.match(navSql,/tick_navigation_token_permissions/);
 assert.match(navSql,/tick_navigation_tool_permissions/);
 assert.match(navSql,/candidate_masks\s*\?\s*origin_key/);
 assert.match(navSql,/reachable\s*\?\s*neighbour_key/);
 assert.match(navSql,/IF reachable\s*\?\s*\(\(node->>0\)/);
 assert.match(navSql,/'permissionGeneration',permission_generation/);
 assert.match(privateSql,/'permissionGeneration',current_frame->'permissionGeneration'/);
 assert.match(deltaSql,/'permissionGeneration',current_frame->'permissionGeneration'/);
 assert.doesNotMatch(navSql,/p_origin\s+|p_x\s+|p_y\s+/i);
 const safe=normalizeAuthorizedNavigation(grant(),map,'token',owner);
 assert.ok(safe);
 assert.equal(safe.permissionGeneration,3);
 assert.equal(normalizeAuthorizedNavigation({
  ...grant(),secretRoomLocation:'hidden'
 },map,'token',owner),null);
 assert.equal(normalizeAuthorizedNavigation({
  ...grant(),permissionGeneration:'3'
 },map,'token',owner),null);
 const noGeneration={...grant()};
 delete noGeneration.permissionGeneration;
 assert.equal(normalizeAuthorizedNavigation(noGeneration,map,'token',owner),null);
});
