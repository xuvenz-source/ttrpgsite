import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createSignedAssetStore} from '../src/SignedAssetUrls.js';
import {
 createCampaignRevocationTeardown,R123_SYNC_PURGE_STEPS,R123_ASYNC_PURGE_STEPS
} from '../staging/world-v2-b10-r18-123-access-revocation-guard/CampaignRevocationTeardown.js';

function deferred(){
 let resolve;
 const promise=new Promise(ok=>{resolve=ok;});
 return {resolve,promise};
}
const flush=async()=>{
 for(let i=0;i<8;i++)await Promise.resolve();
};
function makeStore(sign){
 return createSignedAssetStore({
  now:()=>1000,setTimer:()=>1,clearTimer:()=>{},sign
 });
}
function hooks(overrides={}){
 const calls=[];
 const steps={};
 for(const k of [...R123_SYNC_PURGE_STEPS,...R123_ASYNC_PURGE_STEPS]){
  steps[k]=overrides[k]??(()=>{calls.push(k);return true;});
 }
 return {calls,steps};
}

test('R199 current signer code carries 3600-second bearer lifetime independent of 54-minute local cache',async()=>{
 const source=readFileSync(new URL('../src/SignedAssetUrls.js',import.meta.url),'utf8');
 assert.match(source,/ttlMs=54\s*\*\s*60\s*\*\s*1000/);
 assert.match(source,/createSignedUrl\(path,3600\)/);
 let expiresIn=0;
 const db={storage:{from:()=>({
  createSignedUrl:async(_path,secs)=>{
   expiresIn=secs;
   return {data:{signedUrl:'fictional-token'},error:null};
  }
 })}};
 const store=createSignedAssetStore({ttlMs:30000,now:()=>0,setTimer:()=>1,clearTimer:()=>{}});
 assert.equal(await store.get(db,'fictional-bucket','asset.png'),'fictional-token');
 assert.equal(expiresIn,3600);
 // Shorter in-memory retention does NOT lower the server-issued token expiry.
});

test('R199 subscribers left mounted cause clear() to request another URL',async()=>{
 let calls=0;
 const store=makeStore(async()=>({
  data:{signedUrl:'invented-url-'+(++calls)},error:null
 }));
 const db={};
 const unsubscribe=store.subscribe(db,'fictional','map.png',()=>{});
 assert.equal(await store.get(db,'fictional','map.png'),'invented-url-1');
 store.clear();
 await flush();
 assert.equal(calls,2);
 assert.equal(store.stats().subscribers,1);
 unsubscribe();
});

test('R199 unsubscription then clear prevents automatic reissue',async()=>{
 let calls=0;
 const store=makeStore(async()=>({
  data:{signedUrl:'invented-url-'+(++calls)},error:null
 }));
 const db={};
 const unsub=store.subscribe(db,'fictional','map.png',()=>{});
 await store.get(db,'fictional','map.png');
 unsub();store.clear();
 await flush();
 assert.equal(calls,1);
 assert.equal(store.stats().subscribers,0);
 assert.equal(store.peek(db,'fictional','map.png'),'');
});

test('R199 old in-flight signer result is ignored after epoch clear and unmount',async()=>{
 const pending=deferred();
 let calls=0;
 const store=makeStore(()=>{calls++;return pending.promise;});
 const db={};
 const unsub=store.subscribe(db,'fictional','map.png',()=>{});
 const old=store.get(db,'fictional','map.png');
 await flush();
 assert.equal(calls,1);
 unsub();store.clear();
 pending.resolve({data:{signedUrl:'stale-invented-url'},error:null});
 assert.equal(await old,'');
 assert.equal(store.peek(db,'fictional','map.png'),'');
 assert.equal(store.stats().subscribers,0);
});

