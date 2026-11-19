import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve,join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createSceneV3Transition,R126_LIVE_ENABLED}
 from '../staging/world-v2-b10-r18-126-scene-v3-cutover-contract/SceneV3Transition.js';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const read=p=>readFileSync(join(root,p),'utf8');
const base='staging/world-v2-b10-r18-126-scene-v3-cutover-contract/';
const sql=read(base+'unapplied-atomic-v3-scene-candidate.sql');
const js=read(base+'SceneV3Transition.js');
const manifest=JSON.parse(read(base+'manifest.json'));
const setup=read('tests/world-v2-r18-126-postgres/setup-scene.sql');
const verify=read('tests/world-v2-r18-126-postgres/verify-scene.sql');
const runner=read('tests/world-v2-r18-126-postgres/run.sh');
const id={map:'00000000-0000-4000-8000-000000000201',
 p1:'00000000-0000-4000-8000-000000000302',
 p2:'00000000-0000-4000-8000-000000000303',
 epoch:'00000000-0000-4000-8000-000000000501'};
const topic=()=>['forge-world-scene-v3',id.map,id.p1,id.epoch].join(':');
const tick=()=>new Promise(resolve=>setImmediate(resolve));
function fixture({
 getUser=async()=>({data:{user:{id:id.p1}}}),
 rpc=async()=>({data:topic(),error:null}),
 load=async()=>true,
 lock=()=>{},
 allow=()=>{}
}={}){
 const channels=[],removals=[],events=[],calls={identity:0,proof:0,scene:0,auth:0,lock:0,allow:0};
 const sceneManager={
  mapId:id.map,stale:true,sceneGeneration:0,
  invalidate(reason){this.stale=true;events.push('invalidate:'+reason)},
  notifyPublication(value){this.sceneGeneration=value.sceneGeneration;events.push('published:'+value.sceneGeneration)},
  async load(){calls.scene++;const ok=await load();this.stale=!ok;return ok}
 };
 const db={
  auth:{async getUser(){calls.identity++;return getUser()}},
  realtime:{async setAuth(){calls.auth++}},
  async rpc(name,params){
   assert.equal(name,'get_authorized_scene_channel_v3');
   assert.deepEqual(params,{p_map:id.map});calls.proof++;
   return rpc();
  },
  channel(name,config){
   const c={
    name,config,handlers:[],closed:false,
    on(type,filter,fn){this.handlers.push({type,filter,fn});return this},
    subscribe(fn){this.state=fn;return this},
    status(status){this.state(status)},
    publish(payload){
     const handler=this.handlers.find(h=>h.type==='broadcast'&&h.filter.event==='scene-revision-v2');
     handler?.fn({payload});
    }
   };channels.push(c);return c;
  },
  async removeChannel(c){c.closed=true;removals.push(c)}
 };
 const create=()=>createSceneV3Transition({db,mapId:id.map,viewerId:id.p1,sceneManager,
  onLock(info){calls.lock++;events.push('lock:'+info.reason);return lock(info)},
  onAllow(info){calls.allow++;events.push('allow:'+info.reason);return allow(info)},
  onDenied:info=>events.push('deny:'+info.reason),
  onError:err=>events.push('error:'+String(err.code||err.message)),
  onState:()=>{}
 });
 return {create,db,sceneManager,events,calls,channels,removals};
}

