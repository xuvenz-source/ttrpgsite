import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer as createViteServer} from 'vite';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawn,spawnSync} from 'node:child_process';
const ROOT=resolve(fileURLToPath(new URL('../',import.meta.url)));
const delay=ms=>new Promise(r=>setTimeout(r,ms));
const chrome=()=>{
 for(const name of ['google-chrome','google-chrome-stable','chromium','chromium-browser']){
  const r=spawnSync('which',[name],{encoding:'utf8'});
  if(r.status===0&&r.stdout.trim())return r.stdout.trim();
 }return null;
};
async function browser(path){
 const dir=await mkdtemp(join(tmpdir(),'world-v2-react-drag-'));
 const proc=spawn(path,['--headless=new','--no-sandbox','--disable-gpu',
  '--disable-dev-shm-usage','--no-first-run','--no-default-browser-check',
  '--user-data-dir='+dir,'--remote-debugging-port=0','about:blank'],
  {stdio:['ignore','ignore','pipe']});
 let ws,port=0;let err='';
 proc.stderr.on('data',x=>{err=(err+String(x)).slice(-2000)});
 try{
  for(let i=0;i<160;i++){
   if(proc.exitCode!==null)throw Error('Browser ended '+err);
   try{const s=await readFile(join(dir,'DevToolsActivePort'),'utf8');
    port=Number(s.split('\n')[0]);if(port)break;}catch{}
   await delay(80);
  }
  if(!port)throw Error('No DevTools '+err);
  let page;
  for(let i=0;i<30;i++){
   try{const json=await(await fetch('http://127.0.0.1:'+port+'/json/list')).json();
    page=json.find(x=>x.type==='page');if(page?.webSocketDebuggerUrl)break;
   }catch{}
   await delay(80);
  }
  if(!page?.webSocketDebuggerUrl)throw Error('No CDP page');
  ws=new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve,reject)=>{
   ws.addEventListener('open',resolve,{once:true});
   ws.addEventListener('error',reject,{once:true});
  });
  const pending=new Map();let id=0;
  ws.addEventListener('message',m=>{
   const data=JSON.parse(m.data),item=pending.get(data.id);
   if(!item)return;pending.delete(data.id);
   if(data.error)item.reject(Error(data.error.message));else item.resolve(data.result);
  });
  const send=(method,params={})=>new Promise((resolve,reject)=>{
   const key=++id;
   const timer=setTimeout(()=>{
    pending.delete(key);reject(Error('CDP timed out: '+method));
   },8000);
   pending.set(key,{
    resolve:value=>{clearTimeout(timer);resolve(value)},
    reject:error=>{clearTimeout(timer);reject(error)}
   });
   ws.send(JSON.stringify({id:key,method,params}));
  });
  const evaluate=async expression=>{
   const result=await send('Runtime.evaluate',{
    expression,awaitPromise:true,returnByValue:true});
   if(result.exceptionDetails)throw Error(result.exceptionDetails.text||'Browser script error');
   return result.result.value;
  };
  return {send,evaluate,async close(){
   ws?.close();proc.kill('SIGKILL');await rm(dir,{recursive:true,force:true});
  }};
 }catch(e){
  ws?.close();proc.kill('SIGKILL');await rm(dir,{recursive:true,force:true});
  throw e;
 }
}
test('integrated actual React board drags owned player, DM and preview token',{timeout:90000},async t=>{
 const path=chrome();
 if(!path){t.skip('Chromium unavailable');return}
 const vite=await createViteServer({root:ROOT,configFile:false,
  server:{host:'127.0.0.1',port:0,hmr:false},appType:'spa',
  logLevel:'error'});
 let b;
 try{
  await vite.listen();
  const port=vite.httpServer.address().port;
  b=await browser(path);
  await b.send('Page.enable');
  await b.send('Runtime.enable');
  for(const mode of ['player','dm','unlocked','preview']){
   await b.send('Page.navigate',{url:
    'http://127.0.0.1:'+port+'/tests/browser/world-v2-real-board.html?mode='+mode+'&worldV2Trace=1'});
   let ready=false;
   for(let i=0;i<160;i++){
    try{ready=await b.evaluate('Boolean(window.__v2Integrated?.ready())')}catch{}
    if(ready)break;await delay(80);
   }
   assert.ok(ready,'actual React '+mode+' board failed to authorize: '+
    JSON.stringify(await b.evaluate('window.__v2Integrated?.snapshot()??document.body.innerText.slice(0,350)')));
   const before=await b.evaluate('window.__v2Integrated.snapshot()');
   assert.equal(before.spriteCount,1);
   const rect=await b.evaluate('window.__v2Integrated.bounds()');
   const move=(type,x,y)=>b.send('Input.dispatchMouseEvent',{
    type,x,y,button:type==='mouseMoved'?'none':'left',
    buttons:type==='mouseReleased'?0:1,clickCount:1});
   await move('mouseMoved',rect.x,rect.y);
   await move('mousePressed',rect.x,rect.y);
   await move('mouseMoved',rect.x+66,rect.y);
   await move('mouseMoved',rect.x+120,rect.y);
   await move('mouseReleased',rect.x+120,rect.y);
   await delay(240);
   const after=await b.evaluate('window.__v2Integrated.snapshot()');
   assert.equal(after.spriteCount,1,'no portal remount: '+JSON.stringify(after));
   assert.equal(after.canvasCount,1,'no fog remount: '+JSON.stringify(after));
   assert.deepEqual(after.errors,[],'runtime error: '+JSON.stringify(after));
   if(mode==='preview'){
    assert.ok(after.rpc.includes('preview_world_visibility_v2'),
     'DM preview did not receive player-authorized sight');
    assert.equal(after.rpc.includes('begin_world_motion_v2'),false,
     'preview must never mutate real campaign');
    assert.equal(after.committed,0);
   }else{
    assert.ok(after.rpc.includes('begin_world_motion_v2'),
     'first mouse press must reach authority in '+mode+': '+JSON.stringify(after));
    assert.ok(after.rpc.includes('advance_world_motion_v2'),
     'drag must advance in '+mode+': '+JSON.stringify(after));
    assert.ok(after.rpc.includes('commit_world_motion_v2'),
     'drag must commit in '+mode+': '+JSON.stringify(after));
    assert.equal(after.committed,1,'single committed drag');
    assert.ok(after.position.x>2,'token must move');
   }
  }
 }finally{await b?.close();await vite.close()}
});

