import test from 'node:test';
import assert from 'node:assert/strict';
import {validObserverMovementPacket,nextMotionSequence,
 acceptObserverMovementPacket,observerMotionTopic} from '../src/ObserverMovement.js';
const map='00000000-0000-4000-8000-000000000001';
const viewer='00000000-0000-4000-8000-000000000002';
const actor='00000000-0000-4000-8000-000000000004';
const id='00000000-0000-4000-8000-000000000003';
const packet={kind:'token',action:'move',mapId:map,id,actor,x:5,y:6,seq:1700000000000000};
test('observer channel uses map scope and authenticated recipient',()=>{
 assert.equal(observerMotionTopic(map,viewer),'forge-observer:'+map+':'+viewer);
 assert.ok(validObserverMovementPacket(packet,map,viewer));
 assert.ok(!validObserverMovementPacket(packet,'not-map',viewer));
 assert.ok(!validObserverMovementPacket({...packet,actor:viewer},map,viewer));
 assert.ok(!validObserverMovementPacket({...packet,id:'fake'},map,viewer));
});
test('hide packets must not include unauthorized coordinates',()=>{
 assert.ok(validObserverMovementPacket({...packet,action:'hide',x:undefined,y:undefined},map,viewer));
 assert.ok(!validObserverMovementPacket({...packet,action:'hide'},map,viewer));
 assert.ok(!validObserverMovementPacket({...packet,x:NaN},map,viewer));
 assert.ok(!validObserverMovementPacket({...packet,action:'teleport'},map,viewer));
});
test('observer sequence discards stale and duplicate motion',()=>{
 const seq=new Map();
 assert.ok(acceptObserverMovementPacket(packet,seq));
 assert.ok(!acceptObserverMovementPacket(packet,seq));
 assert.ok(!acceptObserverMovementPacket({...packet,seq:packet.seq-5},seq));
 assert.ok(acceptObserverMovementPacket({...packet,seq:packet.seq+1},seq));
 assert.equal(nextMotionSequence(1700000000000,1700000000000000),1700000000000001);
});