test('R126 source-only baseline and hard no-deploy flags',()=>{
 assert.equal(R126_LIVE_ENABLED,false);
 assert.equal(manifest.workPackage,'B10-R18-126');
 assert.equal(manifest.parentPr,233);
 assert.equal(manifest.parentSha,'bce0495099b07a9d093c14f7695befa99839ef49');
 for(const k of ['noHostedWrites','noProductionDeploy','noLiveSourceEdits',
  'noVersionedMigrations','noMerge','noPaidInfrastructure'])assert.equal(manifest[k],true);
 assert.equal(manifest.decision,'NO_GO');
 assert.equal(manifest.productionReleaseAuthorized,false);
});
test('R126 source-only SQL retains generation and eliminates legacy sender AND receiver',()=>{
 assert.match(sql,/CREATE OR REPLACE FUNCTION forge_world_v2\.bump_scene_publication_v2/);
 assert.match(sql,/ON CONFLICT\(map_id\) DO UPDATE SET/);
 assert.match(sql,/generation=forge_world_v2\.scene_publications\.generation\+1/);
 assert.match(sql,/CREATE POLICY "R126 V3 recipient scene receive"/);
 assert.match(sql,/DROP POLICY "World V2 scene publication receive" ON realtime\.messages/);
 assert.match(sql,/forge_scene_revoke\.can_receive_scene_topic_v3/);
 assert.match(sql,/forge_scene_revoke\.current_recipient_scene_topic_v3/);
 assert.match(sql,/realtime\.send\(/);
 assert.match(sql,/'scene-revision-v2',topic,true/);
 const active=sql.split('CREATE OR REPLACE FUNCTION')[1].split('END $scene$;')[0];
 assert.doesNotMatch(active,/forge-world-scene-v2:/);
 assert.doesNotMatch(active,/realtime\.send\([^;]+forge-world-scene-v2/);
 assert.doesNotMatch(sql,/GRANT EXECUTE ON FUNCTION forge_world_v2\.bump_scene_publication_v2/);
 assert.match(sql,/REVOKE ALL ON FUNCTION forge_world_v2\.bump_scene_publication_v2/);
});
test('R126 SQL fixture simulates private policy and membership revoke lifecycle',()=>{
 assert.match(setup,/CREATE TABLE realtime\.messages/);
 assert.match(setup,/ALTER TABLE realtime\.messages ENABLE ROW LEVEL SECURITY/);
 assert.match(verify,/revoked P1 received post-delete publication/);
 assert.match(verify,/restored P1 reused old subscribed topic/);
 assert.match(verify,/P1 could read P2 private broadcast/);
 assert.match(verify,/old shared receiver policy remains/);
 assert.match(verify,/reassigned P1 received old-map event/);
 assert.match(verify,/controlled broadcast failure rolled back scene/);
 assert.match(verify,/IS DISTINCT FROM true/); // mock private flag
});
test('R126 PG17 source runner cannot connect to hosted Supabase',()=>{
 for(const v of ['GITHUB_ACTIONS','R126_ISOLATED','127.0.0.1',
  'world_v2_r18_126','r126_disposable_only','SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY',
  'PGHOSTADDR','PGOPTIONS'])assert.ok(runner.includes(v),v);
 assert.match(runner,/r18-125-postgres\/setup\.sql/);
 assert.match(runner,/unapplied-scene-v3-prototype\.sql/);
 assert.match(runner,/unapplied-atomic-v3-scene-candidate\.sql/);
 assert.match(runner,/permission denied for function/);
 assert.match(runner,/permission denied for table/);
});
test('R126 future scene client masks synchronously and authorizes ONLY after fresh read',async()=>{
 const f=fixture();const t=f.create();
 const started=t.enter();assert.equal(f.calls.lock,1);
 assert.equal(t.snapshot().authorized,false);
 assert.equal(await started,true);
 assert.equal(f.channels.length,1);
 assert.equal(f.channels[0].name,topic());
 assert.equal(f.channels[0].config.private,undefined);
 assert.equal(f.channels[0].config.config.private,true);
 assert.equal(f.calls.allow,0);
 f.channels[0].status('SUBSCRIBED');
 await tick();await tick();
 assert.equal(t.snapshot().authorized,true);
 assert.equal(f.calls.allow,1);
 assert.equal(f.calls.scene,1);
 assert.equal(f.calls.proof,1);
 assert.equal(f.calls.identity,1);
 await t.dispose();
});
test('R126 scene notices are hints, never scene geometry or auth claims',async()=>{
 const f=fixture();const t=f.create();await t.enter();
 const c=f.channels[0];c.status('SUBSCRIBED');await tick();await tick();
 c.publish({version:2,mapId:id.map,sceneGeneration:2,
  id:'00000000-0000-4000-8000-000000000999'});
 await tick();await tick();
 assert.ok(f.events.includes('published:2'));
 assert.equal(t.snapshot().authorized,true);
 assert.equal(f.calls.proof,1); // NO new membership lease per scene change
 assert.equal(f.calls.scene,2);
 await t.dispose();
});
test('R126 stale/forged topic or wrong actor fails closed without V2 fallback',async()=>{
 for(const options of [
  {getUser:async()=>({data:{user:{id:id.p2}}})},
  {rpc:async()=>({data:'forge-world-scene-v2:'+id.map})},
  {rpc:async()=>({data:'forge-world-scene-v3:'+id.map+':'+id.p2+':'+id.epoch})},
  {rpc:async()=>({data:null,error:{message:'denied'}})}
 ]){
  const f=fixture(options),t=f.create();
  assert.equal(await t.enter(),false);
  assert.equal(t.snapshot().authorized,false);
  assert.equal(f.calls.allow,0);
  assert.equal(f.channels.length,0);
  await t.dispose();
 }
 assert.doesNotMatch(js,/db\.channel\(['"]forge-world-scene-v2/);
 assert.doesNotMatch(js,/worldSceneTopic\(/);
});
test('R126 failed scene read cannot re-open retained static display',async()=>{
 const f=fixture({load:async()=>false});const t=f.create();
 await t.enter();f.channels[0].status('SUBSCRIBED');
 await tick();await tick();
 assert.equal(t.snapshot().authorized,false);
 assert.equal(f.calls.allow,0);
 assert.ok(f.events.includes('deny:scene-read-denied'));
 await t.dispose();
});
test('R126 closed channel masks and old callbacks never reauthorize after reentry',async()=>{
 const f=fixture();const t=f.create();
 await t.enter();const old=f.channels[0];
 old.status('SUBSCRIBED');await tick();await tick();
 assert.equal(t.snapshot().authorized,true);
 const reentry=t.reenter();
 assert.equal(t.snapshot().authorized,false);
 await reentry;
 assert.equal(f.channels.length,2);
 const second=f.channels[1];old.status('SUBSCRIBED');
 await tick();
 assert.equal(t.snapshot().authorized,false);
 second.status('SUBSCRIBED');await tick();await tick();
 assert.equal(t.snapshot().authorized,true);
 assert.ok(f.removals.includes(old));
 await t.dispose();
});
test('R126 disposing during delayed auth prevents late join/reveal',async()=>{
 let release;const pending=new Promise(resolve=>{release=resolve});
 const f=fixture({getUser:()=>pending});const t=f.create();
 const work=t.enter();await tick();
 await t.dispose();
 release({data:{user:{id:id.p1}}});
 assert.equal(await work,false);
 assert.equal(f.channels.length,0);
 assert.equal(f.calls.allow,0);
 assert.equal(t.snapshot().disposed,true);
});
test('R126 asynchronous view mask is rejected before any network access',async()=>{
 const f=fixture({lock:()=>Promise.resolve()});const t=f.create();
 await assert.rejects(t.enter(),e=>e.code==='asynchronous_mask');
 assert.equal(f.calls.identity,0);
 assert.equal(f.channels.length,0);
});
test('R126 adapter has no interval, polling, movement- or fallback-network hooks',()=>{
 for(const bad of [/setInterval\s*\(/,/setTimeout\s*\(/,/requestAnimationFrame\s*\(/,
  /addEventListener\(['"]pointer/,/mousemove/,/movement\.advance/,/fetch\(/])
  assert.doesNotMatch(js,bad);
 assert.equal(manifest.securityGates.realSignedQaPassed,false);
 assert.equal(manifest.securityGates.r123RuntimeMounted,false);
 assert.equal(manifest.securityGates.preIssuedStorageUrlsRevoked,false);
});
