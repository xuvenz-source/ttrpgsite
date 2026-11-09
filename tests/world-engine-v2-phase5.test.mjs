import test from 'node:test';
import assert from 'node:assert/strict';
import {
 createWorldRealtimeTransport,worldObserverTopic,fetchWorldObserverCursorV2,
 validWorldMotionFrame,validWorldObserverSnapshot,WORLD_MOTION_EVENT
} from '../src/engine/v2/index.js';

const mapId='10000000-0000-4000-8000-000000000001';
const viewerId='30000000-0000-4000-8000-000000000002';
const tokenId='40000000-0000-4000-8000-000000000001';
const toolId='50000000-0000-4000-8000-000000000001';
const hiddenId='40000000-0000-4000-8000-000000000009';
const known={kind:'token',id:tokenId};
const tool={kind:'tool',id:toolId};
const snapshot=(cursor=0,visiblePieces=[known,tool],overrides={})=>({
 version:2,mapId,viewerId,cursor,environmentRevision:7,
 permissionGeneration:4,visiblePieces,...overrides
});
const frame=(seq,items,other={})=>({
 version:2,mapId,viewerId,seq,environmentRevision:7,
 permissionGeneration:4,items,...other
});
const path=(id=tokenId)=>({kind:'token',id,action:'path',
 path:[{x:2,y:1},{x:2,y:2},{x:2,y:3}]});
const hide=(id=tokenId)=>({kind:'token',id,action:'hide'});
const flush=()=>new Promise(resolve=>setImmediate(resolve));
function fakeDb(){
 const state={events:[],statuses:[],calls:[],removed:[],authCount:0};
 const listeners=new Map();let subscribed;
 const channel={
  on(type,filter,cb){
   state.events.push({type,filter});
   listeners.set(filter.event,cb);return this;
  },
  subscribe(fn){subscribed=fn;return this}
 };
 const db={
  realtime:{async setAuth(){state.authCount++}},
  channel(topic,config){state.calls.push({topic,config});return channel},
  async removeChannel(c){state.removed.push(c)}
 };
 return {db,state,
  status:v=>subscribed?.(v),
  emit:(p,event=WORLD_MOTION_EVENT)=>listeners.get(event)?.({payload:p})};
}

test('strict private topic is viewer+map scoped and no send API exists',async()=>{
 const {db,state,status}=fakeDb();
 const transport=createWorldRealtimeTransport({db,mapId,viewerId,
  onResync:async()=>snapshot()});
 assert.equal(await transport.start(),true);
 assert.equal(await transport.start(),true);
 assert.equal(state.calls.length,1);
 assert.equal(state.authCount,1);
 assert.equal(state.calls[0].topic,worldObserverTopic(mapId,viewerId));
 assert.equal(state.calls[0].config.config.private,true);
 assert.deepEqual(state.events,[
  {type:'broadcast',filter:{event:WORLD_MOTION_EVENT}},
  {type:'broadcast',filter:{event:'world-vision-v2'}}
 ]);
 assert.equal(typeof transport.send,'undefined');
 status('SUBSCRIBED');await flush();
 assert.equal(transport.locked,false);
 await transport.dispose();
 assert.equal(state.removed.length,1);
});

test('authorized frame path and hide update only known authorized sprites',async()=>{
 const {db,status,emit}=fakeDb(),seen=[],hidden=[];
 const t=createWorldRealtimeTransport({db,mapId,viewerId,
  onResync:async()=>snapshot(),
  onPath:p=>seen.push(p),onHide:p=>hidden.push(p)});
 await t.start();status('SUBSCRIBED');await flush();
 emit(frame(1,[path()]));
 assert.equal(seen.length,1);
 assert.equal(t.cursor,1);
 emit(frame(2,[hide()]));
 assert.equal(hidden.length,1);
 assert.equal(t.cursor,2);
 emit(frame(3,[path()]));
 assert.equal(seen.length,1,'hide cannot be reversed by a later movement frame');
 await t.dispose();
});

