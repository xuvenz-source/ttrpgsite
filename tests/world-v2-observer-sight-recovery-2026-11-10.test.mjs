import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createWorldRealtimeTransport} from '../src/engine/v2/RealtimeTransport.js';

const MAP='11111111-1111-4111-8111-111111111111';
const VIEWER='22222222-2222-4222-8222-222222222222';
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));

function createObserverHarness(onResync){
 let subscription=null;
 const statuses=[],errors=[];
 const channel={
  on(){return this},
  subscribe(callback){subscription=callback;return this}
 };
 const db={
  channel:()=>channel,
  removeChannel:async()=>{},
  realtime:{setAuth:async()=>{}}
 };
 const transport=createWorldRealtimeTransport({
  db,mapId:MAP,viewerId:VIEWER,onResync,
  onState:state=>statuses.push(state.reason),
  onError:error=>errors.push(error.message)
 });
 return {
  transport,statuses,errors,
  subscribed(){assert.ok(subscription);subscription('SUBSCRIBED')}
 };
}
function validSnapshot(){
 return {version:2,mapId:MAP,viewerId:VIEWER,cursor:1,
  environmentRevision:1,permissionGeneration:1,visiblePieces:[]};
}

test('scene-current reauthorizes a private observer after a failed sight bootstrap',async()=>{
 let ready=false,requests=0;
 const h=createObserverHarness(async()=>{
  requests++;
  if(!ready)throw Error('No authorized V2 observer sight');
  return validSnapshot();
 });
 try{
  await h.transport.start();
  h.subscribed();
  await delay(20);
  assert.equal(h.transport.locked,true);
  assert.deepEqual(h.errors,['No authorized V2 observer sight']);
  ready=true;
  assert.equal(await h.transport.resync('scene-current'),true);
  assert.equal(h.transport.locked,false);
  assert.ok(h.statuses.includes('authorized'));
  const count=requests;
  await delay(350);
  assert.equal(requests,count,'recovery cancels the pending bounded retry');
 }finally{
  await h.transport.dispose();
 }
});

test('rejected or unavailable sight stays locked and retries terminate',async()=>{
 let requests=0;
 const h=createObserverHarness(async()=>{requests++;return null});
 try{
  await h.transport.start();
  h.subscribed();
  await delay(700);
  assert.equal(requests,3,'one original request plus two bounded retries');
  assert.equal(h.transport.locked,true);
  assert.ok(!h.statuses.includes('authorized'));
 }finally{
  await h.transport.dispose();
 }
});

test('scene-current runtime route reconciles the observer stream, not just local sight',()=>{
 const runtime=readFileSync(new URL('../src/engine/v2/WorldV2TabletopRuntime.js',
  import.meta.url),'utf8');
 assert.match(runtime,
  /if\(sceneState\.reason==='scene-current'\)\{[\s\S]*?if\(stream\?\.connected\)[\s\S]*?stream\.resync\('scene-current'\)/);
 assert.match(runtime,/if\(!dmPreview\)stream=createWorldRealtimeTransport/);
 const transport=readFileSync(new URL('../src/engine/v2/RealtimeTransport.js',
  import.meta.url),'utf8');
 assert.match(transport,/config:\{private:true,broadcast:/);
 assert.match(transport,/if\(retryAttempts<2\)/);
});
