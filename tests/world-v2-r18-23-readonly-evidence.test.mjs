import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {validateR1823ReadOnlyEvidence}
 from '../scripts/release/validate-world-v2-r18-23-readonly-evidence.mjs';

const baseline=JSON.parse(readFileSync(new URL(
 '../staging/world-v2-b10-r18-08-remote-history-content-hashes.json',
 import.meta.url),'utf8')).rows;
const observedAt='2026-11-12T02:55:00.000Z';
const now=new Date('2026-11-12T03:00:00.000Z');
function fixture(){
 return {
  projectRef:'lwhwgqaunxbmvyndswze',observedAt,
  historyRows:structuredClone(baseline),
  catalogRows:[{
   history_count:83,latest_version:'20261109171247',r05_registered:false,
   functions_expected:7,functions_present:7,functions_matched:7,
   active_unexpired_sessions:0,b07_pending_installed:false,
   b07_budget_installed:false,r05_backup_installed:false,
   b03_path_installed:false,b08_drain_installed:false,b08_extra_columns:0,
   anon_private_schema_usage:false,auth_private_schema_usage:false,
   anon_advance_execute:false,auth_advance_execute:true,
   private_table_count:6,private_rls_disabled:0,direct_client_select_tables:0,
   checked_rpc_count:7,present_rpc_count:7,anon_executable_rpc_count:0
  }]
 };
}
const attest=evidence=>validateR1823ReadOnlyEvidence(evidence,{now});

test('R18-23 83-body and protected catalog fixture is consistent but NEVER authorizes release',()=>{
 const result=attest(fixture());
 assert.equal(result.decision,'NO_GO');
 assert.equal(result.safeToApply,false);
 assert.equal(result.historyDigestMatches,83);
 assert.equal(result.protectedFunctionSourceMatches,7);
 for(const key of ['linkedCliFetchAndDryRunProven',
  'independentDmP1PassiveP2AuthProven',
  'websocketRevocationAndFogSecurityProven',
  'sqlInstallationApproved','frontendDeploymentApproved'])
  assert.equal(result[key],false);
});
test('R18-23 fails closed on stale/future evidence and wrong project',()=>{
 const older=fixture();older.observedAt='2026-11-12T02:20:00.000Z';
 assert.throws(()=>attest(older),/older than 30 minutes/);
 const future=fixture();future.observedAt='2026-11-12T03:01:00.000Z';
 assert.throws(()=>attest(future),/future/);
 const wrong=fixture();wrong.projectRef='another-project';
 assert.throws(()=>attest(wrong),/wrong or missing project/);
});
test('R18-23 checks all 83 names, versions, statement counts and SQL bodies',()=>{
 for(const mutation of [
  r=>r.historyRows[0].version='20261105000000',
  r=>r.historyRows[4].name='rewritten',
  r=>r.historyRows[12].statement_count=2,
  r=>r.historyRows[82].fetched_sql_md5='00000000000000000000000000000000',
  r=>r.historyRows.pop(),
  r=>r.historyRows.reverse()
 ]){
  const v=fixture();mutation(v);
  assert.throws(()=>attest(v),/history must contain|migration version\/name\/body mismatch/);
 }
});
test('R18-23 rejects partial R05, altered sources, access widening, and unsafe session count',()=>{
 for(const [field,value] of [
  ['r05_registered',true],['functions_matched',6],
  ['active_unexpired_sessions',1],['b03_path_installed',true],
  ['b07_pending_installed',true],['r05_backup_installed',true],
  ['auth_private_schema_usage',true],['anon_advance_execute',true],
  ['private_rls_disabled',1],['direct_client_select_tables',1],
  ['anon_executable_rpc_count',1],['present_rpc_count',6]
 ]){
  const evidence=fixture();evidence.catalogRows[0][field]=value;
  assert.throws(()=>attest(evidence),/protected live catalog mismatch/);
 }
 const missing=fixture();missing.catalogRows[0].private_table_count=1;
 assert.throws(()=>attest(missing),/missing expected private/);
});
test('R18-23 refuses missing or multiple catalog rows and never upgrades synthetic auth',()=>{
 for(const rows of [null,[],[fixture().catalogRows[0],fixture().catalogRows[0]]]){
  const e=fixture();e.catalogRows=rows;
  assert.throws(()=>attest(e),/exactly one/);
 }
 const e=fixture();e.authenticatedBrowserAssertions='24/24';
 assert.equal(attest(e).independentDmP1PassiveP2AuthProven,false);
});
test('R18-23 read-only SQL has no DML, DDL, role impersonation or migration-history repair',()=>{
 const raw=readFileSync(new URL(
 '../supabase/release-preflight/world_v2_b10_r18_23_readonly_security_catalog.sql',
 import.meta.url),'utf8');
 const sql=raw.replace(/^--.*$/gm,'');
 assert.match(sql.trim(),/^WITH expected_sources\(/);
 assert.doesNotMatch(sql,/\b(CREATE|ALTER|DROP|TRUNCATE|DELETE|INSERT|UPDATE|GRANT|REVOKE)\b/i);
 assert.doesNotMatch(sql,/\bSET\s+ROLE\b|\bDO\s+\$/i);
 assert.match(sql,/supabase_migrations\.schema_migrations/);
 assert.match(sql,/pg_get_functiondef/);
 assert.match(sql,/has_schema_privilege/);
 assert.match(sql,/has_function_privilege/);
 assert.match(sql,/private_rls_disabled/);
 assert.match(sql,/anon_executable_rpc_count/);
 assert.equal(sql.split(';').length,2,'single read-only query only');
});
test('R18-23 CLI without external evidence cannot contact remote or approve anything',()=>{
 const script=fileURLToPath(new URL(
 '../scripts/release/validate-world-v2-r18-23-readonly-evidence.mjs',
 import.meta.url));
 const result=spawnSync(process.execPath,[script],{encoding:'utf8'});
 assert.notEqual(result.status,0);
 assert.match(result.stderr,/R18-23 NO-GO/);
 assert.doesNotMatch(result.stderr,/token|password|Authorization:/i);
});

test('R18-23 never leaks malformed external evidence contents into CLI errors',()=>{
 const dir=mkdtempSync(join(tmpdir(),'r18-23-evidence-'));
 const secret='TEST_ONLY_BEARER_TOKEN_SHOULD_NOT_APPEAR';
 try{
  const evidencePath=join(dir,'bad-evidence.json');
  writeFileSync(evidencePath,'{ "access_token": "'+secret+'", malformed }');
  const script=fileURLToPath(new URL(
   '../scripts/release/validate-world-v2-r18-23-readonly-evidence.mjs',
   import.meta.url));
  const result=spawnSync(process.execPath,[script,'--evidence='+evidencePath],
   {encoding:'utf8'});
  assert.notEqual(result.status,0);
  assert.match(result.stderr,/R18-23 NO-GO: invalid evidence file/);
  assert.equal((result.stdout+result.stderr).includes(secret),false);
 }finally{rmSync(dir,{recursive:true,force:true})}
});
