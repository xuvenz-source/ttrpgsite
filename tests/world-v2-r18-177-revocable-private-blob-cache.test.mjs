import test from 'node:test';
import assert from 'node:assert/strict';
import {createRevocablePrivateImageCache,R177_LIVE_ENABLED} from '../staging/world-v2-b10-r18-177-revocable-private-blob-cache/RevocablePrivateImageCache.mjs';
const C='00000000-0000-4000-8000-000000000101',C2='00000000-0000-4000-8000-000000000102';
const P1='00000000-0000-4000-8000-000000000302',P2='00000000-0000-4000-8000-000000000303';
const MAP='00000000-0000-4000-8000-000000000201',MAP2='00000000-0000-4000-8000-000000000202';
const blob=new Blob([new Uint8Array([1,2,3])],{type:'image/png'});
function fixture(overrides={}){
 let created=0,requests=0;
 const removed=[],pending=[];
 const cache=createRevocablePrivateImageCache({
  loadBlob:async({signal})=>{requests++;return await new Promise(resolve=>pending.push({resolve,signal}));},
  createUrl:()=> 'blob:test/'+(++created),
  revokeUrl:url=>removed.push(url),
  ...overrides
 });
 return {cache,pending,removed,stats:()=>({created,requests})};
}
const auth=(cache,userId=P1,campaignId=C)=>cache.authorize({userId,campaignId,freshProof:true});
test('dormant and closed cache never loads until a fresh external membership proof',async()=>{
 assert.equal(R177_LIVE_ENABLED,false);
 const f=fixture();
 assert.equal(f.cache.peek('map-image',MAP,'map'),'');
 assert.equal(await f.cache.get('map-image',MAP,'map'),'');
 assert.equal(f.cache.authorize({userId:P1,campaignId:C,freshProof:false}),false);
 assert.equal(f.stats().requests,0);
});
test('concurrent subscribers share one load and receive blob only',async()=>{
 const f=fixture();assert.equal(auth(f.cache),true);
 const a=[],b=[];
 const off1=f.cache.subscribe('map-image',MAP,'map',x=>a.push(x));
 const off2=f.cache.subscribe('map-image',MAP,'map',x=>b.push(x));
 assert.equal(f.stats().requests,1);
 f.pending[0].resolve(blob);await new Promise(resolve=>setImmediate(resolve));
 assert.deepEqual(a,['','blob:test/1']);assert.deepEqual(b,['','blob:test/1']);
 assert.equal(f.cache.peek('map-image',MAP,'map'),'blob:test/1');
 off1();assert.deepEqual(f.removed,[]);
 off2();assert.deepEqual(f.removed,['blob:test/1']);
 assert.equal(f.cache.stats().entries,0);
});
test('revocation masks existing URL synchronously and never re-fetches it',async()=>{
 const f=fixture();auth(f.cache);const seen=[];
 f.cache.subscribe('map-image',MAP,'map',x=>seen.push(x));
 f.pending[0].resolve(blob);await new Promise(resolve=>setImmediate(resolve));
 const before=f.stats().requests;
 assert.equal(f.cache.revoke(),true);
 assert.deepEqual(seen,['','blob:test/1','']);
 assert.deepEqual(f.removed,['blob:test/1']);
 assert.equal(f.cache.peek('map-image',MAP,'map'),'');
 assert.equal(await f.cache.get('map-image',MAP,'map'),'');
 assert.equal(f.stats().requests,before);
});
test('pending image response arriving after membership revocation never reappears',async()=>{
 const f=fixture();auth(f.cache);const seen=[];
 f.cache.subscribe('map-image',MAP,'map',x=>seen.push(x));
 assert.equal(f.pending.length,1);
 f.cache.revoke();assert.equal(f.pending[0].signal.aborted,true);
 f.pending[0].resolve(blob);await new Promise(resolve=>setImmediate(resolve));
 assert.deepEqual(seen,['','']);assert.equal(f.stats().created,0);
 assert.equal(f.cache.stats().phase,'revoked');
});
test('account/campaign switch cannot reuse previous Blob URLs',async()=>{
 const f=fixture();auth(f.cache);
 const first=f.cache.get('map-image',MAP,'map');f.pending[0].resolve(blob);await first;
 assert.equal(f.cache.peek('map-image',MAP,'map'),'blob:test/1');
 assert.equal(auth(f.cache,P2,C2),true);
 assert.equal(f.cache.peek('map-image',MAP,'map'),'');
 assert.deepEqual(f.removed,['blob:test/1']);
 const second=f.cache.get('map-image',MAP2,'map');assert.equal(f.stats().requests,2);
 f.pending[1].resolve(blob);assert.equal(await second,'blob:test/2');
});
test('bounded cache refuses new item rather than evict actively displayed image',async()=>{
 const f=fixture({maxEntries:1});auth(f.cache);
 const stop=f.cache.subscribe('map-image',MAP,'map',()=>{});
 assert.equal(await f.cache.get('map-image',MAP2,'map'),'');
 assert.equal(f.stats().requests,1);
 f.pending[0].resolve(blob);await new Promise(resolve=>setImmediate(resolve));
 stop();
 const second=f.cache.get('map-image',MAP2,'map');
 assert.equal(f.stats().requests,2);
 f.pending[1].resolve(blob);assert.equal(await second,'blob:test/2');
});
test('malformed resource IDs and asset variants cannot launch media requests',async()=>{
 const f=fixture();auth(f.cache);
 for(const [kind,id,variant] of [
  ['map-image','invalid','map'],['map-image',MAP,'portrait'],
  ['campaign-token-art',MAP,'evil'],['personal-token-art',null,'token']
 ])assert.equal(await f.cache.get(kind,id,variant),'');
 assert.equal(f.stats().requests,0);
});
test('dispose permanently aborts all requests and forbids reactivation',async()=>{
 const f=fixture();auth(f.cache);const task=f.cache.get('map-image',MAP,'map');
 f.cache.dispose();f.pending[0].resolve(blob);
 assert.equal(await task,'');assert.equal(f.cache.stats().phase,'disposed');
 assert.equal(auth(f.cache),false);assert.equal(f.stats().requests,1);
});


test('repeated fresh proof for the same campaign never flashes or re-fetches images',async()=>{
 const f=fixture();auth(f.cache);const seen=[];
 f.cache.subscribe('map-image',MAP,'map',x=>seen.push(x));
 f.pending[0].resolve(blob);await new Promise(resolve=>setImmediate(resolve));
 assert.equal(auth(f.cache),true);
 assert.equal(f.stats().requests,1);
 assert.deepEqual(seen,['','blob:test/1']);
 assert.equal(f.cache.peek('map-image',MAP,'map'),'blob:test/1');
 assert.deepEqual(f.removed,[]);
});
