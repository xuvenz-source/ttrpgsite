import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
 createCampaignAccessSentinel,R123_LIVE_ENABLED,R123_PASSIVE_PROBE_MS,R123_TRIGGERS
} from '../staging/world-v2-b10-r18-123-access-revocation-guard/CampaignAccessSentinel.js';
import {
 createCampaignRevocationTeardown,R123_SYNC_PURGE_STEPS,R123_ASYNC_PURGE_STEPS
} from '../staging/world-v2-b10-r18-123-access-revocation-guard/CampaignRevocationTeardown.js';

const C='00000000-0000-4000-8000-000000000101';
const C2='00000000-0000-4000-8000-000000000102';
const P='00000000-0000-4000-8000-000000000302';
const D='00000000-0000-4000-8000-000000000301';
function deferred(){
 let resolve,reject;
 const promise=new Promise((ok,no)=>{resolve=ok;reject=no});
 return {promise,resolve,reject};
}
function setup(overrides={}){
 let current=overrides.context??{campaignId:C,userId:P};
 let now=0,member=overrides.member??{user_id:P,role:'player'};
 let membership=overrides.membership??(async()=>({data:member,error:null}));
 let identity=overrides.identity??(async()=>({data:{user:{id:current.userId}},error:null}));
 const events=[],requests=[];
 const db={
  auth:{getUser:()=>identity()},
  from:table=>{
   requests.push({method:'from',table});
   const query={
    select:columns=>{requests.push({method:'select',columns});return query;},
    eq:(column,value)=>{requests.push({method:'eq',column,value});return query;},
    maybeSingle:()=>{requests.push({method:'maybeSingle'});return membership();}
   };
   return query;
  }
 };
 const guard=createCampaignAccessSentinel({
  db,getContext:()=>current,now:()=>now,
  onLock:x=>events.push(['lock',x.reason]),
  onAllow:x=>events.push(['allow',x.reason]),
  onRevoked:x=>events.push(['revoked',x.reason]),
  onSuspended:x=>events.push(['suspended',x.code])
 });
 return {guard,events,requests,
  setMember:x=>{member=x;membership=async()=>({data:member,error:null});},
  setMembership:fn=>{membership=fn;},
  setIdentity:fn=>{identity=fn;},
  setContext:x=>{current=x;},
  setNow:x=>{now=x;},
  queryCount:()=>requests.filter(x=>x.method==='maybeSingle').length};
}
async function flush(){await Promise.resolve();await Promise.resolve();await Promise.resolve();}

test('R123 is dormant outside release-pinned src and does not hook the movement loop',()=>{
 const src=readFileSync(new URL('../src/TabletopApp.jsx',import.meta.url),'utf8');
 const board=readFileSync(new URL('../src/engine/v2/WorldV2Board.jsx',import.meta.url),'utf8');
 assert.equal(R123_LIVE_ENABLED,false);
 assert.equal(R123_PASSIVE_PROBE_MS,60_000);
 assert.deepEqual([...R123_TRIGGERS],[
  'periodic','focus','reconnect','membership-hint','server-denied','manual'
 ]);
 assert.doesNotMatch(src,/CampaignAccessSentinel|CampaignRevocationTeardown/);
 assert.doesNotMatch(board,/CampaignAccessSentinel|CampaignRevocationTeardown/);
});

test('R123 begins locked and grants access only after exact signed RLS membership proof',async()=>{
 const f=setup();
 const started=f.guard.begin({campaignId:C,userId:P});
 assert.equal(f.guard.snapshot().allowed,false);
 assert.deepEqual(f.events,[['lock','enter']]);
 const result=await started;
 assert.equal(result.phase,'authorized');
 assert.equal(result.allowed,true);
 assert.deepEqual(f.events,[['lock','enter'],['allow','membership_verified']]);
 assert.deepEqual(f.requests,[
  {method:'from',table:'campaign_members'},
  {method:'select',columns:'user_id,role'},
  {method:'eq',column:'campaign_id',value:C},
  {method:'eq',column:'user_id',value:P},
  {method:'maybeSingle'}
 ]);
});

test('R123 a DM role is valid if and only if it was returned by current row',async()=>{
 const f=setup({context:{campaignId:C,userId:D},
  member:{user_id:D,role:'dm'}});
 assert.equal((await f.guard.begin({campaignId:C,userId:D})).allowed,true);
});

