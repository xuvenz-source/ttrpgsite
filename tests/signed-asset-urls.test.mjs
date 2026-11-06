import test from 'node:test';
import assert from 'node:assert/strict';
import {createSignedAssetStore} from '../src/SignedAssetUrls.js';

test('concurrent image and map URL requests share a signing operation',async()=>{
 let signed=0;
 const storage=createSignedAssetStore({
  sign:async()=>({data:{signedUrl:'signed-'+(++signed)}}),
  setTimer:()=>1,clearTimer:()=>{}
 });
 const client={};
 const [first,second]=await Promise.all([
  storage.get(client,'tabletop-artwork','hero.png'),
  storage.get(client,'tabletop-artwork','hero.png')
 ]);
 assert.equal(first,'signed-1');
 assert.equal(second,'signed-1');
 assert.equal(signed,1);
 assert.equal(await storage.get(client,'tabletop-artwork','hero.png'),'signed-1');
 assert.equal(await storage.get(client,'battlemap-assets','hero.png'),'signed-2');
});
test('expired URLs are re-signed, active subscribers are refreshed on sign-in',async()=>{
 let signed=0,current=100000;
 const seen=[];
 const storage=createSignedAssetStore({
  now:()=>current,ttlMs:60000,
  sign:async()=>({data:{signedUrl:'signed-'+(++signed)}}),
  setTimer:()=>1,clearTimer:()=>{}
 });
 const client={};
 const stop=storage.subscribe(client,'tabletop-artwork','hero',url=>seen.push(url));
 await new Promise(resolve=>setImmediate(resolve));
 assert.deepEqual(seen,['signed-1']);
 assert.equal(await storage.get(client,'tabletop-artwork','hero'),'signed-1');
 current+=70000;
 assert.equal(await storage.get(client,'tabletop-artwork','hero'),'signed-2');
 storage.clear();
 await new Promise(resolve=>setImmediate(resolve));
 assert.deepEqual(seen,['signed-1','signed-2','','signed-3']);
 assert.equal(storage.stats().subscribers,1);
 stop();
 assert.equal(storage.stats().subscribers,0);
});
test('cache evicts inactive URLs and never resurrects old-account responses',async()=>{
 let next=0;
 const pending=[];
 const storage=createSignedAssetStore({
  maxEntries:2,setTimer:()=>1,clearTimer:()=>{},
  sign:()=>new Promise(resolve=>pending.push(resolve))
 });
 const client={};
 const first=storage.get(client,'art','a');
 storage.clear();
 const second=storage.get(client,'art','a');
 pending[0]({data:{signedUrl:'from-old-user'}});
 pending[1]({data:{signedUrl:'from-new-user'}});
 assert.equal(await first,'');
 assert.equal(await second,'from-new-user');
 assert.equal(await storage.get(client,'art','a'),'from-new-user');
 const one=storage.get(client,'art','b');
 pending[2]({data:{signedUrl:'b'}});await one;
 const two=storage.get(client,'art','c');
 pending[3]({data:{signedUrl:'c'}});await two;
 assert.ok(storage.stats().entries<=2);
});
