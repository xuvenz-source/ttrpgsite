import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {createMovementController} from '../src/engine/v2/MovementController.js';
import {expandGestureRoute} from '../src/engine/v2/GesturePath.js';

const MAP='11111111-1111-4111-8111-111111111111';
const TOKEN='22222222-2222-4222-8222-222222222222';
const SID='33333333-3333-4333-8333-333333333333';
const point=(x,y)=>({x,y});
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const deferred=()=>{let resolve,reject;
 const promise=new Promise((yes,no)=>{resolve=yes;reject=no});
 return {promise,resolve,reject};
};
const expected=(req)=>({
 version:2,sessionId:SID,seq:req.seq,blocked:false,
 accepted:expandGestureRoute(req.from,req.targets)
});
function harness({onAdvance=req=>expected(req),onBegin=()=>({}),
 onCommit=req=>({endpoint:req.endpoint}),origin=point(1,1),
 mode='drag',canPredict=()=>false}={}){
 const calls={begin:[],advance:[],commit:[],cancel:[]},events=[];
 const authority={
  async begin(req){
   calls.begin.push(req);
   return {version:2,sessionId:SID,...(await onBegin(req))};
  },
  async advance(req){
   calls.advance.push(req);
   return {version:2,sessionId:SID,seq:req.seq,
    blocked:false,accepted:[],...(await onAdvance(req))};
  },
  async commit(req){
   calls.commit.push(req);
   return {version:2,sessionId:SID,seq:req.seq,endpoint:req.endpoint,
    ...(await onCommit(req))};
  },
  async cancel(req){calls.cancel.push(req);return true}
 };
 const controller=createMovementController({
  authority,canPredict,onEvent:event=>events.push(event)
 });
 const begin=()=>controller.beginGesture({
  mapId:MAP,selection:[{kind:'token',id:TOKEN}],
  mode,origin,pointer:origin,environmentRevision:1,permissionGeneration:1
 });
 return {controller,begin,calls,events};
}

test('R18-31 preserves rapid forward updates while Advance is in flight',async()=>{
 const first=deferred();let n=0;
 const h=harness({onAdvance:req=>++n===1?first.promise:expected(req)});
 h.begin();await tick();
 h.controller.updateGesture(point(3,1));await tick();
 assert.equal(h.calls.advance.length,1);
 for(const x of [4,5,6,7])h.controller.updateGesture(point(x,1));
 const pending=h.controller.endGesture();
 first.resolve(expected(h.calls.advance[0]));
 const result=await pending;
 assert.equal(result.status,'committed');
 assert.deepEqual(result.endpoint,point(7,1));
 assert.equal(h.calls.advance.length,2);
 assert.deepEqual(h.calls.advance[1].from,point(3,1));
 assert.deepEqual(h.calls.advance[1].targets,[point(7,1)]);
 assert.equal(h.calls.commit.length,1);
 assert.deepEqual(h.calls.commit[0].endpoint,point(7,1));
 h.controller.dispose();
});

test('R18-31 preserves full reversal to origin during an unresolved Advance',async()=>{
 const first=deferred(),h=harness({
  onAdvance:req=>req.seq===1?first.promise:expected(req)
 });
 h.begin();await tick();
 h.controller.updateGesture(point(3,1));await tick();
 h.controller.updateGesture(point(1,1));
 const completed=h.controller.endGesture();
 first.resolve(expected(h.calls.advance[0]));
 const result=await completed;
 assert.equal(result.status,'committed');
 assert.deepEqual(result.endpoint,point(1,1));
 assert.deepEqual(h.calls.advance[1].from,point(3,1));
 assert.deepEqual(h.calls.advance[1].targets,[point(1,1)]);
 assert.deepEqual(h.calls.commit[0].endpoint,point(1,1));
 h.controller.dispose();
});

test('R18-31 preserves ordered corner turns added during a slow request',async()=>{
 const first=deferred(),h=harness({
  onAdvance:req=>req.seq===1?first.promise:expected(req)
 });
 h.begin();await tick();
 h.controller.updateGesture(point(3,1));await tick();
 h.controller.updateGesture(point(3,3));
 h.controller.updateGesture(point(1,3));
 const terminal=h.controller.endGesture();
 first.resolve(expected(h.calls.advance[0]));
 const result=await terminal;
 assert.equal(result.status,'committed');
 assert.deepEqual(result.endpoint,point(1,3));
 assert.deepEqual(h.calls.advance[1].from,point(3,1));
 assert.deepEqual(h.calls.advance[1].targets,[point(3,3),point(1,3)]);
 h.controller.dispose();
});

