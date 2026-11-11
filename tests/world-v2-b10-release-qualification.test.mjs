import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const gate=JSON.parse(read('staging/world-v2-b10-release-qualification.json'));
const workflow=read('docs/engineering-workflow.md');
const candidate={b03:read('supabase/candidates/world_v2_b03_path_validation.sql'),
 b07:read('supabase/candidates/world_v2_b07_private_observer_budget.sql'),
 b08:read('supabase/candidates/world_v2_b08_commit_reconciliation.sql')};
test('B10 source gate refuses live release with unintegrated B03 and A06 blocked',()=>{
 assert.equal(gate.workflowStep,'B10');
 assert.equal(gate.decision,'NO_GO');
 assert.equal(gate.status,'STAGED_INTEGRATION_WITH_BLOCKED_GATE');
 assert.equal(gate.sourceLimitations.B03CalledFromActiveAdvanceCore,false);
 assert.equal(gate.sourceLimitations.A06GateA,'BLOCKED');
 assert.equal(gate.sourceLimitations.releaseApproval,false);
 assert.equal(gate.sourceLimitations.PR71,'CLOSED_UNMERGED_SUPERSEDED_R04',
  'the unsafe PR71 soft sight hold was closed unmerged and must not reappear');
 assert.equal(gate.noGoReasons.length,8);
 assert.equal(gate.stagedRemediations.B10_R05.status,'STAGED_VERSIONED_NONAPPLIED');
 assert.ok(gate.noGoReasons.some(x=>/83 live migration|83 live migration entries|83 applied live/i.test(x)),
  'the historical migration-version mismatch must remain an explicit release blocker');
 assert.match(workflow,/B10 — Integrated movement release qualification/);
 const core=read('supabase/migrations/20261109095000_world_engine_v2_motion_authority.sql');
 const wrapper=read('supabase/migrations/20261109100000_world_engine_v2_private_observer_stream.sql');
 assert.match(wrapper,/RENAME TO advance_core_v2/);
 assert.match(wrapper,/forge_world_v2\.advance_core_v2/);
 assert.doesNotMatch(core,/validate_motion_path_batch_b03/);
 assert.doesNotMatch(wrapper,/validate_motion_path_batch_b03/);
 assert.equal(gate.sourceLimitations.B03Installed,false);
 assert.equal(gate.sourceLimitations.B07Installed,false);
 assert.equal(gate.sourceLimitations.B08Installed,false);
});
test('B10 candidate ordering and direct private RPC exposure are prohibited',()=>{
 assert.deepEqual(gate.sqlOrder,[
  'supabase/candidates/world_v2_b03_path_validation.sql',
  'supabase/candidates/world_v2_b07_private_observer_budget.sql',
  'supabase/candidates/world_v2_b08_commit_reconciliation.sql']);
 for(const p of gate.sqlOrder){
  assert.ok(existsSync(new URL('../'+p,import.meta.url)),p);
  assert.ok(p.startsWith('supabase/candidates/'));
 }
 assert.match(candidate.b03,/SECURITY INVOKER/);
 assert.match(candidate.b03,/REVOKE ALL ON FUNCTION forge_world_v2\.validate_motion_path_batch_b03/);
 assert.doesNotMatch(candidate.b03,/GRANT EXECUTE TO (?:PUBLIC|anon|authenticated)/i);
 assert.match(candidate.b07,/REVOKE ALL ON ALL FUNCTIONS IN SCHEMA forge_world_v2/);
 assert.match(candidate.b07,/viewer_streams/);
 assert.match(candidate.b07,/observer_path_status/);
 assert.match(candidate.b08,/last_advance_request_b08/);
 assert.match(candidate.b08,/last_commit_request_b08/);
 assert.match(candidate.b08,/drain_committed_observers_b08/);
 assert.doesNotMatch(candidate.b08,/GRANT EXECUTE ON FUNCTION forge_world_v2/i);
 assert.match(read('tests/world-v2-b10-postgres/run.sh'),/PGDATABASE:-.*world_v2_b10/);
 assert.match(read('tests/world-v2-b10-postgres/run.sh'),/B03\+B07\+B08/);
});
test('B10 frontend opt-in flags and preview never silently bypass authority',()=>{
 const runtime=read('src/engine/v2/WorldV2TabletopRuntime.js');
 const controller=read('src/engine/v2/MovementController.js');
 const preview=read('src/engine/v2/PreviewAuthority.js');
 const board=read('src/engine/v2/WorldV2Board.jsx');
 const keyed=read('src/engine/v2/KeyboardStepper.js');
 for(const flag of gate.featureFlags){
  assert.match(runtime,new RegExp(flag.name+"==='1'"));
  assert.equal(flag.default,'OFF');
 }
 assert.match(runtime,/createPreviewAuthority/);
 assert.match(preview,/cannot commit world positions/);
 assert.match(controller,/commitReconciliation=false/);
 assert.match(controller,/coalesceMotion=false/);
 assert.match(board,/const selection=selected;[\s\S]*selection\.length>48/);
 assert.match(keyed,/sameGroup/);
 assert.match(keyed,/pick\.origin\.x!==endpoint\.x/);
 assert.equal(gate.currentChecks.liveDMPlayer1Player2QA,'NOT_RUN');
});
test('B10 tracks CodeQL and all 24 real authenticated fixture cases as unexecuted',()=>{
 const codeql=read('.github/workflows/codeql.yml');
 assert.match(codeql,/stage\/world-v2-b10-\*/);
 const matrix=JSON.parse(read('tests/fixtures/world-v2-multiplayer-manifest.json'));
 assert.equal(matrix.executionStatus,'NOT_RUN');
 assert.equal(matrix.scenarios.length,24);
 assert.equal(gate.sourceLimitations.manualScenarioCount,matrix.scenarios.length);
 assert.equal(gate.currentChecks.browserLatencyP95,'NOT_MEASURED');
 assert.equal(gate.currentChecks.hiddenEntityAndLOSProof,'NOT_RUN');
 assert.equal(gate.currentChecks.rollbackMigrationDryRun,'NOT_RUN');
 assert.ok(gate.noGoReasons.some(x=>/budget/.test(x)));
 assert.ok(gate.noGoReasons.some(x=>/PR #71/.test(x)));
});
