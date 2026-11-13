import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve,dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {validateR50ReadOnlyReceipt} from '../scripts/release/validate-world-v2-r18-50-readonly-evidence.mjs';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const read=p=>readFileSync(join(root,p),'utf8');
const baseline=JSON.parse(read('staging/world-v2-b10-r18-08-remote-history-content-hashes.json'));
const audit=read('supabase/release-preflight/world_v2_b10_r18_50_live_readonly_evidence.sql');
const expectedFunctions=Array.from(audit.matchAll(/\('([^']+)','([a-f0-9]{32})'\)/g),
 m=>({signature:m[1],present:true,source_md5:m[2]}));
function fixture(){
 return {
  schema:1,kind:'B10-R18-50-live-readonly',
  observed_at:new Date().toISOString(),
  migration_history:structuredClone(baseline.rows),
  authority_sources:structuredClone(expectedFunctions),
  preinstall:{r05_installed:false,atomic_rpc_present:false,
   r05_backup_present:false,r20_campaign_guard_present:false,
   r05_observer_pending_present:false,active_motion_sessions:0},
  access:{anon_internal_schema_usage:false,authenticated_internal_schema_usage:false,
   anon_advance_execute:false,anon_commit_execute:false,
   authenticated_advance_execute:true,authenticated_commit_execute:true},
  point_in_time:{waiting_database_locks:0,database_sessions:7,configured_max_connections:60}
 };
}
const testReject=(edit,pattern=/R50 READONLY NO-GO:/)=>{
 const r=fixture();edit(r);
 assert.throws(()=>validateR50ReadOnlyReceipt({receipt:r}),pattern);
};
test('R18-50 synthetic evidence: 83 historical SQL and 10 exact functions produce NO-GO, NEVER approval',()=>{
 assert.equal(expectedFunctions.length,10);
 assert.equal(expectedFunctions.find(x=>x.signature.startsWith('forge_world_v2.step_allowed')).source_md5,
  '6dcd75ce4719cd0bf6173f77f75fdf32');
 const r=validateR50ReadOnlyReceipt({receipt:fixture()});
 assert.equal(r.decision,'NO_GO');
 assert.equal(r.safeToApply,false);
 assert.equal(r.matchedRemoteHistory,83);
 assert.equal(r.matchedAuthorityFunctions,10);
 assert.equal(r.unappliedNarrowMigrations,8);
 assert.equal(r.independentRemoteProvenanceAttested,false);
 assert.equal(r.executedLinkedCliDryRun,false);
 assert.equal(r.independentlySignedDmP1P2Passed,false);
 assert.equal(r.liveFreeTierLoadTestPassed,false);
 assert.equal(r.productionApproval,false);
 assert.equal(validateR50ReadOnlyReceipt({receipt:[{release_receipt:fixture()}]}).decision,'NO_GO');
});
test('R18-50 fails on historical migration content drift, duplicate, absence or unexpected R05',()=>{
 testReject(r=>r.migration_history[0].fetched_sql_md5='0'.repeat(32),/SQL-body drift/);
 testReject(r=>r.migration_history[0].name='wrong_history',/SQL-body drift/);
 testReject(r=>r.migration_history[10].version=r.migration_history[9].version,/duplicate/);
 testReject(r=>r.migration_history.pop(),/exact 83/);
 testReject(r=>r.migration_history[0].statement_count=0,/SQL-body drift/);
 testReject(r=>r.migration_history[0].version='20261111023204',/SQL-body drift/);
});
test('R18-50 fails on authority digest drift or missing critical definition',()=>{
 testReject(r=>r.authority_sources[0].source_md5='0'.repeat(32),/authority source hash drift/);
 testReject(r=>r.authority_sources[2].present=false,/missing or malformed critical/);
 testReject(r=>r.authority_sources.pop(),/expected exactly ten/);
 testReject(r=>r.authority_sources[4].signature=r.authority_sources[3].signature,/missing or malformed critical/);
});
test('R18-50 refuses active motion, partial R05, bad ACL and lock waits',()=>{
 testReject(r=>r.preinstall.active_motion_sessions=1,/partial installation or active movement/);
 testReject(r=>r.preinstall.atomic_rpc_present=true,/partial installation or active movement/);
 testReject(r=>r.preinstall.r05_installed=true,/partial installation or active movement/);
 testReject(r=>r.access.anon_commit_execute=true,/authority ACL drift/);
 testReject(r=>r.access.authenticated_advance_execute=false,/authority ACL drift/);
 testReject(r=>r.point_in_time.waiting_database_locks=2,/lock or database configuration/);
});
test('R18-50 refuses stale/future snapshots and forged release approval',()=>{
 testReject(r=>r.observed_at='2020-01-01T00:00:00.000Z',/stale/);
 testReject(r=>r.observed_at=new Date(Date.now()+10*60000).toISOString(),/stale/);
 testReject(r=>r.safeToApply=true,/forged release decision/);
 testReject(r=>r.releaseDecision='GO',/forged release decision/);
 testReject(r=>r.schema=9,/invalid read-only receipt/);
});
test('R18-50 read-only SQL uses bounded fingerprints and cannot mutate data',()=>{
 const withoutComments=audit.replace(/^--.*$/gm,'');
 assert.match(withoutComments,/^\s*WITH\s+/);
 assert.match(withoutComments,/jsonb_build_object/);
 assert.match(withoutComments,/array_to_string\(statements, E';\\n'\) \|\| E';\\n'/);
 assert.match(withoutComments,/pg_get_functiondef/);
 assert.match(withoutComments,/pg_locks/);
 assert.match(withoutComments,/supabase_migrations\.schema_migrations/);
 assert.doesNotMatch(withoutComments,/\b(INSERT|UPDATE|DELETE|ALTER|DROP|CREATE|TRUNCATE|GRANT|REVOKE|EXECUTE|CALL|DO)\b/i);
 const js=read('scripts/release/validate-world-v2-r18-50-readonly-evidence.mjs');
 assert.doesNotMatch(js,/child_process|execSync\(|spawnSync\(|writeFileSync\(|fetch\(|https\.request\(/);
 assert.match(js,/validateR48NarrowPackage/);
 assert.match(js,/productionApproval:false/);
});