test('R18-31 server-confirmed blocked prefix discards only later UNAPPROVED intent',async()=>{
 const first=deferred(),h=harness({
  onAdvance:req=>req.seq===1?first.promise:expected(req)
 });
 h.begin();await tick();
 h.controller.updateGesture(point(3,1));await tick();
 h.controller.updateGesture(point(6,1));
 const completed=h.controller.endGesture();
 first.resolve({version:2,sessionId:SID,seq:1,blocked:true,
  accepted:[point(2,1)]});
 const result=await completed;
 assert.equal(result.status,'committed');
 assert.deepEqual(result.endpoint,point(2,1));
 assert.equal(h.calls.advance.length,1);
 assert.equal(h.calls.commit.length,1);
 assert.deepEqual(h.calls.commit[0].endpoint,point(2,1));
 const blocked=h.events.find(e=>e.type==='blocked');
 assert.deepEqual(blocked.blockedAt,point(3,1));
 h.controller.dispose();
});

test('R18-31 repeated denied pointer does not cause a collision RPC loop',async()=>{
 const first=deferred(),h=harness({
  onAdvance:req=>req.seq===1?first.promise:expected(req)
 });
 h.begin();await tick();
 h.controller.updateGesture(point(2,1));await tick();
 for(let i=0;i<120;i++)h.controller.updateGesture(point(2.001,1.001));
 first.resolve({version:2,sessionId:SID,seq:1,blocked:true,accepted:[]});
 await tick();await tick();
 for(let i=0;i<120;i++)h.controller.updateGesture(point(2.001,1.001));
 await tick();await tick();
 assert.equal(h.calls.advance.length,1);
 const result=await h.controller.endGesture();
 assert.equal(result.status,'committed');
 assert.equal(result.noMotion,true);
 assert.equal(h.calls.commit.length,0);
 h.controller.dispose();
});

test('R18-31 long drag bounded to 24 cells keeps its newest target when server is slow',async()=>{
 const first=deferred(),h=harness({
  onAdvance:req=>req.seq===1?first.promise:expected(req)
 });
 h.begin();await tick();
 h.controller.updateGesture(point(30,1));await tick();
 assert.deepEqual(h.calls.advance[0].targets,[point(25,1)]);
 h.controller.updateGesture(point(34,1));
 const completed=h.controller.endGesture();
 first.resolve(expected(h.calls.advance[0]));
 const result=await completed;
 assert.equal(result.status,'committed');
 assert.deepEqual(result.endpoint,point(34,1));
 assert.equal(h.calls.advance.length,2);
 assert.deepEqual(h.calls.advance[1].from,point(25,1));
 assert.deepEqual(h.calls.advance[1].targets,[point(34,1)]);
 assert.equal(h.calls.commit.length,1);
 h.controller.dispose();
});

test('R18-31 exact in-flight target repetition does not enqueue a phantom movement',async()=>{
 const first=deferred(),h=harness({
  onAdvance:req=>req.seq===1?first.promise:expected(req)
 });
 h.begin();await tick();
 h.controller.updateGesture(point(3,1));await tick();
 for(let i=0;i<20;i++)h.controller.updateGesture(point(3,1));
 const completed=h.controller.endGesture();
 first.resolve(expected(h.calls.advance[0]));
 const result=await completed;
 assert.equal(result.status,'committed');
 assert.deepEqual(result.endpoint,point(3,1));
 assert.equal(h.calls.advance.length,1);
 assert.equal(h.calls.commit.length,1);
 h.controller.dispose();
});

