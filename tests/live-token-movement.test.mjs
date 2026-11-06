import test from 'node:test';
import assert from 'node:assert/strict';
import {allowedMovementPreview,canSendMovementPreview,movementTopic,
 MOVE_PREVIEW_INTERVAL_MS} from '../src/LiveTokenMovement.js';
const mapId='11111111-1111-4111-8111-111111111111',dm='22222222-2222-4222-8222-222222222222';
const player='33333333-3333-4333-8333-333333333333',other='44444444-4444-4444-8444-444444444444';
const id='55555555-5555-4555-8555-555555555555';
const tokens=[{id,map_id:mapId,owner_id:player}],members=[{user_id:dm,role:'dm'},{user_id:player,role:'player'},{user_id:other,role:'player'}];
const packet={id,mapId,actor:player,x:5,y:8,seq:7};
test('token previews are throttled and scoped to their map channel',()=>{
 assert.ok(MOVE_PREVIEW_INTERVAL_MS>=30);
 assert.equal(movementTopic(mapId),'forge-map:'+mapId);
 assert.equal(allowedMovementPreview(packet,mapId,tokens,members,other),true);
 assert.equal(allowedMovementPreview({...packet,mapId:other},mapId,tokens,members,other),false);
});
test('unrelated clients cannot move another token via the normal protocol',()=>{
 assert.equal(allowedMovementPreview({...packet,actor:other},mapId,tokens,members,dm),false);
 assert.equal(allowedMovementPreview({...packet,actor:dm},mapId,tokens,members,player),true);
 assert.equal(allowedMovementPreview({...packet,x:Infinity},mapId,tokens,members,dm),false);
 assert.equal(canSendMovementPreview(tokens[0],other,mapId,false),false);
 assert.equal(canSendMovementPreview(tokens[0],player,mapId,false),true);
});
