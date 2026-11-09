import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {validVerifiedObserverPath,appendVerifiedObserverPoints}
 from '../src/VerifiedObserverPath.js';
import {validObserverMovementPacket,acceptObserverMovementPacket}
 from '../src/ObserverMovement.js';
import {createTokenMotionRuntime} from '../src/TokenMotionRuntime.js';
const source=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const map='10000000-0000-4000-8000-000000000001';
const viewer='10000000-0000-4000-8000-000000000002';
const actor='10000000-0000-4000-8000-000000000003';
const id='10000000-0000-4000-8000-000000000004';
const path=[{x:1,y:1},{x:2,y:1},{x:2,y:2},{x:3,y:2}];
const packet={kind:'token',action:'path',mapId:map,id,actor,
 seq:1780000000000002,path};

test('verified remote path rejects gaps, hidden coordinates, forged actors and oversized buffers',()=>{
 assert.equal(validVerifiedObserverPath(path),true);
 assert.equal(validVerifiedObserverPath([{x:1,y:1},{x:3,y:1}]),false);
 assert.equal(validVerifiedObserverPath([{x:1,y:1},{x:1,y:1}]),false);
 assert.equal(validVerifiedObserverPath([...path.slice(0,2),{x:2,y:1,privateWall:true}]),false);
 assert.equal(validVerifiedObserverPath(new Array(50).fill({x:1,y:1})),false);
 assert.equal(validObserverMovementPacket(packet,map,viewer),true);
 assert.equal(validObserverMovementPacket({...packet,actor:viewer},map,viewer),false);
 assert.equal(validObserverMovementPacket({...packet,x:2},map,viewer),false);
 assert.equal(validObserverMovementPacket({...packet,path:[path[0],path[3]]},map,viewer),false);
 assert.equal(appendVerifiedObserverPoints(path,[path[3],{x:4,y:2}]).length,5);
 assert.equal(appendVerifiedObserverPoints(path,[{x:5,y:5},{x:6,y:5}]),null);
 const seq=new Map();
 assert.equal(acceptObserverMovementPacket(packet,seq),true);
 assert.equal(acceptObserverMovementPacket(packet,seq),false);
});
test('remote renderer follows every accepted corner without endpoint shortcuts',()=>{
 let now=0;const frames=[];
 const motion=createTokenMotionRuntime({
  clock:()=>now,observerStepMs:24,
  requestFrame:fn=>{frames.push(fn);return frames.length},
  cancelFrame:()=>{},setTimer:()=>1,clearTimer:()=>{}
 });
 const sprite={style:{}},monitor={style:{}},light={style:{}};
 motion.bind(id,'sprite',sprite,{x:1,y:1,cell:70});
 motion.bind(id,'monitor',monitor,{x:1,y:1,cell:70});
 motion.bind(id,'light:'+id,light,{x:1,y:1,cell:70});
 assert.equal(motion.previewRemotePath(id,path),true);
 const flush=()=>{
  const pending=frames.splice(0);
  for(const callback of pending)callback();
 };
 now=12;flush();
 assert.deepEqual([motion.getPreview(id).x,motion.getPreview(id).y],[1.375,1]);
 assert.equal(sprite.style.translate,monitor.style.translate);
 assert.equal(sprite.style.translate,light.style.translate);
 assert.equal(sprite.style.transition,'');
 now=24;flush();
 assert.deepEqual([motion.getPreview(id).x,motion.getPreview(id).y],[1.75,1]);
 now=36;flush();
 assert.deepEqual([motion.getPreview(id).x,motion.getPreview(id).y],[2,1]);
 assert.equal(motion.previewRemotePath(id,[{x:3,y:2},{x:4,y:2}]),true);
 now=48;flush();
 now=72;flush();
 now=96;flush();
 now=120;flush();
 now=144;flush();
 now=168;flush();
 assert.deepEqual([motion.getPreview(id).x,motion.getPreview(id).y],[4,2]);
 assert.equal(motion.previewRemotePath(id,[{x:7,y:7},{x:8,y:7}]),false);
 motion.clearPreview(id);
 assert.equal(motion.getPreview(id),null);
 motion.dispose();
});
test('canonical handoff never aborts a verified remote turn halfway',()=>{
 let now=0;const frames=[];
 const motion=createTokenMotionRuntime({
  clock:()=>now,observerStepMs:20,
  requestFrame:fn=>{frames.push(fn);return frames.length},cancelFrame:()=>{}
 });
 const sprite={style:{}};
 motion.bind('piece','sprite',sprite,{x:0,y:0,cell:30});
 assert.equal(motion.previewRemotePath('piece',[
  {x:0,y:0},{x:1,y:0},{x:1,y:1}]),true);
 const flush=()=>{for(const fn of frames.splice(0))fn()};
 now=10;flush();
 assert.equal(motion.handoffRemote('piece'),true);
 now=20;flush();now=40;flush();now=60;flush();now=80;flush();now=100;flush();
 assert.equal(motion.getPreview('piece')?.x,1);
 motion.bind('piece','sprite',sprite,{x:1,y:1,cell:30});
 assert.equal(motion.reconcile('piece',1,1),true);
 motion.dispose();
});
test('server only broadcasts path after per-viewer LOS check; fog is per-batch',()=>{
 const server=source('supabase/migrations/20261109000600_batched_motion_observer_visibility.sql');
 const batch=source('supabase/migrations/20261109000500_batched_concealed_navigation.sql');
 const app=source('src/TabletopApp.jsx');
 const board=source('src/BattlemapBoard.jsx');
 const tools=source('src/CampaignToolMapLayer.jsx');
 assert.match(server,/observer_verified_path_status/);
 assert.match(server,/WITH sources AS MATERIALIZED/);
 assert.match(server,/IF NOT first_visible THEN RETURN 0/);
 assert.match(server,/IF NOT entirely_visible THEN RETURN 2/);
 assert.match(server,/realtime\.send\(jsonb_build_object/);
 assert.match(server,/'action','path','path',route/);
 assert.match(server,/bump_viewer_ticks\(s\.map_id,NULL\)/);
 assert.match(server,/REVOKE ALL ON FUNCTION forge_visibility\.publish_approved_navigation_batch/);
 assert.match(batch,/refresh_fog:=used>0 AND/);
 assert.match(batch,/publish_approved_navigation_batch/);
 assert.match(board,/if\(info\.secureMode\)return;/);
 assert.match(app,/previewRemotePath\(visualId,payload\.path\)/);
 assert.match(app,/payload\.action!=='path'/);
 assert.match(tools,/motionRef\(carrier\?\.id\|\|'tool:'/);
});

test('local authorized batches animate a straight corridor without skipping a signed turn',()=>{
 let now=0;const frames=[];
 const motion=createTokenMotionRuntime({clock:()=>now,
  requestFrame:fn=>{frames.push(fn);return frames.length},cancelFrame:()=>{}});
 const sprite={style:{}};
 motion.bind('self','sprite',sprite,{x:0,y:0,cell:60});
 const path=[{x:0,y:0},{x:1,y:0},{x:2,y:0},{x:2,y:1},{x:2,y:2}];
 assert.equal(motion.previewAuthorizedPath('self',path),true);
 const flush=()=>{for(const fn of frames.splice(0))fn()};
 now=15;flush();
 const first=motion.getPreview('self');
 assert.ok(first.x>0&&first.x<2);
 assert.equal(first.y,0,'must not cut directly from origin to last corner');
 now=80;flush();
 assert.equal(motion.getPreview('self').x,2);
 now=100;flush();
 assert.ok(motion.getPreview('self').y>0);
 motion.handoff('self');
 now=200;flush();now=225;flush();
 motion.bind('self','sprite',sprite,{x:2,y:2,cell:60});
 assert.equal(motion.reconcile('self',2,2),true);
 motion.dispose();
});
