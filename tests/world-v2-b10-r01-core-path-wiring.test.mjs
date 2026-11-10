import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const candidate='supabase/candidates/world_v2_b10_r01_core_path_integration.sql';
const sql=read(candidate);
const full=JSON.parse(read('staging/world-v2-b10-release-qualification.json'));

test('B10-R01 newly staged path uses B03 as only fresh Core validator and no browser grants',()=>{
 assert.match(sql,/CREATE OR REPLACE FUNCTION forge_world_v2\.advance_core_v2\(/);
 assert.match(sql,/SECURITY DEFINER SET search_path=''/);
 assert.match(sql,/candidate:=forge_world_v2\.validate_motion_path_batch_b03\(/);
 assert.match(sql,/FOR UPDATE/);
 assert.match(sql,/actor_id=auth\.uid\(\)/);
 assert.match(sql,/forge_world_v2\.session_valid\(s\)/);
 assert.match(sql,/candidate->'routeSteps'/);
 assert.match(sql,/jsonb_build_object\(\s*'version',2,'sessionId',s\.id,'seq',p_seq,/);
 assert.match(sql,/last_seq=p_seq/);
 assert.match(sql,/accepted_cells=accepted_cells\+processed/);
 assert.match(sql,/attempted_cells=attempted_cells\+attempted/);
 assert.match(sql,/REVOKE ALL ON FUNCTION forge_world_v2\.advance_core_v2\(/);
 assert.doesNotMatch(sql,/CREATE OR REPLACE FUNCTION public\./i);
 assert.doesNotMatch(sql,/GRANT (?:EXECUTE|USAGE)/i);
 assert.ok(!existsSync(new URL('../supabase/migrations/world_v2_b10_r01_core_path_integration.sql',import.meta.url)));
});

test('B10-R01 original B08 observer/commit wrappers stay source-identical and public ACK bounded',()=>{
 const b08=read('supabase/candidates/world_v2_b08_commit_reconciliation.sql');
 const b07=read('supabase/candidates/world_v2_b07_private_observer_budget.sql');
 assert.match(b08,/forge_world_v2\.advance_core_v2\(/);
 assert.match(b08,/last_advance_request_b08/);
 assert.match(b08,/last_commit_request_b08/);
 assert.match(b08,/drain_committed_observers_b08/);
 assert.match(b07,/forge_world_v2\.observer_path_status/);
 assert.match(sql,/return reply/i);
 assert.doesNotMatch(sql,/realtime\.send|publish_approved_observers\(/i);
 assert.doesNotMatch(sql,/UPDATE public\.(map_tokens|campaign_tool_issues)/i);
 assert.doesNotMatch(sql,/routeSteps',steps/i);
});

test('B10-R01 full candidate order and actual SQL source test wiring are explicit',()=>{
 const run=read('tests/world-v2-b10-postgres/run.sh');
 const ordered=[
  'supabase/candidates/world_v2_b03_path_validation.sql',
  'supabase/candidates/world_v2_b07_private_observer_budget.sql',
  'supabase/candidates/world_v2_b08_commit_reconciliation.sql',
  candidate
 ];
 let previous=-1;
 for(const path of ordered){
  const idx=run.indexOf(' -f '+path);
  assert.ok(idx>previous, 'candidate must be loaded in order: '+path);
  previous=idx;
 }
 assert.match(run,/core-path-r01\.sql/);
 assert.match(run,/B10-R01 PASS/);
 const caseSql=read('tests/world-v2-b10-postgres/core-path-r01.sql');
 for(let i=1;i<=11;i++)assert.match(caseSql,new RegExp('R01-'+String(i).padStart(2,'0')));
 const matrix=JSON.parse(read('tests/fixtures/world-v2-multiplayer-manifest.json'));
 assert.equal(matrix.executionStatus,'NOT_RUN');
 assert.equal(matrix.scenarios.length,24);
 assert.equal(full.sourceLimitations.B03CalledFromActiveAdvanceCore,false,
  'live Supabase must remain unmodified');
 assert.equal(full.decision,'NO_GO');
 assert.equal(full.stagedRemediations?.B10_R01?.status,'STAGED_NONAPPLIED');
});
