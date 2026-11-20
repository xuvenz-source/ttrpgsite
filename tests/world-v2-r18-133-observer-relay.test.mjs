import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const read=p=>readFileSync(join(root,p),'utf8');
const base='staging/world-v2-b10-r18-133-observer-v3-relay/';
const sql=read(base+'unapplied-v3-observer-relay.sql');
const data=JSON.parse(read(base+'legacy-observer-sender-matrix.json'));
const manifest=JSON.parse(read(base+'manifest.json'));
const old=JSON.parse(read('staging/world-v2-b10-r18-129-rpc-stream-fog-audit/catalog-evidence.json'));
const before=read('tests/world-v2-r18-133-postgres/verify-observer-relay.sql');
const runner=read('tests/world-v2-r18-133-postgres/run.sh');
const doc=read('docs/testing/world-v2-r18-133-observer-relay-2026-11-20.md');

test('R133 is exact-child source-only, no hosted or app mutation and release NO_GO',()=>{
 assert.equal(manifest.workPackage,'B10-R18-133');
 assert.equal(manifest.parentPr,240);
 assert.equal(manifest.parentSha,'757bf053c4ee758b298ecea0e536ded2656fd5c1');
 assert.equal(manifest.decision,'NO_GO');
 assert.deepEqual(manifest.baselineR132,{dedicated:44669311394,
  standard:44669311308,combined:44669304992,allPassed:true});
 assert.equal(manifest.originalMigrationsReadOnly,83);
 assert.equal(manifest.qaMigrationsReadOnly,0);
 assert.equal(manifest.qaPublicApplicationTablesReadOnly,0);
 for(const key of ['noHostedWrites','noLiveSrcChanges','noVersionedMigrations',
  'noMerge','noDeploy','noPaidServices'])assert.equal(manifest[key],true,key);
 assert.equal(manifest.releaseAuthorized,false);
 assert.equal(manifest.sourceOnlyCandidate.originalSixSendersRewritten,false);
 assert.equal(manifest.sourceOnlyCandidate.originalV2SocketCutoffProven,false);
});
test('R133 six original SQL senders have exact R129 hashes and remain unreplaced',()=>{
 assert.equal(data.originalSixLegacyFunctions,6);
 assert.equal(data.realSenderReplacementsCompleted,0);
 assert.equal(data.legacyMotionPathFunctions,4);
 assert.equal(data.legacyVisionEngineFunctions,2);
 assert.equal(data.observerLegacyTopicFamilies,2);
 assert.equal(data.sourceFunctionCoverage.length,6);
 const hashes=new Map(old.realtimePublishers.map(x=>[x.name,x.sourceMd5]));
 assert.equal(old.realtimePublisherFunctionCount,7);
 for(const f of data.sourceFunctionCoverage){
  assert.equal(f.sourceMd5,hashes.get(f.name));
  assert.equal(f.currentlyCallsRealtimeSendDirectly,true);
  assert.equal(f.rewrittenToR133Relay,false);
  assert.equal(f.actualV3ClientExists,false);
  assert.equal(f.verifiedRealSignedRevocation,false);
  assert.match(f.requiredMigration,/LOS/);
 }
 assert.equal(new Set(data.sourceFunctionCoverage.map(x=>x.name)).size,6);
 assert.equal(new Set(data.sourceFunctionCoverage.map(x=>x.oldTopic)).size,2);
 assert.ok(data.sourceFunctionCoverage.every(x=>x.oldTopic.startsWith('forge-')));
 assert.equal(data.currentRelayRequiresSignedActor,true);
 assert.equal(data.originalSystemVisionCallerCount,4);
 assert.equal(data.liveOriginalEnabledSystemVisionTriggerCount,4);
 assert.equal(data.verifiedTriggerCallsFromOriginalCatalog,true);
 assert.equal(data.verifiedOriginalTriggerPaths.length,4);
 const triggers=new Set(data.verifiedOriginalTriggerPaths.map(x=>x.trigger));
 for(const t of ['world_v2_player_map_changed','world_v2_tool_light_change',
  'world_v2_campaign_map_changed','world_v2_token_roster_changed'])
  assert.ok(triggers.has(t));
 assert.ok(data.verifiedOriginalTriggerPaths.every(x=>/^[0-9a-f]{32}$/.test(x.sourceMd5)));

 assert.equal(data.systemInitiatedVisionNotYetSupported,true);
 const vision=data.sourceFunctionCoverage.find(f=>f.name==='forge_world_v2.bump_vision_epoch_v2');
 assert.equal(vision.potentialSystemOriginWithoutJwt,true);
 assert.equal(vision.requiresSeparateTrustedSystemSender,true);
 assert.equal(vision.staticOriginalCallers.length,4);
 assert.equal(data.oldV2SendersStoppedInProduction,false);
});
test('R133 private observer receive policy validates topic with epoch-scoped R125 predicate',()=>{
 assert.match(sql,/CREATE SCHEMA forge_observer_v3/);
 assert.match(sql,/REVOKE ALL ON SCHEMA forge_observer_v3/);
 assert.match(sql,/GRANT USAGE ON SCHEMA forge_observer_v3 TO authenticated/);
 assert.match(sql,/CREATE FUNCTION forge_observer_v3\.can_receive_observer_topic_v3/);
 assert.match(sql,/forge_scene_revoke\.can_receive_scene_topic_v3\(scene_topic\)/);
 assert.match(sql,/CREATE POLICY "R133 V3 recipient observer receive"/);
 assert.match(sql,/ON realtime\.messages FOR SELECT TO authenticated/);
 assert.match(sql,/SELECT realtime\.topic\(\)/);
 assert.match(sql,/p_topic !~ '\^forge-world-observer-v3:/);
 assert.match(sql,/GRANT EXECUTE ON FUNCTION[\s\S]*?can_receive_observer_topic_v3\(text\)[\s\S]*?TO authenticated/);
});
test('R133 server relay preserves current actor/member+map and recipient epoch check',()=>{
 const fn=sql.split('AS $dispatch$')[1]?.split('END $dispatch$')[0];
 assert.ok(fn);
 assert.match(sql,/CREATE FUNCTION forge_observer_v3\.dispatch_authorized_observer_v3\(/);
 assert.match(fn,/actor uuid:=auth\.uid\(\)/);
 assert.match(fn,/p_event IS NULL OR p_event NOT IN/);
 assert.match(fn,/pg_catalog\.pg_column_size\(p_payload\)>8192/);
 assert.match(fn,/p_payload->>'mapId' IS DISTINCT FROM p_map::text/);
 assert.match(fn,/p_payload->>'actor' IS DISTINCT FROM actor::text/);
 assert.match(fn,/p_payload->>'viewerId' IS DISTINCT FROM p_viewer::text/);
 assert.match(fn,/forge_scene_drain\.scene_v3_publish_allowed\(\)/);
 assert.match(fn,/FROM public\.campaign_members cm/);
 assert.match(fn,/cm\.user_id=actor/);
 assert.match(fn,/FOR SHARE/);
 assert.match(fn,/public\.can_view_campaign_map\(camp,p_map\)/);
 assert.match(fn,/forge_scene_revoke\.current_recipient_scene_topic_v3/);
 assert.match(fn,/PERFORM realtime\.send\(p_payload,p_event,private_topic,true\)/);
 assert.doesNotMatch(fn,/PERFORM realtime\.send\([^;]*forge-observer:/s);
 assert.doesNotMatch(fn,/PERFORM realtime\.send\([^;]*forge-world-v2:/s);
 assert.doesNotMatch(sql,/^\s*GRANT EXECUTE ON FUNCTION\s+forge_observer_v3\.dispatch_authorized_observer_v3/gmi);
 assert.match(sql,/REVOKE ALL ON FUNCTION[\s\S]*dispatch_authorized_observer_v3\(uuid,uuid,text,jsonb\)/);
});
test('R133 synthetic PG17 proves signed recipient, stale epoch, owner, foreign DM and null identity denial',()=>{
 for(const msg of [
 'R133 initial fenced mode emitted to observer','R133 V3 observer fanout not emitted',
 'R133 P2 receiver RLS denied legitimate topic',
 'R133 P1 impersonated P2 observer topic','R133 cross-campaign DM observed',
 'R133 invalid/foreign payload bypassed relay','R133 null actor',
 'R133 removed P2 received new V3 notice','R133 revoked P2 still passes',
 'R133 old observer epoch reused','R133 off-map P2',
 'R133 maintenance fence did not block observer',
 'R133 legacy unguarded bypass proof absent'
 ])assert.ok(before.includes(msg),msg);
 assert.match(before,/DELETE FROM public\.campaign_members/);
 assert.match(before,/INSERT INTO public\.campaign_members/);
 assert.match(before,/PERFORM realtime\.send\(/);
 assert.match(before,/forge-observer:/);
 assert.equal(before.includes('PERFORM_PLACEHOLDER_NOT_EXECUTED'),false);
});
test('R133 runner refuses remote DB, verifies old functionality, race and exact PG17 order',()=>{
 for(const key of [
  'GITHUB_ACTIONS','R133_ISOLATED','127.0.0.1',
  'world_v2_r18_133','r133_disposable_only','DATABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY','PGHOSTADDR','PGOPTIONS',
  'PGDATABASE','ON_ERROR_STOP'
 ])assert.ok(runner.includes(key),key);
 for(const path of [
  'world-v2-r18-125-postgres/setup.sql',
  'world-v2-r18-126-postgres/setup-scene.sql',
  'unapplied-scene-v3-prototype.sql',
  'unapplied-atomic-v3-scene-candidate.sql',
  'unapplied-scene-publication-drain.sql',
  'unapplied-v3-observer-relay.sql',
  'world-v2-r18-133-postgres/verify-observer-relay.sql'
 ])assert.ok(runner.includes(path),path);
 assert.match(runner,/R133_OBSERVER_LOCK_ACQUIRED/);
 assert.match(runner,/lock_timeout='250ms'/);
 assert.match(runner,/canceling statement due to lock timeout/);
 assert.doesNotMatch(runner,/supabase\s+(db|link|migration|deploy)/);
});
test('R133 explicitly leaves six SQL senders, live WebSockets and signed URLs UNRESOLVED',()=>{
 const c=manifest.sourceOnlyCandidate;
 for(const key of ['originalSixSendersRewritten',
  'legitimateV3NetworkSocketsVerified','originalHostedSqlChanged',
  'productionFrontendChanged','originalV2SocketCutoffProven',
  'storageSignedUrlsRevoked','everApprovesProduction'])assert.equal(c[key],false,key);
 assert.equal(c.verifiesActualTokenLOS,false);
 assert.equal(data.realSenderReplacementsCompleted,0);
 assert.deepEqual(manifest.unresolvedIssues,[220,223,229,231]);
 for(const token of ['NO_GO','six','83','67','R18-134',
  'already','unapplied','reinstatement','Storage','Postgres Changes'])
  assert.ok(doc.toLowerCase().includes(token.toLowerCase()),token);
});
