import test from 'node:test';
import assert from 'node:assert/strict';
import {createTokenMotionRuntime} from '../src/TokenMotionRuntime.js';

function runtime(){
 const callbacks=[];
 const motion=createTokenMotionRuntime({requestFrame:callback=>{
  callbacks.push(callback);return callbacks.length;
 },cancelFrame:()=>{}});
 return {motion,flush:()=>{while(callbacks.length)callbacks.shift()()}};
}
test('local drag updates token and separate monitor transforms, not canonical positions',()=>{
 const {motion,flush}=runtime();
 const token={style:{}},monitor={style:{}};
 const canonical={x:2,y:3};
 motion.bind('a','sprite',token,{...canonical,cell:70});
 motion.bind('a','monitor',monitor,{...canonical,cell:70});
 motion.preview('a',5,4);
 flush();
 assert.equal(token.style.translate,'210px 70px');
 assert.equal(monitor.style.translate,'210px 70px');
 assert.deepEqual(canonical,{x:2,y:3});
 // A new canonical position re-bases without a visual jump.
 motion.bind('a','sprite',token,{x:5,y:4,cell:70});
 assert.equal(token.style.translate,'');
 motion.clearPreview('a');flush();
 assert.equal(monitor.style.translate,'');
 motion.dispose();
});
test('moves coalesce into one animation frame and clear on map switch',()=>{
 const {motion,flush}=runtime();
 const token={style:{}};
 motion.bind('a','sprite',token,{x:0,y:0,cell:40});
 motion.preview('a',1,1);motion.preview('a',2,2);
 assert.equal(token.style.translate,'');
 flush();
 assert.equal(token.style.translate,'80px 80px');
 motion.clear();
 assert.equal(token.style.translate,'');
 assert.equal(motion.getPreview('a'),null);
 motion.dispose();
});
test('invalid previews are ignored, detached nodes no longer updated',()=>{
 const {motion,flush}=runtime();
 const node={style:{}};
 motion.bind('a','sprite',node,{x:0,y:0,cell:50});
 motion.preview('a',NaN,3);
 assert.equal(motion.getPreview('a'),null);
 motion.preview('a',2,2);flush();
 assert.equal(node.style.translate,'100px 100px');
 motion.bind('a','sprite',null);
 motion.preview('a',9,9);flush();
 assert.equal(node.style.translate,'100px 100px');
 motion.dispose();
});
