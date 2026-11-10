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
  handlers,
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
  count(name){return (handlers.get(name)||[]).length}
 };
}

function harness({capture=false}={}){
 const documentTarget=emitter(),target=emitter(),keyboard=emitter();
 const events=[],status=[];
 let active=false,held=null;
 target.ownerDocument=documentTarget;
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
  target,keyboardTarget:keyboard,controller,
  pointFromEvent:event=>event.point,
  resolveSelection:()=>({mapId:'10000000-0000-4000-8000-000000000001',
   selection:[piece('token',TOKEN)],origin:{x:2,y:2},mode:'preview'}),
  onPointerStatus:(_,code)=>status.push(code)
 });
 input.mount();
 function event(point={x:2.25,y:2.25}){
  return {button:0,isPrimary:true,pointerId:9,pointerType:'mouse',
   point,preventDefault(){this.defaultPrevented=true},
   target:{closest:()=>null}};
 }
 return {documentTarget,target,events,status,input,event};
}

test('no pointer capture: document fallback keeps drag alive outside board',()=>{
 const h=harness();
 h.target.emit('pointerdown',h.event());
 assert.equal(h.documentTarget.count('pointermove'),1);
 assert.equal(h.documentTarget.count('pointerup'),1);
 h.documentTarget.emit('pointermove',h.event({x:4.25,y:2.25}));
 h.documentTarget.emit('pointerup',h.event({x:4.25,y:2.25}));
 assert.deepEqual(h.events.map(e=>e[0]),['begin','move','move','end']);
 assert.equal(h.events[1][1].x,4);
 assert.equal(h.documentTarget.count('pointermove'),0);
 assert.equal(h.documentTarget.count('pointerup'),0);
 h.input.unmount();
});

test('unexpected lostpointercapture preserves a still-held gesture',()=>{
 const h=harness({capture:true});
 h.target.emit('pointerdown',h.event());
 assert.equal(h.documentTarget.count('pointermove'),0);
 h.target.emit('lostpointercapture',h.event());
 assert.equal(h.documentTarget.count('pointermove'),1);
 h.documentTarget.emit('pointermove',h.event({x:3.25,y:2.25}));
 h.documentTarget.emit('pointerup',h.event({x:3.25,y:2.25}));
 assert.ok(h.events.some(e=>e[0]==='move'&&e[1].x===3));
 assert.ok(h.events.some(e=>e[0]==='end'));
 assert.ok(!h.events.some(e=>e[0]==='cancel'));
 h.input.unmount();
});

test('document fallback is removed even when a drag is unmounted',()=>{
 const h=harness();
 h.target.emit('pointerdown',h.event());
 assert.equal(h.documentTarget.count('pointerup'),1);
 h.input.unmount();
 assert.equal(h.documentTarget.count('pointermove'),0);
 assert.equal(h.documentTarget.count('pointerup'),0);
 assert.equal(h.documentTarget.count('pointercancel'),0);
});

test('native HTML drag is suppressed only for tokens and tools on the map',()=>{
 const h=harness();
 const sprite=h.event(),palette=h.event();
 sprite.target.closest=selector=>selector.includes('data-world-kind')?{}:null;
 h.target.emit('dragstart',sprite);
 h.target.emit('dragstart',palette);
 assert.equal(sprite.defaultPrevented,true);
 assert.equal(palette.defaultPrevented,undefined);
 h.input.unmount();
 assert.equal(h.target.count('dragstart'),0);
});

test('DM preview gesture is always one token regardless of prior DM selection',()=>{
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

test('board preserves server control checks before a single preview selection',()=>{
 const board=readFileSync(new URL('../src/engine/v2/WorldV2Board.jsx',
  import.meta.url),'utf8');
 const runtime=readFileSync(new URL('../src/engine/v2/WorldV2TabletopRuntime.js',
  import.meta.url),'utf8');
 assert.match(board,/worldGestureSelection\(\{/);
 assert.match(board,/keyboard,preview:dmPreview/);
 assert.match(board,/picked\.id!==previewToken\?\.id/);
 assert.match(board,/!authorizeSelection\(selection\)/);
 assert.match(runtime,/picked\.selection\.every\(piece=>vision\.visiblePieces\.some/);
 assert.doesNotMatch(runtime,/db\.channel\('drag-debug'/);
});
