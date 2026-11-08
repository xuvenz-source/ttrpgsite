import test from 'node:test';
import assert from 'node:assert/strict';
import {campaignResourceKey,createCampaignRefreshCoordinator} from '../src/CampaignRefreshCoordinator.js';

const deferred=()=>{
 let resolve,reject;
 const promise=new Promise((ok,no)=>{resolve=ok;reject=no});
 return {promise,resolve,reject};
};
const key=(userId='p1',mapId='m1',resource='tokens')=>
 campaignResourceKey({campaignId:'campaign-1',mapId,userId,resource});

test('identical authorized in-flight reads share one query without caching resolved results',async()=>{
 const coordinator=createCampaignRefreshCoordinator();
 let calls=0;
 const pending=deferred();
 const first=coordinator.request(key(),()=>{calls++;return pending.promise});
 const second=coordinator.request(key(),()=>{calls++;return 'unreachable'});
 pending.resolve([{id:'t1'}]);
 assert.deepEqual(await first,{current:true,value:[{id:'t1'}]});
 assert.deepEqual(await second,{current:true,value:[{id:'t1'}]});
 assert.equal(calls,1);
 assert.equal(coordinator.stats().shared,1);
 assert.deepEqual(await coordinator.request(key(),()=>{calls++;return []}),
  {current:true,value:[]});
 assert.equal(calls,2,'completed authorized responses are not cached');
});

test('campaign, map, viewer and resource boundaries do not share privileged reads',async()=>{
 const coordinator=createCampaignRefreshCoordinator();
 let requests=0;
 const shared=deferred();
 const variants=[key(),key('p2'),key('p1','m2'),key('p1','m1','monitor'),
  campaignResourceKey({campaignId:'other',mapId:'m1',userId:'p1',resource:'tokens'})];
 const promises=variants.map(value=>coordinator.request(value,()=>{
  requests++;return shared.promise;
 }));
 shared.resolve([]);
 const results=await Promise.all(promises);
 assert.equal(requests,5);
 assert.ok(results.every(value=>value.current));
 assert.notEqual(variants[0],variants[1]);
});

test('invalidation rejects older sight and data snapshots while allowing new reads',async()=>{
 const coordinator=createCampaignRefreshCoordinator();
 const old=deferred();
 const first=coordinator.request(key(),()=>old.promise);
 coordinator.invalidate(key());
 const newer=await coordinator.request(key(),()=>[{id:'visible'}]);
 old.resolve([{id:'no-longer-authorized'}]);
 assert.equal((await first).current,false);
 assert.equal(newer.current,true);
 assert.deepEqual(newer.value,[{id:'visible'}]);
 assert.equal(coordinator.stats().stale,1);
});

test('cross-map and account resets invalidate every prior in-flight result',async()=>{
 const coordinator=createCampaignRefreshCoordinator();
 const old=deferred();
 const first=coordinator.request(key(),()=>old.promise);
 coordinator.invalidateAll();
 const fresh=await coordinator.request(key(),()=>1);
 old.resolve(2);
 assert.equal((await first).current,false);
 assert.deepEqual(fresh,{current:true,value:1});
 coordinator.dispose();
 assert.deepEqual(await coordinator.request(key(),()=>3),
  {current:false,value:undefined});
});

test('errors clear in-flight entries and permit a later retry',async()=>{
 const coordinator=createCampaignRefreshCoordinator();
 await assert.rejects(coordinator.request(key(),async()=>{throw Error('network')}),/network/);
 assert.equal(coordinator.stats().inFlight,0);
 assert.deepEqual(await coordinator.request(key(),()=>42),{current:true,value:42});
});
