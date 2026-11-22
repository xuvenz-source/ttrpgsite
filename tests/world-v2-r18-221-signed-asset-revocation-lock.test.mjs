import test from 'node:test';
import assert from 'node:assert/strict';
import {createSignedAssetStore} from '../staging/world-v2-b10-r18-221-signed-asset-revocation-lock/SignedAssetUrlsRevocationCandidate.js';

function deferred(){
 let resolve,reject;
 const promise=new Promise((ok,fail)=>{resolve=ok;reject=fail});
 return {promise,resolve,reject};
}
async function microtasks(){
 for(let i=0;i<5;i++)await Promise.resolve();
}
function fixture(overrides={}){
 let calls=0;
 const scheduled=[];
 const cancelled=[];
 const sign=overrides.sign??(async()=>({
  data:{signedUrl:'fabricated-only-'+(++calls)},error:null
 }));
 const store=createSignedAssetStore({
  ttlMs:100_000,now:()=>0,
  setTimer:fn=>{scheduled.push(fn);return scheduled.length},
  clearTimer:id=>{cancelled.push(id)},
  sign:async(...args)=>{
   if(overrides.sign)calls++;
   return sign(...args);
  },
 });
 return {store,scheduled,cancelled,count:()=>calls};
}

test('R221 revocation lock immediately hides active artwork and never reissues',async()=>{
 const f=fixture(),events=[];
 const db={};
 const unsubscribe=f.store.subscribe(db,'fictional','art.png',x=>events.push(x));
 await f.store.get(db,'fictional','art.png');
 assert.equal(f.count(),1);
 assert.equal(f.store.peek(db,'fictional','art.png'),'fabricated-only-1');
 assert.equal(f.store.lockForRevocation(),true);
 assert.equal(f.store.isRevocationLocked(),true);
 assert.equal(events.at(-1),'');
 assert.equal(f.store.peek(db,'fictional','art.png'),'');
 assert.deepEqual(f.store.stats(),{entries:0,subscribers:0});
 f.store.clear();  // Old normal clear() would otherwise re-request URLs.
 assert.equal(await f.store.get(db,'fictional','art.png'),'');
 assert.equal(f.count(),1);
 const noAccess=[];
 const cleanup=f.store.subscribe(db,'fictional','other.png',url=>noAccess.push(url));
 assert.deepEqual(noAccess,['']);
 assert.equal(await f.store.get(db,'fictional','other.png'),'');
 assert.equal(f.count(),1);
 cleanup();unsubscribe();
 assert.equal(f.store.lockForRevocation(),false); // no reopening
 assert.equal(f.count(),1);
});

test('R221 stale in-flight signed URL is discarded after revocation',async()=>{
 const hold=deferred();
 const notifications=[];
 let signCount=0;
 const store=createSignedAssetStore({
  now:()=>0,setTimer:()=>1,clearTimer:()=>{},
  sign:async()=>{signCount++;return hold.promise},
 });
 const db={};
 const unsub=store.subscribe(db,'invented','map.png',url=>notifications.push(url));
 assert.equal(signCount,1);
 assert.equal(store.lockForRevocation(),true);
 hold.resolve({data:{signedUrl:'should-never-be-visible'},error:null});
 await microtasks();
 assert.deepEqual(notifications,['']);
 assert.equal(store.peek(db,'invented','map.png'),'');
 assert.equal(await store.get(db,'invented','map.png'),'');
 assert.equal(signCount,1);
 assert.equal(store.stats().entries,0);
 unsub();
});

test('R221 queued stale refresh timer cannot restart signing after lock',async()=>{
 const f=fixture(),db={};
 const unsub=f.store.subscribe(db,'invented','tile.png',()=>{});
 await f.store.get(db,'invented','tile.png');
 assert.equal(f.count(),1);
 assert.ok(f.scheduled.length>=1);
 const callback=f.scheduled.at(-1);
 f.store.lockForRevocation();
 callback();  // Deliberate simulated timer firing despite clearTimeout.
 await microtasks();
 assert.equal(f.count(),1);
 assert.ok(f.cancelled.length>=1);
 unsub();
});

test('R221 one throwing or rejecting subscriber cannot interrupt cache revocation',async()=>{
 const f=fixture(),db={};
 const valid=[];
 f.store.subscribe(db,'invented','map.png',url=>{
  if(url==='')throw Error('fictional render callback failure');
 });
 f.store.subscribe(db,'invented','map.png',url=>{
  if(url==='')return Promise.reject(Error('fictional async callback'));
  return undefined;
 });
 f.store.subscribe(db,'invented','map.png',url=>valid.push(url));
 await f.store.get(db,'invented','map.png');
 assert.equal(f.store.lockForRevocation(),true);
 await microtasks();
 assert.equal(valid.at(-1),'');
 assert.deepEqual(f.store.stats(),{entries:0,subscribers:0});
 assert.equal(f.count(),1);
});

test('R221 ordinary non-revocation clear retains existing same-tab refresh behavior',async()=>{
 const f=fixture(),db={};
 const events=[];
 const unsubscribe=f.store.subscribe(db,'invented','sprite.png',url=>events.push(url));
 await f.store.get(db,'invented','sprite.png');
 assert.equal(f.count(),1);
 f.store.clear();
 await microtasks();
 assert.equal(f.count(),2);
 assert.equal(f.store.isRevocationLocked(),false);
 assert.equal(events.at(-1),'fabricated-only-2');
 unsubscribe();
});

test('R221 a new explicitly created store has independent state, old store stays locked',async()=>{
 const old=fixture();
 const db={};
 old.store.lockForRevocation();
 const newSession=fixture();
 assert.equal(await old.store.get(db,'invented','portrait.png'),'');
 assert.equal(old.count(),0);
 const unsubscribe=newSession.store.subscribe(db,'invented','portrait.png',()=>{});
 await newSession.store.get(db,'invented','portrait.png');
 assert.equal(newSession.count(),1);
 assert.equal(old.store.isRevocationLocked(),true);
 unsubscribe();
});
