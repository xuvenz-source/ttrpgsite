import test from 'node:test';
import assert from 'node:assert/strict';
import {createWorldRealtimeTransport} from '../src/engine/v2/RealtimeTransport.js';
import {createWorldV2Trace} from '../src/engine/v2/WorldTrace.js';

// Fixed synthetic IDs: do not copy any real campaign identities, positions
// or private payloads from volunteer traces into the repository.
const MAP='10000000-0000-4000-8000-000000000001';
const VIEWER='20000000-0000-4000-8000-000000000001';
const KNOWN='30000000-0000-4000-8000-000000000001';
const ENTERING='40000000-0000-4000-8000-000000000001';
const NEXT='50000000-0000-4000-8000-000000000001';
const piece=id=>({kind:'token',id});
const sight=(cursor,visiblePieces)=>({version:2,mapId:MAP,viewerId:VIEWER,
 cursor,environmentRevision:9,permissionGeneration:4,visiblePieces});
const frame=(seq,id=KNOWN)=>({version:2,mapId:MAP,viewerId:VIEWER,seq,
 environmentRevision:9,permissionGeneration:4,
 items:[{kind:'token',id,action:'path',
  path:[{x:1,y:1},{x:2,y:1}]}]});
const tick=()=>new Promise(resolve=>setImmediate(resolve));

test('R18-01 baseline: two unknown rosters followed by two gaps fail closed, never paint unknown paths',async()=>{
 let subscribe,channelCount=0,server=sight(0,[piece(KNOWN)]);
 const seen=[],revoked=[],recovered=[],handlers={};
 const trace=createWorldV2Trace({enabled:true});
 const channel={
  on(_type,filter,callback){handlers[filter.event]=callback;return this},
  subscribe(fn){subscribe=fn;return this}
 };
 const db={
  realtime:{async setAuth(){}},
  channel(){channelCount++;return channel},
  removeChannel:async()=>{}
 };
 const transport=createWorldRealtimeTransport({
  db,mapId:MAP,viewerId:VIEWER,trace,
  onResync:async reason=>{recovered.push(reason);return server},
  onPath:item=>seen.push(item),
  onRevoke:reason=>revoked.push(reason)
 });
 const send=(seq,id=KNOWN)=>handlers['world-motion-v2']({payload:frame(seq,id)});
 const settle=async()=>{for(let i=0;i<4;i++)await tick()};
 try{
  await transport.start();subscribe('SUBSCRIBED');await settle();
  assert.equal(transport.locked,false);
  trace.clear();recovered.length=0;revoked.length=0;
  for(let i=1;i<=4;i++)send(i);
  assert.equal(seen.length,4);

  // Server approved a path that is not part of the last SIGNED roster.
  // No unknown identity or path may be relayed to a sprite renderer.
  server=sight(5,[piece(KNOWN),piece(ENTERING)]);
  send(5,ENTERING);await settle();
  assert.equal(transport.locked,false);
  assert.equal(transport.cursor,5);
  server=sight(7,[piece(KNOWN),piece(ENTERING)]);
  send(7);await settle(); // sequence 6 was not received.
  assert.equal(transport.locked,false);
  assert.equal(transport.cursor,7);
  for(let i=8;i<=20;i++)send(i);

  server=sight(21,[piece(KNOWN),piece(ENTERING),piece(NEXT)]);
  send(21,NEXT);await settle();
  assert.equal(transport.locked,false);
  server=sight(23,[piece(KNOWN),piece(ENTERING),piece(NEXT)]);
  send(23);await settle();
  assert.equal(transport.locked,false);
  for(let i=24;i<=57;i++)send(i);
  const report=trace.snapshot();
  assert.equal(report.counts['observer.frame-accepted'],51);
  assert.equal(report.counts['observer.unknown-piece'],2);
  assert.equal(report.counts['observer.sequence-gap'],2);
  assert.equal(report.counts['observer.resync'],4);
  assert.equal(report.counts['observer.seal'],4);
  assert.deepEqual(revoked,['unknown-piece','sequence-gap',
   'unknown-piece','sequence-gap']);
  assert.deepEqual(recovered,revoked);
  assert.equal(seen.length,51);
  assert.ok(seen.every(x=>x.id===KNOWN),
   'a movement-only packet never grants an unrostered piece');
  assert.equal(transport.cursor,57);
  assert.equal(channelCount,1,
   'recoveries do not open a new Realtime channel');
  const json=JSON.stringify(report);
  for(const id of [MAP,VIEWER,KNOWN,ENTERING,NEXT])
   assert.equal(json.includes(id),false,
    'diagnostic report must not contain any raw identity');
 }finally{await transport.dispose()}
});

test('R18-01 baseline: a dropped last terminal notification has no autonomous catch-up in current transport',async()=>{
 let subscribe,number=0,server=sight(0,[piece(KNOWN)]),handlers={};
 const channel={
  on(_type,filter,callback){handlers[filter.event]=callback;return this},
  subscribe(fn){subscribe=fn;return this}
 };
 const db={channel:()=>channel,removeChannel:async()=>{},
  realtime:{setAuth:async()=>{}}};
 const transport=createWorldRealtimeTransport({
  db,mapId:MAP,viewerId:VIEWER,
  onResync:async()=>{number++;return server}
 });
 try{
  await transport.start();subscribe('SUBSCRIBED');
  for(let i=0;i<4;i++)await tick();
  assert.equal(number,1);
  server=sight(6,[piece(KNOWN)]);
  // Simulates all terminal packets/dirty notices being lost while tab
  // remains subscribed: the only onResync hook is packet-driven today.
  for(let i=0;i<8;i++)await tick();
  assert.equal(number,1,
   'no synthetic timer or client-authored cursor should be invented');
  assert.equal(transport.cursor,0,
   'an independent signed recovery source is required for convergence');
  assert.equal(transport.locked,false);
 }finally{await transport.dispose()}
});
