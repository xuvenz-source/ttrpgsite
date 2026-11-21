import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequestIsolatedMediaHandler,R180_LIVE_ENABLED} from '../staging/world-v2-b10-r18-180-request-isolated-media-client/RequestIsolatedMediaHandler.mjs';
const A='00000000-0000-4000-8000-000000000302', B='00000000-0000-4000-8000-000000000303';
const CA='00000000-0000-4000-8000-000000000101',CB='00000000-0000-4000-8000-000000000102';
const MA='00000000-0000-4000-8000-000000000201',MB='00000000-0000-4000-8000-000000000202';
const users={'user-token-A-00000001':A,'user-token-B-00000002':B};
const png=new Blob([Uint8Array.from([137,80,78,71,13,10,26,10,1])],{type:'image/png'});
const base='https://fictional-qa.supabase.co',key='sb_publishable_fictional0001',origin='https://qa.tabletop.test';
function req(token='user-token-A-00000001',id=MA,opts={}){
 const method=opts.method||'POST';
 return new Request('https://gateway.example/media',{method,
  headers:{Authorization:'Bearer '+token,'Content-Type':'application/json',Origin:opts.origin||origin},
  ...(!['GET','HEAD','OPTIONS'].includes(method)?{body:opts.body||JSON.stringify({kind:'map-image',resourceId:id,variant:'map'})}:{})
 });
}
function fixture(gateAuth=null){
 const state={clients:[],downloads:[],authCalls:[],reads:[],members:new Set([A,B]),denyAuth:new Set()};
 const createClient=(url,k,opts)=>{
  const token=opts.global.headers.Authorization.slice(7),actor=users[token];
  state.clients.push({token,actor,url,k,opts});
  return {
   auth:{async getUser(t){
    state.authCalls.push(t);
    if(gateAuth)await gateAuth(token);
    if(t!==token||!actor||state.denyAuth.has(token))return {data:{user:null},error:{status:401}};
    return {data:{user:{id:actor}},error:null};
   }},
   from(table){const eq=[];return {
    select(){state.reads.push({actor,table});return this;},
    eq(k,v){eq.push([k,v]);return this;},
    async maybeSingle(){
     const rows=[{id:MA,campaign_id:CA,storage_path:'a/map.png'},{id:MB,campaign_id:CB,storage_path:'b/map.png'}];
     const row=table==='battle_maps'?rows.find(x=>eq.every(([k,v])=>x[k]===v)):null;
     return {data:row&&state.members.has(actor)&&((actor===A&&row.campaign_id===CA)||(actor===B&&row.campaign_id===CB))?row:null,error:null};
    }
   }},
   async rpc(name,p){
    return {data:name==='can_view_campaign_map'&&state.members.has(actor)&&
     ((actor===A&&p.p_campaign===CA&&p.p_map===MA)||(actor===B&&p.p_campaign===CB&&p.p_map===MB)),error:null};
   },
   storage:{from(bucket){return {async download(path){
    state.downloads.push({actor,token,bucket,path});
    if(!state.members.has(actor)||path!==(actor===A?'a/map.png':'b/map.png'))
     return {data:null,error:{status:403}};
    return {data:png,error:null};
   }}}}
  };
 };
 const handler=createRequestIsolatedMediaHandler({createClient,projectUrl:base,publishableKey:key,allowedOrigins:[origin]});
 return {handler,state};
}
test('dormant, refuses service keys and non-Supabase URLs',()=>{
 assert.equal(R180_LIVE_ENABLED,false);
 for(const [url,k] of [[base,'sb_secret_disallowed'],['https://evil.example',key],['http://fictional-qa.supabase.co',key]])
 assert.throws(()=>createRequestIsolatedMediaHandler({createClient:()=>({}),projectUrl:url,publishableKey:k,allowedOrigins:[origin]}));
});
test('current P1 receives map bytes through fresh publishable JWT client and no redirect',async()=>{
 const {handler,state}=fixture(),r=await handler(req());
 assert.equal(r.status,200);assert.equal(r.headers.get('location'),null);
 assert.match(r.headers.get('cache-control'),/no-store/);
 assert.deepEqual(new Uint8Array(await r.arrayBuffer()),new Uint8Array(await png.arrayBuffer()));
 assert.equal(state.clients.length,1);assert.equal(state.clients[0].opts.auth.persistSession,false);
 assert.equal(state.clients[0].opts.global.headers.Authorization,'Bearer user-token-A-00000001');
 assert.deepEqual(state.downloads,[{actor:A,token:'user-token-A-00000001',bucket:'battlemap-assets',path:'a/map.png'}]);
});
test('concurrent A and B Auth complete backwards without cross-user Storage leakage',async()=>{
 const wait=[];const {handler,state}=fixture(token=>new Promise(resolve=>wait.push({token,resolve})));
 const pa=handler(req('user-token-A-00000001',MA));
 const pb=handler(req('user-token-B-00000002',MB));
 await Promise.resolve();assert.equal(wait.length,2);
 wait.find(x=>x.token==='user-token-B-00000002').resolve();
 assert.equal((await pb).status,200);
 wait.find(x=>x.token==='user-token-A-00000001').resolve();
 assert.equal((await pa).status,200);
 assert.deepEqual(state.downloads.map(x=>[x.actor,x.path,x.token]),[
 [B,'b/map.png','user-token-B-00000002'],
 [A,'a/map.png','user-token-A-00000001']]);
 assert.equal(state.clients.length,2);
});
test('P1 cannot request P2 map and revocation immediately closes new reads',async()=>{
 const {handler,state}=fixture();
 assert.equal((await handler(req('user-token-A-00000001',MB))).status,404);
 assert.equal(state.downloads.length,0);
 assert.equal((await handler(req())).status,200);
 state.members.delete(A);
 assert.equal((await handler(req())).status,404);
 assert.equal(state.downloads.length,1);
});
test('invalid verified session denies access even when Authorization format valid',async()=>{
 const {handler,state}=fixture();state.denyAuth.add('user-token-A-00000001');
 assert.equal((await handler(req())).status,401);
 assert.equal(state.reads.length,0);assert.equal(state.downloads.length,0);
});
test('OPTIONS, invalid origin and GET create no user clients',async()=>{
 const {handler,state}=fixture();
 assert.equal((await handler(req('user-token-A-00000001',MA,{method:'OPTIONS'}))).status,204);
 assert.equal((await handler(req('user-token-A-00000001',MA,{method:'GET'}))).status,405);
 assert.equal((await handler(req('user-token-A-00000001',MA,{origin:'https://evil.example'}))).status,403);
 assert.equal(state.clients.length,0);
});
test('browser-supplied identity/path rejected before Storage',async()=>{
 const {handler,state}=fixture();
 const body=JSON.stringify({kind:'map-image',resourceId:MA,variant:'map',userId:B,path:'b/map.png'});
 assert.equal((await handler(req('user-token-A-00000001',MA,{body}))).status,400);
 assert.equal(state.downloads.length,0);
});
