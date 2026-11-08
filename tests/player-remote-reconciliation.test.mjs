import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createTokenMotionRuntime} from '../src/TokenMotionRuntime.js';
import {createRemotePositionSettler} from '../src/RemotePositionSettler.js';
import {createLeadingCoalescedRefresh} from '../src/PerformanceScheduling.js';
import {applyAuthoritativeTokenMotion,reconcileTokenSnapshot,isOlderTokenSnapshot} from '../src/LiveTokenMovement.js';

function clocks(){
 let seq=0;
 const timers=new Map(),frames=[];
 return {
  setTimer:(fn)=>{const id=++seq;timers.set(id,fn);return id},
  clearTimer:id=>timers.delete(id),
  frame:fn=>{frames.push(fn);return frames.length},
  flushFrames(){while(frames.length)frames.shift()()},
  tick(){
   const items=[...timers.entries()];
   for(const [id,fn] of items)if(timers.has(id)){timers.delete(id);fn()}
  },
  count:()=>timers.size
 };
}
const token=(id,x,updated_at)=>({
 id,map_id:'map',x,y:1,name:'Scout',updated_at,visible:true,
 status_effects:[]
});
const earlier='2026-11-08T04:00:00.000Z';
const later='2026-11-08T04:00:01.000Z';

test('a late RLS snapshot never replaces a newer observed position for an authorized row',()=>{
 const newest=token('a',6,later),old=token('a',2,earlier);
 assert.equal(isOlderTokenSnapshot(old,newest),true);
 assert.equal(reconcileTokenSnapshot([newest],[old])[0],newest);
 // Missing RLS-authorized rows must disappear. Never retain old NPC artwork
 // for a token omitted by the fresh policy-filtered snapshot.
 assert.deepEqual(reconcileTokenSnapshot([newest],[]),[]);
 assert.deepEqual(reconcileTokenSnapshot([old],[newest]),[newest]);
 assert.equal(isOlderTokenSnapshot(newest,old),false);
});

test('out-of-order Realtime token events cannot rewind the server timestamp',()=>{
 const last=token('a',7,later),old=token('a',4,earlier);
 assert.equal(applyAuthoritativeTokenMotion([last],{
  eventType:'UPDATE',new:old
 },'map')[0],last);
 const first=token('a',2,earlier);
 const next=applyAuthoritativeTokenMotion([first],{
  eventType:'UPDATE',new:last
 },'map');
 assert.equal(next[0].x,7);
 assert.equal(next[0].updated_at,later);
});

test('a newer private preview cancels an older final-position settlement',()=>{
 const clock=clocks(),settled=[];
 const queue=createRemotePositionSettler({
  delayMs:180,setTimer:clock.setTimer,clearTimer:clock.clearTimer,
  settle:(...args)=>settled.push(args)
 });
 queue.noteCanonical('a',4,2);queue.noteCanonical('a',6,2);
 assert.equal(clock.count(),1);
 queue.notePreview('a');clock.tick();
 assert.deepEqual(settled,[]);
 queue.noteCanonical('a',7,3);clock.tick();
 assert.deepEqual(settled,[['a',7,3]]);
 queue.noteCanonical('a',9,4);queue.dispose();
 clock.tick();assert.deepEqual(settled,[['a',7,3]]);
});

test('remote sprite settles to final saved position before its overlay is removed',()=>{
 const clock=clocks();
 const runtime=createTokenMotionRuntime({
  requestFrame:clock.frame,cancelFrame:()=>{},
  setTimer:clock.setTimer,clearTimer:clock.clearTimer
 });
 const sprite={style:{}},monitor={style:{}};
 runtime.bind('a','sprite',sprite,{x:4,y:1,cell:50});
 runtime.bind('a','monitor',monitor,{x:4,y:1,cell:50});
 runtime.previewRemote('a',2,1);clock.flushFrames();
 assert.equal(sprite.style.translate,'-100px 0px');
 assert.equal(runtime.settleRemote('a',4,1),true);
 clock.flushFrames();
 assert.equal(sprite.style.transition,'translate 95ms linear');
 assert.equal(sprite.style.translate,'');
 assert.equal(runtime.getPreview('a').settling,true);
 clock.tick();clock.flushFrames();
 assert.equal(runtime.getPreview('a'),null);
 assert.equal(monitor.style.translate,'');
 runtime.dispose();
});

test('a new observer packet cannot be removed by the prior settle timer',()=>{
 const clock=clocks();
 const runtime=createTokenMotionRuntime({
  requestFrame:clock.frame,cancelFrame:()=>{},
  setTimer:clock.setTimer,clearTimer:clock.clearTimer
 });
 const sprite={style:{}};
 runtime.bind('a','sprite',sprite,{x:4,y:1,cell:60});
 runtime.previewRemote('a',2,1);
 runtime.settleRemote('a',4,1);
 runtime.previewRemote('a',5,1);
 clock.tick();clock.flushFrames();
 assert.equal(runtime.getPreview('a').x,5);
 assert.equal(sprite.style.translate,'60px 0px');
 runtime.dispose();
});

test('first visibility revision refetches immediately and subsequent burst ticks coalesce',()=>{
 const clock=clocks(),requests=[];
 const scheduler=createLeadingCoalescedRefresh(()=>requests.push('rpc'),60,{
  setTimer:clock.setTimer,clearTimer:clock.clearTimer
 });
 scheduler.request();
 assert.deepEqual(requests,['rpc']);
 scheduler.request();scheduler.request();
 assert.equal(clock.count(),1);
 clock.tick();assert.deepEqual(requests,['rpc','rpc']);
 clock.tick();assert.equal(requests.length,2);
 scheduler.cancel();scheduler.request();assert.equal(requests.length,2);
});

test('player token and monitor refs remain stable, and artwork is eager only on the board',()=>{
 const board=readFileSync(new URL('../src/BattlemapBoard.jsx',import.meta.url),'utf8');
 const monitors=readFileSync(new URL('../src/TokenMonitorFrames.jsx',import.meta.url),'utf8');
 const app=readFileSync(new URL('../src/TabletopApp.jsx',import.meta.url),'utf8');
 const fog=readFileSync(new URL('../src/useAuthorizedMapFog.js',import.meta.url),'utf8');
 assert.match(board,/ref=\{spriteRef\(t\.id\)\}/);
 assert.match(monitors,/ref=\{bindNode\}/);
 assert.match(board,/className="token-art" loading="eager"/);
 assert.match(app,/remotePositionSettler\.current\?\.noteCanonical/);
 assert.match(app,/isOlderTokenSnapshot\(event\.new,previous\)/);
 assert.match(fog,/createLeadingCoalescedRefresh\(\(\)=>void refresh\(\),60\)/);
});
