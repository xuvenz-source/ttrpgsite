import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createStagedStreamQuarantine,R131_LIVE_ENABLED,
 R131_AUDITED_TABLES,R131_SIGNAL_REASONS}
 from '../staging/world-v2-b10-r18-131-stream-quarantine-contract/StreamRevocationQuarantine.mjs';
import {scanRealtimeSubscriptions} from
 '../staging/world-v2-b10-r18-130-rpc-realtime-subscription-audit/SourceRealtimeSubscriptionAudit.mjs';
import {createCampaignAccessSentinel} from
 '../staging/world-v2-b10-r18-123-access-revocation-guard/CampaignAccessSentinel.js';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const read=p=>readFileSync(join(root,p),'utf8');
const base='staging/world-v2-b10-r18-131-stream-quarantine-contract/';
const matrix=JSON.parse(read(base+'stream-risk-matrix.json'));
const manifest=JSON.parse(read(base+'manifest.json'));
const handoff=read('docs/testing/world-v2-r18-131-revocation-stream-cutoff-2026-11-20.md');
const A='00000000-0000-4000-8000-000000000101';
const P1='00000000-0000-4000-8000-000000000302';
const M='00000000-0000-4000-8000-000000000201';
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const event=(table,type='UPDATE',payload={})=>({
 schema:'public',table,eventType:type,new:{secret:'PRIVATE',...payload},
 old:{secret:'OLD_PRIVATE'}
});
function deferred(){
 let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b});
 return {promise,resolve,reject};
}
function fixture({permit=true,remove=()=>Promise.resolve('ok'),mask=()=>true}={}){
 let actor={campaignId:A,userId:P1,mapId:M},authorized=false,allow=permit;
 const calls=[],faults=[],masks=[],removed=[];
 const sentinel={
  begin:async scope=>{calls.push('signed-begin');
   assert.equal(scope.userId,P1);authorized=allow;return {allowed:allow};},
  notify:async reason=>{calls.push('signed-'+reason);
   authorized=allow;return {allowed:allow};},
  snapshot:()=>({allowed:authorized})
 };
 const db={removeChannel:async channel=>{
  removed.push(channel);
  return remove(channel);
 }};
 const gate=createStagedStreamQuarantine({
  sentinel,db,getContext:()=>actor,
  onMask:arg=>{masks.push(arg.reason);return mask(arg)},
  onFault:arg=>faults.push(arg.reason)
 });
 return {gate,sentinel,calls,removed,faults,masks,get actor(){return actor},
  setActor:v=>{actor=v},setAllowed:v=>{allow=v;authorized=v},
  scope:{campaignId:A,userId:P1,mapId:M}};
}
test('R131 is source-only with safe restrictive release boundaries',()=>{
 assert.equal(R131_LIVE_ENABLED,false);
 assert.equal(manifest.workPackage,'B10-R18-131');
 assert.equal(manifest.parentPr,238);
 assert.equal(manifest.parentSha,'bac02f6bc9769fd5ddc9dc3e6a91b4fa44c0b20e');
 assert.equal(manifest.decision,'NO_GO');
 for(const k of ['noHostedSqlWrites','noLiveSrcChanges','noVersionedMigrations',
  'noMerge','noDeploy','noPaidResources'])assert.equal(manifest[k],true,k);
 assert.equal(manifest.productionReleaseAuthorized,false);
 assert.equal(manifest.actualServerSideRevocationComplete,false);
 assert.equal(manifest.signedRealtimeQaPassed,false);
 assert.equal(manifest.preIssuedStorageUrlsRevoked,false);
});
test('R131 registers only after signed R123 proof, and synchronous view mask precedes proof',async()=>{
 const f=fixture();
 assert.equal(f.gate.snapshot().armed,false);
 assert.throws(()=>f.gate.registerChannel({},{table:'characters'},()=>{}),
  {code:'unverified_scope'});
 assert.equal(await f.gate.begin(f.scope),true);
 assert.deepEqual(f.masks,['begin']);
 assert.deepEqual(f.calls,['signed-begin']);
 assert.equal(f.gate.snapshot().armed,true);
 assert.equal(f.gate.snapshot().serverAuthorizationProven,false);
 assert.equal(f.gate.snapshot().oldSocketDeliveryStopped,false);
 await f.gate.dispose();
});
test('R131 integrates with genuine R123 signed-user and current membership checks',async()=>{
 let isMember=true,identity=P1,revocations=0;
 const check={
  select(){return this},
  eq(){return this},
  maybeSingle:async()=>({data:isMember?{user_id:P1,role:'player'}:null})
 };
 const db={
  auth:{getUser:async()=>({data:{user:{id:identity}}})},
  from:table=>{assert.equal(table,'campaign_members');return check},
  removeChannel:async()=> 'ok'
 };
 const sentinel=createCampaignAccessSentinel({
  db,getContext:()=>({campaignId:A,userId:P1}),
  onLock:()=>{},onAllow:()=>{},
  onRevoked:()=>{revocations++}
 });
 const masks=[];
 const gate=createStagedStreamQuarantine({
  sentinel,db,getContext:()=>({campaignId:A,userId:P1,mapId:M}),
  onMask:x=>{masks.push(x.reason);return true}
 });
 const scope={campaignId:A,userId:P1,mapId:M};
 assert.equal(await gate.begin(scope),true);
 let delivered=0;
 const old=gate.registerChannel({},{table:'chat_messages'},()=>delivered++);
 assert.equal(old.callback(event('chat_messages')),true);
 isMember=false;
 const pending=gate.signal('membership-hint');
 assert.equal(old.callback(event('chat_messages')),false);
 assert.equal(await pending,false);
 assert.equal(revocations,1);
 assert.equal(gate.snapshot().armed,false);
 assert.equal(delivered,1);
 assert.ok(masks.includes('membership-hint'));
 isMember=true;
 identity='00000000-0000-4000-8000-000000000304';
 assert.equal(await gate.begin(scope),false,'wrong signed actor cannot reactivate');
 identity=P1;
 assert.equal(await gate.begin(scope),true,'new explicit entry rechecks membership');
 assert.equal(old.callback(event('chat_messages')),false);
 await gate.dispose();sentinel.dispose();
});

