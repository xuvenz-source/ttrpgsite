import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createBarrier} from '../src/MapEnvironment.js';
import {checkTokenMovement} from '../src/MapCollision.js';

const source=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const map={width:1024,height:1024,grid_size:70};
const loop=createBarrier('wall',[
 {x:7.5571,y:6.6952},{x:7.5762,y:5.219},
 {x:10.3095,y:5.2381},{x:10.319,y:7.0095},
 {x:7.5286,y:7.019},{x:7.5667,y:6.6667}
]);
const env={objects:[loop]};
const token={id:'test-token',x:5,y:5,span_x:1,span_y:1};

test('closed fractional-coordinate walls block swept preview movement',()=>{
 for(const destination of [{x:9,y:5},{x:9,y:6},{x:8,y:7}]){
  const result=checkTokenMovement({map,environment:env,token,destination});
  assert.equal(result.allowed,false,JSON.stringify(destination));
  assert.equal(result.reason,'barrier');
 }
 assert.equal(checkTokenMovement({map,environment:env,token,
  destination:{x:5,y:8}}).allowed,true);
});

test('shared issued-tool inventory becomes ready after initial lease fetch',()=>{
 const hook=source('src/useCampaignToolCollaboration.js');
 assert.match(hook,/\[ready,setReady\]=useState\(false\)/);
 assert.match(hook,/refreshClaims\(\)\.then\(\(\)=>\{/);
 assert.match(hook,/if\(active&&issueRef.current===issueId\)setReady\(true\)/);
 assert.match(hook,/return \{rows,locks,ready,error,pending/);
 assert.match(source('src/InventoryPanel.jsx'),/collaboration&&!collaboration.ready/);
 assert.match(source('src/CampaignToolSheet.jsx'),/collaboration=\{\{\.\.\.collab,userId,isDM\}\}/);
});

test('DM preview drag and configured movement keys use the same wall check',()=>{
 const board=source('src/BattlemapBoard.jsx');
 const app=source('src/TabletopApp.jsx');
 assert.match(board,/function movePreviewToken\(origin,destination\)/);
 assert.match(board,/checkTokenMovement\(\{\s*token:origin,destination,map,environment/);
 assert.match(board,/movePreviewToken\(simulated.token,destination\)/);
 assert.match(board,/registerPreviewStep\(step\)/);
 assert.match(app,/const simulated=isDM&&mapSettingEditor.previewing/);
 assert.match(app,/if\(simulated\)previewStepHandler.current\?\.\(delta\[0\],delta\[1\]\)/);
 assert.match(app,/registerPreviewStep=\{registerPreviewStep\}/);
});

test('DM preview cannot persist movement or drop new units onto a live map',()=>{
 const app=source('src/TabletopApp.jsx'),board=source('src/BattlemapBoard.jsx');
 assert.match(app,/function queueTokenMove\(token,x,y,route=\[\]\)\{[\s\S]*?if\(isDM&&mapSettingEditor.previewing\)return/);
 assert.match(app,/function moveSelectedByKey\(dx,dy\)\{\s*if\(isDM&&mapSettingEditor.previewing\)return/);
 assert.match(board,/function dropOnMap\(e\)\{\s*if\(previewActive\)return/);
 assert.match(board,/function allowMapDrop\(e\)\{\s*if\(previewActive\)return/);
 assert.match(source('src/MapPlayerPreviewOverlay.jsx'),/token movement is not saved/);
});