test('old, duplicated, non-adjacent, secret-bearing packets cannot animate',async()=>{
 const {db,status,emit}=fakeDb(),seen=[],reasons=[];
 let cursor=0;
 const t=createWorldRealtimeTransport({db,mapId,viewerId,
  onResync:async reason=>{reasons.push(reason);return snapshot(cursor)},
  onPath:p=>seen.push(p)});
 await t.start();status('SUBSCRIBED');await flush();
 emit(frame(1,[path()]));assert.equal(seen.length,1);
 emit(frame(1,[path()]));assert.equal(seen.length,1);
 cursor=1;
 emit(frame(2,[{...path(),path:[{x:2,y:1},{x:8,y:1}]}]));
 await flush();
 assert.equal(t.locked,false);
 assert.ok(reasons.includes('invalid-packet'));
 emit(frame(2,[{...path(),privateWalls:['secret']}]));
 await flush();
 assert.equal(seen.length,1);
 await t.dispose();
});

test('sequence gap forces fail-closed authorized resync before other motion',async()=>{
 const {db,status,emit}=fakeDb(),seen=[],revocations=[],reasons=[];
 let next=snapshot(5);
 const t=createWorldRealtimeTransport({db,mapId,viewerId,
  onResync:async reason=>{reasons.push(reason);return next},
  onPath:x=>seen.push(x),onRevoke:r=>revocations.push(r)});
 await t.start();status('SUBSCRIBED');await flush();
 emit(frame(6,[path()]));assert.equal(seen.length,1);
 next=snapshot(8);
 emit(frame(8,[path()]));await flush();
 assert.equal(seen.length,1,'gap frame may not become a new position');
 assert.ok(reasons.includes('sequence-gap'));
 assert.ok(revocations.includes('sequence-gap'));
 emit(frame(7,[path()]));assert.equal(seen.length,1);
 emit(frame(9,[path()]));assert.equal(seen.length,2);
 await t.dispose();
});

test('newly seen unknown NPC is not shown before RLS roster refresh',async()=>{
 const {db,status,emit}=fakeDb(),seen=[],causes=[];
 let current=snapshot(0,[known]);
 const t=createWorldRealtimeTransport({db,mapId,viewerId,
  onResync:async reason=>{causes.push(reason);return current},
  onPath:p=>seen.push(p)});
 await t.start();status('SUBSCRIBED');await flush();
 current=snapshot(1,[known,{kind:'token',id:hiddenId}]);
 emit(frame(1,[path(hiddenId)]));await flush();
 assert.equal(seen.length,0);
 assert.ok(causes.includes('unknown-piece'));
 emit(frame(2,[path(hiddenId)]));
 assert.equal(seen.length,1);
 await t.dispose();
});

test('permissions or environment revisions invalidate every in-flight visual',async()=>{
 const {db,status,emit}=fakeDb(),seen=[],revoked=[];
 let current=snapshot();
 const t=createWorldRealtimeTransport({db,mapId,viewerId,
  onResync:async()=>current,onRevoke:reason=>revoked.push(reason),
  onPath:x=>seen.push(x)});
 await t.start();status('SUBSCRIBED');await flush();
 current=snapshot(1,[known],{environmentRevision:8,permissionGeneration:5});
 emit(frame(1,[path()],{environmentRevision:8,permissionGeneration:5}));
 await flush();
 assert.equal(seen.length,0);
 assert.ok(revoked.includes('version-change'));
 emit(frame(2,[path()],{environmentRevision:8,permissionGeneration:5}));
 assert.equal(seen.length,1);
 await t.dispose();
});

test('disconnect/reconnect requires fresh authorized roster and cursor',async()=>{
 const {db,status,emit}=fakeDb(),seen=[],revoked=[];
 let current=snapshot();
 const t=createWorldRealtimeTransport({db,mapId,viewerId,
  onResync:async()=>current,onPath:p=>seen.push(p),
  onRevoke:r=>revoked.push(r)});
 await t.start();status('SUBSCRIBED');await flush();
 emit(frame(1,[path()]));assert.equal(seen.length,1);
 status('CHANNEL_ERROR');
 assert.equal(t.locked,true);
 emit(frame(2,[path()]));assert.equal(seen.length,1);
 current=snapshot(2);
 status('SUBSCRIBED');await flush();
 emit(frame(2,[path()]));assert.equal(seen.length,1);
 emit(frame(3,[path()]));assert.equal(seen.length,2);
 assert.ok(revoked.includes('disconnected'));
 await t.dispose();
});

