import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createWorldRenderer} from '../src/engine/v2/WorldRenderer.js';
import {createWorldRealtimeTransport} from '../src/engine/v2/RealtimeTransport.js';

const MAP='10000000-0000-4000-8000-000000000001';
const VIEWER='30000000-0000-4000-8000-000000000001';
const HERO='40000000-0000-4000-8000-000000000001';
const HIDDEN='40000000-0000-4000-8000-000000000002';
const hero={kind:'token',id:HERO,x:2,y:2};
const scene={
 version:2,mapId:MAP,scope:'viewer',published:true,revision:9,
 sceneGeneration:2,rulesRevision:4,collisionEnabled:true,
 fogEnabled:true,ambient:0,effects:{weather:'none',intensity:0},
 dimensions:{width:1000,height:1000,gridSize:100},environment:null
};
const sight=(cursor=0,pieces=[hero],visible=[22,23],epoch=6)=>({
 version:2,mapId:MAP,viewerId:VIEWER,scope:'viewer',cursor,
 environmentRevision:9,permissionGeneration:4,sceneGeneration:2,
 visionEpoch:epoch,enabled:true,width:10,height:10,
 partyShared:false,visible,explored:visible,visiblePieces:pieces
});
const frame=(seq,items)=>({
 version:2,mapId:MAP,viewerId:VIEWER,seq,
 environmentRevision:9,permissionGeneration:4,items
});
const path=(id=HERO)=>({
 kind:'token',id,action:'path',path:[{x:2,y:2},{x:3,y:2}]
});
const hide=id=>({kind:'token',id,action:'hide'});
const flush=()=>new Promise(resolve=>setImmediate(resolve));
async function settle(){for(let i=0;i<8;i++)await flush()}
function surfaces(){
 const ctx={
  clearRect(){},fillRect(){},save(){},restore(){},setTransform(){},
  beginPath(){},clip(){},rect(){},moveTo(){},lineTo(){},
  stroke(){},fill(){},arc(){},createLinearGradient(){
   return {addColorStop(){}}
  }
 };
 const canvas=()=>({style:{},width:0,height:0,getContext:()=>ctx});
 const host={
  style:{},children:[],
  ownerDocument:{createElement:()=>({style:{},dataset:{},parentNode:null})},
  appendChild(n){this.children.push(n);n.parentNode=this},
  removeChild(n){
   const i=this.children.indexOf(n);
   assert.ok(i>=0);this.children.splice(i,1);n.parentNode=null
  }
 };
 return {
  terrain:{style:{},src:'',removeAttribute(){this.src=''}},
  staticCanvas:canvas(),fogCanvas:canvas(),spriteHost:host,
  viewport:{style:{}}
 };
}
function rig(){
 const surface=surfaces(),raf=new Map(),timers=new Map();
 let next=0,subscriber=null,motion=null,vision=null;
 let current=sight(),releaseGuarded,guardedCalls=0,channels=0;
 const stale=new Promise(resolve=>{releaseGuarded=resolve});
 const renderer=createWorldRenderer({
  mapId:MAP,viewerId:VIEWER,surfaces:surface,
  requestFrame:fn=>{const id=++next;raf.set(id,fn);return id},
  cancelFrame:id=>raf.delete(id)
 });
 const channel={
  on(_,filter,callback){
   if(filter.event==='world-motion-v2')motion=callback;
   if(filter.event==='world-vision-v2')vision=callback;
   return this;
  },subscribe(fn){subscriber=fn;return this}
 };
 const db={
  realtime:{async setAuth(){}},
  channel(){channels++;return channel},
  async removeChannel(){}
 };
 const observer=createWorldRealtimeTransport({
  db,mapId:MAP,viewerId:VIEWER,softResyncEnabled:true,
  scheduleRecovery:(fn,ms)=>{const id=++next;timers.set(id,{fn,ms});return id},
  cancelRecovery:id=>timers.delete(id),
  onResync:async reason=>{
   if(reason==='observer-guarded-sight'){
    guardedCalls++;return stale;
   }
   // Mimics real runtime's independent authenticated sight, which MUST
   // be accepted by the presentation owner before stream unlock.
   assert.equal(renderer.adoptVisibility(current),true);
   return current;
  },
  onPath:(item,meta)=>renderer.applyObserverPath(item,meta),
  onHide:(item,meta)=>renderer.applyObserverHide(item,meta),
  onRevoke:reason=>renderer.revoke(reason,false)
 });
 const paint=()=>{
  const tasks=[...raf.values()];raf.clear();
  for(const fn of tasks)fn(1000);
 };
 return {
  surface,renderer,observer,timers,paint,releaseGuarded,
  get guardedCalls(){return guardedCalls},
  get channels(){return channels},
  update:s=>{current=s},
  async start(){
   assert.equal(renderer.adoptScene(scene),true);
   assert.equal(renderer.adoptVisibility(current),true);
   paint();
   await observer.start();subscriber('SUBSCRIBED');await settle();
   assert.equal(observer.locked,false);
   paint();
  },
  send:(seq,items)=>motion({payload:frame(seq,items)}),
  dirty:p=>vision({payload:p}),
  async dispose(){await observer.dispose();renderer.dispose()}
 };
}
test('R18-11 real renderer immediately removes sprites and blackens fog on guarded hide',async()=>{
 const h=rig();await h.start();
 try{
  const initial=h.renderer.getSpriteElement('token',HERO);
  assert.ok(initial,'P1 starts with a server-authorized visible sprite');
  assert.equal(initial.style.visibility,'visible');
  assert.equal(h.surface.fogCanvas.style.backgroundColor,'transparent');
  h.send(1,[path(HIDDEN)]);
  await settle();
  assert.equal(h.observer.recovering,true);
  assert.equal(h.renderer.getSpriteElement('token',HIDDEN),null);
  h.update(sight(2,[],[],7));
  h.send(2,[hide(HERO)]);
  assert.equal(h.observer.locked,true,'private hide synchronously seals');
  assert.equal(h.renderer.authorized,false);
  assert.equal(h.renderer.stats.sprites,0);
  assert.equal(h.renderer.getSpriteElement('token',HERO),null);
  assert.equal(initial.parentNode,null);
  assert.equal(h.surface.fogCanvas.style.backgroundColor,'#040914');
  assert.equal(h.timers.size,0);
  await settle();
  assert.equal(h.observer.locked,false);
  h.paint();
  assert.equal(h.renderer.stats.sprites,0);
  assert.equal(h.renderer.currentVisibility?.visiblePieces.length,0);
  h.releaseGuarded(sight(2,[hero],[22,23],6));
  await settle();
  h.paint();
  assert.equal(h.renderer.stats.sprites,0,
   'an older guarded signed result cannot restore a concealed actor');
  assert.equal(h.channels,1);
 }finally{await h.dispose()}
});
test('R18-11 real renderer immediately revokes fog on guarded private vision notice',async()=>{
 const h=rig();await h.start();
 try{
  assert.ok(h.renderer.getSpriteElement('token',HERO));
  h.send(1,[path(HIDDEN)]);await settle();
  assert.equal(h.observer.recovering,true);
  h.update(sight(1,[],[],7));
  h.dirty({version:2,mapId:MAP,viewerId:VIEWER,
   environmentRevision:9,permissionGeneration:4,
   sceneGeneration:2,visionEpoch:7});
  assert.equal(h.observer.locked,true);
  assert.equal(h.renderer.stats.sprites,0);
  assert.equal(h.surface.fogCanvas.style.backgroundColor,'#040914');
  await settle();
  assert.equal(h.renderer.currentVisibility?.visiblePieces.length,0);
  h.releaseGuarded(sight(1,[hero],[22,23],6));await settle();
  assert.equal(h.renderer.stats.sprites,0);
 }finally{await h.dispose()}
});
test('R18-11 source-real 3-viewer role revocation suite stays isolated and in CI',()=>{
 const source=readFileSync(new URL(
  './sql/world-engine-v2-r18-11-revocation-auth-contract.sql',import.meta.url),'utf8');
 const workflow=readFileSync(new URL(
  '../.github/workflows/staging-world-engine-v2-sql.yml',import.meta.url),'utf8');
 assert.match(source,/\bBEGIN;/);
 assert.match(source,/\bROLLBACK;/);
 assert.match(source,/SET ROLE authenticated/);
 assert.match(source,/DELETE FROM public\.campaign_members/);
 assert.match(source,/UPDATE public\.campaign_members SET role='player'/);
 assert.match(source,/public\.get_world_visibility_v2/);
 assert.match(source,/public\.get_world_observer_cursor_v2/);
 assert.match(source,/realtime\.messages/);
 assert.match(workflow,/image: postgres:17-alpine/);
 assert.match(workflow,/world-engine-v2-r18-11-revocation-auth-contract\.sql/);
 assert.doesNotMatch(source,/supabase db push|supabase migration repair|apply_migration/i);
});
