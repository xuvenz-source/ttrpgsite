import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createLatestOnlyPreviewQueue} from '../src/ObserverPreviewQueue.js';

const tick=()=>new Promise(resolve=>setImmediate(resolve));
function deferred(){
 let resolve,reject;
 const promise=new Promise((yes,no)=>{resolve=yes;reject=no});
 return {promise,resolve,reject};
}

test('slow observer RPC never builds a backlog of obsolete pointer samples',async()=>{
 const calls=[],responses=[],reported=[];
 const queue=createLatestOnlyPreviewQueue({
  send:packet=>{calls.push(packet);const response=deferred();responses.push(response);return response.promise},
  onResult:(packet,result)=>reported.push([packet,result])
 });
 queue.enqueue('token-a',{x:1,seq:1});
 await tick();
 assert.equal(queue.inFlightCount,1);
 queue.enqueue('token-a',{x:2,seq:2});
 queue.enqueue('token-a',{x:3,seq:3});
 queue.enqueue('token-a',{x:4,seq:4});
 assert.deepEqual(calls.map(p=>p.x),[1]);
 responses[0].resolve({data:true});
 await tick();
 assert.deepEqual(calls.map(p=>p.x),[1,4]);
 assert.deepEqual(reported.map(([p])=>p.seq),[1]);
 responses[1].resolve({data:true});
 await tick();
 assert.deepEqual(reported.map(([p])=>p.seq),[1,4]);
 assert.equal(queue.inFlightCount,0);
 queue.dispose();
});

test('cancelling waits for in-flight preview before cleanup and drops pending sample',async()=>{
 const network=deferred(),sent=[],reported=[];
 const queue=createLatestOnlyPreviewQueue({
  send:p=>{sent.push(p);return network.promise},
  onResult:p=>reported.push(p)
 });
 queue.enqueue('token-a',{x:1});
 await tick();
 queue.enqueue('token-a',{x:2});
 let settled=false;
 const cleanup=queue.cancel('token-a').then(()=>{settled=true});
 await tick();
 assert.equal(settled,false);
 network.resolve({data:true});
 await cleanup;
 assert.equal(settled,true);
 assert.deepEqual(sent,[{x:1}]);
 assert.deepEqual(reported,[]);
 assert.equal(queue.inFlightCount,0);
 queue.dispose();
});

test('cancelled previews are not sent before a scheduled microtask starts',async()=>{
 const sent=[];
 const queue=createLatestOnlyPreviewQueue({send:p=>{sent.push(p);return Promise.resolve(true)}});
 queue.enqueue('token-a',{x:1});
 await queue.cancel('token-a');
 await tick();
 assert.deepEqual(sent,[]);
 queue.dispose();
});

test('individual tokens are independent and network errors cannot wedge the queue',async()=>{
 const errors=[],sent=[];
 const queue=createLatestOnlyPreviewQueue({
  send:async p=>{sent.push(p);if(p.fail)throw Error('RPC failed');return {data:true}},
  onError:(p,e)=>errors.push([p.id,e.message])
 });
 queue.enqueue('token-a',{id:'one',fail:true});
 queue.enqueue('token-b',{id:'two'});
 await tick();
 assert.deepEqual(sent.map(p=>p.id),['one','two']);
 assert.deepEqual(errors,[['one','RPC failed']]);
 queue.enqueue('token-a',{id:'three'});
 await tick();
 assert.deepEqual(sent.map(p=>p.id),['one','two','three']);
 queue.dispose();
});

test('board keeps single-token pointer motion off React state and server events defer handoff',()=>{
 const app=readFileSync(new URL('../src/TabletopApp.jsx',import.meta.url),'utf8');
 const board=readFileSync(new URL('../src/BattlemapBoard.jsx',import.meta.url),'utf8');
 assert.match(app,/remoteMotion\.current\?\.handoffRemote\(id\)/);
 assert.match(app,/movementPreviewQueue\.current\?\.enqueue\(token\.id/);
 assert.match(app,/Promise\.all\(keys\.map\(key=>queue\?\.cancel\(key\)\)\)/);
 assert.doesNotMatch(board,/if\\(isDM&&info\\.tools\\?\\.length\\)setToolPreview/);
 assert.match(board,/motion\\.current\\?\\.preview\\('tool:'/);
 assert.match(board,/for\(const token of info\.members\)\s*motion\.current\?\.preview/);
 assert.doesNotMatch(app,/await queue\.drain\(id\)/);
});
