import test from 'node:test';
import assert from 'node:assert/strict';
import {createDebouncedSerialWriter} from '../src/QueuedWrites.js';

function fakeTimers(){
 let id=0;
 const jobs=new Map();
 return {
  setTimer(fn){const key=++id;jobs.set(key,fn);return key},
  clearTimer(key){jobs.delete(key)},
  fire(){const pending=[...jobs.values()];jobs.clear();pending.forEach(fn=>fn())},
  get count(){return jobs.size}
 };
}
test('rapid field changes persist only the last normalized snapshot',async()=>{
 const clock=fakeTimers(),written=[];
 const writer=createDebouncedSerialWriter(async (value,context)=>{
  written.push({value,context});
 },{...clock});
 writer.schedule({ambient:10},{mapId:'a'});
 writer.schedule({ambient:20},{mapId:'a'});
 assert.equal(clock.count,1);
 assert.equal(writer.pending,true);
 await writer.flush();
 assert.deepEqual(written,[{value:{ambient:20},context:{mapId:'a'}}]);
 assert.equal(writer.pending,false);
 assert.equal(clock.count,0);
});
test('writes are serialized across map switches and older revisions never clear newer save status',async()=>{
 const clock=fakeTimers(),started=[],saved=[];
 let releaseFirst;
 const firstPromise=new Promise(resolve=>{releaseFirst=resolve});
 const writer=createDebouncedSerialWriter(async (value,context)=>{
  started.push(context.mapId);
  if(context.mapId==='old')await firstPromise;
 },{...clock,onSaved:job=>saved.push(job.context.mapId)});
 writer.schedule({objects:[1]},{mapId:'old'},{immediate:true});
 await Promise.resolve();await Promise.resolve();
 assert.deepEqual(started,['old']);
 writer.schedule({objects:[2]},{mapId:'new'});
 const second=writer.flush();
 await Promise.resolve();
 assert.deepEqual(started,['old']);
 releaseFirst();
 await second;
 await Promise.resolve();
 assert.deepEqual(started,['old','new']);
 assert.deepEqual(saved,['new']);
});
test('a queued environment edit is flushed before its map context is discarded',async()=>{
 const clock=fakeTimers(),saved=[];
 const writer=createDebouncedSerialWriter(async (value,context)=>{
  saved.push([context.mapId,value.ambient]);
 },{...clock});
 writer.schedule({ambient:40},{mapId:'first'});
 await writer.flush(); // same operation used by cleanup on map navigation
 writer.schedule({ambient:90},{mapId:'second'});
 clock.fire();
 await writer.flush();
 assert.deepEqual(saved,[['first',40],['second',90]]);
});
