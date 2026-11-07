import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {selectableToolIds,selectableTokenIds,selectedMapMembers,
 boundedGroupOffset,selectionRectangle} from '../src/MapSelection.js';
import {allowedToolMovementPreview,canSendToolMovementPreview} from '../src/LiveToolMovement.js';
const idA='11111111-1111-4111-8111-111111111111';
const idB='22222222-2222-4222-8222-222222222222';
const actor='33333333-3333-4333-8333-333333333333';
const viewer='44444444-4444-4444-8444-444444444444';
const map='map-1',cell=70;
const issued=[
 {id:idA,owner_id:actor,party_shared:false},
 {id:idB,owner_id:viewer,party_shared:true}
];
const placed=[
 {issue_id:idA,map_id:map,kind:'mount',span:2,x:3,y:2},
 {issue_id:idB,map_id:map,kind:'torch',span:1,x:7,y:4}
];
const tokens=[{id:'character-1',map_id:map,owner_id:actor,visible:true,
 x:2,y:2,span_x:1,span_y:1}];
test('marquee selects tokens and tools by occupied footprint',()=>{
 const rect=selectionRectangle({x:180,y:145},{x:292,y:225});
 assert.deepEqual(selectableTokenIds(tokens,rect,cell,actor,false,map),['character-1']);
 assert.deepEqual(selectableToolIds(placed,issued,rect,cell,actor,false,map),[idA]);
 const corner={x:278,y:270,width:4,height:4};
 assert.deepEqual(selectableToolIds(placed,issued,corner,cell,actor,false,map),[idA]);
});
test('mixed selection clamps a token and a large issued mount as one group',()=>{
 const members=selectedMapMembers(['character-1'],[idA],tokens,placed,issued,
  actor,false,map);
 assert.equal(members.length,2);
 assert.deepEqual(members.map(m=>m.source),['token','tool']);
 assert.deepEqual([members[1].span_x,members[1].span_y],[2,2]);
 const delta=boundedGroupOffset(members,9,5,560,420,cell);
 assert.deepEqual(delta,{dx:3,dy:2});
 const moved=members.map(m=>({x:Number(m.x)+delta.dx,y:Number(m.y)+delta.dy}));
 assert.equal(moved[1].x-moved[0].x,1);
 assert.equal(moved[1].y-moved[0].y,0);
});
test('private tools are never added to a player marquee without control',()=>{
 const rect={x:0,y:0,width:1000,height:1000};
 assert.deepEqual(selectableToolIds(placed,issued,rect,cell,viewer,false,map),[idB]);
 assert.deepEqual(selectableToolIds(placed,issued,rect,cell,viewer,true,map),[idA,idB]);
 assert.equal(selectedMapMembers([], [idA],tokens,placed,issued,
  viewer,false,map).length,0);
});
test('tool movement previews are bounded, map-scoped and permission checked',()=>{
 const payload={id:idA,actor,mapId:map,x:4,y:2,seq:1,final:false};
 const members=[{user_id:actor,role:'player'},{user_id:viewer,role:'player'}];
 assert.equal(allowedToolMovementPreview(payload,map,placed,issued,members,viewer),true);
 assert.equal(allowedToolMovementPreview({...payload,id:idB},map,placed,issued,members,viewer),true);
 assert.equal(allowedToolMovementPreview({...payload,actor:viewer},map,placed,issued,members,viewer),false);
 assert.equal(allowedToolMovementPreview({...payload,mapId:'another'},map,placed,issued,members,viewer),false);
 assert.equal(allowedToolMovementPreview({...payload,x:NaN},map,placed,issued,members,viewer),false);
 assert.equal(canSendToolMovementPreview(placed[0],issued[0],actor,map,false),true);
 assert.equal(canSendToolMovementPreview(placed[0],issued[0],viewer,map,false),false);
});
test('Board handles mixed movement, previews, and commits without whole inventory writes',()=>{
 const app=readFileSync(new URL('../src/main.jsx',import.meta.url),'utf8');
 const layer=readFileSync(new URL('../src/CampaignToolMapLayer.jsx',import.meta.url),'utf8');
 const hook=readFileSync(new URL('../src/useCampaignTools.js',import.meta.url),'utf8');
 for(const needle of ['selectableToolIds(','selectedMapMembers(','moveGroupDrag(',
  "onToolMovementPreview?.(t.id,next.x,next.y,false)",
  "onToolMove?.(t.id,next.x,next.y)", "event:'tool-preview'",
  'remoteToolPositions={remoteToolPositions}'])
  assert.ok(app.includes(needle),needle);
 assert.match(layer,/selectedIds.includes\(p.issue_id\)/);
 assert.match(layer,/preview\[p.issue_id\]\|\|remotePositions\[p.issue_id\]/);
 assert.match(hook,/pendingMoves\.current\.get\(issueId\)/);
 assert.match(hook,/\.update\(\{x:nextX,y:nextY\}\)/);
 assert.doesNotMatch(hook,/\.update\(\{state:.*x:nextX/);
});
