import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';

// Frozen from the reviewed B10-R05 PR #90 at b2267a2f. These Git blob
// digests ensure a newer production branch never silently rewrites the
// already-tested authority or its recovery/preflight scripts.
const frozen=Object.freeze({
 'supabase/migrations/20261111023204_world_v2_b10_integrated_motion.sql':
  'f4e296725c09055685321726cbe4bc6e09dbce5a',
 'supabase/release-preflight/world_v2_b10_r05_exact_live_catalog.sql':
  '85cbc156f53db854022595d5fad38c011dd7fbe3',
 'supabase/release-recovery/world_v2_b10_r05_restore_original_authority.sql':
  '6ac61955740fad531b23728a1527b2a6f860e4b6',
 'supabase/candidates/world_v2_b03_path_validation.sql':
  '4f35859f2e8b16fbc875a5f3b9701c80bde543e7',
 'supabase/candidates/world_v2_b07_private_observer_budget.sql':
  '4e00a50dba4e8b78b4c151eaf1840db42e34be87',
 'supabase/candidates/world_v2_b08_commit_reconciliation.sql':
  'ccaca6100c388ce5d2af45ee693e421392fbdad7',
 'supabase/candidates/world_v2_b10_r01_core_path_integration.sql':
  '08d06822582d6e1e878fc68ef09db3e2874ce1f0',
 'supabase/candidates/world_v2_b10_r03_terminal_queue_retirement.sql':
  '40a3e7127878a648822ca097713d53c05e840587'
});
const source=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
function blobSha(text){
 const body=Buffer.from(text,'utf8');
 return createHash('sha1').update(Buffer.from('blob '+body.length+'\0'))
  .update(body).digest('hex');
}
test('R18-03 every ported authority and recovery file exactly matches reviewed R05 candidate',()=>{
 for(const [path,digest] of Object.entries(frozen))
  assert.equal(blobSha(source(path)),digest,
   'Reviewed authority source drift: '+path);
});
test('R18-03 preserves atomic canonical Commit, exact ACK replay and checked R03 queue retirement',()=>{
 const bundle=source('supabase/migrations/20261111023204_world_v2_b10_integrated_motion.sql');
 assert.match(bundle,/CREATE OR REPLACE FUNCTION public\.commit_world_motion_v2\(/i);
 assert.match(bundle,/last_commit_request_b08/);
 assert.match(bundle,/last_advance_request_b08/);
 assert.match(bundle,/commit_checkpoints/);
 assert.match(bundle,/session_valid\(s\)/);
 assert.match(bundle,/SELECT e\.live INTO scene/);
 assert.match(bundle,/step_allowed\(/);
 assert.match(bundle,/status='committed'/);
 assert.match(bundle,/CREATE OR REPLACE FUNCTION forge_world_v2\.drain_committed_observers_b08\(/);
 const sections=bundle.split(/CREATE OR REPLACE FUNCTION forge_world_v2\.drain_committed_observers_b08\(/i);
 assert.equal(sections.length,3,'B08 and overriding R03 terminal implementations must coexist in order');
 const terminal=sections.at(-1);
 assert.match(terminal,/FOR pending_row IN[\s\S]*?FOR UPDATE/);
 assert.match(terminal,/jsonb_array_elements\(pending_row\.pending\)/);
 assert.match(terminal,/jsonb_array_elements\(pending_row\.deferred\)/);
 assert.match(terminal,/v\.item->>'action'='hide'/);
 assert.match(terminal,/SET pending=hides,deferred='\[\]'::jsonb/);
 assert.match(terminal,/forge_world_v2\.flush_recipient_observer_b07\(/);
 assert.match(terminal,/REVOKE ALL ON FUNCTION forge_world_v2\.drain_committed_observers_b08/);
});
test('R18-03 no new public read of private FIFO or observer budget, and no out-of-band SQL application',()=>{
 const r03=source('supabase/candidates/world_v2_b10_r03_terminal_queue_retirement.sql');
 const b07=source('supabase/candidates/world_v2_b07_private_observer_budget.sql');
 const run=source('tests/world-v2-b10-postgres/run.sh');
 const workflow=source('.github/workflows/world-v2-b10-integrated.yml');
 assert.match(b07,/ALTER TABLE forge_world_v2\.observer_pending_b07 ENABLE ROW LEVEL SECURITY/i);
 assert.match(b07,/REVOKE ALL ON TABLE forge_world_v2\.observer_pending_b07/i);
 assert.match(b07,/REVOKE ALL ON TABLE forge_world_v2\.observer_budget_b07/i);
 assert.match(r03,/REVOKE ALL ON FUNCTION forge_world_v2\.drain_committed_observers_b08/i);
 assert.match(r03,/hides='\[\]'::jsonb/);
 assert.match(run,/WORLD_V2_B10_ISOLATED/);
 assert.match(run,/PGHOST/);
 assert.match(run,/PGDATABASE/);
 assert.match(run,/terminal-r03\.sql/);
 assert.match(run,/rehearse-r05\.sh/);
 assert.match(workflow,/postgres:17/);
 assert.doesNotMatch(workflow,/(?:deploy|db push|apply_migration)\s*:/i);
});
test('R18-03 live migration-history preflight refuses alias drift and partial installs',()=>{
 const preflight=source('supabase/release-preflight/world_v2_b10_r05_exact_live_catalog.sql');
 assert.match(preflight,/migration_count<>83/);
 assert.match(preflight,/20261109171247/);
 assert.match(preflight,/active_count>0/);
 assert.match(preflight,/observer_pending_b07/);
 assert.match(preflight,/observer_budget_b07/);
 assert.match(preflight,/source drift/);
 assert.match(preflight,/has_function_privilege\('anon'/);
 const recovery=source('supabase/release-recovery/world_v2_b10_r05_restore_original_authority.sql');
 assert.match(recovery,/motion_r05_function_backup/);
 assert.match(recovery,/has_function_privilege\('anon'/);
 assert.match(recovery,/has_schema_privilege\('authenticated'/);
 assert.match(recovery,/md5\(current_body\)<>digest/);
 assert.match(recovery,/DELETE FROM forge_world_v2\.observer_pending_b07/);
 const runtime=source('src/engine/v2/WorldV2TabletopRuntime.js');
 assert.match(runtime,/VITE_WORLD_V2_OBSERVER_RECOVERY==='1'/);
});
test('R18-03 candidate remains explicitly NO-GO, not a black-screen or roster fix by itself',()=>{
 const ledger=JSON.parse(source('staging/next-release-ledger.json'));
 const feature=ledger.features.find(f=>f.id==='world-v2-b10-r18-03-terminal-commit-reconciliation');
 assert.equal(feature?.status,'staged');
 assert.equal(feature?.releaseReady,false);
 assert.equal(feature?.linkedPullRequest,105);
 assert.ok(feature.databaseDependencies?.length>0);
 assert.equal(ledger.upcomingRelease.databaseReleaseVersion,null);
 assert.equal(ledger.upcomingRelease.releaseBranch,
  'stage/world-v2-b10-r18-03-terminal-commit-integration-2026-11-11');
});
