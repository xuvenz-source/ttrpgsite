import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createInputController} from '../src/engine/v2/InputController.js';
import {worldGestureSelection} from '../src/engine/v2/GestureSelection.js';

const TOKEN='40000000-0000-4000-8000-000000000001';
const SECOND='40000000-0000-4000-8000-000000000002';
const TOOL='40000000-0000-4000-8000-000000000003';
const piece=(kind,id)=>({kind,id});

function emitter(){
 const handlers=new Map();
 return {
  addEventListener(name,fn,opts){
   if(!handlers.has(name))handlers.set(name,[]);
   handlers.get(name).push({fn,opts});
  },
  removeEventListener(name,fn){
   handlers.set(name,(handlers.get(name)||[]).filter(v=>v.fn!==fn));
  },
  emit(name,event={}){
   for(const {fn} of [...(handlers.get(name)||[])])fn(event);
  },
  count(name){return (handlers.get(name)||[]).length},
  options(name){return (handlers.get(name)||[]).map(v=>v.opts)}
 };
}
function harness({capture=false}={}){
 const documentTarget=emitter(),target=emitter(),keyboard=emitter(),
  blurTarget=emitter();
 const events=[],status=[];
 let active=false,held=null;
 target.ownerDocument=documentTarget;
 target.contains=node=>node?.inMap===true;
 target.setPointerCapture=id=>{
  if(!capture)throw Error('capture rejected by browser');
  held=id;
 };
 target.hasPointerCapture=id=>held===id;
 target.releasePointerCapture=id=>{if(held===id)held=null};
 const controller={
  get active(){return active},
  beginGesture(data){active=true;events.push(['begin',data]);return true},
  updateGesture(point){events.push(['move',point]);return active},
  endGesture(){active=false;events.push(['end']);return Promise.resolve()},
  cancelGesture(reason){active=false;events.push(['cancel',reason])}
 };
 const input=createInputController({
  target,keyboardTarget:keyboard,blurTarget,controller,
  pointFromEvent:event=>event.point,
  resolveSelection:()=>({mapId:'10000000-0000-4000-8000-000000000001',
   selection:[piece('token',TOKEN)],origin:{x:2,y:2},mode:'preview'}),
  onPointerStatus:(_,code)=>status.push(code)
 });
 input.mount();
 function event(point={x:2.25,y:2.25},inMap=true){
  return {button:0,isPrimary:true,pointerId:9,pointerType:'mouse',
   point,preventDefault(){this.defaultPrevented=true},
   target:{inMap,closest:()=>null}};
 }
 return {documentTarget,target,blurTarget,events,status,input,event};
}

test('document capture starts a scoped drag before a React child can stop propagation',()=>{
 const h=harness();
 assert.equal(h.documentTarget.count('pointerdown'),1);
 assert.equal(h.target.count('pointerdown'),0);
 assert.equal(h.documentTarget.options('pointerdown')[0].capture,true);
 // Simulates a React handler stopping propagation beneath document.
 // No listener below document gets the event; the gesture still begins.
 h.documentTarget.emit('pointerdown',h.event());
 h.documentTarget.emit('pointermove',h.event({x:4.25,y:2.25}));
 h.documentTarget.emit('pointerup',h.event({x:4.25,y:2.25}));
 assert.deepEqual(h.events.map(e=>e[0]),['begin','move','move','end']);
 assert.equal(h.events[1][1].x,4);
 h.input.unmount();
 assert.equal(h.documentTarget.count('pointerdown'),0);
 assert.equal(h.documentTarget.count('pointermove'),0);
 assert.equal(h.documentTarget.count('pointerup'),0);
});

test('the document adapter cannot initiate a drag from the sidebar',()=>{
 const h=harness();
 h.documentTarget.emit('pointerdown',h.event(undefined,false));
 assert.equal(h.events.length,0);
 assert.equal(h.status.length,0);
 h.documentTarget.emit('pointerdown',h.event());
 h.documentTarget.emit('pointermove',h.event({x:6.25,y:2.25},false));
 h.documentTarget.emit('pointerup',h.event({x:6.25,y:2.25},false));
 assert.deepEqual(h.events.map(e=>e[0]),['begin','move','move','end'],
  'a started map drag must finish when the cursor leaves the viewport');
 h.input.unmount();
});