test('R123 missing signed membership locks and marks revoked exactly once',async()=>{
 const f=setup({member:null});
 const r=await f.guard.begin({campaignId:C,userId:P});
 assert.equal(r.phase,'revoked');
 assert.deepEqual(f.events,[['lock','enter'],['revoked','membership_absent']]);
 await f.guard.notify('periodic');await f.guard.notify('reconnect');
 assert.equal(f.queryCount(),1);
 assert.equal(f.events.filter(([x])=>x==='revoked').length,1);
});

test('R123 external removal detected by passive recheck locks without polling on movement',async()=>{
 const f=setup();
 await f.guard.begin({campaignId:C,userId:P});
 for(let i=0;i<1000;i++)await f.guard.notify('periodic');
 assert.equal(f.queryCount(),1);
 assert.equal(f.events.filter(x=>x[0]==='lock').length,1);
 f.setMember(null);f.setNow(60_001);
 const r=await f.guard.notify('periodic');
 assert.equal(r.phase,'revoked');
 assert.deepEqual(f.events.slice(-2),[
  ['lock','revoked'],['revoked','membership_absent']
 ]);
 assert.equal(f.queryCount(),2);
});

test('R123 healthy periodic recheck does NOT remount renderer or fog',async()=>{
 const f=setup();
 await f.guard.begin({campaignId:C,userId:P});
 f.setNow(61_000);
 await f.guard.notify('periodic');
 assert.equal(f.queryCount(),2);
 assert.deepEqual(f.events,[['lock','enter'],['allow','membership_verified']]);
});

test('R123 untrusted membership hint masks immediately but requires server proof',async()=>{
 const f=setup();
 await f.guard.begin({campaignId:C,userId:P});
 const promise=f.guard.notify('membership-hint');
 assert.equal(f.guard.snapshot().allowed,false);
 assert.deepEqual(f.events.at(-1),['lock','revalidating']);
 await promise;
 assert.equal(f.guard.snapshot().allowed,true);
 assert.deepEqual(f.events.at(-1),['allow','membership_verified']);
 assert.equal(f.queryCount(),2);
});

test('R123 all urgent sources lock before rechecking; no DELETE payload is trusted',async()=>{
 for(const signal of ['focus','reconnect','server-denied','manual']){
  const f=setup();await f.guard.begin({campaignId:C,userId:P});
  const p=f.guard.notify(signal);
  assert.equal(f.guard.snapshot().allowed,false);
  assert.equal(f.events.at(-1)[0],'lock');
  await p;assert.equal(f.guard.snapshot().allowed,true);
 }
});

test('R123 identity changed before request never queries membership',async()=>{
 const f=setup({identity:async()=>({data:{user:{id:D}},error:null})});
 const result=await f.guard.begin({campaignId:C,userId:P});
 assert.equal(result.phase,'suspended');assert.equal(f.queryCount(),0);
 assert.deepEqual(f.events.at(-1),['suspended','identity_unverified']);
});

test('R123 membership query error is unverified and does not prove revocation',async()=>{
 const f=setup({membership:async()=>({data:null,error:{code:'42501'}})});
 assert.equal((await f.guard.begin({campaignId:C,userId:P})).phase,'suspended');
 assert.equal(f.events.filter(([x])=>x==='revoked').length,0);
 assert.deepEqual(f.events.at(-1),['suspended','membership_query_failed']);
});

test('R123 rejects malformed proof, wrong viewer and user-editable role claims',async()=>{
 for(const row of [undefined,{}, {user_id:D,role:'dm'},
  {user_id:P,role:'owner'}, {user_id:P,role:null}]){
  const f=setup({membership:async()=>({data:row,error:null})});
  assert.equal((await f.guard.begin({campaignId:C,userId:P})).allowed,false);
  assert.equal(f.events.filter(([x])=>x==='allow').length,0);
 }
});

test('R123 suspended network uncertainty can recover after an explicit verified recheck',async()=>{
 const f=setup({membership:async()=>{throw Error('private SQL details')}});
 assert.equal((await f.guard.begin({campaignId:C,userId:P})).phase,'suspended');
 f.setMember({user_id:P,role:'player'});
 const result=await f.guard.notify('manual');
 assert.equal(result.phase,'authorized');
 assert.equal(f.queryCount(),2);
 assert.equal(f.events.filter(([x])=>x==='revoked').length,0);
});

