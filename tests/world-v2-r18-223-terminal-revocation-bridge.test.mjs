import test from 'node:test';
import assert from 'node:assert/strict';
import {createTerminalRevocationBridge} from '../staging/world-v2-b10-r18-223-terminal-revocation-bridge/TerminalRevocationBridge.js';
import {createSignedAssetStore} from '../staging/world-v2-b10-r18-221-signed-asset-revocation-lock/SignedAssetUrlsRevocationCandidate.js';
import {R123_SYNC_PURGE_STEPS,R123_ASYNC_PURGE_STEPS} from '../staging/world-v2-b10-r18-123-access-revocation-guard/CampaignRevocationTeardown.js';

const CAMPAIGN='00000000-0000-4000-8000-000000000111';
const PLAYER='00000000-0000-4000-8000-000000000222';
const DM='00000000-0000-4000-8000-000000000333';
function host(overrides={}){
 let member=Object.hasOwn(overrides,'member')?overrides.member:{user_id:PLAYER,role:'player'};
 let actor=overrides.actor??PLAYER;
 let now=0,signCount=0,accessGranted=0;
 const events=[];
 const store=overrides.assetStore??createSignedAssetStore({
  now:()=>now,
  setTimer:()=>1,clearTimer:()=>{},
  sign:async()=>({data:{signedUrl:'invented-token-'+(++signCount)},error:null}),
 });
 const db={
  auth:{getUser:async()=>({data:{user:{id:actor}},error:null})},
  from:table=>{
   if(table!=='campaign_members')throw Error('unexpected synthetic table');
   const q={select:()=>q,eq:()=>q,maybeSingle:async()=>({data:member,error:null})};
   return q;
  }
 };
 const teardownSteps={};
 for(const key of [...R123_SYNC_PURGE_STEPS,...R123_ASYNC_PURGE_STEPS]){
  teardownSteps[key]=()=>{events.push(key);return true};
 }
 const bridge=createTerminalRevocationBridge({
  db,getContext:()=>({campaignId:CAMPAIGN,userId:PLAYER}),
  assetStore:store,
  maskCampaign:info=>{events.push('mask:'+info.reason);return true},
  allowCampaign:overrides.allowCampaign??(()=>{accessGranted++;events.push('allow');return true}),
  onSuspended:info=>events.push('suspended:'+info.code),
  teardownSteps,
  now:()=>now
 });
 return {
  bridge,store,events,
  setMembership:x=>{member=x},
  setActor:x=>{actor=x},
  grantCount:()=>accessGranted,
  signerCount:()=>signCount,
  changeTime:x=>{now=x},
 };
}
const start=f=>f.bridge.begin({campaignId:CAMPAIGN,userId:PLAYER});

test('R223 confirmed removal permanently denies reentry in same bridge despite reinstated row',async()=>{
 const f=host();
 await start(f);
 assert.equal(f.bridge.snapshot().allowed,true);
 assert.equal(f.grantCount(),1);
 f.setMembership(null);
 await f.bridge.notify('manual');
 assert.equal(f.bridge.snapshot().phase,'revoked');
 assert.equal(f.bridge.snapshot().terminalRevocation,true);
 assert.equal(f.store.isRevocationLocked(),true);
 f.setMembership({user_id:PLAYER,role:'player'});
 assert.throws(()=>start(f),{code:'fresh_bridge_required_after_revocation'});
 assert.equal((await f.bridge.notify('manual')).allowed,false);
 assert.equal(f.grantCount(),1);
 assert.equal(await f.store.get({},'invented','portrait.png'),'');
 assert.equal(f.signerCount(),0);
});

test('R223 only an independently fresh unlocked store AND fresh bridge can reenter',async()=>{
 const retired=host();
 await start(retired);
 retired.setMembership(null);await retired.bridge.notify('manual');
 await retired.bridge.getRevocationCompletion();
 assert.throws(()=>createTerminalRevocationBridge({
  assetStore:retired.store,allowCampaign:()=>true,maskCampaign:()=>true
 }),{code:'fresh_asset_store_required'});
 const replacement=host();
 const auth=await start(replacement);
 assert.equal(auth.allowed,true);
 assert.equal(replacement.bridge.snapshot().terminalRevocation,false);
 assert.equal(retired.bridge.snapshot().terminalRevocation,true);
 assert.equal(retired.store.isRevocationLocked(),true);
 assert.equal(replacement.store.isRevocationLocked(),false);
});

test('R223 a cache that seals itself during allow does not leave an authorized view',async()=>{
 let suppliedStore;
 const f=host({
  allowCampaign:()=>{
   suppliedStore.lockForRevocation();
   return true;
  },
  assetStore:(suppliedStore=createSignedAssetStore({
   now:()=>0,setTimer:()=>1,clearTimer:()=>{},
   sign:async()=>({data:{signedUrl:'fake'},error:null})
  }))
 });
 const result=await start(f);
 assert.equal(result.allowed,false);
 assert.equal(f.bridge.snapshot().allowed,false);
 assert.equal(f.bridge.snapshot().terminalRevocation,true);
 assert.equal(f.events.some(x=>x==='mask:render_reenable_failed'),true);
 assert.throws(()=>start(f),{code:'fresh_bridge_required_after_revocation'});
});

test('R223 async authorizing callback fails closed, never reports granted',async()=>{
 let resolve;
 const promise=new Promise(ok=>{resolve=ok});
 const f=host({allowCampaign:()=>promise});
 const result=await start(f);
 assert.equal(result.allowed,false);
 assert.equal(f.bridge.snapshot().phase,'suspended');
 assert.equal(f.events.includes('mask:render_reenable_failed'),true);
 assert.equal(f.events.includes('suspended:render_reenable_failed'),true);
 resolve(true);
 await Promise.resolve();
 assert.equal(f.bridge.snapshot().allowed,false);
});

test('R223 RLS/network uncertainty masks but does not permanently seal signed assets',async()=>{
 let now=0;
 const f=host({member:null});
 // A missing membership result at initial entry is a confirmed absent row.
 await start(f);
 assert.equal(f.bridge.snapshot().terminalRevocation,true);
 const other=host({member:{user_id:DM,role:'dm'}});
 await start(other);
 assert.equal(other.bridge.snapshot().allowed,false);
 assert.equal(other.bridge.snapshot().terminalRevocation,false);
 assert.equal(other.store.isRevocationLocked(),false);
});

test('R223 rejects prelocked, throwing, or malformed store without any DB call',()=>{
 const store=createSignedAssetStore({
  setTimer:()=>1,clearTimer:()=>{},
  sign:async()=>({data:{signedUrl:'fake'},error:null})
 });
 store.lockForRevocation();
 assert.throws(()=>host({assetStore:store}),{code:'fresh_asset_store_required'});
 assert.throws(()=>host({assetStore:{
  isRevocationLocked:()=>{throw Error('private')},clear:()=>{},lockForRevocation:()=>{}
 }}),{code:'fresh_asset_store_required'});
 assert.throws(()=>host({assetStore:{isRevocationLocked:()=>false}}),{code:'missing_required_security_surface'});
});

test('R223 ordinary healthy revalidation does not remount or lock on verified membership',async()=>{
 const f=host();
 await start(f);
 const count=f.grantCount();
 await f.bridge.notify('membership-hint');
 assert.equal(f.bridge.snapshot().allowed,true);
 assert.equal(f.grantCount(),count+1);
 assert.equal(f.bridge.snapshot().terminalRevocation,false);
 assert.equal(f.store.isRevocationLocked(),false);
 assert.equal(f.bridge.snapshot().revocationStarted,false);
});
