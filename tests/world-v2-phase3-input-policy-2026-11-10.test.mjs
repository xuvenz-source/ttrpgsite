import test from 'node:test';
import assert from 'node:assert/strict';
import {pickWorldPointerTarget,isWorldPointerTargetBlocked,
 worldMovementInputAllowed} from '../src/engine/v2/PointerHitTest.js';
import {claimWorldPointerDown,wasWorldPointerDownClaimed}
 from '../src/engine/v2/WorldPointerOwnership.js';
import {createInputController} from '../src/engine/v2/InputController.js';

const MAP='10000000-0000-4000-8000-000000000001';
const USER='30000000-0000-4000-8000-000000000001';
const DM='30000000-0000-4000-8000-000000000002';
const TOKEN='40000000-0000-4000-8000-000000000001';
const OTHER='40000000-0000-4000-8000-000000000002';
const TOOL='50000000-0000-4000-8000-000000000001';
const roster=[{kind:'token',id:TOKEN,x:2,y:2}];
const data={visiblePieces:roster,tokens:[
 {id:TOKEN,map_id:MAP,owner_id:USER,visible:true,span_x:2,span_y:1},
 {id:OTHER,map_id:MAP,owner_id:DM,visible:true,span_x:1,span_y:1}
],toolPlacements:[{issue_id:TOOL,map_id:MAP,span:1}],
 toolIssued:[{id:TOOL,owner_id:USER,party_shared:false}],
 mapId:MAP,user:USER,isDM:false};
function target(node={},options={}){
 return {closest:selector=>{
  if(selector==='[data-world-kind][data-world-id]')
   return options.sprite??null;
  if(selector==='button')return options.button??null;
  if(options.block&&selector.includes(options.block))return node;
  return null;
 }};
}
test('native capture and React synthetic event share one pointer claim',()=>{
 const native={pointerId:7},react={nativeEvent:native};
 assert.equal(wasWorldPointerDownClaimed(native),false);
 assert.equal(claimWorldPointerDown(native),true);
 assert.equal(wasWorldPointerDownClaimed(react),true);
 assert.equal(wasWorldPointerDownClaimed({pointerId:7}),false,
  'the same pointer ID cannot accidentally claim a different event');
});
test('direct sprite hit must still be in viewer roster and controlled by this actor',()=>{
 const sprite={dataset:{worldKind:'token',worldId:TOKEN}};
 const event={target:target({}, {sprite})};
 assert.deepEqual(pickWorldPointerTarget({...data,event,point:{x:9,y:9}}),
  {kind:'token',id:TOKEN},
  'direct sprite remains draggable during a safe interpolated visual position');
 const hidden={...sprite,dataset:{worldKind:'token',worldId:OTHER}};
 assert.equal(pickWorldPointerTarget({...data,
  event:{target:target({}, {sprite:hidden})},point:{x:2.5,y:2.4}}),null,
  'unrostered direct nodes must not fall through to a token behind them');
 assert.equal(pickWorldPointerTarget({...data,
  visiblePieces:[...roster,{kind:'token',id:OTHER,x:3,y:2}],
  event:{target:target({}, {sprite:hidden})},point:{x:3.2,y:2.2}}),null,
  'a player may not drag another owner token');
 assert.deepEqual(pickWorldPointerTarget({...data,isDM:true,user:DM,
  visiblePieces:[...roster,{kind:'token',id:OTHER,x:3,y:2}],
  event:{target:target({}, {sprite:hidden})},point:{x:3.2,y:2.2}}),
  {kind:'token',id:OTHER});
});
test('overlay and nested action controls never initiate world movement',()=>{
 const token={dataset:{worldKind:'token',worldId:TOKEN}};
 const action={matches:()=>false},toolButton={matches:s=>s==='.campaign-tool-map-token'};
 assert.equal(pickWorldPointerTarget({...data,
  event:{target:target({}, {sprite:token,button:action})},
  point:{x:2.2,y:2.2}}),null);
 assert.equal(pickWorldPointerTarget({...data,
  event:{target:target({}, {block:'.map-env-editing'})},
  point:{x:2.2,y:2.2}}),null);
 assert.equal(isWorldPointerTargetBlocked(target({}, {block:'.map-handout-pin'})),true);
 assert.equal(isWorldPointerTargetBlocked(target({}, {button:toolButton})),false);
});
test('shared DM, player and preview lock policy respects editor and measure tools',()=>{
 const locked={enabled:true,lockTokens:true},unlocked={enabled:true,lockTokens:false};
 assert.equal(worldMovementInputAllowed({environmentEditor:locked}),false);
 assert.equal(worldMovementInputAllowed({environmentEditor:unlocked}),true);
 assert.equal(worldMovementInputAllowed({previewRequested:true,dmPreview:true,environmentEditor:locked}),true);
 assert.equal(worldMovementInputAllowed({previewRequested:true,dmPreview:false}),false);
 assert.equal(worldMovementInputAllowed({activeMeasure:'line'}),false);
 assert.equal(worldMovementInputAllowed({active:false}),false);
 assert.equal(worldMovementInputAllowed({}),true);
});
function emitter(){
 const events=new Map();
 return {addEventListener(name,fn){events.set(name,fn)},
  removeEventListener(name){events.delete(name)},
  emit(name,event){events.get(name)?.(event)}};
}
test('document-capture movement claims event before React marquee can start',()=>{
 const doc=emitter(),board=emitter(),window=emitter(),events=[];
 let active=false,marquees=0;
 const viewport={...emitter(),ownerDocument:doc,
  contains:()=>true,setPointerCapture(){},hasPointerCapture(){return false}};
 const controller={get active(){return active},
  beginGesture(){active=true;events.push('begin');return true},
  updateGesture(){events.push('move');return true},
  endGesture(){active=false;events.push('end');return Promise.resolve()},
  cancelGesture(){active=false}};
 const input=createInputController({target:viewport,controller,
  keyboardTarget:window,blurTarget:window,pointFromEvent:e=>e.point,
  resolveSelection:()=>({mapId:MAP,origin:{x:2,y:2},
   selection:[{kind:'token',id:TOKEN}]})});
 input.mount();
 const down={pointerId:1,button:0,pointerType:'mouse',point:{x:2.3,y:2.2},
  target:{},preventDefault(){}};
 board.addEventListener('pointerdown',e=>{
  if(!wasWorldPointerDownClaimed({nativeEvent:e}))marquees++;
 });
 doc.emit('pointerdown',down);
 board.emit('pointerdown',down);
 doc.emit('pointermove',{...down,point:{x:3.3,y:2.2}});
 doc.emit('pointerup',{...down,point:{x:3.3,y:2.2}});
 assert.deepEqual(events,['begin','move','move','end']);
 assert.equal(marquees,0);
 input.unmount();
});
