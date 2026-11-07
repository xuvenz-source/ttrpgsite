import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createBarrier,createLight,wallAllows,selectEnvironmentObjectIds}
 from '../src/MapEnvironment.js';
import {previewVisionPolygon,pointInPolygon,lightOcclusionClip}
 from '../src/MapVisionPreview.js';
import {checkTokenMovement} from '../src/MapCollision.js';

const source=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const map={id:'map',width:1400,height:1400,grid_size:70};
const wall=createBarrier('wall',[{x:7,y:7},{x:7,y:11}]);

test('solid walls occlude emitted light, but rays travel past their ends',()=>{
 const environment={objects:[wall]};
 const polygon=previewVisionPolygon({map,environment,viewer:{x:4,y:9},
  maxFeet:65,kind:'light'});
 assert.equal(pointInPolygon({x:10,y:9},polygon),false);
 assert.equal(pointInPolygon({x:10,y:16},polygon),true);
 const css=lightOcclusionClip({map,environment,x:4,y:9,radiusFeet:65});
 assert.match(css,/^polygon\(/);
 assert.equal(wallAllows(wall,null,'light'),false);
 const glass={...wall,blocksLight:false};
 assert.equal(wallAllows(glass,null,'light'),true);
 const window={...wall,type:'window',blocksLight:false,curtains:true,state:'closed'};
 assert.equal(wallAllows(window,null,'light'),false);
 assert.equal(wallAllows({...window,state:'open'},null,'light'),true);
});

test('preview collision cannot cross an opaque wall, but open routes remain usable',()=>{
 const environment={objects:[wall]};
 assert.equal(checkTokenMovement({map,environment,
  token:{x:4,y:9,span_x:1,span_y:1},
  destination:{x:10,y:9}}).allowed,false);
 assert.equal(checkTokenMovement({map,environment,
  token:{x:4,y:14,span_x:1,span_y:1},
  destination:{x:10,y:14}}).allowed,true);
});

test('map-editor marquee selects intersecting barriers and lights precisely',()=>{
 const slant=createBarrier('wall',[{x:4,y:4},{x:8,y:8}]);
 const lamp=createLight({x:9,y:9});
 const objects=[wall,slant,lamp];
 assert.deepEqual(selectEnvironmentObjectIds(objects,
  {left:6.9,right:7.1,top:9,bottom:10}),[wall.id]);
 assert.deepEqual(selectEnvironmentObjectIds(objects,
  {left:8.8,right:9.2,top:8.8,bottom:9.2}),[lamp.id]);
 assert.deepEqual(selectEnvironmentObjectIds(objects,
  {left:4,right:5,top:7,bottom:8}),[]);
});

test('both lease claim RPCs qualify the expiry column, preserving 18s leases',()=>{
 const sql=source('supabase/migrations/20261108013000_inventory_lease_expiry_qualification.sql');
 assert.match(sql,/claim_campaign_tool_item/);
 assert.match(sql,/claim_campaign_sheet_item/);
 assert.equal((sql.match(/lease\.expires_at<=now\(\)/g)||[]).length,2);
 assert.equal((sql.match(/interval '18 seconds'/g)||[]).length,2);
 assert.doesNotMatch(sql,/\n where expires_at<=now\(\)/);
 assert.match(sql,/SECURITY DEFINER/i);
});

test('item creation waits for its saved identity; editors preserve retry flow',()=>{
 const inventory=source('src/InventoryPanel.jsx');
 assert.match(inventory,/Promise\.resolve\(\)\.then\(\(\)=>applyItems/);
 assert.match(inventory,/!collaboration\.ready/);
 const pin=source('src/MapPinLayer.jsx');
 assert.match(pin,/awaitingServer\.current\.set\(d\.id,next\)/);
 assert.match(pin,/Math\.abs\(Number\(saved\.x\)-point\.x\)/);
});

test('spell save success is a separate row and ruler handles native context menu',()=>{
 const spell=source('src/SpellChatCard.jsx');
 assert.match(spell,/id:'save-success',label:'On success'/);
 const board=source('src/BattlemapBoard.jsx');
 assert.match(board,/window\.addEventListener\('contextmenu',onContextMenu,true\)/);
 assert.match(board,/checkTokenMovement\(\{token:simulated\.token,destination,map,environment\}\)/);
 assert.match(board,/lockTokens!==false/);
 const setting=source('src/MapSettingPanel.jsx');
 assert.match(setting,/Lock tokens while editing map/);
 const editor=source('src/MapEnvironmentOverlay.jsx');
 assert.match(editor,/selectEnvironmentObjectIds\(objects,\{left,right,top,bottom\}\)/);
});
