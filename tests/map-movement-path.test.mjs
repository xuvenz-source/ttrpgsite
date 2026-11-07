import test from 'node:test';
import assert from 'node:assert/strict';
import {appendMovementWaypoint,movementPathDeltas,MAX_MOTION_WAYPOINTS}
 from '../src/MapMovementPath.js';
test('straight drags compress but turns and backtracking remain',()=>{
 let path=[];
 for(let x=1;x<=12;x++)path=appendMovementWaypoint(path,x,0);
 assert.deepEqual(path,[{dx:12,dy:0}]);
 path=appendMovementWaypoint(path,12,1);
 path=appendMovementWaypoint(path,12,7);
 assert.deepEqual(movementPathDeltas(path),[{dx:12,dy:0},{dx:0,dy:7}]);
 path=appendMovementWaypoint(path,12,2);
 assert.deepEqual(movementPathDeltas(path),[{dx:12,dy:0},{dx:0,dy:7},{dx:0,dy:-5}]);
});
test('path accepts only bounded integer steps',()=>{
 assert.deepEqual(appendMovementWaypoint([],NaN,0),[]);
 assert.deepEqual(appendMovementWaypoint([],129,0),[]);
 assert.equal(movementPathDeltas([{dx:1.2,dy:0}]),null);
 assert.equal(MAX_MOTION_WAYPOINTS,64);
});
