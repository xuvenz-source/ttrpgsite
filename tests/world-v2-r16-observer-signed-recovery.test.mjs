import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createObserverSightRecovery} from '../src/engine/v2/ObserverSightRecovery.js';

test('R16 bounded signed sight retries a stale cursor, single-flights, never repaints itself',async()=>{
 let attempts=0,waiting=true,exhausted=0,authorized=true;
 const recovery=createObserverSightRecovery({
  refresh:async()=>{if(++attempts===2)waiting=false},
  isWaiting:()=>waiting,isAuthorized:()=>authorized,
  onExhausted:()=>{exhausted++;return false}
 });
 const one=recovery.recover(),two=recovery.recover();
 assert.equal(one,two,'concurrent renderer requests must share one recovery');
 assert.equal(await one,true);
 assert.equal(attempts,2);
 assert.equal(exhausted,0);
 assert.equal(await recovery.recover(),true);
 assert.equal(attempts,2,'already accepted signed frame must not refetch');
 authorized=false;
 assert.equal(await recovery.recover(),false);
 assert.equal(exhausted,0);
});

test('R16 three stale signed reads fall back once to the original fail-closed scene recovery',async()=>{
 let calls=0,fallbacks=0;
 const recovery=createObserverSightRecovery({
  refresh:async()=>{calls++},isWaiting:()=>true,isAuthorized:()=>true,
  onExhausted:async()=>{fallbacks++;return true}
 });
 assert.equal(await recovery.recover(),true);
 assert.equal(calls,3);
 assert.equal(fallbacks,1);
});

test('R16 revocation during pending sight never fetches again or triggers an unsafe recovery',async()=>{
 let resolveFetch,authorized=true,calls=0,fallbacks=0;
 const blocking=new Promise(r=>{resolveFetch=r});
 const recovery=createObserverSightRecovery({
  refresh:async()=>{calls++;await blocking},
  isWaiting:()=>true,isAuthorized:()=>authorized,
  onExhausted:()=>{fallbacks++;return true}
 });
 const result=recovery.recover();
 await Promise.resolve();
 authorized=false;resolveFetch();
 assert.equal(await result,false);
 assert.equal(calls,1);
 assert.equal(fallbacks,0);
});

test('R16 dispose fences in-flight authorized sight and never recovers after unmount',async()=>{
 let resolveFetch,calls=0,fallbacks=0;
 const blocking=new Promise(r=>{resolveFetch=r});
 const recovery=createObserverSightRecovery({
  refresh:async()=>{calls++;await blocking},
  isWaiting:()=>true,isAuthorized:()=>true,
  onExhausted:()=>{fallbacks++;return true}
 });
 const result=recovery.recover();await Promise.resolve();
 recovery.dispose();resolveFetch();
 assert.equal(await result,false);
 assert.equal(await recovery.recover(),false);
 assert.equal(calls,1);assert.equal(fallbacks,0);
});

test('R16 client runtime delegates only private observer buffer mismatch to bounded signed recovery',()=>{
 const rt=readFileSync(new URL('../src/engine/v2/WorldV2TabletopRuntime.js',import.meta.url),'utf8');
 const board=readFileSync(new URL('../src/engine/v2/WorldV2Board.jsx',import.meta.url),'utf8');
 assert.match(rt,/createObserverSightRecovery\(/);
 assert.match(rt,/refresh:\(\)=>refreshVisibility\('observer-path-await-vision'\)/);
 assert.match(rt,/onExhausted:\(\)=>refreshScene\('observer-path-discontinuity'\)/);
 assert.match(rt,/recoverObserverSight:\(\)=>deferredObserverRecovery\.recover\(\)/);
 assert.match(rt,/deferredObserverRecovery\.dispose\(\)/);
 assert.match(board,/if\(reason==='observer-path-await-vision'\)[\s\S]*?r\.recoverObserverSight\(\)/);
 assert.match(board,/if\(\['observer-sequence-gap','observer-path-discontinuity'/);
});
