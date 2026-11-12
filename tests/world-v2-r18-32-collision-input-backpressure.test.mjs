import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createMovementController} from '../src/engine/v2/MovementController.js';
import {createInputController} from '../src/engine/v2/InputController.js';
import {expandGestureRoute,MAX_GESTURE_BENDS} from '../src/engine/v2/GesturePath.js';
import {createWorldV2Trace} from '../src/engine/v2/WorldTrace.js';

const MAP='11111111-1111-4111-8111-111111111111';
const SID='33333333-3333-4333-8333-333333333333';
const TOKEN='22222222-2222-4222-8222-222222222222';
const point=(x,y)=>({x,y});
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const gate=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b});
 return {promise,resolve,reject}};
function model({onAdvance=req=>({blocked:false,accepted:expandGestureRoute(req.from,req.targets)}),
 canPredict=()=>false}={}){
 const calls={advance:[],commit:[],cancel:[]},events=[];
 const trace=createWorldV2Trace({enabled:true,limit:512});
 const authority={
  async begin(){return {version:2,sessionId:SID}},
  async advance(req){calls.advance.push(req);
   return {version:2,sessionId:SID,seq:req.seq,
    ...(await onAdvance(req))}},
  async commit(req){calls.commit.push(req);
   return {version:2,sessionId:SID,seq:req.seq,endpoint:req.endpoint}},
  async cancel(req){calls.cancel.push(req);return true}
 };
 const ctl=createMovementController({authority,canPredict,trace,
  onEvent:e=>events.push(e)});
 const begin=()=>ctl.beginGesture({mapId:MAP,selection:[{kind:'token',id:TOKEN}],
  origin:point(1,1),pointer:point(1,1),mode:'drag',
  environmentRevision:1,permissionGeneration:1});
 return {ctl,begin,calls,events,trace};
}

test('R18-32 coalesced hardware samples produce ONE latest pointer update per event',()=>{
 function emitter(){
  const map=new Map();return {addEventListener:(type,fn)=>map.set(type,fn),
   removeEventListener:type=>map.delete(type),emit:(type,e)=>map.get(type)?.(e)};
 }
 const doc=emitter(),key=emitter(),target={
  ...emitter(),ownerDocument:doc,contains:()=>true,
  setPointerCapture(){},hasPointerCapture(){return false}
 };
 let active=false;const updates=[];
 const ctl={
  get active(){return active},
  beginGesture(){active=true;return true},
  updateGesture(p){updates.push({...p});return true},
  endGesture(){active=false;return Promise.resolve({status:'committed'})},
  cancelGesture(){active=false}
 };
 const input=createInputController({
  target,controller:ctl,keyboardTarget:key,blurTarget:key,
  pointFromEvent:e=>e.point,
  resolveSelection:()=>({mapId:MAP,origin:point(1,1),
   selection:[{kind:'token',id:TOKEN}]})
 });
 input.mount();
 const e=(x,y)=>({pointerId:7,button:0,pointerType:'mouse',
  point:point(x,y),target:{},preventDefault(){}});
 doc.emit('pointerdown',e(1.2,1.2));
 const samples=Array.from({length:300},(_,i)=>e(i%2?2.9:2.1,i%2?1.9:1.1));
 samples.push(e(6.2,3.2));
 doc.emit('pointermove',{...e(6.2,3.2),getCoalescedEvents:()=>samples});
 assert.equal(updates.length,4,'300 coalesced events must be bounded to 4');
 assert.deepEqual(updates.at(-1),point(6,3));
 doc.emit('pointerup',e(6.2,3.2));
 assert.equal(updates.length,5,'pointer release still applies final coordinates');
 assert.deepEqual(updates.at(-1),point(6,3));
 input.unmount();
});

