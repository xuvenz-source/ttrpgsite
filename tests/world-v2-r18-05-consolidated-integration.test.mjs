import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {createMovementController} from '../src/engine/v2/MovementController.js';
import {createWorldKeyboardStepper} from '../src/engine/v2/KeyboardStepper.js';
import {createWorldRealtimeTransport} from '../src/engine/v2/RealtimeTransport.js';
import {expandGestureRoute} from '../src/engine/v2/GesturePath.js';

const MAP='11111111-1111-4111-8111-111111111111';
const VIEWER='22222222-2222-4222-8222-222222222222';
const TOKEN='33333333-3333-4333-8333-333333333333';
const HIDDEN='44444444-4444-4444-8444-444444444444';
const SESSION='55555555-5555-4555-8555-555555555555';
const point=(x,y)=>({x,y});
const piece=(id,p)=>({kind:'token',id,x:p.x,y:p.y});
const packet=(seq,id,from,to)=>({
 version:2,mapId:MAP,viewerId:VIEWER,seq,
 environmentRevision:4,permissionGeneration:3,
 items:[{kind:'token',id,action:'path',path:[from,to]}]
});
const flush=()=>new Promise(resolve=>setImmediate(resolve));
const settle=async()=>{for(let i=0;i<7;i++)await flush()};
function blobSha(s){
 const data=Buffer.from(s,'utf8');
 return createHash('sha1').update(Buffer.from('blob '+data.length+'\0'))
  .update(data).digest('hex');
}

test('R18-05 consolidates EXACT R17 runtime files and keeps R18 recovery default-OFF',()=>{
 const frozen={
  'src/engine/v2/KeyboardStepper.js':'1951a5802b7ed6b15af080660bc8f88627c83d2c',
  'src/engine/v2/MovementController.js':'a88c26578a23d4da8d06263d04f2789248f1b942',
  'src/engine/v2/WorldV2Board.jsx':'ae0adfa7d02de9f0bbc75a0e1e8972ef860537cb'
 };
 // R18-15 is an explicit, tested amendment to the original R17
 // controller; do not rewrite or erase its historical reviewed checksum.
 // Any further edit requires a NEW work-package hash and test review.
 const approvedAmendment={
  path:'src/engine/v2/MovementController.js',
  originalR17:frozen['src/engine/v2/MovementController.js'],
  workPackage:'B10-R18-15',
  reviewedBlobSha:'0603e7b42ebd937a41e2a65e8b13089aa496dfba'
 };
 assert.equal(approvedAmendment.originalR17,
  'a88c26578a23d4da8d06263d04f2789248f1b942');
 assert.equal(approvedAmendment.workPackage,'B10-R18-15');
 // R18-31 is a separate minimal extraction ON TOP OF LIVE R18-24:
 // it retains the reviewed R18-15 controller, adds only delayed-Advance
 // queue ownership, and does NOT include unreleased R18-29/R18-30 SQL API.
 const approvedQueueAmendment={
  path:approvedAmendment.path,
  priorReviewedBlobSha:approvedAmendment.reviewedBlobSha,
  workPackage:'B10-R18-31-LIVE-QUEUE-ONLY',
  reviewedBlobSha:'347d3ac8cd9992027d5a67340ae45220cccd8da5'
 };
 assert.equal(approvedQueueAmendment.priorReviewedBlobSha,
  '0603e7b42ebd937a41e2a65e8b13089aa496dfba');
 assert.equal(approvedQueueAmendment.workPackage,'B10-R18-31-LIVE-QUEUE-ONLY');
 // R18-35 is a frontend-only amendment to the live R18-31 queue
 // controller: only a server-ACKed noMotion boolean is carried to render.
 // The R18-31 authority/Advance/Commit logic and prior checksum are kept.
 const approvedLiveNoMotionEvent={
  path:approvedQueueAmendment.path,
  priorReviewedBlobSha:approvedQueueAmendment.reviewedBlobSha,
  workPackage:'B10-R18-35-LIVE-NO-MOTION-EVENT',
  reviewedBlobSha:'48070f99f818bc7669f4fc0d6f64335129d6f9cc'
 };
 assert.equal(approvedLiveNoMotionEvent.priorReviewedBlobSha,
  '347d3ac8cd9992027d5a67340ae45220cccd8da5');
 // The keyboard source is transplanted byte-for-byte from the reviewed
 // R18-34 signed-sight change, not from the cumulative SQL staging branch.
 const approvedLiveKeyboardAmendment={
  path:'src/engine/v2/KeyboardStepper.js',
  originalR17:frozen['src/engine/v2/KeyboardStepper.js'],
  workPackage:'B10-R18-35-LIVE-SIGNED-SIGHT',
  reviewedBlobSha:'59b835fda26bfefe1eba0fce62a4a1b4b13b05d1'
 };
 assert.equal(approvedLiveKeyboardAmendment.originalR17,
  '1951a5802b7ed6b15af080660bc8f88627c83d2c');
 // R18-24 adds only a query-opted-in QA report button to the previously
 // frozen board. The two insertion sites were compared exactly to the
 // R18-23 source. Movement/visibility authority code is unchanged.
 const approvedQaAmendment={
  path:'src/engine/v2/WorldV2Board.jsx',
  originalR17:frozen['src/engine/v2/WorldV2Board.jsx'],
  workPackage:'B10-R18-24',
  reviewedBlobSha:'0a5131f054acb98afe5471e2a66cd78c29312f5e'
 };
 assert.equal(approvedQaAmendment.originalR17,
  'ae0adfa7d02de9f0bbc75a0e1e8972ef860537cb');
 assert.equal(approvedQaAmendment.workPackage,'B10-R18-24');
 for(const [path,sha] of Object.entries(frozen)){
  const checked=blobSha(readFileSync(new URL('../'+path,import.meta.url),'utf8'));
  assert.equal(checked,path===approvedLiveNoMotionEvent.path?
   approvedLiveNoMotionEvent.reviewedBlobSha:
   path===approvedQaAmendment.path?approvedQaAmendment.reviewedBlobSha:
   path===approvedLiveKeyboardAmendment.path?
   approvedLiveKeyboardAmendment.reviewedBlobSha:sha,
   'R17-reviewed source drifted without an exact audited amendment: '+path);
 }
 const runtime=readFileSync(new URL(
  '../src/engine/v2/WorldV2TabletopRuntime.js',import.meta.url),'utf8');
 assert.match(runtime,/VITE_WORLD_V2_OBSERVER_RECOVERY==='1'/);
 assert.match(runtime,/VITE_WORLD_V2_OBSERVER_GUARDED_RECOVERY==='1'/);
 assert.match(runtime,/guardedObserverEnabled=!dmPreview/);
 const ledger=JSON.parse(readFileSync(new URL(
  '../staging/next-release-ledger.json',import.meta.url)));
 for(const pr of [102,103,104,105,106]){
  assert.ok(ledger.branches.some(entry=>
   entry.linkedPullRequest===pr&&entry.status==='staged'),
   'Unreleased PR missing from combined release: '+pr);
 }
 assert.equal(ledger.features.find(x=>
  x.id==='world-v2-b10-r18-05-consolidated-release')?.releaseReady,false);
 assert.equal(ledger.upcomingRelease.databaseReleaseVersion,null);
});

