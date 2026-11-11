import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const plan=JSON.parse(read('staging/world-v2-b10-r05-release-plan.json'));
const migration=read(plan.exactMigration);

test('R05 official CLI name, all five frozen candidate bodies and source order',()=>{
 assert.equal(plan.cliProvenance.version,'2.81.3');
 assert.equal(plan.cliProvenance.actionsRun,42946657992);
 assert.equal(plan.exactMigration,'supabase/migrations/20261111023204_world_v2_b10_integrated_motion.sql');
 assert.equal(plan.sourceCandidates.length,5);
 let previous=-1;
 for(const [index,path] of plan.sourceCandidates.entries()){
  const original=read(path).trimEnd();
  const offset=migration.indexOf(original);
  assert.ok(offset>previous&&offset>=0,path+' must be included, verbatim, in order');
  assert.equal(migration.indexOf(original,offset+1),-1,
   path+' must not be doubly installed');
  assert.match(migration,new RegExp('R05 SOURCE '+(index+1)+'/5'));
  previous=offset;
 }
 assert.doesNotMatch(migration,/(?:^|\n)\\(?:i|include)\s/m);
 assert.doesNotMatch(migration,/pg-delta: transaction=false/);
});

test('R05 migration fails closed and does not grant browser access to private authority',()=>{
 assert.match(migration,/R05 stop: partial B03\/B07\/B08\/R01\/R03 install already present/);
 assert.match(migration,/R05 stop: % active movement sessions/);
 assert.match(migration,/R05 stop: private RLS or RPC grants regression/);
 assert.match(migration,/R05 stop: authority, canonical Commit or hide-only terminal retirement/);
 assert.match(migration,/CREATE TABLE forge_world_v2\.motion_r05_function_backup/);
 assert.match(migration,/ALTER TABLE forge_world_v2\.motion_r05_function_backup ENABLE ROW LEVEL SECURITY/);
 assert.match(migration,/REVOKE ALL ON TABLE forge_world_v2\.motion_r05_function_backup/);
 assert.match(migration,/SELECT x\.signature,pg_get_functiondef\(to_regprocedure\(x\.signature\)\)/);
 assert.match(migration,/\(SELECT count\(\*\) FROM forge_world_v2\.motion_r05_function_backup\)<>4/);
 assert.doesNotMatch(migration,/CREATE OR REPLACE FUNCTION public\.get_world_visibility_v2\(/);
 assert.doesNotMatch(migration,/CREATE POLICY.*USING \(true\)/i);
});

test('R05 source-backed postcommit recovery is explicit, manual and transactional',()=>{
 const restore=read(plan.postCommitRecovery);
 assert.match(restore,/^BEGIN;/m);
 assert.match(restore,/^COMMIT;/m);
 assert.match(restore,/old_definition,original_digest INTO src,digest/);
 assert.match(restore,/EXECUTE src;/);
 assert.match(restore,/md5\(current_body\)<>digest/);
 assert.match(restore,/DELETE FROM forge_world_v2\.observer_pending_b07/);
 assert.match(restore,/has_function_privilege\('anon'/);
 assert.doesNotMatch(restore,/DROP TABLE|DROP SCHEMA|DROP POLICY|DELETE FROM supabase_migrations|INSERT INTO supabase_migrations/i);
 const prep=read(plan.readOnlyLivePreflight);
 assert.match(prep,/20261109171247/);
 assert.match(prep,/migration_count<>83/);
 assert.match(prep,/md5\(pg_get_functiondef\(to_regprocedure\(expected\.signature\)\)\)/);
 assert.doesNotMatch(prep,/CREATE TABLE|ALTER TABLE|DROP TABLE|INSERT INTO|DELETE FROM/i);
});

test('R05 isolated PG17 test uses separate fresh DB, full rollback and committed recovery',()=>{
 const launch=read('tests/world-v2-b10-postgres/rehearse-r05.sh');
 const fixture=read('tests/world-v2-b10-postgres/versioned-release-r05.sql');
 const run=read('tests/world-v2-b10-postgres/run.sh');
 assert.match(launch,/WORLD_V2_B10_ISOLATED/);
 assert.match(launch,/PGDATABASE:-/);
 assert.match(launch,/PGHOST:-/);
 assert.match(launch,/world_v2_b10_r05/);
 assert.match(launch,/extract_original_commit_r05.py/);
 assert.match(launch,/createdb "\$r05db"/);
 assert.match(run,/rehearse-r05\.sh/);
 for(const name of ['R05-01','R05-02','R05-03','R05-04'])
  assert.match(fixture,new RegExp(name));
 assert.match(fixture,/^ROLLBACK;/m);
 assert.match(fixture,/^COMMIT;/m);
 assert.match(fixture,/world_v2_b10_r05_restore_original_authority/);
 assert.match(fixture,/original source/);
});

test('R05 remains gated: original live migration history cannot be batch-replayed',()=>{
 assert.equal(plan.state,'STAGED_UNAPPLIED');
 assert.equal(plan.deploymentDecision,'NO_GO');
 assert.equal(plan.liveSourceAudit.baselineAppliedMigrationCount,83);
 assert.equal(plan.liveSourceAudit.repositoryVersionedFiles,56);
 assert.equal(plan.liveSourceAudit.exactVersionMatches,20);
 assert.equal(plan.liveSourceAudit.blindDbPushAllowed,false);
 assert.equal(plan.rehearsalEvidence.liveAuthSignedThreeAccounts,'NOT_RUN');
 assert.equal(plan.rehearsalEvidence.collisionFogHiddenNPC24Cases,'NOT_RUN');
 const gate=JSON.parse(read('staging/world-v2-b10-release-qualification.json'));
 assert.equal(gate.decision,'NO_GO');
 assert.equal(gate.stagedRemediations?.B10_R05?.status,'STAGED_VERSIONED_NONAPPLIED');
 assert.equal(gate.sourceLimitations.manualScenarioCount,24);
 assert.equal(plan.startupFlags.VITE_WORLD_V2_COMMIT_RECONCILE,'OFF until SQL and signed Auth QA');
});
