import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {toolMapProjection} from '../src/CampaignTools.js';
import {selectableToolIds,groupToolFootprint,boundedGroupOffset} from '../src/MapSelection.js';
import {allowedToolMovementPreview,canSendToolMovementPreview} from '../src/LiveToolMovement.js';
import {overlayToolPlacements} from '../src/useCampaignTools.js';

const map='e5d93ddb-00af-40a8-ac02-a4c97c9d7cb4',
 token='04b343c6-21aa-41fb-a110-7374b6f21d18',
 dm='893dd741-a010-44e1-8dcf-cf019344f700',
 player='be254c8a-899d-422a-86e8-538ea51efaa9',
 outsider='416c9c51-c7e5-4b9b-b32a-18eb8c12b8ac',
 members=[{user_id:dm,role:'dm'},{user_id:player,role:'player'}];
const issue={id:token,campaign_id:map,kind:'torch',icon:'🔥',name:'Torch',
 owner_id:player,party_shared:false,config:{bright:15,dim:10,color:'#ffce7a',intensity:85},state:{lit:true}};
const placed=toolMapProjection(issue,map,2,3);
const source=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');

test('public projections have only safe light fields, not private attributes or items',()=>{
 assert.deepEqual([placed.x,placed.y,placed.span,placed.light_bright,placed.light_dim],[2,3,1,15,10]);
 assert.ok(!Object.hasOwn(placed,'owner_id'));
 assert.ok(!Object.hasOwn(placed,'state'));
 assert.ok(!Object.hasOwn(placed,'config'));
 const dark=toolMapProjection({...issue,state:{lit:false}},map,2,3);
 assert.equal(dark.light_enabled,false);
});
test('map marquee includes permitted torches and mounts but not unissued private tools',()=>{
 const other={...issue,id:'6dfcc0f7-e44f-4bbd-8a16-612e279be21d',owner_id:outsider};
 const publicRows=[placed,toolMapProjection(other,map,3,3)];
 const r={x:100,y:150,width:220,height:160};
 assert.deepEqual(selectableToolIds(publicRows,[issue],r,70,player,false,map),[token]);
 assert.deepEqual(selectableToolIds(publicRows,[issue,other],r,70,dm,true,map),
  [token,other.id]);
 const shared={...other,party_shared:true,owner_id:null};
 assert.deepEqual(selectableToolIds(publicRows,[issue,shared],r,70,player,false,map),
  [token,other.id]);
});
test('mixed tool/token movement clamps and keeps the formation together',()=>{
 const torch=groupToolFootprint(placed);
 const character={x:4,y:4,span_x:1,span_y:1};
 const group=[torch,character];
 assert.deepEqual(boundedGroupOffset(group,1,-2,700,700,70),{dx:1,dy:-2});
 assert.deepEqual(boundedGroupOffset(group,-9,-9,700,700,70),{dx:-2,dy:-3});
});
test('optimistic map overlays persist through slow refresh and remove only selected issue',()=>{
 const newPosition=toolMapProjection(issue,map,7,6);
 const pending=new Map([[token,{row:newPosition,stamp:1}]]);
 assert.deepEqual(overlayToolPlacements([placed],pending,map),[newPosition]);
 pending.set(token,{row:null,stamp:2});
 assert.deepEqual(overlayToolPlacements([placed],pending,map),[]);
 pending.clear();
 assert.deepEqual(overlayToolPlacements([placed],pending,map),[placed]);
});
test('movement preview must belong to known campaign members and authorized issued tools',()=>{
 const payload={id:token,actor:player,mapId:map,x:4,y:6,seq:10};
 assert.equal(allowedToolMovementPreview(payload,map,[placed],[issue],members,dm),true);
 assert.equal(allowedToolMovementPreview({...payload,actor:outsider},map,[placed],[issue],members,dm),false);
 assert.equal(allowedToolMovementPreview({...payload,actor:dm},map,[placed],[],members,player),true);
 assert.equal(allowedToolMovementPreview({...payload,x:-1},map,[placed],[issue],members,dm),false);
 assert.equal(allowedToolMovementPreview({...payload,mapId:outsider},map,[placed],[issue],members,dm),false);
 assert.equal(canSendToolMovementPreview(issue,outsider,false,map),false);
 assert.equal(canSendToolMovementPreview(issue,dm,true,map),true);
});
test('tool Delete is pickup rather than issued record deletion; live updates use private channel',()=>{
 const app=source('src/main.jsx'),layer=source('src/CampaignToolMapLayer.jsx'),hook=source('src/useCampaignTools.js');
 assert.match(app,/onToolPickUp\?\.\(id\)/);
 assert.match(app,/onToolMovementPreview\?\.\(tool,/);
 assert.match(app,/event:'tool-preview'/);
 assert.match(app,/remoteToolPositions=\{fog\.frame\?\.enabled\?\{\}:remoteToolPositions\}/);
 assert.match(app,/if\(access\.fogEnabled\)return;/);
 assert.match(app,/selectableToolIds\(toolPlacements,toolIssued/);
 assert.match(layer,/tool-selected/);
 assert.match(layer,/onTokenPointerUp\?\.\(e,p\)/);
 assert.match(hook,/const pickUp=issue=>moveIssue\(issue,null/);
 assert.match(hook,/const place=\(issue,targetMap,x,y\)=>moveIssue/);
});