test('R12 real React V2 player can drag again before lagged signed sight catches up',
 {timeout:90000},async t=>{
 const path=chrome();
 if(!path){t.skip('Chromium unavailable');return}
 const vite=await createViteServer({root:ROOT,configFile:false,
  server:{host:'127.0.0.1',port:0,hmr:false},appType:'spa',
  logLevel:'error'});
 let b;
 try{
  await vite.listen();
  b=await browser(path);
  await b.send('Page.enable');
  await b.send('Runtime.enable');
  const port=vite.httpServer.address().port;
  await b.send('Page.navigate',{url:'http://127.0.0.1:'+port+
   '/tests/browser/world-v2-real-board.html?mode=stale&worldV2Trace=1'});
  let ready=false;
  for(let i=0;i<160;i++){
   try{ready=await b.evaluate('Boolean(window.__v2Integrated?.ready())')}catch{}
   if(ready)break;await delay(80);
  }
  assert.equal(ready,true,'player fixture failed to mount V2');
  const gesture=async distance=>{
   const rect=await b.evaluate('window.__v2Integrated.bounds()');
   const send=(type,x,y)=>b.send('Input.dispatchMouseEvent',{
    type,x,y,button:type==='mouseMoved'?'none':'left',
    buttons:type==='mouseReleased'?0:1,clickCount:1});
   await send('mouseMoved',rect.x,rect.y);
   await send('mousePressed',rect.x,rect.y);
   await send('mouseMoved',rect.x+distance*.5,rect.y);
   await send('mouseMoved',rect.x+distance,rect.y);
   await send('mouseReleased',rect.x+distance,rect.y);
  };
  await gesture(61);
  for(let i=0;i<50;i++){
   if((await b.evaluate('window.__v2Integrated.snapshot().committed'))>=1)break;
   await delay(15);
  }
  const first=await b.evaluate('window.__v2Integrated.snapshot()');
  assert.equal(first.committed,1,JSON.stringify(first));
  await delay(40);
  await gesture(61);
  for(let i=0;i<50;i++){
   if((await b.evaluate('window.__v2Integrated.snapshot().committed'))>=2)break;
   await delay(15);
  }
  const second=await b.evaluate('window.__v2Integrated.snapshot()');
  assert.equal(second.committed,2,
   'second drag must use ACKed canonical endpoint, not stale signed sight: '+JSON.stringify(second));
  assert.equal(second.trace?.counts?.['movement.rejected']??0,0);
  assert.ok((second.trace?.counts?.['movement.canonical-handoff']??0)>=1);
  assert.equal(second.spriteCount,1,'no sprite remount');
  assert.equal(second.canvasCount,1,'no fog layer remount');
  assert.deepEqual(second.errors,[]);
 }finally{await b?.close();await vite.close()}
});


