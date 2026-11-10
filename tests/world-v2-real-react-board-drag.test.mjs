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
   const beforeTrace=await b.evaluate('window.__worldV2Trace?.snapshot()');
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
   const trace=await b.evaluate('window.__worldV2Trace?.snapshot()');
   assert.equal(trace?.enabled,true,'opt-in browser diagnostics must be available');
   assert.ok((trace.counts['renderer.mount']??0)>=1,
    'actual React renderer mount should be counted');
   assert.ok((trace.durations['render.frame']?.samples??0)>=1,
    'renderer drawing time should be measured');
   assert.equal(trace.durations['movement.local-first-position-paint']?.samples,1,
    'one complete drag should record one first visible token position paint');
   assert.equal(trace.counts['renderer.terrain-assign']??0,
    beforeTrace.counts['renderer.terrain-assign']??0,
    'drag cannot reassign terrain bitmap');
   assert.equal(trace.counts['renderer.mount']??0,
    beforeTrace.counts['renderer.mount']??0,
    'drag cannot remount the canvas renderer');
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
