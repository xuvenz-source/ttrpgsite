import test from 'node:test';
import assert from 'node:assert/strict';
import {traceLegalTokenDestination} from '../src/MapMovementTrajectory.js';

const map={width:700,height:700,grid_size:70};
const wall={id:'w',type:'wall',points:[{x:3,y:0},{x:3,y:10}],
 blocksMovement:true};
const env={objects:[wall]};
const unit={x:0,y:1,span_x:1,span_y:1};
const trace=(token,destination,environment=env)=>traceLegalTokenDestination({
 token,destination,map,environment
});
test('a high speed drag stops at the last legal cell before a wall',()=>{
 assert.deepEqual(trace(unit,{x:7,y:1}),{x:2,y:1,complete:false,reason:'barrier',blockerId:'w'});
 assert.deepEqual(trace({...unit,x:5},{x:8,y:1}),{x:8,y:1,complete:true,reason:'ok'});
});
test('large tokens and diagonal corner crossing cannot bypass a segment',()=>{
 const large={...unit,span_x:2,span_y:2};
 const value=trace(large,{x:6,y:6});
 assert.equal(value.complete,false);
 assert.ok(value.x<=2);
});
test('open doors pass, and invalid geometry is rejected',()=>{
 const door={...wall,type:'door',state:'open'};
 assert.equal(trace(unit,{x:5,y:1},{objects:[door]}).complete,true);
 assert.equal(trace(unit,{x:5.3,y:1}).complete,false);
 assert.equal(trace(unit,{x:5,y:1},null).reason,'invalid');
});
