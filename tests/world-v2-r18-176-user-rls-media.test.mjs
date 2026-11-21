import test from 'node:test';
import assert from 'node:assert/strict';
import {createUserScopedMediaAdapters,R176_LIVE_ENABLED} from '../staging/world-v2-b10-r18-176-user-rls-media-resolver/UserScopedMediaAdapters.mjs';
import {createCampaignPrivateMediaGateway} from '../staging/world-v2-b10-r18-175-private-media-gateway-prototype/CampaignPrivateMediaGateway.mjs';
const DM='00000000-0000-4000-8000-000000000301',P1='00000000-0000-4000-8000-000000000302';
const P2='00000000-0000-4000-8000-000000000303',C='00000000-0000-4000-8000-000000000101';
const C2='00000000-0000-4000-8000-000000000102',MAP='00000000-0000-4000-8000-000000000201';
const MAP2='00000000-0000-4000-8000-000000000202',TOK='00000000-0000-4000-8000-000000000401';
const TOK2='00000000-0000-4000-8000-000000000402',CH='00000000-0000-4000-8000-000000000601';
const NPC='00000000-0000-4000-8000-000000000701',PERS='00000000-0000-4000-8000-000000000501';
const png=new Blob([Uint8Array.from([137,80,78,71,13,10,26,10,1])],{type:'image/png'});
const art=new Blob([Uint8Array.from([82,73,70,70,1,2,3,4,87,69,66,80])],{type:'image/webp'});
const rows={
 battle_maps:[{id:MAP,campaign_id:C,storage_path:'camp-1/map.png'},{id:MAP2,campaign_id:C2,storage_path:'camp-2/map.png'}],
 map_tokens:[
  {id:TOK,campaign_id:C,map_id:MAP,owner_id:P1,character_id:CH,npc_template_id:null,image_path:'camp-1/players/tok.webp'},
  {id:TOK2,campaign_id:C,map_id:MAP,owner_id:null,character_id:null,npc_template_id:NPC,image_path:'camp-1/npcs/dragon.webp'}],
 characters:[{id:CH,campaign_id:C,user_id:P1,portrait_path:'camp-1/players/char-portrait.webp'}],
 npc_templates:[{id:NPC,campaign_id:C,portrait_path:'camp-1/npcs/dragon-portrait.webp'}],
 personal_tokens:[{id:PERS,owner_id:P1,token_path:P1+'/own-token.webp',portrait_path:P1+'/own-portrait.webp'}]
};
const clone=x=>JSON.parse(JSON.stringify(x));
function state(){return {tables:clone(rows),members:new Set([DM,P1,P2]),mapAccess:new Set([DM,P1]),seen:new Set([DM,P1]),calls:[],downloads:[],denyStorage:new Set(),failRpc:null};}
function dbFor(s,actor){
 return {
  from(table){
   let filters=[];return {
    select(columns){s.calls.push(['table',actor,table,columns]);return this;},
    eq(col,val){filters.push([col,val]);return this;},
    async maybeSingle(){
     const row=s.tables[table]?.find(r=>filters.every(([k,v])=>r[k]===v));
     if(!row)return {data:null,error:null};
     if(table==='personal_tokens'&&row.owner_id!==actor)return {data:null,error:null};
     if(table==='battle_maps'&&!s.mapAccess.has(actor))return {data:null,error:null};
     if(table==='map_tokens'&&!s.seen.has(actor))return {data:null,error:null};
     if((table==='characters'||table==='npc_templates')&&!s.members.has(actor))return {data:null,error:null};
     return {data:clone(row),error:null};
    }
   };
  },
  async rpc(name,args){
   s.calls.push(['rpc',actor,name,args]);
   if(s.failRpc===name)return {data:null,error:new Error('private failure')};
   if(name==='can_view_campaign_map')return {data:s.members.has(actor)&&s.mapAccess.has(actor)&&args.p_campaign===C&&args.p_map===MAP,error:null};
   if(name==='can_observe_map_token')return {data:s.members.has(actor)&&s.seen.has(actor)&&[TOK,TOK2].includes(args.p_token),error:null};
   if(name==='is_campaign_dm')return {data:actor===DM&&s.members.has(actor)&&args.c===C,error:null};
   return {data:false,error:null};
  },
  storage:{from(bucket){return {async download(path){
   s.downloads.push([actor,bucket,path]);
   if(!s.members.has(actor)&&bucket!=='personal-token-art')return {data:null,error:new Error('revoked RLS')};
   if(s.denyStorage.has(path))return {data:null,error:new Error('Storage RLS denial')};
   if(bucket==='personal-token-art'&&!path.startsWith(actor+'/'))return {data:null,error:new Error('owner denied')};
   if(bucket==='battlemap-assets'&&!s.mapAccess.has(actor))return {data:null,error:new Error('map denied')};
   if(bucket==='tabletop-artwork'&&!s.seen.has(actor))return {data:null,error:new Error('observation denied')};
   return {data:bucket==='battlemap-assets'?png:art,error:null};
  }}}}
 };
}
const args=(kind,resourceId,variant,userId)=>({userId,kind,resourceId,variant});
const map=(userId=P1,id=MAP)=>args('map-image',id,'map',userId);
const token=(userId=P1,id=TOK,variant='token')=>args('campaign-token-art',id,variant,userId);
const personal=(userId=P1,variant='token')=>args('personal-token-art',PERS,variant,userId);
function handle(adapters,userId=P1){
 const g=createCampaignPrivateMediaGateway({authenticate:async()=>({id:userId}),
  ...adapters,allowedOrigins:['https://qa.tabletop.test']});
 return (kind,resourceId,variant)=>g(new Request('https://edge.test/private',{method:'POST',
  headers:{Authorization:'Bearer signed-user-000001',Origin:'https://qa.tabletop.test','Content-Type':'application/json'},
  body:JSON.stringify({kind,resourceId,variant})}));
}
test('R176 disabled; forged userId never substitutes signed owner',async()=>{
 assert.equal(R176_LIVE_ENABLED,false);
 const s=state(),a=createUserScopedMediaAdapters({db:dbFor(s,P1),verifiedUserId:P1});
 assert.equal(await a.resolveForCurrentUser(personal(DM)),null);
 assert.equal((await a.resolveForCurrentUser(personal())).bucket,'personal-token-art');
 assert.equal(await a.resolveForCurrentUser(personal(P2)),null);
});
test('map ID is checked against current campaign map access',async()=>{
 const s=state(),a=createUserScopedMediaAdapters({db:dbFor(s,P1),verifiedUserId:P1});
 assert.deepEqual(await a.resolveForCurrentUser(map()),{bucket:'battlemap-assets',path:'camp-1/map.png'});
 assert.equal(await a.resolveForCurrentUser(map(P1,MAP2)),null);
 s.mapAccess.delete(P1);assert.equal(await a.resolveForCurrentUser(map()),null);
 assert.ok(s.calls.some(x=>x[0]==='rpc'&&x[2]==='can_view_campaign_map'));
});
test('token requires both map access and observation and current membership',async()=>{
 const s=state(),a=createUserScopedMediaAdapters({db:dbFor(s,P1),verifiedUserId:P1});
 assert.deepEqual(await a.resolveForCurrentUser(token()),{bucket:'tabletop-artwork',path:'camp-1/players/tok.webp'});
 s.seen.delete(P1);assert.equal(await a.resolveForCurrentUser(token()),null);
 s.seen.add(P1);s.members.delete(P1);assert.equal(await a.resolveForCurrentUser(token()),null);
});
test('character portrait owner and DM rules; NPC portrait DM-only',async()=>{
 const s=state();let a=createUserScopedMediaAdapters({db:dbFor(s,P1),verifiedUserId:P1});
 assert.deepEqual(await a.resolveForCurrentUser(token(P1,TOK,'portrait')),{bucket:'tabletop-artwork',path:'camp-1/players/char-portrait.webp'});
 assert.equal(await a.resolveForCurrentUser(token(P1,TOK2,'portrait')),null);
 a=createUserScopedMediaAdapters({db:dbFor(s,DM),verifiedUserId:DM});
 assert.deepEqual(await a.resolveForCurrentUser(token(DM,TOK2,'portrait')),{bucket:'tabletop-artwork',path:'camp-1/npcs/dragon-portrait.webp'});
});
test('personal art survives campaign departure without granting another account',async()=>{
 const s=state(),a=createUserScopedMediaAdapters({db:dbFor(s,P1),verifiedUserId:P1});s.members.delete(P1);
 assert.deepEqual(await a.resolveForCurrentUser(personal()),{bucket:'personal-token-art',path:P1+'/own-token.webp'});
 assert.equal((await a.loadPrivateBlob({bucket:'personal-token-art',path:P1+'/own-token.webp'})).type,'image/webp');
});
test('even if trusted map path references foreign private file, Storage RLS denies',async()=>{
 const s=state(),a=createUserScopedMediaAdapters({db:dbFor(s,P1),verifiedUserId:P1});
 s.tables.battle_maps[0].storage_path='camp-2/stolen-map.png';s.denyStorage.add('camp-2/stolen-map.png');
 const res=await handle(a)('map-image',MAP,'map');
 assert.equal(res.status,503);
 assert.deepEqual(s.downloads,[[P1,'battlemap-assets','camp-2/stolen-map.png']]);
});
test('revocation between resource SELECT and private download is denied again',async()=>{
 const s=state(),a=createUserScopedMediaAdapters({db:dbFor(s,P1),verifiedUserId:P1});
 const lookup=await a.resolveForCurrentUser(map());assert.ok(lookup);
 s.members.delete(P1);
 await assert.rejects(a.loadPrivateBlob(lookup),/Private media access unavailable/);
});
test('integrated R175 HTTP gateway serves user-scoped Storage download, not a signed URL',async()=>{
 const s=state(),a=createUserScopedMediaAdapters({db:dbFor(s,P1),verifiedUserId:P1});
 const res=await handle(a)('map-image',MAP,'map');
 assert.equal(res.status,200);assert.equal(res.headers.get('location'),null);
 assert.match(res.headers.get('cache-control'),/no-store/);
 assert.deepEqual(s.downloads,[[P1,'battlemap-assets','camp-1/map.png']]);
});
test('RPC failure fails closed before Storage download',async()=>{
 const s=state();s.failRpc='can_observe_map_token';
 const a=createUserScopedMediaAdapters({db:dbFor(s,P1),verifiedUserId:P1});
 assert.equal((await handle(a)('campaign-token-art',TOK,'token')).status,503);
 assert.equal(s.downloads.length,0);
});