test('R18-32 bounded coalesced turns preserve first, last and intermediate input',()=>{
 const source=readFileSync(new URL('../src/engine/v2/InputController.js',
  import.meta.url),'utf8');
 assert.match(source,/const sampledCount=Math\.min\(4,samples\.length\)/);
 assert.match(source,/Math\.round\(i\*\(samples\.length-1\)\/\(sampledCount-1\)\)/);
 assert.match(source,/point\(samples\[index\]\)\?\?\(i===sampledCount-1\?point\(event\):null\)/);
 assert.doesNotMatch(source,/for\(const sample of Array\.isArray\(samples\)/);
});

test('R18-32 distant cursor behind same blocked neighbor sends ONE denial RPC',async()=>{
 const h=model({onAdvance:req=>{
  assert.deepEqual(req.from,point(1,1));
  return {blocked:true,accepted:[]};
 }});
 h.begin();await tick();
 h.ctl.updateGesture(point(6,1));
 await tick();
 assert.equal(h.calls.advance.length,1);
 const blocked=h.events.find(e=>e.type==='blocked');
 assert.deepEqual(blocked.blockedAt,point(2,1));
 for(let x=7;x<=75;x++)assert.equal(h.ctl.updateGesture(point(x,1)),true);
 await tick();
 assert.equal(h.calls.advance.length,1,'farther cursor into same denied crossing is cached');
 const out=await h.ctl.endGesture();
 assert.equal(out.status,'committed');assert.equal(out.noMotion,true);
 assert.equal(h.calls.commit.length,0);
 h.ctl.dispose();
});

test('R18-32 server-known blocked neighbor suppresses different farther diagonal with same next cell',async()=>{
 const h=model({onAdvance:req=>({blocked:true,accepted:[]})});
 h.begin();await tick();h.ctl.updateGesture(point(3,1));await tick();
 assert.equal(h.calls.advance.length,1);
 h.ctl.updateGesture(point(8,2));await tick();
 assert.equal(h.calls.advance.length,1,'no repeated request for identical first crossing');
 h.ctl.dispose();
});

test('R18-32 genuine route around blocked cell still requests fresh server authority',async()=>{
 let count=0;const h=model({onAdvance:req=>{
  count++;
  return count===1?{blocked:true,accepted:[]}:
   {blocked:false,accepted:expandGestureRoute(req.from,req.targets)};
 }});
 h.begin();await tick();
 h.ctl.updateGesture(point(5,1));await tick();
 assert.equal(count,1);
 h.ctl.updateGesture(point(1,2));await tick();
 assert.equal(count,2,'different first cell is NOT locally denied');
 const out=await h.ctl.endGesture();
 assert.equal(out.status,'committed');assert.deepEqual(out.endpoint,point(1,2));
 assert.equal(h.calls.commit.length,1);h.ctl.dispose();
});

test('R18-32 changing requested direction during in-flight Advance is not suppressed',async()=>{
 const first=gate(),h=model({onAdvance:req=>
  req.seq===1?first.promise:{blocked:false,accepted:expandGestureRoute(req.from,req.targets)}
 });
 h.begin();await tick();
 h.ctl.updateGesture(point(5,1));await tick();
 h.ctl.updateGesture(point(5,2));
 const ending=h.ctl.endGesture();
 first.resolve({blocked:false,accepted:expandGestureRoute(point(1,1),[point(5,1)])});
 const out=await ending;
 assert.equal(out.status,'committed');
 assert.deepEqual(out.endpoint,point(5,2));
 assert.equal(h.calls.advance.length,2);
 h.ctl.dispose();
});

test('R18-32 server-blocked ACK clears all unapproved bounded pending waypoints',async()=>{
 const first=gate(),h=model({onAdvance:req=>req.seq===1?
  first.promise:{blocked:false,accepted:expandGestureRoute(req.from,req.targets)}
 });
 h.begin();await tick();
 h.ctl.updateGesture(point(2,1));await tick();
 let refused=0;
 for(let i=0;i<MAX_GESTURE_BENDS+50;i++){
  const p=i%2?point(5,4):point(4,5);
  if(!h.ctl.updateGesture(p))refused++;
 }
 assert.ok(refused>0,'excess hardware samples are explicitly refused');
 assert.equal(h.events.filter(e=>e.type==='rejected').length,0,
  'path saturation cannot roll back previously authorized movement');
 assert.ok(h.trace.snapshot().counts['movement.path-backpressure']>=1);
 const done=h.ctl.endGesture();
 first.resolve({blocked:true,accepted:[point(2,1)]});
 const out=await done;
 assert.equal(out.status,'committed');
 assert.deepEqual(out.endpoint,point(2,1));
 assert.equal(h.calls.advance.length,1);
 assert.equal(h.calls.commit.length,1);
 assert.equal(h.calls.commit[0].endpoint.x,2);
 assert.equal(h.events.some(e=>e.type==='rejected'),false);
 h.ctl.dispose();
});

test('R18-32 backpressure preserves all queued bends and cannot forge a shortcut',async()=>{
 const first=gate(),h=model({onAdvance:req=>req.seq===1?
  first.promise:{blocked:false,accepted:expandGestureRoute(req.from,req.targets)}
 });
 h.begin();await tick();h.ctl.updateGesture(point(2,1));await tick();
 let refused=0;
 for(let i=0;i<MAX_GESTURE_BENDS+20;i++)
  if(!h.ctl.updateGesture(i%2?point(3,1):point(2,2)))refused++;
 assert.ok(refused>0);
 assert.equal(h.ctl.updateGesture(point(7,3)),false,
  'an over-cap endpoint must NOT silently replace real bends with a shortcut');
 const done=h.ctl.endGesture();first.resolve({blocked:false,accepted:[point(2,1)]});
 const out=await done;
 assert.equal(out.status,'committed');
 assert.deepEqual(out.endpoint,point(3,1),
  'only the last genuinely enqueued grid bend can be committed');
 assert.equal(h.calls.commit.length,1);
 assert.ok(h.calls.advance.length>1);
 assert.equal(h.calls.advance.some(req=>req.targets.at(-1)?.x===7&&
  req.targets.at(-1)?.y===3),false,
  'the refused final point must never be used as a hidden shortcut');
 h.ctl.dispose();
});

test('R18-32 keyboard and preview modes remain unmodified by pointer-only backpressure',()=>{
 const controller=readFileSync(new URL('../src/engine/v2/MovementController.js',
  import.meta.url),'utf8');
 assert.match(controller,/\['drag','touch','preview'\]\.includes\(g\.mode\)/);
 assert.match(controller,/if\(!g\.hadMotion\|\|g\.mode==='preview'\)/);
 assert.match(controller,/const reply=await authority\.commit/);
 assert.doesNotMatch(controller,/finalize_world_motion_v2|enableAtomicFinalize/);
});

test('R18-32 tracing only exposes a fixed event type and drag/preview kind',()=>{
 const trace=createWorldV2Trace({enabled:true,limit:16,now:()=>1});
 trace.event('movement.path-backpressure','drag');
 trace.event('movement.path-backpressure',TOKEN);
 const data=trace.snapshot();
 assert.equal(data.counts['movement.path-backpressure'],2);
 assert.equal(data.events[0].detail,'drag');
 assert.equal(data.events[1].detail,'other');
 assert.equal(JSON.stringify(data).includes(TOKEN),false);
});
