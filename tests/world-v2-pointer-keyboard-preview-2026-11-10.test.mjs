import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {pickAuthorizedWorldPiece} from '../src/engine/v2/PointerHitTest.js';
import {createWorldKeyboardStepper} from '../src/engine/v2/KeyboardStepper.js';

const MAP='11111111-1111-4111-8111-111111111111';
const DM='22222222-2222-4222-8222-222222222222';
const PLAYER='44444444-4444-4444-8444-444444444444';
const TOKEN='33333333-3333-4333-8333-333333333333';
const SECRET='55555555-5555-4555-8555-555555555555';
const TOOL='66666666-6666-4666-8666-666666666666';
const token={id:TOKEN,map_id:MAP,owner_id:PLAYER,visible:true,span_x:2,span_y:1};
const other={id:SECRET,map_id:MAP,owner_id:DM,visible:true,span_x:1,span_y:1};
const part=(kind,id,x,y)=>({kind,id,x,y});

test('sprite-free pointer hit test selects only an authorized, controllable token',()=>{
 const input={point:{x:3.5,y:2.2},mapId:MAP,user:PLAYER,isDM:false,
  visiblePieces:[part('token',TOKEN,2,2)],
  tokens:[token,other]};
 assert.deepEqual(pickAuthorizedWorldPiece(input),{kind:'token',id:TOKEN});
 assert.equal(pickAuthorizedWorldPiece({...input,visiblePieces:[
  part('token',SECRET,3,2)]}),null,
  'an unauthorized hit must not disclose a hidden token');
 assert.equal(pickAuthorizedWorldPiece({...input,user:DM,isDM:true,
  visiblePieces:[part('token',SECRET,3,2)]})?.id,SECRET);
 assert.equal(pickAuthorizedWorldPiece({...input,point:{x:4.1,y:2.2}}),null,
  'coordinates outside the token footprint cannot select it');
});

test('pointer fallback checks held tools, ownership and authorization',()=>{
 const input={point:{x:4.2,y:4.2},mapId:MAP,user:PLAYER,
  visiblePieces:[part('tool',TOOL,4,4)],
  toolPlacements:[{issue_id:TOOL,map_id:MAP,span:1}],
  toolIssued:[{id:TOOL,owner_id:PLAYER,party_shared:false}]};
 // Tool controllability is determined by the existing issued-tool rules;
 // DM is always entitled to pick an authorized placed tool.
 assert.deepEqual(pickAuthorizedWorldPiece({...input,user:DM,isDM:true}),
  {kind:'tool',id:TOOL});
 assert.equal(pickAuthorizedWorldPiece({...input,user:DM,isDM:true,
  toolPlacements:[{issue_id:TOOL,map_id:MAP,span:1,held_by_token_id:TOKEN}]}),null);
 assert.equal(pickAuthorizedWorldPiece({...input,user:DM,isDM:true,
  visiblePieces:[]}),null);
});

function harness(mode='keyboard'){
 let onTimer=null,finishResolve=null,active=false,commits=0,updates=[];
 let canonicalOrigin={x:1,y:1};
 const scene={revision:4},frame={permissionGeneration:2};
 const runtime={
  active:true,sceneManager:{displayedScene:scene},
  visibility:{frame},refreshVisibility:async()=>true,
  movement:{
   get active(){return active},
   beginGesture(req){assert.equal(req.mode,mode);active=true;return true},
   updateGesture(point){updates.push({...point});return true},
   endGesture(){commits++;return new Promise(resolve=>{finishResolve=()=>{
    active=false;canonicalOrigin={...(updates.at(-1)||canonicalOrigin)};
    resolve({status:'committed',endpoint:{...canonicalOrigin}})}})},
   cancelGesture(){active=false}
  }
 };
 const stepper=createWorldKeyboardStepper({
  getRuntime:()=>runtime,
  makePick:()=>({mapId:MAP,origin:{...canonicalOrigin},
   selection:[{kind:'token',id:TOKEN}],mode}),
  setTimer:fn=>{onTimer=fn;return 1},
  clearTimer:()=>{onTimer=null}
 });
 return {stepper,runtime,updates,
  fireTimer(){const fn=onTimer;onTimer=null;assert.ok(fn);fn()},
  finishCommit(){const fn=finishResolve;finishResolve=null;assert.ok(fn);fn()},
  get commits(){return commits}};
}
const tick=()=>new Promise(resolve=>setImmediate(resolve));

test('rapid arrows remain in one movement gesture before release',()=>{
 const h=harness();
 assert.equal(h.stepper.step(1,0),true);
 assert.equal(h.stepper.step(1,0),true);
 assert.equal(h.stepper.step(0,1),true);
 assert.deepEqual(h.updates,[{x:2,y:1},{x:3,y:1},{x:3,y:2}]);
 assert.equal(h.stepper.step(0,0,{release:true}),true);
 h.fireTimer();
 assert.equal(h.commits,1);
 h.finishCommit();h.stepper.dispose();
});

test('arrow press while previous commit finishes is buffered, not dropped',async()=>{
 const h=harness();
 h.stepper.step(1,0);
 h.stepper.step(0,0,{release:true});h.fireTimer();
 assert.equal(h.stepper.step(0,1),true);
 assert.equal(h.stepper.queueLength,1);
 h.finishCommit();
 await tick();await tick();
 assert.deepEqual(h.updates.at(-1),{x:2,y:2},
  'queued key begins from refreshed canonical endpoint, not stale origin');
 assert.equal(h.stepper.queueLength,0);
 h.stepper.dispose();
});

test('DM player-preview arrows use the same buffered gesture with preview mode',async()=>{
 const h=harness('preview');
 assert.equal(h.stepper.step(1,0),true);
 assert.equal(h.stepper.step(1,0),true);
 assert.equal(h.stepper.step(0,0,{release:true}),true);
 h.fireTimer();h.finishCommit();
 await tick();h.stepper.dispose();
 assert.deepEqual(h.updates,[{x:2,y:1},{x:3,y:1}]);
});

test('V2 app routes preview arrows before legacy simulated shortcut and no V2 throttle',()=>{
 const app=readFileSync(new URL('../src/TabletopApp.jsx',import.meta.url),'utf8');
 const board=readFileSync(new URL('../src/engine/v2/WorldV2Board.jsx',import.meta.url),'utf8');
 assert.match(app,/if\(WORLD_V2_CUTOVER\)v2StepHandler\.current\?\.\(delta\[0\],delta\[1\]\);\s*else if\(simulated\)/);
 assert.match(app,/if\(!WORLD_V2_CUTOVER&&\s*e\.repeat/);
 assert.match(board,/pickWorldPointerTarget\(/);
 assert.match(board,/createWorldKeyboardStepper\(/);
 assert.match(board,/selection:\[\{kind:'token',id:actor\.id\}\],mode:'preview'/);
 assert.match(board,/onSelect=\{selectVisiblePiece\}/);
});
