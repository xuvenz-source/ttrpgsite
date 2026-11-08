import test from 'node:test';
import assert from 'node:assert/strict';
import {fogPaintMask,changedFogCells,FOG_UNEXPLORED,FOG_EXPLORED,FOG_VISIBLE} from '../src/FogRenderDelta.js';

test('new, explored and visible fog states are distinct',()=>{
 const m=fogPaintMask({width:3,height:2,enabled:true,visible:[1],explored:[1,2,5]});
 assert.deepEqual([...m],[FOG_UNEXPLORED,FOG_VISIBLE,FOG_EXPLORED,
  FOG_UNEXPLORED,FOG_UNEXPLORED,FOG_EXPLORED]);
 assert.deepEqual(changedFogCells(null,m),[0,1,2,3,4,5]);
 assert.deepEqual(changedFogCells(m,m),[]);
});
test('only changed fog cells are repainted on a movement revision',()=>{
 const start=fogPaintMask({width:3,height:2,enabled:true,visible:[1],explored:[1]});
 const next=fogPaintMask({width:3,height:2,enabled:true,visible:[1,2],explored:[1,2]});
 assert.deepEqual(changedFogCells(start,next),[2]);
});
test('cosmetic hold cannot expose unexplored cells',()=>{
 const pending=fogPaintMask({width:4,height:1,enabled:true,visible:[],explored:[1,2]},[0,1,99]);
 assert.deepEqual([...pending],[FOG_UNEXPLORED,FOG_VISIBLE,FOG_EXPLORED,FOG_UNEXPLORED]);
});
test('invalid frame is denied rather than initialized as visible',()=>{
 assert.equal(fogPaintMask(null),null);
 assert.equal(fogPaintMask({width:900,height:1}),null);
});