test('lost browser capture does not abort a document-owned drag',()=>{
 const h=harness({capture:true});
 h.documentTarget.emit('pointerdown',h.event());
 h.target.emit('lostpointercapture',h.event());
 h.documentTarget.emit('pointermove',h.event({x:3.25,y:2.25}));
 h.documentTarget.emit('pointerup',h.event({x:3.25,y:2.25}));
 assert.ok(h.events.some(e=>e[0]==='move'&&e[1].x===3));
 assert.ok(h.events.some(e=>e[0]==='end'));
 assert.ok(!h.events.some(e=>e[0]==='cancel'));
 h.input.unmount();
});

test('no browser pointer capture: document capture still completes a movement',()=>{
 const h=harness({capture:false});
 h.documentTarget.emit('pointerdown',h.event());
 h.documentTarget.emit('pointermove',h.event({x:4.25,y:2.25}));
 h.documentTarget.emit('pointerup',h.event({x:4.25,y:2.25}));
 assert.deepEqual(h.events.map(e=>e[0]),['begin','move','move','end']);
 h.input.unmount();
});

test('unmount and window blur cancel any held gesture and clean all listeners',()=>{
 const h=harness();
 h.documentTarget.emit('pointerdown',h.event());
 assert.equal(h.blurTarget.count('blur'),1);
 h.blurTarget.emit('blur');
 assert.ok(h.events.some(e=>e[0]==='cancel'&&e[1]==='blur'));
 h.documentTarget.emit('pointerup',h.event({x:3.25,y:2.25}));
 assert.ok(!h.events.some(e=>e[0]==='end'));
 h.input.unmount();
 for(const name of ['pointerdown','pointermove','pointerup','pointercancel','dragstart'])
  assert.equal(h.documentTarget.count(name),0);
 assert.equal(h.blurTarget.count('blur'),0);
});

test('native HTML drag is suppressed only for world sprites within the map',()=>{
 const h=harness();
 const sprite=h.event(),palette=h.event(undefined,false),blank=h.event();
 sprite.target.closest=selector=>selector.includes('data-world-kind')?{}:null;
 palette.target.closest=selector=>selector.includes('data-world-kind')?{}:null;
 h.documentTarget.emit('dragstart',sprite);
 h.documentTarget.emit('dragstart',palette);
 h.documentTarget.emit('dragstart',blank);
 assert.equal(sprite.defaultPrevented,true);
 assert.equal(palette.defaultPrevented,undefined);
 assert.equal(blank.defaultPrevented,undefined);
 h.input.unmount();
});

test('DM preview gesture always selects exactly one token, never a DM group',()=>{
 const previous={selectedTokens:[TOKEN,SECOND],
  selectedTools:[TOOL],picked:piece('token',TOKEN)};
 assert.deepEqual(worldGestureSelection({...previous,preview:true}),
  [piece('token',TOKEN)]);
 assert.deepEqual(worldGestureSelection({
  ...previous,picked:piece('tool',TOOL),preview:true}),[]);
 assert.deepEqual(worldGestureSelection(previous),[
  piece('token',TOKEN),piece('token',SECOND),piece('tool',TOOL)
 ]);
 assert.deepEqual(worldGestureSelection({...previous,
  picked:piece('token','new')}),
  [piece('token','new')]);
});

test('board keeps server control checks and player-effective preview identity',()=>{
 const board=readFileSync(new URL('../src/engine/v2/WorldV2Board.jsx',
  import.meta.url),'utf8');
 const runtime=readFileSync(new URL('../src/engine/v2/WorldV2TabletopRuntime.js',
  import.meta.url),'utf8');
 const panel=readFileSync(new URL('../src/MapSettingPanel.jsx',import.meta.url),'utf8');
 assert.match(board,/worldGestureSelection\(\{/);
 assert.match(board,/keyboard,preview:dmPreview/);
 assert.match(board,/picked\.id!==previewToken\?\.id/);
 assert.match(board,/!authorizeSelection\(selection\)/);
 assert.match(runtime,/picked\.selection\.every\(piece=>vision\.visiblePieces\.some/);
 assert.match(panel,/eligiblePlayerPreviewTokens\(/);
 assert.doesNotMatch(runtime,/db\.channel\('drag-debug'/);
});
