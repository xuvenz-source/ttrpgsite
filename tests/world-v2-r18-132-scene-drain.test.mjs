import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const read=p=>readFileSync(join(root,p),'utf8');
const base='staging/world-v2-b10-r18-132-scene-publisher-drain/';
const sql=read(base+'unapplied-scene-publication-drain.sql');
const evidence=JSON.parse(read(base+'sender-coverage.json'));
const manifest=JSON.parse(read(base+'manifest.json'));
const original=JSON.parse(read('staging/world-v2-b10-r18-129-rpc-stream-fog-audit/catalog-evidence.json'));
const synthetic=read('tests/world-v2-r18-132-postgres/verify-scene-drain.sql');
const runner=read('tests/world-v2-r18-132-postgres/run.sh');
const doc=read('docs/testing/world-v2-r18-132-server-publisher-drain-2026-11-20.md');

test('R132 is source-only, pinned exactly to R131 and cannot authorize release',()=>{
 assert.equal(manifest.workPackage,'B10-R18-132');
 assert.equal(manifest.parentPr,239);
 assert.equal(manifest.parentSha,'0741b11e59b151321129a7a3e9d33bb541c29db4');
 assert.equal(manifest.decision,'NO_GO');
 assert.equal(manifest.originalMigrationsObserved,83);
 assert.equal(manifest.qaMigrationsObserved,0);
 assert.equal(manifest.qaApplicationTablesObserved,0);
 for(const k of ['noHostedSqlWrites','noLiveSrcChanges','noVersionedMigrations',
  'noMerge','noDeploy','noPaidResources'])assert.equal(manifest[k],true,k);
 assert.equal(manifest.productionReleaseAuthorized,false);
 assert.equal(manifest.sourceOnlyCandidate.installableVersionedMigration,false);
 assert.equal(manifest.sourceOnlyCandidate.liveSystemTotalStreamCutoffAchieved,false);
});
test('R132 preserves all 7 original direct SQL emitter hashes and exposes six uncovered senders',()=>{
 assert.equal(evidence.directRealtimeSqlSenderCount,7);
 assert.equal(evidence.syntheticSceneGuardedCount,1);
 assert.equal(evidence.uncoveredDirectSenderCount,6);
 assert.equal(evidence.senders.length,7);
 const pin=new Map(original.realtimePublishers.map(x=>[x.name,x.sourceMd5]));
 for(const source of evidence.senders){
  assert.equal(source.sourceMd5,pin.get(source.name),source.name);
  assert.equal(source.realLiveFunctionModified,false);
  assert.equal(source.guardedByR132SyntheticCandidate,
   source.name==='forge_world_v2.bump_scene_publication_v2');
 }
 assert.equal(evidence.operationalCutoverProven,false);
 assert.equal(evidence.joinedOldSocketRevoked,false);
 assert.equal(evidence.realAuthenticatedRecipientsTested,false);
 assert.equal(evidence.full7SqlEmitterReviewComplete,false);
});
test('R132 isolated transport gate is private and defaults safely fenced',()=>{
 assert.match(sql,/BEGIN;/);
 assert.match(sql,/CREATE SCHEMA forge_scene_drain/);
 assert.match(sql,/REVOKE ALL ON SCHEMA forge_scene_drain FROM PUBLIC,anon,authenticated/);
 assert.match(sql,/CREATE TABLE forge_scene_drain\.scene_publication_gate/);
 assert.match(sql,/CHECK\(mode IN \('fenced','v3-only'\)\)/);
 assert.match(sql,/VALUES\(true,'fenced'\)/);
 assert.match(sql,/REVOKE ALL ON forge_scene_drain\.scene_publication_gate/);
 assert.match(sql,/CREATE FUNCTION forge_scene_drain\.scene_v3_publish_allowed\(\)/);
 assert.match(sql,/SECURITY DEFINER SET search_path=''/);
 assert.match(sql,/FOR SHARE;/);
 assert.match(sql,/RETURN coalesce\(current_mode='v3-only',false\)/);
 assert.doesNotMatch(sql,/^\s*GRANT .* TO (anon|authenticated)/gmi);
 assert.doesNotMatch(sql,/^\s*ALTER ROLE\b/gmi);
 assert.doesNotMatch(sql,/^\s*CREATE POLICY\b/gmi);
 assert.match(sql,/COMMIT;/);
});
test('R132 gated publisher preserves bigint generation but never falls back to V2',()=>{
 const fn=sql.split('AS $publisher$')[1]?.split('END $publisher$')[0];
 assert.ok(fn);
 assert.match(sql,/CREATE OR REPLACE FUNCTION forge_world_v2\.bump_scene_publication_v2\(p_map uuid\)\s*RETURNS bigint/);
 assert.match(fn,/allowed:=forge_scene_drain\.scene_v3_publish_allowed\(\)/);
 assert.match(fn,/ON CONFLICT\(map_id\) DO UPDATE SET/);
 assert.match(fn,/RETURNING generation INTO next_generation/);
 assert.match(fn,/IF allowed IS NOT TRUE THEN RETURN next_generation;END IF;/);
 assert.match(fn,/forge_scene_revoke\.current_recipient_scene_topic_v3/);
 assert.match(fn,/recipient_topic IS NULL THEN CONTINUE/);
 assert.match(fn,/PERFORM realtime\.send/);
 assert.match(fn,/scene-revision-v2',recipient_topic,true/);
 assert.doesNotMatch(fn,/PERFORM realtime\.send\([^;]*'forge-world-scene-v2:/s);
 assert.doesNotMatch(fn,/FOR recipient IN[\s\S]*public\.can_view_campaign_map\(/);
 assert.match(fn,/EXCEPTION WHEN OTHERS THEN[\s\S]*RAISE WARNING/);
});
test('R132 synthetic PG17 tests current V3 recipients, revoked actors and persist-fenced generation',()=>{
 for(const name of [
  'R132 gate did not default to fenced','R132 closed gate emitted',
  "SET mode='v3-only'","SET mode='fenced'",
  'R132 active V3 fanout not three recipients','R132 removed P1',
  'R132 fenced publisher still emits after close','R132 rejoined player retained old epoch',
  'R132 old epoch still passes fresh channel RLS',
  'R132 unguarded bypass negative control missing'
 ])assert.ok(synthetic.includes(name),name);
 assert.match(synthetic,/DELETE FROM public\.campaign_members/);
 assert.match(synthetic,/INSERT INTO public\.campaign_members/);
 assert.match(synthetic,/PERFORM realtime\.send/); // deliberate bypass, NOT protected
 assert.match(synthetic,/forge-world-scene-v2:/);
});
test('R132 isolated runner refuses remote connections and tests transaction-lock ordering',()=>{
 for(const key of [
  'GITHUB_ACTIONS','R132_ISOLATED','127.0.0.1','world_v2_r18_132',
  'r132_disposable_only','DATABASE_URL','SUPABASE_SERVICE_ROLE_KEY',
  'PGHOSTADDR','PGOPTIONS','ON_ERROR_STOP'
 ])assert.ok(runner.includes(key),key);
 for(const path of [
  'world-v2-r18-125-postgres/setup.sql','world-v2-r18-126-postgres/setup-scene.sql',
  'world-v2-b10-r18-125-private-scene-revocation/unapplied-scene-v3-prototype.sql',
  'world-v2-b10-r18-126-scene-v3-cutover-contract/unapplied-atomic-v3-scene-candidate.sql',
  'unapplied-scene-publication-drain.sql',
  'world-v2-r18-132-postgres/verify-scene-drain.sql'
 ])assert.ok(runner.includes(path),path);
 assert.match(runner,/SET lock_timeout = '250ms'/);
 assert.match(runner,/SELECT CASE WHEN forge_scene_drain\.scene_v3_publish_allowed/);
 assert.match(runner,/R132_GATE_LOCK_ACQUIRED/);
 assert.match(runner,/canceling statement due to lock timeout/);
 assert.match(runner,/wait "\$holder_pid"/);
 assert.match(runner,/violates check constraint/);
 assert.doesNotMatch(runner,/supabase\s+(db|link|migration|deploy)/);
});
test('R132 documents and retains full remaining old socket, privilege, Storage and free-tier risk',()=>{
 const c=manifest.sourceOnlyCandidate;
 for(const field of [
  'existingRealtimeSocketsDisconnected','pendingRealtimeNetworkPacketsPurged',
  'liveSystemTotalStreamCutoffAchieved'
 ])assert.equal(c[field],false,field);
 assert.equal(c.guardedPublisherCountInSyntheticCandidate,1);
 assert.equal(c.otherDirectSqlRealtimePublisherCountNotGuarded,6);
 assert.equal(c.explicitUnguardedSendBypassDemonstrated,true);
 assert.equal(manifest.tests.realSignedQa??'NOT_RUN','NOT_RUN');
 assert.deepEqual(manifest.unresolvedIssues,[220,223,229,231]);
 for(const word of ['NO-GO','seven','six','already-connected','FOR SHARE',
  'Postgres Changes','R18-133','83','67','Storage','#231','schema restrictions'])
  assert.ok(doc.toLowerCase().includes(word.toLowerCase()),word);
});
