import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve,join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {R53_FOG_DEPENDENCIES,validateR53FogEvidence} from
 '../scripts/release/validate-world-v2-r18-53-fog-commit-evidence.mjs';

const ROOT=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const read=path=>readFileSync(join(ROOT,path),'utf8');
const query=read('supabase/release-preflight/world_v2_b10_r18_53_commit_fog_cost_readonly.sql');
const pinned=new Map(Object.entries(R53_FOG_DEPENDENCIES));
const triggers=[
 {name:'forge_player_collision',enabled:'O',
  definition:'CREATE TRIGGER forge_player_collision BEFORE UPDATE OF x, y, span_x, span_y, map_id ON map_tokens FOR EACH ROW EXECUTE FUNCTION forge_visibility.enforce_collision()'},
 {name:'forge_visibility_token_tick',enabled:'O',
  definition:'CREATE TRIGGER forge_visibility_token_tick AFTER INSERT OR DELETE OR UPDATE ON map_tokens FOR EACH ROW EXECUTE FUNCTION forge_visibility.tick_tokens()'}
];
function receipt(){
 return {
  kind:'B10-R18-53-fog-commit-dependency-readonly',schema:1,
  observed_at:new Date().toISOString(),
  history:{applied:83,last_version:'20261109171247',r05_installed:false},
  function_hashes:[...pinned].map(([signature,source_md5])=>
   ({signature,source_md5,present:true})),
  triggers:structuredClone(triggers),
  footprint:{tokens:7,fog_maps:1,viewer_snapshots:8,viewer_tick_rows:8},
  measurement:{
   scope:'CUMULATIVE_PG_STAT_STATEMENTS_NOT_COMPONENT_TIME',
   stats_reset:'2026-11-05T09:51:43.703269+00:00',
   track_functions:'none',waiting_locks_at_snapshot:0,
   rpc_aggregates:[
    {phase:'advance',calls:1756,mean_db_ms:64.14,max_db_ms:2256.44},
    {phase:'commit',calls:514,mean_db_ms:292.46,max_db_ms:3673.67}
   ]
  }
 };
}
const invalid=(change,re=/R53 FOG DIAGNOSTIC NO-GO:/)=>{
 const r=receipt();change(r);
 assert.throws(()=>validateR53FogEvidence({receipt:r}),re);
};
test('R18-53 seven live-pinned function hashes and two enabled canonical triggers yield DIAGNOSTIC_ONLY',()=>{
 assert.equal(pinned.size,7);
 assert.equal(validateR53FogEvidence({receipt:receipt()}).decision,'DIAGNOSTIC_ONLY');
 const result=validateR53FogEvidence({receipt:[{diagnostic_receipt:receipt()}]});
 assert.equal(result.safeToApply,false);
 assert.equal(result.exactOriginalFunctionHashes,7);
 assert.equal(result.enabledTokenTriggers,2);
 assert.equal(result.measuredTriggerExclusiveLatency,false);
 assert.equal(result.isolatedFogContributionProven,false);
 assert.equal(result.signedDmP1P2QAPassed,false);
 assert.equal(result.productionApproval,false);
});
test('R18-53 rejects spoofed or altered source functions, disabled triggers and fake GO',()=>{
 invalid(r=>{r.function_hashes[0].source_md5='f'.repeat(32)},/unexpected function/);
 invalid(r=>{r.function_hashes[0].present=false},/unexpected function/);
 invalid(r=>{r.function_hashes.pop()},/expected seven/);
 invalid(r=>{r.function_hashes[1]=r.function_hashes[0]},/unexpected function/);
 invalid(r=>{r.triggers[0].enabled='D'},/unexpected, disabled/);
 invalid(r=>{r.triggers[1].definition='FORGED'},/unexpected, disabled/);
 invalid(r=>{r.triggers.pop()},/expected precisely/);
 invalid(r=>{r.productionApproval=true},/forged release receipt/);
 invalid(r=>{r.safeToApply=true},/forged release receipt/);
});
test('R18-53 refuses history drift and stale or future production evidence',()=>{
 invalid(r=>{r.history.r05_installed=true},/history drift or R05/);
 invalid(r=>{r.history.applied=84},/history drift or R05/);
 invalid(r=>{r.history.last_version='20261111023204'},/history drift or R05/);
 invalid(r=>{r.observed_at='2020-01-01T00:00:00Z'},/stale\/future/);
 invalid(r=>{r.observed_at=new Date(Date.now()+3600000).toISOString()},/stale\/future/);
});
test('R18-53 refuses misleading timing attribution, counters, locks or malformed RPC rows',()=>{
 invalid(r=>{r.measurement.scope='INSTANT_TRIGGER_LATENCY'},/historical telemetry/);
 invalid(r=>{r.measurement.track_functions='garbage'},/historical telemetry/);
 invalid(r=>{r.measurement.waiting_locks_at_snapshot=1},/historical telemetry/);
 invalid(r=>{r.measurement.stats_reset='2027-01-01T00:00:00Z'},/historical telemetry/);
 invalid(r=>{r.measurement.rpc_aggregates.pop()},/historical telemetry/);
 invalid(r=>{r.measurement.rpc_aggregates[0].phase='commit'},/malformed cumulative/);
 invalid(r=>{r.measurement.rpc_aggregates[1].calls=-1},/malformed cumulative/);
 invalid(r=>{r.measurement.rpc_aggregates[0].max_db_ms=1},/malformed cumulative/);
 invalid(r=>{r.footprint.viewer_snapshots=-1},/invalid aggregate/);
});
test('R18-53 read-only SQL has all pinned source hashes and no mutations',()=>{
 for(const [sig,digest] of pinned){
  assert.ok(query.includes(sig),'missing signature in read-only audit');
  assert.ok(query.includes(digest),'missing digest in read-only audit');
 }
 assert.match(query,/extensions\.pg_stat_statements/);
 assert.match(query,/CUMULATIVE_PG_STAT_STATEMENTS_NOT_COMPONENT_TIME/);
 assert.match(query,/pg_get_triggerdef/);
 assert.match(query,/CURRENT_SETTING|current_setting/);
 const text=query.replace(/^--.*$/gm,'').replace(/'(?:''|[^'])*'/g,"''");
 assert.match(text,/^\s*WITH\s/i);
 assert.doesNotMatch(text,/\b(INSERT|UPDATE|DELETE|ALTER|DROP|CREATE|TRUNCATE|GRANT|REVOKE|CALL|DO)\b/i);
 const verifier=read('scripts/release/validate-world-v2-r18-53-fog-commit-evidence.mjs');
 assert.doesNotMatch(verifier,/child_process|execSync\(|spawnSync\(|writeFileSync\(|https\.request\(|fetch\(/);
 assert.match(verifier,/productionApproval:false/);
});
