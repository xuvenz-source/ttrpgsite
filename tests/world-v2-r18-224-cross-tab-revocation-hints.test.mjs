import test from 'node:test';
import assert from 'node:assert/strict';
import {createTerminalRevocationBridge} from '../staging/world-v2-b10-r18-223-terminal-revocation-bridge/TerminalRevocationBridge.js';
import {createCampaignRevocationHintRelay} from '../staging/world-v2-b10-r18-224-revocation-hints/CampaignRevocationHintRelay.js';
import {createSignedAssetStore} from '../staging/world-v2-b10-r18-221-signed-asset-revocation-lock/SignedAssetUrlsRevocationCandidate.js';
import {R123_SYNC_PURGE_STEPS,R123_ASYNC_PURGE_STEPS} from '../staging/world-v2-b10-r18-123-access-revocation-guard/CampaignRevocationTeardown.js';

const C='00000000-0000-4000-8000-000000000101';
const C2='00000000-0000-4000-8000-000000000102';
const DM='00000000-0000-4000-8000-000000000201';
const P1='00000000-0000-4000-8000-000000000202';
const P2='00000000-0000-4000-8000-000000000203';
const OUT='00000000-0000-4000-8000-000000000204';

function bus(){
 const subscribers=new Map(),published=[];
 return {
  published,
  endpoint(label){
   return {
    subscribe(callback){
     if(subscribers.has(label))throw Error('duplicate mock endpoint');
     subscribers.set(label,callback);
     return()=>subscribers.delete(label);
    },
    publish(message){
     published.push({from:label,message});
     for(const [name,callback] of subscribers)
      if(name!==label)callback(message);
    }
   };
  },
  inject(message){
   for(const fn of subscribers.values())fn(message);
  },
  listeners:()=>subscribers.size
 };
}
const hint=(userId,campaignId=C)=>({
 type:'campaign-access-recheck',version:1,campaignId,userId
});
const tick=async()=>{for(let i=0;i<18;i++)await Promise.resolve();};

function fixture({label,userId,role='player',channel,members,campaign=C}){
 let currentCampaign=campaign;
 let requests=0,signs=0;
 const masks=[],allows=[];
 const store=createSignedAssetStore({
  now:()=>0,setTimer:()=>1,clearTimer:()=>{},
  sign:async()=>({data:{signedUrl:'synthetic-'+(++signs)},error:null})
 });
 const db={
  auth:{getUser:async()=>({data:{user:{id:userId}},error:null})},
  from:table=>{
   assert.equal(table,'campaign_members');
   const q={select:()=>q,eq:()=>q,maybeSingle:async()=>{
    requests++;
    const current=members.get(userId);
    return {data:current?{user_id:userId,role:current}:null,error:null};
   }};
   return q;
  }
 };
 const steps={};
 for(const key of [...R123_SYNC_PURGE_STEPS,...R123_ASYNC_PURGE_STEPS])
  steps[key]=()=>true;
 const getContext=()=>({campaignId:currentCampaign,userId});
 const bridge=createTerminalRevocationBridge({
  db,getContext,assetStore:store,teardownSteps:steps,
  maskCampaign:info=>{masks.push(info.reason);return true},
  allowCampaign:()=>{allows.push('allowed');return true},
  onSuspended:()=>{},
 });
 const relay=createCampaignRevocationHintRelay({
  bridge,getContext,transport:channel.endpoint(label)
 });
 return {
  relay,bridge,store,mask:masks,allow:allows,
  begin:()=>relay.begin({campaignId:currentCampaign,userId}),
  removeCampaign:()=>{currentCampaign=C2},
  queryCount:()=>requests,signCount:()=>signs
 };
}

test('R224 P1 cross-tab revocation rechecks only matching P1 windows; DM/P2 unaffected',async()=>{
 const channel=bus();
 const members=new Map([[DM,'dm'],[P1,'player'],[P2,'player']]);
 const dm=fixture({label:'DM',userId:DM,role:'dm',channel,members});
 const p1a=fixture({label:'P1-A',userId:P1,channel,members});
 const p1b=fixture({label:'P1-B',userId:P1,channel,members});
 const p2=fixture({label:'P2',userId:P2,channel,members});
 const outsider=fixture({label:'OUT',userId:OUT,channel,members});
 await Promise.all([dm.begin(),p1a.begin(),p1b.begin(),p2.begin(),outsider.begin()]);
 assert.equal(outsider.bridge.snapshot().phase,'revoked');
 assert.equal(dm.bridge.snapshot().allowed,true);
 assert.equal(p1a.bridge.snapshot().allowed,true);
 assert.equal(p1b.bridge.snapshot().allowed,true);
 assert.equal(p2.bridge.snapshot().allowed,true);
 const baseline=[dm.queryCount(),p1b.queryCount(),p2.queryCount()];
 members.delete(P1);
 await p1a.relay.notify('manual');
 await tick();
 assert.equal(p1a.bridge.snapshot().terminalRevocation,true);
 assert.equal(p1b.bridge.snapshot().terminalRevocation,true);
 assert.equal(p1b.store.isRevocationLocked(),true);
 assert.equal(p1b.queryCount(),baseline[1]+1);
 assert.ok(p1b.mask.includes('revalidating'));
 assert.equal(dm.queryCount(),baseline[0]);
 assert.equal(p2.queryCount(),baseline[2]);
 assert.equal(dm.bridge.snapshot().allowed,true);
 assert.equal(p2.bridge.snapshot().allowed,true);
 assert.equal(dm.store.isRevocationLocked(),false);
 assert.equal(p2.store.isRevocationLocked(),false);
 assert.equal(channel.published.some(x=>x.from==='P1-A'),true);
 const emitted=channel.published.find(x=>x.from==='P1-A').message;
 assert.deepEqual(emitted,hint(P1));
 assert.equal(Object.keys(emitted).length,4);
 assert.equal(channel.published.some(x=>x.from==='P1-B'),false); // no echo
});

