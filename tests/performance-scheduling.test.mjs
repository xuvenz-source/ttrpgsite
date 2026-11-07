import test from 'node:test';
import assert from 'node:assert/strict';
import {eventAffectsMap,createCoalescedRefresh,createAdaptiveReconciler,
 CHAT_RECONCILE_MS,ROSTER_RECONCILE_MS} from '../src/PerformanceScheduling.js';

function fakeTimers(){
 let time=0,id=0;
 const jobs=new Map();
 return {
  setTimer(fn,delay){const next=++id;jobs.set(next,{at:time+delay,fn});return next},
  clearTimer(id){jobs.delete(id)},
  advance(ms){
   const target=time+ms;
   while(true){
    const due=[...jobs].filter(([,job])=>job.at<=target)
     .sort((a,b)=>a[1].at-b[1].at)[0];
    if(!due)break;
    time=due[1].at;jobs.delete(due[0]);due[1].fn();
   }
   time=target;
  },
  get nextDelay(){
   return jobs.size?Math.min(...[...jobs.values()].map(j=>j.at-time)):null;
  },
  get count(){return jobs.size}
 };
}
test('map-scoped notifications ignore known unrelated maps but accept deletion without map identity',()=>{
 assert.equal(eventAffectsMap({new:{map_id:'a'}},'b'),false);
 assert.equal(eventAffectsMap({old:{map_id:'a'},new:{map_id:'b'}},'a'),true);
 assert.equal(eventAffectsMap({old:{map_id:'a'},new:{map_id:'b'}},'b'),true);
 assert.equal(eventAffectsMap({old:{id:'token-id'}},'b'),true);
 assert.equal(eventAffectsMap({new:{map_id:'a'}},''),false);
});
test('bursts of token change events trigger one refresh and cancellation skips queued work',()=>{
 const clock=fakeTimers();
 let count=0;
 const gate=createCoalescedRefresh(()=>count++,100,clock);
 gate.request();gate.request();gate.request();
 assert.equal(clock.count,1);
 clock.advance(99);assert.equal(count,0);
 clock.advance(1);assert.equal(count,1);
 gate.request();gate.flush();assert.equal(count,2);
 assert.equal(clock.count,0);
 gate.request();gate.cancel();clock.advance(500);
 assert.equal(count,2);
});
test('healthy Realtime polls less often, reconnects immediately and disconnected polling remains fast',async()=>{
 const clock=fakeTimers();
 let count=0,visible=true;
 const poll=createAdaptiveReconciler(async()=>{count++},{
  healthyMs:CHAT_RECONCILE_MS.healthy,
  fallbackMs:CHAT_RECONCILE_MS.fallback,
  isVisible:()=>visible,...clock
 });
 assert.equal(clock.nextDelay,4000);
 poll.setConnected(true);
 assert.equal(clock.nextDelay,30000);
 clock.advance(30000);
 await Promise.resolve();await Promise.resolve();
 assert.equal(count,1);
 poll.setConnected(false);
 assert.equal(clock.nextDelay,4000);
 visible=false;
 clock.advance(4000);
 await Promise.resolve();
 assert.equal(count,1);
 visible=true;
 poll.refreshNow();
 await Promise.resolve();await Promise.resolve();
 assert.equal(count,2);
 poll.dispose();
 assert.equal(clock.count,0);
 assert.equal(ROSTER_RECONCILE_MS.healthy,60000);
});