test('R123 urgent signal while a background proof is in-flight fences stale success',async()=>{
 const hold=deferred();
 let n=0;
 const f=setup({membership:async()=>{
  n++;return n===1?hold.promise:{data:null,error:null};
 }});
 const p=f.guard.begin({campaignId:C,userId:P});
 await flush();
 assert.equal(f.queryCount(),1);
 const urgent=f.guard.notify('server-denied');
 hold.resolve({data:{user_id:P,role:'player'},error:null});
 await Promise.all([p,urgent]);
 assert.equal(f.guard.snapshot().phase,'revoked');
 assert.equal(f.events.filter(([x])=>x==='allow').length,0);
 assert.equal(f.queryCount(),2);
});

test('R123 switching campaign mid-request ignores stale completed proof',async()=>{
 const hold=deferred();
 let n=0;
 const f=setup({membership:async()=>{
  n++;return n===1?hold.promise:{data:{user_id:P,role:'player'},error:null};
 }});
 const old=f.guard.begin({campaignId:C,userId:P});
 await flush();f.setContext({campaignId:C2,userId:P});
 const latest=f.guard.begin({campaignId:C2,userId:P});
 hold.resolve({data:{user_id:P,role:'player'},error:null});
 await Promise.all([old,latest]);
 assert.equal(f.queryCount(),2);
 assert.equal(f.events.filter(([x])=>x==='allow').length,1);
 assert.equal(f.guard.snapshot().allowed,true);
 assert.ok(f.requests.some(x=>x.method==='eq'&&x.column==='campaign_id'&&x.value===C2));
});

test('R123 context changed without explicit begin cannot reopen an old view',async()=>{
 const hold=deferred();
 const f=setup({membership:async()=>hold.promise});
 const old=f.guard.begin({campaignId:C,userId:P});
 await flush();f.setContext({campaignId:C2,userId:P});
 hold.resolve({data:{user_id:P,role:'player'},error:null});
 await old;
 assert.equal(f.guard.snapshot().allowed,false);
 assert.deepEqual(f.events.at(-1),['suspended','context_changed']);
});

test('R123 close and dispose invalidate pending promises without late access',async()=>{
 const hold=deferred();
 const f=setup({membership:async()=>hold.promise});
 const old=f.guard.begin({campaignId:C,userId:P});
 await flush();f.guard.close();
 assert.equal(f.guard.snapshot().phase,'closed');
 hold.resolve({data:{user_id:P,role:'player'},error:null});
 await old;
 assert.equal(f.events.filter(([x])=>x==='allow').length,0);
 f.guard.dispose();f.guard.dispose();
 assert.equal(f.guard.snapshot().phase,'disposed');
 assert.throws(()=>f.guard.begin({campaignId:C,userId:P}),{code:'disposed'});
});

test('R123 malformed new context locks old data immediately and fails closed',async()=>{
 const f=setup();await f.guard.begin({campaignId:C,userId:P});
 await f.guard.begin({campaignId:'evil',userId:P});
 assert.equal(f.guard.snapshot().allowed,false);
 assert.equal(f.events.at(-1)[1],'invalid_context');
});

test('R123 explicit reentry after DM reinstatement needs fresh proof, never a hint',async()=>{
 const f=setup({member:null});
 await f.guard.begin({campaignId:C,userId:P});
 f.setMember({user_id:P,role:'player'});
 await f.guard.notify('membership-hint');
 assert.equal(f.guard.snapshot().phase,'revoked');
 assert.equal(f.queryCount(),1);
 const result=await f.guard.begin({campaignId:C,userId:P});
 assert.equal(result.phase,'authorized');
 assert.equal(f.queryCount(),2);
});

test('R123 does not allow a short passive interval that would overload free-tier DB',()=>{
 assert.throws(()=>createCampaignAccessSentinel({db:{from(){}},
  getContext(){},onLock(){},onAllow(){},onRevoked(){},passiveProbeMs:1000
 }),{code:'invalid_configuration'});
});