test('R224 spoofed same-actor hint can only trigger a fresh proof, never force revocation',async()=>{
 const channel=bus(),members=new Map([[P1,'player']]);
 const p1=fixture({label:'P1',userId:P1,channel,members});
 await p1.begin();
 const before=p1.queryCount();
 channel.inject(hint(P1));
 assert.ok(p1.mask.includes('revalidating')); // synchronous hide
 await tick();
 assert.equal(p1.queryCount(),before+1);
 assert.equal(p1.bridge.snapshot().allowed,true);
 assert.equal(p1.bridge.snapshot().terminalRevocation,false);
 assert.equal(p1.store.isRevocationLocked(),false);
 assert.equal(channel.published.length,0); // never amplify untrusted hints
});

test('R224 ignores other actor/campaign, extra fields, malformed type, and array payload',async()=>{
 const channel=bus(),members=new Map([[P1,'player']]);
 const p1=fixture({label:'P1',userId:P1,channel,members});
 await p1.begin();
 const before=p1.queryCount();
 channel.inject(hint(P2));
 channel.inject(hint(P1,C2));
 channel.inject({...hint(P1),reason:'member_deleted'});
 channel.inject({...hint(P1),version:2});
 channel.inject([hint(P1)]);
 channel.inject({type:'campaign-access-recheck',version:1,campaignId:C,userId:'bad'});
 await tick();
 assert.equal(p1.queryCount(),before);
 assert.equal(p1.mask.filter(x=>x==='revalidating').length,0);
 assert.equal(p1.bridge.snapshot().allowed,true);
});

test('R224 synthetic remote hint duplicates are coalesced until one signed proof returns',async()=>{
 const channel=bus();
 let resolveProof;
 let started=false;
 const membership=()=>new Promise(resolve=>{
  started=true;resolveProof=resolve;
 });
 let member={user_id:P1,role:'player'},requests=0;
 const fakeDB={
  auth:{getUser:async()=>({data:{user:{id:P1}},error:null})},
  from:()=>{const q={select:()=>q,eq:()=>q,maybeSingle:async()=>{
   requests++;
   if(requests===1)return {data:member,error:null};
   return membership();
  }};return q;}
 };
 const store=createSignedAssetStore({setTimer:()=>1,clearTimer:()=>{},
  sign:async()=>({data:{signedUrl:'fake'},error:null})});
 const steps={};
 for(const key of [...R123_SYNC_PURGE_STEPS,...R123_ASYNC_PURGE_STEPS])steps[key]=()=>true;
 const bridge=createTerminalRevocationBridge({
  db:fakeDB,getContext:()=>({campaignId:C,userId:P1}),
  maskCampaign:()=>true,allowCampaign:()=>true,onSuspended:()=>{},
  assetStore:store,teardownSteps:steps
 });
 const relay=createCampaignRevocationHintRelay({
  bridge,getContext:()=>({campaignId:C,userId:P1}),transport:channel.endpoint('P1')
 });
 await relay.begin({campaignId:C,userId:P1});
 for(let i=0;i<10;i++)channel.inject(hint(P1));
 await tick();
 assert.equal(started,true);
 assert.equal(requests,2);
 assert.equal(relay.snapshot().remoteRechecks,1);
 resolveProof({data:{user_id:P1,role:'player'},error:null});
 await tick();
 assert.equal(relay.snapshot().allowed,true);
});

test('R224 changed context suppresses stale campaign hints',async()=>{
 const channel=bus(),members=new Map([[P1,'player']]);
 const p1=fixture({label:'P1',userId:P1,channel,members});
 await p1.begin();
 p1.removeCampaign();
 const before=p1.queryCount();
 channel.inject(hint(P1));
 await tick();
 assert.equal(p1.queryCount(),before);
 assert.equal(p1.bridge.snapshot().allowed,true); // underlying R123 has not yet observed context switch
 assert.equal(p1.relay.snapshot().allowed,false); // R224 cannot claim stale context authorization
 assert.equal(p1.relay.snapshot().currentContextMatches,false);
});

test('R224 relay disposal unsubscribes and leaves original bridge teardown to owner',async()=>{
 const channel=bus(),members=new Map([[P1,'player']]);
 const p1=fixture({label:'P1',userId:P1,channel,members});
 await p1.begin();
 assert.equal(channel.listeners(),1);
 assert.equal(p1.relay.dispose(),true);
 assert.equal(p1.relay.dispose(),false);
 assert.equal(channel.listeners(),0);
 const before=p1.queryCount();
 channel.inject(hint(P1));await tick();
 assert.equal(p1.queryCount(),before);
 assert.throws(()=>p1.relay.begin({campaignId:C,userId:P1}),{code:'relay_disposed'});
});

test('R224 broken outbound transport does not falsely claim cross-tab delivery',async()=>{
 const channel={endpoint:()=>({
  subscribe:()=>()=>{},
  publish:()=>{throw Error('fictional transport failed')}
 })};
 const members=new Map([[P1,'player']]);
 const p1=fixture({label:'P1',userId:P1,channel,members});
 await p1.begin();
 members.delete(P1);
 await p1.relay.notify('manual');
 assert.equal(p1.relay.snapshot().terminalRevocation,true);
 assert.equal(p1.relay.snapshot().hintPublished,true);
 assert.equal(p1.relay.snapshot().outboundFailed,true);
 assert.equal(p1.relay.snapshot().outboundDeliveryUnverified,true);
});
