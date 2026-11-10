import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {eligiblePlayerPreviewTokens,chosenPlayerPreviewTokenId}
 from '../src/engine/v2/PlayerPreviewSelection.js';
import {createSceneManager} from '../src/engine/v2/SceneManager.js';
import {collisionAllowsStep} from '../src/engine/v2/CollisionSolver.js';

const MAP='10000000-0000-4000-8000-000000000001';
const OTHER_MAP='10000000-0000-4000-8000-000000000002';
const DM='30000000-0000-4000-8000-000000000003';
const PLAYER='30000000-0000-4000-8000-000000000001';
const OTHER='30000000-0000-4000-8000-000000000002';
const token=(id,owner_id,map_id=MAP,visible=true)=>
 ({id,owner_id,map_id,visible});
const actor='40000000-0000-4000-8000-000000000001';
const second='40000000-0000-4000-8000-000000000002';
const unavailable='40000000-0000-4000-8000-000000000003';

test('DM preview offers only current-map visible actors owned by campaign players',()=>{
 const members=[{user_id:DM},{user_id:PLAYER},{user_id:OTHER}];
 const tokens=[
  token('dm',DM),token('unassigned',null),token(actor,PLAYER),
  token('hidden',PLAYER,MAP,false),token('other-map',PLAYER,OTHER_MAP),
  token(second,OTHER),token('outsider',unavailable)
 ];
 const options=eligiblePlayerPreviewTokens({tokens,members,mapId:MAP,dmUserId:DM});
 assert.deepEqual(options.map(t=>t.id),[actor,second]);
 assert.equal(chosenPlayerPreviewTokenId(options,'dm'),actor);
 assert.equal(chosenPlayerPreviewTokenId(options,second),second);
 assert.equal(chosenPlayerPreviewTokenId(options,'missing'),actor);
 assert.equal(chosenPlayerPreviewTokenId([],second),'');
 assert.deepEqual(eligiblePlayerPreviewTokens({tokens,members:[],
  mapId:MAP,dmUserId:DM}),[]);
});

const manifest=(overrides={})=>({
 version:2,mapId:MAP,scope:'dm',published:false,
 revision:0,sceneGeneration:0,rulesRevision:0,
 fogEnabled:false,collisionEnabled:false,ambient:25,
 effects:{weather:'none',intensity:0},
 dimensions:{width:700,height:700,gridSize:70},environment:null,
 ...overrides
});
test('safe unconfigured DM scene allows virtual movement inside map bounds',async()=>{
 const manager=createSceneManager({mapId:MAP,viewerId:DM,
  fetchManifest:async()=>manifest()});
 try{
  assert.equal(await manager.load(),true);
  const scene=manager.collisionScene;
  assert.equal(scene.scope,'dm');
  assert.equal(scene.collisionEnabled,false);
  const pieces=[{kind:'token',id:actor,x:2,y:2,spanX:1,spanY:1}];
  assert.equal(collisionAllowsStep({scene,pieces,anchor:{x:2,y:2},
   from:{x:2,y:2},to:{x:3,y:2}}),true);
  assert.equal(collisionAllowsStep({scene,pieces,anchor:{x:2,y:2},
   from:{x:2,y:2},to:{x:-1,y:2}}),false);
 }finally{manager.dispose()}
});
test('unpublished but protected DM scene cannot create a collision bypass',async()=>{
 const manager=createSceneManager({mapId:MAP,viewerId:DM,
  fetchManifest:async()=>manifest({collisionEnabled:true})});
 try{
  assert.equal(await manager.load(),false);
  assert.equal(manager.collisionScene,null);
 }finally{manager.dispose()}
});
test('DM unlocked editor sprite priority cannot modify viewer/preview layering',()=>{
 const board=readFileSync(new URL('../src/engine/v2/WorldV2Board.jsx',
  import.meta.url),'utf8');
 const stack=readFileSync(new URL('../src/engine/v2/WorldCanvasStack.jsx',
  import.meta.url),'utf8');
 const panel=readFileSync(new URL('../src/MapSettingPanel.jsx',
  import.meta.url),'utf8');
 assert.match(board,/tokensAboveEditor=\{Boolean\(isDM&&!dmPreview&&editor\?\.enabled&&editor\.lockTokens===false\)\}/);
 assert.match(stack,/zIndex:tokensAboveEditor&&!playerPreview\?1002:2/);
 assert.match(panel,/eligiblePlayerPreviewTokens\(/);
 const app=readFileSync(new URL('../src/TabletopApp.jsx',import.meta.url),'utf8');
 const sidebar=readFileSync(new URL('../src/TabletopSidebar.jsx',import.meta.url),'utf8');
 assert.match(app,/tokens=\{tokens\} members=\{members\} dmUserId=\{user\}/);
 assert.match(sidebar,/tokens=\{tokens\} members=\{members\} dmUserId=\{user\}/);
});
