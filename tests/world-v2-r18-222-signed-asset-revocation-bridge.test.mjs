import test from 'node:test';
import assert from 'node:assert/strict';
import {createSignedAssetStore} from '../staging/world-v2-b10-r18-221-signed-asset-revocation-lock/SignedAssetUrlsRevocationCandidate.js';
import {createSignedAssetRevocationBridge} from '../staging/world-v2-b10-r18-222-signed-asset-revocation-bridge/SignedAssetRevocationBridge.js';
import {R123_SYNC_PURGE_STEPS,R123_ASYNC_PURGE_STEPS} from '../staging/world-v2-b10-r18-123-access-revocation-guard/CampaignRevocationTeardown.js';

const CAMPAIGN='00000000-0000-4000-8000-000000000111';
const PLAYER='00000000-0000-4000-8000-000000000222';
function deferred(){
 let resolve;
 const promise=new Promise(ok=>resolve=ok);
 return {promise,resolve};
}
const tick=async()=>{for(let k=0;k<6;k++)await Promise.resolve();};

function fixture(overrides={}){
 const events=[];
 let member={user_id:PLAYER,role:'player'};
 let membership=async()=>({data:member,error:null});
 let signed=0;
 const assetStore=overrides.assetStore??createSignedAssetStore({
  now:()=>0,setTimer:()=>1,clearTimer:()=>{},
  sign:async()=>({data:{signedUrl:'invented-asset-'+(++signed)},error:null})
 });
 const db={
  auth:{getUser:async()=>({data:{user:{id:PLAYER}},error:null})},
  from:table=>{
   if(table!=='campaign_members')throw Error('unexpected fictional table');
   const q={select:()=>q,eq:()=>q,maybeSingle:()=>membership()};
   return q;
  }
 };
 const teardownSteps={};
 for(const name of [...R123_SYNC_PURGE_STEPS,...R123_ASYNC_PURGE_STEPS]){
  teardownSteps[name]=()=>{events.push(name);return true};
 }
 delete teardownSteps.clearSignedAssetUrls;
 Object.assign(teardownSteps,overrides.teardownSteps||{});
 const bridge=createSignedAssetRevocationBridge({
  db,getContext:()=>({campaignId:CAMPAIGN,userId:PLAYER}),
  maskCampaign:info=>{events.push('mask-'+info.reason);return true},
  allowCampaign:()=>{events.push('allow');return true},
  onSuspended:info=>{events.push('suspended-'+info.code)},
  assetStore,teardownSteps
 });
 return {
  bridge,assetStore,events,
  remove:()=>{member=null},
  member:()=>{member={user_id:PLAYER,role:'player'}},
  failMembership:()=>{membership=async()=>({data:null,error:{code:'42501'}})},
  countSigned:()=>signed
 };
}

test('R222 only confirmed missing membership seals signer before asynchronous unmount',async()=>{
 const barrier=deferred(),f=fixture({
  teardownSteps:{
   awaitConfirmedUnmount:()=>{f.events.push('awaitConfirmedUnmount');return barrier.promise}
  }
 });
 await f.bridge.begin({campaignId:CAMPAIGN,userId:PLAYER});
 assert.equal(f.bridge.snapshot().allowed,true);
 const visible=[];
 const cancel=f.assetStore.subscribe({},'invented','image.png',value=>visible.push(value));
 await tick();
 assert.equal(f.countSigned(),1);
 assert.equal(visible.at(-1),'invented-asset-1');
 f.remove();
 const notify=f.bridge.notify('manual');
 assert.equal(f.events.at(-1),'mask-revalidating'); // synchronous mask before query
 await notify;
 assert.equal(f.bridge.snapshot().phase,'revoked');
 assert.equal(f.bridge.snapshot().signedAssetLockConfirmed,true);
 assert.equal(f.assetStore.isRevocationLocked(),true);
 assert.equal(visible.at(-1),'');
 assert.equal(f.countSigned(),1);
 assert.equal(await f.assetStore.get({},'invented','image.png'),'');
 f.assetStore.clear(); // must NOT reissue
 await tick();
 assert.equal(f.countSigned(),1);
 assert.ok(f.events.includes('awaitConfirmedUnmount'));
 assert.equal(f.events.includes('clearSignedAssetUrls'),false);
 barrier.resolve(true);
 const completed=await f.bridge.getRevocationCompletion();
 assert.equal(completed.status,'complete');
 assert.equal(completed.signedAssetLockConfirmed,true);
 assert.equal(completed.signedAssetCacheClearAttempted,true);
 assert.equal(f.countSigned(),1);
 cancel();
});

