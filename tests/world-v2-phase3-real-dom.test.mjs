import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile, mkdtemp, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawn,spawnSync} from 'node:child_process';

const ROOT=resolve(fileURLToPath(new URL('../',import.meta.url)));
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const chromium=()=>{
 for(const name of ['google-chrome','google-chrome-stable','chromium','chromium-browser']){
  const r=spawnSync('which',[name],{encoding:'utf8'});
  if(r.status===0&&r.stdout.trim())return r.stdout.trim();
 }
 return null;
};
async function serve(){
 const server=createServer(async(req,res)=>{
  const url=new URL(req.url,'http://127.0.0.1');
  const name=resolve(ROOT,'.'+decodeURIComponent(url.pathname));
  if(!name.startsWith(ROOT+sep)){res.writeHead(403);res.end();return}
  try{
   const data=await readFile(name);
   res.writeHead(200,{'content-type':name.endsWith('.html')?
    'text/html; charset=utf-8':'text/javascript; charset=utf-8',
    'cache-control':'no-store'});
   res.end(data);
  }catch{res.writeHead(404);res.end()}
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 return {server,port:server.address().port};
}
async function browserPage(path){
 const dir=await mkdtemp(join(tmpdir(),'world-v2-chrome-'));
 const child=spawn(path,['--headless=new','--no-sandbox','--disable-gpu',
  '--disable-dev-shm-usage','--no-first-run','--no-default-browser-check',
  '--user-data-dir='+dir,'--remote-debugging-port=0','about:blank'],
  {stdio:['ignore','ignore','pipe']});
 let browserErrors='';
 child.stderr.on('data',data=>{
  browserErrors=(browserErrors+String(data)).slice(-1500);
 });
 let port=null,ws=null;
 try{
  for(let attempt=0;attempt<180;attempt++){
   if(child.exitCode!==null)throw Error('Chromium terminated before DevTools connected: '+browserErrors);
   try{
    const raw=await readFile(join(dir,'DevToolsActivePort'),'utf8');
    port=Number(raw.split('\n')[0]);if(port>0)break;
   }catch{}
   await delay(100);
  }
  if(!port)throw Error('Chromium DevTools port unavailable: '+browserErrors);
  let page=null;
  for(let attempt=0;attempt<40;attempt++){
   try{
    const list=await(await fetch('http://127.0.0.1:'+port+'/json/list')).json();
    page=list.find(item=>item.type==='page');
    if(page?.webSocketDebuggerUrl)break;
   }catch{}
   await delay(100);
  }
  if(!page?.webSocketDebuggerUrl)throw Error('Chromium page endpoint unavailable');
  ws=new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((ok,bad)=>{
   ws.addEventListener('open',ok,{once:true});
   ws.addEventListener('error',bad,{once:true});
  });
  let sequence=0;
  const pending=new Map();
  ws.addEventListener('message',message=>{
   const data=JSON.parse(message.data);
   if(!data.id)return;
   const entry=pending.get(data.id);if(!entry)return;
   pending.delete(data.id);
   if(data.error)entry.reject(Error(data.error.message));
   else entry.resolve(data.result);
  });
  const send=(method,params={})=>new Promise((resolve,reject)=>{
   const id=++sequence;pending.set(id,{resolve,reject});
   ws.send(JSON.stringify({id,method,params}));
  });
  const evaluate=async expression=>{
   const result=await send('Runtime.evaluate',{
    expression,returnByValue:true,awaitPromise:true});
   if(result.exceptionDetails)throw Error('Chromium evaluate exception');
   return result.result.value;
  };
  return {send,evaluate,async close(){
   ws?.close();child.kill('SIGKILL');await rm(dir,{recursive:true,force:true});
  }};
 }catch(error){
  ws?.close();child.kill('SIGKILL');
  await rm(dir,{recursive:true,force:true});throw error;
 }
}
test('actual Chromium DOM pointer capture: player, DM unlocked, preview, locked editor',async t=>{
 const executable=chromium();
 if(!executable){t.skip('Chromium not installed; require authenticated browser gate');return}
 const {server,port}=await serve();
 let browser;
 try{
  browser=await browserPage(executable);
  await browser.send('Page.enable');
  await browser.send('Runtime.enable');
  await browser.send('Page.navigate',{
   url:'http://127.0.0.1:'+port+'/tests/browser/world-v2-phase3.html'});
  let ready=false;
  for(let i=0;i<100;i++){
   try{ready=await browser.evaluate('Boolean(window.__v2Probe)')}catch{}
   if(ready)break;
   await delay(100);
  }
  if(!ready){
   const page=await browser.evaluate('({url:location.href,ready:document.readyState,title:document.title,body:document.body?.textContent?.slice(0,250)})').catch(e=>({error:e.message}));
   assert.fail('browser fixture module failed to initialize: '+JSON.stringify(page));
  }
  const bounds=await browser.evaluate('window.__v2Probe.bounds()');
  const dispatch=async(type,x,y)=>browser.send('Input.dispatchMouseEvent',{
   type,x,y,button:type==='mouseMoved'?'none':'left',
   buttons:type==='mouseReleased'?0:1,clickCount:1});
  async function drag(mode){
   await browser.evaluate('window.__v2Probe.setMode('+JSON.stringify(mode)+')');
   await dispatch('mouseMoved',bounds.x,bounds.y);
   await dispatch('mousePressed',bounds.x,bounds.y);
   await dispatch('mouseMoved',bounds.x+36,bounds.y+35);
   await dispatch('mouseMoved',bounds.x+70,bounds.y+35);
   await dispatch('mouseReleased',bounds.x+70,bounds.y+35);
   await delay(70);
   return browser.evaluate('window.__v2Probe.snapshot()');
  }
  for(const mode of ['player','unlocked','preview']){
   const result=await drag(mode);
   assert.deepEqual(result.starts,[mode==='preview'?'preview':'drag'],
    mode+' should start movement on first press');
   assert.ok(result.moves.length>=1,mode+' should move on first gesture');
   assert.equal(result.ends,1,mode+' should release cleanly');
   assert.equal(result.marquees,0,mode+' must not also start a marquee');
   assert.ok(result.claims>=1,mode+' board must observe native document ownership');
   assert.ok(result.captures>=1,mode+' browser capture was not confirmed: '+JSON.stringify(result));
   assert.deepEqual(result.cancellations,[]);
  }
  const locked=await drag('locked');
  assert.deepEqual(locked.starts,[],'locked DM editor cannot grab tokens');
  assert.equal(locked.ends,0);
  assert.ok(locked.editorDown>0,'locked overlay receives its editor pointer');
  await browser.evaluate('window.__v2Probe.setMode("player")');
  await dispatch('mouseMoved',bounds.statusX,bounds.statusY);
  await dispatch('mousePressed',bounds.statusX,bounds.statusY);
  await dispatch('mouseReleased',bounds.statusX,bounds.statusY);
  const nested=await browser.evaluate('window.__v2Probe.snapshot()');
  assert.deepEqual(nested.starts,[],
   'nested token status button cannot accidentally start a movement');
  assert.ok(nested.statusClicks>=1,'status control remains clickable');
 }finally{
  if(browser)await browser.close();
  await new Promise(resolve=>server.close(resolve));
 }
});
