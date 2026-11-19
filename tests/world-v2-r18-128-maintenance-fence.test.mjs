import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {dirname,resolve,join} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const read=p=>readFileSync(join(root,p),'utf8');
const base='staging/world-v2-b10-r18-128-server-maintenance-fence/';
const manifest=JSON.parse(read(base+'manifest.json'));
const sql=read(base+'unapplied-maintenance-freeze-candidate.sql');
const setup=read('tests/world-v2-r18-128-postgres/setup-legacy.sql');
const before=read('tests/world-v2-r18-128-postgres/verify-before.sql');
const after=read('tests/world-v2-r18-128-postgres/verify-after.sql');
const run=read('tests/world-v2-r18-128-postgres/run.sh');
const doc=read('docs/testing/world-v2-r18-128-server-maintenance-fence-2026-11-19.md');

test('R128 is pinned to exact R127 source, preserves database isolation and NO_GO',()=>{
 assert.equal(manifest.workPackage,'B10-R18-128');
 assert.equal(manifest.parentPr,235);
 assert.equal(manifest.parentSha,'fbc470e3ec54972ba17600ab0fc5a0ea06d2e3b2');
 assert.equal(manifest.originalMigrationCountObserved,83);
 assert.equal(manifest.qaMigrationCountObserved,0);
 assert.equal(manifest.qaPublicApplicationTableCountObserved,0);
 assert.equal(manifest.decision,'NO_GO');
 for(const name of ['noHostedSqlWrites','noLiveSourceChanges','noVersionedMigrations','noMerge','noDeploy','noPaidResources'])
  assert.equal(manifest[name],true,name);
 assert.equal(manifest.productionReleaseAuthorized,false);
});
test('R128 uses a single disruptive transaction with ordered scene counter lock',()=>{
 assert.match(sql,/BEGIN;/);
 assert.match(sql,/LOCK TABLE forge_world_v2\.scene_publications IN ACCESS EXCLUSIVE MODE;/);
 assert.match(sql,/CREATE OR REPLACE FUNCTION forge_world_v2\.bump_scene_publication_v2\(p_map uuid\)/);
 assert.match(sql,/ON CONFLICT\(map_id\) DO UPDATE SET/);
 assert.match(sql,/RETURNING generation INTO new_gen/);
 assert.match(sql,/RETURN new_gen/);
 const functionBody=sql.split('AS $freeze$')[1].split('END $freeze$')[0];
 assert.doesNotMatch(functionBody,/realtime\.send\s*\(/i);
 assert.doesNotMatch(functionBody,/forge-world-scene-v2:/i);
 assert.match(sql,/REVOKE USAGE ON SCHEMA public FROM PUBLIC,anon,authenticated;/);
 assert.match(sql,/COMMIT;/);
});
test('R128 never reopens old APIs or treats an unsigned client version as authorization',()=>{
 assert.doesNotMatch(sql,/^\s*GRANT USAGE ON SCHEMA public/mi);
 assert.doesNotMatch(sql,/CREATE POLICY.*allow.*legacy/i);
 assert.doesNotMatch(sql,/request\.jwt\.claim\.version/);
 assert.match(doc,/A mere browser version string/i);
 assert.match(doc,/both V2 and any future V3 public APIs/i);
});
test('R128 replicates live access to RLS ownership and public definer before denial',()=>{
 assert.match(setup,/CREATE POLICY "R128 owner sheet read"/);
 assert.match(setup,/CREATE FUNCTION public\.r128_legacy_sheet_rpc/);
 assert.match(setup,/CREATE FUNCTION public\.r128_legacy_motion_rpc/);
 assert.match(setup,/CREATE FUNCTION forge_world_v2\.r128_private_schema_bypass_fixture/);
 assert.match(setup,/GRANT EXECUTE ON FUNCTION forge_world_v2\.r128_private_schema_bypass_fixture/);
 assert.match(setup,/PERFORM realtime\.send/);
 assert.match(before,/SET LOCAL ROLE authenticated/);
 assert.match(before,/r128_legacy_sheet_rpc/);
 assert.match(before,/r128_legacy_motion_rpc/);
 assert.match(before,/old map-wide scene publisher not reproduced/);
});
test('R128 after proof is narrow: same actor public denies, old private and Realtime persist',()=>{
 assert.match(after,/maintenance quiescence broke scene generation/);
 assert.match(after,/shared scene sender emitted during freeze/);
 assert.match(after,/private-schema bypass illustration missing/);
 assert.match(after,/cached Realtime scope remains/);
 assert.match(after,/SET LOCAL ROLE authenticated/);
 for(const name of ['p1-legacy-sheet-rpc','p1-legacy-movement-rpc',
 'p1-owner-table','anon-campaign-table','p1-old-membership-rpc'])
  assert.ok(run.includes(name),name);
});
test('R128 synthetic runner refuses remote Supabase, nonlocal databases and impersonated CI',()=>{
 for(const key of ['GITHUB_ACTIONS','R128_ISOLATED','127.0.0.1',
  'world_v2_r18_128','r128_disposable_only','DATABASE_URL','SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY','PGHOSTADDR','PGOPTIONS'])
  assert.ok(run.includes(key),key);
 assert.match(run,/world-v2-r18-125-postgres\/setup\.sql/);
 assert.match(run,/world-v2-r18-126-postgres\/setup-scene\.sql/);
 assert.match(run,/unapplied-maintenance-freeze-candidate\.sql/);
 assert.doesNotMatch(run,/supabase\s+(?:db|link|migration|deploy)/);
});
test('R128 does not claim complete public/private/Realtime/Storage fence',()=>{
 const a=manifest.sourceOnlyCandidate;
 assert.equal(a.realClientAccessFenceCompleted,false);
 assert.equal(a.allRealtimeStreamPublishersQuiesced,false);
 assert.equal(a.privateSchemaDefinerRemainsCallableInSyntheticFixture,true);
 assert.equal(a.realtimePreviouslyJoinedReceiverStillAuthorizedInSyntheticFixture,true);
 assert.equal(a.all67PrivilegedRpcChainsProven,false);
 assert.equal(a.all83OriginalMigrationBodiesReviewed,false);
 assert.equal(a.preissuedSignedUrlsRevoked,false);
 assert.equal(a.actualHostedOrSignedQaPerformed,false);
 assert.equal(manifest.readOnlyOriginalAuthAudit.authenticatedCallablePublicSecurityDefiners,67);
 assert.equal(manifest.readOnlyOriginalAuthAudit.publicDefinersWithoutAnyOfThoseFourDirectTextMatches,15);
 assert.deepEqual(manifest.unresolvedIssues,[220,223,229,231]);
 for(const term of ['NO-GO','67','83','#231','Realtime','private-schema',
 'source-only','not a universal RPC fence'])
 assert.ok(doc.toLowerCase().includes(term.toLowerCase()),term);
});
