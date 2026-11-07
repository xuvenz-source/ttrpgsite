import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createBarrier,createLight,translateEnvironmentObject} from '../src/MapEnvironment.js';

const source=name=>readFileSync(new URL('../src/'+name,import.meta.url),'utf8');

test('moving freehand walls translates every point without resnapping or shape distortion',()=>{
 const wall=createBarrier('wall',[{x:1.25,y:2.375},{x:3.375,y:2.375},{x:3.5,y:5.25}]);
 const moved=translateEnvironmentObject(wall,{x:1.125,y:-.625},{x:10,y:10});
 assert.deepEqual(moved.points,[{x:2.375,y:1.75},{x:4.5,y:1.75},{x:4.625,y:4.625}]);
 assert.deepEqual(wall.points[0],{x:1.25,y:2.375});
});

test('moving a door or window at map edge preserves line length and angle',()=>{
 for(const type of ['door','window']){
  const object=createBarrier(type,[{x:1.5,y:2},{x:4,y:3}]);
  const moved=translateEnvironmentObject(object,{x:15,y:-30},{x:10,y:10});
  assert.deepEqual(moved.points,[{x:7.5,y:0},{x:10,y:1}]);
 }
});

test('lights can be translated and clamped without changing brightness or radii',()=>{
 const light=createLight({x:2.25,y:3.5},{bright:15,dim:25});
 const result=translateEnvironmentObject(light,{x:20,y:-40},{x:8,y:8});
 assert.deepEqual(result,{x:8,y:0});
 assert.equal(light.x,2.25);
 assert.equal(light.bright,15);
 assert.equal(translateEnvironmentObject(light,{x:1,y:0},{x:0,y:8}),null);
 assert.equal(translateEnvironmentObject(null,{x:1,y:0},{x:8,y:8}),null);
});

test('map overlay supports move dragging, portal endpoint editing and immediate persistence',()=>{
 const overlay=source('MapEnvironmentOverlay.jsx');
 assert.match(overlay,/translateEnvironmentObject/);
 assert.match(overlay,/function startMove\(/);
 assert.match(overlay,/onPointerDown=\{e=>\{e\.stopPropagation\(\);startMove\(e,o\)\}\}/);
 assert.match(overlay,/current\.kind==='resize'/);
 assert.match(overlay,/onPatch\(current\.id,current\.patch,\{immediate:true\}\)/);
});

test('combat window uses signed token artwork, obscures unknown tokens, and exposes DM-only removal',()=>{
 const combat=source('CombatTurnOrder.jsx');
 const app=source('main.jsx');
 const server=readFileSync(new URL('../supabase/migrations/20261107052003_map_combat_initiative.sql',import.meta.url),'utf8');
 assert.match(combat,/portrait\?\.image_path\?<Artwork/);
 assert.match(combat,/e\.kind==='unknown'\?'\?'/);
 assert.match(combat,/\{isDM&&<button[^>]+combat-entry-remove/);
 assert.match(app,/onRemoveEntry=\{entryId=>combatTracker\.command\('remove',entryId\)\}/);
 assert.match(server,/p_action='remove'/);
});

test('inactive browser tab resumes without invalidating signed map art for the same identity',()=>{
 const app=source('main.jsx');
 assert.match(app,/signedAssetIdentity\.current!==identity/);
 assert.doesNotMatch(app,/event==='SIGNED_IN'\|\|event==='SIGNED_OUT'/);
 assert.match(app,/document\.addEventListener\('visibilitychange',resync\)/);
 assert.match(app,/latestTokenRefresh\.current\?\.\(\)/);
});

test('map quick settings match the dark UI and do not repeat long help paragraphs',()=>{
 const css=source('map-environment.css');
 const map=source('MapSettingPanel.jsx');
 const quick=source('MapObjectQuickAdjust.jsx');
 assert.match(css,/\.map-object-quick-adjust\{[^}]*background:#1a2536/);
 assert.doesNotMatch(css,/Roll20-inspired/);
 assert.doesNotMatch(map,/All geometry is saved separately/);
 assert.doesNotMatch(map,/player fog and collision still require server-side implementation/);
 assert.doesNotMatch(quick,/Drag either red endpoint to resize/);
});