test('R222 untrusted hint with currently verified membership never permanently revokes cache',async()=>{
 const f=fixture();
 await f.bridge.begin({campaignId:CAMPAIGN,userId:PLAYER});
 await f.bridge.notify('membership-hint');
 assert.equal(f.bridge.snapshot().allowed,true);
 assert.equal(f.bridge.snapshot().revocationStarted,false);
 assert.equal(f.assetStore.isRevocationLocked(),false);
 assert.equal(f.bridge.getRevocationCompletion(),null);
});

test('R222 RLS/network failure remains unknown and masked, not proved revoked',async()=>{
 const f=fixture();
 await f.bridge.begin({campaignId:CAMPAIGN,userId:PLAYER});
 f.failMembership();
 const current=f.bridge.notify('manual');
 assert.equal(f.events.at(-1),'mask-revalidating');
 await current;
 assert.equal(f.bridge.snapshot().phase,'suspended');
 assert.equal(f.bridge.snapshot().allowed,false);
 assert.equal(f.bridge.snapshot().revocationStarted,false);
 assert.equal(f.bridge.getRevocationCompletion(),null);
 // This alone is NOT enough to stop server-side sign issuance.
 assert.equal(f.assetStore.isRevocationLocked(),false);
});

test('R222 missing required teardown hooks and malformed store refuse bridge creation',()=>{
 const f=fixture();
 const base={
  db:{auth:{getUser:()=>{}},from:()=>{}},
  getContext:()=>({campaignId:CAMPAIGN,userId:PLAYER}),
  maskCampaign:()=>true,allowCampaign:()=>true,onSuspended:()=>{},
  assetStore:f.assetStore,teardownSteps:{maskCampaign:()=>true}
 };
 assert.throws(()=>createSignedAssetRevocationBridge(base),{code:'missing_required_step'});
 assert.throws(()=>createSignedAssetRevocationBridge({
  ...base,assetStore:{clear:()=>true,lockForRevocation:()=>true}
 }),{code:'missing_required_security_surface'});
});

test('R222 broken asset store lock cannot report a successful teardown or clear',async()=>{
 const attempts=[],f=fixture({
  assetStore:{
   lockForRevocation:()=>{attempts.push('lock');throw Error('fictional private detail')},
   isRevocationLocked:()=>false,
   clear:()=>{attempts.push('unsafe-clear')}
  }
 });
 await f.bridge.begin({campaignId:CAMPAIGN,userId:PLAYER});
 f.remove();await f.bridge.notify('manual');
 const status=await f.bridge.getRevocationCompletion();
 assert.equal(status.status,'incomplete');
 assert.equal(status.signedAssetLockConfirmed,false);
 assert.equal(status.signedAssetCacheClearAttempted,true); // attempted, but denied by guard
 assert.ok(status.failedSteps.includes('signedAssetLock'));
 assert.ok(status.failedSteps.includes('clearSignedAssetUrls'));
 assert.deepEqual(attempts,['lock']);
 assert.ok(f.events.includes('maskCampaign'));
 assert.ok(f.events.includes('routeToCampaignHub'));
 assert.doesNotMatch(JSON.stringify(status),/fictional private detail/);
});

test('R222 local lock cannot revoke already-issued bearer URLs at the Storage server',async()=>{
 const f=fixture();
 await f.bridge.begin({campaignId:CAMPAIGN,userId:PLAYER});
 let before='';
 const cancel=f.assetStore.subscribe({},'invented','portrait.png',url=>{if(url)before=url});
 await tick();
 assert.ok(before.startsWith('invented-asset-'));
 f.remove();await f.bridge.notify('manual');
 await f.bridge.getRevocationCompletion();
 assert.equal(f.assetStore.isRevocationLocked(),true);
 assert.equal(f.assetStore.peek({},'invented','portrait.png'),'');
 // Copy issued before lock remains a string: no server revocation was tested.
 assert.ok(before.startsWith('invented-asset-'));
 cancel();
});
