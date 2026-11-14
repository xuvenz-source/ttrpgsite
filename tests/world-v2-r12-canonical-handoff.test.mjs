import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createCanonicalCommitHandoff} from '../src/engine/v2/CanonicalCommitHandoff.js';
import {createWorldV2Trace} from '../src/engine/v2/WorldTrace.js';
import {createMovementController} from '../src/engine/v2/MovementController.js';
const MAP='11111111-1111-4111-8111-111111111111';
const OTHER_MAP='11111111-1111-4111-8111-222222222222';
const PLAYER='22222222-2222-4222-8222-222222222222';
const OTHER='22222222-2222-4222-8222-333333333333';
const TOKEN='33333333-3333-4333-8333-333333333333';
const OTHER_TOKEN='33333333-3333-4333-8333-444444444444';
const piece={kind:'token',id:TOKEN};
const origin={x:2,y:2},endpoint={x:3,y:2};
let clock=100;
const context=(extra={})=>({mapId:MAP,viewerId:PLAYER,
 selection:[piece],environmentRevision:7,permissionGeneration:4,
 sceneGeneration:2,signedOrigin:origin,...extra});
const newHandoff=()=>createCanonicalCommitHandoff({now:()=>clock,maxAgeMs:3000});
test('R12 immediate next origin derives ONLY from acknowledged commit for same identity',()=>{
 clock=100;
 const h=newHandoff();
 assert.equal(h.remember({...context(),endpoint}),true);
 assert.deepEqual(h.resolve(context()),endpoint);
 assert.equal(h.pending,true);
 const old={...origin};
 assert.deepEqual(h.resolve({...context(),signedOrigin:old}),endpoint);
 assert.deepEqual(old,origin,'never mutate signed sight object');
 assert.equal(h.observe({...context(),visiblePieces:[{...piece,...origin}]}),true);
 assert.deepEqual(h.resolve(context()),endpoint);
 assert.equal(h.observe({...context(),visiblePieces:[{...piece,...endpoint}]}),false);
 assert.equal(h.pending,false);
 assert.deepEqual(h.resolve({...context(),signedOrigin:endpoint}),endpoint);
});
test('R12 refuses cross-user, map, selection, permission and scene handoffs',()=>{
 for(const override of [
  {viewerId:OTHER},{mapId:OTHER_MAP},
  {selection:[{kind:'token',id:OTHER_TOKEN}]},
  {permissionGeneration:5},{environmentRevision:8},{sceneGeneration:3},
  {selection:[piece,{kind:'token',id:OTHER_TOKEN}]}
 ]){
  clock=100;const h=newHandoff();
  assert.equal(h.remember({...context(),endpoint}),true);
  assert.deepEqual(h.resolve(context(override)),origin);
  assert.equal(h.pending,false);
 }
});
test('R12 expires, clears on revoked/disappeared actor or conflicting authoritative sight',()=>{
 clock=100;const h=newHandoff();
 h.remember({...context(),endpoint});
 clock=3101;
 assert.deepEqual(h.resolve(context()),origin);
 assert.equal(h.pending,false);
 clock=100;h.remember({...context(),endpoint});
 assert.equal(h.observe({...context(),visiblePieces:[]}),false);
 assert.equal(h.pending,false);
 h.remember({...context(),endpoint});
 assert.equal(h.observe({...context(),visiblePieces:[{...piece,x:5,y:3}]}),false);
 assert.deepEqual(h.resolve(context()),origin);
 h.remember({...context(),endpoint});h.clear();
 assert.deepEqual(h.resolve(context()),origin);
});
test('R12 signed canonical position never overridden by handoff',()=>{
 clock=100;const h=newHandoff();
 h.remember({...context(),endpoint});
 assert.deepEqual(h.resolve(context({signedOrigin:endpoint})),endpoint);
 assert.equal(h.pending,false);
 h.remember({...context(),endpoint});
 assert.deepEqual(h.resolve(context({signedOrigin:{x:9,y:9}})),{x:9,y:9});
 assert.equal(h.pending,false);
});
test('R12 rejects malformed or duplicate-selection commit metadata',()=>{
 clock=100;const h=newHandoff();
 assert.equal(h.remember({...context(),endpoint:{x:3.4,y:2}}),false);
 assert.equal(h.remember({...context(),selection:[piece,piece],endpoint}),false);
 assert.equal(h.remember({...context(),mapId:'not-uuid',endpoint}),false);
 assert.equal(h.remember({...context(),signedOrigin:endpoint,endpoint}),false);
 assert.deepEqual(h.resolve(context()),origin);
});
test('R12 traces a bounded cancellation reason without exposing private backend data',()=>{
 const trace=createWorldV2Trace({enabled:true});
 const auth={begin:async()=>new Promise(()=>{}),advance:async()=>{},
  commit:async()=>{},cancel:async()=>true};
 const controller=createMovementController({authority:auth,trace});
 const request={mapId:MAP,selection:[piece],origin,pointer:origin,
  mode:'keyboard',environmentRevision:7,permissionGeneration:4};
 assert.equal(controller.beginGesture(request),true);
 assert.equal(controller.cancelGesture('keyboard-unmount'),true);
 assert.ok(trace.snapshot().events.some(e=>
  e.event==='movement.cancel-reason'&&e.detail==='keyboard-unmount'));
 trace.event('movement.cancel-reason','secret map coord: 300,444');
 assert.equal(trace.snapshot().events.at(-1).detail,'other');
 controller.dispose();
});
test('R12 runtime and renderer wiring preserves locked signed-sight and original roles',()=>{
 const runtime=readFileSync(new URL('../src/engine/v2/WorldV2TabletopRuntime.js',import.meta.url),'utf8');
 const board=readFileSync(new URL('../src/engine/v2/WorldV2Board.jsx',import.meta.url),'utf8');
 const renderer=readFileSync(new URL('../src/engine/v2/WorldRenderer.js',import.meta.url),'utf8');
 assert.match(runtime,/canonicalHandoff\.observe\(snapshot\)/);
 assert.match(runtime,/canonicalHandoff\.clear\(\)/);
 // R18-35 retains the R12 signed canonical handoff only for REAL motion;
 // a server-ACKed zero-motion collision cannot create a fictitious handoff.
 assert.match(runtime,/event\.type==='committed'&&!event\.noMotion&&\s*!dmPreview&&painted===true&&authorized\(\)/);
 assert.match(runtime,/event\.type==='committed'&&!dmPreview&&!event\.noMotion/);
 assert.match(board,/runtimeRef\.current\?\.canonicalGestureOrigin/);
 assert.match(renderer,/const carry=local\?\.handoff&&same\(local\.approved,event\.approved\)/);
 assert.match(renderer,/const prior=carry\?\.anchors\.get\(key\(p\)\)/);
 assert.match(runtime,/if\(!dmPreview\)stream=createWorldRealtimeTransport/);
 assert.doesNotMatch(runtime,/rpc\('set_any_token_position'/);
});
