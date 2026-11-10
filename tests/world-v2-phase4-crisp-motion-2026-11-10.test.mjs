import test from 'node:test';
import assert from 'node:assert/strict';
import {createApprovedPathPresentation}
 from '../src/engine/v2/ApprovedPathPresentation.js';

test('verified route animates each bend and never draws a wall-crossing shortcut',()=>{
 const p=createApprovedPathPresentation();
 assert.equal(p.reset({x:2,y:2}),true);
 assert.equal(p.accept({x:2,y:2},[
  {x:3,y:2},{x:4,y:2},{x:4,y:3},{x:4,y:4}
 ]),true);
 assert.equal(p.pendingCount,4);
 assert.equal(p.tick(1000),null);
 const first=p.tick(1030);
 assert.ok(first.x>2&&first.x<4);
 assert.equal(first.y,2,'the first rendered section must stay horizontal');
 for(let now=1060;now<=1600;now+=30)p.tick(now);
 assert.deepEqual(p.position,{x:4,y:4});
 assert.equal(p.pendingCount,0);
});

test('unknown, nonadjacent, invalid and out-of-order client routes fail closed',()=>{
 const p=createApprovedPathPresentation();
 p.reset({x:1,y:1});
 assert.equal(p.accept({x:1,y:1},[{x:4,y:1}]),false);
 assert.equal(p.accept({x:1,y:1},[{x:2,y:1},{x:10,y:10}]),false);
 assert.equal(p.accept({x:1,y:1},[{x:2,y:1,hidden:true}]),true,
  'point payload is copied to public x/y only after upstream ACK validation');
 assert.deepEqual(p.endpoint,{x:2,y:1});
 assert.equal(p.accept({x:1,y:1},[{x:2,y:2}]),false);
 assert.equal(p.accept({x:2,y:1},[{x:3,y:1}]),true);
 assert.equal(p.pendingCount,2);
});

test('bounded approved catch-up never teleports dozens of tiles per frame',()=>{
 const p=createApprovedPathPresentation();
 p.reset({x:0,y:0});
 let cursor=0;
 for(let group=0;group<4;group++){
  const cells=Array.from({length:24},()=>({x:++cursor,y:0}));
  assert.equal(p.accept({x:cursor-24,y:0},cells),true);
 }
 assert.equal(p.pendingCount,96);
 assert.equal(p.tick(1000),null);
 const next=p.tick(1120);
 assert.ok(next.x>0&&next.x<=2.5+1e-9);
 assert.ok(p.pendingCount<96);
 assert.equal(p.accept({x:96,y:0},[{x:97,y:0}]),true);
 assert.ok(p.pendingCount<=96,'bounded queue must never grow unbounded');
});

test('reset clears old frames and never replays an obsolete authorization',()=>{
 const p=createApprovedPathPresentation();
 p.reset({x:0,y:0});
 p.accept({x:0,y:0},[{x:1,y:0}]);
 p.tick(1000);
 p.reset({x:6,y:6});
 assert.equal(p.pendingCount,0);
 assert.deepEqual(p.position,{x:6,y:6});
 assert.equal(p.tick(1100),null);
 assert.equal(p.accept({x:0,y:0},[{x:1,y:0}]),false);
});
