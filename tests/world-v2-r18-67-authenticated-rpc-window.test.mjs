import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve,dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {
 R67_FAMILIES,validateR67Snapshot,analyzeR67RpcWindow
} from '../scripts/release/validate-world-v2-r18-67-rpc-window.mjs';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const sql=readFileSync(join(root,
 'supabase/release-preflight/world_v2_b10_r18_67_authenticated_rpc_counters.sql'),'utf8');
const validator=readFileSync(join(root,
 'scripts/release/validate-world-v2-r18-67-rpc-window.mjs'),'utf8');
const KIND='B10-R18-67-world-v2-authenticated-rpc-counter-snapshot';

function shot({
 timestamp='2026-11-14T11:01:00Z',
 reset='2026-11-05T09:51:43.703269+00:00',
 calls=[612,1756,514,1387],
 total=[15545.0,112631.0,150325.0,60375.0]
}={}){
 return {
  schema:1,kind:KIND,observed_at:timestamp,
  stats_reset:reset,track_mode:'top',db_role:'authenticated',
  families:R67_FAMILIES.map((family,i)=>({
   family,variants:1,calls:calls[i],totalExecMs:total[i],
   historicalMaxExecMs:[743.6,2256.4,3673.7,1917.2][i],
   sharedHits:20000+calls[i]*100,
   sharedReads:i===2?1:0
  }))
 };
}
test('R18-67 read-only SQL returns only four named authenticated aggregate families',()=>{
 assert.deepEqual(R67_FAMILIES,['begin','advance','commit','visibility']);
 assert.match(sql,/extensions\.pg_stat_statements_info/);
 assert.match(sql,/extensions\.pg_stat_statements s/);
 assert.match(sql,/r\.rolname='authenticated'/);
 assert.match(sql,/current_database\(\)/);
 assert.match(sql,/current_setting\('pg_stat_statements\.track',true\)/);
 assert.match(sql,/clock_timestamp\(\)/);
 assert.match(sql,/jsonb_agg\(jsonb_build_object/);
 assert.match(sql,/ORDER BY rank/);
 assert.match(sql,/AS world_v2_performance_snapshot/);
 assert.doesNotMatch(sql,/\b(?:INSERT INTO|UPDATE\s+(?:public|forge)|DELETE FROM|DROP TABLE|ALTER TABLE|CREATE OR REPLACE FUNCTION|pg_stat_statements_reset\s*\()\b/i);
 assert.doesNotMatch(sql,/'(?:user_id|token_id|actor_id|map_id|session_id|query_text)'\s*,/i);
});
test('R18-67 paired delta isolates NEW authenticated database time, not nine-day mean',()=>{
 const before=shot();
 const after=shot({
  timestamp:'2026-11-14T11:05:00Z',
  calls:[614,1766,520,1389],
  total:[15575.0,113331.0,151525.0,60465.0]
 });
 const r=analyzeR67RpcWindow({before,after});
 assert.equal(r.decision,'NO_GO');
 assert.equal(r.safeToDeploy,false);
 assert.equal(r.safeToApplySql,false);
 assert.equal(r.sampleWindowMs,4*60*1000);
 assert.equal(r.measurements.length,4);
 assert.deepEqual(r.measurements.map(x=>x.newCalls),[2,10,6,2]);
 assert.deepEqual(r.measurements.map(x=>x.meanDatabaseExecMs),[15,70,200,45]);
 assert.equal(r.measurements[2].newDatabaseExecMs,1200);
 assert.equal(r.measurements[2].historicalMaxDatabaseExecMs,3673.7);
 assert.equal(r.measurements[2].p95DatabaseMs,null);
 assert.equal(r.measurements[2].browserRttP95Ms,null);
 assert.equal(r.independentDmP1P2Verified,false);
});
test('R18-67 no new calls reports NO_SAMPLE, never invented zero latency',()=>{
 const before=shot(),after=shot({timestamp:'2026-11-14T11:02:00Z'});
 const r=analyzeR67RpcWindow({before,after});
 for(const m of r.measurements){
  assert.equal(m.status,'NO_SAMPLE');
  assert.equal(m.newCalls,0);
  assert.equal(m.meanDatabaseExecMs,null);
  assert.equal(m.newDatabaseExecMs,0);
 }
});
test('R18-67 rejects changed stats_reset even if all counters are increasing',()=>{
 const before=shot(),after=shot({
  timestamp:'2026-11-14T11:02:00Z',
  reset:'2026-11-14T11:01:30Z'
 });
 assert.throws(()=>analyzeR67RpcWindow({before,after}),/NO-GO/);
});
test('R18-67 rejects backward, zero length or excessive measurement windows',()=>{
 const before=shot();
 for(const timestamp of [
  '2026-11-14T10:59:00Z',
  '2026-11-14T11:01:00Z',
  '2026-11-15T12:01:00Z'
 ]) assert.throws(()=>analyzeR67RpcWindow({
  before,after:shot({timestamp})
 }),/NO-GO/);
});
test('R18-67 rejects decreasing cumulative calls/time/read counters',()=>{
 const baseline=shot();
 const mutations=[
  r=>{r.families[2].calls-=1;},
  r=>{r.families[2].totalExecMs-=1;},
  r=>{r.families[2].sharedHits-=1;},
  r=>{r.families[2].sharedReads-=1;},
  r=>{r.families[2].historicalMaxExecMs-=1;}
 ];
 for(const mutate of mutations){
  const next=shot({timestamp:'2026-11-14T11:02:00Z'});
  mutate(next);
  assert.throws(()=>analyzeR67RpcWindow({before:baseline,after:next}),/NO-GO/);
 }
});
test('R18-67 rejects bogus counters or extra hidden private fields',()=>{
 const source=shot();
 const bad=[
  s=>{s.userId='not-allowed';},
  s=>{s.families[0].tokenIds=['unsafe'];},
  s=>{s.families[0].calls='514';},
  s=>{s.families[0].calls=-1;},
  s=>{s.families[1].totalExecMs=Infinity;},
  s=>{s.families[2].variants=0;},
  s=>{s.families[1].family='private-session';},
  s=>{s.db_role='postgres';},
  s=>{s.track_mode='none';},
  s=>{s.observed_at='not a time';},
  s=>{s.stats_reset='2026-11-15T00:00:00Z';}
 ];
 for(const mutate of bad){
  const candidate=structuredClone(source);mutate(candidate);
  assert.throws(()=>validateR67Snapshot(candidate),/NO-GO/);
 }
});
test('R18-67 accepts one-row SQL reply wrapper but refuses multiple rows',()=>{
 const s=shot();
 assert.equal(validateR67Snapshot([{world_v2_performance_snapshot:s}]).families.length,4);
 assert.throws(()=>validateR67Snapshot([
  {world_v2_performance_snapshot:s},{world_v2_performance_snapshot:s}
 ]),/NO-GO/);
});
test('R18-67 validator never executes network, SQL, raw queries or leaks receipt content',()=>{
 assert.doesNotMatch(validator,/fetch\(|https\.request|eval\(|execSync|spawnSync|child_process|process\.stdout\.write\(.*(?:before|after)/);
 assert.match(validator,/userIdsRecorded:false,sqlTextRecorded:false/);
 assert.match(validator,/safeToApplySql:false/);
 assert.match(validator,/p95DatabaseMs:null/);
 assert.match(validator,/browserRttP95Ms:null/);
 assert.match(validator,/statsResetUnchanged:true/);
});
