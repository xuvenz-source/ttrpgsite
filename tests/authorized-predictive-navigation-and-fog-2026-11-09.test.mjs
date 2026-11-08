import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {NAV_DIRECTIONS,normalizeAuthorizedNavigation,navigationAllows,
 navigationRouteApproved,createAuthorizedNavigation} from '../src/AuthorizedNavigation.js';
import {traceAuthorizedGroupOffset} from '../src/DragCollisionGuard.js';
import {adoptVerifiedViewerTick} from '../src/AuthorizedViewerTick.js';
const source=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const map='00000000-0000-4000-8000-000000000001';
const owner='00000000-0000-4000-8000-000000000002';
const peer='00000000-0000-4000-8000-000000000003';
const epoch='00000000-0000-4000-8000-000000000004';
const grant=(piece=owner,nodes=[[0,0,5],[1,0,4],[0,1,1],[1,1,0]])=>({
 version:1,mapId:map,pieceId:piece,kind:'token',origin:[0,0],
 gridWidth:20,gridHeight:20,visibilityRevision:8,environmentRevision:5,
 collisionEnabled:true,nodes
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
 assert.match(navSql,/validate_piece_trajectory/);
 assert.doesNotMatch(navSql,/RETURN[^;]*scene/i);
 assert.match(visSql,/authorized_frame jsonb/);
 assert.match(visSql,/authorized_viewer_fog_frame/i);
 assert.match(visSql,/revoke all on function forge_visibility\.authorized_viewer_fog_frame/);
 assert.match(fog,/adoptVerifiedViewerTick/);
});
