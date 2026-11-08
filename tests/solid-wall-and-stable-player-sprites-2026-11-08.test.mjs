import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {traceSolidGroupOffset,sharedApprovedPath} from '../src/DragCollisionGuard.js';
import {stableTokenPresentation} from '../src/StableTokenPresentation.js';
import {createAuthorizedMotionTransport} from '../src/AuthorizedMotionTransport.js';
import {createLatestOnlyPreviewQueue} from '../src/ObserverPreviewQueue.js';

const src=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const map={id:'map',width:700,height:700,grid_size:70};
const wall={objects:[{id:'wall',type:'wall',points:[{x:2,y:0},{x:2,y:10}]}]};
const token={id:'unit',map_id:map.id,x:0,y:1,span_x:1,span_y:1,visible:true};
const uuid1='00000000-0000-4000-8000-000000000001';
const uuid2='00000000-0000-4000-8000-000000000002';
const uuid3='00000000-0000-4000-8000-000000000003';

test('DM solid walls stop sprites at the last accepted footprint on high speed pointer jumps',()=>{
 const accepted=traceSolidGroupOffset({pieces:[token],map,environment:wall,
  previous:{dx:0,dy:0},desired:{dx:6,dy:0}});
 assert.deepEqual(accepted,{dx:1,dy:0});
 assert.deepEqual(traceSolidGroupOffset({pieces:[token],map,environment:wall,
  previous:accepted,desired:{dx:6,dy:0}}),accepted);
 assert.deepEqual(traceSolidGroupOffset({pieces:[token],map,environment:wall,
  previous:accepted,desired:{dx:1,dy:3}}),{dx:1,dy:3},
  'sliding along the wall on the legal side is permitted');
});
test('mixed token and tool group stops if any footprint intersects a wall',()=>{
 const members=[token,{id:'other',x:0,y:4,span_x:1,span_y:1}];
 assert.deepEqual(traceSolidGroupOffset({pieces:members,map,environment:wall,
  previous:{dx:0,dy:0},desired:{dx:5,dy:0}}),{dx:1,dy:0});
});
test('only previously authorized RLS rows keep their sprite during fog refresh',()=>{
 const a={...token,id:'a'},b={...token,id:'b'},unseen={...token,id:'secret'};
 const first=stableTokenPresentation([a,b,unseen],[a,b],new Set(),map.id);
 assert.deepEqual(first.displayed.map(t=>t.id),['a','b']);
 const pending=stableTokenPresentation([a,b,unseen],[],first.seen,map.id);
 assert.deepEqual(pending.displayed.map(t=>t.id),['a','b']);
 assert.deepEqual([...pending.concealed],['a','b']);
 assert.ok(!pending.seen.has('secret'));
 const reauthorized=stableTokenPresentation([a,b,unseen],[b],pending.seen,map.id);
 assert.deepEqual([...reauthorized.concealed],['a']);
 assert.equal(reauthorized.displayed[1],b,'unchanged sprite retains React identity');
 const removedByRLS=stableTokenPresentation([b,unseen],[],reauthorized.seen,map.id);
 assert.deepEqual(removedByRLS.displayed.map(t=>t.id),['b']);
 assert.ok(!removedByRLS.seen.has('a'),'RLS removal does not retain stale entity');
});
test('a group commits only waypoints all members received as server grants',()=>{
 const members=[{x:0,y:0},{x:3,y:4}];
 const grants=[
  [{x:1,y:0},{x:1,y:1},{x:2,y:1}],
  [{x:4,y:4},{x:4,y:5},{x:5,y:5}]
 ];
 assert.deepEqual(sharedApprovedPath(members,grants),[
  {dx:1,dy:0},{dx:1,dy:1},{dx:2,dy:1}
 ]);
 assert.deepEqual(sharedApprovedPath(members,[grants[0],[
  {x:4,y:4},{x:4,y:5}
 ]]),[{dx:1,dy:0},{dx:1,dy:1}]);
 assert.deepEqual(sharedApprovedPath(members,[grants[0],[]]),[]);
 assert.deepEqual(sharedApprovedPath(members,[grants[0],[
  {x:8,y:8}
 ]]),[]);
});
test('rejected wall steps never become authorized client visual positions',async()=>{
 const calls=[];
 const db={rpc:async(name,payload)=>{
  calls.push([name,payload]);
  if(name==='begin_map_motion_session')return {
   data:{sessionId:uuid3,mapId:uuid1,kind:'token',pieceId:uuid2},error:null};
  return {data:payload.p_x<=1,error:null};
 }};
 const transport=createAuthorizedMotionTransport({db});
 const queue=createLatestOnlyPreviewQueue({send:packet=>transport.send(packet)});
 function enqueue(x,seq){
  queue.enqueue(uuid2,{kind:'token',params:{
   p_map:uuid1,p_kind:'token',p_piece:uuid2,p_x:x,p_y:0,p_seq:seq,
   p_ignore_collision:false
  }});
 }
 enqueue(1,1);
 await queue.drain(uuid2);
 assert.equal(transport.getApproved(uuid1,'token',uuid2)?.x,1);
 enqueue(4,2);
 await queue.drain(uuid2);
 assert.equal(transport.getApproved(uuid1,'token',uuid2)?.x,1,
  'rejected destination must never become approved');
 assert.deepEqual(transport.getApprovedPath(uuid1,'token',uuid2).map(x=>x.x),[1]);
 await transport.end(uuid1,[uuid2],[]);
 assert.equal(transport.getApproved(uuid1,'token',uuid2),null);
 queue.dispose();transport.dispose();
});
test('queue drain waits through the latest unsent sample without cancelling server results',async()=>{
 let resolveFirst,results=[];
 const queue=createLatestOnlyPreviewQueue({
  send:packet=>packet===1?new Promise(resolve=>{resolveFirst=resolve}):Promise.resolve(packet),
  onResult:(packet,value)=>results.push([packet,value])
 });
 queue.enqueue('a',1);
 await Promise.resolve();await Promise.resolve();
 queue.enqueue('a',2);
 const done=queue.drain('a');
 resolveFirst(1);
 await done;
 assert.deepEqual(results,[[1,1],[2,2]]);
 queue.dispose();
});
test('board never paints a raw player coordinate and never tears down artwork on fog revocation',()=>{
 const board=src('src/BattlemapBoard.jsx');
 const app=src('src/TabletopApp.jsx');
 const monitors=src('src/TokenMonitorFrames.jsx');
 assert.match(board,/if\(isDM\)for\(const token of info\.members\)/);
 assert.match(board,/traceSolidGroupOffset/);
 assert.match(board,/presentedTokens\.map\(t=>/);
 assert.match(board,/visibility:concealed\?'hidden':'visible'/);
 assert.match(board,/concealedIds=\{concealedIds\}/);
 assert.match(monitors,/visibility:concealed\?'hidden':'visible'/);
 assert.match(app,/await queue\.drain\(id\)/);
 assert.match(app,/transport\.getApprovedPath\(mapId,'token',id\)/);
 assert.match(app,/commit_map_trajectory/);
 assert.match(app,/if\(!isDM\)\{void commitServerApprovedPlayerMove\(token,x,y\);return\}/);
 assert.match(app,/if\(data!==true\)return/);
 assert.match(app,/remoteMotion\.current\?\.preview\(p_piece,p_x,p_y\)/);
});