function teardownFixture(overrides={}){
 const calls=[],steps={};
 for(const key of [...R123_SYNC_PURGE_STEPS,...R123_ASYNC_PURGE_STEPS]){
  steps[key]=overrides[key]??(()=>{calls.push(key);return true});
 }
 return {calls,controller:createCampaignRevocationTeardown(steps)};
}
test('R123 mandatory teardown runs all synchronous masks and purges before unmount await',async()=>{
 const barrier=deferred();
 const f=teardownFixture({awaitConfirmedUnmount:()=>{
  f.calls.push('awaitConfirmedUnmount');return barrier.promise;
 }});
 const r=f.controller.revoke();
 assert.deepEqual(f.calls,[...R123_SYNC_PURGE_STEPS,'awaitConfirmedUnmount']);
 assert.equal(f.calls.includes('clearSignedAssetUrls'),false);
 barrier.resolve(true);
 const end=await r.finished;
 assert.equal(end.status,'complete');
 assert.equal(end.signedAssetCacheClearAttempted,true);
 assert.ok(f.calls.indexOf('clearSignedAssetUrls')>f.calls.indexOf('awaitConfirmedUnmount'));
 assert.ok(f.calls.indexOf('clearSignedAssetUrls')>f.calls.indexOf('unsubscribeAllCampaignChannels'));
 assert.ok(f.calls.indexOf('clearSignedAssetUrls')>f.calls.indexOf('disposeWorldV2Runtime'));
});

test('R123 unmount failure never clears signed asset URL store',async()=>{
 const f=teardownFixture({awaitConfirmedUnmount:()=>false});
 const r=await f.controller.revoke().finished;
 assert.equal(r.status,'incomplete');
 assert.equal(r.signedAssetCacheClearAttempted,false);
 assert.deepEqual(f.calls,R123_SYNC_PURGE_STEPS);
 assert.ok(r.failedSteps.includes('awaitConfirmedUnmount'));
});
test('R123 failed channel unsubscribe prevents reissuing fresh signed URLs',async()=>{
 const f=teardownFixture({unsubscribeAllCampaignChannels:()=>false});
 const r=await f.controller.revoke().finished;
 assert.equal(r.status,'incomplete');
 assert.equal(r.signedAssetCacheClearAttempted,false);
 assert.equal(f.calls.includes('clearSignedAssetUrls'),false);
 assert.ok(r.failedSteps.includes('unsubscribeAllCampaignChannels'));
});
test('R123 a broken optional cleanup does not block mask, movement stop and hub route',async()=>{
 const f=teardownFixture({clearHandoutsAndTools:()=>{throw Error('private detail')}});
 const r=await f.controller.revoke().finished;
 assert.equal(r.status,'incomplete');
 assert.ok(r.failedSteps.includes('clearHandoutsAndTools'));
 assert.equal(f.calls.includes('stopMovementAndPreview'),true);
 assert.equal(f.calls.includes('routeToCampaignHub'),true);
 assert.doesNotMatch(JSON.stringify(r),/private detail/);
});
test('R123 promise-returning synchronous mask is a rejected integration pattern',async()=>{
 const f=teardownFixture({maskCampaign:async()=>true});
 const r=await f.controller.revoke().finished;
 assert.equal(r.status,'incomplete');
 assert.ok(r.failedSteps.includes('maskCampaign'));
});
test('R123 duplicate revoke invocation executes teardown only once',async()=>{
 const f=teardownFixture();
 const first=f.controller.revoke();
 const second=f.controller.revoke();
 assert.equal(first.finished,second.finished);
 assert.equal((await first.finished).status,'complete');
 assert.equal(f.calls.filter(x=>x==='maskCampaign').length,1);
});
test('R123 missing teardown surface is not silently skipped',()=>{
 assert.throws(()=>createCampaignRevocationTeardown({
  maskCampaign(){return true}
 }),{code:'missing_required_step'});
});
test('R123 guard + teardown execute once after verified revocation, not untrusted hint',async()=>{
 const f=setup(),teardown=teardownFixture();
 const c=createCampaignAccessSentinel({
  db:{
   auth:{getUser:async()=>({data:{user:{id:P}},error:null})},
   from:()=>{const q={
    select:()=>q,eq:()=>q,maybeSingle:async()=>({data:null,error:null})
   };return q;}
  },
  getContext:()=>({campaignId:C,userId:P}),
  onLock:x=>f.events.push(['lock',x.reason]),
  onAllow:()=>f.events.push(['allow']),
  onRevoked:()=>teardown.controller.revoke()
 });
 await c.begin({campaignId:C,userId:P});
 assert.equal((await teardown.controller.revoke().finished).status,'complete');
 assert.equal(teardown.calls.filter(x=>x==='maskCampaign').length,1);
});
