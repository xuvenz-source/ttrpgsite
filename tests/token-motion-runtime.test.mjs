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

test('remote samples ease between network ticks and local dragging stays instant',()=>{
 const {motion,flush}=runtime();
 const token={style:{}},monitor={style:{}};
 motion.bind('a','sprite',token,{x:1,y:1,cell:70});
 motion.bind('a','monitor',monitor,{x:1,y:1,cell:70});
 motion.previewRemote('a',3,1);flush();
 assert.equal(token.style.transition,'translate 95ms linear');
 assert.equal(monitor.style.translate,'140px 0px');
 motion.preview('a',4,1);flush();
 assert.equal(token.style.transition,'');
 assert.equal(token.style.translate,'210px 0px');
 motion.clearPreview('a');flush();
 assert.equal(token.style.transition,'');
 assert.equal(monitor.style.translate,'');
 motion.dispose();
});

test('handoff keeps the dragged sprite at the drop point until React commits',()=>{
 const {motion,flush}=runtime();
 const token={style:{}},monitor={style:{}};
 motion.bind('a','sprite',token,{x:1,y:1,cell:48});
 motion.bind('a','monitor',monitor,{x:1,y:1,cell:48});
 motion.preview('a',4,2);flush();
 motion.handoff('a');
 assert.equal(motion.getPreview('a').handoff,true);
 assert.equal(motion.reconcile('a',1,1),false);
 flush();
 assert.equal(token.style.translate,'144px 48px');
 motion.bind('a','sprite',token,{x:4,y:2,cell:48});
 motion.bind('a','monitor',monitor,{x:4,y:2,cell:48});
 assert.equal(motion.reconcile('a',4,2),true);
 flush();
 assert.equal(token.style.translate,'');
 assert.equal(monitor.style.translate,'');
 assert.equal(motion.getPreview('a'),null);
 motion.dispose();
});