test('R18-05 actual R17 controller plus R18 private observer accepts only server-approved steps, never hidden NPC',async()=>{
 let receiver,subscriber,cursor=0,canonical=point(1,1);
 let stepper,commit=null;const calls=[],movementEvents=[];
 const paths=[],revokes=[];
 const sight=()=>({version:2,mapId:MAP,viewerId:VIEWER,scope:'viewer',
  cursor,environmentRevision:4,permissionGeneration:3,
  visiblePieces:[piece(TOKEN,canonical)]});
 const channel={
  on(_type,filter,fn){if(filter.event==='world-motion-v2')receiver=fn;return this},
  subscribe(fn){subscriber=fn;return this}
 };
 const db={realtime:{setAuth:async()=>{}},
  channel:()=>channel,removeChannel:async()=>{}};
 const observer=createWorldRealtimeTransport({
  db,mapId:MAP,viewerId:VIEWER,softResyncEnabled:true,
  onResync:async()=>sight(),
  onPath:item=>paths.push(item),onRevoke:reason=>revokes.push(reason)
 });
 const authority={
  begin:async()=>({version:2,sessionId:SESSION}),
  advance:async req=>{
   calls.push(req);
   const full=expandGestureRoute(req.from,req.targets);
   const denied=full.findIndex(p=>p.x===3&&p.y===1);
   const accepted=denied>=0?full.slice(0,denied):full;
   if(accepted.length){
    const next=accepted.at(-1);
    cursor++;
    receiver({payload:packet(cursor,TOKEN,canonical,next)});
    canonical={...next};
   }
   return {version:2,sessionId:SESSION,seq:req.seq,
    blocked:denied>=0,accepted};
  },
  commit:async req=>{
   commit=req;
   return {version:2,sessionId:SESSION,seq:req.seq,endpoint:req.endpoint};
  },
  cancel:async()=>true
 };
 const controller=createMovementController({authority,onEvent:e=>{
  movementEvents.push(e);if(e.type==='blocked')stepper?.onBlocked(e)
 }});
 const runtime={active:true,sceneManager:{displayedScene:{revision:4}},
  visibility:{frame:{permissionGeneration:3}},movement:controller,
  refreshVisibility:async()=>true};
 stepper=createWorldKeyboardStepper({
  getRuntime:()=>runtime,
  makePick:()=>({mapId:MAP,origin:point(1,1),
   selection:[{kind:'token',id:TOKEN}],mode:'keyboard'}),
  setTimer:()=>1,clearTimer:()=>{}
 });
 try{
  await observer.start();subscriber('SUBSCRIBED');await settle();
  assert.equal(observer.locked,false);
  assert.equal(stepper.step(1,0),true);
  assert.equal(stepper.step(1,0),true);
  assert.equal(stepper.step(1,0),true);
  await settle();
  assert.ok(movementEvents.some(e=>e.type==='blocked'));
  assert.deepEqual(canonical,point(2,1));
  const before=calls.length;
  for(let n=0;n<16;n++)assert.equal(stepper.step(1,0),true);
  await settle();
  assert.equal(calls.length,before,'holding a denied crossing cannot issue more authority calls');
  assert.equal(stepper.step(0,1),true);
  await settle();
  assert.deepEqual(canonical,point(2,2));
  assert.equal(calls.length,before+1,'turn requires one authorized Advance');
  // Forged/private unknown token movement cannot be a roster grant.
  cursor++;
  receiver({payload:packet(cursor,HIDDEN,point(5,5),point(6,5))});
  await settle();
  assert.equal(observer.locked,false);
  assert.equal(observer.cursor,cursor);
  assert.equal(paths.length,2,'only canonical known-token steps were animated');
  assert.ok(paths.every(p=>p.id===TOKEN));
  assert.equal(revokes.filter(r=>r!=='subscribed').length,0,
   'same-generation reauthorization should avoid another blanket map seal');
  const result=await controller.endGesture();
  assert.equal(result.status,'committed');
  assert.deepEqual(commit.endpoint,canonical,
   'final actor commit and passive viewer canonical endpoint converge');
 }finally{stepper.dispose();controller.dispose();await observer.dispose()}
});
