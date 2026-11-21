import test from 'node:test';
import assert from 'node:assert/strict';
import {createCampaignPrivateMediaGateway} from '../staging/world-v2-b10-r18-175-private-media-gateway-prototype/CampaignPrivateMediaGateway.mjs';
import {createUserScopedMediaAdapters} from '../staging/world-v2-b10-r18-176-user-rls-media-resolver/UserScopedMediaAdapters.mjs';
const DM='00000000-0000-4000-8000-000000000301',P1='00000000-0000-4000-8000-000000000302';
const P2='00000000-0000-4000-8000-000000000303';
const C='00000000-0000-4000-8000-000000000101',M='00000000-0000-4000-8000-000000000201';
const TN='00000000-0000-4000-8000-000000000401',TC='00000000-0000-4000-8000-000000000402';
const N='00000000-0000-4000-8000-000000000701',CH='00000000-0000-4000-8000-000000000601';
const PT='00000000-0000-4000-8000-000000000501';
const png=new Blob([Uint8Array.from([137,80,78,71,13,10,26,10,1])],{type:'image/png'});
const webp=new Blob([Uint8Array.from([82,73,70,70,1,2,3,4,87,69,66,80])],{type:'image/webp'});
const json=x=>JSON.parse(JSON.stringify(x));
function fixture(actor){
 const state={member:new Set([DM,P1,P2]),assigned:new Set([DM,P1]),visible:new Set([DM,P1]),signedRlsReads:[],denied:0};
 const db={
  from(table){const filters=[];return {
   select(){return this;},eq(k,v){filters.push([k,v]);return this;},
   async maybeSingle(){
    const tables={
     battle_maps:[{id:M,campaign_id:C,storage_path:C+'/map/scene.png'}],
     map_tokens:[
      {id:TN,campaign_id:C,map_id:M,owner_id:null,npc_template_id:N,character_id:null,image_path:C+'/npcs/dragon-token.webp'},
      {id:TC,campaign_id:C,map_id:M,owner_id:P1,npc_template_id:null,character_id:CH,image_path:C+'/players/'+P1+'/hero-token.webp'}],
     characters:[{id:CH,campaign_id:C,user_id:P1,portrait_path:C+'/players/'+P1+'/hero-portrait.webp'}],
     npc_templates:[{id:N,campaign_id:C,portrait_path:C+'/npcs/dragon-portrait.webp'}],
     personal_tokens:[{id:PT,owner_id:P1,portrait_path:P1+'/portrait.webp',token_path:P1+'/token.webp'}]
    };
    const row=tables[table]?.find(r=>filters.every(([k,v])=>r[k]===v));
    if(!row)return {data:null,error:null};
    if(table==='personal_tokens'&&row.owner_id!==actor)return {data:null,error:null};
    if(table==='npc_templates'&&actor!==DM)return {data:null,error:null};
    if(table==='characters'&&actor!==DM&&row.user_id!==actor)return {data:null,error:null};
    if((table==='battle_maps'||table==='map_tokens')&&!state.assigned.has(actor))return {data:null,error:null};
    return {data:json(row),error:null};
   }
  };},
  async rpc(name,args){
   if(name==='is_campaign_dm')return {data:actor===DM&&state.member.has(actor),error:null};
   if(name==='can_view_campaign_map')return {data:state.member.has(actor)&&state.assigned.has(actor)&&args.p_map===M&&args.p_campaign===C,error:null};
   if(name==='can_observe_map_token')return {data:state.member.has(actor)&&state.visible.has(actor)&&[TN,TC].includes(args.p_token),error:null};
   return {data:false,error:null};
  },
  storage:{from(bucket){return {async download(path){
   state.signedRlsReads.push({actor,bucket,path});
   const authorizedMap=state.member.has(actor)&&state.assigned.has(actor);
   const authorizedObserved=authorizedMap&&state.visible.has(actor);
   // Current source has map storage_path, map_tokens.image_path,
   // characters token/portrait and personal owner-folder branches.
   // No explicit npc_templates.portrait_path reference appears.
   let allowed=false;
   if(bucket==='battlemap-assets')allowed=authorizedMap&&path===C+'/map/scene.png';
   if(bucket==='tabletop-artwork')allowed=(authorizedObserved&&[
     C+'/npcs/dragon-token.webp',C+'/players/'+P1+'/hero-token.webp'
    ].includes(path))||((actor===DM||actor===P1)&&state.member.has(actor)&&
     path===C+'/players/'+P1+'/hero-portrait.webp');
   if(bucket==='personal-token-art')allowed=path.startsWith(actor+'/');
   if(!allowed){state.denied++;return {data:null,error:{status:403}};}
   return {data:bucket==='battlemap-assets'?png:webp,error:null};
  }}}}
 };
 const adapters=createUserScopedMediaAdapters({db,verifiedUserId:actor});
 const gateway=createCampaignPrivateMediaGateway({authenticate:async()=>({id:actor}),
  ...adapters,allowedOrigins:['https://qa.tabletop.test']});
 const request=async(kind,id,variant)=>gateway(new Request('https://api.qa.test/media',{method:'POST',
  headers:{Authorization:'Bearer mock-user-jwt-00001',Origin:'https://qa.tabletop.test','Content-Type':'application/json'},
  body:JSON.stringify({kind,resourceId:id,variant})}));
 return {state,request};
}
test('DM sees authorized NPC map token, but cannot assume its template portrait is stored under a readable RLS branch',async()=>{
 const f=fixture(DM);
 assert.equal((await f.request('campaign-token-art',TN,'token')).status,200);
 const denied=await f.request('campaign-token-art',TN,'portrait');
 assert.equal(denied.status,503);assert.equal(denied.headers.get('location'),null);
 assert.equal(f.state.denied,1);
});
test('owner/DM character portrait linked to current campaign is readable, P2 other sheet is not',async()=>{
 assert.equal((await fixture(P1).request('campaign-token-art',TC,'portrait')).status,200);
 assert.equal((await fixture(DM).request('campaign-token-art',TC,'portrait')).status,200);
 assert.equal((await fixture(P2).request('campaign-token-art',TC,'portrait')).status,404);
});
test('private map bytes need current map permission',async()=>{
 assert.equal((await fixture(DM).request('map-image',M,'map')).status,200);
 assert.equal((await fixture(P1).request('map-image',M,'map')).status,200);
 assert.equal((await fixture(P2).request('map-image',M,'map')).status,404);
});
test('revoked signed user receives neither map nor token nor a Storage call',async()=>{
 const f=fixture(P1);f.state.member.delete(P1);
 assert.equal((await f.request('map-image',M,'map')).status,404);
 assert.equal((await f.request('campaign-token-art',TN,'token')).status,404);
 assert.equal(f.state.signedRlsReads.length,0);
});
test('personal art remains under account after leaving campaign',async()=>{
 const f=fixture(P1);f.state.member.delete(P1);
 assert.equal((await f.request('personal-token-art',PT,'token')).status,200);
 assert.equal((await fixture(P2).request('personal-token-art',PT,'token')).status,404);
});
test('deny Storage RLS failure without a privileged fallback or signed URL',async()=>{
 const f=fixture(DM);const res=await f.request('campaign-token-art',TN,'portrait');
 assert.equal(res.status,503);assert.equal(res.headers.get('location'),null);
 assert.match(res.headers.get('cache-control'),/no-store/);
 assert.equal(f.state.signedRlsReads.length,1);
});
