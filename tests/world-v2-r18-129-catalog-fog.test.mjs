import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {dirname,resolve,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {R129_LIVE_ENABLED,verifyCatalogDrift}
 from '../staging/world-v2-b10-r18-129-rpc-stream-fog-audit/CatalogDriftGate.mjs';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const read=path=>readFileSync(join(root,path),'utf8');
const base='staging/world-v2-b10-r18-129-rpc-stream-fog-audit/';
const audit=JSON.parse(read(base+'catalog-evidence.json'));
const manifest=JSON.parse(read(base+'manifest.json'));
const sql=read(base+'unapplied-fog-published-auth-guard.sql');
const before=read('tests/world-v2-r18-129-postgres/verify-before.sql');
const after=read('tests/world-v2-r18-129-postgres/verify-after.sql');
const fixture=read('tests/world-v2-r18-129-postgres/setup-fog.sql');
const runner=read('tests/world-v2-r18-129-postgres/run.sh');
const recheck=read(base+'read-only-catalog-recheck.sql');
const doc=read('docs/testing/world-v2-r18-129-privileged-stream-fog-audit-2026-11-19.md');

test('R129 is pinned source-only, with complete release NO_GO boundaries',()=>{
 assert.equal(R129_LIVE_ENABLED,false);
 assert.equal(manifest.workPackage,'B10-R18-129');
 assert.equal(manifest.parentPr,236);
 assert.equal(manifest.parentSha,'ff63103b4767057fe2165503e35d8f75f9a9ed41');
 assert.equal(manifest.originalMigrationsObserved,83);
 assert.equal(manifest.qaMigrationsObserved,0);
 assert.equal(manifest.qaApplicationTablesObserved,0);
 assert.equal(manifest.decision,'NO_GO');
 assert.equal(manifest.productionReleaseAuthorized,false);
 for(const flag of ['noHostedSqlWrites','noLiveSourceChanges','noVersionedMigrations',
  'noMerge','noDeploy','noPaidResources'])assert.equal(manifest[flag],true,flag);
});
test('R129 metadata-only catalog is exactly 67/15 public entrypoints, 7 emitters, 17 published feeds',()=>{
 assert.equal(audit.publicSecurityDefinerAuthenticatedCallableCount,67);
 assert.equal(audit.directGuardTextAbsentCount,15);
 assert.equal(audit.directGuardTextAbsent.length,15);
 assert.equal(new Set(audit.directGuardTextAbsent.map(x=>x.name)).size,15);
 assert.equal(audit.realtimePublisherFunctionCount,7);
 assert.equal(audit.realtimePublishers.length,7);
 assert.equal(new Set(audit.realtimePublishers.map(x=>x.name)).size,7);
 assert.equal(audit.realtimePublicationTableCount,17);
 assert.equal(audit.supabaseRealtimePublicationTables.length,17);
 assert.equal(new Set(audit.supabaseRealtimePublicationTables).size,17);
 assert.equal(audit.publicationRlsEnabledForAll17,true);
 assert.equal(audit.campaignMembersPublished,false);
 assert.deepEqual(audit.authSelectPrivilegeMissingOn,['map_tokens']);
 assert.deepEqual(audit.realtimeMessagesPolicyCounts,{select:5,insert:1});
 assert.deepEqual(audit.authHasSchemaUsage,{public:true,forge_world_v2:false,forge_visibility:false});
 for(const arr of [audit.directGuardTextAbsent,audit.realtimePublishers]){
  for(const value of arr)assert.match(value.sourceMd5,/^[0-9a-f]{32}$/);
 }
});
test('R129 catalog gate matching never grants production or real-socket security',()=>{
 const match=verifyCatalogDrift(audit,structuredClone(audit));
 assert.equal(match.status,'CATALOG_METADATA_MATCH_NO_GO');
 assert.equal(match.catalogParity,true);
 assert.equal(match.securityReleaseAuthorized,false);
 assert.equal(match.hostedActionPerformed,false);
 assert.equal(match.privilegedRpcChainsProven,false);
 assert.equal(match.realtimeConnectedSocketsProvenRevoked,false);
 assert.equal(match.signedUserQaProven,false);
 assert.deepEqual(match.problems,[]);
});
test('R129 catalog drift denies missing functions, changed source, publications, schema ACL and stream policy',()=>{
 const cases=[
  snap=>{snap.directGuardTextAbsent[0].sourceMd5='0'.repeat(32)},
  snap=>{snap.directGuardTextAbsent.splice(0,1)},
  snap=>{snap.realtimePublishers[0].sourceMd5='f'.repeat(32)},
  snap=>{snap.realtimePublishers.push({name:'public.unreviewed_sender',sourceMd5:'a'.repeat(32),schema:'public'})},
  snap=>{snap.supabaseRealtimePublicationTables.push('campaign_members')},
  snap=>{snap.supabaseRealtimePublicationTables.splice(0,1)},
  snap=>{snap.authHasSchemaUsage.forge_visibility=true},
  snap=>{snap.publicationRlsEnabledForAll17=false},
  snap=>{snap.realtimeMessagesPolicyCounts.select=7},
  snap=>{snap.originalV2SharedScenePolicyExists=false},
  snap=>{snap.fogMetadataOracle.originalSourceMd5='f'.repeat(32)},
  snap=>{snap.originalProjectRef='wrong-project'},
  snap=>{snap.publicSecurityDefinerAuthenticatedCallableCount=66}
 ];
 for(const mutate of cases){
  const next=structuredClone(audit);mutate(next);
  const result=verifyCatalogDrift(audit,next);
  assert.equal(result.status,'CATALOG_DRIFT_NO_GO');
  assert.equal(result.catalogParity,false);
  assert.equal(result.securityReleaseAuthorized,false);
  assert.ok(result.problems.length>0);
 }
 assert.equal(verifyCatalogDrift(null,structuredClone(audit)).status,'CATALOG_UNVERIFIED');
});
test('R129 original fog metadata oracle reproduces genuine read-only observed helper',()=>{
 assert.match(fixture,/CREATE FUNCTION public\.is_map_fog_published\(p_map uuid\)/);
 assert.match(fixture,/STABLE SECURITY DEFINER SET search_path=''/);
 assert.match(fixture,/SELECT EXISTS \(SELECT 1 FROM forge_visibility\.map_rules/);
 assert.doesNotMatch(fixture,/public\.can_view_campaign_map/);
 assert.match(before,/old cross-campaign fog bit gap not reproduced/);
 assert.match(before,/old removed-member fog bit gap not reproduced/);
 assert.match(before,/DELETE FROM public\.campaign_members/);
 assert.equal(audit.fogMetadataOracle.authenticatedCanExecute,true);
 assert.equal(audit.fogMetadataOracle.anonymousCanExecute,false);
 assert.equal(audit.fogMetadataOracle.directMembershipOrMapAuthorizationCheck,false);
 assert.equal(audit.fogMetadataOracle.originalSourceMd5,'8841970de390b1eaef9dbd0f0886ed81');
});
test('R129 unapplied correction denies metadata without changing signed actor or return shape',()=>{
 assert.match(sql,/CREATE OR REPLACE FUNCTION public\.is_map_fog_published\(p_map uuid\)/);
 assert.match(sql,/RETURNS boolean/);
 assert.match(sql,/STABLE SECURITY DEFINER SET search_path=''/);
 assert.match(sql,/auth\.uid\(\) IS NOT NULL/);
 assert.match(sql,/p_map IS NOT NULL/);
 assert.match(sql,/public\.battle_maps bm/);
 assert.match(sql,/public\.can_view_campaign_map\(bm\.campaign_id,bm\.id\)/);
 assert.match(sql,/forge_visibility\.map_rules r/);
 assert.match(sql,/r\.fog_enforced/);
 assert.doesNotMatch(sql,/\bGRANT EXECUTE\b/);
 assert.doesNotMatch(sql,/realtime\.send\s*\(/);
 assert.match(after,/revoked P1 still sees fog metadata/);
 assert.match(after,/outsider DM still sees foreign fog bit/);
 assert.match(after,/P2 off-map fog bit not denied/);
 assert.match(after,/NULL auth actor sees fog bit/);
 assert.match(after,/reinstated P1 not restored/);
 assert.match(after,/DM false fog flag regressed/);
});
test('R129 disposable PG17 runner uses no hosted credentials and asserts three ACL denial boundaries',()=>{
 for(const value of ['GITHUB_ACTIONS','R129_ISOLATED','127.0.0.1','world_v2_r18_129',
  'r129_disposable_only','SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY','PGHOSTADDR','PGOPTIONS'])
  assert.ok(runner.includes(value),value);
 for(const value of ['anon-fog-helper','signed-direct-private-rules','signed-direct-membership',
 'verify-before.sql','verify-after.sql','unapplied-fog-published-auth-guard.sql'])
  assert.ok(runner.includes(value),value);
 assert.doesNotMatch(runner,/supabase\s+(db|link|migration|deploy)/);
});
test('R129 future catalog recheck reads only metadata, never private user rows or schema writes',()=>{
 assert.match(recheck,/pg_proc/);
 assert.match(recheck,/pg_publication_tables/);
 assert.match(recheck,/pg_policies/);
 assert.match(recheck,/has_schema_privilege/);
 assert.match(recheck,/md5\(pg_get_functiondef/);
 assert.doesNotMatch(recheck,/^\s*(CREATE|ALTER|DROP|INSERT|UPDATE|DELETE|TRUNCATE|GRANT|REVOKE|COPY|DO)\b/gmi);
});
test('R129 handoff distinguishes confirmed oracle from speculative 15, and leaves streams unresolved',()=>{
 for(const str of ['15','67','17','seven','private','Postgres Changes','not a complete',
 'NO-GO','#231','no live leak','read-only'])
  assert.ok(doc.toLowerCase().includes(str.toLowerCase()),str);
 assert.equal(manifest.explicitRisks.liveFunctionGuardPatched,false);
 assert.equal(manifest.explicitRisks.existingRealtimeSocketsRevoked,false);
 assert.equal(manifest.explicitRisks.all67PrivilegedRpcChainsReviewed,false);
 assert.equal(manifest.explicitRisks.fullRealtimePostgresChangesSubscriberAndLeakReview,false);
 assert.equal(manifest.explicitRisks.storagePreviouslySignedUrlRevoked,false);
});