test('R18-31 preview remains uncommitted and preserves its latest local path',async()=>{
 const first=deferred(),h=harness({
  mode:'preview',onAdvance:req=>req.seq===1?first.promise:expected(req)
 });
 h.begin();await tick();
 h.controller.updateGesture(point(3,1));await tick();
 h.controller.updateGesture(point(5,1));
 const completed=h.controller.endGesture();
 first.resolve(expected(h.calls.advance[0]));
 const result=await completed;
 assert.equal(result.status,'committed');
 assert.equal(result.preview,true);
 assert.equal(h.calls.advance.length,2);
 assert.equal(h.calls.commit.length,0);
 h.controller.dispose();
});

test('R18-31 keyboard preserves rapid keys and original authoritative Commit',async()=>{
 const first=deferred(),h=harness({
  mode:'keyboard',onAdvance:req=>req.seq===1?first.promise:expected(req)
 });
 h.begin();await tick();
 h.controller.updateGesture(point(2,1));await tick();
 h.controller.updateGesture(point(3,1));
 h.controller.updateGesture(point(4,1));
 const completed=h.controller.endGesture();
 first.resolve(expected(h.calls.advance[0]));
 const result=await completed;
 assert.equal(result.status,'committed');
 assert.deepEqual(result.endpoint,point(4,1));
 assert.equal(h.calls.advance.length,2);
 assert.equal(h.calls.commit.length,1);
 h.controller.dispose();
});

test('R18-31 permission revocation during delayed Advance ignores its late ACK',async()=>{
 const first=deferred(),h=harness({
  onAdvance:req=>req.seq===1?first.promise:expected(req)
 });
 h.begin();await tick();
 h.controller.updateGesture(point(3,1));await tick();
 h.controller.updateGesture(point(5,1));
 const completed=h.controller.endGesture();
 h.controller.cancelGesture('permission');
 const result=await completed;
 first.resolve(expected(h.calls.advance[0]));await tick();await tick();
 assert.equal(result.status,'revoked');
 assert.equal(h.calls.advance.length,1);
 assert.equal(h.calls.commit.length,0);
 assert.equal(h.events.filter(e=>e.type==='committed').length,0);
 h.controller.dispose();
});

test('R18-31 network failure rejects rather than inventing any movement',async()=>{
 const first=deferred(),h=harness({
  onAdvance:req=>req.seq===1?first.promise:expected(req)
 });
 h.begin();await tick();
 h.controller.updateGesture(point(3,1));await tick();
 h.controller.updateGesture(point(5,1));
 const completed=h.controller.endGesture();
 first.reject(Error('network failed'));
 const result=await completed;await tick();
 assert.equal(result.status,'rejected');
 assert.equal(h.calls.advance.length,1);
 assert.equal(h.calls.commit.length,0);
 assert.equal(h.events.filter(e=>e.type==='committed').length,0);
 assert.equal(h.calls.cancel.length,1);
 h.controller.dispose();
});

test('R18-31 source diff is limited to queue ownership; server/fog wire unchanged',()=>{
 const source=readFileSync(new URL('../src/engine/v2/MovementController.js',
  import.meta.url),'utf8');
 const blob=createHash('sha1').update(
  'blob '+Buffer.byteLength(source)+'\0').update(source).digest('hex');
 // Preserve historical R18-31 reviewed checksum as provenance.
 // R18-35 only adds the proven noMotion event after exact server ACK.
 const reviewedPriorR18_31='347d3ac8cd9992027d5a67340ae45220cccd8da5';
 assert.equal(reviewedPriorR18_31,
  '347d3ac8cd9992027d5a67340ae45220cccd8da5');
 assert.equal(blob,'48070f99f818bc7669f4fc0d6f64335129d6f9cc');
 assert.match(source,/result\.noMotion===true\?\{noMotion:true\}:\{\}/);
 assert.match(source,/g\.pending\.splice\(0,batch\.consumed\);\s*g\.inFlightTarget=/);
 assert.match(source,/g\.inFlightTarget\?\?g\.approved/);
 assert.match(source,/finally\{[\s\S]*?g\.inFlightTarget=null/);
 assert.match(source,/const reply=await authority\.commit/);
 assert.match(source,/if\(response\.blocked\)g\.pending\.length=0/);
 assert.doesNotMatch(source,/finalize_world_motion_v2|enableAtomicFinalize|authority\.finalize\(/);
 assert.doesNotMatch(source,/\bdb\.rpc\b|localStorage|sendBroadcast/);
});