test('R199 clearing a browser cache never prevents a later explicit get from trying to sign',async()=>{
 let calls=0;
 const store=makeStore(async()=>({
  data:{signedUrl:'invented-url-'+(++calls)},error:null
 }));
 const db={};
 assert.equal(await store.get(db,'fictional','map.png'),'invented-url-1');
 store.clear();
 assert.equal(await store.get(db,'fictional','map.png'),'invented-url-2');
 assert.equal(calls,2);
 // This is WHY server-side issuance must check current campaign membership.
 // The test does not allege Storage RLS currently permits a revoked user.
});

test('R199 revoked backend identity must refuse a later explicit get; client clearing alone is insufficient',async()=>{
 let signed=0,allowed=true;
 const store=makeStore(async()=>{
  signed++;
  if(!allowed)return {data:null,error:{code:'403',message:'denied'}};
  return {data:{signedUrl:'invented-before-removal'},error:null};
 });
 const db={};
 const old=await store.get(db,'fictional','map.png');
 assert.equal(old,'invented-before-removal');
 allowed=false;
 store.clear();
 const savedWarn=console.warn;
 console.warn=()=>{};
 try{
  assert.equal(await store.get(db,'fictional','map.png'),'');
 }finally{console.warn=savedWarn;}
 assert.equal(signed,2);
 assert.equal(old,'invented-before-removal');
 // A previously issued bearer string still exists; acceptance at the real
 // Storage service cannot be proven or revoked by an in-memory cache test.
});

test('R199 actual R123 teardown waits for confirmed unsubscribe before signed clear',async()=>{
 let signed=0;
 const db={};
 const store=makeStore(async()=>({
  data:{signedUrl:'invented-'+(++signed)},error:null
 }));
 const unsubscribe=store.subscribe(db,'fictional','token.png',()=>{});
 await store.get(db,'fictional','token.png');
 const {calls,steps}=hooks();
 steps.awaitConfirmedUnmount=async()=>{
  calls.push('awaitConfirmedUnmount');
  unsubscribe();
  return true;
 };
 steps.clearSignedAssetUrls=()=>{
  calls.push('clearSignedAssetUrls');
  store.clear();
  return true;
 };
 const teardown=createCampaignRevocationTeardown(steps);
 const result=await teardown.revoke().finished;
 assert.equal(result.status,'complete');
 assert.equal(result.signedAssetCacheClearAttempted,true);
 assert.ok(calls.indexOf('clearSignedAssetUrls')>calls.indexOf('awaitConfirmedUnmount'));
 assert.equal(store.stats().subscribers,0);
 assert.equal(signed,1);
});

test('R199 failed unmount confirmation refuses signing-cache clear, but view must be masked',async()=>{
 let cleared=false,masked=false;
 const {steps}=hooks();
 steps.maskCampaign=()=>{masked=true;return true;};
 steps.awaitConfirmedUnmount=async()=>false;
 steps.clearSignedAssetUrls=()=>{cleared=true;return true;};
 const result=await createCampaignRevocationTeardown(steps).revoke().finished;
 assert.equal(masked,true);
 assert.equal(cleared,false);
 assert.equal(result.status,'incomplete');
 assert.equal(result.signedAssetCacheClearAttempted,false);
 assert.ok(result.failedSteps.includes('awaitConfirmedUnmount'));
});

test('R199 staged sentinel and teardown remain UNMOUNTED from live application',()=>{
 const app=readFileSync(new URL('../src/TabletopApp.jsx',import.meta.url),'utf8');
 const board=readFileSync(new URL('../src/engine/v2/WorldV2Board.jsx',import.meta.url),'utf8');
 for(const source of [app,board]){
  assert.doesNotMatch(source,/CampaignAccessSentinel|CampaignRevocationTeardown/);
 }
 const teardown=readFileSync(new URL('../staging/world-v2-b10-r18-123-access-revocation-guard/CampaignRevocationTeardown.js',import.meta.url),'utf8');
 assert.match(teardown,/awaitConfirmedUnmount/);
 assert.match(teardown,/clearSignedAssetUrls/);
});
