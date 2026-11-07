import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeAuthorizedLightMasks,lightCellRuns} from '../src/AuthorizedLightMasks.js';
const map='00000000-0000-4000-8000-000000000001';
const id='00000000-0000-4000-8000-000000000002';
test('sanitized light masks accept authorized cells without exposing wall geometry',()=>{
 const mask=normalizeAuthorizedLightMasks({
  mapId:map,revision:4,width:4,height:3,
  masks:[{id,cells:[0,1,2,4,5,7]}]},map);
 assert.deepEqual(mask.masks[id],[0,1,2,4,5,7]);
 assert.deepEqual(lightCellRuns(mask.masks[id],4),[
  {x:0,y:0,width:3},{x:0,y:1,width:2},{x:3,y:1,width:1}
 ]);
});
test('light mask rejects foreign map, private geometry and invalid indices',()=>{
 const base={mapId:map,revision:2,width:3,height:2,
  masks:[{id,cells:[0,1,2]}]};
 assert.equal(normalizeAuthorizedLightMasks({...base,mapId:'elsewhere'},map),null);
 assert.equal(normalizeAuthorizedLightMasks({...base,objects:[]},map),null);
 assert.equal(normalizeAuthorizedLightMasks({...base,masks:[{id,cells:[8]}]},map),null);
 assert.equal(normalizeAuthorizedLightMasks({...base,masks:[{id,cells:[-1]}]},map),null);
 assert.equal(normalizeAuthorizedLightMasks({...base,width:900},map),null);
});
