import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve,dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {
 createIsolatedV3TopicClient,R136_LIVE_ENABLED,
 R136_V3_API_SCHEMA,R136_V3_TOPIC_RPC
} from '../staging/world-v2-b10-r18-136-v3-isolated-api-fence/IsolatedV3TopicClient.mjs';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const read=p=>readFileSync(join(root,p),'utf8');
const dir='staging/world-v2-b10-r18-136-v3-isolated-api-fence/';
const manifest=JSON.parse(read(dir+'manifest.json'));
const sql=read(dir+'unapplied-v3-api-bridge-after-r128.sql');
const pg=read('tests/world-v2-r18-136-postgres/verify-isolated-v3-api.sql');
const runner=read('tests/world-v2-r18-136-postgres/run.sh');
const doc=read('docs/testing/world-v2-r18-136-isolated-v3-api-after-r128-2026-11-20.md');
const MAP='00000000-0000-4000-8000-000000000201';
const USER='00000000-0000-4000-8000-000000000303';
const OTHER='00000000-0000-4000-8000-000000000304';
const EPOCH='12345678-1234-4234-8234-123456789abc';
const TOPIC='forge-world-scene-v3:'+MAP+':'+USER+':'+EPOCH;
const later=()=>new Promise(resolve=>setImmediate(resolve));
function deferred(){let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve}}
function fixture({actor=USER,reply=TOPIC,err=null,hold=null,scope=null}={}){
 let current={mapId:MAP,viewerId:USER},signed=actor;
 let auth=0,schemas=[],requests=[],defaultRpc=0;
 if(scope)current=scope;
 const db={
  auth:{async getUser(){auth++;return {data:{user:{id:signed}},error:null}}},
  rpc:async()=>{defaultRpc++;throw Error('legacy public RPC MUST NOT be called')},
  schema(name){
   schemas.push(name);
   return {
    async rpc(name,payload){
     requests.push({name,payload});
     if(hold)await hold.promise;
     return {data:typeof reply==='function'?reply():reply,error:err};
    }
   };
  }
 };
 const api=createIsolatedV3TopicClient({db,mapId:MAP,
  viewerId:USER,getContext:()=>current});
 return {api,db,schemas,requests,get auth(){return auth},
  get defaultRpc(){return defaultRpc},changeActor:x=>signed=x,
  changeContext:x=>current=x};
}
test('R136 inherits R135 exact verified parent and no production changes',()=>{
 assert.equal(R136_LIVE_ENABLED,false);
 assert.equal(manifest.workPackage,'B10-R18-136');
 assert.equal(manifest.parentPr,243);
 assert.equal(manifest.parentSha,'252d5fcc582eb280159728aea97bb5a36ff6e960');
 assert.equal(manifest.parentFinalCi.allPassed,true);
 assert.equal(manifest.decision,'NO_GO');
 assert.equal(manifest.originalMigrationCount,83);
 assert.equal(manifest.qaMigrationCount,0);
 assert.equal(manifest.qaPublicApplicationTables,0);
 for(const flag of ['noHostedWrites','noLiveSrcChanges','noVersionedMigrations',
  'noMerge','noDeploy','noPaidResources'])
  assert.equal(manifest[flag],true,flag);
 assert.equal(manifest.productionReleaseAuthorized,false);
});
test('R136 PG role audit explicitly accounts for 67 existing privileged public RPCs',()=>{
 const actual=manifest.hostedReadOnlyAcl;
 assert.equal(actual.publicAuthenticatedCallableFunctions,77);
 assert.equal(actual.publicAuthenticatedSecurityDefinerFunctions,67);
 assert.equal(actual.publicAnonCallableFunctions,3);
 assert.equal(actual.publicAuthenticatedSelectRelations,29);
 assert.equal(actual.publicAuthenticatedInsertRelations,20);
 assert.equal(actual.publicAuthenticatedUpdateRelations,20);
 assert.equal(actual.publicAuthenticatedDeleteRelations,18);
 assert.equal(actual.authenticatedPublicSchemaUsageLive,true);
 assert.equal(actual.postgresSettingsExposedSchemasVerified,false);
});
test('R136 SQL refuses installation before full R128 public schema fence',()=>{
 assert.match(sql,/has_schema_privilege\('authenticated','public','USAGE'\)/);
 assert.match(sql,/has_schema_privilege\('anon','public','USAGE'\)/);
 assert.match(sql,/R136 preflight: R128 public schema fence not installed/);
 assert.match(sql,/public\.get_authorized_scene_channel_v3\(uuid\)/);
 assert.match(sql,/R136 postflight: legacy public schema unexpectedly reopened/);
 assert.match(sql,/CREATE SCHEMA forge_v3_api/);
 assert.match(sql,/REVOKE ALL ON SCHEMA forge_v3_api FROM PUBLIC,anon,authenticated/);
 assert.match(sql,/GRANT USAGE ON SCHEMA forge_v3_api TO authenticated/);
 assert.doesNotMatch(sql,/GRANT (?:ALL|USAGE) ON SCHEMA public/i);
 assert.doesNotMatch(sql,/GRANT ALL ON/i);
 assert.doesNotMatch(sql,/ALTER DEFAULT PRIVILEGES/i);
 assert.doesNotMatch(sql,/^\s*CREATE TABLE\b/gim);
 assert.doesNotMatch(sql,/^\s*CREATE POLICY\b/gim);
 assert.doesNotMatch(sql,/^\s*ALTER ROLE\b/gim);
});
test('R136 single SECURITY DEFINER signature and signed current R125 authority',()=>{
 assert.equal((sql.match(/\bCREATE FUNCTION\s+forge_v3_api\./g)||[]).length,1);
 assert.match(sql,/CREATE FUNCTION forge_v3_api\.get_authorized_scene_channel_v3\(p_map uuid\)\s*RETURNS text/);
 assert.match(sql,/SECURITY DEFINER SET search_path=''/);
 assert.match(sql,/actor:=auth\.uid\(\)/);
 assert.match(sql,/result_topic:=public\.get_authorized_scene_channel_v3\(p_map\)/);
 assert.match(sql,/IF actor IS NULL OR p_map IS NULL THEN RETURN NULL/);
 assert.match(sql,/REVOKE ALL ON FUNCTION[\s\S]*?forge_v3_api\.get_authorized_scene_channel_v3\(uuid\)[\s\S]*?FROM PUBLIC,anon,authenticated/);
 assert.match(sql,/GRANT EXECUTE ON FUNCTION[\s\S]*?forge_v3_api\.get_authorized_scene_channel_v3\(uuid\)[\s\S]*?TO authenticated/);
 assert.doesNotMatch(sql,/p_user|p_viewer|p_protocol|p_campaign|version_flag/);
 const c=manifest.sourceOnlyCandidate;
 assert.equal(c.allowAuthenticatedOnlyOneRpc,true);
 assert.equal(c.publicOldClientRpcReenabled,false);
 assert.equal(c.providesAllV3GameRpcRoutes,false);
 assert.equal(c.postgrestActuallyConfigured,false);
 assert.equal(c.deployedDatabaseMigration,false);
});
test('R136 client explicitly invokes ONLY custom-schema V3 RPC with signed actor',async()=>{
 const f=fixture();
 const topic=await f.api.getTopic();
 assert.equal(topic,TOPIC);
 assert.deepEqual(f.schemas,['forge_v3_api']);
 assert.deepEqual(f.requests,[{name:'get_authorized_scene_channel_v3',
  payload:{p_map:MAP}}]);
 assert.equal(f.auth,1);
 assert.equal(f.defaultRpc,0);
 assert.equal(f.api.snapshot().defaultPublicRpcFallbackAllowed,false);
 assert.equal(f.api.snapshot().productionReady,false);
 f.api.dispose();
});
test('R136 wrong signed identity or incompatible map/recipient/epoch never gets a topic',async()=>{
 const wrong=fixture({actor:OTHER});
 await assert.rejects(wrong.api.getTopic(),{code:'signed_actor_mismatch'});
 assert.equal(wrong.schemas.length,0);
 wrong.api.dispose();
 const topics=[
 'forge-world-scene-v2:'+MAP,
 'forge-world-scene-v3:'+MAP+':'+OTHER+':'+EPOCH,
 'forge-world-scene-v3:'+OTHER+':'+USER+':'+EPOCH,
 'forge-world-observer-v3:'+MAP+':'+USER+':'+EPOCH,
 'forge-world-scene-v3:'+MAP+':'+USER+':00000000-0000-0000-0000-000000000000',
 null,''
 ];
 for(const topic of topics){
  const x=fixture({reply:topic});
  await assert.rejects(x.api.getTopic(),{code:'v3_topic_not_authorized'});
  assert.equal(x.defaultRpc,0);
  x.api.dispose();
 }
 const denied=fixture({err:{message:'access denied'},reply:TOPIC});
 await assert.rejects(denied.api.getTopic(),{code:'v3_topic_not_authorized'});
 denied.api.dispose();
});
test('R136 missing custom schema RPC refuses public fallback',async()=>{
 const f=fixture();
 f.db.schema=()=>({from(){return this}});
 await assert.rejects(f.api.getTopic(),{code:'v3_schema_not_exposed'});
 assert.equal(f.defaultRpc,0);
 f.api.dispose();
});
test('R136 stale response after account/map switch is invalidated, no cache/replay',async()=>{
 const hold=deferred();
 const f=fixture({hold});
 const first=f.api.getTopic();await later();
 f.changeContext({mapId:OTHER,viewerId:USER});
 hold.resolve();
 await assert.rejects(first,{code:'changed_context'});
 assert.equal(f.defaultRpc,0);
 f.api.dispose();
 const second=deferred(),w=fixture({hold:second});
 const pending=w.api.getTopic();await later();
 w.api.cancel();
 // Cancellation invalidates results, but cannot magically resolve a network
 // request. Simulate the old socket response arriving after cancellation.
 second.resolve();
 await assert.rejects(pending,{code:'changed_context'});
 w.api.dispose();
});
test('R136 concurrent callers coalesce one signed schema RPC and disposed is terminal',async()=>{
 const hold=deferred(),f=fixture({hold});
 const x=f.api.getTopic(),y=f.api.getTopic();
 await later();assert.equal(f.requests.length,1);
 hold.resolve();assert.equal(await x,TOPIC);assert.equal(await y,TOPIC);
 assert.equal(f.auth,1);
 assert.equal(f.requests.length,1);
 f.api.dispose();
 await assert.rejects(f.api.getTopic(),{code:'closed'});
 assert.equal(f.defaultRpc,0);
});
test('R136 PG17 fixture proves old public routes denied, new route and revoke',()=>{
 for(const str of [
 'R136 public legacy API unexpectedly unsealed',
 'R136 exposed more than one isolated function',
 'R136 signed P2 did not receive current private topic',
 'R136 DM topic not scoped',
 'R136 outsider gained another campaign topic',
 'R136 null actor or map was accepted',
 'R136 player off-map still gets old map topic',
 'R136 removed P2 still obtained V3 topic',
 'R136 reinstated player reused revoked recipient epoch'
 ])assert.ok(pg.includes(str),str);
 for(const str of [
 'R136_ISOLATED','127.0.0.1','world_v2_r18_136',
 'r136_disposable_only','SUPABASE_SERVICE_ROLE_KEY',
 'tests/world-v2-r18-128-postgres/setup-legacy.sql',
 'unapplied-maintenance-freeze-candidate.sql',
 'unapplied-v3-api-bridge-after-r128.sql',
 'signed-old-sheet','signed-old-motion',
 'signed-v3-old-public-rpc','signed-owner-sheet-direct',
 'anonymous-new-v3-rpc','R136 preflight: R128 public schema fence not installed'
 ])assert.ok(runner.includes(str),str);
 assert.doesNotMatch(runner,/supabase\s+(db|link|migration|deploy)/);
});
test('R136 explicitly blocks deployment and retains complete V3 route and PostgREST prerequisites',()=>{
 const c=manifest.sourceOnlyCandidate;
 assert.equal(c.requiresSeparatePostgrestDataApiExposedSchemaConfiguration,true);
 assert.equal(c.realtimeOldSocketDeliveryStopped,false);
 assert.equal(c.realSignedHostedQaPassed,false);
 assert.equal(c.publicOldClientRpcReenabled,false);
 assert.deepEqual(manifest.unresolvedIssues,[220,223,229,231]);
 for(const w of ['NO_GO','R18-137','R18-128','PostgREST','Exposed schemas',
 '67','77','83','17','Storage','signed','movement','fog','public'])
  assert.ok(doc.toLowerCase().includes(w.toLowerCase()),w);
});