test('R15 real Chromium React board reuses exact signed sight and falls back on stale keyboard continuation',
 {timeout:90000},async t=>{
 const path=chrome();
 if(!path){t.skip('Chromium unavailable');return}
 const vite=await createViteServer({root:ROOT,configFile:false,
  server:{host:'127.0.0.1',port:0,hmr:false},appType:'spa',
  logLevel:'error'});
 let b;
 try{
  await vite.listen();
  b=await browser(path);
  await b.send('Page.enable');
  await b.send('Runtime.enable');
  const port=vite.httpServer.address().port;
  for(const mode of ['r15-covered','r15-fallback']){
   await b.send('Page.navigate',{url:'http://127.0.0.1:'+port+
    '/tests/browser/world-v2-real-board.html?mode='+mode+'&worldV2Trace=1'});
   const snap=()=>b.evaluate('window.__v2Integrated?.snapshot()');
   async function waitFor(predicate,label,tries=200){
    for(let i=0;i<tries;i++){
     const value=await snap().catch(()=>null);
     if(value&&predicate(value))return value;
     await delay(15);
    }
    throw Error('R15 Chromium timeout '+mode+'/'+label+': '+JSON.stringify(await snap()));
   }
   await waitFor(x=>x.stepReady&&x.spriteCount===1&&x.spriteVisible==='visible','ready');
   // The actual board clears selection on first map mount; select the
   // authorized visible sprite through React before using the arrow API.
   assert.equal(await b.evaluate('(()=>{const node=document.querySelector(".world-v2-token-content");if(!node)return false;node.click();return true})()'),true);
   await delay(50);
   assert.equal(await b.evaluate('window.__v2Integrated.step(1,0)'),true,
    mode+': first keyboard input rejected: '+JSON.stringify(await snap()));
   assert.equal(await b.evaluate('window.__v2Integrated.step(0,0,{release:true})'),true,
    mode+': first release rejected');
   await waitFor(x=>x.commitStarted===1,'first commit pending');
   assert.equal(await b.evaluate('window.__v2Integrated.step(1,0)'),true,
    mode+': queued keyboard input rejected during pending commit');
   await b.evaluate('window.__v2Integrated.resumeCommit()');
   await waitFor(x=>x.firstCommitSightStarted===1,'signed commit sight pending');
   const before=await snap();
   assert.equal(before.postCommitSightCalls,1,
    mode+': only the mandatory signed commit sight should start');
   await b.evaluate('window.__v2Integrated.resumeSight()');
   const continued=await waitFor(
    x=>x.rpc.filter(n=>n==='begin_world_motion_v2').length===2,
    'second gesture after canonical commit sight');
   const expected=mode==='r15-covered'?1:2;
   assert.equal(continued.postCommitSightCalls,expected,
    mode+': expected only exact commit sight for covered continuation; stale must fall back');
   assert.equal(continued.commitStarted,1,
    'capture continuation before second independent gesture finishes');
   assert.equal(continued.spriteCount,1,mode+': no sprite remount');
   assert.equal(continued.canvasCount,1,mode+': no fog remount');
   assert.deepEqual(continued.errors,[],mode+': no browser runtime errors');
   const detail=mode==='r15-covered'?'covered':'fallback';
   assert.ok(continued.trace?.events.some(e=>
    e.event==='visibility.continuation'&&e.detail===detail),
    mode+': missing causal continuation diagnostic');
   await waitFor(x=>x.commitStarted>=2,'second gesture commit');
   const final=await snap();
   assert.ok(final.position.x>=4,mode+': second gesture should advance canonical position');
   assert.equal(final.trace?.counts?.['movement.rejected']??0,0,
    mode+': no rejected gestures');
  }
 }finally{await b?.close();await vite.close()}
});
