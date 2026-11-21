import test from 'node:test';
import assert from 'node:assert/strict';
import {createCampaignPrivateMediaGateway,R175_LIVE_ENABLED} from '../staging/world-v2-b10-r18-175-private-media-gateway-prototype/CampaignPrivateMediaGateway.mjs';
const DM='00000000-0000-4000-8000-000000000301';
const P1='00000000-0000-4000-8000-000000000302';
const P2='00000000-0000-4000-8000-000000000303';
const OUT='00000000-0000-4000-8000-000000000305';
const MAP='00000000-0000-4000-8000-000000000201';
const TOKEN='00000000-0000-4000-8000-000000000401';
const PERSONAL='00000000-0000-4000-8000-000000000501';
const png=new Blob([Uint8Array.from([137,80,78,71,13,10,26,10,1])],{type:'image/png'});
const jpg=new Blob([Uint8Array.from([255,216,255,224])],{type:'image/jpeg'});
const webp=new Blob([Uint8Array.from([82,73,70,70,1,2,3,4,87,69,66,80])],{type:'image/webp'});
const gif=new Blob([Uint8Array.from([71,73,70,56,57,97])],{type:'image/gif'});
const good={kind:'map-image',resourceId:MAP,variant:'map'};
const origin='https://qa.tabletop.test';
function request(data=good,opts={}){
 const headers={'Authorization':'Bearer '+(opts.token||'signed-session-0001'),'Content-Type':'application/json'};
 if(!opts.noOrigin)headers.Origin=opts.origin||origin;
 Object.assign(headers,opts.headers||{});
 const method=opts.method||'POST';
 return new Request('https://functions.example.test/private-media',{
  method,headers,...(!['GET','HEAD','OPTIONS'].includes(method)?{body:opts.rawBody??JSON.stringify(data)}:{})
 });
}
function fixture(options={}){
 const state={members:new Set([DM,P1,P2]),maps:new Set([DM,P1]),seen:new Set([DM,P1]),opened:0,resolved:0,auth:0};
 const authenticate=async token=>{state.auth++;return ({
  'signed-session-0001':{id:P1},'signed-session-0002':{id:P2},
  'signed-session-0003':{id:DM},'signed-session-0004':{id:OUT}
 })[token]||null;};
 const resolveForCurrentUser=async({userId,kind,resourceId,variant})=>{
  state.resolved++;
  if(kind==='personal-token-art')return resourceId===PERSONAL&&userId===P1?
   {bucket:'personal-token-art',path:userId+'/saved.webp'}:null;
  if(!state.members.has(userId))return null;
  if(kind==='map-image')return resourceId===MAP&&state.maps.has(userId)?
   {bucket:'battlemap-assets',path:'campaign-a/maps/image.png'}:null;
  if(kind==='campaign-token-art')return resourceId===TOKEN&&state.seen.has(userId)?
   {bucket:'tabletop-artwork',path:'campaign-a/players/'+variant+'.jpg'}:null;
  return null;
 };
 const loadPrivateBlob=async({bucket})=>{state.opened++;return bucket==='battlemap-assets'?png:
  bucket==='tabletop-artwork'?jpg:webp;};
 return {state,handle:createCampaignPrivateMediaGateway({
  authenticate,resolveForCurrentUser,loadPrivateBlob,allowedOrigins:[origin],...options
 })};
}
test('gateway is dormant and produces no redirect, bearer token or cacheable image response',async()=>{
 assert.equal(R175_LIVE_ENABLED,false);
 const {handle,state}=fixture();
 const r=await handle(request());
 assert.equal(r.status,200);assert.equal(r.headers.get('location'),null);
 assert.equal(r.headers.get('content-type'),'image/png');
 assert.equal(r.headers.get('x-content-type-options'),'nosniff');
 assert.match(r.headers.get('cache-control'),/no-store/);
 assert.equal(r.headers.get('access-control-allow-origin'),origin);
 assert.deepEqual(new Uint8Array(await r.arrayBuffer()),new Uint8Array(await png.arrayBuffer()));
 assert.deepEqual([state.auth,state.resolved,state.opened],[1,1,1]);
});
test('removed P1, unassigned P2 and outsider never receive new map bytes',async()=>{
 const {handle,state}=fixture();
 assert.equal((await handle(request())).status,200);
 state.members.delete(P1);
 assert.equal((await handle(request())).status,404);
 assert.equal((await handle(request(good,{token:'signed-session-0002'}))).status,404);
 assert.equal((await handle(request(good,{token:'signed-session-0004'}))).status,404);
 assert.equal(state.opened,1);assert.equal(state.resolved,4);
});
test('current DM and observed P1 can read appropriate map/token, not P2 hidden token',async()=>{
 const {handle}=fixture();
 assert.equal((await handle(request(good,{token:'signed-session-0003'}))).status,200);
 assert.equal((await handle(request({kind:'campaign-token-art',resourceId:TOKEN,variant:'portrait'}))).status,200);
 assert.equal((await handle(request({kind:'campaign-token-art',resourceId:TOKEN,variant:'token'},{token:'signed-session-0002'}))).status,404);
});
test('personal library ownership persists after P1 leaves campaign',async()=>{
 const {handle,state}=fixture();state.members.delete(P1);
 const personal={kind:'personal-token-art',resourceId:PERSONAL,variant:'token'};
 assert.equal((await handle(request(personal))).status,200);
 assert.equal((await handle(request(personal,{token:'signed-session-0003'}))).status,404);
});
test('invalid signed identity never reaches trusted asset lookup',async()=>{
 const {handle,state}=fixture();
 for(const header of ['', 'Basic pass','Bearer short','Bearer signed-session-0001 extra']){
  assert.equal((await handle(request(good,{headers:{Authorization:header}}))).status,401);
 }
 assert.equal((await handle(request(good,{token:'signed-session-9999'}))).status,401);
 assert.equal(state.resolved,0);assert.equal(state.opened,0);
});
test('reject body attempts to supply arbitrary Storage paths, buckets or actor IDs',async()=>{
 const {handle,state}=fixture();
 for(const body of [
  {...good,path:'private.png'},{...good,bucket:'personal-token-art'},
  {...good,userId:DM},{...good,kind:'not-a-kind'},
  {...good,variant:'../../private'},{...good,resourceId:'bad'},
  [good],null
 ])assert.equal((await handle(request(body))).status,400);
 assert.equal(state.resolved,0);
});
test('unknown origins, methods, invalid JSON and oversized request are refused',async()=>{
 const {handle,state}=fixture();
 assert.equal((await handle(request(undefined,{method:'GET'}))).status,405);
 assert.equal((await handle(request(undefined,{method:'OPTIONS'}))).status,204);
 assert.equal((await handle(request(good,{origin:'https://evil.example'}))).status,403);
 assert.equal((await handle(request(good,{rawBody:'not json'}))).status,400);
 assert.equal((await handle(request(good,{headers:{'Content-Type':'text/plain'}}))).status,400);
 assert.equal((await handle(request(good,{rawBody:'a'.repeat(3000)}))).status,413);
 assert.equal(state.resolved,0);
});
test('wrong trusted bucket, raw URLs and traversal paths never call private storage',async()=>{
 for(const asset of [
  {bucket:'personal-token-art',path:'map.png'},
  {bucket:'battlemap-assets',path:'../secret.png'},
  {bucket:'battlemap-assets',path:'%2e%2e/secret.png'},
  {bucket:'battlemap-assets',path:'https://evil.example/file.png'},
  {bucket:'battlemap-assets',path:'a//b.png'},
  {bucket:'battlemap-assets',path:'/file.png'}
 ]){
  let opened=0;
  const handle=createCampaignPrivateMediaGateway({authenticate:async()=>({id:P1}),
   resolveForCurrentUser:async()=>asset,loadPrivateBlob:async()=>{opened++;return png;},
   allowedOrigins:[origin]});
  assert.equal((await handle(request())).status,503);assert.equal(opened,0);
 }
});
test('reject HTML, SVG, signed URL, invalid file signatures, and oversize output',async()=>{
 for(const blob of [
  'https://storage.example/private?token=SECRET',
  new Blob(['<script>bad()</script>'],{type:'text/html'}),
  new Blob(['<svg></svg>'],{type:'image/svg+xml'}),
  new Blob(['<svg></svg>'],{type:'image/png'}),
  new Blob([new Uint8Array(20)],{type:'image/png'})
 ]){
  const handle=createCampaignPrivateMediaGateway({authenticate:async()=>({id:P1}),
   resolveForCurrentUser:async()=>({bucket:'battlemap-assets',path:'image.png'}),
   loadPrivateBlob:async()=>blob,allowedOrigins:[origin]});
  const r=await handle(request());assert.equal(r.status,503);
  assert.equal(r.headers.get('location'),null);
 }
 const handle=createCampaignPrivateMediaGateway({authenticate:async()=>({id:P1}),
  resolveForCurrentUser:async()=>({bucket:'battlemap-assets',path:'image.png'}),
  loadPrivateBlob:async()=>png,allowedOrigins:[origin],maxImageBytes:4});
 assert.equal((await handle(request())).status,503);
});
test('four safe image signatures can be served but DB failures must deny access',async()=>{
 for(const [blob,kind,resourceId,variant,bucket] of [
  [png,'map-image',MAP,'map','battlemap-assets'],
  [jpg,'campaign-token-art',TOKEN,'portrait','tabletop-artwork'],
  [webp,'personal-token-art',PERSONAL,'token','personal-token-art'],
  [gif,'personal-token-art',PERSONAL,'portrait','personal-token-art']
 ]){
  const handle=createCampaignPrivateMediaGateway({authenticate:async()=>({id:P1}),
   resolveForCurrentUser:async()=>({bucket,path:'a/b.png'}),
   loadPrivateBlob:async()=>blob,allowedOrigins:[origin]});
  assert.equal((await handle(request({kind,resourceId,variant}))).status,200);
 }
 let reads=0;
 const errorHandle=createCampaignPrivateMediaGateway({authenticate:async()=>({id:P1}),
  resolveForCurrentUser:async()=>{throw Error('private SQL failure');},
  loadPrivateBlob:async()=>{reads++;return png;},allowedOrigins:[origin]});
 assert.equal((await errorHandle(request())).status,503);
 assert.equal(reads,0);
});
