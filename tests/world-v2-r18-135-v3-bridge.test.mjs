import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createWorldRealtimeTransport} from '../src/engine/v2/RealtimeTransport.js';
import {createObserverV3ChannelBridge,R135_LIVE_ENABLED}
 from '../staging/world-v2-b10-r18-135-v3-client-bridge-cutover/ObserverV3ChannelBridge.mjs';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const read=p=>readFileSync(join(root,p),'utf8');
const staging='staging/world-v2-b10-r18-135-v3-client-bridge-cutover/';
const manifest=JSON.parse(read(staging+'manifest.json'));
const cutover=JSON.parse(read(staging+'cutover-risk-matrix.json'));
const handoff=read('docs/testing/world-v2-r18-135-bridged-observer-cutover-2026-11-20.md');
const UUID={
 campaign:'00000000-0000-4000-8000-000000000101',
 map:'00000000-0000-4000-8000-000000000201',
 viewer:'00000000-0000-4000-8000-000000000303',
 token:'00000000-0000-4000-8000-000000000404',
 epoch:'a0000000-0000-4000-8000-000000000001',
 second:'a0000000-0000-4000-8000-000000000002',
 other:'00000000-0000-4000-8000-000000000304'
};
const tick=()=>new Promise(resolve=>setImmediate(resolve));
async function settle(){for(let i=0;i<4;i++)await tick()}
function deferred(){let resolve;const promise=new Promise(r=>{resolve=r});return {promise,resolve}}
function env({identity=UUID.viewer,topic=null,removal='ok',
 activated=true,sight=null,rpcBlock=null,mask=true}={}){
 let actor=identity,context={campaignId:UUID.campaign,mapId:UUID.map,
  viewerId:UUID.viewer},currentEvidence=activated;
 let removed=[],channels=[],rpcCalls=0,identityChecks=0,authRefreshes=0;
 const masks=[],revokes=[],paths=[],hides=[],visions=[],ready=[],faults=[];
 const content=topic??'forge-world-scene-v3:'+UUID.map+':'+UUID.viewer+':'+UUID.epoch;
 const db={
  auth:{getUser:async()=>{identityChecks++;return {data:{user:{id:actor}}}}},
  rpc:async(name,params)=>{
   rpcCalls++;
   assert.equal(name,'get_authorized_scene_channel_v3');
   assert.deepEqual(params,{p_map:UUID.map});
   if(rpcBlock)await rpcBlock.promise;
   return {data:typeof content==='function'?content(rpcCalls):content,error:null};
  },
  realtime:{setAuth:async()=>{authRefreshes++}},
  channel(name,config){
   assert.ok(name.startsWith('forge-world-observer-v3:'),
    'Supabase MUST NEVER subscribe to a V2 observer topic');
   assert.equal(config?.config?.private,true);
   const obj={name,config,listeners:new Map(),status:null,
    on(_kind,filter,cb){this.listeners.set(filter.event,cb);return this},
    subscribe(cb){this.status=cb;return this},
    emit(event,payload){this.listeners.get(event)?.({payload})},
    reconnect(){this.status?.('SUBSCRIBED')},
    join(){this.status?.('SUBSCRIBED')},
    close(){this.status?.('CLOSED')}
   };
   channels.push(obj);return obj;
  },
  removeChannel:async ch=>{removed.push(ch);return typeof removal==='function'?
   removal(ch):removal}
 };
 const snapshot=sight??{
  version:2,mapId:UUID.map,viewerId:UUID.viewer,cursor:0,
  environmentRevision:0,permissionGeneration:0,scope:'viewer',
  visiblePieces:[{kind:'token',id:UUID.token,x:0,y:0}]
 };
 const bridge=createObserverV3ChannelBridge({
  db,campaignId:UUID.campaign,mapId:UUID.map,viewerId:UUID.viewer,
  getContext:()=>context,
  createLegacyTransport:createWorldRealtimeTransport,
  fetchAuthorizedSight:async()=>snapshot,
  onMask:x=>{masks.push(x.reason);return mask},
  onRevoke:x=>revokes.push(x.reason),
  onPath:(item,meta)=>paths.push({item,meta}),
  onHide:(item,meta)=>hides.push({item,meta}),
  onVisionDirty:v=>visions.push(v),
  onObserverReady:v=>ready.push(v),
  onFault:x=>faults.push(x.code),
  activationEvidence:()=>currentEvidence?{
   clientProtocol:'v3',serverProtocol:'v3',serverMode:'serving-v3',
   oldV2PublisherFenced:true,oldV2ApiDenied:true,
   sceneSignedAndMasked:true
  }:null
 });
 return {bridge,db,channels,removed,masks,revokes,paths,hides,visions,ready,
  faults,get rpcCalls(){return rpcCalls},
  get identityChecks(){return identityChecks},
  get authRefreshes(){return authRefreshes},
  setActor:v=>{actor=v},setContext:v=>{context=v},
  enable:e=>{currentEvidence=e},
  packet:(seq=1)=>({
   version:2,mapId:UUID.map,viewerId:UUID.viewer,seq,
   environmentRevision:0,permissionGeneration:0,
   items:[{kind:'token',id:UUID.token,action:'path',
    path:[{x:0,y:0},{x:1,y:0}]}]
  })
 };
}
test('R135 source-only inherits pinned fully green R134 without approving production',()=>{
 assert.equal(R135_LIVE_ENABLED,false);
 assert.equal(manifest.workPackage,'B10-R18-135');
 assert.equal(manifest.parentPr,242);
 assert.equal(manifest.parentSha,'bdfa855c67cd5e96b7d1a9e3e6487c1fae9c1103');
 assert.equal(manifest.release,'NO_GO');
 assert.equal(manifest.parentFinalCiCombinedPassed,true);
 for(const flag of ['noHostedWrites','noLiveSourceEdits','noVersionedMigrations',
  'noMerge','noDeploy','noPaidResources'])assert.equal(manifest[flag],true,flag);
 assert.equal(manifest.productionReleaseAuthorized,false);
});
test('R135 never opens channel without independent rollout tripwire or signed actor',async()=>{
 const inactive=env({activated:false});
 assert.equal(await inactive.bridge.enter(),false);
 assert.equal(inactive.rpcCalls,0);
 assert.equal(inactive.identityChecks,0);
 assert.equal(inactive.channels.length,0);
 assert.equal(inactive.bridge.state().observerAuthorized,false);
 await inactive.bridge.dispose();
 const wrong=env({identity:UUID.other});
 assert.equal(await wrong.bridge.enter(),false);
 assert.equal(wrong.channels.length,0);
 assert.equal(wrong.rpcCalls,0);
 await wrong.bridge.dispose();
 const malicious=env({topic:'forge-world-scene-v2:'+UUID.map});
 assert.equal(await malicious.bridge.enter(),false);
 assert.equal(malicious.channels.length,0);
 await malicious.bridge.dispose();
 const hijack=env({topic:'forge-world-scene-v3:'+
  UUID.map+':'+UUID.other+':'+UUID.epoch});
 assert.equal(await hijack.bridge.enter(),false);
 assert.equal(hijack.channels.length,0);
 await hijack.bridge.dispose();
});
test('R135 V3 bridge wraps EXACT old V2 renderer contract and never subscribes to old topic',async()=>{
 const f=env();assert.equal(await f.bridge.enter(),true);
 assert.deepEqual(f.masks,['entry']);
 assert.equal(f.channels.length,1);
 assert.equal(f.channels[0].name,'forge-world-observer-v3:'+
  UUID.map+':'+UUID.viewer+':'+UUID.epoch);
 assert.equal(f.bridge.state().observerAuthorized,false);
 assert.equal(f.bridge.topic,'');
 f.channels[0].join();await settle();
 assert.equal(f.bridge.state().observerAuthorized,true);
 assert.equal(f.bridge.topic,f.channels[0].name);
 assert.equal(f.ready.length,1);
 assert.equal(f.ready[0].cursor,0);
 assert.equal(f.paths.length,0);
 assert.equal(f.bridge.state().backendLegacySubscriptions,0);
 assert.equal(f.bridge.state().productionReleaseAuthorized,false);
 await f.bridge.dispose();
 assert.deepEqual(f.removed,[f.channels[0]]);
});
test('R135 movement fast path uses existing signed cursor and no per-frame auth or RPC',async()=>{
 const f=env();
 assert.equal(await f.bridge.enter(),true);
 f.channels[0].join();await settle();
 assert.equal(f.bridge.state().observerAuthorized,true);
 const rpc=f.rpcCalls,identity=f.identityChecks;
 const authorized=f.packet(1);
 f.channels[0].emit('world-motion-v2',authorized);
 assert.equal(f.paths.length,1);
 assert.equal(f.paths[0].item.id,UUID.token);
 // Same signed cursor cannot be consumed twice.
 for(let i=0;i<200;i++)
  f.channels[0].emit('world-motion-v2',authorized);
 assert.equal(f.paths.length,1);
 assert.equal(f.rpcCalls,rpc);
 assert.equal(f.identityChecks,identity);
 assert.equal(f.bridge.state().backendLegacySubscriptions,0);
 await f.bridge.dispose();
});
test('R135 late frame and vision are not consumed until fresh signed sight arrives',async()=>{
 const frozen=deferred(),snapshot={
  version:2,mapId:UUID.map,viewerId:UUID.viewer,cursor:0,
  environmentRevision:0,permissionGeneration:0,scope:'viewer',
  visiblePieces:[{kind:'token',id:UUID.token,x:0,y:0}]
 };
 const f=env({sight:snapshot});
 const old=f.db.channel;
 // Reproduce delayed signed authorization by pausing host sight refresh.
 const bridge=createObserverV3ChannelBridge({
  db:f.db,campaignId:UUID.campaign,mapId:UUID.map,viewerId:UUID.viewer,
  getContext:()=>({campaignId:UUID.campaign,mapId:UUID.map,viewerId:UUID.viewer}),
  createLegacyTransport:createWorldRealtimeTransport,
  fetchAuthorizedSight:async()=>{await frozen.promise;return snapshot},
  onMask:()=>true,
  activationEvidence:()=>({
   clientProtocol:'v3',serverProtocol:'v3',serverMode:'serving-v3',
   oldV2PublisherFenced:true,oldV2ApiDenied:true,sceneSignedAndMasked:true
  }),
  onPath:()=>{throw Error('early movement must not render')},
  onVisionDirty:()=>{throw Error('early vision must not reveal')}
 });
 assert.equal(await bridge.enter(),true);
 const c=f.channels.at(-1);c.join();
 c.emit('world-motion-v2',f.packet());
 c.emit('world-vision-v2',{mapId:UUID.map,viewerId:UUID.viewer});
 assert.equal(bridge.state().observerAuthorized,false);
 assert.equal(bridge.topic,'');
 frozen.resolve();await settle();
 assert.equal(bridge.state().observerAuthorized,true);
 await bridge.dispose();
 assert.equal(f.db.channel,old);
});
test('R135 reconnect masks synchronously, retires old V3 epoch, rechecks signed identity and obtains a new topic',async()=>{
 const f=env({topic:count=>'forge-world-scene-v3:'+UUID.map+
  ':'+UUID.viewer+':'+(count===1?UUID.epoch:UUID.second)});
 assert.equal(await f.bridge.enter(),true);
 f.channels[0].join();await settle();
 assert.equal(f.bridge.state().observerAuthorized,true);
 const old=f.channels[0];
 old.reconnect();
 assert.equal(f.bridge.state().observerAuthorized,false);
 assert.equal(f.bridge.topic,'');
 old.emit('world-motion-v2',f.packet());
 assert.equal(f.paths.length,0);
 await settle();await settle();
 assert.equal(f.channels.length,2);
 assert.equal(f.rpcCalls,2);
 assert.equal(f.identityChecks,2);
 assert.equal(f.channels[1].name,'forge-world-observer-v3:'+
  UUID.map+':'+UUID.viewer+':'+UUID.second);
 assert.deepEqual(f.removed,[old]);
 // An old callback cannot revive itself even after a new channel opens.
 old.join();old.emit('world-motion-v2',f.packet());
 assert.equal(f.paths.length,0);
 f.channels[1].join();await settle();
 assert.equal(f.bridge.state().observerAuthorized,true);
 await f.bridge.dispose();
});
test('R135 timeout during removal permanently quarantines bridge, even on new begin',async()=>{
 const f=env({removal:'timed out'});
 await f.bridge.enter();f.channels[0].join();await settle();
 assert.equal(f.bridge.state().observerAuthorized,true);
 const n=f.rpcCalls;
 await f.bridge.lock('observer-server-disconnected');
 assert.equal(f.bridge.state().terminal,true);
 assert.equal(f.bridge.state().observerAuthorized,false);
 assert.equal(f.bridge.topic,'');
 assert.equal(f.bridge.state().unsubscribeFailures,1);
 assert.ok(f.faults.includes('channel_remove_not_confirmed'));
 await assert.rejects(f.bridge.enter(),{code:'disposed_or_terminal'});
 assert.equal(f.rpcCalls,n);
 await f.bridge.dispose();
});
test('R135 critical access denial cannot be reopened and old callbacks are rejected',async()=>{
 for(const reason of ['server-denied','maintenance-fence','account-changed','map-reassigned']){
  const f=env();await f.bridge.enter();f.channels[0].join();await settle();
  assert.equal(await f.bridge.lock(reason),true);
  assert.equal(f.bridge.state().terminal,true);
  assert.equal(f.bridge.state().observerAuthorized,false);
  assert.ok(f.masks.includes(reason));
  f.channels[0].emit('world-motion-v2',f.packet());
  assert.equal(f.paths.length,0);
  await assert.rejects(f.bridge.enter(),{code:'disposed_or_terminal'});
  await f.bridge.dispose();
 }
});
test('R135 delayed RPC, changed map, signed actor or stale transaction cannot subscribe',async()=>{
 const d=deferred();
 const f=env({rpcBlock:d});
 const pending=f.bridge.enter();await settle();
 await f.bridge.lock('server-denied');d.resolve();
 assert.equal(await pending,false);
 assert.equal(f.channels.length,0);
 await f.bridge.dispose();
 const x=env();x.setContext({campaignId:UUID.campaign,
  mapId:UUID.other,viewerId:UUID.viewer});
 assert.equal(await x.bridge.enter(),false);
 assert.equal(x.channels.length,0);await x.bridge.dispose();
});
test('R135 source and cutover ledger explicitly do not prove live old-socket cutoff',()=>{
 assert.equal(cutover.observedLegacySqlSenderCount,7);
 assert.equal(cutover.proposedR134Replacements,6);
 assert.equal(cutover.sceneR132GuardedSenders,1);
 assert.equal(cutover.originalHostedSenderMutations,0);
 assert.equal(cutover.oldSocketDeliveryStoppedInProduction,false);
 assert.equal(cutover.hostedSignedQaPerformed,false);
 assert.equal(cutover.v3BrowserIntegrated,false);
 assert.equal(cutover.realMovementPerformanceVerified,false);
 assert.equal(cutover.postgresChangesCovered,false);
 assert.equal(cutover.preissuedStorageUrlsRevoked,false);
 for(const term of ['NO_GO','R18-127','R18-123','R18-126',
  'R18-131','Postgres Changes','already-connected','movement',
  'Storage','signed','performance','83','67'])
  assert.ok(handoff.toLowerCase().includes(term.toLowerCase()),term);
 const src=read('src/engine/v2/RealtimeTransport.js');
 assert.ok(src.includes("'forge-world-v2:'"));
 const replacement=read('staging/world-v2-b10-r18-134-six-sender-v3-cutover/unapplied-six-legacy-observer-replacements.sql');
 assert.equal((replacement.match(/forge_observer_v3\.dispatch_authorized_observer_v3\(/g)||[]).length,7);
 assert.equal((replacement.match(/forge_observer_v3\.dispatch_trusted_vision_v3\(/g)||[]).length,1);
});