test('R131 refresh-only listeners never see old/new row content, even DELETE',async()=>{
 const f=fixture(),seen=[];
 await f.gate.begin(f.scope);
 const ch={},lease=f.gate.registerChannel(ch,
  {table:'chat_messages',mode:'refresh-only'},v=>seen.push(v));
 assert.equal(lease.callback(event('chat_messages','UPDATE')),true);
 assert.equal(lease.callback(event('chat_messages','DELETE')),true);
 assert.deepEqual(seen,[
  {kind:'refresh-only',table:'chat_messages',eventType:'UPDATE'},
  {kind:'refresh-only',table:'chat_messages',eventType:'DELETE'}
 ]);
 for(const obj of seen){
  assert.deepEqual(Object.keys(obj).sort(),['eventType','kind','table']);
  assert.equal(JSON.stringify(obj).includes('PRIVATE'),false);
 }
 assert.equal(lease.callback(event('characters','UPDATE')),false);
 assert.equal(lease.callback({...event('chat_messages'),eventType:'TRUNCATE'}),false);
 await f.gate.dispose();
 assert.deepEqual(f.removed,[ch]);
});
test('R131 permits multiple table handlers on one channel; retires it exactly once',async()=>{
 const f=fixture(),seen=[];await f.gate.begin(f.scope);
 const channel={};
 const first=f.gate.registerChannel(channel,{table:'characters'},x=>seen.push(x.table));
 const second=f.gate.registerChannel(channel,{table:'campaigns'},x=>seen.push(x.table));
 assert.equal(f.gate.snapshot().registeredChannels,1);
 assert.equal(first.callback(event('characters')),true);
 assert.equal(second.callback(event('campaigns')),true);
 assert.deepEqual(seen,['characters','campaigns']);
 assert.equal(await f.gate.lock('membership-hint'),true);
 assert.deepEqual(f.removed,[channel]);
 assert.equal(first.callback(event('characters')),false);
 assert.equal(second.callback(event('campaigns')),false);
 assert.equal(f.gate.snapshot().armed,false);
});
test('R131 validated payload requires strict host validation and strips raw DELETE',async()=>{
 const f=fixture(),seen=[];
 await f.gate.begin(f.scope);const ch={};
 assert.throws(()=>f.gate.registerChannel(ch,
  {table:'map_tokens',mode:'validated-payload'},()=>{}),
  {code:'invalid_subscription_contract'});
 assert.throws(()=>f.gate.registerChannel(ch,
  {table:'chat_messages',mode:'validated-payload',validator:()=>true},()=>{}),
  {code:'invalid_subscription_contract'});
 const lease=f.gate.registerChannel(ch,{table:'map_tokens',
  mode:'validated-payload',validator:x=>x.new?.approved===true},
  (value,isCurrent)=>seen.push({value,live:isCurrent()}));
 assert.equal(lease.callback(event('map_tokens','UPDATE',{approved:false})),false);
 assert.equal(lease.callback(event('map_tokens','UPDATE',{approved:true})),true);
 assert.equal(seen[0].value.new.approved,true);
 assert.equal(seen[0].live,true);
 assert.equal(lease.callback(event('map_tokens','DELETE')),true);
 assert.deepEqual(seen[1].value,
  {kind:'refresh-only',table:'map_tokens',eventType:'DELETE'});
 assert.equal(JSON.stringify(seen[1].value).includes('OLD_PRIVATE'),false);
 await f.gate.dispose();
});
test('R131 old callbacks are revoked synchronously; reconnect re-probes before new channel',async()=>{
 const f=fixture(),events=[];
 await f.gate.begin(f.scope);
 const old={};
 const oldLease=f.gate.registerChannel(old,{table:'characters'},x=>events.push(x));
 const pending=f.gate.signal('reconnect');
 assert.deepEqual(f.masks,['begin','reconnect']);
 assert.equal(oldLease.callback(event('characters')),false);
 assert.equal(f.gate.snapshot().armed,false);
 assert.equal(await pending,true);
 assert.equal(f.gate.snapshot().armed,true);
 assert.deepEqual(f.removed,[old]);
 assert.ok(f.calls.includes('signed-reconnect'));
 assert.throws(()=>f.gate.registerChannel(old,{table:'characters'},()=>{}),
  {code:'old_channel_reuse'});
 const newChannel={};
 const current=f.gate.registerChannel(newChannel,{table:'characters'},x=>events.push(x));
 assert.equal(current.callback(event('characters')),true);
 assert.equal(oldLease.callback(event('characters')),false);
 assert.equal(events.length,1);
 await f.gate.dispose();
});
test('R131 critical server-denied, map reassignment and maintenance never auto-reopen',async()=>{
 for(const reason of ['server-denied','account-changed','map-reassigned','maintenance-fence']){
  const f=fixture();
  await f.gate.begin(f.scope);
  const calls=f.calls.length;
  const ch={},lease=f.gate.registerChannel(ch,{table:'characters'},()=>{throw Error('leak')});
  const pending=f.gate.signal(reason);
  assert.equal(lease.callback(event('characters')),false);
  assert.equal(await pending,false);
  assert.equal(f.calls.length,calls,'unexpected revalidation on '+reason);
  assert.equal(f.gate.snapshot().armed,false);
  assert.deepEqual(f.removed,[ch]);
  await f.gate.dispose();
 }
});
test('R131 late signed membership or late async UI commit cannot reopen a locked scope',async()=>{
 const done=deferred();
 const f=fixture();
 f.sentinel.begin=async()=>{f.calls.push('pending-signed-begin');await done.promise;
  return {allowed:true}};
 // Module references sentinel object; replace method, but snapshot uses initial
 // cached authorization state, so even a resolved signed call is insufficient
 // without the sentinel's own authorized snapshot.
 const pending=f.gate.begin(f.scope);
 await tick();await tick();
 assert.equal(f.gate.snapshot().armed,false);
 const critical=f.gate.lock('server-denied');
 done.resolve();
 assert.equal(await pending,false);
 await critical;
 assert.equal(f.gate.snapshot().armed,false);

 const h=fixture(),delayed=deferred();await h.gate.begin(h.scope);
 let committed=false;
 const lease=h.gate.registerChannel({}, {table:'characters'},
  async(_,isCurrent)=>{await delayed.promise;if(isCurrent())committed=true});
 assert.equal(lease.callback(event('characters')),true);
 const removing=h.gate.lock('membership-hint');
 delayed.resolve();await removing;await tick();
 assert.equal(committed,false);
 await h.gate.dispose();
});
test('R131 failed channel removal keeps next signed re-entry locked',async()=>{
 const f=fixture({remove:()=>Promise.reject(Error('disconnect failed'))});
 await f.gate.begin(f.scope);
 f.gate.registerChannel({}, {table:'characters'},()=>{});
 const result=await f.gate.signal('reconnect');
 assert.equal(result,false);
 assert.equal(f.gate.snapshot().armed,false);
 assert.equal(f.gate.snapshot().removalFailures,1);
 assert.ok(f.faults.includes('channel_unsubscribe_failed'));
 assert.deepEqual(f.calls,['signed-begin']);
 await f.gate.dispose();
});
test('R131 Supabase removeChannel timed out is never treated as a successful disconnect',async()=>{
 const f=fixture({remove:async()=> 'timed out'});
 await f.gate.begin(f.scope);
 const ch={},lease=f.gate.registerChannel(ch,{table:'characters'},()=>{throw Error('leaked')});
 const pending=f.gate.signal('reconnect');
 assert.equal(lease.callback(event('characters')),false);
 assert.equal(await pending,false);
 assert.equal(f.gate.snapshot().armed,false);
 assert.equal(f.gate.snapshot().removalFailures,1);
 assert.ok(f.faults.includes('channel_unsubscribe_failed'));
 assert.deepEqual(f.calls,['signed-begin']);
 await f.gate.dispose();
});

