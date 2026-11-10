import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const path='supabase/candidates/world_v2_b10_r03_terminal_queue_retirement.sql';

test('R03 terminal retirement changes only private B08 drain and keeps all public RPC permissions',()=>{
 const sql=read(path);
 assert.match(sql,/CREATE OR REPLACE FUNCTION forge_world_v2\.drain_committed_observers_b08\(/);
 assert.match(sql,/SECURITY INVOKER SET search_path=''/);
 assert.match(sql,/actor_id=auth\.uid\(\) AND status='committed'/);
 assert.match(sql,/FOR UPDATE/);
 assert.match(sql,/SELECT DISTINCT ON \(v\.item->>'kind',v\.item->>'id'\)/);
 assert.match(sql,/v\.item->>'action'='hide'/);
 assert.match(sql,/DELETE FROM forge_world_v2\.observer_pending_b07/);
 assert.match(sql,/SET pending=hides,deferred='\[\]'::jsonb/);
 assert.match(sql,/forge_world_v2\.valid_observer_items_b07\(hides\)/);
 assert.match(sql,/EXCEPTION WHEN OTHERS THEN/);
 assert.match(sql,/REVOKE ALL ON FUNCTION forge_world_v2\.drain_committed_observers_b08/);
 assert.doesNotMatch(sql,/CREATE OR REPLACE FUNCTION public\./i);
 assert.doesNotMatch(sql,/GRANT (?:EXECUTE|USAGE)|CREATE TABLE|ALTER TABLE/i);
});

test('R03 runs only AFTER source-real B03+B07+B08+R01, with prior B08 historical tests intact',()=>{
 const run=read('tests/world-v2-b10-postgres/run.sh');
 const dependencies=[
  'supabase/candidates/world_v2_b03_path_validation.sql',
  'supabase/candidates/world_v2_b07_private_observer_budget.sql',
  'supabase/candidates/world_v2_b08_commit_reconciliation.sql',
  'supabase/candidates/world_v2_b10_r01_core_path_integration.sql',
  path
 ];
 let last=-1;
 for(const dep of dependencies){
  const idx=run.indexOf('-f '+dep);
  assert.ok(idx>last,dep+' out of order');
  last=idx;
 }
 assert.match(run,/B10-R01 PASS/);
 assert.match(run,/B10-R03 PASS/);
 assert.ok(run.indexOf('tests/world-v2-b08-postgres/hostile.sql')<
   run.indexOf('-f '+path),'legacy B08 original semantics remain verified before terminal scrub');
 assert.ok(run.indexOf('-f '+path)<
   run.indexOf('tests/world-v2-b10-postgres/terminal-r03.sql'));
 const postgresTest=read('tests/world-v2-b10-postgres/terminal-r03.sql');
 for(let i=1;i<=16;i++)assert.match(postgresTest,new RegExp('R03-'+String(i).padStart(2,'0')));
});

test('R03 never silently marks live B10 release ready or enables signed fallback',()=>{
 const gate=JSON.parse(read('staging/world-v2-b10-release-qualification.json'));
 assert.equal(gate.decision,'NO_GO');
 assert.equal(gate.sourceLimitations.liveDMPlayer1Player2QA,undefined);
 assert.equal(gate.sourceLimitations.manualScenarioCount,24);
 assert.equal(gate.stagedRemediations?.B10_R03?.status,'STAGED_NONAPPLIED');
 assert.equal(gate.stagedRemediations.B10_R03.liveInstalled,false);
 assert.equal(gate.stagedRemediations.B10_R02.default,'OFF');
 const runtime=read('src/engine/v2/WorldV2TabletopRuntime.js');
 assert.match(runtime,/VITE_WORLD_V2_OBSERVER_RECOVERY==='1'/);
 assert.doesNotMatch(runtime,/VITE_WORLD_V2_OBSERVER_RECOVERY===['"]?true/);
 const manual=JSON.parse(read('tests/fixtures/world-v2-multiplayer-manifest.json'));
 assert.equal(manual.executionStatus,'NOT_RUN');
 assert.equal(manual.scenarios.length,24);
});
