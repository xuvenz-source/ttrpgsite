import test from 'node:test';
import assert from 'node:assert/strict';
import {EMPTY_ENVIRONMENT,normalizeEnvironment,wallPreset,createBarrier,
 createLight,withObject,patchObject,removeObject,tokenAttributeValue,
 wallAllows,lightRadii,snapEnvironmentPoint} from '../src/MapEnvironment.js';

test('environment defaults are safe and isolated for each map',()=>{
 const first=normalizeEnvironment();
 const second=normalizeEnvironment();
 assert.deepEqual(first,EMPTY_ENVIRONMENT);
 first.objects.push({id:'only-first'});
 assert.equal(second.objects.length,0);
 assert.equal(normalizeEnvironment({ambient:-50}).ambient,0);
 assert.equal(normalizeEnvironment({ambient:10000}).ambient,100);
});
test('connected walls retain geometry and independently editable settings',()=>{
 const wall=createBarrier('wall',[{x:1,y:2},{x:2,y:2},{x:2,y:7}],'one-way');
 assert.equal(wall.points.length,3);
 assert.equal(wall.vision,'one-way');
 assert.equal(wallAllows(wall,{},'vision','a'),true);
 assert.equal(wallAllows(wall,{},'vision','b'),false);
 const scene=withObject(EMPTY_ENVIRONMENT,wall);
 const reversed=patchObject(scene,wall.id,{oneWay:'b-to-a'});
 assert.equal(wallAllows(reversed.objects[0],{},'vision','b'),true);
 assert.equal(wallAllows(scene.objects[0],{},'vision','a'),true);
 assert.equal(removeObject(reversed,wall.id).objects.length,0);
});
test('missing token elevation fails closed rather than exposing geometry',()=>{
 const wall=createBarrier('wall',[{x:0,y:0},{x:3,y:0}],'elevation');
 wall.attributeField='elevation';
 assert.equal(wallAllows(wall,{field_values:{}},'movement'),false);
 assert.equal(wallAllows(wall,{field_values:{elevation:10}},'vision'),false);
 assert.equal(wallAllows(wall,{field_values:{elevation:15}},'vision'),true);
 assert.equal(wallAllows(wall,{field_values:{elevation:'20'}},'movement'),true);
 assert.equal(wallAllows(wall,{field_values:{elevation:'bogus'}},'movement'),false);
 assert.equal(tokenAttributeValue({field_values:{elevation:{current:20}}},'elevation'),20);
});
test('different wall presets retain movement and vision independently',()=>{
 assert.equal(wallPreset('glass').blocksMovement,true);
 assert.equal(wallPreset('glass').vision,'pass');
 assert.equal(wallPreset('solid').blocksLight,true);
 assert.equal(wallPreset('one-way').vision,'one-way');
 const door=createBarrier('door',[{x:1,y:0},{x:2,y:0}]);
 assert.equal(wallAllows(door,{},'movement'),false);
 door.state='open';
 assert.equal(wallAllows(door,{},'movement'),true);
});
test('lights have independently controlled bright and dim reach',()=>{
 const light=createLight({x:2.5,y:3.5},{bright:20,dim:30,color:'#fdc783'});
 assert.deepEqual(lightRadii(light),{bright:20,dim:30,outer:50});
 assert.equal(lightRadii(createLight({x:0,y:0},{bright:0,dim:15})).outer,15);
});
test('drawing snap and zero-distance walls are handled safely',()=>{
 assert.deepEqual(snapEnvironmentPoint({x:2.5,y:3.9}),{x:3,y:4});
 assert.deepEqual(snapEnvironmentPoint({x:2.5,y:3.9},false),{x:2.5,y:3.9});
 assert.equal(createBarrier('wall',[{x:2,y:2},{x:2,y:2}]),null);
});
