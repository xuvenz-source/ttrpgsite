import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createTrailingRefresh} from '../src/PerformanceScheduling.js';

const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
test('R04 commit burst schedules one authoritative token/tool reconciliation and cancels on navigation',()=>{
 let sequence=0,reads=0;
 const tasks=new Map();
 const scheduler={setTimer(fn,delay){
  const id=++sequence;tasks.set(id,{fn,delay});return id;
 },clearTimer(id){tasks.delete(id)}};
 const work=createTrailingRefresh(()=>{reads++},280,scheduler);
 for(let i=0;i<80;i++)work.request();
 assert.equal(reads,0);
 assert.equal(tasks.size,1);
 const frame=[...tasks.values()][0];
 assert.equal(frame.delay,280);
 frame.fn();tasks.clear();
 assert.equal(reads,1);
 work.request();work.cancel();
 assert.equal(tasks.size,0);
 work.request();
 assert.equal(reads,1,'disposed map cannot fetch stale rows');
});

test('R04 ports only safe PR71 trailing refresh, retains metadata accuracy and non-V2 fallback',()=>{
 const app=read('src/TabletopApp.jsx');
 assert.match(app,/const v2CommitReconciler=useRef\(null\)/);
 assert.match(app,/const reconcile=createTrailingRefresh\(\(\)=>\{[\s\S]*?latestTokenRefresh\.current\?\.\(\);[\s\S]*?latestToolRefresh\.current\?\.\(\['issued','placed'\],true\);[\s\S]*?\},280\)/);
 assert.match(app,/if\(v2CommitReconciler\.current===reconcile\)/);
 assert.match(app,/reconcile\.cancel\(\)/);
 assert.match(app,/onMovementCommitted=\{\(\)=>\{\s*if\(WORLD_V2_CUTOVER\)\{\s*v2CommitReconciler\.current\?\.request\(\)/);
 assert.match(app,/else\{\s*void refreshTokens\(\);\s*void campaignTools\.refresh\(\['issued','placed'\],true\);/);
});

test('R04 does not import PR71 unsafe unbounded sight retention',()=>{
 const runtime=read('src/engine/v2/WorldV2TabletopRuntime.js');
 assert.doesNotMatch(runtime,/mayRetainCertifiedSightOnObserverRecovery/);
 assert.doesNotMatch(runtime,/retainingObserverSight/);
 assert.match(runtime,/onRevoke:reason=>\{\s*connected=false;privateReady=false;\s*renderer\.revoke\(reason,false\)/);
 // There is no soft sight hold: the renderer is revoked as soon as the
 // observer loses authorization, so the original gesture guard is sufficient.
 // Never gate otherwise-authorized DM input merely on a delayed subscription.
 assert.match(runtime,/if\(!authorized\(\)\)\{/);
 assert.doesNotMatch(runtime,/!dmPreview&&\(!privateReady\|\|!stream\?\.connected\|\|stream\?\.locked\)/);
 assert.match(runtime,/movement\.cancelGesture\('disconnected'\)/);
 assert.match(runtime,/worldV2Trace\.event\('input\.pick','runtime-inactive'\)/);
});

test('R04 PostgreSQL rehearsal installs five candidates atomically and checks rollback',()=>{
 const suite=read('tests/world-v2-b10-postgres/run.sh');
 const rehearsal=read('tests/world-v2-b10-postgres/migration-rehearsal-r04.sql');
 assert.match(suite,/WORLD_V2_B10_ISOLATED:-/);
 assert.match(suite,/PGHOST:-/);
 assert.match(suite,/PGDATABASE:-/);
 assert.ok(suite.indexOf('migration-rehearsal-r04.sql')<
  suite.indexOf('supabase/candidates/world_v2_b03_path_validation.sql'));
 const files=[
  'world_v2_b03_path_validation.sql',
  'world_v2_b07_private_observer_budget.sql',
  'world_v2_b08_commit_reconciliation.sql',
  'world_v2_b10_r01_core_path_integration.sql',
  'world_v2_b10_r03_terminal_queue_retirement.sql'
 ];
 let previous=rehearsal.indexOf('BEGIN;');
 assert.ok(previous>0);
 for(const filename of files){
  const index=rehearsal.indexOf('\\i supabase/candidates/'+filename);
  assert.ok(index>previous,filename+' must be in install order');
  previous=index;
 }
 assert.ok(rehearsal.indexOf('ROLLBACK;')>previous,'rehearsal must rollback');
 assert.match(rehearsal,/original_core/);
 assert.match(rehearsal,/original_advance/);
 assert.match(rehearsal,/original_commit/);
 assert.match(rehearsal,/R04-03/);
 const gate=JSON.parse(read('staging/world-v2-b10-release-qualification.json'));
 assert.equal(gate.decision,'NO_GO');
 assert.equal(gate.sourceLimitations.manualScenarioCount,24);
 assert.equal(gate.stagedRemediations?.B10_R04?.status,'STAGED_REHEARSED_NOT_INSTALLED');
});
