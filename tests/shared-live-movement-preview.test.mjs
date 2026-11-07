import test from 'node:test';
import assert from 'node:assert/strict';
import {validMapMovementPacket} from '../src/LiveMovementPreview.js';
import {allowedMovementPreview} from '../src/LiveTokenMovement.js';
import {allowedToolMovementPreview} from '../src/LiveToolMovement.js';
const map='00000000-0000-4000-8000-000000000101';
const token='00000000-0000-4000-8000-000000000102';
const actor='00000000-0000-4000-8000-000000000103';
const viewer='00000000-0000-4000-8000-000000000104';
const payload={mapId:map,id:token,actor,seq:1,x:2,y:4};
test('shared validator rejects malformed, stale and coordinate-leaking movement packets',()=>{
 assert.equal(validMapMovementPacket(payload,map,viewer),true);
 for(const bad of [
  {...payload,actor:viewer},{...payload,id:'x'},{...payload,seq:-1},
  {...payload,seq:1.5},{...payload,x:10001},{...payload,x:NaN},
  {...payload,y:-1},{...payload,mapId:token}
 ])assert.equal(validMapMovementPacket(bad,map,viewer),false);
});
test('token/tool visibility and control gates still apply after packet-envelope deduplication',()=>{
 const members=[{user_id:actor,role:'player'}];
 const tokens=[{id:token,map_id:map,owner_id:actor}];
 const placed=[{issue_id:token,map_id:map}];
 const issued=[{id:token,owner_id:actor,party_shared:false}];
 assert.equal(allowedMovementPreview(payload,map,tokens,members,viewer),true);
 assert.equal(allowedToolMovementPreview(payload,map,placed,issued,members,viewer),true);
 assert.equal(allowedToolMovementPreview({...payload,x:-3},map,placed,issued,members,viewer),false);
 assert.equal(allowedToolMovementPreview({...payload,actor:viewer},map,placed,issued,members,viewer),false);
});
