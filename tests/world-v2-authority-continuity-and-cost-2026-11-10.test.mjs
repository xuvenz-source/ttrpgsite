import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {mayRetainCertifiedSightOnObserverRecovery}
 from '../src/engine/v2/ObserverSightContinuity.js';
import {createTrailingRefresh} from '../src/PerformanceScheduling.js';

const mapId='10000000-0000-4000-8000-000000000001';
const viewerId='30000000-0000-4000-8000-000000000001';
const scene={mapId,revision:8,sceneGeneration:3};
const frame={mapId,viewerId,scope:'viewer',environmentRevision:8,
 sceneGeneration:3,permissionGeneration:5,visionEpoch:7};
const allowed=(override={})=>mayRetainCertifiedSightOnObserverRecovery({
 reason:'unknown-piece',scene,frame,painted:frame,
 rendererAuthorized:true,sceneStale:false,...override
});

test('only a same-actor, same-revision unknown piece retains certified sight',()=>{
 assert.equal(allowed(),true);
 for(const reason of ['sequence-gap','invalid-packet','version-change',
  'disconnected','invalid-vision-event','invalid-snapshot','scene-current'])
  assert.equal(allowed({reason}),false,'must fail closed: '+reason);
 assert.equal(allowed({rendererAuthorized:false}),false);
 assert.equal(allowed({sceneStale:true}),false);
 assert.equal(allowed({painted:{...frame,viewerId:'30000000-0000-4000-8000-000000000002'}}),false);
 assert.equal(allowed({painted:{...frame,scope:'dm'}}),false);
 assert.equal(allowed({painted:{...frame,permissionGeneration:6}}),false);
 assert.equal(allowed({painted:{...frame,visionEpoch:6}}),false);
 assert.equal(allowed({scene:{...scene,revision:9}}),false);
 assert.equal(allowed({scene:{...scene,sceneGeneration:4}}),false);
 assert.equal(allowed({painted:null}),false);
});

test('V2 burst reconciliation schedules one canonical read and cancels on map exit',()=>{
 let id=0,updates=0;
 const callbacks=new Map();
 const timers={setTimer(fn){const key=++id;callbacks.set(key,fn);return key},
  clearTimer(key){callbacks.delete(key)}};
 const queue=createTrailingRefresh(()=>updates++,280,timers);
 for(let i=0;i<100;i++)queue.request();
 assert.equal(callbacks.size,1,'only one delayed fetch for a burst');
 assert.equal(updates,0,'observer paints immediate motion, not React row reads');
 for(const fn of callbacks.values())fn();
 callbacks.clear();
 assert.equal(updates,1);
 queue.request();queue.cancel();
 assert.equal(callbacks.size,0);
 assert.equal(updates,1);
});

test('V2 onCommit uses trailing reconciliation, not two immediate per-step RPC reads',()=>{
 const app=readFileSync(new URL('../src/TabletopApp.jsx',import.meta.url),'utf8');
 assert.match(app,/onMovementCommitted=\{\(\)=>v2CommitReconciler\.current\?\.request\(\)\}/);
 assert.match(app,/const queue=createTrailingRefresh\(/);
 assert.match(app,/v2CommitReconciler\.current===queue/);
 assert.doesNotMatch(app,/onMovementCommitted=\{\(\)=>\{\s*void refreshTokens\(\)/);
 const runtime=readFileSync(new URL('../src/engine/v2/WorldV2TabletopRuntime.js',import.meta.url),'utf8');
 assert.match(runtime,/mayRetainCertifiedSightOnObserverRecovery/);
 assert.match(runtime,/retainingObserverSight&&stream\?\.locked/);
});