test('late resync response after disposal cannot authorize a channel',async()=>{
 const {db,status,emit,state}=fakeDb(),seen=[];
 let complete;
 const pending=new Promise(resolve=>{complete=resolve});
 const t=createWorldRealtimeTransport({db,mapId,viewerId,
  onResync:()=>pending,onPath:p=>seen.push(p)});
 await t.start();status('SUBSCRIBED');await flush();
 const disposed=t.dispose();
 complete(snapshot(0));
 await disposed;await flush();
 emit(frame(1,[path()]));
 assert.equal(seen.length,0);
 assert.equal(t.locked,true);
 assert.equal(state.removed.length,1);
});

test('strict envelope rejects hidden metadata, invalid paths and forged viewer',()=>{
 assert.equal(validWorldMotionFrame(frame(1,[path()]),mapId,viewerId),true);
 assert.equal(validWorldMotionFrame(frame(1,[hide()]),mapId,viewerId),true);
 assert.equal(validWorldMotionFrame(frame(1,[{...hide(),path:[]}]),mapId,viewerId),false);
 assert.equal(validWorldMotionFrame(frame(1,[{...path(),actor:viewerId}]),mapId,viewerId),false);
 assert.equal(validWorldMotionFrame(frame(1,[path()],{privateWalls:[]}),mapId,viewerId),false);
 assert.equal(validWorldMotionFrame(frame(1,[path()],{viewerId:tokenId}),mapId,viewerId),false);
 assert.equal(validWorldMotionFrame(frame(1,[path(),path()]),mapId,viewerId),false);
 assert.equal(validWorldObserverSnapshot(snapshot(1,[known]),mapId,viewerId),true);
 assert.equal(validWorldObserverSnapshot(snapshot(1,[known,known]),mapId,viewerId),false);
 assert.equal(validWorldObserverSnapshot(snapshot(1,[known],{viewerId:tokenId}),mapId,viewerId),false);
});

test('invalid resync result keeps channel fail-closed and never shows paths',async()=>{
 const {db,status,emit}=fakeDb(),seen=[],errors=[];
 const t=createWorldRealtimeTransport({db,mapId,viewerId,
  onResync:async()=>({version:2,mapId,viewerId,cursor:5,
   environmentRevision:7,permissionGeneration:4,
   visiblePieces:[{kind:'token',id:'forged'}]}),
  onPath:p=>seen.push(p),onError:e=>errors.push(e.message)});
 await t.start();status('SUBSCRIBED');await flush();
 assert.equal(t.locked,true);
 emit(frame(6,[path()]));
 assert.equal(seen.length,0);
 assert.equal(errors.length,1);
 await t.dispose();
});


test('viewer cursor reader returns only an authorized typed private cursor',async()=>{
 const calls=[],cursor={version:2,mapId,viewerId,cursor:7,
  environmentRevision:9,permissionGeneration:3};
 const db={rpc:async(name,args)=>{
  calls.push([name,args]);return {data:cursor,error:null};
 }};
 assert.deepEqual(await fetchWorldObserverCursorV2({db,mapId,viewerId}),cursor);
 assert.deepEqual(calls,[['get_world_observer_cursor_v2',{p_map:mapId}]]);
 await assert.rejects(fetchWorldObserverCursorV2({db,mapId,viewerId:tokenId}),
  /Unauthorized/);
 await assert.rejects(fetchWorldObserverCursorV2({
  db:{rpc:async()=>({data:{...cursor,secretNPCs:[]},error:null})},mapId,viewerId
 }),/Unauthorized/);
 await assert.rejects(fetchWorldObserverCursorV2({
  db:{rpc:async()=>({data:null,error:{message:'RLS denied'}})},mapId,viewerId
 }),/Unauthorized/);
});


test('same viewer socket dispatches server-only sight dirty notices',async()=>{
 const {db,status,emit,state}=fakeDb(),notices=[];
 const t=createWorldRealtimeTransport({db,mapId,viewerId,
  onResync:async()=>snapshot(),onVisionDirty:n=>notices.push(n)});
 await t.start();status('SUBSCRIBED');await flush();
 const notice={version:2,mapId,viewerId,
  visionEpoch:4,environmentRevision:7,
  permissionGeneration:4,sceneGeneration:8};
 emit(notice,'world-vision-v2');
 assert.deepEqual(notices,[notice]);
 assert.equal(state.calls.length,1,'vision does not open another socket');
 await t.dispose();
});
