import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {transformWithEsbuild} from 'vite';

const file=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');

test('V2 canvas has explicit unscaled map dimensions and safe popup foreground',async()=>{
 const stack=file('src/engine/v2/WorldCanvasStack.jsx');
 const board=file('src/engine/v2/WorldV2Board.jsx');
 const compiled=await transformWithEsbuild(stack,'WorldCanvasStack.jsx',
  {jsx:'automatic',target:'es2022'});
 assert.ok(compiled.code.includes('foregroundLayers'));
 assert.match(stack,/mapWidth=null,mapHeight=null/);
 assert.match(stack,/width:Number\.isFinite\(mapWidth\)/);
 assert.match(stack,/height:Number\.isFinite\(mapHeight\)/);
 assert.match(board,/mapWidth=\{map\.width\} mapHeight=\{map\.height\}/);
 assert.match(board,/foregroundLayers=\{foregroundLayers\}/);
 assert.match(board,/const mapLayers=<>[\s\S]*gridlines[\s\S]*MapMeasurementOverlay/);
 assert.match(board,/const foregroundLayers=<>[\s\S]*MapPinLayer[\s\S]*MapObjectQuickAdjust/);
 assert.ok(stack.indexOf('{mapLayers}')<stack.indexOf('className="world-v2-fog"'));
 assert.ok(stack.indexOf('className="world-v2-fog"')<stack.indexOf('{foregroundLayers}'));
 assert.match(board,/visibleWorldPins\(handoutPins,authorizedSight\)/);
});

test('V2 Ctrl+wheel listener is explicitly non-passive',()=>{
 const board=file('src/engine/v2/WorldV2Board.jsx');
 assert.match(board,/addEventListener\('wheel',nativeWheel,\{passive:false\}\)/);
 assert.match(board,/if\(!e\.ctrlKey\)return;[\s\S]*e\.preventDefault\(\)/);
 assert.doesNotMatch(board,/onWheel=\{onWheel\}/);
});

test('custom V2 keybinds use held gesture and keyup idle flush',()=>{
 const app=file('src/TabletopApp.jsx'),board=file('src/engine/v2/WorldV2Board.jsx');
 assert.match(app,/v2HeldMovementKeys\.current\.add\(e\.code\)/);
 assert.match(app,/document\.addEventListener\('keyup',onKeyUp\)/);
 assert.match(app,/v2StepHandler\.current\?\.\(0,0,\{release:true\}\)/);
 const stepper=file('src/engine/v2/KeyboardStepper.js');
 assert.match(board,/createWorldKeyboardStepper\(/);
 assert.match(stepper,/cursor=to/);
 assert.match(stepper,/timer=setTimer\(finish,idleMs\)/);
 assert.match(stepper,/runtime\.movement\.updateGesture\(to\)/);
 assert.match(stepper,/queued\.push\(\[dx,dy\]\)/);
 assert.doesNotMatch(stepper,/runtime\.movement\.updateGesture\(to\);\s*void runtime\.movement\.endGesture\(\)/);
 assert.match(stepper,/cancelGesture\('keyboard-unmount'\)/);
});

test('preview cannot use DM-owned identity, and rejection shows safe reason only',()=>{
 const board=file('src/engine/v2/WorldV2Board.jsx');
 const renderer=file('src/engine/v2/WorldRenderer.js');
 const runtime=file('src/engine/v2/WorldV2TabletopRuntime.js');
 assert.match(board,/previewRequested&&previewViewerId&&previewViewerId!==user/);
 assert.match(renderer,/get lastSightRejection\(\)/);
 assert.match(renderer,/viewer-scope-mismatch/);
 assert.match(renderer,/scene-generation-mismatch/);
 assert.match(runtime,/renderer\.lastSightRejection\|\|'unclassified'/);
});