test('R131 rejects non-synchronous masks, invalid channels and stale scope',async()=>{
 const noMask=fixture({mask:()=>Promise.resolve(true)});
 await assert.rejects(noMask.gate.begin(noMask.scope),
  {code:'synchronous_mask_failed'});
 assert.equal(noMask.gate.snapshot().armed,false);
 assert.ok(noMask.faults.includes('mask_not_synchronous'));

 const f=fixture();await f.gate.begin(f.scope);
 assert.throws(()=>f.gate.registerChannel({}, {table:'unknown_table'},()=>{}),
  {code:'invalid_subscription_contract'});
 await assert.rejects(f.gate.signal('invalid_reason'),{code:'invalid_signal'});
 const ch={},lease=f.gate.registerChannel(ch,{table:'campaigns'},()=>{throw Error('unexpected')});
 f.setActor({...f.scope,mapId:'00000000-0000-4000-8000-000000000202'});
 assert.equal(lease.callback(event('campaigns')),false);
 assert.equal(f.gate.snapshot().armed,false);
 await f.gate.dispose();
});
test('R131 supports event delivery without any membership RPC or per-frame network polling',async()=>{
 const f=fixture();await f.gate.begin(f.scope);
 const before=f.calls.length;
 let count=0;
 const lease=f.gate.registerChannel({}, {table:'campaigns'},()=>count++);
 for(let i=0;i<200;i++)assert.equal(lease.callback(event('campaigns')),true);
 assert.equal(count,200);
 assert.equal(f.calls.length,before);
 assert.equal(f.gate.snapshot().registeredChannels,1);
 assert.equal(R131_SIGNAL_REASONS.includes('movement'),false);
 assert.equal(R131_SIGNAL_REASONS.includes('frame'),false);
 await f.gate.dispose();
});
test('R131 classification covers exactly the 19 pinned source handlers and broadcast surfaces',()=>{
 const scanned=scanRealtimeSubscriptions(root);
 const key=x=>[x.file,x.table,x.event||x.observedEvent].join('|');
 const expected=new Set(scanned.map(key));
 assert.equal(scanned.length,19);
 assert.equal(matrix.observedHandlers,19);
 assert.equal(matrix.wildcardDeclarations,16);
 assert.equal(matrix.observedFiles,7);
 assert.equal(matrix.handlers.length,19);
 assert.equal(matrix.validatedPayloadCandidates,4);
 assert.equal(matrix.refreshOnlyCandidates,15);
 assert.equal(matrix.broadcastSurfaces.length,4);
 assert.equal(R131_AUDITED_TABLES.length,17);
 assert.ok(matrix.handlers.every(x=>expected.has(key(x))));
 for(const h of matrix.handlers){
  assert.equal(h.serverSignedRealtimeProof,false);
  if(h.observedEvent==='*')assert.equal(h.proposedDeleteTreatment,'sanitized-requery-hint');
  else assert.equal(h.proposedDeleteTreatment,'not-subscribed');
 }
 assert.ok(matrix.broadcastSurfaces.some(x=>x.privateConfigObserved===false));
 assert.ok(matrix.broadcastSurfaces.some(x=>x.topic.startsWith('forge-world-scene-v2:')));
 assert.equal(matrix.productionReady,false);
 for(const term of ['NO_GO','19','16','67','R18-123','R18-126','old socket','#231','server-side'])
  assert.ok(handoff.toLowerCase().includes(term.toLowerCase()),term);
});
