import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {transformWithEsbuild} from 'vite';
import {createInputController} from '../src/engine/v2/InputController.js';
import {createWorldRenderer} from '../src/engine/v2/WorldRenderer.js';

const MAP='10000000-0000-4000-8000-000000000001';
const VIEWER='30000000-0000-4000-8000-000000000001';
const TOKEN='40000000-0000-4000-8000-000000000001';
const scene={
 version:2,mapId:MAP,scope:'viewer',published:true,
 revision:9,sceneGeneration:4,rulesRevision:1,
 fogEnabled:false,collisionEnabled:false,ambient:25,
 effects:{weather:'none',intensity:0},
 dimensions:{width:1000,height:1000,gridSize:100},
 environment:null
};

function rendererHarness(){
 const terrain={style:{},src:'',removeAttribute(name){
  assert.equal(name,'src');this.src='';
 }};
 const fakeCanvas=()=>({style:{},width:0,height:0,getContext:()=>({})});
 const spriteHost={style:{},appendChild(){},removeChild(){}};
 const surfaces={terrain,staticCanvas:fakeCanvas(),
  fogCanvas:fakeCanvas(),spriteHost,viewport:{style:{}}};
 const r=createWorldRenderer({
  mapId:MAP,viewerId:VIEWER,surfaces,
  requestFrame:()=>1,cancelFrame:()=>{}
 });
 assert.equal(r.adoptScene(scene),true);
 return {r,terrain,surfaces};
}

test('late and refreshed signed terrain source never remounts scene',()=>{
 const {r,terrain}=rendererHarness();
 assert.equal(r.setTerrainSource('https://assets.test/map?sig=first'),true);
 assert.equal(terrain.src,'https://assets.test/map?sig=first');
 assert.equal(r.setTerrainSource('https://assets.test/map?sig=second'),true);
 assert.equal(terrain.src,'https://assets.test/map?sig=second');
 assert.equal(r.stats.terrainAssignments,2);
 assert.equal(r.currentScene.revision,9);
 assert.equal(r.setTerrainSource(''),true);
 assert.equal(terrain.src,'','explicit signed URL invalidation clears stale asset');
 assert.equal(r.setTerrainSource('https://assets.test/map?sig=third'),true);
 assert.equal(terrain.src,'https://assets.test/map?sig=third');
 assert.equal(r.stats.terrainAssignments,4);
 assert.equal(r.setTerrainSource('javascript:invalid'),false);
 assert.equal(terrain.src,'https://assets.test/map?sig=third');
 r.dispose();
});

test('map URL follows displayed map and receives asynchronous URL updates',async()=>{
 const app=readFileSync(new URL('../src/TabletopApp.jsx',import.meta.url),'utf8');
 const board=readFileSync(new URL('../src/engine/v2/WorldV2Board.jsx',import.meta.url),'utf8');
 assert.match(app,/map=\{displayedMap\} url=\{urls\[displayedMap\.id\]\}/);
 assert.match(board,/useLayoutEffect\(\(\)=>\{\s*const renderer=rendererRef\.current;\s*if\(renderer\?\.currentScene\)\s*renderer\.setTerrainSource\(typeof url==='string'\?url:''\);\s*\},\[url,map\.id,boardIdentity\]\)/);
 const output=await transformWithEsbuild(board,'WorldV2Board.jsx',{
  jsx:'automatic',target:'es2022'
 });
 assert.match(output.code,/setTerrainSource/);
});

function eventHarness({canBegin=true,selection=true,active=false}={}){
 const listeners=new Map(),events=[],status=[];
 let moving=active,capture=null;
 const target={
  addEventListener(name,fn,options){listeners.set(name,{fn,options})},
  removeEventListener(name){listeners.delete(name)},
  setPointerCapture(id){capture=id},
  hasPointerCapture(id){return capture===id},
  releasePointerCapture(id){if(capture===id)capture=null}
 };
 const keyboard={addEventListener(){},removeEventListener(){}};
 const controller={
  get active(){return moving},
  beginGesture(req){events.push(['begin',req]);if(!canBegin)return false;
   moving=true;return true},
  updateGesture(p){events.push(['move',p]);return moving},
  endGesture(){events.push(['commit']);moving=false;return Promise.resolve()},
  cancelGesture(){moving=false}
 };
 const input=createInputController({
  target,keyboardTarget:keyboard,controller,
  pointFromEvent:event=>event.point,
  resolveSelection:()=>selection?({
   mapId:MAP,selection:[{kind:'token',id:TOKEN}],
   origin:{x:2,y:2},environmentRevision:9,permissionGeneration:1
  }):null,
  onPointerStatus:(_,code)=>status.push(code)
 });
 input.mount();
 const emit=(name,point={x:2.25,y:2.25})=>
  listeners.get(name)?.fn({
   pointerId:7,button:0,pointerType:'mouse',point,
   preventDefault(){},target:{tagName:'SPAN'}
  });
 return {input,target,listeners,events,status,emit,
  get capture(){return capture}};
}

test('native viewport pointer capture starts and completes a whole gesture',()=>{
 const h=eventHarness();
 assert.equal(h.listeners.get('pointerdown').options.capture,true);
 h.emit('pointerdown');
 assert.equal(h.capture,7);
 assert.deepEqual(h.status,['grabbed']);
 h.emit('pointermove',{x:3.25,y:2.25});
 h.emit('pointerup',{x:3.25,y:2.25});
 assert.equal(h.capture,null);
 assert.equal(h.events[0][0],'begin');
 assert.ok(h.events.some(x=>x[0]==='move'&&x[1].x===3));
 assert.ok(h.events.some(x=>x[0]==='commit'));
 h.input.unmount();
 assert.ok(!h.listeners.has('pointerdown'));
});

test('drag-start diagnostics separate busy, denied selection and rejected gesture',()=>{
 for(const [options,wanted] of [
  [{active:true},'busy'],
  [{selection:false},'selection'],
  [{canBegin:false},'begin']
 ]){
  const h=eventHarness(options);h.emit('pointerdown');
  assert.deepEqual(h.status,[wanted]);
  assert.equal(h.capture,null);
  h.input.unmount();
 }
});

test('pointer feedback is bounded and does not add a realtime observer',()=>{
 const board=readFileSync(new URL('../src/engine/v2/WorldV2Board.jsx',import.meta.url),'utf8');
 const runtime=readFileSync(new URL('../src/engine/v2/WorldV2TabletopRuntime.js',import.meta.url),'utf8');
 assert.match(board,/target:viewport\.current/);
 assert.match(board,/onPointerStatus:\(event,code\)=>/);
 assert.match(board,/pointerPieceAt\(event,point\)/);
 assert.match(runtime,/onPointerStatus/);
 assert.doesNotMatch(board,/console\.log\(.*visiblePieces/);
 assert.doesNotMatch(runtime,/db\.channel\('world-drag-debug'/);
});
