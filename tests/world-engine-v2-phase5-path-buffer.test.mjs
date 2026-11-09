import test from 'node:test';
import assert from 'node:assert/strict';
import {createObserverPathBuffer} from '../src/engine/v2/index.js';

const hero={kind:'token',id:'40000000-0000-4000-8000-000000000001',
 x:0,y:0};
const torch={kind:'tool',id:'50000000-0000-4000-8000-000000000001',
 x:0,y:4};
const path=(piece,coords)=>({kind:piece.kind,id:piece.id,action:'path',
 path:coords.map(([x,y])=>({x,y}))});
const pos=(buffer,piece)=>buffer.getPosition(piece.kind,piece.id);
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-6,String(a)+' != '+b);

test('no sprite is created from a trusted-looking but unrostered path',()=>{
 const b=createObserverPathBuffer();
 assert.equal(b.applyPath(path(hero,[[0,0],[1,0]])),false);
 assert.equal(pos(b,hero),null);
 b.dispose();
});

test('a sharp bend is interpolated along certified segments, never cut diagonally',()=>{
 const b=createObserverPathBuffer();
 assert.equal(b.authorizePieces([hero]),true);
 assert.equal(b.applyPath(path(hero,[[0,0],[1,0],[2,0],[2,1],[2,2]])),true);
 assert.deepEqual(b.tick(1000),[]);
 const first=b.tick(1040);
 assert.equal(first.length,1);
 near(first[0].y,0);
 assert.ok(first[0].x>0&&first[0].x<2);
 const second=b.tick(1080);
 assert.equal(second.length,1);
 near(second[0].x,2);
 assert.ok(second[0].y>0&&second[0].y<2);
 b.tick(1120);b.tick(1160);b.tick(1200);
 assert.deepEqual(pos(b,hero),{x:2,y:2});
 assert.equal(b.pendingCount,0);
 b.dispose();
});

test('adjacent approved packets append safely without dropping intermediate corners',()=>{
 const b=createObserverPathBuffer();
 b.authorizePieces([hero]);b.tick(0);
 assert.equal(b.applyPath(path(hero,[[0,0],[1,0],[1,1]])),true);
 assert.equal(b.applyPath(path(hero,[[1,1],[2,1],[2,2]])),true);
 assert.equal(b.pendingCount,4);
 for(let t=20;t<=600;t+=20)b.tick(t);
 assert.deepEqual(pos(b,hero),{x:2,y:2});
 b.dispose();
});

test('a missing corner or discontinuous path fails closed, not a shortcut',()=>{
 const b=createObserverPathBuffer();
 b.authorizePieces([hero]);
 assert.equal(b.applyPath(path(hero,[[0,0],[1,0],[1,1]])),true);
 assert.equal(b.applyPath(path(hero,[[1,1],[5,1]])),false);
 assert.equal(b.applyPath(path(hero,[[1,0],[2,0]])),false,
  'does not skip a queued turn');
 assert.equal(b.pendingCount,2);
 b.dispose();
});

test('one scheduler tick advances multiple mixed token/tool pieces',()=>{
 const b=createObserverPathBuffer();
 b.authorizePieces([hero,torch]);b.tick(0);
 b.applyPath(path(hero,[[0,0],[1,0],[2,0]]));
 b.applyPath(path(torch,[[0,4],[0,5],[0,6]]));
 const changes=b.tick(35);
 assert.deepEqual(new Set(changes.map(c=>c.kind)),new Set(['token','tool']));
 assert.ok(pos(b,hero).x>0&&pos(b,torch).y>4);
 b.dispose();
});

test('hide cancels motion and later paths cannot reveal a concealed piece',()=>{
 const b=createObserverPathBuffer();
 b.authorizePieces([hero]);b.tick(0);
 b.applyPath(path(hero,[[0,0],[1,0]]));
 assert.equal(b.applyHide({kind:'token',id:hero.id,action:'hide'}),true);
 assert.equal(pos(b,hero),null);
 assert.equal(b.pendingCount,0);
 assert.equal(b.applyPath(path(hero,[[0,0],[1,0]])),false);
 b.authorizePieces([{...hero,x:0,y:0}]);
 assert.deepEqual(pos(b,hero),{x:0,y:0},
  'only fresh authoritative roster may reveal again');
 b.dispose();
});

test('reconnect authoritative roster replaces stale trajectories immediately',()=>{
 const b=createObserverPathBuffer();
 b.authorizePieces([hero]);b.tick(0);
 b.applyPath(path(hero,[[0,0],[1,0],[2,0]]));
 b.tick(50);
 assert.ok(pos(b,hero).x>0);
 assert.equal(b.authorizePieces([{...hero,x:5,y:6}]),true);
 assert.deepEqual(pos(b,hero),{x:5,y:6});
 assert.equal(b.pendingCount,0);
 b.dispose();
});

test('malformed roster revokes old sprites, duplicates are rejected',()=>{
 const b=createObserverPathBuffer();
 b.authorizePieces([hero]);
 assert.equal(b.authorizePieces([hero,hero]),false);
 assert.equal(pos(b,hero),null);
 assert.equal(b.authorizePieces([{...hero,id:'not-uuid'}]),false);
 assert.equal(b.authorizePieces([hero,torch]),true);
 assert.equal(b.authorizePieces([{...hero,x:NaN}]),false);
 assert.equal(pos(b,hero),null);
 b.dispose();
});

test('bounded queue rejects endless backlog rather than teleporting',()=>{
 const b=createObserverPathBuffer();b.authorizePieces([hero]);
 let x=0,y=0;
 for(let batch=0;batch<4;batch++){
  const points=[[x,y]];
  for(let i=0;i<24;i++){
   x++;points.push([x,y]);
  }
  assert.equal(b.applyPath(path(hero,points)),true);
 }
 assert.equal(b.pendingCount,96);
 assert.equal(b.applyPath(path(hero,[[96,0],[97,0]])),false);
 b.dispose();
});

test('hidden or disposed buffer never animates again',()=>{
 const b=createObserverPathBuffer();
 b.authorizePieces([hero]);b.tick(0);
 b.hideAll();
 assert.deepEqual(b.tick(500),[]);
 assert.equal(pos(b,hero),null);
 b.dispose();
 assert.equal(b.applyPath(path(hero,[[0,0],[1,0]])),false);
 assert.equal(b.authorizePieces([hero]),false);
 assert.deepEqual(b.tick(600),[]);
});
