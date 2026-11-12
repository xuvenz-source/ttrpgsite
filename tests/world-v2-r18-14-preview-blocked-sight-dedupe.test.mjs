import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {previewApprovedPositionChanged}
 from '../src/engine/v2/PreviewSightRefresh.js';

const A='40000000-0000-4000-8000-000000000001';
const B='40000000-0000-4000-8000-000000000002';
const pose=(tokenId,x,y)=>({tokenId,x,y});

test('R18-14 initial approved preview pose requires one viewer-effective refresh',()=>{
 assert.equal(previewApprovedPositionChanged(null,A,{x:5,y:8}),true);
});
test('R18-14 repeated blocked ACKs at the same approved pose do not refresh sight',()=>{
 const original=pose(A,5,8);
 for(let i=0;i<1352;i++)
  assert.equal(previewApprovedPositionChanged(original,A,{x:5,y:8}),false);
 assert.deepEqual(original,pose(A,5,8));
});
test('R18-14 blocked route with an accepted safe prefix refreshes sight',()=>{
 assert.equal(previewApprovedPositionChanged(pose(A,5,8),A,{x:6,y:8}),true);
 assert.equal(previewApprovedPositionChanged(pose(A,6,8),A,{x:6,y:8}),false);
});
test('R18-14 moving away and returning to the original cell each refresh',()=>{
 let approved=pose(A,5,8),count=0;
 for(const next of [{x:6,y:8},{x:5,y:8},{x:5,y:8}]){
  if(previewApprovedPositionChanged(approved,A,next))count++;
  approved=pose(A,next.x,next.y);
 }
 assert.equal(count,2);
});
test('R18-14 token identity switching forces reauthorization even at same cell',()=>{
 assert.equal(previewApprovedPositionChanged(pose(A,5,8),B,{x:5,y:8}),true);
});
test('R18-14 malformed preview endpoint never gets silently treated as unchanged',()=>{
 for(const point of [null,{}, {x:5.2,y:8},{x:NaN,y:8},{x:5,y:Infinity}])
  assert.throws(()=>previewApprovedPositionChanged(pose(A,5,8),A,point),
   /Invalid approved preview pose/);
 assert.throws(()=>previewApprovedPositionChanged(pose(A,5,8),'',{x:5,y:8}),
  /Invalid approved preview pose/);
});
test('R18-14 causal trace replay suppresses duplicate wall sight-refresh churn',()=>{
 const inputs=[
  {type:'approved',to:pose(A,1,1)},
  ...Array.from({length:550},()=>({type:'blocked',to:pose(A,1,1)})),
  {type:'blocked',to:pose(A,2,1)}, // accepted prefix before next wall
  ...Array.from({length:800},()=>({type:'blocked',to:pose(A,2,1)})),
  {type:'approved',to:pose(A,2,2)},
  {type:'approved',to:pose(A,2,2)}
 ];
 let current=null,refreshes=0,blocked=0;
 for(const x of inputs){
  if(x.type==='blocked')blocked++;
  const moved=previewApprovedPositionChanged(
   current,x.to.tokenId,{x:x.to.x,y:x.to.y});
  current=x.to;
  if(moved)refreshes++;
 }
 assert.equal(blocked,1351);
 assert.equal(refreshes,3,
  'only initial, one blocked accepted prefix, one approved step need new sight');
});
test('R18-14 actual V2 runtime gates approved AND blocked by pose, keeps final signed check',()=>{
 const runtime=readFileSync(new URL('../src/engine/v2/WorldV2TabletopRuntime.js',
  import.meta.url),'utf8');
 assert.match(runtime,/import \{previewApprovedPositionChanged\} from '\.\/PreviewSightRefresh\.js'/);
 assert.match(runtime,/if\(dmPreview&&\['approved','blocked'\]\.includes\(event\.type\)/);
 assert.match(runtime,/const moved=previewApprovedPositionChanged\(\s*previewPosition,tokenId,event\.approved\)/);
 assert.match(runtime,/if\(moved\)void refreshVisibility\('virtual-preview-step'\)/);
 assert.match(runtime,/if\(event\.type==='committed'&&dmPreview\)\{[\s\S]*?refreshVisibility\('virtual-preview-final'\)/);
 assert.match(runtime,/renderer\.revoke\(reason,false\)/);
 assert.match(runtime,/vision\.revoke\(reason\)/);
 assert.match(runtime,/if\(!dmPreview\)stream=createWorldRealtimeTransport/);
 assert.doesNotMatch(runtime,/if\(dmPreview\).*?db\.rpc\('advance_world_motion_v2'/);
});
